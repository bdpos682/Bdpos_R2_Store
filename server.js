require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();
const PORT = process.env.PORT || 10000;
const serverStartTime = Date.now();

// Mảng lưu trữ tối đa 8 log request gần nhất để hiển thị lên giao diện HTML
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

    // Đẩy log mới vào mảng để hiển thị lên dashboard HTML bên ngoài
    liveApiLogs.unshift({
      time: requestTime.split(' ')[1], // Chỉ lấy HH:mm:ss
      storeId: nhaHangId,
      file: cleanFileName.length > 22 ? cleanFileName.substring(0, 20) + '...' : cleanFileName,
      status: 'SUCCESS'
    });
    if (liveApiLogs.length > 8) liveApiLogs.pop(); // Giữ tối đa 8 dòng log gần nhất

    return res.json({ success: true, uploadUrl, publicUrl });
  } catch (error) {
    liveApiLogs.unshift({
      time: requestTime.split(' ')[1],
      storeId: nhaHangId || 'UNKNOWN',
      file: 'Error Process',
      status: 'FAILED'
    });
    return res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint cung cấp thông số động cho Dashboard giao diện
app.get('/api/status', (req, res) => {
  res.json({
    uptime: Date.now() - serverStartTime,
    status: missingEnv.length > 0 ? "ERROR" : "OPERATIONAL",
    logs: liveApiLogs,
    memory: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB',
    nodeVersion: process.version
  });
});

// GIAO DIỆN MONITOR MASTER ĐẲNG CẤP HIGH-TECH NEON GLOW V2
app.get('/', (req, res) => {
  const statusColor = missingEnv.length > 0 ? '#ff3b3b' : '#00ffcc';
  const statusText = missingEnv.length > 0 ? 'SYSTEM CRITICAL / ERROR' : 'ONLINE / ENGINE OPERATIONAL';
  
  res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BDPOS SMART - Master R2 Storage Engine Monitor</title>
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;900&family=Share+Tech+Mono&display=swap" rel="stylesheet">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                background-color: #030611;
                color: #e2e8f0;
                font-family: 'Share Tech Mono', monospace;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                padding: 20px;
                position: relative;
                overflow-x: hidden;
            }
            body::before {
                content: ''; position: absolute; width: 200%; height: 200%;
                background-image: linear-gradient(rgba(0, 255, 204, 0.02) 1px, transparent 1px),
                                  linear-gradient(90deg, rgba(0, 255, 204, 0.02) 1px, transparent 1px);
                background-size: 40px 40px; transform: perspective(500px) rotateX(60deg);
                top: -50%; animation: gridMove 25s linear infinite; z-index: 1;
            }
            @keyframes gridMove { 0% { background-position: 0 0; } 100% { background-position: 0 1000px; } }
            
            .container {
                width: 100%; max-width: 900px; background: rgba(8, 14, 36, 0.85);
                border: 1px solid rgba(0, 255, 204, 0.15); border-radius: 16px;
                padding: 30px; box-shadow: 0 0 50px rgba(0, 255, 204, 0.08);
                backdrop-filter: blur(12px); z-index: 2; position: relative;
            }
            .container::after {
                content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
                background: linear-gradient(90deg, transparent, #00ffcc, #0077ff, transparent);
            }
            
            /* Header Section */
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 15px; }
            h1 { font-family: 'Orbitron', sans-serif; font-size: 26px; font-weight: 900; letter-spacing: 2px; color: #fff; text-shadow: 0 0 10px rgba(0,255,204,0.2); }
            .version-tag { background: rgba(0, 119, 255, 0.2); border: 1px solid #0077ff; color: #00ecff; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-top: 5px; display: inline-block; }
            
            /* Status Light Bar */
            .status-bar { background: rgba(0, 0, 0, 0.5); border: 1px solid rgba(0, 255, 204, 0.2); border-radius: 8px; padding: 12px 20px; display: flex; align-items: center; gap: 15px; margin-bottom: 25px; }
            .pulse { width: 12px; height: 12px; background: ${statusColor}; border-radius: 50%; box-shadow: 0 0 15px ${statusColor}; animation: emitPulse 2s infinite; }
            @keyframes emitPulse { 0%, 100% { transform: scale(0.9); opacity: 0.6; } 50% { transform: scale(1.2); opacity: 1; box-shadow: 0 0 25px ${statusColor}; } }
            .status-text { font-family: 'Orbitron', sans-serif; font-size: 15px; font-weight: 700; color: ${statusColor}; letter-spacing: 1px; text-transform: uppercase; }
            
            /* Dashboard Grid Widgets */
            .grid-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 25px; }
            .widget { background: rgba(4, 7, 20, 0.7); border: 1px solid rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; position: relative; }
            .widget::before { content: ''; position: absolute; left: 0; top: 20%; bottom: 20%; width: 2px; background: #00ffcc; }
            .w-label { font-size: 11px; color: #4a6fa5; text-transform: uppercase; margin-bottom: 5px; letter-spacing: 0.5px; }
            .w-value { font-size: 20px; font-weight: bold; color: #fff; font-family: 'Orbitron', sans-serif; }
            
            /* Live Terminal Logger Console */
            .console-panel { background: #02040a; border: 1px solid rgba(0, 255, 204, 0.1); border-radius: 8px; padding: 15px; margin-bottom: 15px; }
            .c-header { display: flex; justify-content: space-between; border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom: 8px; margin-bottom: 10px; font-size: 12px; color: #4a6fa5; text-transform: uppercase; }
            .log-list { font-size: 13px; line-height: 1.6; height: 160px; overflow-y: hidden; }
            .log-row { display: flex; gap: 15px; font-family: 'Share Tech Mono', monospace; border-bottom: 1px dashed rgba(255,255,255,0.02); padding: 3px 0; }
            .l-time { color: #8f9cae; }
            .l-id { color: #0077ff; font-weight: bold; }
            .l-file { color: #e2e8f0; flex-grow: 1; }
            .l-status { font-weight: bold; text-align: right; }
            .status-ok { color: #00ffcc; }
            .status-err { color: #ff3b3b; }
            .no-log { color: #3b4c66; text-align: center; padding-top: 60px; font-style: italic; }
            
            .footer-info { display: flex; justify-content: space-between; font-size: 11px; color: #3b4c66; margin-top: 15px; text-transform: uppercase; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div>
                    <h1>BDPOS SMART</h1>
                    <span class="version-tag">STABLE CLOUD STORAGE v1.1</span>
                </div>
                <div style="text-align: right; font-size: 12px; color: #4a6fa5;">
                    <div>REGION: VIRGINIA (US-EAST)</div>
                    <div>GATEWAY: EXP-NODEJS</div>
                </div>
            </div>
            
            <div class="status-bar">
                <div class="pulse"></div>
                <div class="status-text">${statusText}</div>
            </div>

            <div class="grid-stats">
                <div class="widget">
                    <div class="w-label">Phân vùng lưu trữ</div>
                    <div class="w-value" style="color: #0077ff;">Cloudflare R2</div>
                </div>
                <div class="widget">
                    <div class="w-label">Thời gian chạy (Uptime)</div>
                    <div class="w-value" id="uptime-clock" style="color: #00ffcc;">00:00:00</div>
                </div>
                <div class="widget">
                    <div class="w-label">Bộ nhớ tạm (Heap Used)</div>
                    <div class="w-value" id="memory-usage" style="color: #ffaa00;">0.00 MB</div>
                </div>
                <div class="widget">
                    <div class="w-label">Phiên bản hạt nhân</div>
                    <div class="w-value" id="node-env-ver" style="color: #a855f7;">${process.version}</div>
                </div>
            </div>

            <h2 style="font-size: 13px; font-family:'Orbitron'; letter-spacing:1px; color: #4a6fa5; margin-bottom:8px; text-transform:uppercase;">● NHẬT KÝ REQUESTS TRỰC TIẾP (LIVE TRAFFIC CONTROL)</h2>
            <div class="console-panel">
                <div class="c-header">
                    <span style="width: 70px;">THỜI GIAN</span>
                    <span style="width: 80px;">ID QUÁN</span>
                    <span style="flex-grow: 1;">TÊN TẬP TIN TRUYỀN TẢI</span>
                    <span style="width: 80px; text-align:right;">TRẠNG THÁI</span>
                </div>
                <div class="log-list" id="log-console-container">
                    <div class="no-log">Hệ thống đang lắng nghe lưu lượng từ ứng dụng Flutter...</div>
                </div>
            </div>

            <div class="footer-info">
                <span>Cấu hình Bảo mật: SSL_TLS_v1.3 COMPLIANT</span>
                <span>Chủ sở hữu: HỒ BẢO DUY</span>
            </div>
        </div>

        <script>
            function refreshMonitorData() {
                fetch('/api/status')
                    .then(res => res.json())
                    .then(data => {
                        // Sửa triệt để lỗi logic hiển thị chuỗi thời gian hoạt động (Uptime)
                        let totalSeconds = Math.floor(data.uptime / 1000);
                        let hours = Math.floor(totalSeconds / 3600);
                        let minutes = Math.floor((totalSeconds % 3600) / 60);
                        let seconds = totalSeconds % 60;

                        let timeString = 
                            String(hours).padStart(2, '0') + ':' +
                            String(minutes).padStart(2, '0') + ':' +
                            String(seconds).padStart(2, '0');
                        
                        document.getElementById('uptime-clock').innerText = timeString;
                        document.getElementById('memory-usage').innerText = data.memory;

                        // Xử lý nạp dữ liệu danh sách log trực tiếp chạy cuộn
                        const logContainer = document.getElementById('log-console-container');
                        if(data.logs && data.logs.length > 0) {
                            let htmlContent = '';
                            data.logs.forEach(log => {
                                const statusClass = log.status === 'SUCCESS' ? 'status-ok' : 'status-err';
                                htmlContent += \`
                                    <div class="log-row">
                                        <div class="l-time" style="width: 70px;">\${log.time}</div>
                                        <div class="l-id" style="width: 80px;">\${log.storeId}</div>
                                        <div class="l-file">\${log.file}</div>
                                        <div class="l-status \${statusClass}" style="width: 80px;">\${log.status}</div>
                                    </div>
                                \`;
                            });
                            logContainer.innerHTML = htmlContent;
                        } else {
                            logContainer.innerHTML = '<div class="no-log">Hệ thống đang lắng nghe lưu lượng từ ứng dụng Flutter...</div>';
                        }
                    })
                    .catch(() => {});
            }
            setInterval(refreshMonitorData, 1000);
            refreshMonitorData();
        </script>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  const startTime = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  console.log(`\x1b[32m✅ [START] Server BDPOS SMART R2 vận hành thành công tại thời điểm: ${startTime}\x1b[0m`);
});
