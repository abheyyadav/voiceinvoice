// lib/ledger.js — Append invoices to a CSV log.
// No dependencies. Uses fs/promises.

import { readFile, writeFile, appendFile, mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const HEADER = "timestamp,invoice_no,party,items,subtotal,total\n";

async function ensureFile(csvPath) {
  try {
    await stat(csvPath);
  } catch {
    await mkdir(dirname(csvPath), { recursive: true });
    await writeFile(csvPath, HEADER, "utf8");
  }
}

// Count how many rows exist for a given YYYY-MM-DD prefix (ignores header).
// Used for INV-YYYYMMDD-NNN sequencing.
export async function countToday(csvPath, dateISO) {
  await ensureFile(csvPath);
  const raw = await readFile(csvPath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const prefix = dateISO; // timestamp starts with "YYYY-MM-DD"
  let count = 0;
  for (let i = 1; i < lines.length; i++) {
    const firstField = lines[i].split(",")[0];
    if (firstField.startsWith(prefix)) count++;
  }
  return count;
}

// Escape a CSV field per RFC 4180.
function csvField(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function appendInvoice(csvPath, invoice) {
  await ensureFile(csvPath);
  const row = [
    new Date().toISOString(),
    invoice.invoiceNo,
    invoice.party,
    JSON.stringify(invoice.items),
    invoice.subtotal,
    invoice.total,
  ]
    .map(csvField)
    .join(",");
  await appendFile(csvPath, row + "\n", "utf8");
}

export async function readAll(csvPath) {
  await ensureFile(csvPath);
  const raw = await readFile(csvPath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    // Naive CSV parse (we never emit commas outside quotes, so this works).
    const fields = parseCsvLine(line);
    const row = {};
    header.forEach((h, i) => (row[h] = fields[i]));
    try {
      row.items = JSON.parse(row.items);
    } catch {
      /* leave as string */
    }
    return row;
  });
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === ",") {
        out.push(cur);
        cur = "";
      } else if (c === '"') {
        inQuotes = true;
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out;
}

export async function clear(csvPath) {
  await writeFile(csvPath, HEADER, "utf8");
}

export const CSV_PATH = resolve("invoices.csv");