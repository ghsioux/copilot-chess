// Chess piece Unicode symbols (using filled symbols for all, styled by CSS)
const pieces = {
  K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'
};

// Game state
let gameId = null;
let selectedSquare = null;
let legalMoves = [];
let selectedModel = null;
let moveCount = 0;
let isAnimating = false;
let lastMove = null; // { from: 'e2', to: 'e4' }
let playerColor = 'white'; // 'white' or 'black'

// History navigation
let positionHistory = []; // Array of { fen, lastMove } for each position
let historyIndex = -1; // Current position in history (-1 = not browsing)
let isViewingHistory = false;

// Move timing
let turnStartTime = null;

// Board orientation
let isBoardFlipped = false;
let currentDisplayedFen = null; // Track the currently displayed position
let currentModelName = null; // Store the current AI model name

// DOM elements
const gameSetup = document.getElementById('gameSetup');
const gameContainer = document.getElementById('gameContainer');
const chessBoard = document.getElementById('chessBoard');
const startGameBtn = document.getElementById('startGameBtn');
const newGameBtn = document.getElementById('newGameBtn');
const flipBoardBtn = document.getElementById('flipBoardBtn');
const resignBtn = document.getElementById('resignBtn');
const gameStatus = document.getElementById('gameStatus');
const turnIndicator = document.getElementById('turnIndicator');
const currentDifficulty = document.getElementById('currentDifficulty');
const moveHistory = document.getElementById('moveHistory');
const modelSelect = document.getElementById('modelSelect');

// Event listeners
if (modelSelect) {
  modelSelect.addEventListener('change', (e) => {
    selectedModel = e.target.value;
  });
}

startGameBtn.disabled = true;
startGameBtn.addEventListener('click', startNewGame);
newGameBtn.addEventListener('click', () => {
  gameContainer.style.display = 'none';
  gameSetup.style.display = 'block';
});
flipBoardBtn.addEventListener('click', flipBoard);
resignBtn.addEventListener('click', () => {
  if (confirm('Are you sure you want to resign? 🏳️')) {
    gameStatus.innerHTML = '🏳️ You resigned! Better luck next time!';
    disableBoard();
  }
});

async function loadModels() {
  try {
    const response = await fetch('/api/models');
    const data = await response.json();
    const models = data.models || [];
    if (!models.length) throw new Error('No models');

    modelSelect.innerHTML = models.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
    selectedModel = models[0].name;
    modelSelect.value = selectedModel;
    startGameBtn.disabled = false;
  } catch (error) {
    console.error('Error loading models:', error);
    if (modelSelect) {
      modelSelect.innerHTML = '<option value="" disabled selected>No models available</option>';
    }
    startGameBtn.disabled = true;
    alert('Unable to load models. Please try again later.');
  }
}

if (modelSelect) {
  loadModels();
}

// Start a new game
async function startNewGame() {
  try {
    if (!selectedModel) {
      alert('Please select a model.');
      return;
    }
    const response = await fetch('/api/game/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: selectedModel })
    });

    const data = await response.json();
    gameId = data.gameId;
    moveCount = 0;
    lastMove = null;
    playerColor = data.playerColor || 'white';
    
    // Flip board if player is black (so their pieces are at bottom)
    isBoardFlipped = playerColor === 'black';
    
    positionHistory = [{ fen: data.fen, lastMove: null }];
    historyIndex = -1;
    isViewingHistory = false;

    gameSetup.style.display = 'none';
    gameContainer.style.display = 'flex';
    currentModelName = data.model || selectedModel || 'IA';
    currentDifficulty.textContent = currentModelName;
    updateBoardLabels();
    
    const colorName = playerColor === 'white' ? 'White' : 'Black';
    gameStatus.textContent = `🎮 Game started! You play ${colorName}!`;
    moveHistory.innerHTML = '';

    // Render board immediately
    renderBoard(data.fen);
    
    // If AI moves first, fetch its move asynchronously
    if (data.aiMovesFirst) {
      turnIndicator.textContent = '🤔 Copilot is thinking...';
      isAnimating = true;
      
      try {
        const aiResponse = await fetch(`/api/game/${gameId}/ai-first-move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const aiData = await aiResponse.json();
        
        if (aiData.aiMove) {
          // Animate AI's first move
          await animateMove(aiData.aiMove.from, aiData.aiMove.to);
          lastMove = { from: aiData.aiMove.from, to: aiData.aiMove.to };
          moveCount = 1;
          
          // Update board with new position
          renderBoard(aiData.fen);
          
          // Save to history
          positionHistory.push({ fen: aiData.fen, lastMove: lastMove });
          
          // Add to move history
          const aiTime = aiData.aiThinkTime ? formatMoveTime(aiData.aiThinkTime) : '';
          const aiTimeStr = aiTime ? ` (${aiTime})` : '';
          const moveEntry = document.createElement('div');
          moveEntry.innerHTML = `1. ${aiData.aiMove.san}${aiTimeStr} - ...`;
          moveHistory.appendChild(moveEntry);
        }
      } catch (error) {
        console.error('Error getting AI first move:', error);
        gameStatus.textContent = '❌ AI failed to move';
      }
      
      isAnimating = false;
    }
    
    turnIndicator.textContent = `Your turn (${colorName})`;
    turnStartTime = Date.now();
  } catch (error) {
    console.error('Error starting game:', error);
    alert('Failed to start game. Please try again.');
  }
}

// Render the chess board from FEN
function renderBoard(fen) {
  currentDisplayedFen = fen; // Track the current displayed position
  chessBoard.innerHTML = '';
  const rows = fen.split(' ')[0].split('/');
  
  // If board is flipped, reverse the rendering order
  const rowOrder = isBoardFlipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const colOrder = isBoardFlipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  
  for (const row of rowOrder) {
    let colIndex = 0;
    const rowData = [];
    
    // Parse the FEN row into an array of pieces
    for (const char of rows[row]) {
      if (isNaN(char)) {
        rowData.push(char);
      } else {
        for (let i = 0; i < parseInt(char); i++) {
          rowData.push('');
        }
      }
    }
    
    // Render columns in the correct order
    for (const col of colOrder) {
      chessBoard.appendChild(createSquare(row, col, rowData[col]));
    }
  }
  
  // Highlight last move
  highlightLastMove();
  
  // Update coordinates display
  updateCoordinates();
}

// Highlight last move without re-rendering the board
function highlightLastMove() {
  // Clear previous highlights
  document.querySelectorAll('.last-move-from, .last-move-to').forEach(el => {
    el.classList.remove('last-move-from', 'last-move-to');
  });
  
  // Add new highlights
  if (lastMove) {
    const fromEl = document.querySelector(`[data-square="${lastMove.from}"]`);
    const toEl = document.querySelector(`[data-square="${lastMove.to}"]`);
    if (fromEl) fromEl.classList.add('last-move-from');
    if (toEl) toEl.classList.add('last-move-to');
  }
}

// Update board labels with model name
function updateBoardLabels() {
  const topLabel = document.querySelector('.board-label-top');
  const bottomLabel = document.querySelector('.board-label-bottom');
  const modelDisplayName = currentModelName || 'IA';
  
  const playerColorName = playerColor === 'white' ? 'Blancs' : 'Noirs';
  const aiColorName = playerColor === 'white' ? 'Noirs' : 'Blancs';
  
  if (topLabel && bottomLabel) {
    if (isBoardFlipped) {
      // When flipped, player's pieces are at top
      topLabel.textContent = `Vous (${playerColorName})`;
      bottomLabel.textContent = `🤖 ${modelDisplayName} (${aiColorName})`;
    } else {
      // Normal view, player's pieces at bottom
      topLabel.textContent = `🤖 ${modelDisplayName} (${aiColorName})`;
      bottomLabel.textContent = `Vous (${playerColorName})`;
    }
  }
}

// Flip the board orientation
function flipBoard() {
  isBoardFlipped = !isBoardFlipped;
  
  // Read current board state from DOM to preserve any in-progress animations
  const fenFromDOM = getBoardFenFromDOM();
  
  if (fenFromDOM) {
    renderBoard(fenFromDOM);
  } else if (currentDisplayedFen) {
    renderBoard(currentDisplayedFen);
  } else {
    // Fallback to position history
    const currentPosition = isViewingHistory 
      ? positionHistory[historyIndex] 
      : positionHistory[positionHistory.length - 1];
    
    if (currentPosition) {
      renderBoard(currentPosition.fen);
    }
  }
  
  // Update labels
  updateBoardLabels();
  
  // Update flip button icon
  const flipBtn = document.getElementById('flipBoardBtn');
  if (flipBtn) {
    flipBtn.textContent = isBoardFlipped ? '🔄 Flip (Black view)' : '🔄 Flip Board';
  }
}

// Read the current board state from DOM and convert to FEN (position part only)
function getBoardFenFromDOM() {
  const pieceToFen = {
    '♔': 'K', '♕': 'Q', '♖': 'R', '♗': 'B', '♘': 'N', '♙': 'P',
    '♚': 'k', '♛': 'q', '♜': 'r', '♝': 'b', '♞': 'n', '♟': 'p'
  };
  
  const rows = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = '';
    let emptyCount = 0;
    
    for (const file of 'abcdefgh') {
      const square = document.querySelector(`[data-square="${file}${rank}"]`);
      const piece = square?.textContent?.trim();
      
      if (piece && pieceToFen[piece]) {
        if (emptyCount > 0) {
          row += emptyCount;
          emptyCount = 0;
        }
        row += pieceToFen[piece];
      } else {
        emptyCount++;
      }
    }
    
    if (emptyCount > 0) {
      row += emptyCount;
    }
    rows.push(row);
  }
  
  // Return FEN with default values for turn, castling, etc.
  // (we only care about piece positions for display)
  return rows.join('/') + ' w - - 0 1';
}

// Update coordinates display based on board orientation
function updateCoordinates() {
  const filesContainer = document.querySelector('.coordinates-files');
  const ranksContainer = document.querySelector('.coordinates-ranks');
  
  if (filesContainer) {
    const files = isBoardFlipped ? 'hgfedcba' : 'abcdefgh';
    filesContainer.innerHTML = files.split('').map(f => `<span>${f}</span>`).join('');
  }
  
  if (ranksContainer) {
    const ranks = isBoardFlipped ? '12345678' : '87654321';
    ranksContainer.innerHTML = ranks.split('').map(r => `<span>${r}</span>`).join('');
  }
}

// Create a square element
function createSquare(row, col, pieceCode) {
  const square = document.createElement('div');
  const squareId = 'abcdefgh'[col] + '87654321'[row];
  
  square.className = `square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
  square.dataset.square = squareId;
  square.textContent = pieceCode ? pieces[pieceCode] : '';
  if (pieceCode) square.dataset.piece = pieceCode;
  
  square.addEventListener('click', () => handleSquareClick(squareId, pieceCode));
  return square;
}

// Check if a piece belongs to the player
function isPlayerPiece(piece) {
  if (!piece) return false;
  if (playerColor === 'white') {
    return piece === piece.toUpperCase(); // White pieces are uppercase
  } else {
    return piece === piece.toLowerCase(); // Black pieces are lowercase
  }
}

// Handle square click
async function handleSquareClick(square, piece) {
  if (isAnimating) return;
  if (selectedSquare) {
    if (legalMoves.includes(square)) {
      await makeMove(selectedSquare, square);
    } else if (isPlayerPiece(piece)) {
      selectSquare(square);
    } else {
      deselectSquare();
    }
  } else if (isPlayerPiece(piece)) {
    selectSquare(square);
  }
}

// Select a square and show legal moves
async function selectSquare(square) {
  deselectSquare();
  selectedSquare = square;
  
  document.querySelector(`[data-square="${square}"]`)?.classList.add('selected');
  
  try {
    const response = await fetch(`/api/game/${gameId}/moves/${square}`);
    const data = await response.json();
    legalMoves = data.moves;
    
    legalMoves.forEach(move => {
      const el = document.querySelector(`[data-square="${move}"]`);
      if (el) {
        el.classList.add('legal-move');
        if (el.dataset.piece) el.classList.add('has-piece');
      }
    });
  } catch (error) {
    console.error('Error getting legal moves:', error);
  }
}

// Deselect square
function deselectSquare() {
  if (selectedSquare) {
    document.querySelector(`[data-square="${selectedSquare}"]`)?.classList.remove('selected');
  }
  document.querySelectorAll('.legal-move').forEach(el => el.classList.remove('legal-move', 'has-piece'));
  selectedSquare = null;
  legalMoves = [];
}

// Animate a piece moving from one square to another
function animateMove(from, to) {
  return new Promise(resolve => {
    const fromEl = document.querySelector(`[data-square="${from}"]`);
    const toEl = document.querySelector(`[data-square="${to}"]`);
    if (!fromEl || !toEl || !fromEl.textContent.trim()) return resolve();

    const boardRect = chessBoard.getBoundingClientRect();
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    // Account for board border (position: absolute starts inside the border)
    const boardStyle = getComputedStyle(chessBoard);
    const borderLeft = parseFloat(boardStyle.borderLeftWidth) || 0;
    const borderTop = parseFloat(boardStyle.borderTopWidth) || 0;

    // Store the piece symbol before clearing
    const pieceSymbol = fromEl.textContent;
    const pieceCode = fromEl.dataset.piece;

    // Calculate positions relative to the board's content area (inside border)
    const fromX = fromRect.left - boardRect.left - borderLeft;
    const fromY = fromRect.top - boardRect.top - borderTop;
    const toX = toRect.left - boardRect.left - borderLeft;
    const toY = toRect.top - boardRect.top - borderTop;

    // Create ghost piece for animation
    const ghost = document.createElement('div');
    ghost.className = 'piece-ghost';
    ghost.textContent = pieceSymbol;
    if (pieceCode) ghost.dataset.piece = pieceCode;
    ghost.style.width = `${fromRect.width}px`;
    ghost.style.height = `${fromRect.height}px`;
    ghost.style.left = '0';
    ghost.style.top = '0';
    ghost.style.transform = `translate(${fromX}px, ${fromY}px)`;
    ghost.style.transition = 'none';
    chessBoard.appendChild(ghost);

    // Hide original piece during animation
    fromEl.textContent = '';
    delete fromEl.dataset.piece;
    
    // Also hide the piece on the target square if capturing
    if (toEl.textContent.trim()) {
      toEl.textContent = '';
      delete toEl.dataset.piece;
    }

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      ghost.remove();
      // Place the piece on the destination square after animation
      toEl.textContent = pieceSymbol;
      if (pieceCode) toEl.dataset.piece = pieceCode;
      resolve();
    };

    // Force reflow to ensure initial transform is applied before enabling transition
    ghost.offsetHeight;
    
    // Enable transition and move to destination
    ghost.style.transition = 'transform 0.25s ease-in-out';
    ghost.style.transform = `translate(${toX}px, ${toY}px)`;

    ghost.addEventListener('transitionend', cleanup, { once: true });
    setTimeout(cleanup, 350); // fallback
  });
}

// Make a move
async function makeMove(from, to) {
  isAnimating = true;
  deselectSquare();

  // Capture player time BEFORE animation and server call
  const playerTime = turnStartTime ? formatMoveTime(Date.now() - turnStartTime) : '';

  // 1. Animate player move first
  await animateMove(from, to);

  // 2. IMMÉDIATEMENT après l'animation: allumer les cases du joueur
  lastMove = { from: from, to: to };
  highlightLastMove();

  // 3. Then call the server (Copilot SDK)
  turnIndicator.textContent = '🤔 Copilot is thinking...';
  
  try {
    const response = await fetch(`/api/game/${gameId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ move: from + to })
    });

    const data = await response.json();
    
    if (data.error) {
      alert(data.error);
      renderBoard(data.fen || await getCurrentFen());
      const colorName = playerColor === 'white' ? 'White' : 'Black';
      turnIndicator.textContent = `Your turn (${colorName})`;
      isAnimating = false;
      return;
    }

    // 4. Animate AI move if present
    if (data.aiMove?.from && data.aiMove?.to) {
      await animateMove(data.aiMove.from, data.aiMove.to);
      // Update to AI's move and re-render with new highlights
      lastMove = { from: data.aiMove.from, to: data.aiMove.to };
    }

    // 5. Render final board state with correct highlights
    renderBoard(data.fen);

    // Save position to history after player move
    positionHistory.push({ fen: data.fenAfterPlayer || data.fen, lastMove: { from, to } });
    
    // Save position to history after AI move
    if (data.aiMove?.from && data.aiMove?.to) {
      positionHistory.push({ fen: data.fen, lastMove: { from: data.aiMove.from, to: data.aiMove.to } });
    }
    
    // Reset history navigation
    historyIndex = -1;
    isViewingHistory = false;

    // Update move history with timing
    moveCount++;
    const aiTime = data.aiThinkTime ? formatMoveTime(data.aiThinkTime) : '';
    const moveEntry = document.createElement('div');
    const playerTimeStr = playerTime ? ` (${playerTime})` : '';
    const aiTimeStr = aiTime ? ` (${aiTime})` : '';
    moveEntry.innerHTML = `${moveCount}. ${data.playerMove?.san || '...'}${playerTimeStr} - ${data.aiMove?.san || 'N/A'}${aiTimeStr}`;
    moveHistory.appendChild(moveEntry);
    moveHistory.scrollTop = moveHistory.scrollHeight;
    
    // Reset timer for next turn
    turnStartTime = Date.now();

    updateStatus(data);
  } catch (error) {
    console.error('Error making move:', error);
    alert('Failed to make move. Please try again.');
    const colorName = playerColor === 'white' ? 'White' : 'Black';
    turnIndicator.textContent = `Your turn (${colorName})`;
  }
  
  isAnimating = false;
}

async function getCurrentFen() {
  const response = await fetch(`/api/game/${gameId}`);
  const data = await response.json();
  return data.fen;
}

// Update game status
function updateStatus(data) {
  const colorName = playerColor === 'white' ? 'White' : 'Black';
  // Player wins if it's the opponent's turn and checkmate (opponent can't move)
  const playerWins = (playerColor === 'white' && data.turn === 'black') || 
                     (playerColor === 'black' && data.turn === 'white');
  
  if (data.isCheckmate) {
    gameStatus.innerHTML = playerWins ? '🎉 Checkmate! You win! 🎉' : '😢 Checkmate! AI wins! 😢';
    turnIndicator.textContent = 'Game Over';
    disableBoard();
  } else if (data.isDraw) {
    gameStatus.innerHTML = '🤝 Draw! Well played!';
    turnIndicator.textContent = 'Game Over';
    disableBoard();
  } else if (data.isCheck) {
    gameStatus.innerHTML = '⚠️ Check! ⚠️';
    turnIndicator.textContent = `Your turn (${colorName})`;
  } else {
    gameStatus.innerHTML = '🎮 Game in progress';
    turnIndicator.textContent = `Your turn (${colorName})`;
  }
}

// Disable board interaction
function disableBoard() {
  chessBoard.style.pointerEvents = 'none';
  chessBoard.style.opacity = '0.6';
}

// Navigate through move history
function navigateHistory(direction) {
  if (positionHistory.length <= 1) return;
  if (isAnimating) return;
  
  const currentIndex = isViewingHistory ? historyIndex : positionHistory.length - 1;
  let newIndex;
  
  if (direction === 'back') {
    newIndex = Math.max(0, currentIndex - 1);
  } else {
    newIndex = Math.min(positionHistory.length - 1, currentIndex + 1);
  }
  
  if (newIndex === currentIndex) return;
  
  historyIndex = newIndex;
  isViewingHistory = newIndex < positionHistory.length - 1;
  
  // Get the position at this index
  const position = positionHistory[historyIndex];
  lastMove = position.lastMove;
  
  // Render the board at this position
  renderBoard(position.fen);
  
  // Update UI to show we're viewing history
  if (isViewingHistory) {
    turnIndicator.textContent = `📜 Viewing move ${historyIndex}/${positionHistory.length - 1} (← →)`;
    chessBoard.style.pointerEvents = 'none';
  } else {
    turnIndicator.textContent = 'Your turn (White)';
    chessBoard.style.pointerEvents = 'auto';
  }
}

// Format move time in a human-readable way
function formatMoveTime(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    const seconds = (ms / 1000).toFixed(1);
    return `${seconds}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m${seconds}s`;
  }
}

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (gameContainer.style.display === 'none') return;
  
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    navigateHistory('back');
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    navigateHistory('forward');
  }
});
