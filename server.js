import express from 'express';
import { Chess } from 'chess.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Store active games
const games = new Map();

// MCP Client for Copilot integration
let mcpClient = null;

// Initialize MCP client
async function initializeMCPClient() {
  try {
    // Note: This is a placeholder. In a real implementation, you would
    // connect to an actual MCP server. For this demo, we'll use the
    // chess.js engine directly with different difficulty strategies.
    console.log('MCP Client initialization placeholder');
    return true;
  } catch (error) {
    console.error('Failed to initialize MCP client:', error);
    return false;
  }
}

// Chess AI with different difficulty levels
class ChessAI {
  constructor(difficulty = 'intermediate') {
    this.difficulty = difficulty;
  }

  // Evaluate a position (simple material count)
  evaluatePosition(chess) {
    const pieceValues = {
      p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,
      P: -1, N: -3, B: -3, R: -5, Q: -9, K: 0
    };

    let score = 0;
    const board = chess.board();
    
    for (let row of board) {
      for (let square of row) {
        if (square) {
          score += pieceValues[square.type] * (square.color === 'b' ? 1 : -1);
        }
      }
    }
    return score;
  }

  // Get best move based on difficulty
  async getBestMove(chess) {
    const moves = chess.moves({ verbose: true });
    
    if (moves.length === 0) return null;

    if (this.difficulty === 'easy') {
      return this.getEasyMove(moves, chess);
    } else if (this.difficulty === 'intermediate') {
      return this.getIntermediateMove(moves, chess);
    } else {
      return this.getDifficultMove(moves, chess);
    }
  }

  // Easy: Random moves with occasional good moves
  getEasyMove(moves, chess) {
    // 70% random, 30% best move
    if (Math.random() < 0.7) {
      return moves[Math.floor(Math.random() * moves.length)].san;
    }
    return this.findBestMove(moves, chess, 1);
  }

  // Intermediate: Mix of good moves with some randomness
  getIntermediateMove(moves, chess) {
    // 30% random, 70% best move with shallow search
    if (Math.random() < 0.3) {
      return moves[Math.floor(Math.random() * moves.length)].san;
    }
    return this.findBestMove(moves, chess, 2);
  }

  // Difficult: Always try to find the best move
  getDifficultMove(moves, chess) {
    return this.findBestMove(moves, chess, 3);
  }

  // Minimax algorithm to find best move
  findBestMove(moves, chess, depth) {
    let bestMove = null;
    let bestValue = -Infinity;

    for (let move of moves) {
      const tempChess = new Chess(chess.fen());
      tempChess.move(move.san);
      
      const value = this.minimax(tempChess, depth - 1, -Infinity, Infinity, false);
      
      if (value > bestValue) {
        bestValue = value;
        bestMove = move.san;
      }
    }

    return bestMove || moves[0].san;
  }

  // Minimax with alpha-beta pruning
  minimax(chess, depth, alpha, beta, maximizing) {
    if (depth === 0 || chess.isGameOver()) {
      return this.evaluatePosition(chess);
    }

    const moves = chess.moves({ verbose: true });

    if (maximizing) {
      let maxEval = -Infinity;
      for (let move of moves) {
        const tempChess = new Chess(chess.fen());
        tempChess.move(move.san);
        const eval_ = this.minimax(tempChess, depth - 1, alpha, beta, false);
        maxEval = Math.max(maxEval, eval_);
        alpha = Math.max(alpha, eval_);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (let move of moves) {
        const tempChess = new Chess(chess.fen());
        tempChess.move(move.san);
        const eval_ = this.minimax(tempChess, depth - 1, alpha, beta, true);
        minEval = Math.min(minEval, eval_);
        beta = Math.min(beta, eval_);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }
}

// API Routes

// Create new game
app.post('/api/game/new', (req, res) => {
  const { difficulty = 'intermediate' } = req.body;
  const gameId = Date.now().toString();
  const chess = new Chess();
  const ai = new ChessAI(difficulty);
  
  games.set(gameId, { chess, ai, difficulty });
  
  res.json({
    gameId,
    fen: chess.fen(),
    difficulty,
    isGameOver: false,
    turn: 'white'
  });
});

// Get game state
app.get('/api/game/:gameId', (req, res) => {
  const { gameId } = req.params;
  const game = games.get(gameId);
  
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  const { chess } = game;
  
  res.json({
    fen: chess.fen(),
    pgn: chess.pgn(),
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
  
  const { chess, ai } = game;
  
  try {
    // Make player move
    const result = chess.move(move);
    
    if (!result) {
      return res.status(400).json({ error: 'Invalid move' });
    }
    
    // Check if game is over after player move
    if (chess.isGameOver()) {
      return res.json({
        fen: chess.fen(),
        isGameOver: true,
        isCheckmate: chess.isCheckmate(),
        isDraw: chess.isDraw(),
        playerMove: result.san
      });
    }
    
    // AI makes a move
    const aiMove = await ai.getBestMove(chess);
    chess.move(aiMove);
    
    res.json({
      fen: chess.fen(),
      playerMove: result.san,
      aiMove: aiMove,
      isGameOver: chess.isGameOver(),
      isCheck: chess.isCheck(),
      isCheckmate: chess.isCheckmate(),
      isDraw: chess.isDraw(),
      turn: chess.turn() === 'w' ? 'white' : 'black'
    });
  } catch (error) {
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

// Initialize and start server
initializeMCPClient().then(() => {
  app.listen(port, () => {
    console.log(`🎮 Chess game server running on http://localhost:${port}`);
    console.log(`♟️  Ready to play against Copilot!`);
  });
});
