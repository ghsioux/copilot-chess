import express from 'express';
import { Chess } from 'chess.js';
import { CopilotClient } from '@github/copilot-sdk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '200kb' }));
app.use(express.static('public'));

// Store active games
const games = new Map();

const copilotClient = new CopilotClient();
let copilotStartError = null;
const copilotReady = (async () => {
  try {
    await copilotClient.start();
    console.log(`🤖 Copilot client started`);
  } catch (err) {
    copilotStartError = err;
    console.error('❌ Failed to start Copilot client:', err);
  }
})();

const DEFAULT_MODEL = 'GPT-4.1';
let availableModels = [];
const modelsReady = (async () => {
  await copilotReady;
  try {
    availableModels = await copilotClient.listModels();
    console.log(`📊 Available models: ${availableModels.map(m => m.name).join(', ')}`);
  } catch (err) {
    console.error('❌ Failed to list Copilot models:', err);
    availableModels = [];
  }
  return availableModels;
})();

const resolveModel = (name) => {
  if (!availableModels.length) return DEFAULT_MODEL;
  const defaultName = availableModels.find(m => m.name === DEFAULT_MODEL)?.name || availableModels[0]?.name || DEFAULT_MODEL;
  if (!name) return defaultName;
  return availableModels.find(m => m.name === name)?.name || defaultName;
};

const getModelNames = () => availableModels.map(m => m.name);

async function createCopilotSession(modelName = DEFAULT_MODEL, aiColor = 'black') {
  await modelsReady;
  await copilotReady;
  if (copilotStartError) throw copilotStartError;
  
  const model = resolveModel(modelName);
  console.log(`🎮 Creating session with model: ${model}, AI plays ${aiColor}`);
  
  return copilotClient.createSession({
    model,
    systemMessage: {
      content: `You are a world-class chess grandmaster playing as ${aiColor}. Your ONLY goal is to WIN the game. 

CRITICAL INSTRUCTIONS:
- You MUST find the BEST possible move in every position
- Always think strategically: control the center, develop pieces, protect your king, create threats
- Look for tactics: forks, pins, skewers, discovered attacks, checkmate patterns
- If you can capture material or gain an advantage, DO IT
- If you're ahead, simplify and convert your advantage
- If you're behind, complicate the position and look for counterplay
- NEVER play passive or weak moves - always play to WIN

You receive the current FEN and the list of legal moves. Respond with exactly one legal move in SAN from the provided list. Do not explain. Output only the SAN.`
    },
  });
}

async function getCopilotMove(session, chessInstance, aiColor = 'black') {
  const legalMovesVerbose = chessInstance.moves({ verbose: true });
  if (!legalMovesVerbose.length) throw new Error('No legal moves');

  const sans = legalMovesVerbose.map(m => m.san);
  const ucis = legalMovesVerbose.map(m => `${m.from}${m.to}${m.promotion || ''}`);

  const colorName = aiColor === 'white' ? 'White' : 'Black';
  const prompt = [
    `You are ${colorName} to move.`,
    `FEN: ${chessInstance.fen()}`,
    `Legal moves (SAN): ${sans.join(', ')}`,
    `Legal moves (UCI): ${ucis.join(', ')}`,
    'Return exactly one legal move in SAN, chosen from the SAN list above.',
  ].join('\n');

  const response = await session.sendAndWait({ prompt });
  const content = (response?.data?.content || '').trim();
  const aiSan = content.split(/\s+/)[0]?.trim();
  if (!aiSan) throw new Error('Empty response from Copilot');
  if (!sans.includes(aiSan)) {
    throw new Error(`Copilot returned illegal move (not in SAN list): ${aiSan}`);
  }
  return aiSan;
}

function buildGameSnapshot(game, gameId) {
  const { chess, model, playerColor, aiColor } = game;
  
  // Rebuild position history and captured pieces by replaying moves
  const tempChess = new Chess();
  const positionHistory = [{ fen: tempChess.fen(), lastMove: null }];
  const capturedByWhite = []; // pieces captured by white player
  const capturedByBlack = []; // pieces captured by black player
  
  const moves = chess.history({ verbose: true });
  
  for (const move of moves) {
    tempChess.move(move.san);
    const lm = { from: move.from, to: move.to };
    positionHistory.push({ fen: tempChess.fen(), lastMove: lm });
    
    if (move.captured) {
      // move.captured is lowercase piece type
      // White capturing means a black piece (lowercase) was captured
      // Black capturing means a white piece (UPPERCASE) was captured
      const capturedPieceCode = move.color === 'w'
        ? move.captured.toLowerCase()   // Black piece
        : move.captured.toUpperCase();  // White piece
      
      if (move.color === 'w') {
        capturedByWhite.push(capturedPieceCode);
      } else {
        capturedByBlack.push(capturedPieceCode);
      }
    }
  }
  
  return {
    version: 2,  // Bump version for new format
    gameId,
    fen: chess.fen(),
    moves: chess.history(),  // SAN moves for display
    positionHistory,         // Full position history for navigation
    capturedByWhite,         // Pieces captured by white
    capturedByBlack,         // Pieces captured by black
    model,
    playerColor,
    aiColor,
  };
}

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return 'Snapshot must be an object';
  if (snapshot.version !== 1 && snapshot.version !== 2) return 'Unsupported snapshot version';
  if (typeof snapshot.fen !== 'string' || !snapshot.fen.trim()) return 'Missing fen';
  if (!Array.isArray(snapshot.moves)) return 'Missing moves array';
  if (snapshot.moves.some(m => typeof m !== 'string' || !m.trim())) return 'Moves must be non-empty strings';
  if (snapshot.playerColor && !['white', 'black'].includes(snapshot.playerColor)) return 'Invalid playerColor';
  if (snapshot.aiColor && !['white', 'black'].includes(snapshot.aiColor)) return 'Invalid aiColor';
  if (snapshot.model && typeof snapshot.model !== 'string') return 'Invalid model';
  return null;
}

// API Routes

// List available models
app.get('/api/models', async (req, res) => {
  try {
    await modelsReady;
    if (!availableModels.length) {
      return res.status(500).json({ error: 'No models available' });
    }
    res.json({ models: availableModels.map(m => ({ name: m.name, id: m.id || null })) });
  } catch (error) {
    console.error('Error listing models:', error);
    res.status(500).json({ error: 'Failed to list models' });
  }
});

// Create new game
app.post('/api/game/new', async (req, res) => {
  const { model } = req.body;
  
  try {
    await modelsReady;
    const modelName = resolveModel(model);
    if (!modelName) {
      return res.status(500).json({ error: 'No usable model found' });
    }
    const gameId = crypto.randomUUID();
    const chess = new Chess();
    
    // Randomly assign player color
    const playerColor = Math.random() < 0.5 ? 'white' : 'black';
    const aiColor = playerColor === 'white' ? 'black' : 'white';
    console.log(`🎲 Random color assignment: Player = ${playerColor}, AI = ${aiColor}`);
    
    const session = await createCopilotSession(modelName, aiColor);
    
    games.set(gameId, { chess, session, model: modelName, playerColor, aiColor });
    
    // Return immediately - don't wait for AI first move
    res.json({
      gameId,
      fen: chess.fen(),
      model: modelName,
      isGameOver: false,
      turn: chess.turn() === 'w' ? 'white' : 'black',
      playerColor,
      aiColor,
      aiMovesFirst: playerColor === 'black'
    });
  } catch (error) {
    console.error('Error creating game session:', error);
    res.status(500).json({ error: 'Failed to start Copilot session' });
  }
});

// Export a game snapshot (FEN + SAN history)
app.get('/api/game/:gameId/export', (req, res) => {
  const { gameId } = req.params;
  const game = games.get(gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(buildGameSnapshot(game, gameId));
});

// Import a game snapshot (creates a NEW gameId)
app.post('/api/game/import', async (req, res) => {
  const snapshot = req.body;
  const validationError = validateSnapshot(snapshot);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    await modelsReady;
    const playerColor = snapshot.playerColor || 'white';
    const aiColor = snapshot.aiColor || (playerColor === 'white' ? 'black' : 'white');
    const modelName = resolveModel(snapshot.model);

    const chess = new Chess();
    for (const san of snapshot.moves) {
      const result = chess.move(san);
      if (!result) {
        return res.status(400).json({ error: `Invalid move in snapshot: ${san}` });
      }
    }

    const finalFen = chess.fen();
    if (finalFen !== snapshot.fen) {
      return res.status(400).json({
        error: 'Snapshot mismatch: moves do not lead to provided FEN',
        computedFen: finalFen,
      });
    }

    const gameId = crypto.randomUUID();
    const session = await createCopilotSession(modelName, aiColor);
    games.set(gameId, { chess, session, model: modelName, playerColor, aiColor });

    // Rebuild position history and captured pieces
    const tempChess = new Chess();
    const positionHistory = [{ fen: tempChess.fen(), lastMove: null }];
    const capturedByWhite = [];
    const capturedByBlack = [];
    
    const verboseMoves = chess.history({ verbose: true });
    // Reset and replay to build history
    tempChess.reset();
    for (const move of verboseMoves) {
      tempChess.move(move.san);
      positionHistory.push({ 
        fen: tempChess.fen(), 
        lastMove: { from: move.from, to: move.to } 
      });
      
      if (move.captured) {
        const capturedPieceCode = move.color === 'w'
          ? move.captured.toLowerCase()
          : move.captured.toUpperCase();
        
        if (move.color === 'w') {
          capturedByWhite.push(capturedPieceCode);
        } else {
          capturedByBlack.push(capturedPieceCode);
        }
      }
    }

    res.json({
      gameId,
      fen: finalFen,
      moves: chess.history(),
      positionHistory,
      capturedByWhite,
      capturedByBlack,
      model: modelName,
      playerColor,
      aiColor,
      isGameOver: chess.isGameOver(),
      isCheck: chess.isCheck(),
      isCheckmate: chess.isCheckmate(),
      isDraw: chess.isDraw(),
      turn: chess.turn() === 'w' ? 'white' : 'black',
      legalMoves: chess.moves(),
    });
  } catch (error) {
    console.error('Error importing snapshot:', error);
    res.status(500).json({ error: error.message || 'Failed to import snapshot' });
  }
});

// Get AI's first move (when AI plays white)
app.post('/api/game/:gameId/ai-first-move', async (req, res) => {
  const { gameId } = req.params;
  const game = games.get(gameId);
  
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  const { chess, session, model, aiColor } = game;
  
  // Only process if it's AI's turn (white = 'w')
  if (chess.turn() !== 'w' || aiColor !== 'white') {
    return res.status(400).json({ error: 'Not AI turn to move first' });
  }
  
  try {
    const aiStartTime = Date.now();
    const aiMoveSan = await getCopilotMove(session, chess, aiColor);
    const aiThinkTime = Date.now() - aiStartTime;
    
    const aiResult = chess.move(aiMoveSan);
    if (!aiResult) {
      throw new Error(`Copilot returned illegal move: ${aiMoveSan}`);
    }
    
    res.json({
      fen: chess.fen(),
      aiMove: {
        san: aiResult.san,
        from: aiResult.from,
        to: aiResult.to,
        color: aiResult.color,
        captured: aiResult.captured || null
      },
      aiThinkTime,
      model
    });
  } catch (error) {
    console.error('AI first move error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get AI move for any position (when it's AI's turn)
app.post('/api/game/:gameId/ai-move', async (req, res) => {
  const { gameId } = req.params;
  const game = games.get(gameId);

  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }

  const { chess, session, model, aiColor } = game;
  const aiTurn = aiColor === 'white' ? 'w' : 'b';
  if (chess.turn() !== aiTurn) {
    return res.status(400).json({ error: 'Not AI turn' });
  }

  if (chess.isGameOver()) {
    return res.status(400).json({ error: 'Game is over' });
  }

  try {
    const aiStartTime = Date.now();
    const aiMoveSan = await getCopilotMove(session, chess, aiColor);
    const aiThinkTime = Date.now() - aiStartTime;

    const aiResult = chess.move(aiMoveSan);
    if (!aiResult) {
      throw new Error(`Copilot returned illegal move: ${aiMoveSan}`);
    }

    res.json({
      fen: chess.fen(),
      aiMove: {
        san: aiResult.san,
        from: aiResult.from,
        to: aiResult.to,
        color: aiResult.color,
        captured: aiResult.captured || null,
      },
      aiThinkTime,
      model,
      isGameOver: chess.isGameOver(),
      isCheck: chess.isCheck(),
      isCheckmate: chess.isCheckmate(),
      isDraw: chess.isDraw(),
      turn: chess.turn() === 'w' ? 'white' : 'black',
    });
  } catch (error) {
    console.error('AI move error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get game state
app.get('/api/game/:gameId', (req, res) => {
  const { gameId } = req.params;
  const game = games.get(gameId);
  
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  const { chess, model, playerColor, aiColor } = game;
  
  res.json({
    fen: chess.fen(),
    pgn: chess.pgn(),
    model,
    playerColor,
    aiColor,
    isGameOver: chess.isGameOver(),
    isCheck: chess.isCheck(),
    isCheckmate: chess.isCheckmate(),
    isDraw: chess.isDraw(),
    turn: chess.turn() === 'w' ? 'white' : 'black',
    legalMoves: chess.moves()
  });
});

// Make a move
app.post('/api/game/:gameId/move', async (req, res) => {
  const { gameId } = req.params;
  const { move } = req.body;
  const game = games.get(gameId);
  
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  const { chess, session, model, aiColor } = game;
  
  try {
    // Make player move
    const result = chess.move(move);
    
    if (!result) {
      return res.status(400).json({ error: 'Invalid move' });
    }

    const playerMove = {
      san: result.san,
      from: result.from,
      to: result.to,
      color: result.color,
      captured: result.captured || null
    };

    const fenAfterPlayer = chess.fen();
    
    // Check if game is over after player move
    if (chess.isGameOver()) {
      return res.json({
        fen: chess.fen(),
        fenAfterPlayer,
        isGameOver: true,
        isCheckmate: chess.isCheckmate(),
        isDraw: chess.isDraw(),
        playerMove,
        turn: chess.turn() === 'w' ? 'white' : 'black',
        playerMadeLastMove: true
      });
    }
    
    // Copilot makes a move (with timing)
    const aiStartTime = Date.now();
    const aiMoveSan = await getCopilotMove(session, chess, aiColor);
    const aiThinkTime = Date.now() - aiStartTime;
    
    const aiResult = chess.move(aiMoveSan);
    if (!aiResult) {
      throw new Error(`Copilot returned illegal move: ${aiMoveSan}`);
    }

    const aiMove = {
      san: aiResult.san,
      from: aiResult.from,
      to: aiResult.to,
      color: aiResult.color,
      captured: aiResult.captured || null
    };
    
    res.json({
      fen: chess.fen(),
      fenAfterPlayer,
      playerMove,
      aiMove,
      aiThinkTime,
      model,
      isGameOver: chess.isGameOver(),
      isCheck: chess.isCheck(),
      isCheckmate: chess.isCheckmate(),
      isDraw: chess.isDraw(),
      turn: chess.turn() === 'w' ? 'white' : 'black'
    });
  } catch (error) {
    console.error('Copilot move error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get legal moves for a piece
app.get('/api/game/:gameId/moves/:square', (req, res) => {
  const { gameId, square } = req.params;
  const game = games.get(gameId);
  
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  const { chess } = game;
  const moves = chess.moves({ square, verbose: true });
  
  res.json({
    moves: moves.map(m => m.to)
  });
});

// Start server
app.listen(port, () => {
  console.log(`🎮 Chess game server running on http://localhost:${port}`);
  console.log(`♟️  Ready to play against Copilot!`);
});

const shutdown = async () => {
  try {
    await copilotClient.stop();
    console.log('🛑 Copilot client stopped');
  } catch (err) {
    console.error('Error stopping Copilot client:', err);
  }
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', () => {
  // best-effort sync stop
});
