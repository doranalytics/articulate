import Link from "next/link";

export const metadata = { title: "articulate. — terms of service" };

export default function Terms() {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-6 py-12">
      <Link href="/" className="text-sm font-semibold tracking-tight">
        articulate<span className="text-[var(--gold)]">.</span>
      </Link>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-xs text-[var(--faint)]">Last updated: August 23, 2026</p>

      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-[var(--sub)]">
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink)]">The service</h2>
          <p className="mt-2">
            articulate is a voice-based speaking-practice app operated by Doranalytics LLC. You
            speak, and automated systems — including AI models — estimate scores and offer
            coaching notes. Scores are automated estimates for practice purposes, not
            professional assessment, and no particular outcome is promised.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink)]">Free use and membership</h2>
          <p className="mt-2">
            You may play a limited number of challenges free of charge. Membership is a paid
            subscription billed through Stripe, monthly or annually, and renews automatically
            until canceled. You can cancel anytime; access continues through the period already
            paid. Prices may change with notice before your next renewal.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink)]">Your account</h2>
          <p className="mt-2">
            Signing in is optional and uses email links; keep access to your email secure, since
            anyone with your sign-in link can access your account. You&rsquo;re responsible for
            activity under your account.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink)]">Acceptable use</h2>
          <p className="mt-2">
            Don&rsquo;t abuse, reverse-engineer, overload, or attempt to defraud the service, and
            don&rsquo;t use it to generate or submit unlawful content.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink)]">Liability</h2>
          <p className="mt-2">
            The service is provided &ldquo;as is.&rdquo; To the maximum extent permitted by law,
            Doranalytics LLC&rsquo;s total liability for any claim related to the service is
            limited to the amount you paid in the twelve months before the claim.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink)]">Changes</h2>
          <p className="mt-2">
            These terms may be updated; continued use after an update is acceptance of the new
            terms. See also our <Link href="/privacy" className="underline underline-offset-2">privacy policy</Link>.
          </p>
        </section>
      </div>

      <p className="mt-12 text-[10px] text-[var(--faint)]">© 2026 Doranalytics LLC</p>
    </main>
  );
}
