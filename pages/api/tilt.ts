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

  console.log("[/api/tilt] Request started");

  try {
    const sessionSecret = process.env.SESSION_SECRET;
    if (!sessionSecret) {
      console.error("[/api/tilt] SESSION_SECRET missing");
      return res.status(500).json({ error: "SESSION_SECRET not set" });
    }

    const rawCookieHeader = req.headers.cookie || "";
    const cookiesObj = cookie.parse(rawCookieHeader);
    const token = cookiesObj["session"];

    console.log("[/api/tilt] Incoming cookies:", rawCookieHeader);

    if (!token) {
      console.warn("[/api/tilt] No session cookie found");
      return res.status(401).json({ error: "Not logged in" });
    }

    let session: SessionPayload;
    try {
      session = jwt.verify(token, sessionSecret) as SessionPayload;
      console.log("[/api/tilt] Session verified:", {
        lichessId: session.lichessId,
        lichessUsername: session.lichessUsername,
      });
    } catch (e) {
      console.error("[/api/tilt] JWT verification failed:", e);
      return res.status(401).json({ error: "Invalid session" });
    }

    const { lichessId, lichessUsername, accessToken } = session;
    if (!lichessUsername || !accessToken) {
      console.error(
        "[/api/tilt] Session missing username or accessToken",
        session
      );
      return res.status(500).json({ error: "Invalid session payload" });
    }

    // 1) Fetch last 20 games from Lichess
    const gamesUrl = new URL(
      `https://lichess.org/api/games/user/${encodeURIComponent(
        lichessUsername
      )}`
    );
    gamesUrl.searchParams.set("max", "20");
    gamesUrl.searchParams.set("analysed", "1");
    gamesUrl.searchParams.set("moves", "1");
    gamesUrl.searchParams.set("clocks", "1");

    console.log("[/api/tilt] Fetching games from:", gamesUrl.toString());

    const gamesRes = await fetch(gamesUrl.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/x-ndjson",
      },
    });

    if (!gamesRes.ok) {
      const text = await gamesRes.text();
      console.error("[/api/tilt] Lichess games error:", gamesRes.status, text);
      return res.status(500).json({
        error: "Lichess games error",
        status: gamesRes.status,
        details: text,
      });
    }

    const ndjson = await gamesRes.text();
    console.log(
      "[/api/tilt] Got games NDJSON length:",
      ndjson.length,
      "chars"
    );

    // 2) Call Python tilt_score endpoint
    const tiltScoreUrl =
      process.env.TILT_SCORE_URL ||
      "https://chess-quant-web.vercel.app/api/tilt_score";

    console.log("[/api/tilt] Calling tilt_score at:", tiltScoreUrl);

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
      console.error("[/api/tilt] tilt_score error:", tiltRes.status, text);
      return res.status(500).json({
        error: "Tilt analysis temporarily unavailable. Please try again in a minute.",
      });
    }

    const tiltJson = await tiltRes.json();
    console.log("[/api/tilt] tilt_score response:", tiltJson);

    if (typeof tiltJson.tilt_score !== "number") {
      console.error(
        "[/api/tilt] tilt_score response missing tilt_score field",
        tiltJson
      );
      return res.status(500).json({
        error: "Invalid tilt_score response",
        details: tiltJson,
      });
    }

    const tiltScore = tiltJson.tilt_score;

    // 3) Record in Firestore (best-effort: don't fail the whole request)
    try {
      console.log("[/api/tilt] Recording tilt result in Firestore…");
      await recordTiltResult({
        lichessId,
        username: lichessUsername,
        tiltScore,
      });
      console.log("[/api/tilt] Firestore write succeeded");
    } catch (firestoreErr: any) {
      console.error(
        "[/api/tilt] Firestore write FAILED (but will not break response):",
        {
          message: firestoreErr?.message,
          name: firestoreErr?.name,
          stack: firestoreErr?.stack,
        }
      );
      // We intentionally do NOT return an error here.
    }

    console.log("[/api/tilt] Returning tilt_score:", tiltScore);
    return res.status(200).json({ tilt_score: tiltScore });
  } catch (e: any) {
    console.error("[/api/tilt] Unexpected error:", {
      message: e?.message,
      name: e?.name,
      stack: e?.stack,
    });
    return res.status(500).json({
      error: "Unexpected server error",
      details: e?.message ?? String(e),
    });
  }
}
