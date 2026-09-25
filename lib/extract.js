// lib/extract.js — Party name + line item extraction.
// Strategy (per PRD §18): regex first, LLM fallback.
// For M1 we ship a deterministic parser. The LLM fallback is wired in M2.

import { splitIntoClauses, stripInstructionPrefix } from "./split.js";

// ---------- Party name extraction (regex-only for M1) ----------
// A "name token" = a capitalized word, optionally ending in a period (initial),
// no interior digits. Built with RegExp constructor so we can compose.
// Examples handled: "Abhey Yadav", "Priya Sharma", "Mrs. Kapoor", "Suresh".

const NAME_TOKEN = `[A-Z][A-Za-z'-]*\\.?`;
const NAME_TAIL = `(?:\\s+(?:${NAME_TOKEN}))*`;
// Stop-words that end a name when they appear at a word boundary.
const STOP_WORDS = /\s+(?:He|She|They|I|For|And|At|Bought|Purchased|Sold|With|Who|The|Invoice|Bill|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve|Fifteen|Twenty|Thirty|Forty|Fifty|Hundred|Half|Quarter|Dozen)\b/i;

const PARTY_PATTERNS = [
  // "make/create/generate/prepare/write [an] invoice for <Name>"
  new RegExp(
    `(?:make|create|generate|prepare|write)\\s+(?:an?\\s+)?invoice\\s+for\\s+(${NAME_TOKEN}${NAME_TAIL})`,
    "i"
  ),
  // "invoice for <Name>"
  new RegExp(`invoice\\s+for\\s+(${NAME_TOKEN}${NAME_TAIL})`, "i"),
  // "bill [to] <Name>"
  new RegExp(`bill\\s+(?:to\\s+)?(${NAME_TOKEN}${NAME_TAIL})`, "i"),
  // "<Name> bought/purchased/ordered"
  new RegExp(`(${NAME_TOKEN}${NAME_TAIL})\\s+(?:bought|purchased|ordered)`, "i"),
  // "sold ... to <Name>"
  new RegExp(`(?:sold|sell)\\b.*?\\bto\\s+(${NAME_TOKEN}${NAME_TAIL})`, "i"),
];

export function extractParty(transcript) {
  const t = String(transcript || "").trim();
  if (!t) return null;

  for (const re of PARTY_PATTERNS) {
    const m = t.match(re);
    if (!m || !m[1]) continue;

    let name = m[1];

    // Cut off at the first stop-word phrase start (keeps "Abhey Yadav" out of
    // "Abhey Yadav He bought..." and "Priya Sharma Two notebooks...").
    const stopMatch = name.match(STOP_WORDS);
    if (stopMatch && stopMatch.index > 0) {
      name = name.slice(0, stopMatch.index);
    }

    // Strip trailing punctuation, collapse whitespace.
    name = name
      .replace(/[.,;:!?]+$/, "")
      .replace(/\s+/g, " ")
      .trim();

    if (name.length < 2) continue;
    if (/^(invoice|the|a|an|he|she|they|i|bill)$/i.test(name)) continue;

    return name;
  }
  return null;
}

// ---------- Word-number map ----------

const WORD_NUMBERS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, hundred: 100,
  half: 0.5, quarter: 0.25, dozen: 12,
};

const UNIT_ALIASES = {
  kg: "kg", kgs: "kg", kilogram: "kg", kilograms: "kg", kilo: "kg", kilos: "kg",
  g: "g", gm: "g", gms: "g", gram: "g", grams: "g",
  l: "L", lt: "L", ltr: "L", litre: "L", litres: "L", liter: "L", liters: "L",
  ml: "ml", milliliter: "ml", milliliters: "ml",
  pc: "pc", pcs: "pc", piece: "pc", pieces: "pc",
  box: "box", boxes: "box",
  packet: "packet", packets: "packet",
  bottle: "bottle", bottles: "bottle",
  dozen: "dozen", doz: "dozen",
  unit: "unit", units: "unit",
};

function parseNumberToken(tok) {
  if (tok == null) return null;
  const s = String(tok).toLowerCase().trim();
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  if (WORD_NUMBERS[s] != null) return WORD_NUMBERS[s];
  return null;
}

// ---------- Line item parser (deterministic) ----------

// Matches patterns like:
//   "1 kg potato at 100"
//   "2 kg onion at 200"
//   "5 kg rice at 80"
//   "3 boxes of tea at 500 each"
//   "10 kg flour at 40"
//   "two notebooks at 50"
//   "one pen at 10"
//   "2 litres oil at 250"
//   "half a kilo potato at 100"
function parseLineItem(clause) {
  const raw = String(clause || "").trim();
  if (!raw) return null;

  // NEW: strip a leading "<Name> for " — e.g. "Suresh for 10 kg flour at 40".
  // Only fires when the rest of the clause contains a digit (so we don't
  // accidentally match normal prose).
  // Strip the "create/make invoice for " prefix first.
  let s = stripInstructionPrefix(raw);

  // Then strip any remaining leading "<Name> for " — e.g. after the prefix
  // we may be left with "Suresh for 10 kg flour at 40".
  s = s.replace(
    /^([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*)*)\s+for\s+(?=.*\d)/,
    ""
  );
  // Strip a leading pronoun if any: "He bought ..." / "She purchased ..."
  s = s.replace(/^(?:he|she|they|i)\s+(?:bought|purchased|ordered|got)\s+/i, "");
  // Strip leading "bought"/"purchased"
  s = s.replace(/^(?:bought|purchased|ordered|got|sold)\s+/i, "");
  // Drop trailing "each" and everything after.
  s = s.replace(/\s+each\b.*$/i, "").trim();

  let quantity = 1;
  let unit = null;
  let product = null;

  // Pattern A: <number> <unit> [of] <product> at <price>
  let m = s.match(
    /^(\d+(?:\.\d+)?|half|quarter|dozen|\w+)\s+([a-zA-Z]+)\s+(?:of\s+)?([a-zA-Z][a-zA-Z0-9 ]*?)\s+at\s+(\d+(?:\.\d+)?)/i
  );
  if (m) {
    quantity = parseNumberToken(m[1]);
    const unitRaw = m[2].toLowerCase();
    unit = UNIT_ALIASES[unitRaw] || null;
    product = m[3].trim();
    const price = parseFloat(m[4]);
    if (quantity == null) quantity = 1;
    return { product, quantity, unit, unitPrice: price };
  }

  // Pattern B: "half a kilo potato at 100"
  m = s.match(
    /^(half|quarter)\s+a\s+([a-zA-Z]+)\s+([a-zA-Z][a-zA-Z0-9 ]*?)\s+at\s+(\d+(?:\.\d+)?)/i
  );
  if (m) {
    quantity = WORD_NUMBERS[m[1].toLowerCase()] || 0.5;
    const unitRaw = m[2].toLowerCase();
    unit = UNIT_ALIASES[unitRaw] || null;
    product = m[3].trim();
    return { product, quantity, unit, unitPrice: parseFloat(m[4]) };
  }

  // Pattern C: "<number> <product> at <price>" (no unit)
  m = s.match(
    /^(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen)\s+([a-zA-Z][a-zA-Z0-9 ]*?)\s+at\s+(\d+(?:\.\d+)?)/i
  );
  if (m) {
    quantity = parseNumberToken(m[1]);
    product = m[2].trim();
    return { product, quantity, unit: null, unitPrice: parseFloat(m[3]) };
  }

  return null;
}

// ---------- Full extraction ----------

export function extractInvoice(transcript) {
  const text = String(transcript || "").trim();
  if (!text) return { party: null, items: [] };

  const party = extractParty(text);
  const clauses = splitIntoClauses(text);

  const items = [];
  for (const clause of clauses) {
    const item = parseLineItem(clause);
    if (item && item.product && item.unitPrice != null) {
      // Post-filter: item must share a token with the original transcript (§15 mitigation)
      const tokens = item.product.toLowerCase().split(/\s+/);
      const transcriptLower = text.toLowerCase();
      const sharesToken = tokens.some((tok) => tok.length > 2 && transcriptLower.includes(tok));
      if (sharesToken) items.push(item);
    }
  }

  return { party, items };
}