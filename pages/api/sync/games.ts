import type { NextApiRequest, NextApiResponse } from "next";
import cookie from "cookie";
import jwt from "jsonwebtoken";
import { syncLichessGames } from "@/lib/lichessFetcher";
import { db } from "@/lib/firebaseAdmin";

// --- HELPER: Call the Python Trainer ---
async function trainUserAgent(username: string, games: any[]) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  
  console.log(`[Trainer] Sending ${games.length} games to Python...`);
  
  const res = await fetch(`${appUrl}/api/train`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: username, games }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[Trainer] Failed:", err);
    return false;
  }

  const data = await res.json();

  // Save the new brain to Firestore
  await db.collection("users").doc(username).set({
    personalModel: data.model_b64, // <--- The Brain
    lastTrainAt: new Date().toISOString(),
    lastTrainGameCount: games.length 
  }, { merge: true });
  
  console.log("[Trainer] New personal model saved to Firestore.");
  return true;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const sessionSecret = process.env.SESSION_SECRET!;
  const token = cookie.parse(req.headers.cookie || "")["session"];
  if (!token) return res.status(401).json({ error: "Not logged in" });

  try {
    const session = jwt.verify(token, sessionSecret) as any;
    const { lichessUsername, accessToken } = session;

    // 1. Get sync cursor
    const userRef = db.collection("users").doc(lichessUsername);
    const userSnap = await userRef.get();
    const userData = userSnap.data() || {};
    
    const lastSyncTime = userData.lastGameSyncAt || 0;

    // 2. Run Sync
    const { count, newestGameAt } = await syncLichessGames(
      lichessUsername, 
      accessToken, 
      2000, 
      lastSyncTime
    );

    // 3. Update cursor
    if (newestGameAt > lastSyncTime) {
      await userRef.set({ lastGameSyncAt: newestGameAt + 1 }, { merge: true });
    }

    // --- 4. "LAZY TRAINING" LOGIC ---
    
    // Check total games in DB
    // (Optimization: In production, increment a 'totalGames' counter on the user doc instead of counting collection)
    const gamesSnap = await userRef.collection("games").count().get();
    const totalGames = gamesSnap.data().count;
    
    const lastTrainCount = userData.lastTrainGameCount || 0;
    const diff = totalGames - lastTrainCount;

    let trained = false;

    // CONDITION: Train if it's the first time (0) OR if 50 new games have appeared
    if (totalGames >= 10 && (lastTrainCount === 0 || diff >= 50)) {
      console.log(`[API] 🧠 Triggering Retrain (Diff: ${diff})...`);
      
      // Fetch recent 500 games for training context
      const trainingGamesSnap = await userRef.collection("games")
        .orderBy("createdAt", "desc")
        .limit(500) 
        .get();
        
      const trainingGames = trainingGamesSnap.docs.map(d => d.data());
      
      await trainUserAgent(lichessUsername, trainingGames);
      trained = true;
    }

    return res.status(200).json({ success: true, count, trained });
  } catch (e: any) {
    console.error("[API] Sync failed:", e);
    return res.status(500).json({ error: e.message });
  }
}