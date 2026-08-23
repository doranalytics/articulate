import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export const maxDuration = 30;

export async function POST(req: Request) {
  let plan: string;
  let email: string | undefined;
  try {
    ({ plan, email } = (await req.json()) as { plan: string; email?: string });
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const price = plan === "annual" ? process.env.STRIPE_PRICE_ANNUAL : process.env.STRIPE_PRICE_MONTHLY;
  if (!price) return NextResponse.json({ error: "billing not configured" }, { status: 500 });

  const origin = new URL(req.url).origin;
  try {
    const params: Record<string, string> = {
      mode: "subscription",
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
      success_url: `${origin}/train?cs={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/train`,
      allow_promotion_codes: "true",
    };
    // Signed-in buyers get their email prefilled so account and membership match.
    if (email && email.includes("@") && email.length < 200) params.customer_email = email;
    const session = await stripe<{ url: string }>("/checkout/sessions", params);
    return NextResponse.json({ url: session.url });
  } catch (e) {
    // Never surface raw Stripe errors to customers.
    console.error("checkout failed:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "Checkout is temporarily unavailable — please try again in a minute." },
      { status: 502 },
    );
  }
}
