import Link from "next/link";

export const metadata = { title: "articulate. — privacy" };

export default function Privacy() {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-6 py-12">
      <Link href="/" className="text-sm font-semibold tracking-tight">
        articulate<span className="text-[var(--gold)]">.</span>
      </Link>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-xs text-[var(--faint)]">Last updated: August 23, 2026</p>

      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-[var(--sub)]">
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink)]">Your voice</h2>
          <p className="mt-2">
            We never receive or store audio recordings. Speech is transcribed by your
            browser&rsquo;s built-in speech engine (which may involve your browser vendor&rsquo;s
            servers, per your browser&rsquo;s own policies). The resulting text transcript is
            sent to our AI grading service to produce your score and is not retained after
            grading.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink)]">What we store</h2>
          <p className="mt-2">
            As a guest, your progress and preferences live only on your device. If you sign in,
            your email address and progress (scores, challenge history, interests) are stored in
            our database so they follow you across devices. If you become a member, your email
            and subscription status are held by Stripe, our payment processor — we never see or
            store card numbers.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink)]">Analytics</h2>
          <p className="mt-2">
            We count visits anonymously, without cookies, advertising identifiers, or cross-site
            tracking. We don&rsquo;t sell or share personal data with third parties for
            advertising.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink)]">Email</h2>
          <p className="mt-2">
            We email you sign-in links you request. If we ever send product updates, every one
            will include an unsubscribe link.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink)]">Deletion</h2>
          <p className="mt-2">
            Guest data disappears when you clear your browser storage. Reply to any email from
            us to request deletion of your account data; subscription records are retained as
            required for tax and accounting. See also our{" "}
            <Link href="/terms" className="underline underline-offset-2">terms of service</Link>.
          </p>
        </section>
      </div>

      <p className="mt-12 text-[10px] text-[var(--faint)]">© 2026 Doranalytics LLC</p>
    </main>
  );
}
