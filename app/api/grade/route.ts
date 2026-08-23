import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { countFillers, wordsOf } from "@/lib/scoring";

export const maxDuration = 30;

// Claude grades the substance (conciseness, vocabulary, articulation); the
// deterministic engine keeps what it's strictly better at — counting filler
// words and pauses. Haiku: ~1s, a fraction of a cent per quiz.
const MODEL = "claude-haiku-4-5";

const SYSTEM = `You grade spoken answers for "articulate", a voice-only training app. You receive a challenge, the user's raw speech transcript (from browser speech recognition — expect missing punctuation and occasional mis-hearings; never penalize transcription artifacts), and measured delivery signals.

Score 0-100 per requested axis. Calibrate hard: 90+ means genuinely impressive — a sharp, complete, elegant answer an excellent communicator would give on the spot. 70s = solid with clear slack. 50s = mediocre. Below 40 = missed the point. A score of 100 should almost never happen.

Axes:
- conciseness: did they cover the actual substance inside the time budget, with no meandering, restarts, or backtracking? Long AND incomplete is the worst case.
- vocabulary: range and precision of word choice; credit exact, vivid, well-deployed words, not rare words used badly. If a target word was assigned, using it correctly dominates this score.
- articulation: how well the thing was actually explained — correct, complete, well-structured, would a smart listener now understand it? Weigh the measured pace (ideal 115-175 wpm) and pauses lightly.

Respond with ONLY strict JSON, no fences:
{"axes": {"<axis>": <0-100 integer>, ...}, "notes": ["<2-3 short, blunt, useful coaching notes — second person, no flattery>"]}
Only include the axes requested. Notes name the single biggest thing to fix first.`;

interface GradeRequest {
  challenge: {
    kind: string;
    prompt: string;
    visual?: string;
    targetWord?: { word: string; gloss: string };
    axes: string[];
    idealSeconds: number;
  };
  transcript: string;
  durationMs: number;
  longPauses: number;
}

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(req: Request) {
  let body: GradeRequest;
  try {
    body = (await req.json()) as GradeRequest;
  } catch {
    return bad("bad request");
  }
  const { challenge, transcript, durationMs, longPauses } = body ?? {};
  if (!challenge?.prompt || typeof transcript !== "string" || transcript.length > 8000) return bad("bad request");
  const askAxes = (challenge.axes ?? []).filter((a) => ["conciseness", "vocabulary", "articulation"].includes(a));

  const words = wordsOf(transcript);
  const wpm = Math.round(words.length / (Math.max(durationMs ?? 0, 1500) / 60000));
  const fillerCount = countFillers(transcript);

  if (askAxes.length === 0) {
    // Filler-only challenge: nothing for the model to judge.
    return NextResponse.json({ axes: {}, notes: [] });
  }

  const user = JSON.stringify({
    challenge: {
      kind: challenge.kind,
      prompt: challenge.prompt,
      visual: challenge.visual,
      targetWord: challenge.targetWord,
      timeBudgetSeconds: challenge.idealSeconds,
    },
    gradeTheseAxes: askAxes,
    transcript,
    measured: {
      words: words.length,
      seconds: Math.round((durationMs ?? 0) / 1000),
      wordsPerMinute: wpm,
      fillerWords: fillerCount,
      longPauses: longPauses ?? 0,
    },
  });

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: [{ type: "text" as const, text: SYSTEM, cache_control: { type: "ephemeral" as const } }],
      messages: [{ role: "user", content: user }],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "");
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    const parsed = JSON.parse(text.slice(first, last + 1)) as {
      axes: Record<string, number>;
      notes: string[];
    };
    const axes: Record<string, number> = {};
    for (const a of askAxes) {
      const v = parsed.axes?.[a];
      if (typeof v !== "number" || Number.isNaN(v)) throw new Error("missing axis");
      axes[a] = Math.max(0, Math.min(100, Math.round(v)));
    }
    const notes = (parsed.notes ?? []).filter((n) => typeof n === "string").slice(0, 3);
    return NextResponse.json({ axes, notes });
  } catch {
    // The client falls back to its local engine.
    return bad("grader unavailable", 502);
  }
}
