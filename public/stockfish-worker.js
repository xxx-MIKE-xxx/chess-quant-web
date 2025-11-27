// public/stockfish-worker.js

// Load the engine file
importScripts('/stockfish/stockfish.js');

// Initialize the engine
const engine = typeof Stockfish === 'function' ? Stockfish() : new Worker('/stockfish/stockfish.js');

// State to track analysis
let currentJob = null;

// --- 1. LISTEN FOR ENGINE OUTPUT ---
engine.onmessage = function(event) {
  const line = event.data;
  
  if (line.startsWith('bestmove') && currentJob) {
    processBestMove(line);
  } 
  else if (line.indexOf('info depth') > -1 && line.indexOf('score') > -1) {
    processEval(line);
  }
};

// --- 2. PARSE EVALUATION ---
function processEval(line) {
  if (!currentJob) return;
  
  const match = line.match(/score cp (-?\d+)/);
  if (match) {
    currentJob.currentEval = parseInt(match[1]);
  }
  
  const mateMatch = line.match(/score mate (-?\d+)/);
  if (mateMatch) {
    const mateIn = parseInt(mateMatch[1]);
    currentJob.currentEval = mateIn > 0 ? 2000 : -2000;
  }
}

// --- 3. HANDLE MOVE COMPLETION ---
function processBestMove(line) {
  if (!currentJob) return;

  currentJob.evals.push(currentJob.currentEval);
  currentJob.plyIndex++;
  
  if (currentJob.plyIndex < currentJob.moves.length) {
    analyzeNextMove();
  } else {
    // DONE
    const result = calculateStats(currentJob.evals, currentJob.color);
    
    postMessage({ 
      type: 'COMPLETE', 
      result, 
      gameId: currentJob.gameId,
      originalGame: currentJob.originalGame // <--- THIS WAS MISSING
    });
    
    currentJob = null;
  }
}

// --- 4. TRIGGER ANALYSIS ---
function analyzeNextMove() {
  const movesSoFar = currentJob.moves.slice(0, currentJob.plyIndex + 1).join(' ');
  engine.postMessage(`position startpos moves ${movesSoFar}`);
  engine.postMessage('go depth 10'); 
}

// --- 5. CALCULATE METRICS ---
function calculateStats(evals, userColor) {
  let totalCPL = 0;
  let blunders = 0;
  let moveCount = 0;
  const isWhite = userColor === 'white';

  for (let i = 0; i < evals.length; i++) {
    const isWhiteMove = i % 2 === 0;
    const isUserMove = (isWhite && isWhiteMove) || (!isWhite && !isWhiteMove);

    if (isUserMove && i > 0) {
      const prevEval = evals[i-1];
      const currEval = evals[i];
      
      let loss = 0;
      if (isWhite) {
        loss = prevEval - currEval;
      } else {
        loss = currEval - prevEval;
      }
      
      if (loss < 0) loss = 0;
      const cappedLoss = Math.min(loss, 300);

      totalCPL += cappedLoss;
      
      if (loss > 300) {
        blunders++;
      }
      moveCount++;
    }
  }

  const acpl = moveCount > 0 ? Math.round(totalCPL / moveCount) : 0;

  return {
    acpl: acpl,
    blunders: blunders,
    raw_evals: evals
  };
}

// --- 6. MAIN LISTENER ---
onmessage = function(e) {
  // FIX: Destructure originalGame here
  const { type, pgn, userColor, gameId, originalGame } = e.data; 
  
  if (type === 'ANALYZE') {
    engine.postMessage('uci');
    engine.postMessage('isready');
    engine.postMessage('ucinewgame');
    
    const cleanPgn = pgn.replace(/\{.*?\}/g, '').replace(/\d+\./g, '').replace(/1-0|0-1|1\/2-1\/2/g, '').trim();
    const moves = cleanPgn.split(/\s+/).filter(m => m.length >= 2);

    console.log(`[Worker] Starting analysis for ${gameId}`);

    currentJob = {
      gameId: gameId,
      originalGame: originalGame, // FIX: Store it in the job
      moves: moves,
      color: userColor,
      plyIndex: 0,
      evals: [],
      currentEval: 0
    };
    
    analyzeNextMove();
  }
};