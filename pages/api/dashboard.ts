// pages/api/dashboard.ts
import type { NextApiRequest, NextApiResponse } from "next";
import cookie from "cookie";
import jwt from "jsonwebtoken";
import { getUserDashboard } from "@/lib/firebaseAdmin";

type SessionPayload = {
  lichessId: string;
  lichessUsername: string;
  accessToken: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const sessionSecret = process.env.SESSION_SECRET;
    if (!sessionSecret) {
      console.error("SESSION_SECRET missing");
      return res.status(500).json({ error: "SESSION_SECRET not set" });
    }

    // Read and verify JWT session
    const cookiesObj = cookie.parse(req.headers.cookie || "");
    const token = cookiesObj["session"];

    if (!token) {
      return res.status(401).json({ error: "Not logged in" });
    }

    let session: SessionPayload;
    try {
      session = jwt.verify(token, sessionSecret) as SessionPayload;
    } catch (e) {
      console.error("JWT verification failed in /api/dashboard:", e);
      return res.status(401).json({ error: "Invalid session" });
    }

    const { lichessUsername, lichessId } = session;
    if (!lichessUsername) {
      return res.status(500).json({ error: "Session missing lichessUsername" });
    }

    // Pull dashboard data from Firestore
    const dashboard = await getUserDashboard(lichessUsername);

    if (!dashboard) {
      // User exists in auth but we haven’t saved any tilt results yet
      return res.status(200).json({
        profile: {
          lichessId: lichessId ?? null,
          username: lichessUsername,
          lastTiltScore: null,
          lastTiltAt: null,
        },
        tiltHistory: [] as any[],
      });
    }

    return res.status(200).json(dashboard);
  } catch (e: any) {
    console.error("Unexpected error in /api/dashboard:", e);
    return res.status(500).json({
      error: "Unexpected server error",
      details: e?.message ?? String(e),
    });
  }
}

