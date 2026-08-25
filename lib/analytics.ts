// PostHog bootstrap + helpers. The capture calls scattered through the app
// use the posthog-js singleton — WITHOUT this init they are silent no-ops,
// which is exactly what was happening before this file existed. Events land
// in the shared "doranalytics" project tagged site: "articulate" (super
// property), so dashboards filter cleanly. Autocapture is on. No key in the
// environment = everything stays a no-op, so dev never breaks.

import posthog from "posthog-js";

let ready = false;

// Hardcoded deliberately, same reasoning as lib/supabase.ts: the project
// token is a public client value (it ships in the page JS of every PostHog
// site), and this team's Vercel env vars default to "sensitive", which are
// excluded from builds — env-only wiring would leave NEXT_PUBLIC_* out of
// the client bundle and silently disable analytics.
const POSTHOG_KEY = "phc_B7kjZQygSGvhtNK3fsFzP3B6mvxWTwLssFpCfxiCxrHZ"; // doranalytics project
const POSTHOG_HOST = "https://us.i.posthog.com";

export function initAnalytics() {
  if (typeof window === "undefined" || ready) return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY || POSTHOG_KEY;
  if (!key) return;
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || POSTHOG_HOST,
    capture_pageview: false, // manual, so SPA route changes count too
    capture_pageleave: true,
    autocapture: true,
  });
  posthog.register({ site: "articulate" });
  ready = true;
}

export function pageview(path: string) {
  if (!ready) return;
  posthog.capture("$pageview", { $current_url: window.location.origin + path });
}

export function track(event: string, props: Record<string, unknown> = {}) {
  if (!ready) return;
  posthog.capture(event, props);
}

/** Person-level facts (total quizzes, membership) — powers retention and
 * who-pays breakdowns. */
export function setPerson(props: Record<string, unknown>) {
  if (!ready) return;
  posthog.setPersonProperties(props);
}

/** Stitch the anonymous history onto a verified identity (account email). */
export function identify(email: string | undefined | null, props: Record<string, unknown> = {}) {
  if (!ready || !email) return;
  const id = email.trim().toLowerCase();
  posthog.identify(id, { email: id, ...props });
}
