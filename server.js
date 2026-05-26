require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();
const PORT = process.env.PORT || 10000;

// Cấu hình CORS và Middleware
app.use(cors());
app.use(express.json());

// --- KIỂM TRA ĐẦU VÀO CẤU HÌNH HỆ THỐNG ---
const requiredEnv = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL'];
const missingEnv = requiredEnv.filter(envName => !process.env[envName]);

if (missingEnv.length > 0) {
  console.error(`\x1b[31m[Ý CHÚ Ý] Thiếu các cấu hình quan trọng trong Environment: ${missingEnv.join(', ')}\x1b[0m`);
  console.error(`\x1b[33mHãy kiểm tra lại cấu hình trên Render Dashboard trước khi tiếp tục!\x1b[0m`);
} else {
  console.log('[HỆ THỐNG] Đã nạp đầy đủ cấu hình kết nối Cloudflare R2.');
}

// 1. Khởi tạo kết nối đến Cloudflare R2 thông qua S3 Client
const s3Client = new S3Client({
  region: "auto", // Cloudflare R2 bắt buộc phải để "auto"
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Middleware bổ sung log thời gian cho mọi Request
app.use((req, res, next) => {
  req.requestTime = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  next();
});

// 2. Định nghĩa API sinh đường dẫn Presigned URL mã hóa
app.get('/v1/storage/presign', async (req, res) => {
  const { fileName, fileType, nhaHangId } = req.query;
  
  console.log(`\n\x1b[36m========== [REQUEST PRESIGN] ${req.requestTime} ==========\x1b[0m`);
  console.log(`[INFO] Nhà hàng ID : ${nhaHangId}`);
  console.log(`[INFO] Tên tệp gốc : ${fileName}`);
  console.log(`[INFO] Định dạng   : ${fileType}`);

  try {
    // Kiểm tra tính hợp lệ của tham số đầu vào từ Flutter gửi lên
    if (!fileName || !fileType || !nhaHangId) {
      console.warn(`\x1b[33m[WARN] Request thất bại: Gửi thiếu tham số bắt buộc.\x1b[0m`);
      return res.status(400).json({ 
        success: false, 
        message: "Thiếu tham số bắt buộc: fileName, fileType, hoặc nhaHangId" 
      });
    }

    // Làm sạch chuỗi đầu vào (Bỏ khoảng trắng thừa)
    const cleanFileName = fileName.trim().replace(/\s+/g, '_');
    const cleanFileType = fileType.trim();
    const cleanNhaHangId = nhaHangId.trim();

    // Quy hoạch cấu trúc cây thư mục lưu trên R2: chat_internal/id_quán/tên_file
    const fileKey = `chat_internal/${cleanNhaHangId}/${cleanFileName}`;

    // Tạo lệnh PUT để chuẩn bị đẩy file lên hệ thống
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey,
      ContentType: cleanFileType,
    });

    console.log(`[R2_PROCESS] Đang sinh mã ký điện tử cho Key: "${fileKey}"...`);

    // Sinh ra đường dẫn upload tạm thời có thời hạn sử dụng trong 5 phút (300 giây)
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    // Đường dẫn public cuối cùng để Flutter dùng hiển thị ảnh hoặc nghe voice phát từ R2
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`;

    console.log(`\x1b[32m[SUCCESS] Đã tạo Presigned URL thành công!\x1b[0m`);
    console.log(`[OUTPUT] Public URL: ${publicUrl}`);
    console.log(`\x1b[36m==========================================================\x1b[0m`);

    // Trả kết quả về cho client Flutter
    return res.json({
      success: true,
      uploadUrl: uploadUrl,
      publicUrl: publicUrl
    });

  } catch (error) {
    console.error(`\x1b[31m[ERROR] Lỗi hệ thống khi sinh Presigned URL vào lúc ${req.requestTime}:\x1b[0m`, error);
    console.log(`\x1b[36m==========================================================\x1b[0m`);
    return res.status(500).json({ 
      success: false, 
      message: "Lỗi Server Nội Bộ", 
      error: error.message 
    });
  }
});

// Endpoint kiểm tra trạng thái hoạt động của Server (Health Check)
app.get('/', (req, res) => {
  res.send('🚀 BDPOS SMART R2 Backend đang chạy mượt mà...');
});

// Khởi chạy server
app.listen(PORT, () => {
  const startTime = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  console.log(`\x1b[32m✅ [START] Server BDPOS SMART R2 đã khởi chạy thành công tại thời điểm: ${startTime}\x1b[0m`);
  console.log(`\x1b[32m✅ [PORT] Server đang lắng nghe các request tại cổng: ${PORT}\x1b[0m`);
});