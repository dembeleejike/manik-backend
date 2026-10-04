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
const { dateFilterFromQuery } = require("./dates");
const { buildWorkbook } = require("./xlsx");

const LAGOS_MS = 60 * 60 * 1000;

const DATASETS = {
  products: {
    title: "Products",
    async load() {
      return Product.find().populate("category", "name").sort({ name: 1 });
    },
    columns: [
      { label: "Ref", get: (p) => p.ref },
      { label: "Name", get: (p) => p.name },
      { label: "Category", get: (p) => p.category?.name || "" },
      { label: "Status", get: (p) => p.status },
      { label: "Stock quantity", get: (p) => p.quantity, type: "number" },
      { label: "Low-stock level", get: (p) => p.lowStockThreshold, type: "number" },
      { label: "Cost price", get: (p) => p.costPrice, type: "money" },
      { label: "Selling price", get: (p) => p.sellingPrice, type: "money" },
      { label: "Added", get: (p) => p.createdAt, type: "date" },
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
      { label: "Quantity", get: (s) => s.quantity, type: "number" },
      { label: "Unit price", get: (s) => s.unitPrice, type: "money" },
      { label: "Total", get: (s) => s.totalAmount, type: "money" },
      { label: "Amount paid", get: (s) => s.amountPaid, type: "money" },
      { label: "Balance owed", get: (s) => s.totalAmount - s.amountPaid, type: "money" },
      { label: "Payment status", get: (s) => s.paymentStatus },
      { label: "Payment method", get: (s) => s.paymentMethod },
      { label: "Cost at sale", get: (s) => s.quantity * (s.costPriceAtSale || 0), type: "money" },
      { label: "Profit", get: (s) => s.totalAmount - s.quantity * (s.costPriceAtSale || 0), type: "money" },
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
              spent: { $sum: "$totalAmount" },
              paid: { $sum: "$amountPaid" },
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
      { label: "System had", get: (a) => a.before, type: "number" },
      { label: "Counted / set to", get: (a) => a.after, type: "number" },
      { label: "Difference", get: (a) => a.difference, type: "number" },
      { label: "Value of difference", get: (a) => a.difference * (a.unitCost || 0), type: "money" },
      { label: "Reason", get: (a) => a.reason },
      { label: "By", get: (a) => a.byName },
      { label: "Note", get: (a) => a.note },
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
