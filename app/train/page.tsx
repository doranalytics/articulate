"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Orb } from "@/components/Orb";
import { RadarChart } from "@/components/RadarChart";
import type { Challenge } from "@/lib/challenges";
import { AXIS_LABEL, pickChallenge } from "@/lib/challenges";
import { countFillers, scoreQuiz, wordsOf, type QuizScore } from "@/lib/scoring";
import { startSpeech, speechSupported, type SpeechSession } from "@/lib/speech";
import { aggregates, loadState, saveState, weakestAxis, type SavedState } from "@/lib/store";

type Phase = "ready" | "listening" | "grading" | "scored" | "chart";

const INTEREST_TAGS = ["tech", "business", "science", "culture", "general"];

export default function Train() {
  const [state, setState] = useState<SavedState | null>(null);
  const [ch, setCh] = useState<Challenge | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [level, setLevel] = useState(0);
  const [liveWords, setLiveWords] = useState(0);
  const [liveFillers, setLiveFillers] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [score, setScore] = useState<QuizScore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [supported, setSupported] = useState(true);

  const session = useRef<SpeechSession | null>(null);
  const finalRef = useRef("");
  const interimRef = useRef("");
  const pausesRef = useRef(0);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef<SavedState | null>(null);
  stateRef.current = state;

  // Hydrate + first challenge.
  useEffect(() => {
    const s = loadState();
    setState(s);
    setSupported(speechSupported());
    setCh(pickChallenge(s.history.map((h) => h.challengeId), weakestAxis(s.history), s.profile.interests));
    return () => session.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback((next: SavedState) => {
    setState(next);
    saveState(next);
  }, []);

  const nextChallenge = useCallback((s: SavedState, lastId?: string) => {
    const seen = s.history.map((h) => h.challengeId);
    if (lastId) seen.push(lastId);
    setCh(pickChallenge(seen, weakestAxis(s.history), s.profile.interests));
    setScore(null);
    setPhase("ready");
    setLiveWords(0);
    setLiveFillers(0);
    setSeconds(0);
  }, []);

  const stopAndGrade = useCallback(() => {
    if (!ch) return;
    session.current?.stop();
    session.current = null;
    if (timer.current) clearInterval(timer.current);
    setPhase("grading");
    const durationMs = Math.max(600, performance.now() - startedAt.current);
    const transcript = (finalRef.current + " " + interimRef.current).trim();
    const result = scoreQuiz(ch, { transcript, durationMs, longPauses: pausesRef.current });
    // A beat of "grading" so the score lands with weight.
    setTimeout(() => {
      setScore(result);
      setPhase("scored");
      const s = stateRef.current ?? loadState();
      const next: SavedState = {
        ...s,
        completed: s.completed + 1,
        history: [
          ...s.history,
          { challengeId: ch.id, overall: result.overall, axes: result.axes, at: new Date().toISOString() },
        ],
      };
      persist(next);
    }, 750);
  }, [ch, persist]);

  const start = useCallback(async () => {
    if (!ch || phase === "listening") return;
    setError(null);
    finalRef.current = "";
    interimRef.current = "";
    pausesRef.current = 0;
    setLiveWords(0);
    setLiveFillers(0);
    setSeconds(0);
    try {
      const sess = await startSpeech({
        onTranscript: (finalText, interim) => {
          finalRef.current = finalText;
          interimRef.current = interim;
          const t = (finalText + " " + interim).trim();
          setLiveWords(wordsOf(t).length);
          setLiveFillers(countFillers(t));
        },
        onLevel: setLevel,
        onLongPause: () => {
          pausesRef.current += 1;
        },
        onEnd: () => {},
        onError: (m) => setError(m),
      });
      session.current = sess;
      startedAt.current = performance.now();
      setPhase("listening");
      timer.current = setInterval(() => {
        setSeconds(Math.floor((performance.now() - startedAt.current) / 1000));
      }, 250);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach the microphone.");
    }
  }, [ch, phase]);

  // Hard cap so a wandering answer grades itself.
  useEffect(() => {
    if (phase === "listening" && seconds >= 90) stopAndGrade();
  }, [phase, seconds, stopAndGrade]);

  const advance = useCallback(() => {
    const s = stateRef.current;
    if (!s || !ch) return;
    if (s.completed > 0 && s.completed % 10 === 0 && phase === "scored") {
      setPhase("chart");
      return;
    }
    nextChallenge(s, ch.id);
  }, [ch, phase, nextChallenge]);

  const skip = useCallback(() => {
    const s = stateRef.current;
    if (!s || !ch || phase === "listening" || phase === "grading") return;
    nextChallenge(s, ch.id);
  }, [ch, phase, nextChallenge]);

  if (!state || !ch) return <main className="min-h-dvh" />;
  const agg = aggregates(state.history);

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-5">
      {/* top bar */}
      <header className="flex items-center justify-between pt-6">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          articulate<span className="text-[var(--gold)]">.</span>
        </Link>
        <span className="font-mono text-[11px] tracking-wider text-[var(--faint)]">
          {state.completed} spoken · {10 - (state.completed % 10)} to scorecard
        </span>
      </header>

      {!supported && (
        <div className="mt-6 rounded-xl border border-[var(--line)] bg-white p-4 text-sm text-[var(--sub)]">
          This browser can&rsquo;t do in-page speech recognition. Open articulate in Chrome, Edge,
          or Safari — the whole app is voice.
        </div>
      )}
      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* ---- the single screen ---- */}
      {phase !== "chart" && (
        <section className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          {/* prompt */}
          <p className="fade-up max-w-md text-xl font-medium leading-snug tracking-tight sm:text-2xl" key={ch.id}>
            {ch.prompt}
          </p>

          {/* visual / target word */}
          {ch.visual && (
            <div className="fade-up mt-8 select-none text-6xl leading-none tracking-[0.2em] sm:text-7xl">{ch.visual}</div>
          )}
          {ch.targetWord && (
            <div className="fade-up mt-8">
              <span className="text-3xl font-semibold tracking-tight text-[var(--green)]">
                {ch.targetWord.word}
              </span>
              <p className="mt-1 text-sm italic text-[var(--sub)]">{ch.targetWord.gloss}</p>
            </div>
          )}

          {/* scored panel */}
          {phase === "scored" && score && (
            <div className="score-pop mt-8 w-full max-w-sm rounded-2xl border border-[var(--line)] bg-white p-6 shadow-sm">
              <div className="font-mono text-6xl font-semibold tracking-tight text-[var(--green)]">
                {score.overall}
              </div>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {Object.entries(score.axes).map(([axis, v]) => (
                  <span key={axis} className="rounded-full bg-[var(--bg)] px-3 py-1 font-mono text-[11px] text-[var(--sub)]">
                    {AXIS_LABEL[axis as keyof typeof AXIS_LABEL]} {v}
                  </span>
                ))}
              </div>
              <div className="mt-3 space-y-1 text-[13px] leading-snug text-[var(--sub)]">
                {score.notes.map((n, i) => (
                  <p key={i}>{n}</p>
                ))}
              </div>
              <p className="mt-3 font-mono text-[11px] text-[var(--faint)]">
                {score.words} words · {score.wpm} wpm · {score.fillerCount} filler
              </p>
            </div>
          )}

          {/* orb + controls */}
          <div className="mt-8 flex flex-col items-center">
            {phase === "ready" && (
              <>
                <Orb size={110} onClick={start} label="speak" level={0} />
                <button onClick={skip} className="mt-3 text-xs tracking-wide text-[var(--faint)] transition-colors hover:text-[var(--sub)]">
                  not this one — skip ↓
                </button>
              </>
            )}
            {phase === "listening" && (
              <>
                <Orb size={110} listening level={level} onClick={stopAndGrade} label="done" />
                <div className="mt-3 flex items-center gap-4 font-mono text-[12px] text-[var(--sub)]">
                  <span>{seconds}s / ~{ch.idealSeconds}s</span>
                  <span>{liveWords} words</span>
                  <span className={liveFillers > 0 ? "text-[var(--gold)]" : ""}>{liveFillers} filler</span>
                </div>
              </>
            )}
            {phase === "grading" && (
              <p className="mt-6 animate-pulse text-sm italic text-[var(--sub)]">listening back…</p>
            )}
            {phase === "scored" && (
              <div className="flex items-center gap-3">
                <button
                  onClick={advance}
                  className="rounded-full bg-[var(--green)] px-8 py-3 text-sm font-medium text-white transition-transform hover:scale-[1.02] active:scale-95"
                >
                  next →
                </button>
              </div>
            )}
          </div>

          {/* tracked axes */}
          {(phase === "ready" || phase === "listening") && (
            <div className="mt-8 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--faint)]">scoring</span>
              {ch.axes.map((a) => (
                <span key={a} className="rounded-full border border-[var(--line)] px-2.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--sub)]">
                  {AXIS_LABEL[a]}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ---- every-10 scorecard ---- */}
      {phase === "chart" && (
        <section className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <p className="text-[11px] uppercase tracking-[0.25em] text-[var(--sub)]">
            {state.completed} challenges in — your shape
          </p>
          <div className="mt-4">
            <RadarChart scores={agg} />
          </div>
          <p className="mt-2 max-w-xs text-sm text-[var(--sub)]">
            The fuller the square, the fuller the speaker. Short legs get fed to you more often.
          </p>
          <button
            onClick={() => nextChallenge(state, ch.id)}
            className="mt-8 rounded-full bg-[var(--green)] px-8 py-3 text-sm font-medium text-white transition-transform hover:scale-[1.02] active:scale-95"
          >
            keep going →
          </button>
        </section>
      )}

      {/* minimal menu */}
      <footer className="flex items-center justify-center pb-6">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="rounded-full border border-[var(--line)] px-5 py-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--sub)] transition-colors hover:border-[var(--green)] hover:text-[var(--green)]"
        >
          {menuOpen ? "close" : "menu"}
        </button>
      </footer>

      {menuOpen && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/20 backdrop-blur-[2px]" onClick={() => setMenuOpen(false)}>
          <div
            className="fade-up mb-0 max-h-[80dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-[var(--line)] bg-[var(--bg)] p-6 sm:mb-6 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center">
              <p className="text-[11px] uppercase tracking-[0.25em] text-[var(--sub)]">your shape so far</p>
              <RadarChart scores={agg} animate={false} size={220} />
              <p className="font-mono text-[11px] text-[var(--faint)]">{state.completed} challenges spoken · guest — progress lives on this device</p>
            </div>

            <div className="mt-6">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--sub)]">feed me more of</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {INTEREST_TAGS.map((tag) => {
                  const on = state.profile.interests.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => {
                        const interests = on
                          ? state.profile.interests.filter((t) => t !== tag)
                          : [...state.profile.interests, tag];
                        persist({ ...state, profile: { ...state.profile, interests } });
                      }}
                      className={`rounded-full border px-3.5 py-1 text-xs transition-colors ${
                        on ? "border-[var(--green)] bg-[var(--green)] text-white" : "border-[var(--line)] text-[var(--sub)]"
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <Link href="/" className="text-xs text-[var(--sub)] underline-offset-4 hover:underline">
                about articulate
              </Link>
              <button
                onClick={() => {
                  if (window.confirm("Erase all progress on this device?")) {
                    persist({ history: [], profile: { interests: [], role: "" }, completed: 0 });
                    setMenuOpen(false);
                  }
                }}
                className="text-xs text-[var(--faint)] hover:text-red-600"
              >
                reset progress
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
