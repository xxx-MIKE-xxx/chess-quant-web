// pages/api/checkout.ts
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

  try {
    const sessionSecret = process.env.SESSION_SECRET;
    if (!sessionSecret) {
      console.error("SESSION_SECRET missing");
      return res.status(500).json({ error: "SESSION_SECRET not set" });
    }

    const cookiesObj = cookie.parse(req.headers.cookie || "");
    const token = cookiesObj["session"];
    if (!token) {
      return res.status(401).json({ error: "Not logged in" });
    }

    let session: SessionPayload;
    try {
      session = jwt.verify(token, sessionSecret) as SessionPayload;
    } catch (e) {
      console.error("JWT verification failed in /api/checkout:", e);
      return res.status(401).json({ error: "Invalid session" });
    }

    const { lichessUsername } = session;

    const origin =
      (req.headers.origin as string) ||
      `http://${req.headers.host ?? "localhost:3000"}`;

    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) {
      console.error("STRIPE_PRICE_ID missing");
      return res.status(500).json({ error: "STRIPE_PRICE_ID not set" });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,

      // these let the webhook know who this is
      client_reference_id: lichessUsername,
      metadata: {
        username: lichessUsername,
        source: "chess-quant-web",
      },
    });

    if (!checkoutSession.url) {
      console.error("Checkout session created without URL", checkoutSession);
      return res
        .status(500)
        .json({ error: "No checkout URL returned from Stripe" });
    }

    return res.status(200).json({ url: checkoutSession.url });
  } catch (e: any) {
    console.error("Stripe checkout error:", e);
    return res.status(500).json({
      error: "Stripe error creating checkout session",
      details: e?.message ?? String(e),
    });
  }
}
