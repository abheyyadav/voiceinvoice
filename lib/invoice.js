// lib/invoice.js — Compute totals, assemble the invoice object.
// Pure JS. The LLM never does arithmetic (PRD NFR-9, §9.4 invariants).

const CURRENCY_CONFIG = {
  INR: { symbol: "Rs." },
  USD: { symbol: "$" },
  EUR: { symbol: "EUR " },
  GBP: { symbol: "GBP " },
};

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function makeInvoiceNo(dateISO, seqToday) {
  const compact = dateISO.replace(/-/g, "");
  const seq = String(seqToday).padStart(3, "0");
  return `INV-${compact}-${seq}`;
}

// Build a complete invoice object from { party, items }.
// `seqToday` is 1-based (1st invoice today → 001).
export function buildInvoice(
  { party, items },
  { currency = "INR", seqToday = 1, issueDate = todayISO() } = {}
) {
  const cfg = CURRENCY_CONFIG[currency] || CURRENCY_CONFIG.INR;

  const cleanItems = (items || [])
    .filter((it) => it && it.product && Number.isFinite(it.quantity) && Number.isFinite(it.unitPrice))
    .map((it) => {
      const quantity = Number(it.quantity);
      const unitPrice = Number(it.unitPrice);
      const lineTotal = round2(quantity * unitPrice);
      return {
        product: String(it.product).trim(),
        quantity,
        unit: it.unit || null,
        unitPrice,
        lineTotal,
      };
    });

  const subtotal = round2(cleanItems.reduce((sum, it) => sum + it.lineTotal, 0));
  const tax = 0;
  const total = round2(subtotal + tax);

  return {
    invoiceNo: makeInvoiceNo(issueDate, seqToday),
    issueDate,
    party: party || "—",
    currency,
    currencySymbol: cfg.symbol,
    items: cleanItems,
    subtotal,
    tax,
    total,
  };
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}