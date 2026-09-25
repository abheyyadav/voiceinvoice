// server.js — VoiceInvoice web server.
// Zero framework dependencies. Node built-in http.

import { createServer } from "node:http";
import { readFile, writeFile, mkdir, unlink, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, extname, join } from "node:path";
import { randomUUID } from "node:crypto";

import { transcribeAudio } from "./lib/speech.js";
import { extractInvoice } from "./lib/extract.js";
import { buildInvoice } from "./lib/invoice.js";
import { renderInvoicePdf } from "./lib/pdf.js";
import { appendInvoice, countToday, readAll, clear, CSV_PATH } from "./lib/ledger.js";

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = resolve("public");
const TMP_DIR = resolve(".tmp");
const MAX_UPLOAD = 50 * 1024 * 1024; // 50 MB

await mkdir(TMP_DIR, { recursive: true });

// ---------- Helpers ----------

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

async function readBody(req, limit = MAX_UPLOAD) {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        rejectPromise(Object.assign(new Error("Upload too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolvePromise(Buffer.concat(chunks)));
    req.on("error", rejectPromise);
  });
}

// Parse multipart/form-data. Returns { files: { fieldName: {filename, data} }, fields: {} }
// Minimal but correct for our one-file-per-request case.
function parseMultipart(buf, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let pos = 0;

  while (true) {
    const start = buf.indexOf(delimiter, pos);
    if (start === -1) break;
    const after = start + delimiter.length;

    // End of stream?
    if (buf.slice(after, after + 2).toString() === "--") break;

    // Skip CRLF after delimiter
    const headerStart = after + 2;
    const headerEnd = buf.indexOf("\r\n\r\n", headerStart);
    if (headerEnd === -1) break;

    const headerText = buf.slice(headerStart, headerEnd).toString("utf8");
    const bodyStart = headerEnd + 4;
    const nextDelim = buf.indexOf(delimiter, bodyStart);
    if (nextDelim === -1) break;

    // Body ends 2 bytes (CRLF) before next delimiter
    const bodyEnd = nextDelim - 2;
    const data = buf.slice(bodyStart, bodyEnd);

    // Parse headers
    const headers = {};
    for (const line of headerText.split("\r\n")) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
    }

    const cd = headers["content-disposition"] || "";
    const nameMatch = cd.match(/name="([^"]+)"/);
    const filenameMatch = cd.match(/filename="([^"]*)"/);
    parts.push({
      field: nameMatch ? nameMatch[1] : null,
      filename: filenameMatch ? filenameMatch[1] : null,
      headers,
      data,
    });

    pos = nextDelim;
  }

  const files = {};
  const fields = {};
  for (const p of parts) {
    if (p.filename) files[p.field] = { filename: p.filename, data: p.data, headers: p.headers };
    else if (p.field) fields[p.field] = p.data.toString("utf8");
  }
  return { files, fields };
}

function guessExt(filename) {
  const m = String(filename || "").toLowerCase().match(/\.(mp3|wav|m4a|ogg|webm|flac)$/);
  return m ? `.${m[1]}` : ".bin";
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------- Static file serving ----------

async function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";

  // Prevent path traversal
  const safeRel = rel.replace(/\.\.+/g, "").replace(/^\/+/, "");
  const filePath = join(PUBLIC_DIR, safeRel);

  if (!existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }

  const s = await stat(filePath);
  if (!s.isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }

  const data = await readFile(filePath);
  const type = MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Content-Length": data.length });
  res.end(data);
}

// ---------- API handlers ----------

async function handleProcessAudio(req, res) {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
  if (!boundaryMatch) return sendError(res, 400, "Expected multipart/form-data.");

  const boundary = boundaryMatch[1] || boundaryMatch[2];
  let raw;
  try {
    raw = await readBody(req);
  } catch (err) {
    if (err.status === 413) return sendError(res, 413, "Upload too large (max 50 MB)");
    throw err;
  }

  const { files } = parseMultipart(raw, boundary);
  const audio = files.audio;
  if (!audio) return sendError(res, 400, "No audio field in request.");

  const tmpName = `upload-${randomUUID()}${guessExt(audio.filename)}`;
  const tmpPath = join(TMP_DIR, tmpName);
  await writeFile(tmpPath, audio.data);

  const t0 = Date.now();
  let transcript = "";
  try {
    transcript = await transcribeAudio(tmpPath);
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    console.error("[process-audio] transcribe failed:", err);
    return sendError(res, 500, `Transcription failed: ${err.message}`);
  }
  await unlink(tmpPath).catch(() => {});

  if (!transcript) {
    return sendError(res, 422, "Could not understand any speech in the audio.");
  }

  let extracted;
  try {
    extracted = extractInvoice(transcript);
  } catch (err) {
    return sendError(res, 500, `Extraction failed: ${err.message}`);
  }

  if (!extracted.party && extracted.items.length === 0) {
    return sendError(res, 422, "Could not find a party name or any items in the transcript.");
  }

  const dateISO = todayISO();
  const seqToday = (await countToday(CSV_PATH, dateISO)) + 1;
  const invoice = buildInvoice(extracted, { seqToday, issueDate: dateISO });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  sendJson(res, 200, { ok: true, transcript, invoice, elapsed });
}

async function handleGeneratePdf(req, res) {
  let body;
  try {
    body = await readBody(req, 5 * 1024 * 1024);
  } catch {
    return sendError(res, 413, "Body too large");
  }

  let invoice;
  try {
    invoice = JSON.parse(body.toString("utf8"));
  } catch {
    return sendError(res, 400, "Invalid JSON body.");
  }

  if (!invoice || typeof invoice !== "object" || !Array.isArray(invoice.items)) {
    return sendError(res, 400, "Invalid invoice object.");
  }

  // Recompute totals server-side. Never trust the client for money math.
  const dateISO = invoice.issueDate || todayISO();
  const seqToday = (await countToday(CSV_PATH, dateISO)) + 1;
  const safeInvoice = buildInvoice(
    { party: invoice.party, items: invoice.items },
    { currency: invoice.currency || "INR", seqToday, issueDate: dateISO }
  );

  let pdf;
  try {
    pdf = renderInvoicePdf(safeInvoice);
  } catch (err) {
    return sendError(res, 500, `PDF generation failed: ${err.message}`);
  }

  await appendInvoice(CSV_PATH, safeInvoice);

  res.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Length": pdf.length,
    "X-Invoice-No": safeInvoice.invoiceNo,
    "Content-Disposition": `attachment; filename="${safeInvoice.invoiceNo}.pdf"`,
  });
  res.end(pdf);
}

async function handleGetInvoices(req, res) {
  try {
    const rows = await readAll(CSV_PATH);
    sendJson(res, 200, { ok: true, invoices: rows });
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

async function handleClear(req, res) {
  try {
    await clear(CSV_PATH);
    sendJson(res, 200, { ok: true });
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

// ---------- Router ----------

const server = createServer(async (req, res) => {
  try {
    const { method, url } = req;
    const path = url.split("?")[0];

    // CORS for local dev convenience
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    if (method === "POST" && path === "/api/process-audio") return handleProcessAudio(req, res);
    if (method === "POST" && path === "/api/generate-pdf") return handleGeneratePdf(req, res);
    if (method === "GET" && path === "/api/invoices") return handleGetInvoices(req, res);
    if (method === "POST" && path === "/api/clear") return handleClear(req, res);

    if (method === "GET") return serveStatic(req, res);

    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method not allowed");
  } catch (err) {
    console.error("[server] unhandled:", err);
    if (!res.headersSent) sendError(res, 500, err.message || "Internal error");
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`VoiceInvoice → http://localhost:${PORT}`);
  console.log(`Models are cached in ~/.qvac/models — no network needed after first run.`);
});