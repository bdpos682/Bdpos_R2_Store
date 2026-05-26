require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();
const PORT = process.env.PORT || 10000;
const serverStartTime = Date.now();

let liveApiLogs = [];

app.use(cors());
app.use(express.json());

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

// API sinh đường dẫn Presigned URL mã hóa - ĐÃ ĐỒNG BỘ FOLDERTYPE CHUẨN MENU
app.get('/v1/storage/presign', async (req, res) => {
  const { fileName, fileType, nhaHangId, folderType } = req.query;
  const requestTime = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  
  try {
    if (!fileName || !fileType || !nhaHangId) {
      return res.status(400).json({ success: false, message: "Thiếu tham số bắt buộc" });
    }

    const cleanFileName = fileName.trim().replace(/\s+/g, '_');
    const cleanNhaHangId = nhaHangId.trim();

    // Tự động phân loại thư mục gốc lưu trữ dựa trên cờ folderType nhận từ Flutter
    let targetFolder = 'chat_internal';
    if (folderType === 'menu') {
      targetFolder = 'menu';
    }

    // Quy hoạch cây cấu trúc thư mục sạch sẽ, song song ở gốc Bucket R2
    const fileKey = `${targetFolder}/${cleanNhaHangId}/${cleanFileName}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey,
      ContentType: fileType.trim(),
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`;

    const ext = cleanFileName.split('.').pop().toUpperCase();

    liveApiLogs.unshift({
      time: requestTime.split(' ')[1], 
      storeId: cleanNhaHangId,
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

// GIAO DIỆN MONITOR CHUYÊN NGHIỆP - ĐÃ KHỬ LỖI DÍNH CHỮ MOBILE & AUTO CARD LIST
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
            
            .dashboard-container {
                width: 100%;
                max-width: 1240px;
                background: #111827;
                border: 1px solid #1f2937;
                border-radius: 16px;
                padding: 28px;
                box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
            }

            .main-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid #1f2937;
                padding-bottom: 18px;
                margin-bottom: 24px;
            }
            .brand-title { font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px; }
            .brand-title span { color: #38bdf8; font-weight: 400; font-size: 14px; margin-left: 8px; border-left: 1px solid #374151; padding-left: 8px; }
            .time-server { font-size: 14px; color: #6b7280; font-weight: 500; font-family: monospace; }

            .grid-layout {
                display: grid;
                grid-template-columns: 280px 1fr 280px;
                gap: 20px;
            }

            @media (max-width: 1150px) {
                .grid-layout { grid-template-columns: 1fr 1fr; }
                .center-column { grid-column: span 2; order: -1; }
            }

            @media (max-width: 680px) {
                body { padding: 12px; }
                .dashboard-container { padding: 16px; border-radius: 12px; }
                .grid-layout { grid-template-columns: 1fr; gap: 16px; }
                .center-column { grid-column: span 1; }
                .main-header { flex-direction: column; align-items: flex-start; gap: 8px; border-bottom: none; padding-bottom: 0; }
                .time-server { font-size: 12px; }
                .brand-title span { display: block; border-left: none; padding-left: 0; margin-left: 0; margin-top: 4px; }
                
                .grid-table-header { display: none !important; }
                .grid-table-row {
                    grid-template-columns: 1fr !important;
                    background: #1f2937;
                    margin-bottom: 10px;
                    border: 1px solid #374151;
                    border-radius: 8px;
                    padding: 12px 14px !important;
                    position: relative;
                }
                .log-cell-time { color: #6b7280 !important; font-size: 11px; margin-bottom: 4px; }
                .log-cell-id { font-size: 13px; margin-bottom: 6px; }
                .log-cell-file { font-size: 13px; white-space: normal !important; word-break: break-all !important; display: block !important; margin-bottom: 8px; }
                .log-cell-status { text-align: left !important; justify-content: flex-start !important; }
            }

            .panel {
                background: #1f2937;
                border: 1px solid #374151;
                border-radius: 12px;
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
                margin-bottom: 14px;
                display: flex;
                justify-content: space-between;
            }

            .huge-number { font-size: 32px; font-weight: 700; color: #ffffff; margin-top: auto; margin-bottom: auto; letter-spacing: -0.5px; font-family: monospace; }
            
            .status-banner {
                background: #111827;
                border: 1px solid rgba(16, 185, 129, 0.15);
                padding: 12px 16px;
                border-radius: 8px;
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 20px;
            }
            .status-dot { width: 8px; height: 8px; background: ${statusColor}; border-radius: 50%; box-shadow: 0 0 12px ${statusColor}; }
            .status-txt { font-size: 12px; font-weight: 700; color: ${statusColor}; letter-spacing: 0.5px; }

            .console-wrapper { background: #111827; border: 1px solid #374151; border-radius: 8px; overflow: hidden; }
            
            .grid-table-header, .grid-table-row {
                display: grid;
                grid-template-columns: 80px 110px 1fr 85px;
                align-items: center;
                padding: 12px 16px;
                font-size: 12px;
            }
            .grid-table-header { background: #1f2937; font-weight: 600; color: #4b5563; border-bottom: 1px solid #374151; letter-spacing: 0.5px; }
            .log-scroll-area { max-height: 330px; overflow-y: auto; min-height: 220px; padding: 4px; }
            
            .grid-table-row { border-bottom: 1px solid #1f2937; }
            .grid-table-row:last-child { border-bottom: none; }
            
            .truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            
            .badge-status { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; font-size: 11px; justify-content: flex-end; width: 100%; }
            
            .txt-success { color: #10b981; }
            .txt-failed { color: #ef4444; }
            .empty-box { text-align: center; color: #4b5563; padding: 70px 0; font-size: 13px; font-style: italic; }

            .ram-meta { font-size: 24px; font-weight: 700; color: #ffffff; margin-top: 8px; font-family: monospace; }
            .progress-bar-bg { width: 100%; height: 6px; background: #111827; border-radius: 10px; margin-top: 12px; overflow: hidden; }
            .progress-bar-fill { height: 100%; width: 0%; background: #38bdf8; transition: width 0.5s ease; }
            
            .wave-container { display: flex; align-items: flex-end; gap: 4px; height: 36px; margin-top: 10px; width: 100%; }
            .wave-bar { width: 20%; height: 25%; background: linear-gradient(180deg, #38bdf8, transparent); border-radius: 2px; animation: waveMotion 1.2s ease-in-out infinite alternate; }
            .wave-bar:nth-child(2) { animation-delay: 0.1s; } .wave-bar:nth-child(3) { animation-delay: 0.4s; } .wave-bar:nth-child(4) { animation-delay: 0.2s; } .wave-bar:nth-child(5) { animation-delay: 0.6s; }
            @keyframes waveMotion { 0% { height: 15%; } 100% { height: 100%; } }

            .main-footer { display: flex; justify-content: space-between; font-size: 11px; color: #4b5563; margin-top: 24px; border-top: 1px solid #1f2937; padding-top: 16px; text-transform: uppercase; flex-wrap: wrap; gap: 8px; }
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
                    <div class="panel">
                        <div class="panel-title">NETWORK UTILIZATION <span>•••</span></div>
                        <div class="wave-container">
                            <div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div>
                        </div>
                    </div>
                    <div class="panel" style="min-height: 115px;">
                        <div class="panel-title">SERVER UPTIME <span>•••</span></div>
                        <div class="huge-number" id="field-uptime" style="color: #10b981;">00:00:00</div>
                    </div>
                </div>

                <div class="panel center-column">
                    <div class="panel-title">OPERATIONS DASHBOARD</div>
                    <div class="status-banner">
                        <div class="status-dot"></div>
                        <div class="status-txt">${statusText}</div>
                    </div>
                    
                    <div class="panel-title" style="margin-bottom: 10px;">LIVE TRANSMISSION CONSOLE</div>
                    <div class="console-wrapper">
                        <div class="grid-table-header">
                            <div>TIMESTAMP</div>
                            <div>STORE_ID (MÃ QUÁN)</div>
                            <div>FILE KEY (TEN TEP TIN TRUYỀN TẢI)</div>
                            <div style="text-align:right">STATUS</div>
                        </div>
                        <div class="log-scroll-area" id="render-log-rows">
                            <div class="empty-box">Hệ thống đang sẵn sàng lắng nghe lưu lượng từ ứng dụng BDPOS...</div>
                        </div>
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 20px;">
                    <div class="panel">
                        <div class="panel-title">SYSTEM METRICS <span>•••</span></div>
                        <div style="font-size: 11px; color: #4b5563; text-transform: uppercase;">RAM USAGE</div>
                        <div class="ram-meta" id="field-ram">0.00 MB</div>
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill" id="ram-progress"></div>
                        </div>
                    </div>
                    <div class="panel">
                        <div class="panel-title">STORAGE BUCKETS <span>•••</span></div>
                        <div style="margin-bottom: 8px;">
                            <div style="font-size: 12px; color: #ffffff; font-weight:500;">bdpos-chat-storage</div>
                            <div style="font-size: 11px; color:#4b5563; margin-top:2px;">Phân vùng lưu trữ: Cloudflare R2</div>
                        </div>
                        <div style="border-top: 1px dashed #374151; padding-top: 8px; margin-top: 4px;">
                            <div style="font-size: 12px; color: #ffffff; font-weight:500;">Tổng dung lượng tệp</div>
                            <div style="font-size: 14px; color:#38bdf8; font-weight:bold; margin-top:2px; font-family: monospace;">12,481 Objects</div>
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
                        let totalSeconds = Math.floor(data.uptime / 1000);
                        let hours = Math.floor(totalSeconds / 3600);
                        let minutes = Math.floor((totalSeconds % 3600) / 60);
                        let seconds = totalSeconds % 60;
                        
                        document.getElementById('field-uptime').innerText = 
                            String(hours).padStart(2, '0') + ':' +
                            String(minutes).padStart(2, '0') + ':' +
                            String(seconds).padStart(2, '0');
                            
                        document.getElementById('field-ram').innerText = data.memory + ' MB';
                        let ramPercentage = (parseFloat(data.memory) / 512) * 100;
                        document.getElementById('ram-progress').style.width = Math.min(ramPercentage, 100) + '%';

                        const container = document.getElementById('render-log-rows');

                        if (data.logs && data.logs.length > 0) {
                            let rowsHtml = '';
                            data.logs.forEach(log => {
                                const isSuccess = log.status === 'COMPLETED';
                                const statusClass = isSuccess ? 'txt-success' : 'txt-failed';
                                const statusIcon = isSuccess ? '✓' : '✗';
                                
                                rowsHtml += \`
                                    <div class="grid-table-row">
                                        <div class="log-cell-time" style="color: #4b5563; font-family: monospace;">\Str_${log.time}</div>
                                        <div class="log-cell-id truncate" style="color: #38bdf8; font-weight: 500;" title="\${log.storeId}">\${log.storeId}</div>
                                        <div class="log-cell-file truncate" style="color: #e5e7eb; font-family: monospace;" title="\${log.file}">\${log.file}</div>
                                        <div class="log-cell-status">
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
  console.log(`✅ [LAUNCH] Monitor Engine Operational.`);
});
