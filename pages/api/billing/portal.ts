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

  const rawCookieHeader = req.headers.cookie || "";
  const cookiesObj = cookie.parse(rawCookieHeader);
  const token = cookiesObj["session"];

  if (!token) {
    console.warn("[/api/billing/portal] No session cookie found");
    return res.status(401).json({ error: "Not logged in" });
  }

  let payload: SessionPayload;
  try {
    payload = jwt.verify(token, sessionSecret) as SessionPayload;
  } catch (err: any) {
    console.error("[/api/billing/portal] JWT verify failed:", err?.message);
    return res.status(401).json({ error: "Invalid session" });
  }

  const username = payload.lichessUsername;

  try {
    const userRef = db.collection("users").doc(username);
    const snap = await userRef.get();

    if (!snap.exists) {
      console.warn("[/api/billing/portal] User doc not found for", username);
      return res.status(404).json({ error: "User not found" });
    }

    const userData = snap.data() as any;
    const customerId = userData?.stripeCustomerId as string | undefined;

    if (!customerId) {
      console.warn(
        "[/api/billing/portal] No stripeCustomerId for user",
        username
      );
      return res.status(400).json({
        error: "No Stripe customer associated with this user",
      });
    }

    const returnBase =
      process.env.NEXT_PUBLIC_APP_URL || "https://chess-quant-web.vercel.app";

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${returnBase}/`,
    });

    return res.status(200).json({ url: portalSession.url });
  } catch (e: any) {
    console.error("[/api/billing/portal] Error creating portal session:", e);
    return res.status(500).json({ error: "Failed to create billing portal" });
  }
}
