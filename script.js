/**
 * COPILOT CHESS - Retro-Futuristic UI Scripts
 * Handles animations, typing effects, and interactive elements
 */

(function() {
  'use strict';

  // ==========================================================================
  // Configuration
  // ==========================================================================
  const CONFIG = {
    typingSpeed: 30, // ms per character
    terminalMaxLines: 50,
    counterAnimationDuration: 1000,
  };

  // ==========================================================================
  // Typing Effect
  // ==========================================================================
  
  /**
   * Creates a typing effect for text content
   * @param {HTMLElement} element - The element to apply typing effect to
   * @param {string} text - The text to type
   * @param {number} speed - Typing speed in ms per character
   * @returns {Promise} Resolves when typing is complete
   */
  function typeText(element, text, speed = CONFIG.typingSpeed) {
    return new Promise((resolve) => {
      element.textContent = '';
      let index = 0;
      
      function type() {
        if (index < text.length) {
          element.textContent += text.charAt(index);
          index++;
          setTimeout(type, speed);
        } else {
          resolve();
        }
      }
      
      type();
    });
  }

  // ==========================================================================
  // Terminal / Move Log
  // ==========================================================================
  
  /**
   * Adds a new line to the terminal output with typing effect
   * @param {string} text - The text to add
   * @param {string} type - Line type ('info', 'move', 'error', 'success')
   */
  function addTerminalLine(text, type = 'info') {
    const terminal = document.getElementById('move-history');
    if (!terminal) return;

    const line = document.createElement('div');
    line.className = 'terminal-line';
    
    const now = new Date();
    const timestamp = now.toTimeString().split(' ')[0];
    
    const colorClass = {
      info: '',
      move: 'text-cyan',
      error: 'text-laser',
      success: 'text-magenta',
    }[type] || '';

    line.innerHTML = `
      <span class="terminal-prompt">&gt;</span>
      <span class="terminal-timestamp">[${timestamp}]</span>
      <span class="terminal-text ${colorClass}"></span>
    `;

    terminal.appendChild(line);
    
    // Apply typing effect
    const textElement = line.querySelector('.terminal-text');
    typeText(textElement, text);
    
    // Auto-scroll to bottom
    terminal.scrollTop = terminal.scrollHeight;
    
    // Limit terminal lines
    while (terminal.children.length > CONFIG.terminalMaxLines) {
      terminal.removeChild(terminal.firstChild);
    }
  }

  // ==========================================================================
  // Counter Animation
  // ==========================================================================
  
  /**
   * Animates a counter from current value to target value
   * @param {HTMLElement} element - The counter element
   * @param {number} targetValue - The target value
   * @param {number} duration - Animation duration in ms
   */
  function animateCounter(element, targetValue, duration = CONFIG.counterAnimationDuration) {
    const startValue = parseInt(element.dataset.value || '0', 10);
    const startTime = performance.now();
    
    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      const currentValue = Math.round(startValue + (targetValue - startValue) * easeProgress);
      element.textContent = String(currentValue).padStart(3, '0');
      element.dataset.value = currentValue;
      
      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }
    
    requestAnimationFrame(update);
  }

  // ==========================================================================
  // AI Thinking Indicator
  // ==========================================================================
  
  /**
   * Shows the AI thinking indicator
   */
  function showAIThinking() {
    const indicator = document.getElementById('ai-thinking');
    if (indicator) {
      indicator.hidden = false;
      addTerminalLine('AI PROCESSING MOVE...', 'info');
    }
  }

  /**
   * Hides the AI thinking indicator
   */
  function hideAIThinking() {
    const indicator = document.getElementById('ai-thinking');
    if (indicator) {
      indicator.hidden = true;
      addTerminalLine('AI CALCULATION COMPLETE', 'success');
    }
  }

  // ==========================================================================
  // Timer
  // ==========================================================================
  
  let timerInterval = null;
  let timerSeconds = 0;

  /**
   * Formats seconds into HH:MM:SS
   * @param {number} totalSeconds 
   * @returns {string}
   */
  function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return [hours, minutes, seconds]
      .map(v => String(v).padStart(2, '0'))
      .join(':');
  }

  /**
   * Starts the game timer
   */
  function startTimer() {
    if (timerInterval) return;
    
    const timerElement = document.querySelector('.timer');
    if (!timerElement) return;
    
    timerInterval = setInterval(() => {
      timerSeconds++;
      timerElement.textContent = formatTime(timerSeconds);
    }, 1000);
  }

  /**
   * Stops the game timer
   */
  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  /**
   * Resets the game timer
   */
  function resetTimer() {
    stopTimer();
    timerSeconds = 0;
    const timerElement = document.querySelector('.timer');
    if (timerElement) {
      timerElement.textContent = formatTime(0);
    }
  }

  // ==========================================================================
  // Move Counter
  // ==========================================================================
  
  let moveCount = 0;

  /**
   * Increments and updates the move counter
   */
  function incrementMoveCounter() {
    moveCount++;
    const counterElement = document.querySelector('.counter');
    if (counterElement) {
      animateCounter(counterElement, moveCount);
    }
  }

  /**
   * Resets the move counter
   */
  function resetMoveCounter() {
    moveCount = 0;
    const counterElement = document.querySelector('.counter');
    if (counterElement) {
      counterElement.textContent = '000';
      counterElement.dataset.value = '0';
    }
  }

  // ==========================================================================
  // Glitch Effect
  // ==========================================================================
  
  /**
   * Triggers a brief glitch effect on an element
   * @param {HTMLElement} element 
   */
  function triggerGlitch(element) {
    element.classList.add('glitch-active');
    setTimeout(() => {
      element.classList.remove('glitch-active');
    }, 300);
  }

  // ==========================================================================
  // Button Event Handlers
  // ==========================================================================
  
  function handleNewGame() {
    resetTimer();
    resetMoveCounter();
    addTerminalLine('NEW GAME INITIALIZED', 'success');
    addTerminalLine('AWAITING PLAYER INPUT...', 'info');
    startTimer();
    
    // Trigger glitch effect on title
    const title = document.querySelector('.system-title');
    if (title) {
      triggerGlitch(title);
    }
  }

  function handleUndoMove() {
    if (moveCount > 0) {
      moveCount--;
      const counterElement = document.querySelector('.counter');
      if (counterElement) {
        animateCounter(counterElement, moveCount);
      }
      addTerminalLine('MOVE REVERTED', 'info');
    } else {
      addTerminalLine('ERROR: NO MOVES TO UNDO', 'error');
    }
  }

  function handleHint() {
    addTerminalLine('ANALYZING POSITION...', 'info');
    
    // Simulate thinking delay
    showAIThinking();
    setTimeout(() => {
      hideAIThinking();
      addTerminalLine('HINT: CONSIDER CENTRAL CONTROL', 'success');
    }, 2000);
  }

  function handleDemoThinking() {
    showAIThinking();
    setTimeout(() => {
      hideAIThinking();
      incrementMoveCounter();
      addTerminalLine('DEMO: AI MADE A MOVE', 'move');
    }, 3000);
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================
  
  function init() {
    // Button event listeners
    const buttons = document.querySelectorAll('.neon-button');
    buttons.forEach(button => {
      const buttonText = button.querySelector('.btn-text');
      if (!buttonText) return;
      
      const text = buttonText.textContent.trim().toUpperCase();
      
      switch (text) {
        case 'NEW GAME':
          button.addEventListener('click', handleNewGame);
          break;
        case 'UNDO MOVE':
          button.addEventListener('click', handleUndoMove);
          break;
        case 'HINT':
          button.addEventListener('click', handleHint);
          break;
        case 'DEMO: AI THINKING':
          button.addEventListener('click', handleDemoThinking);
          break;
        default:
          break;
      }
    });

    // Initial terminal messages with delay
    setTimeout(() => {
      addTerminalLine('SYSTEM READY', 'success');
    }, 1500);

    setTimeout(() => {
      addTerminalLine('PRESS "NEW GAME" TO BEGIN', 'info');
    }, 2500);

    // Start timer automatically for demo
    setTimeout(() => {
      startTimer();
    }, 3000);

    console.log('[COPILOT CHESS] System initialized');
  }

  // ==========================================================================
  // Public API (exposed for potential chess engine integration)
  // ==========================================================================
  
  window.CopilotChess = {
    addTerminalLine,
    showAIThinking,
    hideAIThinking,
    incrementMoveCounter,
    resetMoveCounter,
    startTimer,
    stopTimer,
    resetTimer,
    typeText,
    triggerGlitch,
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
