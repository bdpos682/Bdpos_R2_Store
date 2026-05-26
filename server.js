require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();
const PORT = process.env.PORT || 10000;
const serverStartTime = Date.now();

// Mảng lưu trữ tối đa 8 lịch sử truyền tải gần nhất
let liveApiLogs = [];

app.use(cors());
app.use(express.json());

// --- KIỂM TRA ĐẦU VÀO CẤU HÌNH HỆ THỐNG ---
const requiredEnv = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL'];
const missingEnv = requiredEnv.filter(envName => !process.env[envName]);

const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// API sinh đường dẫn Presigned URL mã hóa
app.get('/v1/storage/presign', async (req, res) => {
  const { fileName, fileType, nhaHangId } = req.query;
  const requestTime = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  
  try {
    if (!fileName || !fileType || !nhaHangId) {
      return res.status(400).json({ success: false, message: "Thiếu tham số bắt buộc" });
    }

    const cleanFileName = fileName.trim().replace(/\s+/g, '_');
    const fileKey = `chat_internal/${nhaHangId.trim()}/${cleanFileName}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey,
      ContentType: fileType.trim(),
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`;

    // Ghi nhận nhật ký truyền tải
    liveApiLogs.unshift({
      time: requestTime.split(' ')[1], 
      storeId: nhaHangId,
      file: cleanFileName.length > 30 ? cleanFileName.substring(0, 28) + '...' : cleanFileName,
      status: 'THÀNH CÔNG'
    });
    if (liveApiLogs.length > 8) liveApiLogs.pop();

    return res.json({ success: true, uploadUrl, publicUrl });
  } catch (error) {
    liveApiLogs.unshift({
      time: requestTime.split(' ')[1],
      storeId: nhaHangId || 'HỆ THỐNG',
      file: 'Xử lý tệp tin thất bại',
      status: 'THẤT BẠI'
    });
    return res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint cung cấp thông số động cho Dashboard
app.get('/api/status', (req, res) => {
  res.json({
    uptime: Date.now() - serverStartTime,
    status: missingEnv.length > 0 ? "ERROR" : "OPERATIONAL",
    logs: liveApiLogs,
    memory: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB'
  });
});

// GIAO DIỆN DIỆN DASHBOARD CHUYÊN NGHIỆP - TỐI GIẢN - DỄ ĐỌC (ENTERPRISE DARK)
app.get('/', (req, res) => {
  const statusBadgeBg = missingEnv.length > 0 ? '#fde8e8' : '#e6f4ea';
  const statusColor = missingEnv.length > 0 ? '#f8b4b4' : '#34a853';
  const statusTextColor = missingEnv.length > 0 ? '#c53030' : '#137333';
  const statusText = missingEnv.length > 0 ? 'Hệ thống đang có lỗi cấu hình' : 'Máy chủ hoạt động ổn định';
  
  res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BDPOS SMART - Trung Tâm Lưu Trữ R2</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                background-color: #0f172a;
                color: #f1f5f9;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                padding: 20px;
            }
            
            .dashboard {
                width: 100%;
                max-width: 850px;
                background: #1e293b;
                border: 1px solid #334155;
                border-radius: 12px;
                padding: 32px;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
            }
            
            /* Khu vực Tiêu đề chính */
            .header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 24px;
                padding-bottom: 20px;
                border-bottom: 1px solid #334155;
            }
            .header h1 {
                font-size: 22px;
                font-weight: 700;
                color: #ffffff;
                letter-spacing: -0.5px;
            }
            .header .brand-sub {
                font-size: 13px;
                color: #94a3b8;
                margin-top: 2px;
            }
            
            /* Thẻ Trạng thái Máy chủ */
            .status-badge {
                background-color: ${statusBadgeBg};
                border: 1px solid ${statusColor};
                border-radius: 20px;
                padding: 8px 16px;
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 24px;
            }
            .status-dot {
                width: 8px;
                height: 8px;
                background-color: ${statusColor};
                border-radius: 50%;
            }
            .status-msg {
                font-size: 14px;
                font-weight: 600;
                color: ${statusTextColor};
            }
            
            /* Khối Thông số kỹ thuật (Grid) */
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                gap: 16px;
                margin-bottom: 32px;
            }
            .card {
                background: #0f172a;
                border: 1px solid #334155;
                padding: 16px 20px;
                border-radius: 8px;
            }
            .card-title {
                font-size: 12px;
                font-weight: 500;
                color: #94a3b8;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 6px;
            }
            .card-value {
                font-size: 18px;
                font-weight: 700;
                color: #ffffff;
            }
            
            /* Khu vực Nhật ký Console */
            .section-title {
                font-size: 14px;
                font-weight: 600;
                color: #38bdf8;
                margin-bottom: 12px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .table-container {
                background: #0f172a;
                border: 1px solid #334155;
                border-radius: 8px;
                overflow: hidden;
                padding: 8px;
            }
            .table-header {
                display: flex;
                padding: 10px 12px;
                font-size: 11px;
                font-weight: 600;
                color: #64748b;
                text-transform: uppercase;
                border-bottom: 1px solid #1e293b;
            }
            .log-list {
                max-height: 200px;
                overflow-y: auto;
            }
            .log-item {
                display: flex;
                padding: 10px 12px;
                font-size: 13px;
                border-bottom: 1px solid #1e293b;
                align-items: center;
            }
            .log-item:last-child { border-bottom: none; }
            
            /* Chia cột bảng dữ liệu */
            .col-time { width: 90px; color: #64748b; }
            .col-id { width: 100px; color: #38bdf8; font-weight: 600; }
            .col-file { flex-grow: 1; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 10px; }
            .col-status { width: 110px; text-align: right; font-weight: 600; }
            
            .success-text { color: #34a853; }
            .failed-text { color: #ea4335; }
            .empty-state { text-align: center; color: #475569; padding: 40px 0; font-size: 13px; font-style: italic; }
            
            /* Chân trang */
            .footer {
                display: flex;
                justify-content: space-between;
                margin-top: 24px;
                font-size: 11px;
                color: #475569;
            }
        </style>
    </head>
    <body>
        <div class="dashboard">
            <div class="header">
                <div>
                    <h1>BDPOS SMART</h1>
                    <div class="brand-sub">Hệ thống dịch vụ lưu trữ hình ảnh & âm thanh đám mây</div>
                </div>
                <div style="text-align: right; font-size: 12px; color: #64748b;">
                    <div>Khu vực: Virginia (US-East)</div>
                    <div>Cổng kết nối: Node.js HTTPS</div>
                </div>
            </div>
            
            <div class="status-badge">
                <div class="status-dot"></div>
                <div class="status-msg">${statusText}</div>
            </div>

            <div class="stats-grid">
                <div class="card">
                    <div class="card-title">Phân vùng đám mây</div>
                    <div class="card-value" style="color: #38bdf8;">Cloudflare R2</div>
                </div>
                <div class="card">
                    <div class="card-title">Thời gian hoạt động</div>
                    <div class="card-value" id="uptime-field" style="color: #34a853;">00:00:00</div>
                </div>
                <div class="card">
                    <div class="card-title">Bộ nhớ RAM đã dùng</div>
                    <div class="card-value" id="memory-field" style="color: #fbbf24;">0.00 MB</div>
                </div>
            </div>

            <div class="section-title">● NHẬT KÝ TRUYỀN TẢI THỜI GIAN THỰC</div>
            <div class="table-container">
                <div class="table-header">
                    <div class="col-time">Thời gian</div>
                    <div class="col-id">Mã nhà hàng</div>
                    <div class="col-file">Tên tệp tin hệ thống</div>
                    <div class="col-status">Trạng thái xử lý</div>
                </div>
                <div class="log-list" id="log-list-wrapper">
                    <div class="empty-state">Hệ thống đang sẵn sàng lắng nghe dữ liệu từ ứng dụng BDPOS...</div>
                </div>
            </div>

            <div class="footer">
                <span>Tiêu chuẩn bảo mật: SSL / TLS v1.3 Secured</span>
                <span>Quản trị viên: HỒ BẢO DUY</span>
            </div>
        </div>

        <script>
            function fetchSystemData() {
                fetch('/api/status')
                    .then(res => res.json())
                    .then(data => {
                        // Xử lý bộ đếm Uptime chuẩn xác từng giây
                        let totalSeconds = Math.floor(data.uptime / 1000);
                        let hours = Math.floor(totalSeconds / 3600);
                        let minutes = Math.floor((totalSeconds % 3600) / 60);
                        let seconds = totalSeconds % 60;

                        let formattedTime = 
                            String(hours).padStart(2, '0') + ':' +
                            String(minutes).padStart(2, '0') + ':' +
                            String(seconds).padStart(2, '0');
                        
                        document.getElementById('uptime-field').innerText = formattedTime;
                        document.getElementById('memory-field').innerText = data.memory;

                        // Cấu trúc lại bảng hiển thị log trực quan dễ nhìn
                        const logWrapper = document.getElementById('log-list-wrapper');
                        if(data.logs && data.logs.length > 0) {
                            let listHtml = '';
                            data.logs.forEach(item => {
                                const isSuccess = item.status === 'THÀNH CÔNG';
                                const textClass = isSuccess ? 'success-text' : 'failed-text';
                                listHtml += \`
                                    <div class="log-item">
                                        <div class="col-time">\${item.time}</div>
                                        <div class="col-id">\${item.storeId}</div>
                                        <div class="col-file">\${item.file}</div>
                                        <div class="col-status \${textClass}">\${item.status}</div>
                                    </div>
                                \`;
                            });
                            logWrapper.innerHTML = listHtml;
                        } else {
                            logWrapper.innerHTML = '<div class="empty-state">Hệ thống đang sẵn sàng lắng nghe dữ liệu từ ứng dụng BDPOS...</div>';
                        }
                    })
                    .catch(() => {});
            }
            setInterval(fetchSystemData, 1000);
            fetchSystemData();
        </script>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  const startTime = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  console.log(`✅ [START] Server BDPOS SMART R2 đã chạy thành công.`);
});
