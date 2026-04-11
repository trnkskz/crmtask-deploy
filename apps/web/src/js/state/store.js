// ============================================================
// state/store.js
// Merkezi uygulama durumu (tek kaynak of truth)
// Tüm global değişkenler ve önbellek buradan yönetilir.
// ============================================================

const AppState = (() => {
    const FALLBACK_PASSIVE_STATUSES = ['deal', 'cold'];

    function isPassiveTaskStatus(status) {
        const normalized = String(status || '').toLowerCase();
        if (Array.isArray(globalThis.PASSIVE_STATUSES)) {
            return globalThis.PASSIVE_STATUSES.includes(normalized);
        }
        return FALLBACK_PASSIVE_STATUSES.includes(normalized);
    }

    function isActiveTaskStatus(status) {
        if (typeof globalThis.isActiveTask === 'function') {
            return globalThis.isActiveTask(status);
        }
        const normalized = String(status || '').toLowerCase();
        if (!normalized || normalized === 'pending_approval') return false;
        return !isPassiveTaskStatus(normalized);
    }

    function isPoolAssignee(assignee) {
        const pools = Array.isArray(globalThis.POOL_ASSIGNEES)
            ? globalThis.POOL_ASSIGNEES
            : ['UNASSIGNED', 'Team 1', 'Team 2', 'TARGET_POOL'];
        return pools.includes(assignee);
    }

    function isTeamLeadRole(role) {
        const normalized = String(role || '').trim().toUpperCase();
        return normalized === 'TEAM_LEADER' || normalized === 'TAKIM LIDERI';
    }

    function isOperationalTaskUser(user) {
        if (!user) return false;
        if (String(user.status || '') === 'Pasif') return false;
        return !isTeamLeadRole(user.role) && String(user.role || '') !== (globalThis.USER_ROLES?.MANAGER || 'Yönetici');
    }

    function isOperationalTaskAssignee(assignee, users) {
        const normalizedAssignee = String(assignee || '').trim();
        if (!normalizedAssignee || isPoolAssignee(normalizedAssignee)) return false;
        const matchedUser = (Array.isArray(users) ? users : []).find((user) =>
            String(user?.name || '').trim() === normalizedAssignee
            || String(user?.id || '').trim() === normalizedAssignee
            || String(user?.email || '').trim() === normalizedAssignee
        );
        if (!matchedUser) return true;
        return isOperationalTaskUser(matchedUser);
    }

    function isDateToday(dateStr) {
        if (!dateStr) return false;
        if (typeof globalThis.isToday === 'function') return globalThis.isToday(dateStr);
        const parsed = new Date(dateStr);
        if (Number.isNaN(parsed.getTime())) return false;
        const now = new Date();
        return parsed.getDate() === now.getDate()
            && parsed.getMonth() === now.getMonth()
            && parsed.getFullYear() === now.getFullYear();
    }

    function shouldRequireProjectsForCurrentRole() {
        if (typeof globalThis.hasPermission === 'function') {
            try {
                return Boolean(globalThis.hasPermission('manageProjects'));
            } catch (_) {
                // fall back to role snapshot below
            }
        }
        const explicitPermission = _loggedInUser?.settings?.permissions?.manageProjects;
        if (explicitPermission === false) return false;
        if (explicitPermission === true) return true;
        const apiRole = String(_loggedInUser?._apiRole || '').toUpperCase();
        return apiRole === 'ADMIN' || apiRole === 'MANAGER' || apiRole === 'TEAM_LEADER';
    }

    // --- Veri Koleksiyonları ---
    let _users = [];
    let _businesses = [];
    let _tasks = [];
    let _notifications = [];
    let _projects = [];
    let _systemLogs = [];
    let _dynamicCategories = {};
    let _pricingData = DEFAULT_PRICING_DATA;
    let _collectionRevisions = {
        users: 0,
        businesses: 0,
        tasks: 0,
        notifications: 0,
        projects: 0,
        systemLogs: 0,
        categories: 0,
        pricing: 0,
    };

    // --- Oturum ---
    let _loggedInUser = null;

    // --- UI Durumu ---
    let _currentPoolTab = 'general';
    let _pendingFilterActive = false;
    let _taskFilterState = 0; // 0=all, 1=open, 2=closed
    let _isBizSearched = false;

    // --- Sayfalama ---
    let _pagination = {
        myTasks: 1,
        allTasks: 1,
        reports: 1,
        businesses: 1,
        archive: 1,
        logs: 1,
        pastProjects: 1,
        poolGen: 1,
        poolTeam1: 1,
        poolTeam2: 1,
    };

    // --- Filtrelenmiş Listeler (Sayfalama İçin) ---
    let _filtered = {
        reports: [],
        businesses: [],
        archive: [],
        logs: [],
    };

    // --- Seçim Setleri ---
    let _selectedBizIds = new Set();
    let _selectedPoolIds = new Set();

    // --- Teklif Sepeti ---
    let _offerCart = [];
    let _draftPricingData = null;

    // --- Yükleme Durumu ---
    let _loadedState = {
        users: false, businesses: false, tasks: false,
        notifications: false, projects: false, systemLogs: false,
        categories: false, pricing: false
    };
    let _isSystemReady = false;
    let _isDataSyncing = true;

    // --- Önbellekler ---
    let _bizMapCache = null;
    let _bizMapRevision = -1;
    let _userNameMapCache = null;
    let _userNameMapRevision = -1;
    let _userEmailMapCache = null;
    let _userEmailMapRevision = -1;
    let _assignableUsersCache = null;
    let _assignableUsersRevision = -1;
    let _taskDetailCache = new Map();
    let _businessDetailCache = new Map();

    return {
        // Koleksiyonlar
        get users() { return _users; },
        set users(v) { _users = Array.isArray(v) ? v : []; _collectionRevisions.users += 1; },

        get businesses() { return _businesses; },
        set businesses(v) { _businesses = Array.isArray(v) ? v : []; _collectionRevisions.businesses += 1; this.invalidateBizMapCache(); this.clearBusinessDetailCache(); },

        get tasks() { return _tasks; },
        set tasks(v) { _tasks = Array.isArray(v) ? v : []; _collectionRevisions.tasks += 1; this.invalidateTaskMapCache(); this.clearTaskDetailCache(); },

        get notifications() { return _notifications; },
        set notifications(v) { _notifications = Array.isArray(v) ? v : []; _collectionRevisions.notifications += 1; },

        get projects() { return _projects; },
        set projects(v) { _projects = Array.isArray(v) ? v : []; _collectionRevisions.projects += 1; },

        get systemLogs() { return _systemLogs; },
        set systemLogs(v) { _systemLogs = Array.isArray(v) ? v : []; _collectionRevisions.systemLogs += 1; },

        get dynamicCategories() { return _dynamicCategories; },
        set dynamicCategories(v) { _dynamicCategories = v || {}; _collectionRevisions.categories += 1; },

        get pricingData() { return _pricingData; },
        set pricingData(v) { _pricingData = v || DEFAULT_PRICING_DATA; _collectionRevisions.pricing += 1; },

        // Oturum
        get loggedInUser() { return _loggedInUser; },
        set loggedInUser(v) { _loggedInUser = v; },

        // UI Durumu
        get currentPoolTab() { return _currentPoolTab; },
        set currentPoolTab(v) { _currentPoolTab = v; },

        isOperationalTaskAssignee(assignee) {
            return isOperationalTaskAssignee(assignee, _users);
        },

        isOperationalTaskUser(user) {
            return isOperationalTaskUser(user);
        },

        get pendingFilterActive() { return _pendingFilterActive; },
        set pendingFilterActive(v) { _pendingFilterActive = v; },

        get taskFilterState() { return _taskFilterState; },
        set taskFilterState(v) { _taskFilterState = v; },

        get isBizSearched() { return _isBizSearched; },
        set isBizSearched(v) { _isBizSearched = v; },

        // Sayfalama
        get pagination() { return _pagination; },
        setPage(key, val) { _pagination[key] = val; },

        // Filtrelenmiş listeler
        get filtered() { return _filtered; },
        setFiltered(key, val) { _filtered[key] = val; },

        // Seçimler
        get selectedBizIds() { return _selectedBizIds; },
        get selectedPoolIds() { return _selectedPoolIds; },

        // Teklif
        get offerCart() { return _offerCart; },
        set offerCart(v) { _offerCart = v; },

        get draftPricingData() { return _draftPricingData; },
        set draftPricingData(v) { _draftPricingData = v; },

        // Yükleme
        get loadedState() { return _loadedState; },
        get isSystemReady() { return _isSystemReady; },
        set isSystemReady(v) { _isSystemReady = v; },
        get isDataSyncing() { return _isDataSyncing; },
        set isDataSyncing(v) { _isDataSyncing = v; },
        get collectionRevisions() { return _collectionRevisions; },

        markLoaded(key) {
            _loadedState[key] = true;
        },

        isAllLoaded() {
            const criticalKeys = ['users', 'notifications', 'categories', 'pricing'];
            if (shouldRequireProjectsForCurrentRole()) criticalKeys.push('projects');
            return criticalKeys.every(key => _loadedState[key]);
        },

        resetLoadedState() {
            Object.keys(_loadedState).forEach(k => _loadedState[k] = false);
        },

        getCacheDiagnostics() {
            return {
                revisions: { ..._collectionRevisions },
                counts: {
                    users: _users.length,
                    businesses: _businesses.length,
                    tasks: _tasks.length,
                    notifications: _notifications.length,
                    projects: _projects.length,
                    systemLogs: _systemLogs.length,
                },
                loadedState: { ..._loadedState },
                isSystemReady: _isSystemReady,
                isDataSyncing: _isDataSyncing,
            };
        },

        // --- Önbellek Yönetimi ---
        getBizMap() {
            if (_bizMapCache && _bizMapRevision === _collectionRevisions.businesses) return _bizMapCache;
            _bizMapCache = new Map();
            for (let i = 0; i < _businesses.length; i++) {
                _bizMapCache.set(_businesses[i].id, _businesses[i]);
            }
            _bizMapRevision = _collectionRevisions.businesses;
            return _bizMapCache;
        },

        invalidateBizMapCache() {
            _bizMapCache = null;
            _bizMapRevision = -1;
        },

        getBusinessDetail(id) {
            return _businessDetailCache.get(id) || null;
        },

        setBusinessDetail(id, detail) {
            if (!id || !detail || typeof detail !== 'object') return;
            _businessDetailCache.set(id, detail);
        },

        clearBusinessDetail(id) {
            if (!id) return;
            _businessDetailCache.delete(id);
        },

        clearBusinessDetailCache() {
            _businessDetailCache = new Map();
        },

        getUserNameMap() {
            if (_userNameMapCache && _userNameMapRevision === _collectionRevisions.users) return _userNameMapCache;
            _userNameMapCache = new Map();
            for (let i = 0; i < _users.length; i++) {
                const user = _users[i];
                if (user?.name) _userNameMapCache.set(user.name, user);
            }
            _userNameMapRevision = _collectionRevisions.users;
            return _userNameMapCache;
        },

        getUserEmailMap() {
            if (_userEmailMapCache && _userEmailMapRevision === _collectionRevisions.users) return _userEmailMapCache;
            _userEmailMapCache = new Map();
            for (let i = 0; i < _users.length; i++) {
                const user = _users[i];
                if (user?.email) _userEmailMapCache.set(user.email, user);
            }
            _userEmailMapRevision = _collectionRevisions.users;
            return _userEmailMapCache;
        },

        getAssignableUsers() {
            if (_assignableUsersCache && _assignableUsersRevision === _collectionRevisions.users) return _assignableUsersCache;
            _assignableUsersCache = _users.filter((user) => isOperationalTaskUser(user));
            _assignableUsersRevision = _collectionRevisions.users;
            return _assignableUsersCache;
        },

        invalidateTaskMapCache() {
        },

        getTaskDetail(id) {
            return _taskDetailCache.get(id) || null;
        },

        setTaskDetail(id, detail) {
            if (!id || !detail || typeof detail !== 'object') return;
            _taskDetailCache.set(id, detail);
        },

        clearTaskDetail(id) {
            if (!id) return;
            _taskDetailCache.delete(id);
        },

        clearTaskDetailCache() {
            _taskDetailCache = new Map();
        },

        // --- Oturum Sıfırlama ---
        resetSession() {
            _users = []; _businesses = []; _tasks = []; _notifications = [];
            _projects = []; _systemLogs = [];
            _loggedInUser = null;
            _isSystemReady = false;
            Object.keys(_collectionRevisions).forEach((k) => _collectionRevisions[k] = 0);
            this.resetLoadedState();
            this.invalidateBizMapCache();
            this.invalidateTaskMapCache();
            this.clearBusinessDetailCache();
            this.clearTaskDetailCache();
            _userNameMapCache = null;
            _userNameMapRevision = -1;
            _userEmailMapCache = null;
            _userEmailMapRevision = -1;
            _assignableUsersCache = null;
            _assignableUsersRevision = -1;
        }
    };
})();

// ============================================================
// Geriye dönük uyumluluk — yeni controller'lar AppState.*
// üzerinden erişir, eski bağımlılıklar bu shorthand'ları kullanır.
// ============================================================
Object.defineProperties(window, {
    loggedInUser:      { get() { return AppState.loggedInUser; },      set(v) { AppState.loggedInUser = v; },      configurable: true },
    tasks:             { get() { return AppState.tasks; },             configurable: true },
    businesses:        { get() { return AppState.businesses; },        configurable: true },
    users:             { get() { return AppState.users; },             configurable: true },
    projects:          { get() { return AppState.projects; },          configurable: true },
    dynamicCategories: { get() { return AppState.dynamicCategories; }, set(v) { AppState.dynamicCategories = v; }, configurable: true },
    pricingData:       { get() { return AppState.pricingData; },       set(v) { AppState.pricingData = v; },       configurable: true },
});
