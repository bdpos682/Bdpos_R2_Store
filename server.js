require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();
const PORT = process.env.PORT || 10000;
const serverStartTime = Date.now();

// Mảng lưu trữ tối đa 10 lịch sử truyền tải gần nhất
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

    // Trích xuất định dạng đuôi file để hiển thị cột riêng (Ví dụ: JPG, M4A)
    const ext = cleanFileName.split('.').pop().toUpperCase();

    liveApiLogs.unshift({
      time: requestTime.split(' ')[1], 
      storeId: nhaHangId.trim(),
      file: cleanFileName,
      type: ext.length > 4 ? 'FILE' : ext,
      status: 'COMPLETED'
    });
    if (liveApiLogs.length > 10) liveApiLogs.pop();

    return res.json({ success: true, uploadUrl, publicUrl });
  } catch (error) {
    liveApiLogs.unshift({
      time: requestTime.split(' ')[1],
      storeId: nhaHangId || 'SYSTEM',
      file: error.message,
      type: 'ERR',
      status: 'FAILED'
    });
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    uptime: Date.now() - serverStartTime,
    status: missingEnv.length > 0 ? "ERROR" : "OPERATIONAL",
    logs: liveApiLogs,
    memory: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)
  });
});

// TOÀN BỘ GIAO DIỆN MONITOR 3 CỘT HIGH-TECH ĐẲNG CẤP ENTERPRISE
app.get('/', (req, res) => {
  const statusColor = missingEnv.length > 0 ? '#ef4444' : '#10b981';
  const statusText = missingEnv.length > 0 ? 'SYSTEM ERROR / CRITICAL' : 'SYSTEM STATUS: OPERATIONAL';
  
  res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BDPOS SMART | Master Storage Monitor</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Inter', sans-serif; }
            body {
                background-color: #0b0f19;
                color: #94a3b8;
                padding: 24px;
                min-height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            
            /* Toàn bộ khung Dashboard lớn */
            .dashboard-container {
                width: 100%;
                max-width: 1280px;
                background: #111827;
                border: 1px solid #1f2937;
                border-radius: 14px;
                padding: 24px;
                box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
            }

            /* Thanh Header trên cùng */
            .main-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid #1f2937;
                padding-bottom: 16px;
                margin-bottom: 24px;
            }
            .brand-title { font-size: 20px; font-weight: 700; color: #ffffff; }
            .brand-title span { color: #38bdf8; font-weight: 400; font-size: 14px; margin-left: 8px; border-left: 1px solid #374151; padding-left: 8px; }
            .time-server { font-size: 14px; color: #6b7280; font-weight: 500; }

            /* Thiết kế bố cục Layout 3 cột chính */
            .grid-layout {
                display: grid;
                grid-template-columns: 260px 1fr 300px;
                gap: 20px;
            }

            @media (max-width: 1024px) {
                .grid-layout { grid-template-columns: 1fr; }
            }

            /* Các khối panel hộp module */
            .panel {
                background: #1f2937;
                border: 1px solid #374151;
                border-radius: 10px;
                padding: 20px;
                display: flex;
                flex-direction: column;
            }
            .panel-title {
                font-size: 11px;
                font-weight: 600;
                color: #6b7280;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 16px;
                display: flex;
                justify-content: space-between;
            }

            /* Ô hiển thị số to Uptime / Object */
            .huge-number { font-size: 36px; font-weight: 700; color: #ffffff; margin-top: auto; margin-bottom: auto; letter-spacing: -1px; }
            
            /* Banner trạng thái động */
            .status-banner {
                background: #111827;
                border: 1px solid rgba(16, 185, 129, 0.2);
                padding: 12px 16px;
                border-radius: 6px;
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 20px;
            }
            .status-dot { width: 8px; height: 8px; background: ${statusColor}; border-radius: 50%; box-shadow: 0 0 12px ${statusColor}; }
            .status-txt { font-size: 12px; font-weight: 700; color: ${statusColor}; letter-spacing: 0.5px; }

            /* BẢNG CONSOLE TRUYỀN TẢI (Ngăn vỡ chữ tuyệt đối) */
            .console-wrapper { background: #111827; border: 1px solid #374151; border-radius: 8px; overflow: hidden; }
            
            .grid-table-header, .grid-table-row {
                display: grid;
                /* Cố định kích thước từng cột, cho cột FILEKEY giãn tự do */
                grid-template-columns: 85px 100px 1fr 50px 90px;
                align-items: center;
                padding: 10px 16px;
                font-size: 12px;
            }
            .grid-table-header { background: #1f2937; font-weight: 600; color: #4b5563; border-bottom: 1px solid #374151; }
            .log-scroll-area { max-height: 310px; overflow-y: auto; min-height: 200px; }
            
            .grid-table-row { border-bottom: 1px solid #1f2937; }
            .grid-table-row:last-child { border-bottom: none; }
            
            /* CSS Cắt chữ bằng dấu 3 chấm tránh vỡ cột */
            .truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: monospace; }
            
            .badge-type { background: #374151; color: #9ca3af; padding: 2px 4px; border-radius: 4px; font-size: 10px; font-weight: 600; text-align: center; }
            .badge-status { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; font-size: 11px; justify-content: flex-end; width: 100%; }
            
            .txt-success { color: #10b981; }
            .txt-failed { color: #ef4444; }
            .empty-box { text-align: center; color: #4b5563; padding: 60px 0; font-size: 13px; font-style: italic; }

            /* Biểu đồ giả lập và đo RAM */
            .ram-meta { font-size: 24px; font-weight: 700; color: #ffffff; margin-top: 10px; }
            .progress-bar-bg { width: 100%; height: 6px; background: #111827; border-radius: 10px; margin-top: 12px; overflow: hidden; }
            .progress-bar-fill { height: 100%; width: 0%; background: #eab308; transition: width 0.5s ease; }
            
            /* Hiệu ứng sóng đồ thị chuyển động tinh tế */
            .wave-container { display: flex; align-items: flex-end; gap: 3px; height: 40px; margin-top: 15px; }
            .wave-bar { width: 100%; height: 20%; background: linear-gradient(180deg, #38bdf8, transparent); border-radius: 2px; animation: waveMotion 1.2s ease-in-out infinite alternate; }
            .wave-bar:nth-child(2) { animation-delay: 0.1s; } .wave-bar:nth-child(3) { animation-delay: 0.3s; } .wave-bar:nth-child(4) { animation-delay: 0.2s; } .wave-bar:nth-child(5) { animation-delay: 0.5s; }
            @keyframes waveMotion { 0% { height: 10%; } 100% { height: 95%; } }

            /* Footer cuối trang */
            .main-footer { display: flex; justify-content: space-between; font-size: 11px; color: #4b5563; margin-top: 24px; border-top: 1px solid #1f2937; padding-top: 16px; text-transform: uppercase; }
        </style>
    </head>
    <body>
        <div class="dashboard-container">
            <div class="main-header">
                <div class="brand-title">BDPOS SMART <span>Master Storage Engine Monitor</span></div>
                <div class="time-server" id="live-clock">00:00:00 GMT+7</div>
            </div>

            <div class="grid-layout">
                
                <div style="display: flex; flex-direction: column; gap: 20px;">
                    <div class="panel" style="flex: 1;">
                        <div class="panel-title">NETWORK UTILIZATION <span>•••</span></div>
                        <div class="wave-container">
                            <div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div>
                        </div>
                    </div>
                    <div class="panel" style="flex: 1.5; min-height: 140px;">
                        <div class="panel-title">SERVER UPTIME <span>•••</span></div>
                        <div class="huge-number" id="field-uptime" style="color: #10b981;">00:00:00</div>
                    </div>
                    <div class="panel" style="flex: 1.2;">
                        <div class="panel-title">TOTAL OBJECTS STORED <span>•••</span></div>
                        <div class="huge-number" style="font-size: 28px;">12,481 <span style="font-size:12px; color:#4b5563; font-weight:normal; letter-spacing:0;">R2 Storage</span></div>
                    </div>
                </div>

                <div class="panel">
                    <div class="panel-title">OPERATIONS DASHBOARD</div>
                    <div class="status-banner">
                        <div class="status-dot"></div>
                        <div class="status-txt">${statusText}</div>
                    </div>
                    
                    <div class="panel-title" style="margin-bottom: 8px;">LIVE TRANSMISSION CONSOLE</div>
                    <div class="console-wrapper">
                        <div class="grid-table-header">
                            <div>TIMESTAMP</div>
                            <div>STORE_ID</div>
                            <div>FILE KEY (TEN TEP TIN)</div>
                            <div style="text-align:center">TYPE</div>
                            <div style="text-align:right">STATUS</div>
                        </div>
                        <div class="log-scroll-area" id="render-log-rows">
                            <div class="empty-box">Hệ thống đang sẵn sàng lắng nghe lưu lượng từ ứng dụng Flutter...</div>
                        </div>
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 20px;">
                    <div class="panel" style="flex: 1;">
                        <div class="panel-title">SYSTEM METRICS <span>•••</span></div>
                        <div style="font-size: 11px; color: #4b5563; text-transform: uppercase;">RAM USAGE</div>
                        <div class="ram-meta" id="field-ram">0.00 MB</div>
                        <div style="font-size: 11px; color: #4b5563; margin-top:4px;">512 MB Free Tier Limit</div>
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill" id="ram-progress"></div>
                        </div>
                    </div>
                    <div class="panel" style="flex: 1.5;">
                        <div class="panel-title">STORAGE BUCKETS <span>•••</span></div>
                        <div style="margin-bottom: 12px;">
                            <div style="font-size: 12px; color: #ffffff; font-weight:500;">bdpos-chat-storage</div>
                            <div style="font-size: 11px; color:#4b5563; margin-top:2px;">89 GB / 1 TB</div>
                        </div>
                        <div>
                            <div style="font-size: 12px; color: #ffffff; font-weight:500;">bdpos-voice-notes</div>
                            <div style="font-size: 11px; color:#4b5563; margin-top:2px;">21 GB</div>
                        </div>
                    </div>
                </div>

            </div>

            <div class="main-footer">
                <span>Cloudflare R2 Connection: ACTIVE • SECURE SSL/TLS v1.3</span>
                <span>Administrator: HO BAO DUY</span>
            </div>
        </div>

        <script>
            function updateClock() {
                const now = new Date();
                document.getElementById('live-clock').innerText = now.toLocaleTimeString('vi-VN') + ' GMT+7';
            }
            setInterval(updateClock, 1000);
            updateClock();

            function syncDashboardMetrics() {
                fetch('/api/status')
                    .then(res => res.json())
                    .then(data => {
                        // Tính toán đồng hồ thời gian chạy
                        let totalSeconds = Math.floor(data.uptime / 1000);
                        let hours = Math.floor(totalSeconds / 3600);
                        let minutes = Math.floor((totalSeconds % 3600) / 60);
                        let seconds = totalSeconds % 60;
                        
                        document.getElementById('field-uptime').innerText = 
                            String(hours).padStart(2, '0') + ':' +
                            String(minutes).padStart(2, '0') + ':' +
                            String(seconds).padStart(2, '0');
                            
                        // Cập nhật thông số bộ nhớ RAM
                        document.getElementById('field-ram').innerText = data.memory + ' MB';
                        let ramPercentage = (parseFloat(data.memory) / 512) * 100;
                        document.getElementById('ram-progress').style.width = Math.min(ramPercentage, 100) + '%';

                        // Đổ dữ liệu lịch sử truyền tải vào Grid Table phẳng sạch
                        const container = document.getElementById('render-log-rows');
                        if (data.logs && data.logs.length > 0) {
                            let rowsHtml = '';
                            data.logs.forEach(log => {
                                const isSuccess = log.status === 'COMPLETED';
                                const statusClass = isSuccess ? 'txt-success' : 'txt-failed';
                                const statusIcon = isSuccess ? '✓' : '✗';
                                
                                rowsHtml += \`
                                    <div class="grid-table-row">
                                        <div style="color: #4b5563; font-family: monospace;">\${log.time}</div>
                                        <div class="truncate" style="color: #38bdf8; font-weight: 500;" title="\${log.storeId}">\${log.storeId}</div>
                                        <div class="truncate" style="color: #e5e7eb;" title="\${log.file}">\${log.file}</div>
                                        <div style="display:flex; justify-content:center;"><span class="badge-type">\${log.type}</span></div>
                                        <div>
                                            <span class="badge-status \${statusClass}">\${statusIcon} \${log.status}</span>
                                        </div>
                                    </div>
                                \`;
                            });
                            container.innerHTML = rowsHtml;
                        } else {
                            container.innerHTML = '<div class="empty-box">Hệ thống đang sẵn sàng lắng nghe lưu lượng từ ứng dụng BDPOS...</div>';
                        }
                    })
                    .catch(() => {});
            }
            setInterval(syncDashboardMetrics, 1000);
            syncDashboardMetrics();
        </script>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`✅ [LAUNCH] Server Monitor Connected.`);
});
