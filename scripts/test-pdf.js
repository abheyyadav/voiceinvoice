// scripts/test-pdf.js — Smoke test for the hand-rolled PDF writer.
import { writeFileSync } from "node:fs";
import { renderInvoicePdf } from "../lib/pdf.js";

const sample = {
  invoiceNo: "INV-20260925-001",
  issueDate: "2026-09-25",
  party: "Abhey Yadav",
  currency: "INR",
  currencySymbol: "Rs.",
  items: [
    { product: "potato", quantity: 1, unit: "kg", unitPrice: 100, lineTotal: 100 },
    { product: "onion",  quantity: 2, unit: "kg", unitPrice: 200, lineTotal: 400 },
    { product: "tomato", quantity: 1, unit: "kg", unitPrice: 50,  lineTotal: 50 },
  ],
  subtotal: 550,
  tax: 0,
  total: 550,
};

const buf = renderInvoicePdf(sample);
writeFileSync("test.pdf", buf);
console.log(`✅ Wrote test.pdf (${buf.length} bytes)`);