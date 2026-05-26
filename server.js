require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();
const PORT = process.env.PORT || 10000;
const serverStartTime = Date.now(); // Dùng để tính toán Uptime real-time

app.use(cors());
app.use(express.json());

// --- KIỂM TRA ĐẦU VÀO CẤU HÌNH HỆ THỐNG ---
const requiredEnv = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL'];
const missingEnv = requiredEnv.filter(envName => !process.env[envName]);

// 1. Khởi tạo kết nối đến Cloudflare R2 thông qua S3 Client
const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

app.use((req, res, next) => {
  req.requestTime = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  next();
});

// 2. API sinh đường dẫn Presigned URL mã hóa
app.get('/v1/storage/presign', async (req, res) => {
  const { fileName, fileType, nhaHangId } = req.query;
  
  console.log(`\n\x1b[36m========== [REQUEST PRESIGN] ${req.requestTime} ==========\x1b[0m`);
  console.log(`[INFO] Nhà hàng ID : ${nhaHangId}`);
  console.log(`[INFO] Tên tệp gốc : ${fileName}`);
  console.log(`[INFO] Định dạng   : ${fileType}`);

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

    console.log(`\x1b[32m[SUCCESS] Đã tạo Presigned URL thành công!\x1b[0m`);
    return res.json({ success: true, uploadUrl, publicUrl });
  } catch (error) {
    console.error(`\x1b[31m[ERROR]\x1b[0m`, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// API phụ để trang HTML lấy thông số thời gian chạy thực tế
app.get('/api/status', (req, res) => {
  const uptimeMs = Date.now() - serverStartTime;
  res.json({
    uptime: uptimeMs,
    status: missingEnv.length > 0 ? "ERROR" : "OPERATIONAL"
  });
});

// 3. THIẾT KẾ TRANG CHỦ HTML GIAO DIỆN FUTURISTIC NEON GLOW CỰC ĐẸP
app.get('/', (req, res) => {
  const statusColor = missingEnv.length > 0 ? '#ff3b3b' : '#00ffcc';
  const statusText = missingEnv.length > 0 ? 'CẤU HÌNH LỖI' : 'ONLINE / ỔN ĐỊNH';
  
  res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BDPOS SMART - R2 Storage Engine</title>
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap" rel="stylesheet">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                background-color: #050814;
                color: #ffffff;
                font-family: 'Share Tech Mono', monospace;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                overflow: hidden;
                position: relative;
            }
            /* Hiệu ứng lưới công nghệ chìm phía sau */
            body::before {
                content: '';
                position: absolute;
                width: 200%;
                height: 200%;
                background-image: linear-gradient(rgba(0, 255, 204, 0.03) 1px, transparent 1px),
                                  linear-gradient(90deg, rgba(0, 255, 204, 0.03) 1px, transparent 1px);
                background-size: 30px 30px;
                transform: perspective(500px) rotateX(60deg);
                top: -50%;
                animation: gridMove 20s linear infinite;
                z-index: 1;
            }
            @keyframes gridMove {
                0% { background-position: 0 0; }
                100% { background-position: 0 1000px; }
            }
            /* Khung điều khiển trung tâm (Glassmorphism) */
            .panel {
                background: rgba(10, 18, 42, 0.8);
                border: 1px solid rgba(0, 255, 204, 0.2);
                padding: 40px;
                border-radius: 20px;
                width: 90%;
                max-width: 600px;
                text-align: center;
                box-shadow: 0 0 40px rgba(0, 255, 204, 0.1), inset 0 0 20px rgba(0, 255, 204, 0.05);
                backdrop-filter: blur(10px);
                z-index: 2;
                position: relative;
            }
            .panel::after {
                content: '';
                position: absolute;
                top: 0; left: 0; right: 0; height: 2px;
                background: linear-gradient(90deg, transparent, #00ffcc, transparent);
            }
            h1 {
                font-family: 'Orbitron', sans-serif;
                font-size: 24px;
                font-weight: 900;
                letter-spacing: 2px;
                color: #ffffff;
                text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
                margin-bottom: 5px;
            }
            .subtitle {
                font-size: 14px;
                color: #4a6fa5;
                margin-bottom: 30px;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            /* Trạng thái quét sóng */
            .status-container {
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(0, 0, 0, 0.4);
                padding: 15px;
                border-radius: 10px;
                border: 1px solid rgba(255, 255, 255, 0.05);
                margin-bottom: 25px;
            }
            .pulse-circle {
                width: 12px;
                height: 12px;
                background-color: ${statusColor};
                border-radius: 50%;
                margin-right: 15px;
                box-shadow: 0 0 15px ${statusColor};
                animation: pulse 1.5s infinite;
            }
            @keyframes pulse {
                0% { transform: scale(0.9); opacity: 0.7; }
                50% { transform: scale(1.2); opacity: 1; box-shadow: 0 0 25px ${statusColor}; }
                100% { transform: scale(0.9); opacity: 0.7; }
            }
            .status-text {
                font-family: 'Orbitron', sans-serif;
                font-size: 16px;
                font-weight: 700;
                color: ${statusColor};
                letter-spacing: 1px;
            }
            /* Bộ đếm thời gian hoạt động */
            .box-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 15px;
                margin-bottom: 25px;
            }
            .stat-box {
                background: rgba(5, 8, 20, 0.6);
                border: 1px solid rgba(74, 111, 165, 0.2);
                padding: 15px;
                border-radius: 8px;
                text-align: left;
            }
            .stat-label {
                font-size: 11px;
                color: #4a6fa5;
                text-transform: uppercase;
                margin-bottom: 5px;
            }
            .stat-value {
                font-size: 18px;
                color: #00ffcc;
                text-shadow: 0 0 5px rgba(0, 255, 204, 0.3);
            }
            /* Đồ thị sóng âm chuyển động bằng CSS Pure */
            .sound-wave {
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 4px;
                height: 30px;
                margin: 20px 0;
            }
            .bar {
                width: 3px;
                height: 5px;
                background-color: #00ffcc;
                box-shadow: 0 0 5px #00ffcc;
                animation: jump 1s ease-in-out infinite alternate;
                border-radius: 10px;
            }
            .bar:nth-child(2) { animation-delay: 0.2s; }
            .bar:nth-child(3) { animation-delay: 0.4s; height: 25px; }
            .bar:nth-child(4) { animation-delay: 0.1s; }
            .bar:nth-child(5) { animation-delay: 0.6s; }
            @keyframes jump {
                0% { height: 5px; opacity: 0.3; }
                100% { height: 30px; opacity: 1; }
            }
            .footer {
                font-size: 11px;
                color: #3b4c66;
                margin-top: 10px;
            }
        </style>
    </head>
    <body>
        <div class="panel">
            <h1>BDPOS SMART</h1>
            <div class="subtitle">Cloud Storage R2 Service Engine</div>
            
            <div class="status-container">
                <div class="pulse-circle"></div>
                <div class="status-text">${statusText}</div>
            </div>

            <div class="sound-wave">
                <div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div>
            </div>

            <div class="box-grid">
                <div class="stat-box">
                    <div class="stat-label">Hệ thống phân vùng</div>
                    <div class="stat-value" style="color: #ffffff;">Cloudflare R2</div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">Thời gian chạy (Uptime)</div>
                    <div class="stat-value" id="uptime-display">00:00:00</div>
                </div>
            </div>

            <div class="footer">AUTHENTICATED ENGINE • SECURE SSL CONNECTED</div>
        </div>

        <script>
            // Hàm tính toán và cập nhật Uptime động từng giây lên màn hình HTML
            function updateUptime() {
                fetch('/api/status')
                    .then(res => res.json())
                    .then(data => {
                        let totalSeconds = Math.floor(data.uptime / 1000);
                        let hours = Math.floor(totalSeconds / 3600);
                        let minutes = Math.floor((totalSeconds % 3600) / 60);
                        let seconds = totalSeconds % 60;

                        let timeString = 
                            String(hours).padLeft && String(hours).padStart(2, '0') + ':' +
                            String(minutes).padStart(2, '0') + ':' +
                            String(seconds).padStart(2, '0');
                        
                        document.getElementById('uptime-display').innerText = timeString;
                    })
                    .catch(() => {});
            }
            setInterval(updateUptime, 1000);
            updateUptime();
        </script>
    </body>
    </html>
  `);
});

// Khởi chạy server
app.listen(PORT, () => {
  const startTime = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  console.log(`\x1b[32m✅ [START] Server BDPOS SMART R2 đã khởi chạy thành công tại thời điểm: ${startTime}\x1b[0m`);
});
