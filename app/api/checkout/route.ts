import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export const maxDuration = 30;

export async function POST(req: Request) {
  let plan: string;
  try {
    ({ plan } = (await req.json()) as { plan: string });
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const price = plan === "annual" ? process.env.STRIPE_PRICE_ANNUAL : process.env.STRIPE_PRICE_MONTHLY;
  if (!price) return NextResponse.json({ error: "billing not configured" }, { status: 500 });

  const origin = new URL(req.url).origin;
  try {
    const session = await stripe<{ url: string }>("/checkout/sessions", {
      mode: "subscription",
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
      success_url: `${origin}/train?cs={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/train`,
      allow_promotion_codes: "true",
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "checkout failed" },
      { status: 502 },
    );
  }
}
