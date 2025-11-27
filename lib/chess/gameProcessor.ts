// lib/chess/gameProcessor.ts

export type ProcessedGame = {
  id: string;
  createdAt: number;
  lastMoveAt: number;
  
  // Features for Model
  my_acpl: number;
  my_blunder_count: number;
  my_avg_secs_per_move: number;
  result: number; // 1.0 (Win), 0.5 (Draw), 0.0 (Loss)
  rating_diff: number;
  
  // Metadata
  white_user: string;
  black_user: string;
};

export function parseClockFromPgn(pgn: string): number {
  if (!pgn) return 30.0;

  // Extract all [%clk H:MM:SS] tags
  const times: number[] = [];
  const regex = /\[%clk (\d+):(\d+):(\d+)\]/g;
  let match;

  while ((match = regex.exec(pgn)) !== null) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const s = parseInt(match[3], 10);
    times.push(h * 3600 + m * 60 + s);
  }

  if (times.length < 2) return 30.0;

  // Calculate time spent per move (absolute diff between consecutive clock states)
  const diffs: number[] = [];
  for (let i = 0; i < times.length - 1; i++) {
    const delta = Math.abs(times[i] - times[i + 1]);
    // Filter artifacts (e.g. game start delays > 5 min)
    if (delta < 300) {
      diffs.push(delta);
    }
  }

  if (diffs.length === 0) return 30.0;

  const sum = diffs.reduce((a, b) => a + b, 0);
  return sum / diffs.length;
}

export function extractBasicStats(game: any, username: string) {
  // Normalize username check
  const isWhite = game.players.white.user?.name?.toLowerCase() === username.toLowerCase();
  const myColor = isWhite ? 'white' : 'black';
  const oppColor = isWhite ? 'black' : 'white';
  
  // 1. Result (1.0 / 0.5 / 0.0)
  let result = 0.5;
  if (game.winner === myColor) result = 1.0;
  else if (game.winner === oppColor) result = 0.0;
  
  // 2. Rating Diff
  const rating_diff = game.players[myColor].ratingDiff || 0; 

  // 3. Timestamps
  const createdAt = game.createdAt;
  const lastMoveAt = game.lastMoveAt || (createdAt + 1000 * 60 * 10); // Default 10m duration

  return {
    result,
    rating_diff,
    createdAt,
    lastMoveAt,
    white_user: game.players.white.user?.name || "Anon",
    black_user: game.players.black.user?.name || "Anon"
  };
}