import { NextResponse } from "next/server";
import {
  findSubscriptionByEmail,
  readEntitlement,
  signEntitlement,
  stripe,
  subscriptionActive,
} from "@/lib/stripe";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";

export const maxDuration = 30;

// Three ways in, one shape out: { token, exp } or 402.
// 1. { session_id } — back from Stripe Checkout; verify and mint.
// 2. { token }      — refresh: verify signature, re-check the sub, re-mint.
// 3. { email }      — restore on a new device by receipt email.

export async function POST(req: Request) {
  let body: { session_id?: string; token?: string; email?: string; supabase_token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  try {
    if (body.session_id && /^cs_[a-zA-Z0-9_]+$/.test(body.session_id)) {
      const session = await stripe<{ subscription?: string; customer?: string; status: string }>(
        `/checkout/sessions/${body.session_id}`,
      );
      if (session.status === "complete" && session.subscription && session.customer) {
        return mint(session.customer, session.subscription);
      }
      return NextResponse.json({ error: "checkout not completed" }, { status: 402 });
    }

    if (body.token) {
      const ent = readEntitlement(body.token);
      if (!ent) return NextResponse.json({ error: "invalid token" }, { status: 402 });
      const { ok } = await subscriptionActive(ent.sub);
      if (!ok) return NextResponse.json({ error: "subscription inactive" }, { status: 402 });
      return mint(ent.cus, ent.sub);
    }

    // 4. { supabase_token } — signed-in user; their email is verified, so an
    // active subscription on it entitles this device without typing anything.
    if (body.supabase_token) {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${body.supabase_token}` },
      });
      if (r.ok) {
        const u = (await r.json()) as { email?: string };
        if (u.email) {
          const found = await findSubscriptionByEmail(u.email);
          if (found) return mint(found.cus, found.sub);
        }
      }
      return NextResponse.json({ error: "no active membership" }, { status: 402 });
    }

    if (body.email && body.email.includes("@") && body.email.length < 200) {
      const found = await findSubscriptionByEmail(body.email);
      if (!found) return NextResponse.json({ error: "no active membership for that email" }, { status: 402 });
      return mint(found.cus, found.sub);
    }
  } catch (e) {
    // Never surface raw Stripe errors to customers.
    console.error("entitlement failed:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "Couldn't verify membership right now — please try again in a minute." },
      { status: 502 },
    );
  }
  return NextResponse.json({ error: "bad request" }, { status: 400 });
}

function mint(cus: string, sub: string) {
  const token = signEntitlement(cus, sub);
  const exp = readEntitlement(token)!.exp;
  return NextResponse.json({ token, exp });
}
