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

// Save game to a GitHub issue via Copilot SDK + GitHub MCP Server
app.post('/api/game/:gameId/save-to-issue', async (req, res) => {
  const { gameId } = req.params;
  const game = games.get(gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const snapshot = buildGameSnapshot(game, gameId);
  const { chess, model, playerColor, aiColor } = game;
  const moves = chess.history();
  const totalMoves = moves.length;
  const status = chess.isCheckmate() ? 'Checkmate'
    : chess.isDraw() ? 'Draw'
    : chess.isStalemate() ? 'Stalemate'
    : 'In Progress';

  const movePairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    const num = Math.floor(i / 2) + 1;
    movePairs.push(`${num}. ${moves[i]} ${moves[i + 1] || ''}`);
  }

  // Detect repo from git
  let owner, repo;
  try {
    const { execSync } = await import('child_process');
    const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (match) { owner = match[1]; repo = match[2]; }
  } catch { /* ignore */ }
  if (!owner || !repo) {
    return res.status(500).json({ error: 'Could not detect GitHub repo from git remote' });
  }

  const title = `♟️ Chess Game Save — ${status} (${totalMoves} moves, ${model})`;
  const body = [
    `## ♟️ Copilot Chess — Saved Game`,
    '', '| Info | Value |', '|------|-------|',
    `| **Status** | ${status} |`,
    `| **Model** | ${model} |`,
    `| **Player Color** | ${playerColor} |`,
    `| **AI Color** | ${aiColor} |`,
    `| **Total Moves** | ${totalMoves} |`,
    `| **FEN** | \`${chess.fen()}\` |`,
    '', '### Move History', '```', movePairs.join('\n'), '```',
    '', '### Game Snapshot (for import)', '<details>', '<summary>Click to expand JSON</summary>',
    '', '```json', JSON.stringify(snapshot, null, 2), '```', '</details>',
  ].join('\n');

  let mcpSession;
  try {
    console.log('📝 Creating MCP session to save game as GitHub issue...');

    mcpSession = await copilotClient.createSession({
      model: 'GPT-4.1',
      systemMessage: {
        content: `You create GitHub issues. Use the issue_write MCP tool to create issues. Respond ONLY with raw JSON (no markdown): {"issueUrl": "...", "issueNumber": ...}`
      },
      mcpServers: {
        github: {
          type: 'http',
          url: 'https://api.githubcopilot.com/mcp/',
          tools: ['issue_write'],
        }
      },
      // Auto-approve MCP tool calls (required for non-interactive usage)
      onPermissionRequest: () => ({ kind: 'approved' }),
      // Disable infinite sessions for this one-shot task
      infiniteSessions: { enabled: false },
    });

    const escapedTitle = title.replace(/"/g, '\\"');
    const escapedBody = body.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    const prompt = `Create a GitHub issue with method "create" in repo owner="${owner}" repo="${repo}" with title="${escapedTitle}" and the following body:\n\n${body}\n\nReturn only JSON: {"issueUrl": "https://github.com/${owner}/${repo}/issues/NUMBER", "issueNumber": NUMBER}`;

    console.log('📤 Sending MCP request...');
    const result = await mcpSession.sendAndWait({ prompt });
    const content = (result?.data?.content || '').trim();
    console.log('📥 MCP response:', content);

    // Parse JSON from response
    let issueData;
    const jsonMatch = content.match(/\{[^}]*"issueUrl"[^}]*\}/);
    if (jsonMatch) {
      try { issueData = JSON.parse(jsonMatch[0]); } catch { /* ignore */ }
    }

    if (issueData?.issueUrl) {
      res.json({ issueUrl: issueData.issueUrl, issueNumber: issueData.issueNumber });
    } else {
      // Check if the response indicates a permission error
      const lower = content.toLowerCase();
      if (lower.includes('403') || lower.includes('forbidden') || lower.includes('permission') || lower.includes('not authorized') || lower.includes('resource not accessible')) {
        return res.status(403).json({ error: 'You don\'t have write access to this repository.', code: 'NO_WRITE_ACCESS', repoUrl: `https://github.com/${owner}/${repo}` });
      }
      // Fallback: the issue was likely created but response parsing failed
      res.json({ issueUrl: `https://github.com/${owner}/${repo}/issues`, issueNumber: null, note: 'Issue likely created — check repo' });
    }
  } catch (error) {
    console.error('❌ Save to issue error:', error);
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('403') || msg.includes('forbidden') || msg.includes('permission') || msg.includes('resource not accessible')) {
      return res.status(403).json({ error: 'You don\'t have write access to this repository.', code: 'NO_WRITE_ACCESS', repoUrl: `https://github.com/${owner}/${repo}` });
    }
    res.status(500).json({ error: error.message || 'Failed to create issue via MCP' });
  } finally {
    mcpSession?.destroy().catch(() => {});
  }
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
        lastMove: { from: move.from, to: move.to },
        isCheck: tempChess.isCheck()
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

    // Determine who is in check for the UI
    const currentTurn = chess.turn() === 'w' ? 'white' : 'black';
    const aiInCheck = chess.isCheck() && currentTurn === aiColor;
    const playerInCheck = chess.isCheck() && currentTurn === playerColor;

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
      aiInCheck,
      playerInCheck,
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

    const playerInCheck = chess.isCheck();
    const playerCheckmate = chess.isCheckmate();
    console.log(`🤖 AI played ${aiResult.san} | PlayerCheck: ${playerInCheck} | AICheck: false | PlayerCheckmate: ${playerCheckmate} | AICheckmate: false | FEN: ${chess.fen()}`);

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
      playerInCheck,
      playerCheckmate,
      isGameOver: chess.isGameOver(),
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

// Make player move only (AI will be requested separately)
app.post('/api/game/:gameId/move', async (req, res) => {
  const { gameId } = req.params;
  const { move } = req.body;
  const game = games.get(gameId);
  
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  const { chess } = game;
  
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
    // After player move: AI is now to move, so isCheck() tells if AI king is in check
    const aiInCheck = chess.isCheck();
    const aiCheckmate = chess.isCheckmate();
    const isGameOver = chess.isGameOver();
    console.log(`♟️ PLAYER played ${result.san} | PlayerCheck: false | AICheck: ${aiInCheck} | PlayerCheckmate: false | AICheckmate: ${aiCheckmate} | FEN: ${fenAfterPlayer}`);
    
    res.json({
      fen: fenAfterPlayer,
      playerMove,
      aiInCheck,
      aiCheckmate,
      isGameOver,
      isDraw: chess.isDraw(),
      turn: chess.turn() === 'w' ? 'white' : 'black'
    });
  } catch (error) {
    console.error('Player move error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get AI move (call after player move)
app.post('/api/game/:gameId/ai-move', async (req, res) => {
  const { gameId } = req.params;
  const game = games.get(gameId);
  
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  const { chess, session, model, aiColor } = game;
  
  try {
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
    
    // After AI move: Player is now to move, so isCheck() tells if Player king is in check
    const playerInCheck = chess.isCheck();
    const playerCheckmate = chess.isCheckmate();
    const isGameOver = chess.isGameOver();
    console.log(`🤖 AI played ${aiResult.san} | PlayerCheck: ${playerInCheck} | AICheck: false | PlayerCheckmate: ${playerCheckmate} | AICheckmate: false | FEN: ${chess.fen()}`);
    
    res.json({
      fen: chess.fen(),
      aiMove,
      aiThinkTime,
      model,
      playerInCheck,
      playerCheckmate,
      isGameOver,
      isDraw: chess.isDraw(),
      turn: chess.turn() === 'w' ? 'white' : 'black'
    });
  } catch (error) {
    console.error('AI move error:', error);
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
