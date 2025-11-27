import { useEffect, useRef, useState } from "react";
import { parseClockFromPgn, extractBasicStats, ProcessedGame } from "@/lib/chess/gameProcessor";

const CACHE_KEY = "chess_quant_history_v1";

export function useAnalysisQueue() {
  const [analyzedGames, setAnalyzedGames] = useState<ProcessedGame[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  // 1. Load Cache on Mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          setAnalyzedGames(JSON.parse(cached));
        } catch (e) { console.error("Cache corrupt, resetting"); }
      }
    }
  }, []);

  // 2. Save Cache on Update
  useEffect(() => {
    if (analyzedGames.length > 0 && typeof window !== "undefined") {
      localStorage.setItem(CACHE_KEY, JSON.stringify(analyzedGames));
    }
  }, [analyzedGames]);

  // 3. Initialize Stockfish Worker
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    workerRef.current = new Worker('/stockfish-worker.js');
    
    workerRef.current.onmessage = (e) => {
      const { type, result, gameId, originalGame } = e.data;
      
      if (type === 'COMPLETE') {
        // Retrieve the username we stored during analyzeGame
        const username = localStorage.getItem("lichess_username") || "";
        
        // A. Stats from Engine (Worker)
        const { acpl, blunders } = result;
        
        // B. Stats from PGN (Main Thread)
        const meta = extractBasicStats(originalGame, username);
        const speed = parseClockFromPgn(originalGame.pgn || ""); // Use PGN for clocks

        const finalRecord: ProcessedGame = {
          id: gameId,
          createdAt: meta.createdAt,
          lastMoveAt: meta.lastMoveAt,
          my_acpl: acpl,
          my_blunder_count: blunders,
          my_avg_secs_per_move: speed,
          result: meta.result,
          rating_diff: meta.rating_diff,
          white_user: meta.white_user,
          black_user: meta.black_user
        };

        // Update State (and trigger Cache save)
        setAnalyzedGames(prev => {
          // Deduplicate
          if (prev.find(p => p.id === gameId)) return prev;
          const next = [...prev, finalRecord].sort((a, b) => a.createdAt - b.createdAt);
          return next;
        });
        
        setIsAnalyzing(false); // Free up the worker
      }
    };
    
    return () => workerRef.current?.terminate();
  }, []);

  const analyzeGame = (game: any, username: string) => {
    if (isAnalyzing || !workerRef.current) return;
    
    // Save username context for the callback
    localStorage.setItem("lichess_username", username);

    // Double check we haven't already done this one
    if (analyzedGames.find(g => g.id === game.id)) return;

    setIsAnalyzing(true);
    
    // Send to Worker
    workerRef.current.postMessage({
      type: 'ANALYZE',
      pgn: game.moves, 
      userColor: game.players.white.user?.name?.toLowerCase() === username.toLowerCase() ? 'white' : 'black',
      gameId: game.id,
      originalGame: game // Pass full object so we can parse PGN in callback
    });
  };

  return { analyzedGames, isAnalyzing, analyzeGame };
}