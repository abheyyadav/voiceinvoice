// lib/split.js — Deterministic clause splitter.
// Pure JS. No dependencies. Splits a transcript into purchase clauses.

export function splitIntoClauses(transcript) {
  let t = String(transcript || "").trim();
  if (!t) return [];

  // Normalize whitespace
  t = t.replace(/\s+/g, " ");

  // Sentence terminators and commas/semicolons → separator
  t = t.replace(/\s*(?:,|;|\.\s+|!|\?)\s*/g, " § ");

  // "and also", "also", "and then", "then" → separator
  t = t.replace(/\s+(?:and\s+also|also|and\s+then|then)\s+/gi, " § ");

  // " and " followed by something containing a digit → separator (item boundary)
  t = t.replace(/\s+and\s+(?=[^,;.!?]*\d)/gi, " § ");

  return t
    .split("§")
    .map((s) => s.trim())
    .filter(Boolean);
}

// The first clause often contains the "make invoice for X" instruction.
// We strip that prefix to look at the actual item clause.
export function stripInstructionPrefix(clause) {
  return String(clause || "")
    .replace(/^\s*(?:please\s+)?(?:make|create|generate|prepare|write)\s+(?:an?\s+)?invoice\s+for\s+/i, "")
    .replace(/^\s*(?:please\s+)?invoice\s+for\s+/i, "")
    .replace(/^\s*(?:please\s+)?bill\s+/i, "")
    .trim();
}