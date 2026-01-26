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
 * Fetch solved problems count for a single user
 * OPTIMIZED: Reduced count limit for faster response
 * @param {string} handle - Codeforces handle
 * @returns {Promise<number>}
 */
async function fetchSolvedCount(handle) {
    try {
        // Use a smaller count for faster response - most users won't have 5000+ submissions
        const submissions = await apiRequest('user.status', {
            handle: handle,
            from: 1,
            count: 5000, // Reduced from 10k for speed
        }, 20000); // 20 second timeout

        // Count unique solved problems
        const solvedProblems = new Set();
        submissions.forEach(sub => {
            if (sub.verdict === 'OK') {
                const problemKey = `${sub.problem.contestId}-${sub.problem.index}`;
                solvedProblems.add(problemKey);
            }
        });

        return solvedProblems.size;
    } catch (error) {
        console.warn(`Could not fetch solved count for ${handle}:`, error.message);
        return null; // Return null to indicate failure, not 0
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
            console.log('Using cached solved counts');
            return cached;
        }
    }

    const solvedCounts = {};
    let completed = 0;

    // Fetch in parallel with concurrency limit
    await parallelLimit(handles, async (handle, index) => {
        const count = await fetchSolvedCount(handle);
        solvedCounts[handle] = count !== null ? count : 0;
        completed++;

        if (onProgress) {
            onProgress(handle, solvedCounts[handle], completed - 1, handles.length);
        }
    }, API_CONFIG.PARALLEL_LIMIT);

    if (Object.keys(solvedCounts).length > 0) {
        setCached(API_CONFIG.CACHE_KEYS.SOLVED, solvedCounts);
    }

    return solvedCounts;
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
    const [userInfos, solvedCounts, contests] = await Promise.all([
        fetchUserInfo(handles),
        fetchAllSolvedCounts(handles, onProgress),
        fetchUpcomingContests()
    ]);

    // Combine data
    const users = userInfos.map(info => {
        const handle = info.handle;
        const solved = solvedCounts[handle] || solvedCounts[handle.toLowerCase()] || 0;
        const rating = info.rating || 0;

        return {
            handle: handle,
            name: `${info.firstName || ''} ${info.lastName || ''}`.trim() || handle,
            avatar: info.titlePhoto || info.avatar,
            rating: rating,
            maxRating: info.maxRating || rating,
            solved: solved,
            score: calculateScore(rating, solved),
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
