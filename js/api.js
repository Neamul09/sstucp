/**
 * Codeforces API Integration
 * Handles API requests, caching, and error handling
 * OPTIMIZED: Parallel fetching with concurrency limit
 */

// ========================================
// Configuration
// ========================================

const API_CONFIG = {
    BASE_URL: 'https://codeforces.com/api',
    CACHE_DURATION: 60 * 1000, // 1 minute in milliseconds
    BATCH_SIZE: 50, // Max handles per request for user.info
    PARALLEL_LIMIT: 3, // Max concurrent requests for solved counts
    CACHE_KEYS: {
        USERS: 'cf_leaderboard_users',
        SOLVED: 'cf_leaderboard_solved',
        CONTESTS: 'cf_leaderboard_contests',
        TIMESTAMP: 'cf_leaderboard_timestamp',
    },
};

// ========================================
// Cache Management
// ========================================

/**
 * Check if cache is still valid
 * @returns {boolean}
 */
function isCacheValid() {
    const timestamp = localStorage.getItem(API_CONFIG.CACHE_KEYS.TIMESTAMP);
    if (!timestamp) return false;

    const age = Date.now() - parseInt(timestamp, 10);
    return age < API_CONFIG.CACHE_DURATION;
}

/**
 * Get cached data
 * @param {string} key - Cache key
 * @returns {any|null}
 */
function getCached(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        console.warn('Cache read error:', e);
        return null;
    }
}

/**
 * Set cached data
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 */
function setCached(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        localStorage.setItem(API_CONFIG.CACHE_KEYS.TIMESTAMP, Date.now().toString());
    } catch (e) {
        console.warn('Cache write error:', e);
    }
}

/**
 * Clear all cache
 */
function clearCache() {
    Object.values(API_CONFIG.CACHE_KEYS).forEach(key => {
        localStorage.removeItem(key);
    });
}

/**
 * Get cache age as readable string
 * @returns {string}
 */
function getCacheAge() {
    const timestamp = localStorage.getItem(API_CONFIG.CACHE_KEYS.TIMESTAMP);
    if (!timestamp) return 'No cached data';

    const age = Date.now() - parseInt(timestamp, 10);
    return `Cached ${timeAgo(parseInt(timestamp, 10))}`;
}

// ========================================
// API Helpers
// ========================================

/**
 * Delay helper
 * @param {number} ms - Milliseconds to wait
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Make an API request with error handling, timeout, and retry logic
 * @param {string} endpoint - API endpoint
 * @param {Object} params - Query parameters
 * @param {number} timeout - Timeout in ms (default 15s)
 * @param {number} retries - Number of retries (default 3)
 * @returns {Promise<any>}
 */
async function apiRequest(endpoint, params = {}, timeout = 15000, retries = 3) {
    const url = new URL(`${API_CONFIG.BASE_URL}/${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
    });

    let lastError;

    for (let attempt = 0; attempt < retries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url.toString(), {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            const data = await response.json();

            if (data.status !== 'OK') {
                throw new Error(data.comment || 'API returned an error');
            }

            return data.result;
        } catch (error) {
            clearTimeout(timeoutId);
            lastError = error;

            // Don't retry on non-retryable errors
            if (error.message.includes('handle not found')) {
                throw error;
            }

            // Wait before retrying (exponential backoff)
            if (attempt < retries - 1) {
                const waitTime = Math.pow(2, attempt) * 500; // 500ms, 1s, 2s
                console.log(`Retry ${attempt + 1}/${retries - 1} for ${endpoint} after ${waitTime}ms`);
                await delay(waitTime);
            }
        }
    }

    // All retries failed
    if (lastError.name === 'AbortError') {
        throw new Error('Request timeout');
    }
    throw lastError;
}

/**
 * Fetch rating history for a user
 * @param {string} handle - Codeforces handle
 * @returns {Promise<Object[]>} Array of rating changes
 */
async function fetchRatingHistory(handle) {
    try {
        return await apiRequest('user.rating', { handle: handle });
    } catch (error) {
        console.warn(`Could not fetch rating history for ${handle}:`, error.message);
        return [];
    }
}

// ========================================
// User Data Fetching
// ========================================

/**
 * Fetch user info for a single handle
 * @param {string} handle - Codeforces handle
 * @returns {Promise<Object|null>}
 */
async function fetchSingleUserInfo(handle) {
    try {
        const users = await apiRequest('user.info', { handles: handle });
        return users[0] || null;
    } catch (error) {
        console.warn(`Could not fetch user info for ${handle}:`, error.message);
        return null;
    }
}

/**
 * Fetch user info for multiple handles (with fallback to individual fetching)
 * @param {string[]} handles - Array of Codeforces handles
 * @returns {Promise<Object[]>}
 */
async function fetchUserInfo(handles) {
    if (!handles || handles.length === 0) return [];

    // Check cache first
    if (isCacheValid()) {
        const cached = getCached(API_CONFIG.CACHE_KEYS.USERS);
        if (cached && cached.length > 0) {
            console.log('Using cached user data');
            return cached;
        }
    }

    const allUsers = [];
    const failedHandles = [];

    // Try batch request first (faster)
    try {
        const users = await apiRequest('user.info', {
            handles: handles.join(';'),
        });
        allUsers.push(...users);
    } catch (error) {
        console.warn('Batch user fetch failed, trying individual fetches...', error.message);

        // Fallback: fetch users individually
        for (const handle of handles) {
            const user = await fetchSingleUserInfo(handle);
            if (user) {
                allUsers.push(user);
            } else {
                failedHandles.push(handle);
            }
            // Small delay to avoid rate limiting
            await delay(100);
        }
    }

    if (failedHandles.length > 0) {
        console.warn(`Failed to load ${failedHandles.length} users:`, failedHandles);
    }

    if (allUsers.length > 0) {
        setCached(API_CONFIG.CACHE_KEYS.USERS, allUsers);
    }

    return allUsers;
}

/**
 * Calculate stats for a user based on submissions
 * @param {string} handle - Codeforces handle
 * @returns {Promise<Object>} Stats object with counts and points for different periods
 */
async function fetchUserStats(handle) {
    try {
        // Fetch submissions and rating history in parallel
        const [submissions, ratingHistory] = await Promise.all([
            apiRequest('user.status', { handle: handle, from: 1, count: 5000 }, 20000),
            fetchRatingHistory(handle)
        ]);

        const now = Math.floor(Date.now() / 1000);
        const daySeconds = 86400;
        const weekSeconds = daySeconds * 7;
        const monthSeconds = daySeconds * 30;
        const yearSeconds = daySeconds * 365;

        // Initialize stats
        const stats = {
            all: { count: 0, points: 0, ratingGain: 0 },
            year: { count: 0, points: 0, ratingGain: 0 },
            month: { count: 0, points: 0, ratingGain: 0 },
            week: { count: 0, points: 0, ratingGain: 0 },
            day: { count: 0, points: 0, ratingGain: 0 }
        };

        // 1. Process Solved Problems
        const solvedProblems = new Set();
        for (const sub of submissions) {
            if (sub.verdict !== 'OK') continue;
            const problemKey = `${sub.problem.contestId}-${sub.problem.index}`;
            if (solvedProblems.has(problemKey)) continue;
            solvedProblems.add(problemKey);

            const rating = sub.problem.rating || 0;
            const age = now - sub.creationTimeSeconds;

            stats.all.count++;
            stats.all.points += rating;

            if (age < yearSeconds) { stats.year.count++; stats.year.points += rating; }
            if (age < monthSeconds) { stats.month.count++; stats.month.points += rating; }
            if (age < weekSeconds) { stats.week.count++; stats.week.points += rating; }
            if (age < daySeconds) { stats.day.count++; stats.day.points += rating; }
        }

        // 2. Process Rating Gains
        for (const change of ratingHistory) {
            const age = now - change.ratingUpdateTimeSeconds;
            const gain = change.newRating - change.oldRating;

            stats.all.ratingGain += gain;
            if (age < yearSeconds) stats.year.ratingGain += gain;
            if (age < monthSeconds) stats.month.ratingGain += gain;
            if (age < weekSeconds) stats.week.ratingGain += gain;
            if (age < daySeconds) stats.day.ratingGain += gain;
        }

        return stats;
    } catch (error) {
        console.warn(`Could not fetch stats for ${handle}:`, error.message);
        const base = { count: 0, points: 0, ratingGain: 0 };
        return { all: { ...base }, year: { ...base }, month: { ...base }, week: { ...base }, day: { ...base } };
    }
}

/**
 * Run promises with a concurrency limit
 * @param {Array} items - Items to process
 * @param {Function} fn - Async function to run on each item
 * @param {number} limit - Max concurrent operations
 * @returns {Promise<Array>}
 */
async function parallelLimit(items, fn, limit) {
    const results = [];
    const executing = [];

    for (const [index, item] of items.entries()) {
        const promise = Promise.resolve().then(() => fn(item, index));
        results.push(promise);

        if (limit <= items.length) {
            const e = promise.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);
            if (executing.length >= limit) {
                await Promise.race(executing);
            }
        }
    }

    return Promise.all(results);
}

/**
 * Fetch solved counts for multiple users (OPTIMIZED with parallel fetching)
 * @param {string[]} handles - Array of handles
 * @param {Function} onProgress - Progress callback (handle, count, index, total)
 * @returns {Promise<Object>} Map of handle -> solvedCount
 */
async function fetchAllSolvedCounts(handles, onProgress = null) {
    // Check cache first
    if (isCacheValid()) {
        const cached = getCached(API_CONFIG.CACHE_KEYS.SOLVED);
        if (cached && Object.keys(cached).length > 0) {
            console.log('Using cached stats');
            return cached;
        }
    }

    const userStats = {};
    let completed = 0;

    // Fetch in parallel with concurrency limit
    await parallelLimit(handles, async (handle, index) => {
        const stats = await fetchUserStats(handle);
        userStats[handle] = stats;
        completed++;

        if (onProgress) {
            // Pass the total count for the progress display
            onProgress(handle, stats.all.count, completed - 1, handles.length);
        }
    }, API_CONFIG.PARALLEL_LIMIT);

    if (Object.keys(userStats).length > 0) {
        setCached(API_CONFIG.CACHE_KEYS.SOLVED, userStats);
    }

    return userStats;
}

// ========================================
// Contest Data
// ========================================

/**
 * Fetch upcoming contests
 * @param {number} limit - Maximum number of contests to return
 * @returns {Promise<Object[]>}
 */
async function fetchUpcomingContests(limit = 4) {
    // Check cache first
    if (isCacheValid()) {
        const cached = getCached(API_CONFIG.CACHE_KEYS.CONTESTS);
        if (cached && cached.length > 0) {
            console.log('Using cached contests');
            return cached;
        }
    }

    try {
        const contests = await apiRequest('contest.list', { gym: false });

        // Filter to only upcoming contests (phase === 'BEFORE')
        const upcoming = contests
            .filter(c => c.phase === 'BEFORE')
            .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds)
            .slice(0, limit);

        if (upcoming.length > 0) {
            setCached(API_CONFIG.CACHE_KEYS.CONTESTS, upcoming);
        }

        return upcoming;
    } catch (error) {
        console.error('Error fetching contests:', error);

        // Try to return cached data even if expired
        const cached = getCached(API_CONFIG.CACHE_KEYS.CONTESTS);
        return cached || [];
    }
}

// ========================================
// Full Data Fetch (combines all data)
// ========================================

/**
 * Fetch all leaderboard data
 * @param {Object[]} userConfig - Array of { handle, department } from users.json
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} { users: [], contests: [], fromCache: boolean }
 */
async function fetchLeaderboardData(userConfig, onProgress = null) {
    const fromCache = isCacheValid();
    const handles = userConfig.map(u => u.handle);

    // Create a map for department lookup
    const deptMap = {};
    userConfig.forEach(u => {
        deptMap[u.handle.toLowerCase()] = u.department;
    });

    // Fetch user info and solved counts in parallel
    const [userInfos, userStats, contests] = await Promise.all([
        fetchUserInfo(handles),
        fetchAllSolvedCounts(handles, onProgress),
        fetchUpcomingContests()
    ]);

    // Combine data
    const users = userInfos.map(info => {
        const handle = info.handle;
        // Default empty stats if missing
        const stats = userStats[handle] || userStats[handle.toLowerCase()] || {
            all: { count: 0, points: 0 },
            year: { count: 0, points: 0 },
            month: { count: 0, points: 0 },
            week: { count: 0, points: 0 },
            day: { count: 0, points: 0 }
        };

        const rating = info.rating || 0;

        return {
            handle: handle,
            name: `${info.firstName || ''} ${info.lastName || ''}`.trim() || handle,
            avatar: info.titlePhoto || info.avatar,
            rating: rating,
            maxRating: info.maxRating || rating,

            // Store full stats
            stats: stats,

            // Default sort values (All Time)
            solved: stats.all.count,
            score: calculateScore(rating, stats.all.count), // Score uses count for All Time

            department: deptMap[handle.toLowerCase()] || 'Unknown',
            rank: info.rank || getRankTitle(rating),
            country: info.country,
            organization: info.organization,
        };
    });

    return {
        users,
        contests,
        fromCache,
    };
}

// ========================================
// Export for module usage
// ========================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        fetchUserInfo,
        fetchSolvedCount,
        fetchAllSolvedCounts,
        fetchUpcomingContests,
        fetchLeaderboardData,
        clearCache,
        getCacheAge,
        isCacheValid,
    };
}
