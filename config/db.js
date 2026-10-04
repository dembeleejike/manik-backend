const mongoose = require("mongoose");

async function connectDB() {
  // The automated tests start the real server without a database; they set this
  // so the server never tries (and later gives up and exits) mid-test.
  if (process.env.MANIK_SKIP_DB === "1") return;
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
