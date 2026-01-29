/**
 * Chessboard JavaScript
 * 
 * Basic chessboard rendering and interaction logic
 * The visual styling of the board remains standard as per requirements
 */

(function() {
    'use strict';

    // Chess piece Unicode characters
    const PIECES = {
        'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',  // White
        'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'   // Black
    };

    // Standard starting position (FEN notation simplified)
    const INITIAL_POSITION = [
        ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
        ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
        ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
    ];

    const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

    let selectedSquare = null;
    let boardState = JSON.parse(JSON.stringify(INITIAL_POSITION));

    /**
     * Initialize the chessboard
     */
    function initBoard() {
        const board = document.getElementById('chessboard');
        if (!board) return;

        board.innerHTML = '';

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = createSquare(row, col);
                board.appendChild(square);
            }
        }
    }

    /**
     * Create a single square element
     */
    function createSquare(row, col) {
        const square = document.createElement('div');
        const isLight = (row + col) % 2 === 0;
        
        square.className = `square ${isLight ? 'light' : 'dark'}`;
        square.dataset.row = row;
        square.dataset.col = col;
        square.dataset.square = FILES[col] + RANKS[row];

        // Add piece if present
        const piece = boardState[row][col];
        if (piece) {
            const pieceEl = createPiece(piece);
            square.appendChild(pieceEl);
        }

        // Add coordinates on edge squares
        if (col === 0) {
            const rank = document.createElement('span');
            rank.className = 'coordinate rank';
            rank.textContent = RANKS[row];
            square.appendChild(rank);
        }
        if (row === 7) {
            const file = document.createElement('span');
            file.className = 'coordinate file';
            file.textContent = FILES[col];
            square.appendChild(file);
        }

        // Click handler
        square.addEventListener('click', handleSquareClick);

        return square;
    }

    /**
     * Create a piece element
     */
    function createPiece(piece) {
        const el = document.createElement('span');
        const isWhite = piece === piece.toUpperCase();
        
        el.className = `piece ${isWhite ? 'white' : 'black'}`;
        el.textContent = PIECES[piece];
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', getPieceName(piece));

        return el;
    }

    /**
     * Get piece name for accessibility
     */
    function getPieceName(piece) {
        const color = piece === piece.toUpperCase() ? 'White' : 'Black';
        const names = {
            'k': 'King', 'q': 'Queen', 'r': 'Rook',
            'b': 'Bishop', 'n': 'Knight', 'p': 'Pawn'
        };
        return `${color} ${names[piece.toLowerCase()]}`;
    }

    /**
     * Handle square click
     */
    function handleSquareClick(e) {
        const square = e.currentTarget;
        const row = parseInt(square.dataset.row);
        const col = parseInt(square.dataset.col);
        const piece = boardState[row][col];

        // Clear previous selection
        document.querySelectorAll('.square.selected').forEach(sq => {
            sq.classList.remove('selected');
        });
        document.querySelectorAll('.square.possible-move').forEach(sq => {
            sq.classList.remove('possible-move');
        });

        if (selectedSquare) {
            // Try to move
            const fromRow = selectedSquare.row;
            const fromCol = selectedSquare.col;
            
            if (row !== fromRow || col !== fromCol) {
                // Simple move (no validation for demo)
                if (boardState[fromRow][fromCol]) {
                    movePiece(fromRow, fromCol, row, col);
                }
            }
            selectedSquare = null;
        } else if (piece) {
            // Select piece
            selectedSquare = { row, col };
            square.classList.add('selected');
            showPossibleMoves(row, col, piece);
        }
    }

    /**
     * Move a piece (basic, no validation)
     */
    function movePiece(fromRow, fromCol, toRow, toCol) {
        const piece = boardState[fromRow][fromCol];
        const captured = boardState[toRow][toCol];
        
        // Update board state
        boardState[toRow][toCol] = piece;
        boardState[fromRow][fromCol] = null;

        // Update display
        initBoard();

        // Highlight last move
        const fromSquare = document.querySelector(`[data-row="${fromRow}"][data-col="${fromCol}"]`);
        const toSquare = document.querySelector(`[data-row="${toRow}"][data-col="${toCol}"]`);
        if (fromSquare) fromSquare.classList.add('last-move');
        if (toSquare) toSquare.classList.add('last-move');

        // Add to move history (visual only)
        addMoveToHistory(piece, FILES[fromCol] + RANKS[fromRow], FILES[toCol] + RANKS[toRow], captured);
    }

    /**
     * Show possible moves (simplified - shows all squares for demo)
     */
    function showPossibleMoves(row, col, piece) {
        // This is a simplified version - in a real app, 
        // you'd calculate legal moves based on piece type
        const pieceType = piece.toLowerCase();
        
        // For demo purposes, highlight some squares based on piece type
        // Real implementation would validate actual legal moves
    }

    /**
     * Add move to history display
     */
    function addMoveToHistory(piece, from, to, captured) {
        const history = document.getElementById('move-history');
        if (!history) return;

        const notation = captured ? 
            `${from.charAt(0)}x${to}` : 
            to;

        // Simple notation for demo
        updateStatusMessage(`Move: ${from} → ${to}`);
    }

    /**
     * Update status message
     */
    function updateStatusMessage(text) {
        const statusEl = document.querySelector('.status-text');
        if (statusEl) {
            statusEl.textContent = text;
        }
    }

    /**
     * Reset board to starting position
     */
    function resetBoard() {
        boardState = JSON.parse(JSON.stringify(INITIAL_POSITION));
        selectedSquare = null;
        initBoard();
        updateStatusMessage('WHITE TO MOVE');
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBoard);
    } else {
        initBoard();
    }

    // Expose functions for buttons
    window.chessGame = {
        reset: resetBoard,
        getBoard: () => boardState
    };
})();
