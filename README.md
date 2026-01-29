# ♟️ Copilot Chess 🤖

A fun and nerdy chess game where you battle against an AI powered by chess algorithms! Play against three difficulty levels and test your skills.

## 🎮 Features

- **Three Difficulty Levels**:
  - 🟢 **Easy**: Copilot is having a coffee break (mostly random moves)
  - 🟡 **Intermediate**: Copilot is warming up (balanced strategy)
  - 🔴 **Difficult**: Copilot means business (advanced minimax algorithm)

- **Fun & Nerdy UI**: Terminal-inspired design with emoji indicators and playful messages
- **Full Chess Rules**: Complete chess game implementation using chess.js
- **Move History**: Track all moves made during the game
- **Visual Feedback**: Highlighted legal moves and selected pieces

## 🚀 Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm

### Installation

1. Clone the repository:
```bash
git clone https://github.com/ghsioux/copilot-chess.git
cd copilot-chess
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

## 🎯 How to Play

1. Select your preferred difficulty level (Easy, Intermediate, or Difficult)
2. Click "START BATTLE" to begin the game
3. Click on a piece to see its legal moves (highlighted in green)
4. Click on a highlighted square to make your move
5. The AI will automatically respond with its move
6. Continue playing until checkmate or draw!

## 🛠️ Technology Stack

- **Backend**: Node.js with Express
- **Chess Engine**: chess.js
- **AI**: Custom minimax algorithm with alpha-beta pruning
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Design**: Retro terminal aesthetic with gradient backgrounds

## 📁 Project Structure

```
copilot-chess/
├── server.js           # Express server and game logic
├── public/
│   ├── index.html     # Main HTML page
│   ├── style.css      # Styling
│   └── game.js        # Frontend game logic
├── package.json       # Dependencies
└── README.md          # Documentation
```

## 🎨 Game Features

- **Visual Board**: 8x8 chess board with alternating light/dark squares
- **Unicode Pieces**: Beautiful chess piece symbols (♔♕♖♗♘♙)
- **Move Validation**: Only legal moves are allowed
- **Check Detection**: Visual indicators for check situations
- **Game Status**: Real-time updates on game state
- **Responsive Design**: Works on desktop and mobile devices

## 🤖 AI Implementation

The AI uses different strategies based on difficulty:

- **Easy**: 70% random moves, 30% calculated best moves
- **Intermediate**: 30% random moves, 70% calculated moves with depth-2 search
- **Difficult**: Always chooses best move with depth-3 minimax search and alpha-beta pruning

## 🔧 Development

Run in development mode:
```bash
npm run dev
```

## 📝 License

ISC

## 👨‍💻 Author

Created with ❤️ and ☕ using the Copilot SDK concept

## 🙏 Acknowledgments

- chess.js for the chess engine
- Express.js for the web server
- All chess enthusiasts and nerds out there!