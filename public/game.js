// Chess piece Unicode symbols
const pieces = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'
};

// Game state
let gameId = null;
let selectedSquare = null;
let legalMoves = [];
let selectedDifficulty = 'intermediate';
let moveCount = 0;

// DOM elements
const gameSetup = document.getElementById('gameSetup');
const gameContainer = document.getElementById('gameContainer');
const chessBoard = document.getElementById('chessBoard');
const startGameBtn = document.getElementById('startGameBtn');
const newGameBtn = document.getElementById('newGameBtn');
const resignBtn = document.getElementById('resignBtn');
const gameStatus = document.getElementById('gameStatus');
const turnIndicator = document.getElementById('turnIndicator');
const currentDifficulty = document.getElementById('currentDifficulty');
const moveHistory = document.getElementById('moveHistory');
const difficultyBtns = document.querySelectorAll('.difficulty-btn');

// Event listeners
difficultyBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    difficultyBtns.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedDifficulty = btn.dataset.difficulty;
  });
});

startGameBtn.addEventListener('click', startNewGame);
newGameBtn.addEventListener('click', () => {
  gameContainer.style.display = 'none';
  gameSetup.style.display = 'block';
});
resignBtn.addEventListener('click', () => {
  if (confirm('Are you sure you want to resign? 🏳️')) {
    gameStatus.innerHTML = '🏳️ You resigned! Better luck next time!';
    disableBoard();
  }
});

// Start a new game
async function startNewGame() {
  try {
    const response = await fetch('/api/game/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ difficulty: selectedDifficulty })
    });

    const data = await response.json();
    gameId = data.gameId;
    moveCount = 0;

    // Update UI
    gameSetup.style.display = 'none';
    gameContainer.style.display = 'flex';
    currentDifficulty.textContent = selectedDifficulty.charAt(0).toUpperCase() + selectedDifficulty.slice(1);
    gameStatus.textContent = '🎮 Game started! Make your move!';
    turnIndicator.textContent = 'Your turn (White)';
    moveHistory.innerHTML = '';

    // Render the board
    renderBoard(data.fen);
  } catch (error) {
    console.error('Error starting game:', error);
    alert('Failed to start game. Please try again.');
  }
}

// Render the chess board
function renderBoard(fen) {
  chessBoard.innerHTML = '';
  
  // Parse FEN string
  const rows = fen.split(' ')[0].split('/');
  
  for (let row = 0; row < 8; row++) {
    let col = 0;
    for (let char of rows[row]) {
      if (isNaN(char)) {
        // It's a piece
        const square = createSquare(row, col, pieces[char]);
        chessBoard.appendChild(square);
        col++;
      } else {
        // It's empty squares
        const emptyCount = parseInt(char);
        for (let i = 0; i < emptyCount; i++) {
          const square = createSquare(row, col, '');
          chessBoard.appendChild(square);
          col++;
        }
      }
    }
  }
}

// Create a square element
function createSquare(row, col, piece) {
  const square = document.createElement('div');
  const squareId = getSquareId(row, col);
  
  square.className = `square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
  square.dataset.square = squareId;
  square.textContent = piece;
  
  if (piece) {
    square.dataset.piece = piece;
  }
  
  square.addEventListener('click', () => handleSquareClick(squareId, piece));
  
  return square;
}

// Convert row/col to square notation (e.g., 0,0 -> a8)
function getSquareId(row, col) {
  const files = 'abcdefgh';
  const ranks = '87654321';
  return files[col] + ranks[row];
}

// Handle square click
async function handleSquareClick(square, piece) {
  // If a square is already selected
  if (selectedSquare) {
    // Check if this is a legal move
    if (legalMoves.includes(square)) {
      await makeMove(selectedSquare + square);
    } else if (piece && isPieceWhite(piece)) {
      // Select a new piece
      selectSquare(square);
    } else {
      // Deselect
      deselectSquare();
    }
  } else if (piece && isPieceWhite(piece)) {
    // Select the piece
    selectSquare(square);
  }
}

// Check if piece is white
function isPieceWhite(piece) {
  return piece === piece.toUpperCase() && pieces[piece];
}

// Select a square
async function selectSquare(square) {
  deselectSquare();
  selectedSquare = square;
  
  // Highlight selected square
  const squareElement = document.querySelector(`[data-square="${square}"]`);
  if (squareElement) {
    squareElement.classList.add('selected');
  }
  
  // Get legal moves
  try {
    const response = await fetch(`/api/game/${gameId}/moves/${square}`);
    const data = await response.json();
    legalMoves = data.moves;
    
    // Highlight legal moves
    legalMoves.forEach(move => {
      const moveElement = document.querySelector(`[data-square="${move}"]`);
      if (moveElement) {
        moveElement.classList.add('legal-move');
        if (moveElement.dataset.piece) {
          moveElement.classList.add('has-piece');
        }
      }
    });
  } catch (error) {
    console.error('Error getting legal moves:', error);
  }
}

// Deselect square
function deselectSquare() {
  if (selectedSquare) {
    const squareElement = document.querySelector(`[data-square="${selectedSquare}"]`);
    if (squareElement) {
      squareElement.classList.remove('selected');
    }
  }
  
  // Remove legal move highlights
  document.querySelectorAll('.legal-move').forEach(el => {
    el.classList.remove('legal-move', 'has-piece');
  });
  
  selectedSquare = null;
  legalMoves = [];
}

// Make a move
async function makeMove(move) {
  try {
    turnIndicator.textContent = '🤔 AI is thinking...';
    
    const response = await fetch(`/api/game/${gameId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ move })
    });

    const data = await response.json();
    
    if (data.error) {
      alert(data.error);
      deselectSquare();
      return;
    }

    // Update move history
    moveCount++;
    const moveEntry = document.createElement('div');
    moveEntry.innerHTML = `${moveCount}. ${data.playerMove} - ${data.aiMove || 'N/A'}`;
    moveHistory.appendChild(moveEntry);
    moveHistory.scrollTop = moveHistory.scrollHeight;

    // Render updated board
    renderBoard(data.fen);
    deselectSquare();

    // Update game status
    if (data.isCheckmate) {
      gameStatus.innerHTML = data.turn === 'black' ? '🎉 Checkmate! You win! 🎉' : '😢 Checkmate! AI wins! 😢';
      turnIndicator.textContent = 'Game Over';
      disableBoard();
    } else if (data.isDraw) {
      gameStatus.innerHTML = '🤝 Draw! Well played!';
      turnIndicator.textContent = 'Game Over';
      disableBoard();
    } else if (data.isCheck) {
      gameStatus.innerHTML = '⚠️ Check! ⚠️';
      turnIndicator.textContent = 'Your turn (White)';
    } else {
      gameStatus.innerHTML = '🎮 Game in progress';
      turnIndicator.textContent = 'Your turn (White)';
    }
  } catch (error) {
    console.error('Error making move:', error);
    alert('Failed to make move. Please try again.');
    deselectSquare();
  }
}

// Disable board interaction
function disableBoard() {
  chessBoard.style.pointerEvents = 'none';
  chessBoard.style.opacity = '0.6';
}

// Add some Easter eggs and fun messages
const funMessages = [
  "🤖 Beep boop... calculating world domination... I mean, chess moves!",
  "🧠 AI neurons firing at maximum capacity!",
  "♟️ To castle or not to castle, that is the question...",
  "🎯 Targeting your king like a heat-seeking missile!",
  "☕ Processing... might need more coffee...",
  "🚀 Engaging warp speed thinking!",
  "🎲 Rolling the dice... wait, wrong game!"
];

// Random fun message on game start
function showRandomMessage() {
  const message = funMessages[Math.floor(Math.random() * funMessages.length)];
  const messageEl = document.createElement('div');
  messageEl.textContent = message;
  messageEl.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.8); padding: 20px; border-radius: 10px; font-size: 1.2rem; z-index: 1000; animation: fadeOut 3s forwards;';
  document.body.appendChild(messageEl);
  setTimeout(() => messageEl.remove(), 3000);
}

// Add CSS animation for messages
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeOut {
    0% { opacity: 0; }
    10% { opacity: 1; }
    90% { opacity: 1; }
    100% { opacity: 0; }
  }
`;
document.head.appendChild(style);
