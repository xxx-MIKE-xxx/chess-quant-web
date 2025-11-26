import { useEffect, useRef, useState } from "react";
import { db } from "@/lib/firebaseClient"; 
import { collection, query, where, limit, getDocs, doc, updateDoc, onSnapshot } from "firebase/firestore";

export function useAnalysisQueue(username: string | undefined | null) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const [queueLength, setQueueLength] = useState(0);

  // 1. Initialize Worker on Mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Point to the file in public/stockfish-worker.js
    workerRef.current = new Worker('/stockfish-worker.js');
    
    workerRef.current.onmessage = async (e) => {
      const { type, result, gameId } = e.data;
      
      if (type === 'COMPLETE') {
        console.log(`[Analysis] Game ${gameId} Finished! ACPL: ${result.acpl}`);
        
        if (username) {
           // Save result to Firestore
           const gameRef = doc(db, "users", username, "games", gameId);
           await updateDoc(gameRef, {
             status: 'analyzed',
             analysis: result, // { acpl, blunders, raw_evals }
             analyzedAt: new Date().toISOString()
           });
        }
        
        // Automatically process the next one
        processNextGame(); 
      }
    };

    return () => workerRef.current?.terminate();
  }, [username]);

  // 2. Watch Queue Size (Optional UI candy)
  useEffect(() => {
    if (!username) return;
    const q = query(collection(db, "users", username, "games"), where("status", "==", "raw"));
    const unsub = onSnapshot(q, (snap) => setQueueLength(snap.size));
    return () => unsub();
  }, [username]);

  // 3. The Processor Function
  async function processNextGame() {
    if (!username || !workerRef.current) return;
    setIsAnalyzing(true);

    // Fetch 1 raw game
    const q = query(
      collection(db, "users", username, "games"),
      where("status", "==", "raw"),
      limit(1)
    );
    
    const snap = await getDocs(q);
    if (snap.empty) {
      setIsAnalyzing(false);
      console.log("[Analysis] Queue empty. Sleeping.");
      return;
    }

    const gameDoc = snap.docs[0];
    const game = gameDoc.data();

    console.log(`[Analysis] Starting ${game.id}...`);

    // Lock it so other tabs don't grab it
    await updateDoc(gameDoc.ref, { status: 'analyzing' });

    // Send to Stockfish
    workerRef.current.postMessage({
      type: 'ANALYZE',
      pgn: game.moves, 
      userColor: game.white.user?.name?.toLowerCase() === username.toLowerCase() ? 'white' : 'black',
      gameId: gameDoc.id
    });
  }

  return { isAnalyzing, queueLength, triggerAnalysis: processNextGame };
}