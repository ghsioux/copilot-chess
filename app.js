/**
 * Copilot Chess - Forest Edition
 * JavaScript for UI interactions and animations
 */

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

/**
 * Initialize the application
 */
function initializeApp() {
    setupAIThinkingDemo();
    setupButtonEffects();
    setupAccessibility();
}

/**
 * Demo: Toggle AI thinking indicator
 * In production, this would be triggered by actual AI computation
 */
function setupAIThinkingDemo() {
    const aiThinking = document.getElementById('aiThinking');
    
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
    const aiThinking = document.getElementById('aiThinking');
    if (aiThinking) {
        aiThinking.classList.add('active');
        aiThinking.setAttribute('aria-hidden', 'false');
    }
}

/**
 * Hide the AI thinking indicator
 */
function hideAIThinking() {
    const aiThinking = document.getElementById('aiThinking');
    if (aiThinking) {
        aiThinking.classList.remove('active');
        aiThinking.setAttribute('aria-hidden', 'true');
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
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 */
function createLeafParticles(x, y) {
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

// Add CSS for leaf particle animation
const style = document.createElement('style');
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

/**
 * Setup accessibility features
 */
function setupAccessibility() {
    // Announce status changes to screen readers
    const statusText = document.querySelector('.status-text');
    if (statusText) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'characterData' || mutation.type === 'childList') {
                    announceToScreenReader(statusText.textContent);
                }
            });
        });
        
        observer.observe(statusText, { 
            characterData: true, 
            childList: true, 
            subtree: true 
        });
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
    
    setTimeout(() => announcement.remove(), 1000);
}

// Export functions for external use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        showAIThinking,
        hideAIThinking,
        createLeafParticles,
        announceToScreenReader
    };
}
