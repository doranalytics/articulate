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

## Keyless by design (first pass)

No API keys anywhere: speech-to-text is the browser's Web Speech API
(Chrome/Edge/Safari), pauses and mic level come from a WebAudio analyser,
and scoring is a deterministic local engine over the transcript + timing.
Progress lives in `localStorage` as a guest user — accounts and the
leaderboard are the obvious v2 (Supabase), as is model-graded explanation
quality.

## Run

```sh
npm install
npm run dev   # → http://localhost:3000
npm run og    # regenerate the OG card
```
