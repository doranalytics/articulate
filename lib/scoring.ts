// Deterministic, keyless scoring. Everything derives from the transcript and
// the mic timing — no model call. Calibrated so 100 is genuinely rare: full
// coverage, zero filler, ideal pace, inside the time budget.

import type { Axis, Challenge } from "./challenges";

export interface SpeechSample {
  transcript: string;
  /** ms from first speech to stop */
  durationMs: number;
  /** silences > 700ms detected while speaking (from the audio level meter) */
  longPauses: number;
}

export interface QuizScore {
  overall: number;
  axes: Partial<Record<Axis, number>>;
  words: number;
  wpm: number;
  fillerCount: number;
  coverage: number; // 0..1 keyword-group coverage
  notes: string[];
}

const FILLERS = [
  "um", "uh", "uhm", "erm", "hmm", "like", "you know", "sort of", "kind of",
  "basically", "actually", "literally", "i mean", "i guess", "or whatever",
  "stuff like that", "things like that", "et cetera", "right so", "okay so",
];

// The ~1000 most common English lemmas start-fragment; words outside this set
// and 7+ letters count as "reaching" vocabulary. Compact proxy, not a corpus.
const COMMON = new Set(
  "the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us are is was were been has had did says said doing made going gone very much many where why before too here still such own same each few both between never always often really thing things something anything nothing everything someone anyone everyone person man woman child world life hand part eye place case week company system program question government number night point home water room mother area money story fact month lot right study book job word business issue side kind head house service friend father power hour game line end member law car city community name team minute idea body information face others level office door health art war history result change morning reason research girl guy moment air teacher force education foot boy age policy process music market sense nation plan college interest death experience effect".split(/\s+/),
);

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function countFillers(transcript: string): number {
  const t = " " + transcript.toLowerCase().replace(/[^a-z' ]+/g, " ").replace(/\s+/g, " ") + " ";
  let count = 0;
  for (const f of FILLERS) {
    const re = new RegExp(` ${f.replace(/ /g, " ")}(?= )`, "g");
    count += (t.match(re) ?? []).length;
  }
  return count;
}

export function wordsOf(transcript: string): string[] {
  return transcript.toLowerCase().replace(/[^a-z' ]+/g, " ").split(/\s+/).filter(Boolean);
}

function coverageOf(transcript: string, groups: string[][]): number {
  if (!groups.length) return 1;
  const t = " " + transcript.toLowerCase().replace(/[^a-z' ]+/g, " ").replace(/\s+/g, " ") + " ";
  let hit = 0;
  for (const group of groups) {
    if (group.some((k) => t.includes(` ${k.toLowerCase()} `) || t.includes(` ${k.toLowerCase()}s `))) hit++;
  }
  return hit / groups.length;
}

export function scoreQuiz(ch: Challenge, s: SpeechSample): QuizScore {
  const words = wordsOf(s.transcript);
  const n = words.length;
  const minutes = Math.max(s.durationMs, 1500) / 60000;
  const wpm = n / minutes;
  const fillerCount = countFillers(s.transcript);
  const coverage = coverageOf(s.transcript, ch.keywords);
  const notes: string[] = [];

  if (n < 6) {
    // Too little signal to grade meaningfully.
    const axes = Object.fromEntries(ch.axes.map((a) => [a, 5])) as Partial<Record<Axis, number>>;
    return { overall: 5, axes, words: n, wpm: 0, fillerCount, coverage, notes: ["Barely anything to grade — say it out loud, even roughly."] };
  }

  // ---- filler: rate per 100 words + long pauses ----
  const fillerRate = (fillerCount / n) * 100;
  let filler = 100 - fillerRate * 14 - s.longPauses * 7;
  if (fillerRate === 0 && s.longPauses <= 1) filler = Math.min(100, filler + 4);
  if (fillerRate > 2) notes.push(`${fillerCount} filler words — that's ${fillerRate.toFixed(1)} per 100.`);
  if (s.longPauses >= 3) notes.push(`${s.longPauses} long pauses. A beat is fine; a gap loses the room.`);

  // ---- conciseness: cover the ground inside the budget ----
  const budgetWords = ch.idealSeconds * 2.4; // ~145wpm on the budget
  const overrun = Math.max(0, n - budgetWords) / budgetWords;
  const overtime = Math.max(0, s.durationMs / 1000 - ch.idealSeconds * 1.4) / ch.idealSeconds;
  let conciseness = coverage * 100 - overrun * 55 - overtime * 30;
  if (coverage >= 0.99 && overrun === 0) conciseness = Math.min(100, conciseness + 6);
  if (overrun > 0.5) notes.push("Meandering — the same ground fits in half the words.");
  if (coverage < 0.7 && n > budgetWords) notes.push("Long and still incomplete: words spent, ground uncovered.");

  // ---- vocabulary: range, reach, and (for drills) deployment ----
  const unique = new Set(words);
  const ttr = unique.size / n; // type-token ratio
  const reaching = words.filter((w) => w.length >= 7 && !COMMON.has(w)).length;
  const reachRate = (reaching / n) * 100;
  let vocabulary = ttr * 90 + Math.min(28, reachRate * 3.2);
  if (ch.targetWord) {
    const used = words.includes(ch.targetWord.word.toLowerCase()) || coverage > 0;
    vocabulary = used ? Math.min(100, vocabulary + 30) : Math.min(30, vocabulary);
    if (!used) notes.push(`You never said "${ch.targetWord.word}".`);
  }
  if (ttr < 0.5) notes.push("Lots of repeated words — reach for a second way to say it.");

  // ---- articulation: coverage, pace band, delivery ----
  const paceBand = wpm >= 115 && wpm <= 175 ? 1 : wpm >= 90 && wpm <= 200 ? 0.75 : 0.45;
  const pauseDiscipline = s.longPauses <= 1 ? 1 : s.longPauses <= 3 ? 0.8 : 0.55;
  let articulation = coverage * 62 + paceBand * 24 + pauseDiscipline * 14;
  if (wpm > 185) notes.push(`${Math.round(wpm)} wpm — racing. Land the sentence.`);
  if (wpm < 100) notes.push(`${Math.round(wpm)} wpm — too slow for conversation.`);
  if (coverage < 0.67) notes.push("The core of it went unsaid — check what the prompt actually asked for.");

  const all: Record<Axis, number> = {
    filler: clamp(filler),
    conciseness: clamp(conciseness),
    vocabulary: clamp(vocabulary),
    articulation: clamp(articulation),
  };
  const axes = Object.fromEntries(ch.axes.map((a) => [a, all[a]])) as Partial<Record<Axis, number>>;
  const overall = clamp(ch.axes.reduce((sum, a) => sum + all[a], 0) / ch.axes.length);
  if (overall >= 90) notes.unshift("Sharp. That's how it's done.");
  else if (overall >= 75) notes.unshift("Solid — tighten one screw and this is excellent.");
  return { overall, axes, words: n, wpm: Math.round(wpm), fillerCount, coverage, notes: notes.slice(0, 3) };
}
