# VoiceInvoice

> **Speak it. Invoice it.**

Turn a spoken purchase description into a professional PDF invoice — entirely on your device. No cloud calls, no API keys, no data leaving your machine.

```
"Make invoice for Abhey Yadav. He bought 1 kg potato at 100,
 2 kg onion at 200, and 1 kg tomato at 50."
```

⬇️

A formatted PDF invoice with line items, totals, and a clean layout. Ready to email.

---

## Why This Web App

Small business owners, freelancers, and shopkeepers need invoices on the spot. Existing options are either subscription-based cloud software (QuickBooks, Zoho), manual templates (slow and error-prone), or AI generators that ship your customer's name and prices to a server.

VoiceInvoice combines **three on-device models** — speech recognition, LLM structuring, and deterministic PDF generation — into a single pipeline. You speak. You get a PDF. Nothing leaves the laptop.

---

## Features

- 🎙️ **On-device speech recognition** (QVAC Whisper)
- 🧠 **On-device LLM structuring** (QVAC Llama 3.2 1B)
- 🧮 **Deterministic arithmetic** — the LLM never touches money math
- 📄 **Hand-rolled PDF writer** — zero PDF dependencies
- ✏️ **Editable review step** — fix names or line items before download
- 📊 **Local CSV ledger** — every invoice logged, human-readable
- 🌐 **Zero network calls** after first-run model download
- 🎨 **Modern, professional UI** — light/dark themes, responsive

---

## Requirements

- **Node.js ≥ 22.17** ([download](https://nodejs.org))
- **~750 MB disk** for models (Whisper ~43 MB + Llama 3.2 1B ~700 MB)
- **Works on:** Windows 11, macOS, Linux

---

## Install

```bash
git clone https://github.com/abheyyadav/voiceinvoice.git voice-invoice
cd voice-invoice
npm install
```

That's it. `@qvac/sdk` is the only dependency.

---

## Usage

### Web UI (recommended)

```bash
npm start
```

Then open **http://localhost:3000** in your browser.

1. Drop an audio file onto the dropzone (or click to browse).
2. Click **Transcribe & extract**.
3. Review and fix any extraction mistakes (especially names — Whisper's tiny model sometimes mishears them).
4. Click **Download PDF**.

The first transcription downloads ~43 MB of Whisper model. After that, everything is offline.

### CLI

```bash
node app.js samples/test-invoice.mp3
```

Produces `invoice-<party>-<date>.pdf` in the current directory and appends a row to `invoices.csv`.

### Example output

```
Audio: samples/test-invoice.mp3
Loading Whisper model on-device...

Transcript:
"invoice for Abhey Yadav. He bought 1 kg potato at 100, 2 kg onion at 200, and 1 kg tomato at 50."

Extracting invoice data...
Extracted:
  Party:    Abhey Yadav
  Items:
    - potato         1 kg × Rs.100 = Rs.100
    - onion          2 kg × Rs.200 = Rs.400
    - tomato         1 kg × Rs.50 = Rs.50
  Subtotal: Rs.550
  Tax:      Rs.0
  Total:    Rs.550

Rendering PDF...
✅ Wrote invoice-abhey-yadav-2026-09-25.pdf (2.1 KB)
Appended to invoices.csv (1 rows today, +1)
```

---

## How it works

```
audio file
   │
   ▼
lib/speech.js     QVAC Whisper → transcript
   │
   ▼
lib/split.js      deterministic clause splitter
   │
   ▼
lib/extract.js    regex + LLM → { party, items }
   │
   ▼
lib/invoice.js    JS computes lineTotal, subtotal, total
   │
   ▼
lib/pdf.js        hand-rolled PDF writer → Buffer
   │
   ▼
lib/ledger.js     append to invoices.csv
```

**Key design decisions:**

| Decision | Rationale |
|---|---|
| LLM extracts fields, JS computes math | The LLM can hallucinate, but arithmetic must be correct |
| Regex-first, LLM-fallback for party name | Regex is deterministic; LLM handles variations |
| `Rs.` instead of `₹` in PDFs | Standard PDF Type 1 fonts are Latin-1; no font embedding needed |
| Hand-rolled PDF | Keeps dependency count at exactly 1 |
| Review step is required | Whisper mishears names ~10-20% of the time; user must fix |

---

## Project structure

```
voice-invoice/
├── app.js                    CLI entry point
├── server.js                 Web server (Node http, no framework)
├── public/
│   ├── index.html            Web client markup
│   ├── styles.css            Client styles
│   └── app.js                Client logic
├── lib/
│   ├── speech.js             QVAC Whisper wrapper
│   ├── split.js              Clause splitter
│   ├── extract.js            Party + item extraction
│   ├── invoice.js            Totals + invoice object
│   ├── pdf.js                Hand-rolled PDF writer
│   └── ledger.js             CSV append + read
├── scripts/
│   ├── test-pdf.js           PDF smoke test
│   ├── test-extract.js       Extraction unit test (5 cases)
│   └── test-speech.js        Speech smoke test
├── samples/
│   └── test-invoice.mp3      Sample voice clip
├── invoices.csv              Local ledger (gitignored)
├── LICENSE                   MIT
├── package.json
└── README.md
```

---

## Tests

```bash
npm run test:pdf       # Generate a test PDF
npm run test:extract   # Run extraction tests (all 5 must pass)
npm run test:speech -- samples/test-invoice.mp3
```

---

## API

The server exposes four endpoints. All local.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/process-audio` | Multipart audio → transcript + invoice JSON |
| `POST` | `/api/generate-pdf` | Invoice JSON → PDF bytes |
| `GET`  | `/api/invoices` | All rows of `invoices.csv` as JSON |
| `POST` | `/api/clear` | Reset the CSV to just the header |

---

## Privacy

- No network requests after first-run model download.
- No telemetry, no analytics, no external error reporting.
- Uploaded audio files are deleted from `.tmp/` immediately after processing.
- The LLM and Whisper models run entirely on your CPU.

You can verify this: open DevTools → Network tab while using the app. After the first model download, you'll see zero outgoing requests.

---

## Known limitations (v1)

- **English only.** Whisper `tiny.en` handles English voice input.
- **Whisper mishears names.** "Abhey" can become "Abba" or "Abby". The review step lets you fix this.
- **`Rs.` instead of `₹` in PDFs.** Standard PDF fonts don't include the rupee glyph. Cosmetic only.
- **No tax / GST / VAT.** Flat total only. Configurable in v2.
- **No logo embedding.** Text-only invoices.
- **Single user, single machine.** No cloud sync.

---

## Roadmap (v2+)

- Browser microphone recording
- Tax rate configuration
- Custom business info in the invoice header
- Logo embedding (requires font embedding in the PDF writer)
- Multi-language voice input (swap Whisper model)
- Draft save/resume
- Email the PDF directly
- Recurring invoices
- Monthly reports

---

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js ≥ 22.17 (ESM) |
| Server | Built-in `node:http` |
| Client | Vanilla HTML / CSS / JS |
| Speech | `@qvac/sdk` — Whisper `tiny.en` |
| LLM | `@qvac/sdk` — Llama 3.2 1B Instruct |
| PDF | Hand-rolled writer (no dependency) |
| Storage | CSV file |

**Runtime dependencies: exactly one** — `@qvac/sdk`.

---

## Development

The extraction logic is unit-tested against 5 canonical sentences. Run:

```bash
npm run test:extract
```

Expected: `Passed: 5/5`.

To add a new test case, edit `scripts/test-extract.js` and add an entry to the `CASES` array.

---

## Contributing

Issues and PRs welcome. For large changes, please open an issue first.

---

## License

MIT © 2026 Abhey Yadav — see [LICENSE](./LICENSE).

---

## Credits

- Built on [Tether's QVAC SDK](https://qvac.tether.io) for on-device inference.
- Fonts: Inter (Rasmus Andersson), JetBrains Mono (JetBrains).
- Inspired by the local-first, dependency-minimal philosophy of InvoiceLedger and ResistorReader.
