# AvsarLens

**Snap the notice. Seize the opportunity.**

AvsarLens turns a photo of any paper notice — school circular, scholarship advertisement, exam form, competition poster — into a plain-language opportunity card: what it is, who can apply, the deadline as printed, documents needed, and how to apply. Then it runs a "Can I apply?" check against the notice's own printed rules, and keeps saved notices in a local deadline tracker.

"Avsar" (अवसर) means *opportunity* in Hindi.

## Verification-first

AvsarLens never invents a deadline or an eligibility rule. If a date is not printed, it shows **NO DEADLINE PRINTED — VERIFY MANUALLY**. If fields are unreadable, they are flagged, not guessed. A missed opportunity hurts; a fabricated deadline hurts worse.

## Privacy

- **Bring your own Gemini API key (BYOK)** — stored only in your browser's localStorage.
- **No server, no account, no database.** The browser talks directly to Google's Gemini API with your key. Photos are never stored anywhere.
- Model fixed to `gemini-2.5-flash` with Flash-only fallbacks.

## Run it

Static site — no build step:

```
cd app
python3 -m http.server 8080
# open http://localhost:8080, paste your key in the API Key tab, capture a notice
```

Or open `app/index.html` directly in a browser.

## Repository structure

```
app/               index.html · app.js · style.css (the whole product)
eval/fixtures/     8 synthetic test notices (SAMPLE-stamped, invented details)
SPEC.md            product + technical specification
```

## About this project

Built solo by **Krishna Kumar Shaw — a 15-year-old AI-native builder from Bokaro, Jharkhand, India** — for **STEMergent Hacks 2026** (Oct 30 – Nov 15, 2026). Development began **Oct 15, 2026**, specifically for this competition; this timeline is stated openly.

**AI-use disclosure:** AI tools generated code, fixtures and narration under my direction. I reviewed every line, own the architecture, the safety rules ("never invent a deadline") and all product decisions. All demo/eval notices are synthetic samples with invented details.
