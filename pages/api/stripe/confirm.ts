// pages/api/stripe/confirm.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { stripe } from "@/lib/stripe";      // whatever you named your Stripe helper
import { db } from "@/lib/firebaseAdmin";  // your Firestore admin instance
import cookie from "cookie";
import jwt from "jsonwebtoken";

type SessionPayload = {
  lichessId: string;
  lichessUsername: string;
  accessToken: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { sessionId } = req.body as { sessionId?: string };
    if (!sessionId) {
      return res.status(400).json({ error: "Missing sessionId" });
    }

    // 1) Get logged-in user from JWT cookie (same as /api/tilt)
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

    const sessionJwt = jwt.verify(token, sessionSecret) as SessionPayload;
    const { lichessUsername } = sessionJwt;
    if (!lichessUsername) {
      return res.status(500).json({ error: "Invalid session payload" });
    }

    // 2) Fetch checkout session from Stripe
    const checkout = await stripe.checkout.sessions.retrieve(sessionId);

    if (checkout.payment_status !== "paid") {
      return res.status(400).json({ error: "Payment not completed" });
    }

    const customerId = checkout.customer as string | null;
    const subscriptionId = checkout.subscription as string | null;

    // 3) Update Firestore
    const userRef = db.collection("users").doc(lichessUsername);
    await userRef.set(
      {
        isPro: true,
        stripeCustomerId: customerId ?? null,
        stripeSubscriptionId: subscriptionId ?? null,
      },
      { merge: true }
    );

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error("Error in /api/stripe/confirm:", e);
    return res.status(500).json({
      error: "Stripe confirm error",
      details: e?.message ?? String(e),
    });
  }
}
