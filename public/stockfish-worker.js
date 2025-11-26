// public/stockfish-worker.js

importScripts('/stockfish/stockfish.js'); // Load the engine

const engine = typeof Stockfish === 'function' ? Stockfish() : new Worker('/stockfish/stockfish.js');

// State to track analysis
let currentJob = null;

engine.onmessage = function(event) {
  const line = event.data;
  
  if (line.startsWith('bestmove') && currentJob) {
    // Move finished analyzing
    processBestMove(line);
  } else if (line.indexOf('info depth') > -1 && line.indexOf('score cp') > -1) {
    // Evaluation update
    processEval(line);
  }
};

function processEval(line) {
  if (!currentJob) return;
  
  // Extract centipawn score (e.g. "score cp 45")
  const match = line.match(/score cp (-?\d+)/);
  if (match) {
    currentJob.currentEval = parseInt(match[1]);
  }
  // Handle mate scores ("score mate 3") -> treat as +/- 1000 cp
  const mateMatch = line.match(/score mate (-?\d+)/);
  if (mateMatch) {
    const mateIn = parseInt(mateMatch[1]);
    currentJob.currentEval = mateIn > 0 ? 1000 : -1000;
  }
}

function processBestMove(line) {
  if (!currentJob) return;

  // Store evaluation for this move
  currentJob.evals.push(currentJob.currentEval);
  
  // Move to next ply
  currentJob.plyIndex++;
  
  if (currentJob.plyIndex < currentJob.moves.length) {
    // Analyze next move
    analyzeNextMove();
  } else {
    // FINISHED: Calculate Stats
    const result = calculateStats(currentJob.evals, currentJob.color);
    postMessage({ type: 'COMPLETE', result });
    currentJob = null;
  }
}

function analyzeNextMove() {
  // Setup board state for the current move
  // NOTE: Ideally we replay moves on internal board. 
  // For simplicity MVP, we rely on FENs or assume `position startpos moves ...` works incrementally
  
  const movesSoFar = currentJob.moves.slice(0, currentJob.plyIndex + 1).join(' ');
  engine.postMessage(`position startpos moves ${movesSoFar}`);
  engine.postMessage('go depth 10'); // Fast depth for tilt detection
}

function calculateStats(evals, userColor) {
  let totalCPL = 0;
  let blunders = 0;
  let moveCount = 0;

  // Compare eval[i] vs eval[i-1]
  // Note: This is simplified. Proper ACPL requires comparing Engine Best vs Player Move.
  // For "Tilt Detection" proxy, we check "Did evaluation drop massively after MY move?"
  
  // ... Calculation logic ...
  // We will implement robust logic here in next iteration
  
  return {
    acpl: 45, // Placeholder
    blunders: 2,
    raw_evals: evals
  };
}

onmessage = function(e) {
  const { type, pgn, userColor } = e.data;
  if (type === 'ANALYZE') {
    // Reset engine
    engine.postMessage('uci');
    engine.postMessage('isready');
    
    // Parse PGN to moves list (Simple space split for MVP)
    // Real implementation needs a PGN parser library
    const moves = pgn.replace(/\d+\./g, '').split(/\s+/).filter(m => m.length > 1);

    currentJob = {
      moves: moves,
      color: userColor,
      plyIndex: 0,
      evals: [],
      currentEval: 0
    };
    
    analyzeNextMove();
  }
};