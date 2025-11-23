import { db } from "@/lib/firebaseAdmin";

/**
 * Fetches games from Lichess API (NDJSON format) and saves them to Firestore.
 * Returns the count of saved games and the timestamp of the most recent game.
 */
export async function syncLichessGames(
  username: string, 
  accessToken: string, 
  maxGames = 2000, 
  since?: number
) {
  // If we have a 'since' date, we ask Lichess only for new games
  let url = `https://lichess.org/api/games/user/${username}?max=${maxGames}&clocks=true&evals=true&opening=true`;
  
  if (since) {
    console.log(`[Sync] Fetching games since ${new Date(since).toLocaleString()}...`);
    url += `&since=${since}`;
  } else {
    console.log(`[Sync] Starting FULL download for ${username}...`);
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/x-ndjson",
    },
  });

  if (!res.ok) {
    console.error(`[Sync] Lichess API error: ${res.status} ${res.statusText}`);
    throw new Error(`Failed to fetch games: ${res.statusText}`);
  }

  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  
  let buffer = "";
  let gameCount = 0;
  let newestGameAt = 0; // Track the timestamp of the latest game found
  
  const batchLimit = 400; 
  let batch = db.batch();

  const processGame = (jsonStr: string) => {
    if (!jsonStr || !jsonStr.trim()) return;

    try {
      const game = JSON.parse(jsonStr);
      
      if (!game.id) return;

      // Track the latest game time for the "since" cursor
      if (game.createdAt > newestGameAt) {
        newestGameAt = game.createdAt;
      }

      const docRef = db.collection("users").doc(username).collection("games").doc(game.id);
      
      batch.set(docRef, {
        id: game.id,
        createdAt: game.createdAt,
        rated: game.rated,
        variant: game.variant,
        speed: game.speed,
        perf: game.perf,
        white: game.players.white,
        black: game.players.black,
        winner: game.winner || "draw",
        moves: game.moves,
        opening: game.opening,
        syncedAt: new Date().toISOString()
      }, { merge: true });

      gameCount++;
    } catch (e) {
      // Silent catch for stream artifacts
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; 

    for (const line of lines) {
      processGame(line);
      
      if (gameCount > 0 && gameCount % batchLimit === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
  }

  if (buffer.trim()) processGame(buffer);
  
  if (gameCount > 0) {
    await batch.commit();
  }
  
  console.log(`[Sync] Complete. Saved: ${gameCount}. Latest: ${new Date(newestGameAt).toLocaleString()}`);
  
  return { count: gameCount, newestGameAt };
}