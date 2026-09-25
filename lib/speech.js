// lib/speech.js — QVAC Whisper wrapper.
// Loads the tiny.en model, transcribes one audio file, unloads.
// Pattern from PRD §9.1 (same as InvoiceLedger).

import {
  loadModel,
  transcribe,
  unloadModel,
  WHISPER_EN_TINY_Q8_0,
  MODEL_TYPES,
} from "@qvac/sdk";

export async function transcribeAudio(audioPath) {
  if (!audioPath) throw new Error("transcribeAudio: audioPath required");

  let modelId = null;
  try {
    modelId = await loadModel({
      modelSrc: WHISPER_EN_TINY_Q8_0,
      modelType: MODEL_TYPES.whispercppTranscription,
    });

    const text = await transcribe({ modelId, audioChunk: audioPath });
    return String(text || "").trim();
  } finally {
    if (modelId) {
      await unloadModel({ modelId }).catch(() => {});
    }
  }
}