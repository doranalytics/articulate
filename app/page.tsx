"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { GreenOrb } from "@/components/GreenOrb";
import { AXIS_LABEL, AXES } from "@/lib/challenges";

export default function Landing() {
  const router = useRouter();
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center px-6 text-center">
      <header className="flex w-full items-center justify-between pt-8">
        <span className="text-sm font-semibold tracking-tight">
          articulate<span className="text-[var(--gold)]">.</span>
        </span>
        <Link
          href="/train"
          className="rounded-full border border-[var(--line)] px-4 py-1.5 text-xs font-medium text-[var(--sub)] transition-colors hover:border-[var(--green)] hover:text-[var(--green)]"
        >
          enter
        </Link>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center py-16">
        <GreenOrb energy={0.22} size={190} onClick={() => router.push("/train")} ariaLabel="Begin training" />

        <h1 className="mt-10 text-4xl font-semibold tracking-tight sm:text-5xl">
          Say more<span className="text-[var(--gold)]">.</span> With less<span className="text-[var(--gold)]">.</span>
        </h1>
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-[var(--sub)]">
          A voice-only training ground for becoming more articulate. Describe a scene, explain a
          concept, invent an analogy — out loud, no typing allowed — your words on screen as you
          speak, graded by AI the moment you stop.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {AXES.map((a) => (
            <span
              key={a}
              className="rounded-full border border-[var(--line)] bg-white px-3.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--sub)]"
            >
              {AXIS_LABEL[a]}
            </span>
          ))}
        </div>

        <Link
          href="/train"
          className="mt-10 rounded-full bg-[var(--green)] px-10 py-3.5 text-[15px] font-medium text-white shadow-[0_18px_40px_-18px_rgba(18,53,36,0.7)] transition-transform hover:scale-[1.02] active:scale-95"
        >
          Begin
        </Link>
        <p className="mt-4 text-xs text-[var(--faint)]">
          10 challenges free, no account · then $15/mo, or $10/mo billed annually
        </p>
      </section>

      <footer className="w-full pb-8 text-[11px] tracking-wide text-[var(--faint)]">
        speaking well is the original status symbol
      </footer>
    </main>
  );
}
