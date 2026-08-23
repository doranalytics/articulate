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
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import posthog from "posthog-js";

type Phase = "ready" | "listening" | "grading" | "scored" | "chart";

const INTEREST_TAGS = ["tech", "business", "science", "culture", "general"];
const FREE_GAMES = 10;
const MEMBER_KEY = "articulate_member_v1";

// One concrete drill per axis, surfaced under a weak scorecard.
const AXIS_TIP: Record<Axis, string> = {
  conciseness: "Do the 30-second version: say the three things that matter, then stop talking.",
  vocabulary: "Upgrade one word per answer — swap the word you always reach for with a sharper one.",
  articulation: "Give it a spine: what it is, how it works, why it matters — then land the ending.",
  filler: "Pause instead of filling. Silence reads as confidence; “um” reads as doubt.",
};

function scoreColor(v: number) {
  return v >= 80 ? "var(--green)" : v >= 60 ? "var(--gold)" : "#b0432f";
}

function verdictOf(v: number) {
  if (v >= 90) return "exceptional";
  if (v >= 80) return "strong";
  if (v >= 65) return "solid — room to tighten";
  if (v >= 45) return "rough — worth a second run";
  return "missed it — run it back";
}

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
  const [sheet, setSheet] = useState<null | "profile" | "join">(null);
  const [plan, setPlan] = useState<"monthly" | "annual">("annual");
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [joinedEmail, setJoinedEmail] = useState<string | null>(null);
  const [buyerEmail, setBuyerEmail] = useState("");
  const [skipped, setSkipped] = useState<Challenge[]>([]);
  const [supported, setSupported] = useState(true);
  const [member, setMember] = useState(false);
  const [payBusy, setPayBusy] = useState<string | null>(null);
  const [restoreEmail, setRestoreEmail] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [acctEmail, setAcctEmail] = useState("");
  const [authSent, setAuthSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [customTag, setCustomTag] = useState("");

  const session = useRef<SpeechSession | null>(null);
  const sbSession = useRef<Session | null>(null);
  const memberRef = useRef(false);
  const finalRef = useRef("");
  const interimRef = useRef("");
  const pausesRef = useRef(0);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef<SavedState | null>(null);
  const transcriptBox = useRef<HTMLDivElement>(null);
  stateRef.current = state;
  memberRef.current = member;

  // ---- membership ----
  const adoptToken = useCallback((t: MemberToken) => {
    if (!memberRef.current) posthog.capture("member_activated");
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
        if (res.ok) {
          const d = (await res.json()) as MemberToken & { email?: string };
          adoptToken(d);
          if (d.email) setJoinedEmail(d.email);
        }
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
    // Mirror to the cloud when signed in — fire and forget, local is truth.
    const sess = sbSession.current;
    const sb = supabase();
    if (sess && sb) {
      void sb
        .from("user_state")
        .upsert({
          user_id: sess.user.id,
          email: sess.user.email ?? null,
          state: next,
          updated_at: new Date().toISOString(),
        })
        .then(() => {});
    }
  }, []);

  // On sign-in: pull the cloud copy, keep whichever run is further along,
  // then push the winner back and check the verified email for a membership.
  const syncFromCloud = useCallback(
    async (sess: Session) => {
      const sb = supabase();
      if (!sb) return;
      const local = stateRef.current ?? loadState();
      try {
        const { data } = await sb
          .from("user_state")
          .select("state")
          .eq("user_id", sess.user.id)
          .maybeSingle();
        const remote = (data?.state ?? null) as SavedState | null;
        const winner = remote && remote.completed > local.completed ? remote : local;
        const interests = Array.from(
          new Set([...(local.profile.interests ?? []), ...(remote?.profile.interests ?? [])]),
        );
        persist({ ...winner, profile: { ...winner.profile, interests } });
      } catch {}
      if (!memberRef.current) {
        try {
          const res = await fetch("/api/entitlement", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ supabase_token: sess.access_token }),
          });
          if (res.ok) adoptToken((await res.json()) as MemberToken);
        } catch {}
      }
    },
    [persist, adoptToken],
  );

  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    void sb.auth.getSession().then(({ data }) => {
      sbSession.current = data.session;
      setAuthEmail(data.session?.user.email ?? null);
    });
    const { data: sub } = sb.auth.onAuthStateChange((event, sess) => {
      sbSession.current = sess;
      setAuthEmail(sess?.user.email ?? null);
      if (event === "SIGNED_IN" && sess) void syncFromCloud(sess);
    });
    return () => sub.subscription.unsubscribe();
  }, [syncFromCloud]);

  const sendMagicLink = useCallback(async () => {
    const sb = supabase();
    const email = acctEmail.trim();
    if (!sb || !email.includes("@")) return;
    setAuthError(null);
    const { error: err } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/train` },
    });
    if (err) setAuthError(err.message);
    else {
      setAuthSent(true);
      posthog.capture("magic_link_sent");
    }
  }, [acctEmail]);

  const signOut = useCallback(async () => {
    await supabase()?.auth.signOut();
    sbSession.current = null;
    setAuthEmail(null);
    setAuthSent(false);
  }, []);

  const locked = !member && (state?.completed ?? 0) >= FREE_GAMES;

  useEffect(() => {
    if (locked) posthog.capture("paywall_shown");
  }, [locked]);

  const startCheckout = useCallback(async (plan: "monthly" | "annual") => {
    posthog.capture("checkout_started", { plan });
    setPayBusy(plan);
    setPayError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          email:
            sbSession.current?.user.email ??
            (buyerEmail.includes("@") ? buyerEmail.trim() : undefined),
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "checkout failed");
      window.location.href = data.url;
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "checkout failed");
      setPayBusy(null);
    }
  }, [buyerEmail]);

  // Restore = prove you own the email. A magic link signs them in, and the
  // SIGNED_IN handler exchanges the verified session for membership.
  const [restoreSent, setRestoreSent] = useState(false);
  const restore = useCallback(async () => {
    const email = restoreEmail.trim();
    if (!email) return;
    setPayBusy("restore");
    setPayError(null);
    const { error: err } = await supabase().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/train` },
    });
    if (err) setPayError("Couldn't send the link — check the address and try again.");
    else setRestoreSent(true);
    setPayBusy(null);
  }, [restoreEmail]);

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
      setSkipped([]);
      posthog.capture("challenge_completed", {
        overall: result.overall,
        graded_by: result.gradedBy,
        completed_total: next.completed,
      });
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
    setSkipped((prev) => [...prev, ch]);
    nextChallenge(s, ch.id);
  }, [ch, phase, nextChallenge]);

  // Skipped challenges can be revisited; completing one burns the bridge.
  const goBack = useCallback(() => {
    if (phase !== "ready") return;
    setSkipped((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      setCh(last);
      setScore(null);
      setLiveText("");
      setLiveWords(0);
      setLiveFillers(0);
      setSeconds(0);
      return prev.slice(0, -1);
    });
  }, [phase]);

  // Same challenge, fresh attempt — the "run it back" path off a weak score.
  const retry = useCallback(() => {
    setScore(null);
    setPhase("ready");
    setLiveText("");
    setLiveWords(0);
    setLiveFillers(0);
    setSeconds(0);
  }, []);

  // Scroll / swipe skips the challenge (TikTok rules) — ready phase only.
  const wheelAcc = useRef(0);
  const wheelAt = useRef(0);
  const skipCooldown = useRef(0);
  const touchY = useRef<number | null>(null);
  useEffect(() => {
    if (phase !== "ready" || locked || sheet !== null) return;
    const onWheel = (e: WheelEvent) => {
      const now = performance.now();
      if (now - skipCooldown.current < 900) return;
      if (now - wheelAt.current > 400) wheelAcc.current = 0;
      wheelAt.current = now;
      wheelAcc.current += e.deltaY;
      if (wheelAcc.current > 140) {
        wheelAcc.current = 0;
        skipCooldown.current = now;
        skip();
      } else if (wheelAcc.current < -140) {
        wheelAcc.current = 0;
        skipCooldown.current = now;
        goBack();
      }
    };
    const onTouchStart = (e: TouchEvent) => {
      touchY.current = e.touches[0]?.clientY ?? null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const start = touchY.current;
      touchY.current = null;
      if (start === null) return;
      const end = e.changedTouches[0]?.clientY ?? start;
      if (performance.now() - skipCooldown.current < 900) return;
      if (start - end > 70) {
        skipCooldown.current = performance.now();
        skip(); // swipe up → next
      } else if (end - start > 70) {
        skipCooldown.current = performance.now();
        goBack(); // swipe down → back to a skipped one
      }
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [phase, locked, sheet, skip, goBack]);

  if (!state || !ch) return <main className="min-h-dvh" />;
  const agg = aggregates(state.history);
  const overalls = state.history.map((h) => h.overall);
  const bestScore = overalls.length ? Math.max(...overalls) : 0;
  const avgScore = overalls.length
    ? Math.round(overalls.slice(-10).reduce((a, b) => a + b, 0) / Math.min(overalls.length, 10))
    : 0;
  const weakestNow = score
    ? ((Object.entries(score.axes) as [Axis, number][]).sort((a, b) => a[1] - b[1])[0]?.[0] ?? null)
    : null;
  const freeLeft = Math.max(0, FREE_GAMES - state.completed);
  const orbEnergy =
    phase === "listening" ? 0.3 + level * 0.7 : phase === "grading" ? 0.9 : 0.15;

  // Plan picker — select a plan, then one explicit "continue" goes to Stripe.
  // Shown on the post-10 paywall and in the join sheet.
  const planCard = (p: "monthly" | "annual") => {
    const selected = plan === p;
    return (
      <button
        onClick={() => setPlan(p)}
        aria-pressed={selected}
        className={`relative w-full rounded-2xl border-2 bg-white p-5 text-left transition-colors ${
          selected ? "border-[var(--green)]" : "border-[var(--line)] hover:border-[var(--sub)]"
        }`}
      >
        {p === "annual" && (
          <span className="absolute -top-2.5 right-4 rounded-full bg-[var(--gold)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
            save 33%
          </span>
        )}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">
              {p === "annual" ? "$10" : "$15"}
              <span className="text-sm font-normal text-[var(--sub)]"> / month</span>
            </div>
            <div className="text-xs text-[var(--sub)]">
              {p === "annual" ? "billed annually — $120/yr" : "billed monthly"}
            </div>
          </div>
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
              selected ? "border-[var(--green)]" : "border-[var(--line)]"
            }`}
          >
            {selected && <span className="h-2.5 w-2.5 rounded-full bg-[var(--green)]" />}
          </span>
        </div>
      </button>
    );
  };

  const membershipPanel = (
    <div className="w-full max-w-sm">
      <div className="grid gap-3">
        {planCard("annual")}
        {planCard("monthly")}
      </div>
      {!authEmail && (
        <div className="mt-4 text-left">
          <label className="text-[11px] uppercase tracking-[0.2em] text-[var(--faint)]">
            your email
          </label>
          <input
            type="email"
            value={buyerEmail}
            onChange={(e) => setBuyerEmail(e.target.value)}
            placeholder="you@wherever.com"
            className="mt-1.5 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--green)]"
          />
          <p className="mt-1.5 text-[11px] leading-snug text-[var(--faint)]">
            this becomes your account — receipts, sign-in link, and your membership on any device
          </p>
        </div>
      )}
      {authEmail && (
        <p className="mt-4 text-[12px] text-[var(--faint)]">
          joining as <span className="font-medium text-[var(--sub)]">{authEmail}</span>
        </p>
      )}
      <button
        onClick={() => startCheckout(plan)}
        disabled={payBusy !== null || (!authEmail && !buyerEmail.includes("@"))}
        className="mt-5 w-full rounded-full bg-[var(--green)] px-8 py-3.5 text-[15px] font-medium text-white transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-60"
      >
        {payBusy === "monthly" || payBusy === "annual"
          ? "opening secure checkout…"
          : `Continue — ${plan === "annual" ? "$120 / year" : "$15 / month"}`}
      </button>
      <p className="mt-2.5 text-center text-[11px] text-[var(--faint)]">
        secure checkout by Stripe · cancel anytime
      </p>
      {payError && <p className="mt-3 text-center text-sm text-red-700">{payError}</p>}

      <div className="mt-6 text-center">
        {restoreOpen ? (
          restoreSent ? (
            <p className="text-sm text-[var(--sub)]">
              Check your email — clicking the link signs you in and restores your membership here.
            </p>
          ) : (
          <div className="text-left">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--faint)]">restore membership</p>
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
            <p className="mt-1.5 text-[11px] text-[var(--faint)]">
              we&rsquo;ll email you a sign-in link — clicking it proves it&rsquo;s you and unlocks this device
            </p>
          </div>
          )
        ) : (
          <button
            onClick={() => setRestoreOpen(true)}
            className="text-xs text-[var(--faint)] underline-offset-4 hover:text-[var(--sub)] hover:underline"
          >
            already a member? restore your purchase
          </button>
        )}
      </div>
    </div>
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-5">
      <header className="flex items-center justify-between pt-6">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          articulate<span className="text-[var(--gold)]">.</span>
        </Link>
        <span className="flex items-center gap-3">
          <span className="font-mono text-[11px] tracking-wider text-[var(--faint)]">
            {member
              ? `${state.completed} spoken · member`
              : `${state.completed} spoken · ${freeLeft} free left`}
          </span>
          {!member && (
            <button
              onClick={() => setSheet("join")}
              className="rounded-full bg-[var(--green)] px-3.5 py-1 text-[11px] font-medium text-white transition-transform hover:scale-[1.03] active:scale-95"
            >
              join
            </button>
          )}
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
      {joinedEmail && (
        <div className="mt-6 flex items-start justify-between gap-3 rounded-xl border border-[var(--green)] bg-white p-4 text-left text-sm text-[var(--sub)]">
          <p>
            <span className="font-semibold text-[var(--green)]">membership active ✓</span> — we
            emailed a sign-in link to{" "}
            <span className="font-medium text-[var(--ink)]">{joinedEmail}</span> so your
            membership and progress follow you on any device.
          </p>
          <button
            onClick={() => setJoinedEmail(null)}
            aria-label="Dismiss"
            className="shrink-0 text-[var(--faint)] hover:text-[var(--sub)]"
          >
            ✕
          </button>
        </div>
      )}

      {/* ---- paywall ---- */}
      {locked && phase !== "chart" && (
        <section className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          <GreenOrb energy={0.35} size={104} />
          <p className="mt-6 text-[10px] uppercase tracking-[0.3em] text-[var(--gold)]">membership</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Don&rsquo;t stop improving<span className="text-[var(--gold)]">.</span>
          </h2>
          <p className="mt-2.5 text-sm text-[var(--sub)]">
            You&rsquo;ve spoken your ten free challenges — and it shows.
          </p>

          <div className="mt-7 grid w-full max-w-sm grid-cols-3 divide-x divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-white py-4 shadow-sm">
            <div>
              <div className="font-mono text-2xl font-semibold text-[var(--green)]">{state.completed}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">spoken</div>
            </div>
            <div>
              <div className="font-mono text-2xl font-semibold text-[var(--green)]">{bestScore}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">best score</div>
            </div>
            <div>
              <div className="font-mono text-2xl font-semibold text-[var(--green)]">{avgScore}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">recent avg</div>
            </div>
          </div>

          <ul className="mt-7 space-y-2.5 text-left text-[14px] leading-snug text-[var(--sub)]">
            {[
              "Unlimited challenges, every day",
              "AI grading and coach’s notes on every answer",
              "Your scorecard shape, tracked over time",
            ].map((b) => (
              <li key={b} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--green)] text-[10px] font-bold text-white">
                  ✓
                </span>
                {b}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex w-full flex-col items-center">{membershipPanel}</div>
        </section>
      )}

      {/* ---- the single screen ---- */}
      {!locked && phase !== "chart" && (
        <section className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          {!ch.targetWord && (
            <p className="fade-up max-w-md text-xl font-medium leading-snug tracking-tight sm:text-2xl" key={ch.id}>
              {ch.prompt}
            </p>
          )}

          {ch.visual && phase !== "listening" && (
            <div className="fade-up mt-8 select-none text-6xl leading-none tracking-[0.2em] sm:text-7xl">{ch.visual}</div>
          )}
          {ch.visual && phase === "listening" && (
            <div className="mt-6 select-none text-4xl leading-none tracking-[0.15em]">{ch.visual}</div>
          )}
          {ch.targetWord && (
            <div className="fade-up flex flex-col items-center" key={ch.id}>
              <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--faint)]">your word</p>
              <span className="mt-3 text-5xl font-semibold tracking-tight text-[var(--green)] sm:text-6xl">
                {ch.targetWord.word}
              </span>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--sub)]">{ch.targetWord.gloss}</p>
              <div className="mt-6 h-px w-10 bg-[var(--line)]" />
              <p className="mt-5 max-w-sm text-[15px] leading-snug text-[var(--sub)]">{ch.prompt}</p>
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
              <div
                className="font-mono text-6xl font-semibold tracking-tight"
                style={{ color: scoreColor(score.overall) }}
              >
                {score.overall}
              </div>
              <p className="mt-1.5 text-[11px] uppercase tracking-[0.22em] text-[var(--faint)]">
                {verdictOf(score.overall)}
              </p>

              <div className="mt-5 space-y-2.5">
                {Object.entries(score.axes).map(([axis, v]) => (
                  <div key={axis} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-left text-[10px] uppercase tracking-[0.14em] text-[var(--sub)]">
                      {AXIS_LABEL[axis as Axis]}
                    </span>
                    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--bg)]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${v}%`, background: scoreColor(v) }}
                      />
                    </div>
                    <span className="w-7 shrink-0 text-right font-mono text-[11px] text-[var(--sub)]">{v}</span>
                  </div>
                ))}
              </div>

              {score.notes.length > 0 && (
                <div className="mt-5 rounded-xl bg-[var(--bg)] p-3.5 text-left">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--faint)]">coach&rsquo;s notes</p>
                  <div className="mt-1.5 space-y-1 text-[13px] leading-snug text-[var(--sub)]">
                    {score.notes.map((n, i) => (
                      <p key={i}>{n}</p>
                    ))}
                  </div>
                </div>
              )}

              {score.overall < 80 && weakestNow && (
                <div className="mt-3 rounded-xl border border-[var(--gold)] bg-white p-3.5 text-left">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--gold)]">practice this</p>
                  <p className="mt-1.5 text-[13px] leading-snug text-[var(--sub)]">{AXIS_TIP[weakestNow]}</p>
                </div>
              )}

              <p className="mt-4 font-mono text-[11px] text-[var(--faint)]">
                {score.words} words · {score.wpm} wpm · {score.fillerCount} filler ·{" "}
                {score.gradedBy === "ai" ? "AI graded" : "meter graded"}
              </p>
            </div>
          )}

          <div className="mt-8 flex flex-col items-center">
            {phase === "ready" && (
              <>
                <GreenOrb energy={orbEnergy} size={150} onClick={start} label="speak" ariaLabel="Start speaking" />
                <button
                  onClick={skip}
                  aria-label="Skip this challenge"
                  className="mt-4 rounded-full border border-[var(--line)] bg-white px-7 py-2.5 text-[12px] font-medium uppercase tracking-[0.18em] text-[var(--sub)] shadow-sm transition-all hover:border-[var(--green)] hover:text-[var(--green)] active:scale-95"
                >
                  skip ↓
                </button>
                {skipped.length > 0 && (
                  <button
                    onClick={goBack}
                    className="mt-2 text-[11px] uppercase tracking-[0.18em] text-[var(--faint)] transition-colors hover:text-[var(--sub)]"
                  >
                    ↑ back
                  </button>
                )}
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
            {phase === "scored" && score && (
              <div className="flex items-center gap-3">
                {score.overall < 75 && (
                  <button
                    onClick={retry}
                    className="rounded-full border border-[var(--line)] bg-white px-6 py-3 text-sm font-medium text-[var(--sub)] transition-colors hover:border-[var(--green)] hover:text-[var(--green)]"
                  >
                    run it back ↻
                  </button>
                )}
                <button
                  onClick={advance}
                  className="rounded-full bg-[var(--green)] px-8 py-3 text-sm font-medium text-white transition-transform hover:scale-[1.02] active:scale-95"
                >
                  next →
                </button>
              </div>
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
          {!authEmail && (
            <button
              onClick={() => setSheet("profile")}
              className="mt-4 text-xs text-[var(--faint)] underline-offset-4 transition-colors hover:text-[var(--sub)] hover:underline"
            >
              save your shape — sign in with a magic link
            </button>
          )}
        </section>
      )}

      <footer className="flex items-center justify-center pb-6">
        <button
          onClick={() => setSheet(sheet === "profile" ? null : "profile")}
          className="rounded-full border border-[var(--line)] px-6 py-1.5 text-[11px] uppercase tracking-[0.18em] text-[var(--sub)] transition-colors hover:border-[var(--green)] hover:text-[var(--green)]"
        >
          profile
        </button>
      </footer>

      {sheet !== null && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/20 p-4 backdrop-blur-[2px] sm:p-6"
          onClick={() => setSheet(null)}
        >
          <div
            className="fade-up max-h-[85dvh] w-full max-w-xl overflow-y-auto rounded-3xl border border-[var(--line)] bg-[var(--bg)] p-6 shadow-[0_24px_60px_-24px_rgba(18,53,36,0.4)]"
            onClick={(e) => e.stopPropagation()}
          >

            {sheet === "join" && (
              <div className="flex flex-col items-center">
                <p className="text-[11px] uppercase tracking-[0.25em] text-[var(--sub)]">membership</p>
                <h3 className="mt-3 text-xl font-semibold tracking-tight">
                  Unlimited articulate<span className="text-[var(--gold)]">.</span>
                </h3>
                <p className="mt-1.5 max-w-xs text-center text-[13px] leading-relaxed text-[var(--sub)]">
                  Unlimited challenges, AI grading on every answer, and your evolving scorecard.
                </p>
                <div className="mt-6 flex w-full flex-col items-center">{membershipPanel}</div>
              </div>
            )}

            {sheet === "profile" && (
              <>
                <div className="flex flex-col items-center">
                  <p className="text-[11px] uppercase tracking-[0.25em] text-[var(--sub)]">your shape so far</p>
                  <RadarChart scores={agg} animate={false} size={200} />
                  <p className="font-mono text-[11px] text-[var(--faint)]">
                    {state.completed} challenges spoken ·{" "}
                    {member ? "member" : "guest — progress lives on this device"}
                  </p>
                </div>

                <div className="mt-7 border-t border-[var(--line)] pt-5">
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
                    {state.profile.interests
                      .filter((t) => !INTEREST_TAGS.includes(t))
                      .map((tag) => (
                        <button
                          key={tag}
                          onClick={() =>
                            persist({
                              ...state,
                              profile: {
                                ...state.profile,
                                interests: state.profile.interests.filter((t) => t !== tag),
                              },
                            })
                          }
                          className="rounded-full border border-[var(--green)] bg-[var(--green)] px-3.5 py-1 text-xs text-white"
                        >
                          {tag} ×
                        </button>
                      ))}
                    <input
                      value={customTag}
                      onChange={(e) => setCustomTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        const t = customTag.trim().toLowerCase().slice(0, 24);
                        setCustomTag("");
                        if (!t || state.profile.interests.includes(t)) return;
                        persist({
                          ...state,
                          profile: { ...state.profile, interests: [...state.profile.interests, t] },
                        });
                      }}
                      placeholder="your own + enter"
                      className="w-32 rounded-full border border-dashed border-[var(--line)] bg-transparent px-3.5 py-1 text-xs text-[var(--ink)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--green)]"
                    />
                  </div>
                </div>

                <div className="mt-7">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--sub)]">account</p>
                  {authEmail ? (
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm text-[var(--sub)]">
                        signed in as <span className="font-medium text-[var(--ink)]">{authEmail}</span>
                      </p>
                      <button
                        onClick={signOut}
                        className="shrink-0 text-xs text-[var(--faint)] underline-offset-4 hover:underline"
                      >
                        sign out
                      </button>
                    </div>
                  ) : authSent ? (
                    <p className="mt-2 text-sm text-[var(--sub)]">
                      Check your email — your sign-in link is on its way.
                    </p>
                  ) : (
                    <>
                      <p className="mt-2 text-xs text-[var(--faint)]">
                        no password — a magic link saves your progress across devices
                      </p>
                      <div className="mt-2 flex gap-2">
                        <input
                          type="email"
                          value={acctEmail}
                          onChange={(e) => setAcctEmail(e.target.value)}
                          placeholder="you@wherever.com"
                          className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--green)]"
                        />
                        <button
                          onClick={sendMagicLink}
                          disabled={!acctEmail.includes("@")}
                          className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-40"
                        >
                          send link
                        </button>
                      </div>
                      {authError && <p className="mt-2 text-xs text-red-700">{authError}</p>}
                    </>
                  )}
                </div>

                <div className="mt-7 flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--sub)]">membership</p>
                  {member ? (
                    <span className="text-sm font-medium text-[var(--green)]">member ✓</span>
                  ) : (
                    <button
                      onClick={() => setSheet("join")}
                      className="rounded-full bg-[var(--green)] px-4 py-1.5 text-xs font-medium text-white transition-transform hover:scale-[1.02] active:scale-95"
                    >
                      join articulate →
                    </button>
                  )}
                </div>

                <div className="mt-7 flex items-center justify-between border-t border-[var(--line)] pt-4">
                  <Link href="/" className="text-xs text-[var(--sub)] underline-offset-4 hover:underline">
                    about articulate
                  </Link>
                  {member && (
                    <button
                      onClick={() => {
                        if (window.confirm("Erase all progress on this device?")) {
                          persist({ history: [], profile: { interests: [], role: "" }, completed: 0 });
                          setSheet(null);
                        }
                      }}
                      className="text-xs text-[var(--faint)] hover:text-red-600"
                    >
                      reset progress
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
