# FoodFlow — build progress

Status of each build phase, what's next, and the decisions made along the way.

## Phase 0 — Setup ✅

- Next.js 16 (App Router, Turbopack) + strict TypeScript, Tailwind v4, ESLint + Prettier
- shadcn/ui (Radix) with FoodFlow tokens (ink / paper / harvest lime / tomato), light + dark themes,
  Geist + Instrument Serif + Noto Devanagari/Kannada, 44px touch targets, 16px inputs
- Prisma schema (all models from the brief + `OrderEvent`, `DeliveryAttempt`, `ServiceArea`,
  `Category`, `PlatformSetting`) and initial SQLite migration
- Deterministic seed: 8 farmers, 25 live listings, 4 pending batches (1 duplicate image),
  6 consumers, 3 bulk buyers, 2 riders, admin, 30 days × 11 crops × 3 mandis of prices,
  ~90 historical orders with payments/deliveries/settlements/feedback, 3 open demands with offers
- Auth: jose-signed HTTP-only cookie, phone + PIN (scrypt), self sign-up, `proxy.ts` role guard,
  one-tap demo personas + full persona list
- Responsive shell: desktop sidebar, mobile glass tab bar with centre action + "More" sheet,
  live nav badges, page transitions, EN/HI/KN i18n layer for the farmer UI
- `scripts/screenshots.mjs` — Playwright QA at 360/768/1280 that flags horizontal overflow and console errors

## Phase 1 — Core marketplace ✅

- AI layer (`lib/ai`): Gemini over REST behind an `AIProvider` interface, 8s timeout, strict JSON
  validated with Zod, and a deterministic fallback for every capability (sharp-based visual
  heuristic, multilingual listing + grocery parsers, template price explanations). Every result is
  tagged `ai` or `fallback` and the UI labels it.
- Harvest wizard (`/farmer/batches/new`): details → photos/video → price → review. Listing by voice
  goes through Sakhi, which drafts the batch and hands it to the wizard.
  DRAFT batch after step 1; each upload hashed (SHA-256), duplicate-checked across batches, EXIF
  stamped; video frames extracted client-side; submit re-runs the visual check server-side.
- `/api/ai/quality`, `/api/ai/parse-listing`, `/api/ai/price-advice` (numbers from DB, AI only words)
- Admin review queue with evidence gallery, duplicate source, farmer record, audit trail;
  approve creates the Listing in the same transaction; reject/resubmit need a note.
- SSE `/api/events` + `useLive` hook (5s polling fallback); Harvests list with resume.
- Tests: parsers + visual heuristic (13 passing).

## Phase 2 — Consumer shopping ✅

- Browse (`/shop`): search, category chips (area-gated milk/eggs/chicken say "Soon"), filter sheet,
  cards with harvest age, visual-score ring and Verified badge, fly-to-cart, sticky cart bar
- Listing detail: verified gallery, price vs mandi (indicative), stock bar, delivery/pickup, quality
  card, farmer reliability + rating, related listings
- Cart grouped by farm → checkout (delivery/pickup, slots, UPI/card simulated) with a server-side
  quote; out-of-area addresses blocked with a friendly message; one order per farm per checkout
- `lib/inventory.ts`: conditional `updateMany` reservation inside a transaction, release on cancel,
  commit on handover; guarded order state machine (`lib/orders/state.ts`)
- AI grocery assistant (`/shop/assistant`): photo / speech / text → editable list → smart basket with
  per-pick reasons and alternatives → add all to cart
- Live tracking (`/shop/orders/[id]`): animated status, SSE timeline, payment trail, contacts, cancel
- Tests: inventory race (2 buyers, 8-buyer burst), all-or-nothing orders, idempotent confirm, release
  on cancel — 19 tests passing

## Phase 3 — Fulfilment ✅

- Farmer orders board: To pack / On the way / Done with estimated payout; mark packed, one-click
  delivery booking (rider in the order's area with the fewest active runs, distance-priced), ready
  for pickup
- `lib/otp.ts`: 6-digit CSPRNG codes stored as HMAC(secret, deliveryId:nonce:otp), 15-min expiry,
  5 attempts counted atomically, regeneration rotates the nonce, single use
- `lib/delivery/handover.ts`: only the assigned rider (or owning farmer for pickup) can verify, only
  after pickup; idempotent; commits stock and creates the PENDING settlement
- Rider app (`/delivery`): runs, find by code / QR / voice, picked up, OTP keypad with spoken digits,
  problem reports. Buyers see a flip-in OTP with countdown; pickup orders also get a signed QR.
- Farmer pickup counter (`/farmer/pickup`): scan QR or code + OTP
- Payments (`/farmer/payments`): awaiting → pending → settled with fee equations; admin payout batch
- Tests: 39 passing (OTP hashing/expiry/lockout/wrong rider/races/QR binding, fee math)

## Phase 4 — Bulk procurement ✅

- Post requirements by form, voice (`/api/ai/parse-demand`, offline parser understands "kal tak",
  urgency and repeat cues) or procurement list (several at once); urgent + recurring
- Farmer feed (`/farmer/bulk`): own crops first, offers backed by a live listing, revise/withdraw,
  respond to counters — competitors' offers never shown
- `/api/ai/rank-offers`: deterministic weighted scoring (`lib/ranking.ts`, unit-tested) with optional
  model re-weighing + reasons; buyer page auto-ranks, cards shuffle into order with factor bars
- Negotiation: max 2 counter rounds; accept → BULK order through the atomic reservation, demand
  AWARDED when covered, other offers declined
- Bulk orders with printable invoice, recurring schedule (post next / stop), Browse & buy
- Tests: 45 passing (+ ranking)

## Phase 5 — Analytics, surplus, trust & controls ✅

- Landing site (`/`): desktop-first and responsive to 360px. Interactive 3D hero (react-three-fiber,
  falls back without WebGL, pauses off-screen), live mandi ticker, interface cards with one-tap demo
  sign-in, scroll-linked how-it-works, live impact counters from the DB, honesty strip
- Farmer dashboard (`/farmer`): earnings, sell-through, quality trend, at-risk lots
- Surplus (`/farmer/surplus`): at risk when sell-through is below the threshold after the minimum
  age, or the harvest has used the configured share of shelf life; one-tap rescue offers to open
  community-kitchen demand at the buyer's target, floored at 70% of the mandi rate
- Post-delivery feedback, issue reports and disputes; admin dispute resolution with refunds
- Admin analytics (`/admin`), order monitor, delivery ops with the OTP / QR attempt log
- Trust & safety (`/admin/trust`): re-used photos, farmers with repeated complaints (3+, or 2+ at
  ≥ 20% of orders, last 30 days), listings above 1.5× / below 0.6× the retail reference; suspend /
  reinstate accounts, pause / resume listings
- Platform controls (`/admin/controls`): commission and surplus thresholds (range-validated
  registry in `lib/settings.ts`), service areas on/off + base fee, cold-chain categories per area,
  payout run
- One-command setup for fresh clones (`npm run setup`)
- Tests: 45 passing

## Phase 6 — Polish & ship ✅

- Subscriptions (`/shop/subscriptions`, "Get this on repeat" on listings): daily / weekly plans with
  IST delivery slots, pause / resume, edit, cancel, deliver-now; `run-due` claims each plan
  atomically (no double orders), falls back to the same farmer then any farm when stock runs out;
  admin queue + run button in Controls; daily Vercel cron
- Cold-chain categories (milk / eggs / chicken) per area — in Controls
- Farmer UI fully in English, Hindi and Kannada: descriptions, empty states, tabs, payment stages,
  dashboard and translated status badges; commission shown as the rate actually charged
- Responsive QA of every page at 360 / 768 / 1280 (no overflow, no console errors); fixed subscription
  cards and offer factor bars
- 404, route error boundary, global fallback and per-role loading skeletons
- Date-driven forms (harvest wizard, demand form) use the user's local date and render client-only
- Search matches names case-insensitively on Postgres as well as SQLite
- Deploy: `vercel.json`, `npm run vercel-build` (Postgres switch + schema push), `CRON_SECRET`
- README with architecture, order lifecycle, screenshots, demo script and deploy guide
- Demo script run end-to-end through the UI at 360px: all 7 steps pass with no console errors
- Tests: 56 passing (+ subscriptions, search)

### Full QA pass (every role, real UI, 360px)

Scripted walkthroughs of every role's actions (not just page loads) found and fixed: the farmer
pickup page crashing when switching from QR to code entry (camera never started), bulk list-posting
pricing every row with one crop's price and silently dropping incomplete rows, "0% commission" and a
hard-coded 5% for farmers with no sales, an empty mandi chart for new farmers, the out-of-area
message naming paused areas, sign-up offering languages the UI doesn't ship, an unlabelled slider,
a tight sign-up rate limit for shared Wi-Fi, and remaining untranslated farmer labels and relative times.

## Phase 7 — Gemini photo check & review-driven grades ✅

- **Photo check by Gemini** (`lib/ai/vision`): what the photos show, whether it matches the declared crop,
  mixes and stock photos / collages, visible condition (0–100) and defects. A score only when the photos
  clearly show the declared produce; otherwise *not detectable* with the reason (no score, never a guess).
  Without a key or when Gemini is down, the same "not detectable", and an admin reviews the photos. A second
  model with its own quota answers when the main one is rate-limited. (A locally trained MobileNetV3 was
  tried first; it reached 95% on its validation set but only 70% on real field photos, so it was removed in
  favour of Gemini, along with the old offline image heuristic that scored any image.)
- **Fair to cheap cameras**: photo sharpness / light are measured locally and only set confidence; the
  prompt tells Gemini to judge produce, not photography.
- **Crop check**: mismatches get a `crop_mismatch` flag for the admin and a one-tap "Change to onion" for the farmer.
- **Fruits** in the catalogue (banana, mango, apple, orange, grapes, pomegranate, guava, papaya) with
  EN/HI/KN/TA/TE names, voice aliases and public-domain photos.
- **Review-driven grades** (`lib/quality`): the photo score (or the admin's grade) is a prior worth 2–8
  reviews; each buyer's latest review moves the listing's live score and grade, so bad reviews pull it down;
  photo-backed complaints count more, one buyer alone can't change the grade, lateness/short weight don't
  count. Ungraded listings get their score from reviews alone. Buyers can say which item a review is about.
- **Farmer notifications**: bell in the farmer shell (live over SSE, EN/HI/KN) for complaints and grade changes.
- Tests: photo-check verdicts, quality scoring, photo-evidence verdicts, the review → grade → notification
  loop on the test DB, the photo-quality check.

## Phase 8 — Phone verification, mixed-language numbers, natural voices ✅

- **Phone verification**: joining (household, restaurant, seller wizard, Google) texts a 6-digit code;
  the account is only created for a proven number, and the PIN is typed twice. "Forgot PIN?" on sign-in
  proves the number the same way and sets a new PIN. MSG91 / Twilio providers, on-screen code for
  development and labelled demos (`lib/auth/phone-code.ts`, `lib/sms.ts`).
- **Numbers in any language mix**: English numbers said in Hindi or Kannada mode, as those recognisers write
  them ("फिफ्टी", "ट्वेंटी फाइव", "ಫಿಫ್ಟಿ"), parse as numbers in listings, prices and mobile numbers.
- **Voices**: Sakhi's own Hindi voice (SYSPIN, `npm run voice:hindi`) on devices without a natural Hindi
  voice, with Hindi number words and English in Devanagari; the server voices share one engine
  (`lib/tts/vits.ts`). Device voices: natural first, Indian English among equals, robotic desktop voices last.

## Decisions

| Decision | Why |
| --- | --- |
| Next.js 16 instead of 14 | Latest stable at build time; uses `proxy.ts` (renamed middleware) and async request APIs. |
| Cache Components off | Nearly every screen is per-user live data; classic dynamic rendering is simpler and predictable. |
| Prisma 6 pinned | Prisma 7+ requires driver adapters and a config file; 6.19 keeps the classic SQLite ↔ Postgres switch. |
| Enums + Json on SQLite | Supported natively since Prisma 6.2, and identical on Postgres. |
| One order per farmer | A multi-farmer checkout creates one order per farmer sharing a `groupId`, so delivery booking, OTP handover and settlement are unambiguous. |
| Who pays fees | Buyer pays `subtotal + deliveryFee`. Commission (default 5%) is withheld from the farmer; the farmer also absorbs any courier cost above the buyer's delivery fee. |
| OTP storage | OTPs are stored as HMAC-SHA256 (keyed with `SESSION_SECRET` + delivery id). The plaintext is only returned to the recipient when they generate or regenerate it. |
| Demo personas | One-tap login only works for seeded accounts (`90000…` phones) and can be disabled with `DEMO_MODE=false`. |
| Demo farmer in English | Ramesh starts in English so judges can follow; the EN/हि/ಕ switch shows the localisation. |
| Seed photos | CC0 / Public Domain images from Openverse (credits in `public/seed/CREDITS.md`). Each seeded batch gets a distinct file so real SHA-256 hashes only collide on the intentional duplicate. |
| Per-file uploads | Each photo/video uploads in its own request (works under serverless body limits, gives per-file progress and an immediate duplicate warning). |
| No offline photo score | The original offline heuristic (saturation, exposure, blotches) scored any image, rewarded bright photos and couldn't tell a tomato from a collage, so it was removed (Phase 7): without Gemini the photo check says "not detectable" and a person reviews the photos. |
| Frames for AI, video for humans | Videos are stored as evidence for admins; three client-extracted JPEG frames feed the visual check. |
| Quality is recomputed on submit | The wizard's preview isn't trusted; submit re-runs the check on stored media (cached, so it's consistent and free). |
| Test DB | Vitest builds a throwaway `prisma/test.db` by deleting the file and pushing the schema (no destructive reset of any real database). |
| Confirm at checkout | Checkout places the order (payment AUTHORISED) and immediately confirms it (stock reserved + payment CAPTURED) in one transaction, so stock can't be oversold between cart and payment. A farm whose stock ran out gets a cancelled order with the authorisation released. |
| Quote never errors for out-of-area | `/api/checkout/quote` returns `blocked` with a friendly message (no 4xx in the console); only placing the order returns 422. |
| Courier pricing | Pooled routes: ₹15 + ₹1.5/km per order, capped at ₹60. The farmer pays only the shortfall over the buyer's delivery fee, and never more than 15% of the order value — FoodFlow absorbs the rest, so a small order can't leave a farmer out of pocket. |
| Recipient generates the OTP | The plaintext OTP is returned only to the buyer when they tap "Show OTP" (kept in sessionStorage until expiry). The rider never sees it except from the customer. |
| Pickup QR | A JWT bound to the order and the current OTP nonce, so regenerating the code invalidates old QRs. |
| Offers need a live listing | A bulk offer must point at one of the farmer's ACTIVE listings of that crop, so accepting it can reserve real stock atomically. Farmers without one are nudged to list a harvest. |
| Offer ranking | Cost scored as a ratio to the cheapest delivered price (courier cost spread over the quantity), ×0.6 if the ETA misses the deadline; weights cost 30 / coverage 20 / ETA 15 / quality 15 / distance 10 / reliability 10. |
| Bulk nav | Five phone tab slots; the bulk buyer's cart is reached via the floating cart bar. |
| Trust flags are advisory | Duplicate photos, complaint rates and price outliers only surface items for a person; nothing is suspended or paused automatically. |
| Suspension | Blocks PIN and demo sign-in, ends live sessions on the next request, and pauses the farmer's live listings. Reinstating leaves listings paused so the admin resumes them deliberately. |
| Subscription runs | Claimed with a conditional update on `nextRunAt` before ordering, so overlapping schedulers (cron + admin button) can't double-order. A skipped run (no stock) advances the schedule and is audit-logged. |
| Daily cron | Vercel Hobby allows one cron per day, so the bundled schedule runs at 04:00 IST; any external scheduler can call `run-due` more often with `CRON_SECRET`. |
| Client-only date forms | "Today" must be the farmer's today. Server rendering used the server's clock (UTC on Vercel), so the two date-driven forms render in the browser only. |
| Live landing numbers | The landing page reads impact counters and the mandi ticker from the database on each request and shows zeros (not invented numbers) if the DB is unreachable. |
| Photo quality never changes the score | Shrinking unsure scores towards a neutral grade still ranks farmers with poor cameras below others on average (most produce is fresh). So the photo check's answer stands; photo quality only sets how fast reviews can move the grade. |
| "Not detectable" over a guess | A score for photos that don't clearly show the declared produce (or for produce whose freshness doesn't show) is noise that misleads buyers. No score is shown until the photos or customer reviews can support one. |
| One buyer can't change a grade | A single complaint (or a single glowing review) moves the score within the current grade band; the grade changes once two different buyers agree, so one unhappy or malicious buyer can't sink a farmer. |
| Eggs, milk and chicken: reviews decide | Their freshness isn't visible in a photo; the photo check says so and customer reviews (or the admin's grade) set the grade. |
| Mismatch warns, never blocks | Gemini can be wrong on unusual varieties; a person approves every listing, so a mismatch is a flag for the admin and a prompt for the farmer. |
| Ambiguous voice words | "आम" (mango) also means "common" and sits inside "आमदनी" (earnings), so it isn't a Sakhi crop term; "आम का" is. |
| Verify the phone at sign-up | Sign-in is phone + PIN, so the phone must belong to the person. A code proves it once; the PIN (typed twice) is what they use every day, and "Forgot PIN?" re-proves the phone. |
| No SMS provider in production = no codes | Showing codes on screen would make verification meaningless on a real site; a demo deployment opts in explicitly with `SMS_PROVIDER=console`. |
| Hindi server voice only when needed | A natural device Hindi voice starts faster and sounds as good; the server voice replaces the robotic ones and is skipped for farmers who prefer a male voice (it is female). |
| Smart basket weights | Price 0.30, ETA 0.27, freshness 0.25, visual score 0.18, +0.12 per extra item a farm covers — so a marginally cheaper lot 60 km away loses to a nearby fresher one. |
