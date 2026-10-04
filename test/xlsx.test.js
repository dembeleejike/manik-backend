const test = require("node:test");
const assert = require("node:assert");
const { buildWorkbook, buildCsv, crc32 } = require("../utils/xlsx");

const columns = [
  { label: "Date", get: (r) => r.d, type: "date" },
  { label: "Name", get: (r) => r.n },
  { label: "Total", get: (r) => r.t, type: "money" },
];
const rows = [
  { d: new Date("2026-10-02T10:00:00Z"), n: '=HYPERLINK("http://x")', t: 1234.5 },
  { d: null, n: "Ünï <b>&co</b>", t: 0 },
];

// Minimal ZIP reader: walks the central directory and checks each file's CRC.
function readZip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const end = buf.length - 22;
  assert.strictEqual(dv.getUint32(end, true), 0x06054b50, "end-of-archive record");
  const count = dv.getUint16(end + 10, true);
  let p = dv.getUint32(end + 16, true);
  const out = {};
  for (let i = 0; i < count; i++) {
    assert.strictEqual(dv.getUint32(p, true), 0x02014b50);
    const crc = dv.getUint32(p + 16, true), size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), local = dv.getUint32(p + 42, true);
    const name = Buffer.from(buf.subarray(p + 46, p + 46 + nameLen)).toString();
    const lnLen = dv.getUint16(local + 26, true), exLen = dv.getUint16(local + 28, true);
    const data = buf.subarray(local + 30 + lnLen + exLen, local + 30 + lnLen + exLen + size);
    assert.strictEqual(crc32(data), crc, "CRC of " + name);
    out[name] = Buffer.from(data).toString();
    p += 46 + nameLen;
  }
  return out;
}

test("crc32 matches the standard check value", () => {
  assert.strictEqual(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("workbook is a valid zip with every required part", () => {
  const files = readZip(buildWorkbook([{ name: "Sales", columns, rows }], { tzOffsetMs: 3600000 }));
  for (const f of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"]) {
    assert.ok(f in files, "missing " + f);
  }
});

test("text is escaped and can never become a formula", () => {
  const sheet = readZip(buildWorkbook([{ name: "S", columns, rows }]))["xl/worksheets/sheet1.xml"];
  assert.ok(sheet.includes("t=\"inlineStr\""));
  assert.ok(!sheet.includes("<f>"), "no formula cells");
  assert.ok(sheet.includes("Ünï &lt;b&gt;&amp;co&lt;/b&gt;"));
});

test("sheet names are made safe and unique", () => {
  const wb = readZip(buildWorkbook([
    { name: "Bad:name/with*chars?that-is-way-too-long-for-excel", columns, rows: [] },
    { name: "Sales", columns, rows: [] }, { name: "sales", columns, rows: [] },
  ]))["xl/workbook.xml"];
  assert.ok(!/[:*?/\\]/.test(wb.match(/<sheet name="([^"]+)"/)[1]));
  assert.ok(wb.includes('name="sales 2"'));
});

test("CSV guards against formula injection and shifts dates to local time", () => {
  const csv = buildCsv(columns, [{ d: new Date("2026-10-01T23:30:00Z"), n: "=1+1", t: 5 }], { tzOffsetMs: 3600000 });
  assert.ok(csv.startsWith("\uFEFFDate,Name,Total"));
  assert.ok(csv.includes("2026-10-02,'=1+1,5"), csv);
});
