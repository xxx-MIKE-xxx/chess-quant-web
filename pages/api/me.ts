// pages/api/me.ts
import type { NextApiRequest, NextApiResponse } from "next";
import cookie from "cookie";
import jwt from "jsonwebtoken";

type SessionPayload = {
  lichessId: string;
  lichessUsername: string;
  accessToken: string;
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    console.error("[/api/me] SESSION_SECRET missing");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const rawCookieHeader = req.headers.cookie || "";
  const cookiesObj = cookie.parse(rawCookieHeader);

  console.log("[/api/me] Incoming cookies:", rawCookieHeader);

  const token = cookiesObj["session"];
  if (!token) {
    console.warn("[/api/me] No session cookie found");
    return res.status(401).json({ user: null });
  }

  try {
    const payload = jwt.verify(token, sessionSecret) as SessionPayload;

    console.log("[/api/me] Session verified for user:", {
      lichessId: payload.lichessId,
      lichessUsername: payload.lichessUsername,
    });

    return res.status(200).json({
      user: {
        lichessId: payload.lichessId,
        lichessUsername: payload.lichessUsername,
      },
    });
  } catch (err: any) {
    console.error("[/api/me] JWT verification failed:", {
      message: err?.message,
      name: err?.name,
    });
    return res.status(401).json({ user: null });
  }
}
