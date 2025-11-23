import type { NextApiRequest, NextApiResponse } from "next";
import cookie from "cookie";
import jwt from "jsonwebtoken";
import { db } from "@/lib/firebaseAdmin";

type SessionPayload = {
  lichessId: string;
  lichessUsername: string;
  accessToken: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const sessionSecret = process.env.SESSION_SECRET;
  const token = cookie.parse(req.headers.cookie || "")["session"];
  if (!token || !sessionSecret) return res.status(401).json({ error: "Not logged in" });

  try {
    const session = jwt.verify(token, sessionSecret) as SessionPayload;
    const { lichessUsername } = session;

    console.log(`[/api/py_tilt] Reading recent games from Firestore for ${lichessUsername}...`);

    // 1. NEW: Fetch Context Window from Firestore (Local Cache) instead of Lichess
    // We only need the last 20-50 games for prediction
    const gamesSnap = await db.collection("users").doc(lichessUsername).collection("games")
      .orderBy("createdAt", "desc")
      .limit(30) 
      .get();

    if (gamesSnap.empty) {
      return res.status(200).json({ tilt_score: 0, note: "No games synced yet" });
    }

    // Reverse to chronological order (Oldest -> Newest) for the model
    const recentGames = gamesSnap.docs.map(d => d.data()).reverse();

    // 2. Check if user has a Personal Model trained
    const userDoc = await db.collection("users").doc(lichessUsername).get();
    const personalModel = userDoc.data()?.personalModel || null;

    if (personalModel) {
      console.log("[/api/py_tilt] Using Personal Neural Model 🧠");
    } else {
      console.log("[/api/py_tilt] Using Global Model 🌐");
    }

    // 3. Call Python Microservice
    // NOTE: In local dev, this requires 'vercel dev'. 'npm run dev' cannot route to python.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const pythonUrl = `${appUrl}/api/py_tilt`; 

    const pythonRes = await fetch(pythonUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        games: recentGames,
        personal_model: personalModel 
      }),
    });

    if (!pythonRes.ok) {
      const text = await pythonRes.text();
      console.error("Python Error:", text);
      throw new Error(`Python Analysis Failed: ${text}`);
    }

    const prediction = await pythonRes.json();
    const score = prediction.stop_probability || 0;

    console.log(`[/api/py_tilt] Prediction: ${score}`);

    // 4. Save Result
    await db.collection("users").doc(lichessUsername).collection("tiltResults").add({
      tiltScore: score,
      createdAt: new Date().toISOString(), // ISO for charts
      reason: prediction.reason || "Analysis",
      metrics: prediction.metrics || {}
    });

    // 5. Update Profile Cache
    await db.collection("users").doc(lichessUsername).set({
      lastTiltScore: score,
      lastTiltAt: new Date()
    }, { merge: true });

    return res.status(200).json({ 
      tilt_score: score,
      analysis: prediction
    });

  } catch (e: any) {
    console.error("[/api/py_tilt] Failed:", e);
    return res.status(500).json({ error: e.message });
  }
}