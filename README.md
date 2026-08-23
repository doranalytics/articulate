# articulate.

A voice-only training ground for becoming more articulate. You're shown a
challenge — describe an emoji scene, explain a concept, invent an analogy,
deploy a word — and you answer out loud. No typing allowed. The moment you
stop, you're scored 0–100 across four axes:

- **Conciseness** — cover the ground inside the time budget
- **Vocabulary** — range, reach, and correct deployment
- **Articulation** — keyword coverage, pace band (115–175 wpm), pause discipline
- **Filler** — ums, likes, you-knows, and dead air

Every 10 completed challenges an animated square radar chart shows your shape;
the app quietly feeds you more of whatever leg is short. Skipping costs
nothing — TikTok rules.

## How it grades

Speech-to-text is the browser's Web Speech API (Chrome/Edge/Safari); your
words appear on screen as you say them. A WebAudio analyser watches the mic
for pauses and drives the orb. On stop, Claude (`claude-haiku-4-5`, via
`/api/grade`) judges the substance — conciseness, vocabulary, articulation —
with the measured delivery signals in hand, while the deterministic meter
keeps the filler axis (counting is its job). If the grader is unreachable,
the local engine scores the quiz so play never stops.

## Membership

10 challenges free as a guest, then Stripe: $15/mo, or $120/yr ($10/mo).
`/api/checkout` opens Stripe Checkout; `/api/entitlement` verifies the
session (or a receipt email, for restoring a new device) and mints an
HMAC-signed token the client stores. No user database yet — the token is the
membership.

## Run

```sh
npm install
# .env.local: ANTHROPIC_API_KEY, STRIPE_SECRET_KEY, ENTITLEMENT_SECRET,
#             STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL
npm run dev   # → http://localhost:3000
npm run og    # regenerate the OG card
```
