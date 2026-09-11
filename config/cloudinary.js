const cloudinary = require("cloudinary").v2;
const multer = require("multer");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Files are held in memory just long enough to stream to Cloudinary —
// never written to disk on the server.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB cap per file
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only JPG, PNG or WEBP images are allowed"));
    }
    cb(null, true);
  },
});

// Streams a single file buffer up to Cloudinary and resolves with its URL.
function uploadBufferToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "manik", transformation: [{ width: 1200, crop: "limit" }] },
      (err, result) => {
        if (err) return reject(err);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

// Uploads every file on req.files (set by multer) and returns an array of URLs.
async function uploadAll(files = []) {
  return Promise.all(files.map((f) => uploadBufferToCloudinary(f.buffer)));
}

module.exports = { cloudinary, upload, uploadAll };
