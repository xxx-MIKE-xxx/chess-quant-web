// pages/api/billing/portal.ts
import type { NextApiRequest, NextApiResponse } from "next";
import cookie from "cookie";
import jwt from "jsonwebtoken";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/firebaseAdmin";

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
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    console.error("[/api/billing/portal] SESSION_SECRET missing");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const rawCookie = req.headers.cookie || "";
  const cookiesObj = cookie.parse(rawCookie);
  const token = cookiesObj["session"];

  if (!token) {
    console.warn("[/api/billing/portal] No session cookie");
    return res.status(401).json({ error: "Not logged in" });
  }

  let payload: SessionPayload;
  try {
    payload = jwt.verify(token, sessionSecret) as SessionPayload;
  } catch (err: any) {
    console.error("[/api/billing/portal] JWT verify failed:", {
      message: err?.message,
      name: err?.name,
    });
    return res.status(401).json({ error: "Invalid session" });
  }

  try {
    // Look up user in Firestore to find Stripe customer id
    const userRef = db.collection("users").doc(payload.lichessUsername);
    const snap = await userRef.get();

    if (!snap.exists) {
      console.warn(
        "[/api/billing/portal] No Firestore user for",
        payload.lichessUsername
      );
      return res.status(404).json({ error: "User not found" });
    }

    const data = snap.data() as any;
    const customerId: string | undefined = data?.stripeCustomerId;

    if (!customerId) {
      console.warn(
        "[/api/billing/portal] User has no stripeCustomerId; cannot open portal"
      );
      return res
        .status(400)
        .json({ error: "No Stripe customer found for this user" });
    }

    const origin =
      (req.headers.origin as string | undefined) ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "https://chess-quant-web.vercel.app";

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: origin, // where "Return to Chess Quant" will send them
    });

    return res.status(200).json({ url: portalSession.url });
  } catch (err: any) {
    console.error("[/api/billing/portal] Unexpected error:", {
      message: err?.message,
      stack: err?.stack,
    });
    return res.status(500).json({
      error: "Failed to create billing portal session",
      details: err?.message ?? String(err),
    });
  }
}
