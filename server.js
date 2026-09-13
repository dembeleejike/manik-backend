require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const categoryRoutes = require("./routes/categories");
const quoteRoutes = require("./routes/quotes");
const projectRoutes = require("./routes/projects");
const settingsRoutes = require("./routes/settings");
const purchaseRoutes = require("./routes/purchases");
const saleRoutes = require("./routes/sales");
const expenseRoutes = require("./routes/expenses");
const reportRoutes = require("./routes/reports");
const customerRoutes = require("./routes/customers");

const app = express();

connectDB();

app.use(cors()); // in production, restrict this to your actual site's domain — see README
app.use(express.json());

app.get("/", (req, res) => res.json({ status: "MANIK API is running" }));

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/quotes", quoteRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/customers", customerRoutes);

// Catch-all error handler — keeps a single bad request from crashing the whole server
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong on the server" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`MANIK API running on port ${PORT}`));
