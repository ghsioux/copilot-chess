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

// Captured pieces tracking
let capturedByPlayer = []; // Pieces captured by the player
let capturedByAI = []; // Pieces captured by the AI
const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const pieceOrder = ['q', 'r', 'b', 'n', 'p']; // Order for display

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

// Helper function to add a move to the history
// color: 'w' for white, 'b' for black
function addMoveToHistory(san, time, color) {
  const timeStr = time ? ` (${time})` : '';
  
  if (color === 'w') {
    // White move: create a new line
    moveCount++;
    const moveEntry = document.createElement('div');
    moveEntry.innerHTML = `${moveCount}. ${san}${timeStr} - ...`;
    moveHistory.appendChild(moveEntry);
  } else {
    // Black move: complete the existing line
    const existingEntry = moveHistory.querySelector('div:last-child');
    if (existingEntry && existingEntry.innerHTML.includes('- ...')) {
      existingEntry.innerHTML = existingEntry.innerHTML.replace('- ...', `- ${san}${timeStr}`);
    }
  }
  moveHistory.scrollTop = moveHistory.scrollHeight;
}

// DOM elements
const gameSetup = document.getElementById('gameSetup');
const gameContainer = document.getElementById('gameContainer');
const chessBoard = document.getElementById('chessBoard');
const startGameBtn = document.getElementById('startGameBtn');
const newGameBtn = document.getElementById('newGameBtn');
const flipBoardBtn = document.getElementById('flipBoardBtn');
const resignBtn = document.getElementById('resignBtn');
const saveGameBtn = document.getElementById('saveGameBtn');
const loadGameBtn = document.getElementById('loadGameBtn');
const loadGameBtnSetup = document.getElementById('loadGameBtnSetup');
const loadGameFileInput = document.getElementById('loadGameFileInput');
const gameStatus = document.getElementById('gameStatus');
const turnIndicator = document.getElementById('turnIndicator');
const currentDifficulty = document.getElementById('currentDifficulty');
const moveHistory = document.getElementById('moveHistory');
const modelSelect = document.getElementById('modelSelect');

// Custom dropdown elements
const modelDropdown = document.getElementById('modelDropdown');
const dropdownSelected = document.getElementById('dropdownSelected');
const dropdownOptions = document.getElementById('dropdownOptions');

// Custom dropdown functionality
function initCustomDropdown() {
  if (!dropdownSelected || !dropdownOptions || !modelDropdown) return;

  // Toggle dropdown on click
  dropdownSelected.addEventListener('click', (e) => {
    e.stopPropagation();
    modelDropdown.classList.toggle('open');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!modelDropdown.contains(e.target)) {
      modelDropdown.classList.remove('open');
    }
  });

  // Close on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      modelDropdown.classList.remove('open');
    }
  });
}

function populateDropdown(models) {
  if (!dropdownOptions) return;
  
  dropdownOptions.innerHTML = models.map((m, index) => 
    `<div class="dropdown-option${index === 0 ? ' selected' : ''}" data-value="${m.name}">${m.name}</div>`
  ).join('');

  // Add click handlers to options
  dropdownOptions.querySelectorAll('.dropdown-option').forEach(option => {
    option.addEventListener('click', (e) => {
      const value = option.dataset.value;
      selectDropdownOption(value);
      modelDropdown.classList.remove('open');
    });
  });
}

function selectDropdownOption(value) {
  selectedModel = value;
  if (modelSelect) modelSelect.value = value;
  
  // Update selected text
  const selectedTextEl = dropdownSelected.querySelector('.selected-text');
  if (selectedTextEl) selectedTextEl.textContent = value;
  
  // Update selected state in options
  dropdownOptions.querySelectorAll('.dropdown-option').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.value === value);
  });
}

function setDropdownText(text) {
  const selectedTextEl = dropdownSelected?.querySelector('.selected-text');
  if (selectedTextEl) selectedTextEl.textContent = text;
}

initCustomDropdown();

startGameBtn.disabled = true;
startGameBtn.addEventListener('click', startNewGame);
newGameBtn.addEventListener('click', () => {
  gameContainer.style.display = 'none';
  gameSetup.style.display = 'flex';
});
flipBoardBtn.addEventListener('click', flipBoard);
resignBtn.addEventListener('click', () => {
  if (confirm('Are you sure you want to resign? 🏳️')) {
    gameStatus.innerHTML = 'You resigned! 🏳️';
    disableBoard();
  }
});

saveGameBtn?.addEventListener('click', async () => {
  if (!gameId) {
    alert('No active game to save.');
    return;
  }
  try {
    const response = await fetch(`/api/game/${gameId}/export`);
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || 'Export failed');

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.download = `copilot-chess-save-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Save failed:', err);
    alert(`Save failed: ${err.message || err}`);
  }
});

loadGameBtn?.addEventListener('click', () => {
  loadGameFileInput?.click();
});

loadGameBtnSetup?.addEventListener('click', () => {
  loadGameFileInput?.click();
});

loadGameFileInput?.addEventListener('change', async () => {
  const file = loadGameFileInput.files?.[0];
  loadGameFileInput.value = '';
  if (!file) return;

  try {
    const text = await file.text();
    const snapshot = JSON.parse(text);

    const response = await fetch('/api/game/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot)
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || 'Import failed');

    await applyImportedGame(data);
  } catch (err) {
    console.error('Load failed:', err);
    alert(`Load failed: ${err.message || err}`);
  }
});

async function loadModels() {
  try {
    const response = await fetch('/api/models');
    const data = await response.json();
    const models = data.models || [];
    if (!models.length) throw new Error('No models');

    populateDropdown(models);
    selectedModel = models[0].name;
    selectDropdownOption(selectedModel);
    startGameBtn.disabled = false;
  } catch (error) {
    console.error('Error loading models:', error);
    setDropdownText('No models available');
    startGameBtn.disabled = true;
    alert('Unable to load models. Please try again later.');
  }
}

if (modelDropdown) {
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
    
    // Reset captured pieces
    capturedByPlayer = [];
    capturedByAI = [];
    updateCapturedPiecesDisplay();
    
    // Flip board if player is black (so their pieces are at bottom)
    isBoardFlipped = playerColor === 'black';
    
    positionHistory = [{ fen: data.fen, lastMove: null }];
    historyIndex = -1;
    isViewingHistory = false;

    gameSetup.style.display = 'none';
    gameContainer.style.display = 'flex';
    currentModelName = data.model || selectedModel || 'IA';
    currentDifficulty.textContent = currentModelName;
    
    const colorName = playerColor === 'white' ? 'White' : 'Black';
    gameStatus.textContent = '';
    moveHistory.innerHTML = '';

    // Render board immediately
    renderBoard(data.fen);
    
    // If AI moves first, request its move
    if (data.aiMovesFirst) {
      await requestAIMove();
    }
    
    turnIndicator.textContent = `Your turn (${colorName})`;
    turnStartTime = Date.now();
  } catch (error) {
    console.error('Error starting game:', error);
    alert('Failed to start game. Please try again.');
  }
}

async function applyImportedGame(data) {
  gameId = data.gameId;
  moveCount = 0;
  selectedSquare = null;
  legalMoves = [];
  lastMove = null;
  isAnimating = false;
  isViewingHistory = false;
  historyIndex = -1;

  playerColor = data.playerColor || 'white';
  isBoardFlipped = playerColor === 'black';

  // Reset UI state
  gameSetup.style.display = 'none';
  gameContainer.style.display = 'flex';
  chessBoard.style.pointerEvents = 'auto';
  chessBoard.style.opacity = '1';
  currentModelName = data.model || currentModelName || selectedModel || 'IA';
  currentDifficulty.textContent = currentModelName;
  gameStatus.textContent = '';
  moveHistory.innerHTML = '';

  // Rebuild move list display
  const moves = Array.isArray(data.moves) ? data.moves : [];
  rebuildMoveListFromSan(moves);

  // Use server-provided position history and captured pieces
  if (data.positionHistory && data.positionHistory.length > 0) {
    positionHistory = data.positionHistory;
    lastMove = positionHistory[positionHistory.length - 1]?.lastMove || null;
  } else {
    // Fallback to initial position only
    positionHistory = [{ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', lastMove: null }];
  }
  
  // Use server-provided captured pieces
  if (data.capturedByWhite && data.capturedByBlack) {
    if (playerColor === 'white') {
      capturedByPlayer = data.capturedByWhite;
      capturedByAI = data.capturedByBlack;
    } else {
      capturedByPlayer = data.capturedByBlack;
      capturedByAI = data.capturedByWhite;
    }
  } else {
    capturedByPlayer = [];
    capturedByAI = [];
  }
  updateCapturedPiecesDisplay();

  // Render final board position
  renderBoard(data.fen);

  // If game is already over, show status and stop
  if (data.isGameOver || data.isCheckmate || data.isDraw) {
    updateStatus(data);
    return;
  }

  // If it's AI's turn after loading, immediately request its move
  const aiColor = data.aiColor || (playerColor === 'white' ? 'black' : 'white');
  if (data.turn && data.turn === aiColor) {
    await requestAIMove();
    return;
  }

  updateStatus(data);

  // Start timing for player's next move
  turnStartTime = Date.now();
}

function rebuildMoveListFromSan(moves) {
  moveHistory.innerHTML = '';
  moveCount = 0;
  for (let i = 0; i < moves.length; i++) {
    const san = moves[i];
    const color = i % 2 === 0 ? 'w' : 'b';
    addMoveToHistory(san, '', color);
  }
}

function rebuildDerivedStateFromSanMoves(moves) {
  console.log('🔄 rebuildDerivedStateFromSanMoves called with moves:', moves);
  console.log('🔄 playerColor:', playerColor);
  console.log('🔄 window.Chess available:', !!window.Chess);
  console.log('🔄 typeof Chess:', typeof Chess);
  
  positionHistory = [];
  capturedByPlayer = [];
  capturedByAI = [];

  // Try both window.Chess and just Chess
  const ChessClass = window.Chess || (typeof Chess !== 'undefined' ? Chess : null);
  
  if (!ChessClass) {
    console.error('❌ Chess not available!');
    // Fallback: still allow playing, but arrow history/captures won't restore
    positionHistory = [{ fen: currentDisplayedFen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', lastMove: null }];
    updateCapturedPiecesDisplay();
    return;
  }

  console.log('✅ ChessClass found:', ChessClass);
  const chess = new ChessClass();
  console.log('✅ chess instance created, initial FEN:', chess.fen());
  positionHistory.push({ fen: chess.fen(), lastMove: null });

  const playerTurnChar = playerColor === 'white' ? 'w' : 'b';
  console.log('🔄 playerTurnChar:', playerTurnChar);

  for (const san of moves) {
    const result = chess.move(san);
    console.log('🔄 Move result for', san, ':', result);
    if (!result) {
      console.error('❌ Failed to apply move:', san);
      break;
    }

    const lm = { from: result.from, to: result.to };
    positionHistory.push({ fen: chess.fen(), lastMove: lm });

    if (result.captured) {
      // result.captured is always lowercase (piece type only: p, n, b, r, q, k)
      // The captured piece belongs to the OPPONENT of who made the move
      // If white (w) captured, the captured piece is black (lowercase)
      // If black (b) captured, the captured piece is white (UPPERCASE)
      const capturedPieceCode = result.color === 'w'
        ? result.captured.toLowerCase()   // Black piece captured (lowercase)
        : result.captured.toUpperCase();  // White piece captured (UPPERCASE)
      
      console.log('🔄 Capture: color=', result.color, 'captured=', result.captured, 'capturedPieceCode=', capturedPieceCode);
      
      // Track who captured what
      if (result.color === playerTurnChar) {
        capturedByPlayer.push(capturedPieceCode);
        console.log('🔄 Added to capturedByPlayer:', capturedPieceCode);
      } else {
        capturedByAI.push(capturedPieceCode);
        console.log('🔄 Added to capturedByAI:', capturedPieceCode);
      }
    }
  }

  console.log('🔄 Final positionHistory length:', positionHistory.length);
  console.log('🔄 Final capturedByPlayer:', capturedByPlayer);
  console.log('🔄 Final capturedByAI:', capturedByAI);
  
  // Set lastMove to the last played move for highlighting
  lastMove = positionHistory[positionHistory.length - 1]?.lastMove || null;
  updateCapturedPiecesDisplay();
}

async function requestAIMove() {
  if (!gameId) return;
  if (isAnimating) return;
  if (isViewingHistory) return;

  isAnimating = true;
  document.querySelector('.copilot-logo')?.classList.add('thinking');
  turnIndicator.innerHTML = '<svg class="copilot-icon" viewBox="0 0 512 416" xmlns="http://www.w3.org/2000/svg" fill="#ffffff"><path d="M181.33 266.143c0-11.497 9.32-20.818 20.818-20.818 11.498 0 20.819 9.321 20.819 20.818v38.373c0 11.497-9.321 20.818-20.819 20.818-11.497 0-20.818-9.32-20.818-20.818v-38.373zM308.807 245.325c-11.477 0-20.798 9.321-20.798 20.818v38.373c0 11.497 9.32 20.818 20.798 20.818 11.497 0 20.818-9.32 20.818-20.818v-38.373c0-11.497-9.32-20.818-20.818-20.818z"/><path d="M512.002 246.393v57.384c-.02 7.411-3.696 14.638-9.67 19.011C431.767 374.444 344.695 416 256 416c-98.138 0-196.379-56.542-246.33-93.21-5.975-4.374-9.65-11.6-9.671-19.012v-57.384a35.347 35.347 0 016.857-20.922l15.583-21.085c8.336-11.312 20.757-14.31 33.98-14.31 4.988-56.953 16.794-97.604 45.024-127.354C155.194 5.77 226.56 0 256 0c29.441 0 100.807 5.77 154.557 62.722 28.19 29.75 40.036 70.401 45.025 127.354 13.263 0 25.602 2.936 33.958 14.31l15.583 21.127c4.476 6.077 6.878 13.345 6.878 20.88zm-97.666-26.075c-.677-13.058-11.292-18.19-22.338-21.824-11.64 7.309-25.848 10.183-39.46 10.183-14.454 0-41.432-3.47-63.872-25.869-5.667-5.625-9.527-14.454-12.155-24.247a212.902 212.902 0 00-20.469-1.088c-6.098 0-13.099.349-20.551 1.088-2.628 9.793-6.509 18.622-12.155 24.247-22.4 22.4-49.418 25.87-63.872 25.87-13.612 0-27.86-2.855-39.501-10.184-11.005 3.613-21.558 8.828-22.277 21.824-1.17 24.555-1.272 49.11-1.375 73.645-.041 12.318-.082 24.658-.288 36.976.062 7.166 4.374 13.818 10.882 16.774 52.97 24.124 103.045 36.278 149.137 36.278 46.01 0 96.085-12.154 149.014-36.278 6.508-2.956 10.84-9.608 10.881-16.774.637-36.832.124-73.809-1.642-110.62h.041zM107.521 168.97c8.643 8.623 24.966 14.392 42.56 14.392 13.448 0 39.03-2.874 60.156-24.329 9.28-8.951 15.05-31.35 14.413-54.079-.657-18.231-5.769-33.28-13.448-39.665-8.315-7.371-27.203-10.574-48.33-8.644-22.399 2.238-41.267 9.588-50.875 19.833-20.798 22.728-16.323 80.317-4.476 92.492zm130.556-56.008c.637 3.51.965 7.35 1.273 11.517 0 2.875 0 5.77-.308 8.952 6.406-.636 11.847-.636 16.959-.636s10.553 0 16.959.636c-.329-3.182-.329-6.077-.329-8.952.329-4.167.657-8.007 1.294-11.517-6.735-.637-12.812-.965-17.924-.965s-11.21.328-17.924.965zm49.275-8.008c-.637 22.728 5.133 45.128 14.413 54.08 21.105 21.454 46.708 24.328 60.155 24.328 17.596 0 33.918-5.769 42.561-14.392 11.847-12.175 16.322-69.764-4.476-92.492-9.608-10.245-28.476-17.595-50.875-19.833-21.127-1.93-40.015 1.273-48.33 8.644-7.679 6.385-12.791 21.434-13.448 39.665z"/></svg><span class="thinking-text">is thinking...</span>';

  try {
    const response = await fetch(`/api/game/${gameId}/ai-move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || 'AI move failed');

    if (data.aiMove?.from && data.aiMove?.to) {
      const aiTargetSquare = document.querySelector(`[data-square="${data.aiMove.to}"]`);
      const aiCapturedPieceCode = aiTargetSquare?.dataset?.piece;
      if (aiCapturedPieceCode) addCapturedPiece(aiCapturedPieceCode, false);

      await animateMove(data.aiMove.from, data.aiMove.to);
      lastMove = { from: data.aiMove.from, to: data.aiMove.to };
    }

    renderBoard(data.fen);

    if (data.aiMove?.from && data.aiMove?.to) {
      positionHistory.push({ fen: data.fen, lastMove });
      const aiTime = data.aiThinkTime ? formatMoveTime(data.aiThinkTime) : '';
      addMoveToHistory(data.aiMove.san, aiTime, data.aiMove.color);
    }

    historyIndex = -1;
    isViewingHistory = false;
    updateStatus(data);
  } catch (err) {
    console.error('AI move failed:', err);
    gameStatus.textContent = '❌ AI failed to move';
  }

  document.querySelector('.copilot-logo')?.classList.remove('thinking');
  isAnimating = false;
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
  
  // Update flip button icon
  const flipBtn = document.getElementById('flipBoardBtn');
  if (flipBtn) {
    const label = 'Flip Board';
    flipBtn.setAttribute('data-tooltip', label);
    flipBtn.setAttribute('aria-label', label);
  }
}

// Read the current board state from DOM and convert to FEN (position part only)
function getBoardFenFromDOM() {
  const rows = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = '';
    let emptyCount = 0;
    
    for (const file of 'abcdefgh') {
      const square = document.querySelector(`[data-square="${file}${rank}"]`);
      // Use data-piece attribute instead of textContent to preserve piece color
      const pieceCode = square?.dataset?.piece;
      
      if (pieceCode) {
        if (emptyCount > 0) {
          row += emptyCount;
          emptyCount = 0;
        }
        row += pieceCode;
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

    // Highlight starting square immediately at the beginning of animation
    document.querySelectorAll('.last-move-from, .last-move-to').forEach(el => {
      el.classList.remove('last-move-from', 'last-move-to');
    });
    fromEl.classList.add('last-move-from');

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
      // Highlight destination square at end of animation
      toEl.classList.add('last-move-to');
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

  // 0. Check if player is capturing a piece BEFORE animation
  const targetSquare = document.querySelector(`[data-square="${to}"]`);
  const capturedPieceCode = targetSquare?.dataset?.piece;
  if (capturedPieceCode) {
    // Player captured a piece - update immediately!
    addCapturedPiece(capturedPieceCode, true);
  }

  // 1. Animate player move first
  await animateMove(from, to);

  // 2. IMMÉDIATEMENT après l'animation: allumer les cases du joueur
  lastMove = { from: from, to: to };
  highlightLastMove();
  
  // 2b. Afficher immédiatement le coup du joueur dans l'historique (notation temporaire)
  const playerMoveColor = playerColor === 'white' ? 'w' : 'b';
  // On utilise from-to comme placeholder, le SAN sera mis à jour après
  addMoveToHistory(`${from}-${to}`, playerTime, playerMoveColor);

  // 3. Then call the server (Copilot SDK)
  document.querySelector('.copilot-logo')?.classList.add('thinking');
  turnIndicator.innerHTML = '<svg class="copilot-icon" viewBox="0 0 512 416" xmlns="http://www.w3.org/2000/svg" fill="#ffffff"><path d="M181.33 266.143c0-11.497 9.32-20.818 20.818-20.818 11.498 0 20.819 9.321 20.819 20.818v38.373c0 11.497-9.321 20.818-20.819 20.818-11.497 0-20.818-9.32-20.818-20.818v-38.373zM308.807 245.325c-11.477 0-20.798 9.321-20.798 20.818v38.373c0 11.497 9.32 20.818 20.798 20.818 11.497 0 20.818-9.32 20.818-20.818v-38.373c0-11.497-9.32-20.818-20.818-20.818z"/><path d="M512.002 246.393v57.384c-.02 7.411-3.696 14.638-9.67 19.011C431.767 374.444 344.695 416 256 416c-98.138 0-196.379-56.542-246.33-93.21-5.975-4.374-9.65-11.6-9.671-19.012v-57.384a35.347 35.347 0 016.857-20.922l15.583-21.085c8.336-11.312 20.757-14.31 33.98-14.31 4.988-56.953 16.794-97.604 45.024-127.354C155.194 5.77 226.56 0 256 0c29.441 0 100.807 5.77 154.557 62.722 28.19 29.75 40.036 70.401 45.025 127.354 13.263 0 25.602 2.936 33.958 14.31l15.583 21.127c4.476 6.077 6.878 13.345 6.878 20.88zm-97.666-26.075c-.677-13.058-11.292-18.19-22.338-21.824-11.64 7.309-25.848 10.183-39.46 10.183-14.454 0-41.432-3.47-63.872-25.869-5.667-5.625-9.527-14.454-12.155-24.247a212.902 212.902 0 00-20.469-1.088c-6.098 0-13.099.349-20.551 1.088-2.628 9.793-6.509 18.622-12.155 24.247-22.4 22.4-49.418 25.87-63.872 25.87-13.612 0-27.86-2.855-39.501-10.184-11.005 3.613-21.558 8.828-22.277 21.824-1.17 24.555-1.272 49.11-1.375 73.645-.041 12.318-.082 24.658-.288 36.976.062 7.166 4.374 13.818 10.882 16.774 52.97 24.124 103.045 36.278 149.137 36.278 46.01 0 96.085-12.154 149.014-36.278 6.508-2.956 10.84-9.608 10.881-16.774.637-36.832.124-73.809-1.642-110.62h.041zM107.521 168.97c8.643 8.623 24.966 14.392 42.56 14.392 13.448 0 39.03-2.874 60.156-24.329 9.28-8.951 15.05-31.35 14.413-54.079-.657-18.231-5.769-33.28-13.448-39.665-8.315-7.371-27.203-10.574-48.33-8.644-22.399 2.238-41.267 9.588-50.875 19.833-20.798 22.728-16.323 80.317-4.476 92.492zm130.556-56.008c.637 3.51.965 7.35 1.273 11.517 0 2.875 0 5.77-.308 8.952 6.406-.636 11.847-.636 16.959-.636s10.553 0 16.959.636c-.329-3.182-.329-6.077-.329-8.952.329-4.167.657-8.007 1.294-11.517-6.735-.637-12.812-.965-17.924-.965s-11.21.328-17.924.965zm49.275-8.008c-.637 22.728 5.133 45.128 14.413 54.08 21.105 21.454 46.708 24.328 60.155 24.328 17.596 0 33.918-5.769 42.561-14.392 11.847-12.175 16.322-69.764-4.476-92.492-9.608-10.245-28.476-17.595-50.875-19.833-21.127-1.93-40.015 1.273-48.33 8.644-7.679 6.385-12.791 21.434-13.448 39.665z"/></svg><span class="thinking-text">is thinking...</span>';
  
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
      document.querySelector('.copilot-logo')?.classList.remove('thinking');
      turnIndicator.textContent = `Your turn (${colorName})`;
      isAnimating = false;
      return;
    }

    // 4. Animate AI move if present
    if (data.aiMove?.from && data.aiMove?.to) {
      // Check if AI is capturing before animation
      const aiTargetSquare = document.querySelector(`[data-square="${data.aiMove.to}"]`);
      const aiCapturedPieceCode = aiTargetSquare?.dataset?.piece;
      if (aiCapturedPieceCode) {
        // AI captured a piece - update immediately!
        addCapturedPiece(aiCapturedPieceCode, false);
      }
      
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

    // Update move history: replace the temporary player move with the real SAN
    const lastEntry = moveHistory.querySelector('div:last-child');
    if (lastEntry && data.playerMove?.san) {
      // Replace the temporary "from-to" with the real SAN
      const playerMoveColor = playerColor === 'white' ? 'w' : 'b';
      if (playerMoveColor === 'w') {
        // Player is white: update "N. from-to (time) - ..." to "N. SAN (time) - ..."
        lastEntry.innerHTML = lastEntry.innerHTML.replace(`${from}-${to}`, data.playerMove.san);
      } else {
        // Player is black: update "- from-to (time)" to "- SAN (time)"
        lastEntry.innerHTML = lastEntry.innerHTML.replace(`${from}-${to}`, data.playerMove.san);
      }
    }
    
    // Add AI move if present
    if (data.aiMove?.san) {
      const aiTime = data.aiThinkTime ? formatMoveTime(data.aiThinkTime) : '';
      const aiMoveColor = playerColor === 'white' ? 'b' : 'w';
      addMoveToHistory(data.aiMove.san, aiTime, aiMoveColor);
    }
    
    // Reset timer for next turn
    turnStartTime = Date.now();

    updateStatus(data);
  } catch (error) {
    console.error('Error making move:', error);
    alert('Failed to make move. Please try again.');
    const colorName = playerColor === 'white' ? 'White' : 'Black';
    document.querySelector('.copilot-logo')?.classList.remove('thinking');
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
  document.querySelector('.copilot-logo')?.classList.remove('thinking');
  const colorName = playerColor === 'white' ? 'White' : 'Black';
  const playerTurnName = playerColor;
  const sideToMove = data.turn; // 'white' | 'black' (when provided)
  const playerIsCheckmated = sideToMove ? sideToMove === playerTurnName : false;
  
  if (data.isCheckmate) {
    gameStatus.innerHTML = playerIsCheckmated ? '😢 Checkmate! AI wins! 😢' : '🎉 Checkmate! You win! 🎉';
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
    gameStatus.innerHTML = '';
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
    const colorName = playerColor === 'white' ? 'White' : 'Black';
    turnIndicator.textContent = `Your turn (${colorName})`;
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

// Captured pieces functions
function calculateMaterialScore(capturedPieces) {
  return capturedPieces.reduce((sum, piece) => sum + (pieceValues[piece.toLowerCase()] || 0), 0);
}

function sortCapturedPieces(pieces) {
  return [...pieces].sort((a, b) => {
    const indexA = pieceOrder.indexOf(a.toLowerCase());
    const indexB = pieceOrder.indexOf(b.toLowerCase());
    return indexA - indexB;
  });
}

function updateCapturedPiecesDisplay() {
  const playerCapturedEl = document.getElementById('playerCaptured');
  const aiCapturedEl = document.getElementById('aiCaptured');
  const playerScoreEl = document.getElementById('playerMaterialScore');
  const aiScoreEl = document.getElementById('aiMaterialScore');
  
  if (!playerCapturedEl || !aiCapturedEl) return;
  
  const playerScore = calculateMaterialScore(capturedByPlayer);
  const aiScore = calculateMaterialScore(capturedByAI);
  const scoreDiff = playerScore - aiScore;
  
  // Sort and display captured pieces
  const sortedPlayerCaptures = sortCapturedPieces(capturedByPlayer);
  const sortedAICaptures = sortCapturedPieces(capturedByAI);
  
  // Player captured pieces (these are opponent's pieces, so show them as black if player is white)
  playerCapturedEl.innerHTML = sortedPlayerCaptures.map(p => {
    const isWhitePiece = p === p.toUpperCase();
    const pieceClass = isWhitePiece ? 'captured-white' : 'captured-black';
    return `<span class="captured-piece ${pieceClass}">${pieces[p]}</span>`;
  }).join('');
  
  // AI captured pieces
  aiCapturedEl.innerHTML = sortedAICaptures.map(p => {
    const isWhitePiece = p === p.toUpperCase();
    const pieceClass = isWhitePiece ? 'captured-white' : 'captured-black';
    return `<span class="captured-piece ${pieceClass}">${pieces[p]}</span>`;
  }).join('');
  
  // Update scores with advantage indicator
  if (scoreDiff > 0) {
    playerScoreEl.textContent = `+${scoreDiff}`;
    playerScoreEl.className = 'material-score advantage';
    aiScoreEl.textContent = '';
    aiScoreEl.className = 'material-score';
  } else if (scoreDiff < 0) {
    aiScoreEl.textContent = `+${Math.abs(scoreDiff)}`;
    aiScoreEl.className = 'material-score advantage';
    playerScoreEl.textContent = '';
    playerScoreEl.className = 'material-score';
  } else {
    playerScoreEl.textContent = '';
    playerScoreEl.className = 'material-score';
    aiScoreEl.textContent = '';
    aiScoreEl.className = 'material-score';
  }
}

function addCapturedPiece(piece, capturedByPlayerSide) {
  if (capturedByPlayerSide) {
    capturedByPlayer.push(piece);
  } else {
    capturedByAI.push(piece);
  }
  updateCapturedPiecesDisplay();
}
