// pages/api/billing/create-checkout-session.ts
import type { NextApiRequest, NextApiResponse } from "next";
import cookie from "cookie";
import jwt from "jsonwebtoken";
import { stripe } from "@/lib/stripe";

type SessionPayload = {
  lichessId: string;
  lichessUsername: string;
  accessToken: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    console.error("STRIPE_PRICE_ID missing");
    return res.status(500).json({ error: "Stripe price not configured" });
  }

  try {
    // Try to read the logged-in lichess user (optional, but nice metadata)
    let sessionPayload: SessionPayload | null = null;
    const sessionSecret = process.env.SESSION_SECRET;

    if (sessionSecret) {
      const cookiesObj = cookie.parse(req.headers.cookie || "");
      const token = cookiesObj["session"];
      if (token) {
        try {
          sessionPayload = jwt.verify(token, sessionSecret) as SessionPayload;
        } catch (e) {
          console.warn("JWT verify failed in checkout, continuing anonymously");
        }
      }
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || `http://${req.headers.host}`;

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/?billing=success`,
      cancel_url: `${appUrl}/?billing=cancel`,
      metadata: sessionPayload
        ? {
            lichessId: sessionPayload.lichessId,
            lichessUsername: sessionPayload.lichessUsername,
          }
        : undefined,
    });

    return res.status(200).json({ url: checkoutSession.url });
  } catch (e: any) {
    console.error("Stripe checkout error:", e);
    return res.status(500).json({
      error: "Stripe checkout failed",
      details: e?.message ?? String(e),
    });
  }
}
