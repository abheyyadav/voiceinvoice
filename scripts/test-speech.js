// scripts/test-speech.js — M2 acceptance test.
// Usage: node scripts/test-speech.js samples/test-invoice.mp3

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { transcribeAudio } from "../lib/speech.js";

const audioPath = process.argv[2];

if (!audioPath) {
  console.error("Usage: node scripts/test-speech.js <path-to-audio-file>");
  process.exit(1);
}

const abs = resolve(audioPath);
if (!existsSync(abs)) {
  console.error(`File not found: ${abs}`);
  process.exit(1);
}

console.log(`Audio: ${abs}`);
console.log("Loading Whisper model on-device... (first run downloads ~43 MB)");
const t0 = Date.now();

try {
  const text = await transcribeAudio(abs);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\nElapsed: ${secs}s`);
  console.log(`\nTranscript:\n"${text}"`);

  if (!text) {
    console.log("\n⚠️  Empty transcript — Whisper returned no text.");
    process.exit(2);
  }
  console.log("\n✅ Transcription succeeded.");
} catch (err) {
  console.error("\n❌ Transcription failed:", err.message);
  process.exit(3);
}