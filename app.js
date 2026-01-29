/**
 * Copilot Chess - Game Logic
 * A playful chess game against AI
 */

// ==========================================================================
// Game State
// ==========================================================================

let game = null;
let board = null;
let moveCount = 0;
let gameOver = false;

// ==========================================================================
// DOM Elements
// ==========================================================================

const elements = {
    turnBadge: document.getElementById('turn-badge'),
    turnText: document.getElementById('turn-text'),
    moveCount: document.getElementById('move-count'),
    moveHistory: document.getElementById('move-history'),
    aiThinking: document.getElementById('ai-thinking'),
    gameStatus: document.getElementById('game-status'),
    statusEmoji: document.getElementById('status-emoji'),
    statusText: document.getElementById('status-text'),
    newGameBtn: document.getElementById('new-game-btn'),
    undoBtn: document.getElementById('undo-btn'),
    confettiCanvas: document.getElementById('confetti-canvas')
};

// ==========================================================================
// Initialize Game
// ==========================================================================

function initGame() {
    game = new Chess();
    
    const config = {
        draggable: true,
        position: 'start',
        onDragStart: onDragStart,
        onDrop: onDrop,
        onSnapEnd: onSnapEnd,
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
    };
    
    board = Chessboard('chessboard', config);
    
    // Make board responsive
    $(window).resize(function() {
        board.resize();
    });
    
    // Reset state
    moveCount = 0;
    gameOver = false;
    updateMoveCount();
    updateTurnIndicator();
    clearMoveHistory();
    hideGameStatus();
    
    // Bind event listeners
    elements.newGameBtn.addEventListener('click', newGame);
    elements.undoBtn.addEventListener('click', undoMove);
}

// ==========================================================================
// Chess Logic
// ==========================================================================

function onDragStart(source, piece, position, orientation) {
    // Don't allow moves if game is over
    if (game.game_over() || gameOver) return false;
    
    // Only allow white pieces to be moved (player is white)
    if (piece.search(/^b/) !== -1) return false;
    
    // Only allow moves when it's white's turn
    if (game.turn() !== 'w') return false;
    
    return true;
}

function onDrop(source, target) {
    // Try to make the move
    const move = game.move({
        from: source,
        to: target,
        promotion: 'q' // Always promote to queen for simplicity
    });
    
    // Invalid move
    if (move === null) return 'snapback';
    
    // Valid move - update UI
    moveCount++;
    updateMoveCount();
    addMoveToHistory(move, 'player');
    updateTurnIndicator();
    
    // Check game state
    if (checkGameState()) return;
    
    // AI's turn
    setTimeout(makeAIMove, 500);
}

function onSnapEnd() {
    board.position(game.fen());
}

// ==========================================================================
// AI Logic
// ==========================================================================

function makeAIMove() {
    if (game.game_over() || gameOver) return;
    
    showAIThinking();
    
    // Simulate thinking time for better UX
    const thinkingTime = 800 + Math.random() * 700;
    
    setTimeout(() => {
        const move = getBestMove();
        
        if (move) {
            game.move(move);
            board.position(game.fen());
            
            moveCount++;
            updateMoveCount();
            addMoveToHistory(move, 'ai');
            updateTurnIndicator();
            
            checkGameState();
        }
        
        hideAIThinking();
    }, thinkingTime);
}

function getBestMove() {
    const moves = game.moves({ verbose: true });
    if (moves.length === 0) return null;
    
    // Simple AI: Prioritize captures and checks, otherwise random
    let bestMoves = [];
    
    // Check for checkmate moves first
    for (const move of moves) {
        game.move(move);
        if (game.in_checkmate()) {
            game.undo();
            return move;
        }
        game.undo();
    }
    
    // Prioritize captures
    const captures = moves.filter(m => m.captured);
    if (captures.length > 0) {
        // Prioritize high-value captures
        const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9 };
        captures.sort((a, b) => (pieceValues[b.captured] || 0) - (pieceValues[a.captured] || 0));
        bestMoves = captures.slice(0, 3);
    }
    
    // Check for checks
    const checks = moves.filter(m => {
        game.move(m);
        const isCheck = game.in_check();
        game.undo();
        return isCheck;
    });
    
    if (checks.length > 0) {
        bestMoves = [...bestMoves, ...checks];
    }
    
    // If no good moves, pick random
    if (bestMoves.length === 0) {
        bestMoves = moves;
    }
    
    // Random selection from best moves
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

// ==========================================================================
// Game State Checks
// ==========================================================================

function checkGameState() {
    if (game.in_checkmate()) {
        const winner = game.turn() === 'w' ? 'ai' : 'player';
        showGameOver(winner === 'player' ? 'victory' : 'defeat');
        return true;
    }
    
    if (game.in_stalemate()) {
        showGameOver('stalemate');
        return true;
    }
    
    if (game.in_draw()) {
        showGameOver('draw');
        return true;
    }
    
    if (game.in_threefold_repetition()) {
        showGameOver('repetition');
        return true;
    }
    
    return false;
}

// ==========================================================================
// UI Updates
// ==========================================================================

function updateMoveCount() {
    elements.moveCount.textContent = moveCount;
    
    // Add a little bounce animation
    elements.moveCount.style.transform = 'scale(1.2)';
    setTimeout(() => {
        elements.moveCount.style.transform = 'scale(1)';
    }, 150);
}

function updateTurnIndicator() {
    const isWhiteTurn = game.turn() === 'w';
    const isCheck = game.in_check();
    
    if (isWhiteTurn) {
        elements.turnBadge.className = 'badge badge-sun';
        if (isCheck) {
            elements.turnText.textContent = '⚠️ Échec! À vous!';
        } else {
            elements.turnText.textContent = '🎯 Votre tour!';
        }
    } else {
        elements.turnBadge.className = 'badge badge-grape';
        if (isCheck) {
            elements.turnText.textContent = '⚠️ Échec! Tour IA';
        } else {
            elements.turnText.textContent = '🤖 Tour de l\'IA';
        }
    }
}

function clearMoveHistory() {
    elements.moveHistory.innerHTML = `
        <div class="empty-history">
            <span class="empty-emoji">🎬</span>
            <span>Faites le premier coup!</span>
        </div>
    `;
}

function addMoveToHistory(move, player) {
    // Remove empty state if present
    const emptyState = elements.moveHistory.querySelector('.empty-history');
    if (emptyState) {
        emptyState.remove();
    }
    
    const moveNum = Math.ceil(moveCount / 2);
    const playerEmoji = player === 'player' ? '👤' : '🤖';
    const moveText = formatMove(move);
    
    const card = document.createElement('div');
    card.className = 'move-card';
    card.innerHTML = `
        <span class="move-number">${moveCount}</span>
        <span class="move-text">${moveText}</span>
        <span class="move-player">${playerEmoji}</span>
    `;
    
    elements.moveHistory.appendChild(card);
    
    // Scroll to bottom
    elements.moveHistory.scrollTop = elements.moveHistory.scrollHeight;
}

function formatMove(move) {
    const pieceNames = {
        'p': '♟', 'n': '♞', 'b': '♝', 'r': '♜', 'q': '♛', 'k': '♚',
        'P': '♙', 'N': '♘', 'B': '♗', 'R': '♖', 'Q': '♕', 'K': '♔'
    };
    
    let text = move.san;
    
    // Add some context
    if (move.captured) {
        text += ' ✖️';
    }
    if (move.san.includes('+')) {
        text = text.replace('+', ' ⚡');
    }
    if (move.san.includes('#')) {
        text = text.replace('#', ' 💥');
    }
    
    return text;
}

function showAIThinking() {
    elements.aiThinking.classList.remove('hidden');
}

function hideAIThinking() {
    elements.aiThinking.classList.add('hidden');
}

function showGameOver(result) {
    gameOver = true;
    
    const messages = {
        victory: { emoji: '🎉', text: 'Victoire! Bravo!' },
        defeat: { emoji: '😢', text: 'Défaite... Réessayez!' },
        stalemate: { emoji: '🤝', text: 'Pat! Match nul' },
        draw: { emoji: '🤝', text: 'Match nul!' },
        repetition: { emoji: '🔄', text: 'Répétition - Nul!' }
    };
    
    const msg = messages[result] || messages.draw;
    
    elements.statusEmoji.textContent = msg.emoji;
    elements.statusText.textContent = msg.text;
    elements.gameStatus.classList.remove('hidden');
    
    // Trigger confetti for victory
    if (result === 'victory') {
        triggerConfetti();
    } else if (result === 'defeat') {
        elements.statusEmoji.style.animation = 'sad-wobble 0.5s ease-in-out infinite';
    }
    
    // Auto-hide after delay
    setTimeout(() => {
        hideGameStatus();
    }, 3000);
}

function hideGameStatus() {
    elements.gameStatus.classList.add('hidden');
    elements.statusEmoji.style.animation = 'wiggle 0.5s ease-in-out infinite';
}

// ==========================================================================
// Game Controls
// ==========================================================================

function newGame() {
    // Add button press feedback
    elements.newGameBtn.style.transform = 'scale(0.95)';
    setTimeout(() => {
        elements.newGameBtn.style.transform = 'scale(1)';
    }, 100);
    
    game.reset();
    board.start();
    moveCount = 0;
    gameOver = false;
    updateMoveCount();
    updateTurnIndicator();
    clearMoveHistory();
    hideGameStatus();
    hideAIThinking();
}

function undoMove() {
    if (moveCount < 2) return;
    
    // Undo both AI and player move
    game.undo();
    game.undo();
    board.position(game.fen());
    
    moveCount -= 2;
    updateMoveCount();
    updateTurnIndicator();
    
    // Remove last two moves from history
    const cards = elements.moveHistory.querySelectorAll('.move-card');
    if (cards.length >= 2) {
        cards[cards.length - 1].remove();
        cards[cards.length - 2].remove();
    }
    
    // Show empty state if no moves left
    if (moveCount === 0) {
        clearMoveHistory();
    }
    
    gameOver = false;
    hideGameStatus();
}

// ==========================================================================
// Confetti Animation
// ==========================================================================

function triggerConfetti() {
    const canvas = elements.confettiCanvas;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const colors = ['#FFD93D', '#FF6B9D', '#6BCBFF', '#7DFFCD', '#C895FF'];
    const confetti = [];
    
    // Create confetti particles
    for (let i = 0; i < 150; i++) {
        confetti.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            r: Math.random() * 6 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            vx: Math.random() * 4 - 2,
            vy: Math.random() * 3 + 2,
            rotation: Math.random() * 360,
            rotationSpeed: Math.random() * 10 - 5
        });
    }
    
    let animationFrame;
    
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        let allDone = true;
        
        confetti.forEach(p => {
            if (p.y < canvas.height + 50) {
                allDone = false;
                
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation * Math.PI / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.5);
                ctx.restore();
                
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.1;
                p.rotation += p.rotationSpeed;
            }
        });
        
        if (!allDone) {
            animationFrame = requestAnimationFrame(animate);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
    
    animate();
    
    // Clear after 5 seconds
    setTimeout(() => {
        cancelAnimationFrame(animationFrame);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }, 5000);
}

// ==========================================================================
// Initialize on DOM Ready
// ==========================================================================

document.addEventListener('DOMContentLoaded', initGame);

// Handle window resize for confetti canvas
window.addEventListener('resize', () => {
    if (elements.confettiCanvas) {
        elements.confettiCanvas.width = window.innerWidth;
        elements.confettiCanvas.height = window.innerHeight;
    }
});
