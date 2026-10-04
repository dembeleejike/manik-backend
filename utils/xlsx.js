// A small, dependency-free Excel (.xlsx) writer. An .xlsx file is just a ZIP of
// XML files, so this builds the ZIP by hand (no compression needed). It is used
// on the server for exports/backups and, as an identical copy, in the admin app
// for "export what I'm looking at". Uses only TextEncoder + Uint8Array so it
// works in both Node and the browser.
//
//   buildWorkbook([{ name: "Sales", columns: [{ label, get(row), type }], rows }])
//   -> Uint8Array
//
// column.type: "text" (default) | "number" | "money" | "date"

const enc = new TextEncoder();

/* ---------- ZIP (store only) ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const chunks = [];
  const central = [];
  let offset = 0;
  const push = (u8) => { chunks.push(u8); offset += u8.length; };

  for (const f of files) {
    const name = enc.encode(f.name);
    const data = f.data;
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 file names
    local.setUint16(8, 0, true); // method: stored
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, 0, true);
    entry.setUint16(12, dosTime, true);
    entry.setUint16(14, dosDate, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), name);

    push(new Uint8Array(local.buffer));
    push(name);
    push(data);
  }

  const centralStart = offset;
  for (const c of central) push(c);
  const centralSize = offset - centralStart;

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, centralStart, true);
  push(new Uint8Array(end.buffer));

  const out = new Uint8Array(offset);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out;
}

/* ---------- XML helpers ---------- */
// Removes characters XML cannot contain, then escapes the rest.
function xmlEscape(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colLetter(index) {
  let n = index + 1, s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Excel stores dates as days since 1899-12-30.
function excelSerial(date, tzOffsetMs) {
  return (date.getTime() + tzOffsetMs) / 86400000 + 25569;
}

function safeSheetName(name, used) {
  let base = String(name).replace(/[\[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";
  let candidate = base, i = 2;
  while (used.has(candidate.toLowerCase())) candidate = base.slice(0, 28) + " " + i++;
  used.add(candidate.toLowerCase());
  return candidate;
}

// style ids (see STYLES_XML): 0 normal, 1 header, 2 date, 3 money, 4 number
const STYLE = { text: 0, header: 1, date: 2, money: 3, number: 4 };

function cellXml(ref, value, type, tz) {
  if (value === null || value === undefined || value === "") return "";
  if (type === "date") {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    return `<c r="${ref}" s="${STYLE.date}"><v>${excelSerial(d, tz)}</v></c>`;
  }
  if (type === "money" || type === "number") {
    const n = Number(value);
    if (Number.isFinite(n)) return `<c r="${ref}" s="${STYLE[type]}"><v>${n}</v></c>`;
  }
  // Text is written as an inline string, so a value like "=SUM(A1)" is plain
  // text in Excel and can never run as a formula.
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function sheetXml(columns, rows, tz) {
  const widths = columns.map((c) => Math.max(10, Math.min(45, String(c.label).length + 4)));
  const body = [];
  const sample = rows.slice(0, 200);

  const header = columns
    .map((c, i) => `<c r="${colLetter(i)}1" s="${STYLE.header}" t="inlineStr"><is><t>${xmlEscape(c.label)}</t></is></c>`)
    .join("");
  body.push(`<row r="1">${header}</row>`);

  rows.forEach((row, r) => {
    const cells = columns
      .map((c, i) => {
        const value = c.get(row);
        if (r < sample.length && value != null) {
          const len = c.type === "date" ? 13 : String(value).length + 2;
          if (len > widths[i]) widths[i] = Math.min(45, len);
        }
        return cellXml(`${colLetter(i)}${r + 2}`, value, c.type || "text", tz);
      })
      .join("");
    body.push(`<row r="${r + 2}">${cells}</row>`);
  });

  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const lastRef = `${colLetter(Math.max(columns.length - 1, 0))}${rows.length + 1}`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${cols}</cols><sheetData>${body.join("")}</sheetData>` +
    `<autoFilter ref="A1:${lastRef}"/></worksheet>`
  );
}

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="dd\\ mmm\\ yyyy"/></numFmts>` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFE4DFD3"/><bgColor indexed="64"/></patternFill></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="5">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

// opts.tzOffsetMs: shift dates to the business's local time (Lagos = +1h = 3600000)
// so a late-evening sale lands on the right calendar day.
function buildWorkbook(sheets, opts = {}) {
  const tz = opts.tzOffsetMs || 0;
  const used = new Set();
  const list = sheets.length ? sheets : [{ name: "Sheet1", columns: [{ label: "Empty", get: () => "" }], rows: [] }];
  const named = list.map((s) => ({ ...s, safeName: safeSheetName(s.name, used) }));

  const files = [
    {
      name: "[Content_Types].xml",
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
          named.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
          `</Types>`
      ),
    },
    {
      name: "_rels/.rels",
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
      ),
    },
    {
      name: "xl/workbook.xml",
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
          named.map((s, i) => `<sheet name="${xmlEscape(s.safeName)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
          `</sheets></workbook>`
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          named.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
          `<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
      ),
    },
    { name: "xl/styles.xml", data: enc.encode(STYLES_XML) },
    ...named.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml(s.columns, s.rows, tz)) })),
  ];

  return zipStore(files);
}

// CSV with a formula-injection guard (a text cell starting with = + - @ would
// otherwise run as a formula when opened in Excel). Includes a UTF-8 BOM so
// Excel shows names with accents correctly.
function buildCsv(columns, rows, opts = {}) {
  const tz = opts.tzOffsetMs || 0;
  const esc = (value, type) => {
    if (value === null || value === undefined) return "";
    let s = String(value);
    if (type === "date") {
      const d = value instanceof Date ? value : new Date(value);
      s = isNaN(d.getTime()) ? "" : new Date(d.getTime() + tz).toISOString().slice(0, 10);
    }
    if ((type || "text") === "text" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    s = s.replace(/"/g, '""');
    return /[",\n\r]/.test(s) ? `"${s}"` : s;
  };
  const header = columns.map((c) => esc(c.label, "text")).join(",");
  const lines = rows.map((r) => columns.map((c) => esc(c.get(r), c.type)).join(","));
  return "\uFEFF" + [header, ...lines].join("\r\n");
}

module.exports = { buildWorkbook, buildCsv, crc32 };
