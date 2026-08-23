// The challenge bank. Every quiz is voice-only: the user speaks, the engine
// scores the transcript + timing against the axes the challenge tracks.
// Keywords are groups of synonyms — covering a group means any one of its
// words appeared. Coverage is what "did you actually explain it" hangs on.

export type Axis = "conciseness" | "vocabulary" | "articulation" | "filler";

export const AXES: Axis[] = ["conciseness", "vocabulary", "articulation", "filler"];

export const AXIS_LABEL: Record<Axis, string> = {
  conciseness: "Conciseness",
  vocabulary: "Vocabulary",
  articulation: "Articulation",
  filler: "Filler",
};

export type ChallengeKind = "describe" | "explain" | "analogy" | "vocab";

export interface Challenge {
  id: string;
  kind: ChallengeKind;
  /** The instruction shown at the top of the screen. */
  prompt: string;
  /** Emoji scene rendered large in the middle (describe challenges). */
  visual?: string;
  /** For vocab drills: the word to deploy, with a short gloss. */
  targetWord?: { word: string; gloss: string };
  /** Synonym groups; covering a group = any member spoken. */
  keywords: string[][];
  /** Axes this quiz scores (1–3 of them). */
  axes: Axis[];
  /** Rough interest tags for profile-biased selection. */
  tags: string[];
  /** The budget a sharp answer fits inside. Overruns cost conciseness. */
  idealSeconds: number;
}

const c = (
  id: string,
  kind: ChallengeKind,
  prompt: string,
  axes: Axis[],
  keywords: string[][],
  idealSeconds: number,
  tags: string[],
  extra?: Partial<Challenge>,
): Challenge => ({ id, kind, prompt, axes, keywords, idealSeconds, tags, ...extra });

export const CHALLENGES: Challenge[] = [
  // ---- DESCRIBE: emoji scenes, few words, full picture ----
  c("d-kangaroo", "describe", "Describe this scene so someone who can't see it could sketch it.", ["conciseness", "articulation", "filler"], [["kangaroo"], ["cactus", "desert"], ["sun", "sunset", "sunrise"]], 25, ["general"], { visual: "🦘🌵🌅" }),
  c("d-storm", "describe", "Describe this scene — every element, fewest possible words.", ["conciseness", "articulation"], [["lighthouse", "tower"], ["storm", "lightning", "thunder"], ["wave", "sea", "ocean"]], 25, ["general"], { visual: "🌊⚡🗼" }),
  c("d-market", "describe", "Paint this scene for a listener in under twenty seconds.", ["conciseness", "filler", "articulation"], [["market", "stall", "shop"], ["fruit", "apple", "produce"], ["crowd", "people", "busy"]], 20, ["general"], { visual: "🍎🍇🧺👥" }),
  c("d-launch", "describe", "Describe what's happening here, start to finish.", ["articulation", "conciseness"], [["rocket", "launch", "spaceship"], ["smoke", "fire", "flames"], ["space", "sky", "stars"]], 25, ["science"], { visual: "🚀🔥🌌" }),
  c("d-breakfast", "describe", "Describe this table to someone deciding whether to sit down.", ["conciseness", "vocabulary"], [["coffee", "espresso"], ["bread", "croissant", "pastry"], ["egg", "eggs"]], 20, ["general"], { visual: "☕🥐🍳" }),
  c("d-city", "describe", "Describe this city moment — atmosphere included.", ["vocabulary", "articulation"], [["rain", "raining", "wet"], ["taxi", "cab", "car"], ["night", "lights", "neon"]], 30, ["culture"], { visual: "🌧️🚕🌃" }),
  c("d-hike", "describe", "Describe this scene as if texting a friend where you are.", ["conciseness", "filler"], [["mountain", "peak", "summit"], ["tent", "camp", "camping"], ["fire", "campfire"]], 20, ["general"], { visual: "⛰️⛺🔥" }),
  c("d-lab", "describe", "Describe this workspace precisely.", ["vocabulary", "articulation"], [["microscope", "lab", "laboratory"], ["test", "tube", "beaker", "flask"], ["scientist", "researcher", "experiment"]], 25, ["science"], { visual: "🔬🧪🥼" }),
  c("d-harvest", "describe", "Describe this scene with all its moving parts.", ["articulation", "conciseness"], [["tractor", "farm", "farmer"], ["wheat", "field", "crop", "corn"], ["barn", "farmhouse"]], 25, ["general"], { visual: "🚜🌾🏠" }),
  c("d-orchestra", "describe", "Describe this to someone who has never been to a concert.", ["vocabulary", "articulation"], [["violin", "strings", "instruments"], ["conductor", "orchestra"], ["music", "symphony", "playing"]], 30, ["culture"], { visual: "🎻🎼👔" }),

  // ---- EXPLAIN: concepts, smart and short ----
  c("e-context-window", "explain", "Explain what a context window is, to a smart friend outside tech.", ["articulation", "conciseness"], [["memory", "remember", "holds", "fits"], ["model", "ai", "chatbot", "assistant"], ["limit", "limited", "size", "runs out", "full"]], 30, ["tech"]),
  c("e-inflation", "explain", "Explain inflation in under thirty seconds.", ["articulation", "conciseness", "filler"], [["prices", "price", "cost"], ["money", "dollar", "currency"], ["rise", "rises", "rising", "increase", "up", "worth less", "value"]], 30, ["business"]),
  c("e-compound", "explain", "Explain compound interest so a teenager would actually care.", ["articulation", "conciseness"], [["interest", "grows", "growth", "earns"], ["time", "years", "early", "longer"], ["snowball", "accelerates", "exponential", "on itself", "on top"]], 30, ["business"]),
  c("e-gravity", "explain", "Explain gravity without the word 'force'.", ["articulation", "vocabulary"], [["mass", "heavy", "objects", "matter"], ["pull", "pulls", "attract", "attracts", "falls", "fall", "curve", "curves"], ["earth", "planet", "moon", "space"]], 30, ["science"]),
  c("e-api", "explain", "Explain what an API is using one everyday comparison.", ["articulation", "conciseness"], [["software", "program", "app", "system", "computer"], ["talk", "communicate", "request", "ask", "connect"], ["waiter", "menu", "messenger", "middleman", "contract", "interface"]], 30, ["tech"]),
  c("e-supply-demand", "explain", "Explain supply and demand with one concrete example.", ["articulation", "conciseness"], [["supply", "available", "scarce", "scarcity"], ["demand", "want", "buyers"], ["price", "prices", "cost"]], 35, ["business"]),
  c("e-photosynthesis", "explain", "Explain photosynthesis to a curious eight-year-old.", ["articulation", "filler"], [["plant", "plants", "leaf", "leaves", "tree"], ["sunlight", "sun", "light"], ["energy", "food", "sugar", "oxygen"]], 30, ["science"]),
  c("e-encryption", "explain", "Explain encryption so your grandmother would trust it.", ["articulation", "conciseness"], [["message", "data", "information"], ["scramble", "scrambled", "lock", "locked", "code", "coded", "secret"], ["key", "password", "unlock"]], 30, ["tech"]),
  c("e-negotiation", "explain", "Explain why the first offer in a negotiation matters.", ["articulation", "vocabulary"], [["anchor", "anchors", "anchoring", "reference", "starting point", "sets"], ["offer", "number", "price"], ["negotiation", "negotiate", "counter", "deal"]], 30, ["business"]),
  c("e-machine-learning", "explain", "Explain machine learning without saying 'algorithm'.", ["articulation", "conciseness"], [["data", "examples", "patterns"], ["learn", "learns", "learning", "improves", "trained", "training"], ["predict", "prediction", "guess", "recognize", "decide"]], 30, ["tech"]),
  c("e-insurance", "explain", "Explain how insurance works as a system, not a product.", ["articulation", "conciseness"], [["risk", "risks"], ["pool", "pooled", "share", "shared", "spread", "everyone pays", "many people"], ["claim", "payout", "pays", "covered", "loss"]], 35, ["business"]),
  c("e-wifi", "explain", "Explain what Wi-Fi actually is, physically.", ["articulation", "vocabulary"], [["radio", "waves", "signal", "signals", "wireless"], ["router", "antenna", "modem"], ["data", "internet", "information"]], 30, ["tech"]),
  c("e-evolution", "explain", "Explain natural selection in three sentences or fewer.", ["conciseness", "articulation"], [["variation", "different", "differences", "traits", "mutations"], ["survive", "survival", "reproduce", "offspring", "pass on"], ["generations", "time", "gradually", "species"]], 30, ["science"]),
  c("e-interest-rates", "explain", "Explain why raising interest rates cools inflation.", ["articulation", "vocabulary"], [["borrow", "borrowing", "loans", "credit", "mortgages"], ["expensive", "costs more", "spend less", "spending", "slows"], ["prices", "inflation", "demand"]], 35, ["business"]),
  c("e-delegation", "explain", "Explain why leaders who can't delegate stop scaling.", ["articulation", "conciseness"], [["time", "hours", "bandwidth", "bottleneck"], ["trust", "handing", "hand off", "let go", "others"], ["scale", "grow", "multiply", "leverage"]], 30, ["business"]),
  c("e-blockchain", "explain", "Explain a blockchain as if it were a physical object.", ["articulation", "conciseness"], [["ledger", "record", "book", "list", "history"], ["shared", "copies", "everyone", "distributed", "public"], ["change", "tamper", "rewrite", "permanent", "trust"]], 35, ["tech"]),
  c("e-placebo", "explain", "Explain the placebo effect and why trials control for it.", ["articulation", "vocabulary"], [["belief", "believe", "expect", "expectation", "mind"], ["sugar pill", "fake", "placebo", "no active"], ["real effect", "improve", "feel better", "control", "compare"]], 35, ["science"]),
  c("e-brand", "explain", "Explain what a brand is — beyond the logo.", ["articulation", "conciseness"], [["promise", "reputation", "trust", "expectation", "feeling"], ["logo", "name", "product"], ["customer", "people", "buyers", "minds"]], 30, ["business"]),

  // ---- ANALOGY: forced invention on the spot ----
  c("a-ram", "analogy", "Invent an analogy for computer memory (RAM) — no tech words allowed.", ["articulation", "vocabulary"], [["desk", "counter", "table", "workspace", "kitchen", "bench", "workbench", "like"], ["working", "juggling", "in front of", "at once", "open"], ["clear", "cleared", "put away", "forget", "reset", "gone"]], 30, ["tech"]),
  c("a-cashflow", "analogy", "Invent an analogy for cash flow that a twelve-year-old would get.", ["articulation", "conciseness"], [["water", "river", "bucket", "bathtub", "tank", "pipe", "like"], ["in", "flowing in", "filling"], ["out", "leaking", "draining", "flowing out"]], 30, ["business"]),
  c("a-immune", "analogy", "Invent an analogy for the immune system.", ["articulation", "vocabulary"], [["army", "guards", "police", "security", "defense", "soldiers", "like"], ["invader", "intruder", "enemy", "germs", "attack"], ["remember", "recognize", "learn", "faster next"]], 30, ["science"]),
  c("a-technical-debt", "analogy", "Invent an analogy for technical debt for a non-engineer.", ["articulation", "conciseness"], [["shortcut", "quick fix", "duct tape", "mess", "clutter", "like"], ["later", "eventually", "over time", "builds up", "accumulates"], ["pay", "cost", "slower", "interest", "clean"]], 30, ["tech"]),
  c("a-attention", "analogy", "Invent an analogy for attention in the age of the feed.", ["articulation", "vocabulary"], [["currency", "money", "resource", "spotlight", "flashlight", "muscle", "like"], ["spend", "spent", "steal", "compete", "pulled"], ["scroll", "feed", "phone", "apps", "notifications"]], 30, ["culture"]),
  c("a-networking", "analogy", "Invent an analogy for professional networking that isn't 'it's who you know'.", ["articulation", "conciseness"], [["garden", "planting", "seeds", "bridges", "roots", "web", "like"], ["grow", "tend", "cultivate", "build", "maintain"], ["opportunity", "opportunities", "returns", "fruit", "later"]], 30, ["business"]),

  // ---- VOCAB: deploy the word, correctly, in the wild ----
  c("v-ephemeral", "vocab", "Use this word naturally in two sentences about modern life.", ["vocabulary", "articulation"], [["ephemeral"]], 20, ["culture"], { targetWord: { word: "ephemeral", gloss: "lasting a very short time" } }),
  c("v-pragmatic", "vocab", "Use this word in two sentences about a decision you've made.", ["vocabulary", "articulation"], [["pragmatic"]], 20, ["general"], { targetWord: { word: "pragmatic", gloss: "dealing with things practically rather than idealistically" } }),
  c("v-succinct", "vocab", "Use this word while describing how you write messages.", ["vocabulary", "conciseness"], [["succinct"]], 20, ["general"], { targetWord: { word: "succinct", gloss: "briefly and clearly expressed" } }),
  c("v-ubiquitous", "vocab", "Use this word in two sentences about technology.", ["vocabulary", "articulation"], [["ubiquitous"]], 20, ["tech"], { targetWord: { word: "ubiquitous", gloss: "present or found everywhere" } }),
  c("v-catalyst", "vocab", "Use this word in two sentences about a change in your life or work.", ["vocabulary", "articulation"], [["catalyst"]], 20, ["general"], { targetWord: { word: "catalyst", gloss: "something that triggers a change or event" } }),
  c("v-nuance", "vocab", "Use this word while talking about a debate people oversimplify.", ["vocabulary", "articulation"], [["nuance", "nuanced"]], 25, ["culture"], { targetWord: { word: "nuance", gloss: "a subtle difference or distinction" } }),
  c("v-leverage", "vocab", "Use this word — as a noun, not a verb — in a business context.", ["vocabulary", "articulation"], [["leverage"]], 20, ["business"], { targetWord: { word: "leverage", gloss: "the power to influence outcomes beyond your direct effort" } }),
  c("v-arbitrary", "vocab", "Use this word in two sentences about rules.", ["vocabulary", "articulation"], [["arbitrary", "arbitrarily"]], 20, ["general"], { targetWord: { word: "arbitrary", gloss: "based on random choice rather than reason" } }),

  // ---- Speed rounds: pure filler & pace discipline ----
  c("s-commute", "describe", "Thirty seconds: describe your ideal morning, zero filler words.", ["filler", "conciseness"], [["morning"]], 30, ["general"]),
  c("s-job", "explain", "Explain what you do for work — as if to a sharp stranger in an elevator.", ["filler", "conciseness", "articulation"], [["work", "job", "company", "help", "build", "make", "sell"]], 25, ["business"]),
  c("s-movie", "describe", "Pitch the last film or show you loved, in one breath's worth of words.", ["filler", "conciseness"], [["story", "character", "about", "film", "movie", "show", "series"]], 20, ["culture"]),
  c("s-hometown", "describe", "Describe your hometown to someone who will never visit.", ["filler", "vocabulary"], [["town", "city", "place", "people", "streets", "home"]], 30, ["general"]),
  c("s-opinion", "explain", "Give one opinion you hold that most people around you don't — cleanly, no hedging.", ["filler", "articulation"], [["think", "believe", "opinion", "disagree", "most people"]], 30, ["culture"]),
  c("s-teach", "explain", "Teach one thing you know well in twenty seconds flat.", ["conciseness", "articulation", "filler"], [["first", "then", "because", "when", "how"]], 20, ["general"]),
];

/** Pick the next challenge: bias toward the user's weakest axis and their
 * interests; never repeat until the bank is exhausted. */
export function pickChallenge(
  history: string[],
  weakest: Axis | null,
  interests: string[],
): Challenge {
  const seen = new Set(history);
  let pool = CHALLENGES.filter((ch) => !seen.has(ch.id));
  if (pool.length === 0) pool = CHALLENGES; // lap two: recycle the bank
  const scored = pool.map((ch) => {
    let s = Math.random();
    if (weakest && ch.axes.includes(weakest)) s += 0.9; // feed the weak spot
    if (interests.length && ch.tags.some((t) => interests.includes(t))) s += 0.45;
    return { ch, s };
  });
  return scored.reduce((best, cur) => (cur.s > best.s ? cur : best)).ch;
}
