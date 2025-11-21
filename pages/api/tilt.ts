// pages/api/tilt.ts
import type { NextApiRequest, NextApiResponse } from "next";
import cookie from "cookie";
import jwt from "jsonwebtoken";
import { recordTiltResult } from "@/lib/firebaseAdmin";

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
      console.error("No session cookie");
      return res.status(401).json({ error: "Not logged in" });
    }

    let session: SessionPayload;
    try {
      session = jwt.verify(token, sessionSecret) as SessionPayload;
    } catch (e) {
      console.error("JWT verification failed:", e);
      return res.status(401).json({ error: "Invalid session" });
    }

    const { lichessId, lichessUsername, accessToken } = session;
    if (!lichessUsername || !accessToken) {
      console.error("Session missing username or accessToken", session);
      return res.status(500).json({ error: "Invalid session payload" });
    }

    // 1) Fetch last 20 games from Lichess
    const url = new URL(
      `https://lichess.org/api/games/user/${encodeURIComponent(
        lichessUsername
      )}`
    );
    url.searchParams.set("max", "20");
    url.searchParams.set("analysed", "1");
    url.searchParams.set("moves", "1");
    url.searchParams.set("clocks", "1");

    const gamesRes = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/x-ndjson",
      },
    });

    if (!gamesRes.ok) {
      const text = await gamesRes.text();
      console.error("Lichess games error:", gamesRes.status, text);
      return res.status(500).json({
        error: "Lichess games error",
        status: gamesRes.status,
        details: text,
      });
    }

    const ndjson = await gamesRes.text();

    // 2) Call Python tilt_score endpoint via env var
    const tiltScoreUrl =
      process.env.TILT_SCORE_URL ||
      "https://chess-quant-web.vercel.app/api/tilt_score";

    const tiltRes = await fetch(tiltScoreUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        games_ndjson: ndjson,
        username: lichessUsername,
      }),
    });

    if (!tiltRes.ok) {
      const text = await tiltRes.text();
      console.error("tilt_score error:", tiltRes.status, text);
      return res.status(500).json({
        error: "tilt_score error",
        status: tiltRes.status,
        details: text,
      });
    }

    const tiltJson = await tiltRes.json();

    if (typeof tiltJson.tilt_score !== "number") {
      console.error("tilt_score response missing tilt_score field", tiltJson);
      return res.status(500).json({
        error: "Invalid tilt_score response",
        details: tiltJson,
      });
    }

    const tiltScore = tiltJson.tilt_score;

    // 3) Record in Firestore
    await recordTiltResult({
      lichessId,
      username: lichessUsername,
      tiltScore,
    });

    return res.status(200).json({ tilt_score: tiltScore });
  } catch (e: any) {
    console.error("Unexpected error in /api/tilt:", e);
    return res.status(500).json({
      error: "Unexpected server error",
      details: e?.message ?? String(e),
    });
  }
}
