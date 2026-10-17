# AvsarLens — SPEC v1
**STEMergent Hacks 2026 · Hackathon pathway · Solo: Krishna Kumar Shaw (15, Bokaro, Jharkhand)**
**Build window: Oct 30 – Nov 15, 2026 (all code commits inside window — clean provenance)**

## 1. Problem
In small-town India, opportunities (scholarships, exam forms, competitions) reach students as **paper notices** — school notice boards, Hindi circulars, newspaper ads. Research: 80% rural students unaware of pre-matric schemes; thousands of scholarships unclaimed yearly; institutions are the #1 info source; parents often can't decode the paperwork either. Existing AI scholarship tools are English text-search portals for college students — none reads the physical notice.

## 2. Product (one line)
**Photograph any notice → plain-language opportunity card + "Can I apply?" check + deadline tracker.** Privacy-first: BYOK Gemini key, no server, nothing stored except user's own saved notices in localStorage.

## 3. Core flow
1. **Capture**: camera (phone/laptop) or upload. No account, no signup.
2. **Extract** (Gemini 2.5 Flash, vision, fixed JSON output pattern):
   - `what` — one-line plain description of the notice
   - `type` — scholarship / exam-form / competition / circular / other
   - `who_can_apply` — eligibility bullets (as printed, simplified)
   - `deadline` — date if printed (ISO) + `deadline_found` boolean — NEVER guessed; if absent → "No deadline printed — VERIFY MANUALLY"
   - `documents` — list of required documents
   - `how_to_apply` — steps/portal/address as printed
   - `extra` — anything else important (fees, quota, contact)
   - `confidence` — low flags anything unreadable/ambiguous → amber VERIFY chip
3. **"Can I apply?"**: 3 quick questions generated FROM the notice (e.g. class? category? family income?) → verdict: LIKELY ELIGIBLE / MAYBE — ASK SCHOOL / NOT ELIGIBLE (as per printed rules) + always: "Final confirmation: contact the office listed on the notice."
4. **Save to tracker**: localStorage list, days-left countdown, status (New / Asked school / Applied / Missed).
5. **Print/Share**: clean print view of the card (for parents/teachers).

## 4. Hard rules (non-negotiable, from MedScript lessons)
- Model FIXED: `gemini-2.5-flash`; fallbacks Flash-only.
- BYOK key in localStorage; zero server; zero hidden uploads. AI never talks (no TTS) — text + beeps only if any feedback sounds used.
- UI: FULL ENGLISH, modern, zero emoji, zero external resources, inline SVG icons only.
- Fixed output pattern + "Extra details from the notice" section (proven pattern).
- Never invent eligibility/deadlines/dates. Unreadable = honest flag. This is the whole brand: verification-first.
- No "try sample" button. Uploads show "Processing". Beeps (if any) stop with camera.

## 5. Tech stack
Vanilla HTML/CSS/JS single-page app (index.html, app.js, style.css) · Gemini REST via BYOK · localStorage (key: `av_key`, notices: `av_notices`) · Deploy: Render free tier (later: DeployXA credits from event) · New GitHub repo: `AvsarLens` (created Oct 30).

## 6. Test/eval plan (built WITH the app, not after — DSH lesson)
- Synthetic notice fixture set (I generate): 8 notices × conditions (clean / glare / angle / low-res / Hindi / English / mixed / faded print) — realistic Indian schemes: NMMS-style, state scholarship-style, school circular, competition poster (all marked SAMPLE, invented details, no real portal names misused).
- Harness like MedScript eval: extraction correctness per field before/after; deadline-never-invented test (notice without date MUST return deadline_found=false); VERIFY flag triggers on unreadable fixtures.
- Browser safety suite: key handling, no-network error, empty upload, huge image, XSS in notice text rendering.

## 7. Timeline
| Date | Deliverable | Who |
|---|---|---|
| Oct 16–28 | SPEC feedback, fixture design | K reads/approves, I draft |
| Oct 29 | Repo structure + skeleton ready locally | Me |
| Oct 30 | Repo created, v0 deployed (commits start) | K creates repo, I code |
| Oct 31–Nov 9 | Build sprints (K tests daily 45–60 min after school) | Me code / K test+direct |
| Nov 10–12 | Eval harness + fixes + screenshots | Me, K verifies |
| Nov 13–14 | Demo video (2–3 min) + Devpost description + one-pager | Me (video: I build, I narrate) |
| Nov 14 | **SUBMIT** (deadline Nov 15, 7 PM CST — submit a day early) | K clicks, I walk through |

## 8. Submission checklist (Devpost)
Title · Tagline · Description (Devpost default headings: Inspiration / What it does / How we built it / Challenges / Accomplishments / What we learned / What's next for AvsarLens) · Pathway = Hackathon · Team = solo Krishna Kumar Shaw · Screenshots/GIFs · Demo video (YouTube, his channel) · GitHub repo link · Live link · AI & third-party disclosure section · Certificate-request email to stemergent@gmail.com after submitting.

## 9. Demo video story arc (for Nov 13)
Cold open: notice board photo (real texture) → problem stat cards (80% unawareness, unclaimed scholarships) → live app demo: snap Hindi circular → card appears → Can-I-apply Q&A → save to tracker → print view → safety moment (glare photo → VERIFY flag, "it refuses to guess") → build story: 15-year-old, AI-native, verification-first → close: tagline. 2:30 max.
