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

// The browser-reported file type can be faked, so check the file's own first
// bytes (JPEG, PNG or WEBP) before accepting it.
function looksLikeAllowedImage(buf) {
  if (!buf || buf.length < 12) return false;
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const png = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP";
  return jpeg || png || webp;
}

// Streams a single file buffer up to Cloudinary and resolves with its URL.
function uploadBufferToCloudinary(buffer) {
  if (!looksLikeAllowedImage(buffer)) {
    const err = new Error("Only JPG, PNG or WEBP images are allowed");
    err.status = 400;
    return Promise.reject(err);
  }
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

// Uploads a raw file (not an image) to Cloudinary — used for backup files.
// type "authenticated" makes it PRIVATE: it can only be opened with a signed
// URL from the Cloudinary console/API, never by guessing a public link.
function uploadRawBuffer(buffer, filename) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "manik/backups", resource_type: "raw", type: "authenticated", public_id: filename, overwrite: false },
      (err, result) => {
        if (err) return reject(err);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

// Works out the Cloudinary public_id from a stored image URL, e.g.
// https://res.cloudinary.com/x/image/upload/v123/manik/abc.jpg -> manik/abc
function publicIdFromUrl(url) {
  const match = /\/image\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?(manik\/[^.]+)\.[a-z0-9]+$/i.exec(String(url));
  return match ? match[1] : null;
}

// Removes images from Cloudinary when the product/project that owned them is
// deleted, so storage doesn't fill with photos nobody can see. Best effort:
// a failure here never blocks the delete itself.
async function deleteImagesByUrls(urls = []) {
  await Promise.allSettled(
    urls.map((u) => {
      const id = publicIdFromUrl(u);
      return id ? cloudinary.uploader.destroy(id, { resource_type: "image" }) : null;
    })
  );
}

module.exports = { cloudinary, upload, uploadAll, uploadRawBuffer, deleteImagesByUrls, publicIdFromUrl };
