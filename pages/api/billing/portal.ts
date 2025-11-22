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
    return res.status(401).json({ error: "Not logged in" });
  }

  let payload: SessionPayload;
  try {
    payload = jwt.verify(token, sessionSecret) as SessionPayload;
  } catch (err: any) {
    return res.status(401).json({ error: "Invalid session" });
  }

  try {
    const userRef = db.collection("users").doc(payload.lichessUsername);
    const snap = await userRef.get();

    if (!snap.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const data = snap.data() as any;
    const customerId: string | undefined = data?.stripeCustomerId;

    if (!customerId) {
      return res
        .status(400)
        .json({ error: "No Stripe customer found for this user" });
    }

    // --- FIX STARTS HERE ---
    // Robustly determine the current domain (localhost or production)
    // 1. Try configured ENV var first
    // 2. Try Origin header (client browser usually sends this)
    // 3. Fallback to Host header (reliable server-side) + Protocol
    let returnUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!returnUrl) {
      const origin = req.headers.origin;
      if (origin) {
        returnUrl = origin;
      } else {
        // Construct from host if origin is missing
        const host = req.headers.host;
        const proto = req.headers["x-forwarded-proto"] || "http";
        returnUrl = `${proto}://${host}`;
      }
    }

    // Ensure no trailing slash to avoid double slashes if you append paths later
    returnUrl = returnUrl.replace(/\/$/, "");
    // --- FIX ENDS HERE ---

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl, // Now correctly points to localhost or vercel url
    });

    return res.status(200).json({ url: portalSession.url });
  } catch (err: any) {
    console.error("[/api/billing/portal] Unexpected error:", err);
    return res.status(500).json({
      error: "Failed to create billing portal session",
      details: err?.message ?? String(err),
    });
  }
}