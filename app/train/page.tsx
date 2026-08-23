"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { GreenOrb } from "@/components/GreenOrb";
import { RadarChart } from "@/components/RadarChart";
import type { Axis, Challenge } from "@/lib/challenges";
import { AXIS_LABEL, pickChallenge } from "@/lib/challenges";
import { countFillers, scoreQuiz, wordsOf, type QuizScore } from "@/lib/scoring";
import { startSpeech, speechSupported, type SpeechSession } from "@/lib/speech";
import { aggregates, loadState, saveState, weakestAxis, type SavedState } from "@/lib/store";

type Phase = "ready" | "listening" | "grading" | "scored" | "chart";

const INTEREST_TAGS = ["tech", "business", "science", "culture", "general"];
const FREE_GAMES = 10;
const MEMBER_KEY = "articulate_member_v1";

interface MemberToken {
  token: string;
  exp: number; // epoch seconds
}

function loadMember(): MemberToken | null {
  try {
    const raw = localStorage.getItem(MEMBER_KEY);
    if (raw) return JSON.parse(raw) as MemberToken;
  } catch {}
  return null;
}

function saveMember(m: MemberToken | null) {
  try {
    if (m) localStorage.setItem(MEMBER_KEY, JSON.stringify(m));
    else localStorage.removeItem(MEMBER_KEY);
  } catch {}
}

export default function Train() {
  const [state, setState] = useState<SavedState | null>(null);
  const [ch, setCh] = useState<Challenge | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [level, setLevel] = useState(0);
  const [liveText, setLiveText] = useState("");
  const [liveFillers, setLiveFillers] = useState(0);
  const [liveWords, setLiveWords] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [score, setScore] = useState<QuizScore & { gradedBy?: "ai" | "local" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [supported, setSupported] = useState(true);
  const [member, setMember] = useState(false);
  const [payBusy, setPayBusy] = useState<string | null>(null);
  const [restoreEmail, setRestoreEmail] = useState("");
  const [payError, setPayError] = useState<string | null>(null);

  const session = useRef<SpeechSession | null>(null);
  const finalRef = useRef("");
  const interimRef = useRef("");
  const pausesRef = useRef(0);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef<SavedState | null>(null);
  const transcriptBox = useRef<HTMLDivElement>(null);
  stateRef.current = state;

  // ---- membership ----
  const adoptToken = useCallback((t: MemberToken) => {
    saveMember(t);
    setMember(true);
  }, []);

  const refreshToken = useCallback(async (token: string) => {
    try {
      const res = await fetch("/api/entitlement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        adoptToken((await res.json()) as MemberToken);
        return true;
      }
      if (res.status === 402) {
        saveMember(null);
        setMember(false);
      }
    } catch {}
    return false;
  }, [adoptToken]);

  useEffect(() => {
    const s = loadState();
    setState(s);
    setSupported(speechSupported());
    setCh(pickChallenge(s.history.map((h) => h.challengeId), weakestAxis(s.history), s.profile.interests));

    // Back from Stripe Checkout?
    const params = new URLSearchParams(window.location.search);
    const cs = params.get("cs");
    if (cs) {
      window.history.replaceState({}, "", "/train");
      void fetch("/api/entitlement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: cs }),
      }).then(async (res) => {
        if (res.ok) adoptToken((await res.json()) as MemberToken);
      });
    }

    const stored = loadMember();
    if (stored) {
      const now = Date.now() / 1000;
      if (stored.exp > now + 60) {
        setMember(true);
        if (stored.exp - now < 3 * 86400) void refreshToken(stored.token); // quiet renew
      } else {
        void refreshToken(stored.token);
      }
    }
    return () => session.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback((next: SavedState) => {
    setState(next);
    saveState(next);
  }, []);

  const locked = !member && (state?.completed ?? 0) >= FREE_GAMES;

  const startCheckout = useCallback(async (plan: "monthly" | "annual") => {
    setPayBusy(plan);
    setPayError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "checkout failed");
      window.location.href = data.url;
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "checkout failed");
      setPayBusy(null);
    }
  }, []);

  const restore = useCallback(async () => {
    const email = restoreEmail.trim();
    if (!email) return;
    setPayBusy("restore");
    setPayError(null);
    try {
      const res = await fetch("/api/entitlement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as MemberToken & { error?: string };
      if (!res.ok) throw new Error(data.error || "no membership found");
      adoptToken(data);
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "no membership found");
    } finally {
      setPayBusy(null);
    }
  }, [restoreEmail, adoptToken]);

  // ---- the quiz loop ----
  const nextChallenge = useCallback((s: SavedState, lastId?: string) => {
    const seen = s.history.map((h) => h.challengeId);
    if (lastId) seen.push(lastId);
    setCh(pickChallenge(seen, weakestAxis(s.history), s.profile.interests));
    setScore(null);
    setPhase("ready");
    setLiveText("");
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
    const local = scoreQuiz(ch, { transcript, durationMs, longPauses: pausesRef.current });

    const finish = (result: QuizScore & { gradedBy: "ai" | "local" }) => {
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
    };

    const wantAi = ch.axes.some((a) => a !== "filler") && wordsOf(transcript).length >= 6;
    if (!wantAi) {
      finish({ ...local, gradedBy: "local" });
      return;
    }

    void fetch("/api/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challenge: {
          kind: ch.kind,
          prompt: ch.prompt,
          visual: ch.visual,
          targetWord: ch.targetWord,
          axes: ch.axes,
          idealSeconds: ch.idealSeconds,
        },
        transcript,
        durationMs,
        longPauses: pausesRef.current,
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("grader unavailable");
        const ai = (await res.json()) as { axes: Partial<Record<Axis, number>>; notes: string[] };
        // Claude judges substance; the meter keeps the filler axis.
        const axes: Partial<Record<Axis, number>> = { ...local.axes };
        for (const a of ch.axes) {
          if (a !== "filler" && typeof ai.axes[a] === "number") axes[a] = ai.axes[a];
        }
        const overall = Math.round(
          ch.axes.reduce((sum, a) => sum + (axes[a] ?? 0), 0) / ch.axes.length,
        );
        finish({
          ...local,
          axes,
          overall,
          notes: ai.notes.length ? ai.notes : local.notes,
          gradedBy: "ai",
        });
      })
      .catch(() => finish({ ...local, gradedBy: "local" }));
  }, [ch, persist]);

  const start = useCallback(async () => {
    if (!ch || phase === "listening" || locked) return;
    setError(null);
    finalRef.current = "";
    interimRef.current = "";
    pausesRef.current = 0;
    setLiveText("");
    setLiveWords(0);
    setLiveFillers(0);
    setSeconds(0);
    try {
      const sess = await startSpeech({
        onTranscript: (finalText, interim) => {
          finalRef.current = finalText;
          interimRef.current = interim;
          const t = (finalText + " " + interim).trim();
          setLiveText(t);
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
  }, [ch, phase, locked]);

  useEffect(() => {
    if (phase === "listening" && seconds >= 90) stopAndGrade();
  }, [phase, seconds, stopAndGrade]);

  // Keep the live transcript pinned to its tail.
  useEffect(() => {
    const el = transcriptBox.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [liveText]);

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
  const freeLeft = Math.max(0, FREE_GAMES - state.completed);
  const orbEnergy =
    phase === "listening" ? 0.3 + level * 0.7 : phase === "grading" ? 0.9 : 0.15;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-5">
      <header className="flex items-center justify-between pt-6">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          articulate<span className="text-[var(--gold)]">.</span>
        </Link>
        <span className="font-mono text-[11px] tracking-wider text-[var(--faint)]">
          {member
            ? `${state.completed} spoken · member`
            : `${state.completed} spoken · ${freeLeft} free left`}
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

      {/* ---- paywall ---- */}
      {locked && phase !== "chart" && (
        <section className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <GreenOrb energy={0.35} size={120} />
          <h2 className="mt-6 text-2xl font-semibold tracking-tight">
            Your ten free challenges are spoken<span className="text-[var(--gold)]">.</span>
          </h2>
          <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-[var(--sub)]">
            Membership is unlimited challenges, AI grading on every answer, and your evolving
            scorecard. Cancel anytime.
          </p>

          <div className="mt-8 grid w-full max-w-sm gap-3">
            <button
              onClick={() => startCheckout("annual")}
              disabled={payBusy !== null}
              className="relative rounded-2xl border-2 border-[var(--green)] bg-white p-5 text-left transition-transform hover:scale-[1.01] disabled:opacity-50"
            >
              <span className="absolute -top-2.5 right-4 rounded-full bg-[var(--gold)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                save 33%
              </span>
              <div className="text-lg font-semibold">
                $10<span className="text-sm font-normal text-[var(--sub)]"> / month</span>
              </div>
              <div className="text-xs text-[var(--sub)]">billed annually — $120/yr</div>
              {payBusy === "annual" && <div className="mt-1 text-xs text-[var(--green)]">opening checkout…</div>}
            </button>
            <button
              onClick={() => startCheckout("monthly")}
              disabled={payBusy !== null}
              className="rounded-2xl border border-[var(--line)] bg-white p-5 text-left transition-transform hover:scale-[1.01] disabled:opacity-50"
            >
              <div className="text-lg font-semibold">
                $15<span className="text-sm font-normal text-[var(--sub)]"> / month</span>
              </div>
              <div className="text-xs text-[var(--sub)]">billed monthly</div>
              {payBusy === "monthly" && <div className="mt-1 text-xs text-[var(--green)]">opening checkout…</div>}
            </button>
          </div>

          <div className="mt-6 w-full max-w-sm">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--faint)]">already a member?</p>
            <div className="mt-2 flex gap-2">
              <input
                type="email"
                value={restoreEmail}
                onChange={(e) => setRestoreEmail(e.target.value)}
                placeholder="your receipt email"
                className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--green)]"
              />
              <button
                onClick={restore}
                disabled={payBusy !== null || !restoreEmail.includes("@")}
                className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-40"
              >
                restore
              </button>
            </div>
          </div>
          {payError && <p className="mt-3 text-sm text-red-700">{payError}</p>}
        </section>
      )}

      {/* ---- the single screen ---- */}
      {!locked && phase !== "chart" && (
        <section className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <p className="fade-up max-w-md text-xl font-medium leading-snug tracking-tight sm:text-2xl" key={ch.id}>
            {ch.prompt}
          </p>

          {ch.visual && phase !== "listening" && (
            <div className="fade-up mt-8 select-none text-6xl leading-none tracking-[0.2em] sm:text-7xl">{ch.visual}</div>
          )}
          {ch.visual && phase === "listening" && (
            <div className="mt-6 select-none text-4xl leading-none tracking-[0.15em]">{ch.visual}</div>
          )}
          {ch.targetWord && (
            <div className="fade-up mt-8">
              <span className="text-3xl font-semibold tracking-tight text-[var(--green)]">
                {ch.targetWord.word}
              </span>
              <p className="mt-1 text-sm italic text-[var(--sub)]">{ch.targetWord.gloss}</p>
            </div>
          )}

          {/* live transcript — your words, as you say them */}
          {phase === "listening" && (
            <div
              ref={transcriptBox}
              className="mt-6 max-h-28 w-full max-w-md overflow-y-auto rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3 text-left text-[15px] leading-relaxed text-[var(--ink)]"
            >
              {liveText ? (
                <>
                  {liveText}
                  <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-[var(--green)] align-middle" />
                </>
              ) : (
                <span className="italic text-[var(--faint)]">listening…</span>
              )}
            </div>
          )}

          {phase === "scored" && score && (
            <div className="score-pop mt-8 w-full max-w-sm rounded-2xl border border-[var(--line)] bg-white p-6 shadow-sm">
              <div className="font-mono text-6xl font-semibold tracking-tight text-[var(--green)]">
                {score.overall}
              </div>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {Object.entries(score.axes).map(([axis, v]) => (
                  <span key={axis} className="rounded-full bg-[var(--bg)] px-3 py-1 font-mono text-[11px] text-[var(--sub)]">
                    {AXIS_LABEL[axis as Axis]} {v}
                  </span>
                ))}
              </div>
              <div className="mt-3 space-y-1 text-[13px] leading-snug text-[var(--sub)]">
                {score.notes.map((n, i) => (
                  <p key={i}>{n}</p>
                ))}
              </div>
              <p className="mt-3 font-mono text-[11px] text-[var(--faint)]">
                {score.words} words · {score.wpm} wpm · {score.fillerCount} filler ·{" "}
                {score.gradedBy === "ai" ? "AI graded" : "meter graded"}
              </p>
            </div>
          )}

          <div className="mt-8 flex flex-col items-center">
            {phase === "ready" && (
              <>
                <GreenOrb energy={orbEnergy} size={150} onClick={start} label="speak" ariaLabel="Start speaking" />
                <button onClick={skip} className="mt-2 text-xs tracking-wide text-[var(--faint)] transition-colors hover:text-[var(--sub)]">
                  not this one — skip ↓
                </button>
              </>
            )}
            {phase === "listening" && (
              <>
                <GreenOrb energy={orbEnergy} size={150} onClick={stopAndGrade} label="done" ariaLabel="Stop and grade" />
                <div className="mt-2 flex items-center gap-4 font-mono text-[12px] text-[var(--sub)]">
                  <span>{seconds}s / ~{ch.idealSeconds}s</span>
                  <span>{liveWords} words</span>
                  <span className={liveFillers > 0 ? "text-[var(--gold)]" : ""}>{liveFillers} filler</span>
                </div>
              </>
            )}
            {phase === "grading" && (
              <>
                <GreenOrb energy={0.9} size={150} ariaLabel="Grading" />
                <p className="mt-2 animate-pulse text-sm italic text-[var(--sub)]">listening back…</p>
              </>
            )}
            {phase === "scored" && (
              <button
                onClick={advance}
                className="rounded-full bg-[var(--green)] px-8 py-3 text-sm font-medium text-white transition-transform hover:scale-[1.02] active:scale-95"
              >
                next →
              </button>
            )}
          </div>

          {(phase === "ready" || phase === "listening") && (
            <div className="mt-7 flex items-center gap-2">
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
              <p className="font-mono text-[11px] text-[var(--faint)]">
                {state.completed} challenges spoken · {member ? "member" : "guest — progress lives on this device"}
              </p>
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
