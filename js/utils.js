/**
 * Utility Functions for CP Leaderboard
 * Helpers for debouncing, throttling, formatting, and Codeforces rating utilities
 */

// ========================================
// Debounce & Throttle
// ========================================

/**
 * Debounce a function - delays execution until after wait milliseconds have elapsed
 * since the last time the debounced function was invoked.
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(fn, delay = 300) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * Throttle a function - limits the rate at which a function can fire.
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Minimum time between calls in milliseconds
 * @returns {Function} Throttled function
 */
function throttle(fn, limit = 300) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}

// ========================================
// Number Formatting
// ========================================

/**
 * Format a number with commas for thousands
 * @param {number} num - Number to format
 * @returns {string} Formatted number string
 */
function formatNumber(num) {
    if (num === null || num === undefined) return '--';
    return num.toLocaleString('en-US');
}

/**
 * Format a large number with K/M suffixes
 * @param {number} num - Number to format
 * @returns {string} Shortened number string
 */
function formatCompact(num) {
    if (num === null || num === undefined) return '--';
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

// ========================================
// Codeforces Rating Utilities
// ========================================

/**
 * Codeforces rating thresholds and titles
 */
const CF_RANKS = [
    { min: 3000, title: 'Legendary', color: '#FF0000', class: 'legendary' },
    { min: 2600, title: 'Grandmaster', color: '#FF0000', class: 'grandmaster' },
    { min: 2400, title: 'Intl. Master', color: '#FF8C00', class: 'intlmaster' },
    { min: 2100, title: 'Master', color: '#FF8C00', class: 'master' },
    { min: 1900, title: 'Candidate', color: '#AA00AA', class: 'candidate' },
    { min: 1600, title: 'Expert', color: '#0000FF', class: 'expert' },
    { min: 1400, title: 'Specialist', color: '#03A89E', class: 'specialist' },
    { min: 1200, title: 'Pupil', color: '#008000', class: 'pupil' },
    { min: 0, title: 'Newbie', color: '#808080', class: 'newbie' },
];

/**
 * Get Codeforces rank title based on rating
 * @param {number} rating - User's rating
 * @returns {string} Rank title
 */
function getRankTitle(rating) {
    if (!rating || rating < 0) return 'Unrated';
    const rank = CF_RANKS.find(r => rating >= r.min);
    return rank ? rank.title : 'Newbie';
}

/**
 * Get rank color based on rating
 * @param {number} rating - User's rating
 * @returns {string} Hex color code
 */
function getRankColor(rating) {
    if (!rating || rating < 0) return '#808080';
    const rank = CF_RANKS.find(r => rating >= r.min);
    return rank ? rank.color : '#808080';
}

/**
 * Get rank CSS class based on rating
 * @param {number} rating - User's rating
 * @returns {string} CSS class name
 */
function getRankClass(rating) {
    if (!rating || rating < 0) return 'unrated';
    const rank = CF_RANKS.find(r => rating >= r.min);
    return rank ? rank.class : 'newbie';
}

// ========================================
// Time Utilities
// ========================================

/**
 * Format a countdown from milliseconds
 * @param {number} ms - Time in milliseconds
 * @returns {string} Formatted countdown string
 */
function formatCountdown(ms) {
    if (ms <= 0) return 'LIVE';

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
}

/**
 * Format a date/time to readable string
 * @param {number} timestamp - Unix timestamp in seconds
 * @returns {string} Formatted date string
 */
function formatDateTime(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Get time ago string from a date
 * @param {Date|number} date - Date object or timestamp
 * @returns {string} Time ago string
 */
function timeAgo(date) {
    const timestamp = date instanceof Date ? date.getTime() : date;
    const now = Date.now();
    const diff = now - timestamp;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
}

// ========================================
// Score Calculation
// ========================================

/**
 * Calculate composite score for ranking
 * Formula: (Rating * 0.7) + (SolvedCount * 0.5)
 * @param {number} rating - User's Codeforces rating
 * @param {number} solvedCount - Number of problems solved
 * @returns {number} Composite score
 */
function calculateScore(rating, solvedCount) {
    const r = rating || 0;
    const s = solvedCount || 0;
    return Math.round((r * 0.7) + (s * 0.5));
}

// ========================================
// DOM Utilities
// ========================================

/**
 * Safely get an element by ID
 * @param {string} id - Element ID
 * @returns {HTMLElement|null}
 */
function $(id) {
    return document.getElementById(id);
}

/**
 * Create an element with classes and attributes
 * @param {string} tag - HTML tag
 * @param {string} className - CSS classes
 * @param {Object} attrs - Additional attributes
 * @returns {HTMLElement}
 */
function createElement(tag, className = '', attrs = {}) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    Object.entries(attrs).forEach(([key, val]) => {
        if (key === 'textContent') {
            el.textContent = val;
        } else if (key === 'innerHTML') {
            el.innerHTML = val;
        } else {
            el.setAttribute(key, val);
        }
    });
    return el;
}

// ========================================
// Export for module usage
// ========================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        debounce,
        throttle,
        formatNumber,
        formatCompact,
        getRankTitle,
        getRankColor,
        getRankClass,
        formatCountdown,
        formatDateTime,
        timeAgo,
        calculateScore,
        $,
        createElement,
    };
}
