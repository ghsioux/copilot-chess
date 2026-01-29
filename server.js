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

app.use(express.json());
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
      content: `You are a chess engine playing as ${aiColor}. You receive the current FEN and the list of legal moves. Respond with exactly one legal move in SAN from the provided list. Do not explain. Output only the SAN.`
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
        color: aiResult.color
      },
      aiThinkTime,
      model
    });
  } catch (error) {
    console.error('AI first move error:', error);
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
  
  const { chess, model } = game;
  
  res.json({
    fen: chess.fen(),
    pgn: chess.pgn(),
    model,
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
      color: result.color
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
        playerMove
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
      color: aiResult.color
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
