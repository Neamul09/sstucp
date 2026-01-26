/**
 * Main Leaderboard Logic
 * Handles initialization, sorting, filtering, and rendering
 */

// ========================================
// State
// ========================================

let state = {
    users: [],
    filteredUsers: [],
    departments: new Set(),
    sortBy: 'score',
    searchQuery: '',
    departmentFilter: '',
    isLoading: false,
    hasError: false,
    config: {
        universityName: 'University',
        reportFormUrl: ''
    }
};

// ========================================
// DOM References
// ========================================

const DOM = {
    get loading() { return $('loadingState'); },
    get loadingText() { return $('loadingText'); },
    get error() { return $('errorState'); },
    get userList() { return $('userList'); },
    get searchInput() { return $('searchInput'); },
    get deptFilter() { return $('deptFilter'); },
    get sortBy() { return $('sortBy'); },
    get refreshBtn() { return $('refreshBtn'); },
    get retryBtn() { return $('retryBtn'); },
    get reportBtn() { return $('reportBtn'); },
    get totalUsers() { return $('totalUsers'); },
    get avgRating() { return $('avgRating'); },
    get totalSolved() { return $('totalSolved'); },
    get cacheInfo() { return $('cacheInfo'); },
    get mainTitle() { return $('mainTitle'); },
    get tagline() { return $('tagline'); },
};

// ========================================
// Initialization
// ========================================

/**
 * Initialize the leaderboard application
 */
async function init() {
    console.log('CP Leaderboard initializing...');

    // Bind event listeners
    bindEvents();

    // Load data
    await loadData();
}

/**
 * Bind all event listeners
 */
function bindEvents() {
    // Search input with debounce
    DOM.searchInput.addEventListener('input', debounce((e) => {
        state.searchQuery = e.target.value.trim().toLowerCase();
        applyFilters();
    }, 250));

    // Department filter
    DOM.deptFilter.addEventListener('change', (e) => {
        state.departmentFilter = e.target.value;
        applyFilters();
    });

    // Sort by
    DOM.sortBy.addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        applyFilters();
    });

    // Refresh button
    DOM.refreshBtn.addEventListener('click', async () => {
        clearCache();
        await loadData(true);
    });

    // Retry button
    DOM.retryBtn.addEventListener('click', async () => {
        await loadData();
    });
}

// ========================================
// Data Loading
// ========================================

/**
 * Load all leaderboard data
 * @param {boolean} forceRefresh - Clear cache and fetch fresh
 */
async function loadData(forceRefresh = false) {
    if (state.isLoading) return;

    showLoading(true);
    hideError();

    try {
        // Load user config from JSON
        const configData = await loadUserConfig();

        if (!configData) {
            throw new Error('Failed to load users.json');
        }

        // Handle both old format (array) and new format (object with users array)
        let userConfig;
        if (Array.isArray(configData)) {
            userConfig = configData;
        } else {
            userConfig = configData.users || [];
            if (configData.config) {
                state.config = { ...state.config, ...configData.config };
                applyConfig();
            }
        }

        if (!userConfig || userConfig.length === 0) {
            throw new Error('No users configured in users.json');
        }

        // Extract departments for filter
        state.departments = new Set(userConfig.map(u => u.department).filter(Boolean));
        populateDeptFilter();

        // Fetch leaderboard data from API
        let completedCount = 0;
        const data = await fetchLeaderboardData(userConfig, (handle, count, index, total) => {
            completedCount++;
            updateLoadingText(`Loading ${completedCount}/${total} users...`);
        });

        state.users = data.users;

        // Apply initial filters and render
        applyFilters();
        updateStats();
        updateCacheInfo(data.fromCache);

        showLoading(false);

    } catch (error) {
        console.error('Error loading data:', error);
        showLoading(false);
        showError(error.message);
    }
}

/**
 * Load user configuration from users.json
 * @returns {Promise<Object|Array>}
 */
async function loadUserConfig() {
    try {
        const response = await fetch('users.json');
        if (!response.ok) {
            throw new Error('Failed to load users.json');
        }
        return await response.json();
    } catch (error) {
        console.error('Error loading user config:', error);
        throw error;
    }
}

/**
 * Apply config settings to the page
 */
function applyConfig() {
    const { universityName, reportFormUrl } = state.config;

    // Update title and tagline
    if (universityName) {
        document.title = `CP Leaderboard | ${universityName}`;
        DOM.tagline.textContent = `${universityName} Competitive Programming Rankings`;
    }

    // Update report button
    if (reportFormUrl && DOM.reportBtn) {
        DOM.reportBtn.href = reportFormUrl;
        DOM.reportBtn.style.display = 'flex';
    } else if (DOM.reportBtn) {
        DOM.reportBtn.style.display = 'none';
    }
}

/**
 * Update loading text
 * @param {string} text
 */
function updateLoadingText(text) {
    if (DOM.loadingText) {
        DOM.loadingText.textContent = text;
    }
}

// ========================================
// Filtering & Sorting
// ========================================

/**
 * Apply all filters and sorting, then render
 */
function applyFilters() {
    // First, sort all users by current sort criteria to get actual rankings
    let allSorted = [...state.users];
    allSorted.sort((a, b) => {
        switch (state.sortBy) {
            case 'rating':
                return b.rating - a.rating;
            case 'solved':
                return b.solved - a.solved;
            case 'score':
            default:
                return b.score - a.score;
        }
    });

    // Assign actual rank to each user
    allSorted.forEach((user, index) => {
        user.actualRank = index + 1;
    });

    // Now apply filters
    let filtered = [...allSorted];

    // Search filter
    if (state.searchQuery) {
        filtered = filtered.filter(user => {
            const query = state.searchQuery;
            return (
                user.handle.toLowerCase().includes(query) ||
                user.name.toLowerCase().includes(query)
            );
        });
    }

    // Department filter
    if (state.departmentFilter) {
        filtered = filtered.filter(user => user.department === state.departmentFilter);
    }

    state.filteredUsers = filtered;
    renderUserList();
}

/**
 * Populate department filter dropdown
 */
function populateDeptFilter() {
    const options = ['<option value="">All Departments</option>'];

    Array.from(state.departments)
        .sort()
        .forEach(dept => {
            options.push(`<option value="${dept}">${dept}</option>`);
        });

    DOM.deptFilter.innerHTML = options.join('');
}

// ========================================
// Rendering
// ========================================

/**
 * Render the user list
 */
function renderUserList() {
    const users = state.filteredUsers;

    if (users.length === 0) {
        DOM.userList.innerHTML = `
            <div class="no-contests">
                <i class="fas fa-search"></i>
                <p>No users found matching your criteria</p>
            </div>
        `;
        return;
    }

    const html = users.map(user => renderUserCard(user, user.actualRank)).join('');
    DOM.userList.innerHTML = html;
}

/**
 * Render a single user card
 * @param {Object} user - User data
 * @param {number} rank - Display rank (1-indexed)
 * @returns {string} HTML string
 */
function renderUserCard(user, rank) {
    const rankClass = rank <= 3 ? `rank-${rank}` : '';
    const ratingClass = `rating-${getRankClass(user.rating)}`;
    const avatarHtml = user.avatar
        ? `<img src="${user.avatar}" alt="${user.handle}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
           <div class="user-avatar-placeholder" style="display: none;">${user.handle.charAt(0).toUpperCase()}</div>`
        : `<div class="user-avatar-placeholder">${user.handle.charAt(0).toUpperCase()}</div>`;

    return `
        <article class="user-card ${rankClass}" onclick="window.open('https://codeforces.com/profile/${user.handle}', '_blank')">
            <div class="user-card-left">
                <span class="user-rank">${rank}.</span>
                <div class="user-avatar">
                    ${avatarHtml}
                </div>
                <div class="user-info">
                    <h3 class="user-name">${escapeHtml(user.name)}</h3>
                    <div class="user-handle">
                        <a href="https://codeforces.com/profile/${user.handle}" target="_blank" rel="noopener" onclick="event.stopPropagation()">@${user.handle}</a>
                        ${user.department ? `<span class="user-dept">${user.department}</span>` : ''}
                    </div>
                </div>
            </div>
            <div class="user-card-right">
                <div class="user-stat score">
                    <span class="label">Score</span>
                    <span class="value">${formatNumber(user.score)}</span>
                    <i class="fas fa-star stat-icon"></i>
                </div>
                <div class="user-stat rating">
                    <span class="label">Rating</span>
                    <span class="value ${ratingClass}">${formatNumber(user.rating)}</span>
                    <i class="fas fa-chart-line stat-icon"></i>
                </div>
                <div class="user-stat solved">
                    <span class="label">Solved</span>
                    <span class="value">${formatNumber(user.solved)}</span>
                    <i class="fas fa-check-circle stat-icon"></i>
                </div>
            </div>
        </article>
    `;
}

/**
 * Render upcoming contests
 */
function renderContests() {
    DOM.contestsLoading.style.display = 'none';

    const contests = state.contests;

    if (!contests || contests.length === 0) {
        DOM.contestsList.innerHTML = `
            <div class="no-contests">
                <p>No upcoming contests found</p>
            </div>
        `;
        return;
    }

    const now = Date.now() / 1000;

    const html = contests.map(contest => {
        const startTime = contest.startTimeSeconds;
        const timeUntil = (startTime * 1000) - Date.now();
        const countdown = formatCountdown(timeUntil);

        let countdownClass = '';
        if (timeUntil <= 0) {
            countdownClass = 'live';
        } else if (timeUntil < 24 * 60 * 60 * 1000) {
            countdownClass = 'soon';
        }

        return `
            <a href="https://codeforces.com/contestRegistration/${contest.id}" target="_blank" rel="noopener" class="contest-card">
                <div class="contest-info">
                    <h4 class="contest-name">${escapeHtml(contest.name)}</h4>
                    <p class="contest-time">${formatDateTime(startTime)}</p>
                </div>
                <span class="contest-countdown ${countdownClass}">${countdown}</span>
            </a>
        `;
    }).join('');

    DOM.contestsList.innerHTML = html;

    // Start countdown timer
    startCountdownTimer();
}

/**
 * Start countdown timer to update contest countdowns
 */
let countdownInterval = null;

function startCountdownTimer() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }

    countdownInterval = setInterval(() => {
        const countdowns = document.querySelectorAll('.contest-countdown');

        state.contests.forEach((contest, index) => {
            if (countdowns[index]) {
                const timeUntil = (contest.startTimeSeconds * 1000) - Date.now();
                countdowns[index].textContent = formatCountdown(timeUntil);

                if (timeUntil <= 0) {
                    countdowns[index].classList.add('live');
                    countdowns[index].classList.remove('soon');
                } else if (timeUntil < 24 * 60 * 60 * 1000) {
                    countdowns[index].classList.add('soon');
                    countdowns[index].classList.remove('live');
                }
            }
        });
    }, 1000);
}

// ========================================
// Stats & UI Updates
// ========================================

/**
 * Update summary stats
 */
function updateStats() {
    const users = state.users;

    if (users.length === 0) {
        DOM.totalUsers.textContent = '--';
        DOM.avgRating.textContent = '--';
        DOM.totalSolved.textContent = '--';
        return;
    }

    const totalUsers = users.length;
    const ratedUsers = users.filter(u => u.rating > 0);
    const totalRating = ratedUsers.reduce((sum, u) => sum + u.rating, 0);
    const avgRating = ratedUsers.length > 0 ? Math.round(totalRating / ratedUsers.length) : 0;
    const totalSolved = users.reduce((sum, u) => sum + (u.solved || 0), 0);

    DOM.totalUsers.textContent = formatNumber(totalUsers);
    DOM.avgRating.textContent = formatNumber(avgRating);
    DOM.totalSolved.textContent = formatCompact(totalSolved);
}

/**
 * Update cache info in footer
 * @param {boolean} fromCache - Whether data was loaded from cache
 */
function updateCacheInfo(fromCache) {
    if (fromCache) {
        DOM.cacheInfo.textContent = getCacheAge();
    } else {
        DOM.cacheInfo.textContent = 'Data refreshed just now';
    }
}

// ========================================
// Loading & Error States
// ========================================

/**
 * Show/hide loading state
 * @param {boolean} show
 */
function showLoading(show) {
    state.isLoading = show;
    DOM.loading.style.display = show ? 'flex' : 'none';
    DOM.userList.style.display = show ? 'none' : 'block';

    if (show) {
        DOM.refreshBtn.classList.add('loading');
        updateLoadingText('Fetching data from Codeforces...');
    } else {
        DOM.refreshBtn.classList.remove('loading');
    }
}

/**
 * Show error state
 * @param {string} message
 */
function showError(message) {
    state.hasError = true;
    DOM.error.style.display = 'flex';
    DOM.error.querySelector('p').textContent = message || 'Failed to load leaderboard data';
}

/**
 * Hide error state
 */
function hideError() {
    state.hasError = false;
    DOM.error.style.display = 'none';
}

// ========================================
// Utility
// ========================================

/**
 * Escape HTML to prevent XSS
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ========================================
// Start Application
// ========================================

document.addEventListener('DOMContentLoaded', init);
