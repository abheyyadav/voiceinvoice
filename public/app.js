// public/app.js — VoiceInvoice client logic. Vanilla ESM. No build step.

// ==================== DOM ====================
const $ = (sel, root = document) => root.querySelector(sel);

const els = {
  // header
  statusDot: $(".status-dot"),
  statusText: $("#status-text"),
  themeToggle: $("#theme-toggle"),

  // upload
  dropzone: $("#dropzone"),
  fileInput: $("#file-input"),
  fileRow: $("#file-row"),
  fileName: $("#file-name"),
  fileMeta: $("#file-meta"),
  removeFile: $("#remove-file"),
  audioPreview: $("#audio-preview"),
  transcribeBtn: $("#transcribe-btn"),

  // log
  log: $("#log"),
  clearLog: $("#clear-log"),

  // review
  reviewPanel: $("#panel-review"),
  invoiceChip: $("#invoice-chip"),
  partyInput: $("#party-input"),
  itemsBody: $("#items-body"),
  addItemBtn: $("#add-item-btn"),
  subtotal: $("#subtotal-val"),
  tax: $("#tax-val"),
  total: $("#total-val"),
  downloadBtn: $("#download-btn"),

  // ledger
  ledgerBody: $("#ledger-body"),
  clearLedger: $("#clear-ledger"),

  // toasts
  toastStack: $("#toast-stack"),
};

// ==================== State ====================
let selectedFile = null;
let currentInvoice = null; // { invoiceNo, issueDate, party, currency, currencySymbol, items: [...] }

// ==================== Theme ====================
const THEME_KEY = "voiceinvoice:theme";

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch {}
  if (saved === "light" || saved === "dark") return applyTheme(saved);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(prefersDark ? "dark" : "light");
}

els.themeToggle.addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme");
  applyTheme(cur === "dark" ? "light" : "dark");
});

initTheme();

// ==================== Status + Log ====================
function setStatus(state, text) {
  els.statusDot.dataset.state = state;
  els.statusText.textContent = text || state;
}

function log(message, cls = "") {
  const li = document.createElement("li");
  li.className = `log-line ${cls}`;
  const now = new Date();
  const time = now.toTimeString().slice(0, 8);
  const t = document.createElement("time");
  t.textContent = time;
  const s = document.createElement("span");
  s.textContent = message;
  li.append(t, s);
  els.log.appendChild(li);
  els.log.scrollTop = els.log.scrollHeight;
}

function clearLog() {
  els.log.innerHTML = "";
}

els.clearLog.addEventListener("click", clearLog);

// ==================== Toasts ====================
function toast(message, type = "info", ttl = 3800) {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  const icon = {
    success: "✓",
    error: "✕",
    info: "i",
  }[type] || "i";
  el.innerHTML = `<strong style="font-weight:700">${icon}</strong><span>${escapeHtml(message)}</span>`;
  els.toastStack.appendChild(el);
  setTimeout(() => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 240);
  }, ttl);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

// ==================== Helpers ====================
function fmtBytes(n) {
  if (!Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtMoney(n, symbol = "Rs.") {
  const v = Number(n) || 0;
  return `${symbol} ${v.toFixed(2)}`;
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// ==================== File selection ====================
function isAudio(file) {
  if (!file) return false;
  if (file.type && file.type.startsWith("audio/")) return true;
  return /\.(mp3|wav|m4a|ogg|webm|flac)$/i.test(file.name || "");
}

function setFile(file) {
  if (!isAudio(file)) {
    toast("That file doesn't look like audio. Try MP3, WAV, M4A, OGG, or WEBM.", "error");
    log(`Rejected: ${file?.name || "unknown file"} (not an audio file)`, "err");
    setStatus("err", "Invalid file");
    return;
  }
  selectedFile = file;

  // Show file row
  els.fileName.textContent = file.name;
  els.fileMeta.textContent = fmtBytes(file.size);
  els.fileRow.hidden = false;

  // Audio preview
  const url = URL.createObjectURL(file);
  els.audioPreview.src = url;
  els.audioPreview.hidden = false;

  // Enable transcribe
  els.transcribeBtn.disabled = false;

  log(`Selected: ${file.name} (${fmtBytes(file.size)})`, "info");
  setStatus("idle", "Ready");
}

function clearFile() {
  if (els.audioPreview.src) URL.revokeObjectURL(els.audioPreview.src);
  selectedFile = null;
  els.fileRow.hidden = true;
  els.audioPreview.hidden = true;
  els.audioPreview.removeAttribute("src");
  els.fileInput.value = "";
  els.transcribeBtn.disabled = true;
  setStatus("idle", "Idle");
}

// Dropzone — click
els.dropzone.addEventListener("click", () => els.fileInput.click());
els.dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    els.fileInput.click();
  }
});

// Dropzone — file input
els.fileInput.addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if (f) setFile(f);
});

// Dropzone — drag & drop
["dragenter", "dragover"].forEach((evt) =>
  els.dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    els.dropzone.classList.add("drag");
  })
);
["dragleave", "drop"].forEach((evt) =>
  els.dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (evt === "dragleave" && e.relatedTarget && els.dropzone.contains(e.relatedTarget)) return;
    els.dropzone.classList.remove("drag");
  })
);
els.dropzone.addEventListener("drop", (e) => {
  const f = e.dataTransfer?.files?.[0];
  if (f) setFile(f);
});

// Remove file
els.removeFile.addEventListener("click", () => {
  clearFile();
  log("File removed.", "dim");
});

// ==================== Transcribe ====================
els.transcribeBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  els.transcribeBtn.disabled = true;
  els.transcribeBtn.classList.add("busy");
  els.transcribeBtn.querySelector(".btn-label").textContent = "Working…";
  setStatus("busy", "Transcribing");
  log("Uploading audio to local pipeline…", "info");

  const fd = new FormData();
  fd.append("audio", selectedFile, selectedFile.name);

  const t0 = performance.now();

  try {
    const res = await fetch("/api/process-audio", { method: "POST", body: fd });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      const msg = data?.error || `HTTP ${res.status}`;
      throw new Error(msg);
    }

    const dt = ((performance.now() - t0) / 1000).toFixed(1);
    log(`Transcribed in ${dt}s.`, "ok");
    log(`Transcript: "${data.transcript}"`, "dim");

    const itemCount = data.invoice.items.length;
    log(`Extracted ${itemCount} item${itemCount === 1 ? "" : "s"} · ${data.invoice.currencySymbol}${data.invoice.total}`, "ok");

    currentInvoice = data.invoice;
    renderReview(currentInvoice);

    setStatus("ok", "Ready to review");
    toast("Invoice extracted. Review and download.", "success");
  } catch (err) {
    log(`Error: ${err.message}`, "err");
    setStatus("err", "Failed");
    toast(err.message, "error", 5000);
  } finally {
    els.transcribeBtn.disabled = false;
    els.transcribeBtn.classList.remove("busy");
    els.transcribeBtn.querySelector(".btn-label").textContent = "Transcribe & extract";
  }
});

// ==================== Review rendering ====================
function renderReview(inv) {
  els.reviewPanel.hidden = false;
  els.invoiceChip.hidden = false;
  els.invoiceChip.textContent = inv.invoiceNo;

  els.partyInput.value = inv.party || "";

  // Build items table
  els.itemsBody.innerHTML = "";
  inv.items.forEach((it, idx) => addItemRow(it, idx));

  recomputeTotals();

  // Smooth scroll into view
  els.reviewPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function addItemRow(item = {}, index = null) {
  const tr = document.createElement("tr");
  const idx = index ?? els.itemsBody.children.length;

  tr.innerHTML = `
    <td class="idx">${idx + 1}</td>
    <td><input type="text" data-field="product" placeholder="Product" value="${escapeHtml(item.product || "")}" /></td>
    <td><input type="number" class="num" data-field="quantity" min="0" step="any" value="${item.quantity ?? 1}" /></td>
    <td><input type="text" data-field="unit" placeholder="—" value="${escapeHtml(item.unit || "")}" /></td>
    <td><input type="number" class="num" data-field="unitPrice" min="0" step="any" value="${item.unitPrice ?? 0}" /></td>
    <td class="num" data-cell="lineTotal">0.00</td>
    <td class="act"><button class="row-remove" aria-label="Remove row" title="Remove">✕</button></td>
  `;

  els.itemsBody.appendChild(tr);

  // Wire inputs
  tr.querySelectorAll("input").forEach((inp) => {
    inp.addEventListener("input", recomputeTotals);
  });
  tr.querySelector(".row-remove").addEventListener("click", () => {
    tr.remove();
    reindexRows();
    recomputeTotals();
  });
}

function reindexRows() {
  Array.from(els.itemsBody.children).forEach((tr, i) => {
    tr.querySelector("td.idx").textContent = i + 1;
  });
}

els.addItemBtn.addEventListener("click", () => {
  addItemRow({ product: "", quantity: 1, unit: "", unitPrice: 0 });
  recomputeTotals();
});

function readItemsFromTable() {
  return Array.from(els.itemsBody.children).map((tr) => {
    const get = (f) => tr.querySelector(`[data-field="${f}"]`)?.value ?? "";
    return {
      product: get("product").trim(),
      quantity: parseFloat(get("quantity")) || 0,
      unit: get("unit").trim() || null,
      unitPrice: parseFloat(get("unitPrice")) || 0,
    };
  });
}

function recomputeTotals() {
  const items = readItemsFromTable();
  const symbol = currentInvoice?.currencySymbol || "Rs.";

  let subtotal = 0;
  Array.from(els.itemsBody.children).forEach((tr, i) => {
    const q = items[i].quantity || 0;
    const p = items[i].unitPrice || 0;
    const line = round2(q * p);
    subtotal = round2(subtotal + line);
    tr.querySelector('[data-cell="lineTotal"]').textContent = line.toFixed(2);
  });

  const tax = 0;
  const total = round2(subtotal + tax);

  els.subtotal.textContent = fmtMoney(subtotal, symbol);
  els.tax.textContent = fmtMoney(tax, symbol);
  els.total.textContent = fmtMoney(total, symbol);
}

// Keep party input in sync (in case user edits before download)
els.partyInput.addEventListener("input", () => {
  if (currentInvoice) currentInvoice.party = els.partyInput.value;
});

// ==================== Download PDF ====================
els.downloadBtn.addEventListener("click", async () => {
  if (!currentInvoice) return;

  els.downloadBtn.disabled = true;
  els.downloadBtn.classList.add("busy");
  setStatus("busy", "Generating PDF");
  log("Generating PDF…", "info");

  // Send client-edited version
  const payload = {
    party: els.partyInput.value.trim() || currentInvoice.party || "—",
    currency: currentInvoice.currency || "INR",
    issueDate: currentInvoice.issueDate,
    items: readItemsFromTable().filter((it) => it.product && it.unitPrice > 0),
  };

  try {
    const res = await fetch("/api/generate-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {}
      throw new Error(msg);
    }

    const blob = await res.blob();
    const invoiceNo = res.headers.get("X-Invoice-No") || currentInvoice.invoiceNo || "invoice";

    // Trigger download
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const partySlug = payload.party
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "invoice";
    a.download = `invoice-${partySlug}-${payload.issueDate}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    log(`PDF downloaded (${fmtBytes(blob.size)}) · ${invoiceNo}`, "ok");
    setStatus("ok", "PDF ready");
    toast(`PDF downloaded — ${invoiceNo}`, "success");

    await refreshLedger();
  } catch (err) {
    log(`Error: ${err.message}`, "err");
    setStatus("err", "Failed");
    toast(err.message, "error", 5000);
  } finally {
    els.downloadBtn.disabled = false;
    els.downloadBtn.classList.remove("busy");
  }
});

// ==================== Ledger ====================
async function refreshLedger() {
  try {
    const res = await fetch("/api/invoices");
    const data = await res.json();
    renderLedger(data.invoices || []);
  } catch (err) {
    // Silent — ledger is a nice-to-have
    console.error(err);
  }
}

function renderLedger(rows) {
  if (!rows.length) {
    els.ledgerBody.innerHTML = `<tr><td colspan="4" class="empty">No invoices yet. Upload a voice memo to get started.</td></tr>`;
    return;
  }

  // Show newest first
  const sorted = [...rows].reverse();
  els.ledgerBody.innerHTML = "";
  for (const row of sorted) {
    const tr = document.createElement("tr");
    const ts = String(row.timestamp || "").replace("T", " ").slice(0, 19);
    tr.innerHTML = `
      <td class="mono">${escapeHtml(ts)}</td>
      <td class="mono">${escapeHtml(row.invoice_no || "")}</td>
      <td>${escapeHtml(row.party || "")}</td>
      <td class="amount">Rs. ${Number(row.total || 0).toFixed(2)}</td>
    `;
    els.ledgerBody.appendChild(tr);
  }
}

els.clearLedger.addEventListener("click", async () => {
  if (!confirm("Clear all invoice history? This cannot be undone.")) return;
  try {
    const res = await fetch("/api/clear", { method: "POST" });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Failed");
    log("Ledger cleared.", "warn");
    toast("Ledger cleared", "info");
    await refreshLedger();
  } catch (err) {
    log(`Error: ${err.message}`, "err");
    toast(err.message, "error");
  }
});

// ==================== Boot ====================
log("Ready. Drop an audio file to begin.", "dim");
setStatus("idle", "Idle");
refreshLedger();