/**
 * Copilot Chess - Forest Edition
 * JavaScript for UI interactions and animations
 */

// Cache DOM elements for performance
let aiThinkingElement = null;
let statusObserver = null;

// Check for reduced motion preference
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

/**
 * Initialize the application
 */
function initializeApp() {
    // Cache frequently used elements
    aiThinkingElement = document.getElementById('aiThinking');
    
    setupAIThinkingDemo();
    setupButtonEffects();
    setupAccessibility();
    injectAnimationStyles();
}

/**
 * Demo: Toggle AI thinking indicator
 * In production, this would be triggered by actual AI computation
 */
function setupAIThinkingDemo() {
    // Demo: Show thinking indicator after 3 seconds, hide after 5
    setTimeout(() => {
        showAIThinking();
        setTimeout(hideAIThinking, 2000);
    }, 3000);
}

/**
 * Show the AI thinking indicator
 */
function showAIThinking() {
    if (aiThinkingElement) {
        aiThinkingElement.classList.add('active');
        aiThinkingElement.setAttribute('aria-hidden', 'false');
    }
}

/**
 * Hide the AI thinking indicator
 */
function hideAIThinking() {
    if (aiThinkingElement) {
        aiThinkingElement.classList.remove('active');
        aiThinkingElement.setAttribute('aria-hidden', 'true');
    }
}

/**
 * Add particle effect on button clicks
 */
function setupButtonEffects() {
    const buttons = document.querySelectorAll('.btn-leaf');
    
    buttons.forEach(button => {
        button.addEventListener('click', (e) => {
            createLeafParticles(e.clientX, e.clientY);
        });
    });
}

/**
 * Create floating leaf particles at the given position
 * Respects prefers-reduced-motion preference
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 */
function createLeafParticles(x, y) {
    // Respect reduced motion preference
    if (prefersReducedMotion) {
        return;
    }
    
    const leaves = ['🍂', '🍃', '🌿', '🌱'];
    const particleCount = 5;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('span');
        particle.className = 'leaf-particle';
        particle.textContent = leaves[Math.floor(Math.random() * leaves.length)];
        particle.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            font-size: ${12 + Math.random() * 8}px;
            pointer-events: none;
            z-index: 9999;
            animation: leafFloat ${1 + Math.random()}s ease-out forwards;
        `;
        
        // Random direction
        const angle = (Math.PI * 2 * i) / particleCount;
        const distance = 50 + Math.random() * 30;
        const endX = Math.cos(angle) * distance;
        const endY = Math.sin(angle) * distance - 50;
        
        particle.style.setProperty('--end-x', `${endX}px`);
        particle.style.setProperty('--end-y', `${endY}px`);
        
        document.body.appendChild(particle);
        
        // Remove particle after animation
        setTimeout(() => particle.remove(), 1500);
    }
}

/**
 * Inject animation styles only once
 */
function injectAnimationStyles() {
    // Check if styles already exist to prevent duplicates
    if (document.getElementById('leaf-particle-styles')) {
        return;
    }
    
    const style = document.createElement('style');
    style.id = 'leaf-particle-styles';
    style.textContent = `
        @keyframes leafFloat {
            0% {
                opacity: 1;
                transform: translate(0, 0) rotate(0deg);
            }
            100% {
                opacity: 0;
                transform: translate(var(--end-x), var(--end-y)) rotate(360deg);
            }
        }
    `;
    document.head.appendChild(style);
}

/**
 * Setup accessibility features
 */
function setupAccessibility() {
    // Announce status changes to screen readers
    const statusText = document.querySelector('.status-text');
    if (statusText) {
        statusObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'characterData' || mutation.type === 'childList') {
                    announceToScreenReader(statusText.textContent);
                }
            });
        });
        
        statusObserver.observe(statusText, { 
            characterData: true, 
            childList: true, 
            subtree: true 
        });
    }
}

/**
 * Cleanup function for observers and event listeners
 * Call this when unmounting the component or navigating away
 */
function cleanup() {
    if (statusObserver) {
        statusObserver.disconnect();
        statusObserver = null;
    }
}

/**
 * Announce message to screen readers
 * @param {string} message - Message to announce
 */
function announceToScreenReader(message) {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    document.body.appendChild(announcement);
    
    // Allow enough time for screen readers to announce the message
    setTimeout(() => announcement.remove(), 3000);
}

// Export functions for external use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        showAIThinking,
        hideAIThinking,
        createLeafParticles,
        announceToScreenReader,
        cleanup
    };
}
