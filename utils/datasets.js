// One definition of every exportable table (columns + how to load it), used by
// the spreadsheet exports, the emailed backup, and nothing else — so a column
// can never differ between "Download" and "Email me a backup".
const Product = require("../models/Product");
const Sale = require("../models/Sale");
const Purchase = require("../models/Purchase");
const Expense = require("../models/Expense");
const Customer = require("../models/Customer");
const Quote = require("../models/Quote");
const Quotation = require("../models/Quotation");
const StockAdjustment = require("../models/StockAdjustment");
const Location = require("../models/Location");
const Transfer = require("../models/Transfer");
const { dateFilterFromQuery } = require("./dates");
const { buildWorkbook } = require("./xlsx");

const LAGOS_MS = 60 * 60 * 1000;

const DATASETS = {
  products: {
    title: "Products",
    async load() {
      const [products, locations] = await Promise.all([Product.find().populate("category", "name").sort({ name: 1 }), Location.find().sort({ sortOrder: 1, name: 1 })]);
      const names = new Map(locations.map((l) => [String(l._id), l.name]));
      return products.map((p) => ({ ...p.toObject(), category: p.category, _where: (p.stock || []).filter((s) => s.quantity > 0).map((s) => `${names.get(String(s.location)) || "?"}: ${s.quantity}`).join("; ") }));
    },
    columns: [
      { label: "Ref", get: (p) => p.ref },
      { label: "Name", get: (p) => p.name },
      { label: "Category", get: (p) => p.category?.name || "" },
      { label: "Status", get: (p) => p.status },
      { label: "Total on hand", get: (p) => p.quantity, type: "number" },
      { label: "Where it is", get: (p) => p._where },
      { label: "Low-stock level", get: (p) => p.lowStockThreshold, type: "number" },
      { label: "Cost price", get: (p) => p.costPrice, type: "money" },
      { label: "Selling price", get: (p) => p.sellingPrice, type: "money" },
      { label: "Stock value (cost)", get: (p) => p.quantity * (p.costPrice || 0), type: "money" },
      { label: "Added", get: (p) => p.createdAt, type: "date" },
    ],
  },
  stocklevels: {
    title: "Stock by location",
    // one row per product per location that holds (or held) some of it
    async load() {
      const [products, locations] = await Promise.all([Product.find().populate("category", "name").sort({ name: 1 }), Location.find().sort({ sortOrder: 1, name: 1 })]);
      const names = new Map(locations.map((l) => [String(l._id), l.name]));
      const rows = [];
      for (const p of products) {
        for (const s of p.stock || []) rows.push({ p, location: names.get(String(s.location)) || "Unknown location", quantity: s.quantity });
        if ((!p.stock || p.stock.length === 0) && p.quantity > 0) rows.push({ p, location: "Not yet assigned", quantity: p.quantity });
      }
      return rows;
    },
    columns: [
      { label: "Category", get: (r) => r.p.category?.name || "" },
      { label: "Ref", get: (r) => r.p.ref },
      { label: "Product", get: (r) => r.p.name },
      { label: "Location", get: (r) => r.location },
      { label: "Quantity", get: (r) => r.quantity, type: "number" },
      { label: "Cost price", get: (r) => r.p.costPrice, type: "money" },
      { label: "Value (cost)", get: (r) => r.quantity * (r.p.costPrice || 0), type: "money" },
    ],
  },
  sales: {
    title: "Sales",
    async load(query) {
      return Sale.find(dateFilterFromQuery(query))
        .populate({ path: "product", select: "category", populate: { path: "category", select: "name" } })
        .sort({ date: -1 });
    },
    columns: [
      { label: "Date", get: (s) => s.date, type: "date" },
      { label: "Customer", get: (s) => s.customerName },
      { label: "Phone", get: (s) => s.customerPhone },
      { label: "Product", get: (s) => s.productName },
      { label: "Category", get: (s) => s.product?.category?.name || "" },
      { label: "Sold from", get: (s) => s.locationName },
      { label: "Quantity", get: (s) => s.quantity, type: "number" },
      { label: "Unit price", get: (s) => s.unitPrice, type: "money" },
      { label: "Total", get: (s) => s.totalAmount, type: "money" },
      { label: "Qty returned", get: (s) => s.returnedQuantity || 0, type: "number" },
      { label: "Value returned", get: (s) => s.returnedAmount || 0, type: "money" },
      { label: "Net total", get: (s) => s.totalAmount - (s.returnedAmount || 0), type: "money" },
      { label: "Amount paid", get: (s) => s.amountPaid, type: "money" },
      { label: "Refunded", get: (s) => s.refundedAmount || 0, type: "money" },
      { label: "Balance owed", get: (s) => Math.max(0, s.totalAmount - (s.returnedAmount || 0) - (s.amountPaid - (s.refundedAmount || 0))), type: "money" },
      { label: "Payment status", get: (s) => s.paymentStatus },
      { label: "Payment method", get: (s) => s.paymentMethod },
      { label: "Cost at sale", get: (s) => (s.quantity - (s.returnedQuantity || 0)) * (s.costPriceAtSale || 0), type: "money" },
      { label: "Profit", get: (s) => s.totalAmount - (s.returnedAmount || 0) - (s.quantity - (s.returnedQuantity || 0)) * (s.costPriceAtSale || 0), type: "money" },
      { label: "Notes", get: (s) => s.notes },
    ],
  },
  purchases: {
    title: "Purchases",
    async load(query) {
      return Purchase.find(dateFilterFromQuery(query)).sort({ date: -1 });
    },
    columns: [
      { label: "Date", get: (p) => p.date, type: "date" },
      { label: "Product", get: (p) => p.productName },
      { label: "Delivered to", get: (p) => p.locationName },
      { label: "Supplier", get: (p) => p.supplier },
      { label: "Invoice ref", get: (p) => p.invoiceRef },
      { label: "Quantity", get: (p) => p.quantity, type: "number" },
      { label: "Unit cost", get: (p) => p.unitCost, type: "money" },
      { label: "Total cost", get: (p) => p.totalCost, type: "money" },
      { label: "Notes", get: (p) => p.notes },
    ],
  },
  expenses: {
    title: "Expenses",
    async load(query) {
      return Expense.find(dateFilterFromQuery(query)).sort({ date: -1 });
    },
    columns: [
      { label: "Date", get: (e) => e.date, type: "date" },
      { label: "Category", get: (e) => e.category },
      { label: "Description", get: (e) => e.description },
      { label: "Amount", get: (e) => e.amount, type: "money" },
    ],
  },
  customers: {
    title: "Customers",
    async load() {
      const [customers, totals] = await Promise.all([
        Customer.find().sort({ name: 1 }),
        Sale.aggregate([
          { $match: { customerPhone: { $ne: "" } } },
          {
            $group: {
              _id: "$customerPhone",
              sales: { $sum: 1 },
              spent: { $sum: { $subtract: ["$totalAmount", { $ifNull: ["$returnedAmount", 0] }] } },
              paid: { $sum: { $subtract: ["$amountPaid", { $ifNull: ["$refundedAmount", 0] }] } },
              last: { $max: "$date" },
            },
          },
        ]),
      ]);
      const byPhone = Object.fromEntries(totals.map((t) => [t._id, t]));
      return customers.map((c) => ({ ...c.toObject(), _t: byPhone[c.phone] || {} }));
    },
    columns: [
      { label: "Name", get: (c) => c.name },
      { label: "Phone", get: (c) => c.phone },
      { label: "WhatsApp", get: (c) => c.whatsapp },
      { label: "Location", get: (c) => c.location },
      { label: "Number of sales", get: (c) => c._t.sales || 0, type: "number" },
      { label: "Total bought", get: (c) => c._t.spent || 0, type: "money" },
      { label: "Balance owed", get: (c) => (c._t.spent || 0) - (c._t.paid || 0), type: "money" },
      { label: "Last purchase", get: (c) => c._t.last, type: "date" },
      { label: "Notes", get: (c) => c.notes },
    ],
  },
  quotations: {
    title: "Quotations",
    async load(query) {
      const range = dateFilterFromQuery(query);
      return Quotation.find(range.date ? { createdAt: range.date } : {}).sort({ createdAt: -1 });
    },
    columns: [
      { label: "Number", get: (q) => q.number },
      { label: "Date", get: (q) => q.createdAt, type: "date" },
      { label: "Customer", get: (q) => q.customerName },
      { label: "Phone", get: (q) => q.customerPhone },
      { label: "Items", get: (q) => q.lines.map((l) => `${l.quantity} × ${l.description}`).join("; ") },
      { label: "Total", get: (q) => q.lines.reduce((n, l) => n + l.quantity * l.unitPrice, 0) - (q.discount || 0), type: "money" },
      { label: "Valid until", get: (q) => q.validUntil, type: "date" },
      { label: "Status", get: (q) => q.status },
    ],
  },
  stockcounts: {
    title: "Stock counts",
    async load(query) {
      const range = dateFilterFromQuery(query);
      return StockAdjustment.find(range.date ? { at: range.date } : {}).sort({ at: -1 });
    },
    columns: [
      { label: "Date", get: (a) => a.at, type: "date" },
      { label: "Product", get: (a) => a.productName },
      { label: "Ref", get: (a) => a.productRef },
      { label: "Category counted", get: (a) => a.categoryName },
      { label: "Location", get: (a) => a.locationName },
      { label: "System had", get: (a) => a.before, type: "number" },
      { label: "Counted / set to", get: (a) => a.after, type: "number" },
      { label: "Difference", get: (a) => a.difference, type: "number" },
      { label: "Value of difference", get: (a) => a.difference * (a.unitCost || 0), type: "money" },
      { label: "Reason", get: (a) => a.reason },
      { label: "By", get: (a) => a.byName },
      { label: "Note", get: (a) => a.note },
    ],
  },
  transfers: {
    title: "Stock moves",
    async load(query) {
      const range = dateFilterFromQuery(query);
      return Transfer.find(range.date ? { at: range.date } : {}).sort({ at: -1 });
    },
    columns: [
      { label: "Date", get: (t) => t.at, type: "date" },
      { label: "Product", get: (t) => t.productName },
      { label: "Category", get: (t) => t.categoryName },
      { label: "From", get: (t) => t.fromName },
      { label: "To", get: (t) => t.toName },
      { label: "Quantity", get: (t) => t.quantity, type: "number" },
      { label: "By", get: (t) => t.byName },
      { label: "Note", get: (t) => t.note },
    ],
  },
  quotes: {
    title: "Quote requests",
    async load(query) {
      const range = dateFilterFromQuery(query);
      return Quote.find(range.date ? { createdAt: range.date } : {}).sort({ createdAt: -1 });
    },
    columns: [
      { label: "Received", get: (q) => q.createdAt, type: "date" },
      { label: "Name", get: (q) => q.name },
      { label: "Phone", get: (q) => q.phone },
      { label: "Request type", get: (q) => q.requestType },
      { label: "Product", get: (q) => q.product },
      { label: "Quantity", get: (q) => q.quantity },
      { label: "Location", get: (q) => q.location },
      { label: "Preferred contact", get: (q) => q.preferredContact },
      { label: "Status", get: (q) => q.status },
      { label: "Notes", get: (q) => q.notes },
    ],
  },
};

// Builds a single .xlsx containing every table, one sheet each.
async function buildFullWorkbook() {
  const sheets = [];
  for (const key of Object.keys(DATASETS)) {
    const d = DATASETS[key];
    sheets.push({ name: d.title, columns: d.columns, rows: await d.load({}) });
  }
  return Buffer.from(buildWorkbook(sheets, { tzOffsetMs: LAGOS_MS }));
}

module.exports = { DATASETS, buildFullWorkbook, LAGOS_MS };
