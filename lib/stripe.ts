// Thin Stripe REST helpers (no SDK dependency) + the HMAC entitlement token.
// A member token asserts "this device belongs to a paying customer"; it's
// signed server-side, stored client-side, and re-verified against Stripe
// whenever it's refreshed.

import { createHmac, timingSafeEqual } from "crypto";

const STRIPE = "https://api.stripe.com/v1";

export async function stripe<T>(
  path: string,
  params?: Record<string, string>,
  method: "GET" | "POST" = params ? "POST" : "GET",
): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("stripe not configured");
  const body = params ? new URLSearchParams(params).toString() : undefined;
  const url = method === "GET" && body ? `${STRIPE}${path}?${body}` : `${STRIPE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(key + ":").toString("base64")}`,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method === "POST" ? body : undefined,
  });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `stripe ${res.status}`);
  return json;
}

export interface Entitlement {
  cus: string; // customer id
  sub: string; // subscription id
  exp: number; // epoch seconds
}

const b64u = (b: Buffer) => b.toString("base64url");

function secret(): string {
  const s = process.env.ENTITLEMENT_SECRET;
  if (!s) throw new Error("entitlement not configured");
  return s;
}

export function signEntitlement(cus: string, sub: string): string {
  const payload: Entitlement = { cus, sub, exp: Math.floor(Date.now() / 1000) + 7 * 86400 };
  const body = b64u(Buffer.from(JSON.stringify(payload)));
  const sig = b64u(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

/** Verifies the signature; returns the payload even when expired (the
 * refresh path needs the ids), null when forged/garbled. */
export function readEntitlement(token: string): Entitlement | null {
  try {
    const [body, sig] = token.split(".");
    const expect = createHmac("sha256", secret()).update(body).digest();
    const got = Buffer.from(sig, "base64url");
    if (got.length !== expect.length || !timingSafeEqual(got, expect)) return null;
    return JSON.parse(Buffer.from(body, "base64url").toString()) as Entitlement;
  } catch {
    return null;
  }
}

const GOOD = new Set(["active", "trialing", "past_due"]);

export async function subscriptionActive(subId: string): Promise<{ ok: boolean; cus: string }> {
  const sub = await stripe<{ status: string; customer: string }>(`/subscriptions/${subId}`);
  return { ok: GOOD.has(sub.status), cus: sub.customer };
}

/** Newest active subscription for an email, if any. One round-trip: the
 * customer list expands each customer's current subscriptions inline. */
export async function findSubscriptionByEmail(email: string): Promise<{ cus: string; sub: string } | null> {
  const customers = await stripe<{
    data: { id: string; subscriptions?: { data: { id: string; status: string }[] } }[];
  }>(
    "/customers",
    { email: email.trim().toLowerCase(), limit: "5", "expand[]": "data.subscriptions" },
    "GET",
  );
  for (const c of customers.data ?? []) {
    const hit = (c.subscriptions?.data ?? []).find((s) => GOOD.has(s.status));
    if (hit) return { cus: c.id, sub: hit.id };
  }
  return null;
}
