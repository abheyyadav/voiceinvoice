// scripts/test-extract.js — M1 acceptance test.
// All 5 example sentences from PRD §9.2 must extract correctly.

import { extractInvoice } from "../lib/extract.js";
import { buildInvoice } from "../lib/invoice.js";

const CASES = [
  {
    transcript:
      "Make invoice for Abhey Yadav. He bought 1 kg potato at 100, 2 kg onion at 200, and 1 kg tomato at 50.",
    expect: {
      party: "Abhey Yadav",
      items: [
        { product: "potato", quantity: 1, unit: "kg", unitPrice: 100 },
        { product: "onion", quantity: 2, unit: "kg", unitPrice: 200 },
        { product: "tomato", quantity: 1, unit: "kg", unitPrice: 50 },
      ],
      subtotal: 550,
    },
  },
  {
    transcript: "Invoice for Priya Sharma. Two notebooks at 50, one pen at 10.",
    expect: {
      party: "Priya Sharma",
      items: [
        { product: "notebooks", quantity: 2, unit: null, unitPrice: 50 },
        { product: "pen", quantity: 1, unit: null, unitPrice: 10 },
      ],
      subtotal: 110,
    },
  },
  {
    transcript: "Bill Rajesh. 5 kg rice at 80 and 2 litres oil at 250.",
    expect: {
      party: "Rajesh",
      items: [
        { product: "rice", quantity: 5, unit: "kg", unitPrice: 80 },
        { product: "oil", quantity: 2, unit: "L", unitPrice: 250 },
      ],
      subtotal: 900,
    },
  },
  {
    transcript: "Sold 3 boxes of tea at 500 each to Mrs. Kapoor.",
    expect: {
      party: "Mrs. Kapoor",
      items: [{ product: "tea", quantity: 3, unit: "box", unitPrice: 500 }],
      subtotal: 1500,
    },
  },
  {
    transcript: "Create invoice for Suresh for 10 kg flour at 40.",
    expect: {
      party: "Suresh",
      items: [{ product: "flour", quantity: 10, unit: "kg", unitPrice: 40 }],
      subtotal: 400,
    },
  },
];

let passed = 0;
let failed = 0;

for (let i = 0; i < CASES.length; i++) {
  const { transcript, expect } = CASES[i];
  console.log(`\n--- Case ${i + 1} ---`);
  console.log(`Transcript: ${transcript}`);

  const extracted = extractInvoice(transcript);
  const invoice = buildInvoice(extracted, { seqToday: i + 1 });

  const partyOk = invoice.party === expect.party;
  const itemsOk =
    invoice.items.length === expect.items.length &&
    invoice.items.every((it, idx) => {
      const exp = expect.items[idx];
      return (
        it.product.toLowerCase() === exp.product.toLowerCase() &&
        it.quantity === exp.quantity &&
        (it.unit || null) === (exp.unit || null) &&
        it.unitPrice === exp.unitPrice
      );
    });
  const totalOk = invoice.subtotal === expect.subtotal;

  console.log(`  Party:    ${invoice.party}  ${partyOk ? "✅" : "❌ expected " + expect.party}`);
  console.log(`  Items:`);
  for (const it of invoice.items) {
    console.log(`    - ${it.product} ${it.quantity} ${it.unit || ""} × ${it.unitPrice} = ${it.lineTotal}`);
  }
  console.log(`  Subtotal: ${invoice.subtotal}  ${totalOk ? "✅" : "❌ expected " + expect.subtotal}`);

  if (partyOk && itemsOk && totalOk) passed++;
  else failed++;
}

console.log(`\n==========`);
console.log(`Passed: ${passed}/${CASES.length}`);
console.log(`Failed: ${failed}/${CASES.length}`);
process.exit(failed > 0 ? 1 : 0);