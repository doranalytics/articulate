import { NextResponse } from "next/server";
import {
  findSubscriptionByEmail,
  readEntitlement,
  signEntitlement,
  stripe,
  subscriptionActive,
} from "@/lib/stripe";

export const maxDuration = 30;

// Three ways in, one shape out: { token, exp } or 402.
// 1. { session_id } — back from Stripe Checkout; verify and mint.
// 2. { token }      — refresh: verify signature, re-check the sub, re-mint.
// 3. { email }      — restore on a new device by receipt email.

export async function POST(req: Request) {
  let body: { session_id?: string; token?: string; email?: string };
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

    if (body.email && body.email.includes("@") && body.email.length < 200) {
      const found = await findSubscriptionByEmail(body.email);
      if (!found) return NextResponse.json({ error: "no active membership for that email" }, { status: 402 });
      return mint(found.cus, found.sub);
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "verification failed" },
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
