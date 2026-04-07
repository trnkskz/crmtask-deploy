// ============================================================
// services/syncService.js
// API polling + SSE invalidation tabanlı senkronizasyon
// ============================================================

const SyncService = (() => {
    const POLL_MS = 8000;
    const EVENT_STREAM_PATH = '/events/stream';
    const INVALIDATION_DEBOUNCE_MS = 1200;

    let _refreshTimeout = null;
    let _pollTimer = null;
    let _eventSource = null;
    let _syncInFlight = false;
    let _syncPending = false;
    let _started = false;
    let _invalidateTimer = null;
    let _bootstrapPromise = null;

    const _markedKeys = new Set();
    const _pendingCollections = new Set();

    function _canSyncProjects() {
        if (typeof DataService !== 'undefined' && typeof DataService.canReadProjects === 'function') {
            return DataService.canReadProjects();
        }
        const role = String(AppState?.loggedInUser?._apiRole || '').toUpperCase();
        return role === 'ADMIN' || role === 'MANAGER' || role === 'TEAM_LEADER';
    }

    function _defaultCollections() {
        const base = ['users', 'businesses', 'tasks', 'notifications', 'systemLogs', 'categories', 'pricing'];
        if (_canSyncProjects()) base.push('projects');
        return base;
    }

    function startSync() {
        if (_started) return;
        _started = true;
        _startRealtimeInvalidation();
    }

    function requestSync(collections) {
        _queueSync(collections && collections.length ? collections : _defaultCollections());
    }

    async function bootstrapFullSync() {
        if (_bootstrapPromise) return _bootstrapPromise;
        _bootstrapPromise = (async () => {
            AppState.resetLoadedState();
            _markedKeys.clear();
            await _runSingleSync(_defaultCollections());
            if (typeof AppState.warmDerivedCaches === 'function') {
                AppState.warmDerivedCaches(_defaultCollections());
            }
            if (!_started) startSync();
        })().finally(() => {
            _bootstrapPromise = null;
        });
        return _bootstrapPromise;
    }

    function _debouncedRefresh() {
        clearTimeout(_refreshTimeout);
        _refreshTimeout = setTimeout(() => {
            if (AppState.isSystemReady) {
                refreshCurrentView();
                updateNotificationsUI();
            }
        }, 250);
    }

    function _normalizeCollectionObject(obj) {
        if (!obj || typeof obj !== 'object') return [];
        return Object.values(obj);
    }

    function _queueSync(collections) {
        (collections || []).forEach((c) => _pendingCollections.add(c));
        if (_invalidateTimer) return;
        _invalidateTimer = setTimeout(() => {
            _invalidateTimer = null;
            _syncNow();
        }, INVALIDATION_DEBOUNCE_MS);
    }

    async function _syncNow() {
        if (_syncInFlight) {
            _syncPending = true;
            return;
        }

        _syncInFlight = true;
        try {
            do {
                _syncPending = false;
                const keys = _pendingCollections.size
                    ? Array.from(_pendingCollections)
                    : _defaultCollections();
                _pendingCollections.clear();
                await _runSingleSync(keys);
            } while (_syncPending);
        } finally {
            _syncInFlight = false;
        }
    }

    async function _runSingleSync(keys) {
        AppState.isDataSyncing = true;
        try {
            const keySet = new Set(keys);
            const pulls = [];
            const pull = (key, path) => {
                if (!keySet.has(key)) return;
                pulls.push(DataService.fetchOnce(path).then((v) => [key, v]));
            };

            pull('users', 'users');
            pull('businesses', 'businesses');
            pull('tasks', 'tasks');
            pull('notifications', 'notifications');
            pull('projects', 'projects');
            pull('systemLogs', 'systemLogs');
            pull('categories', 'categories');
            pull('pricing', 'pricingData');

            const results = await Promise.all(pulls);
            const resultMap = new Map(results);

            if (resultMap.has('users')) {
                AppState.users = _normalizeCollectionObject(resultMap.get('users'));
                _checkAndMarkLoaded('users');
            }
            if (resultMap.has('businesses')) {
                AppState.businesses = _normalizeCollectionObject(resultMap.get('businesses'));
                _checkAndMarkLoaded('businesses');
            }
            if (resultMap.has('tasks')) {
                AppState.tasks = _normalizeCollectionObject(resultMap.get('tasks'));
                _checkAndMarkLoaded('tasks');
            }
            if (resultMap.has('notifications')) {
                AppState.notifications = _normalizeCollectionObject(resultMap.get('notifications'));
                _checkAndMarkLoaded('notifications');
            }
            if (resultMap.has('projects')) {
                AppState.projects = _normalizeCollectionObject(resultMap.get('projects'));
                _checkAndMarkLoaded('projects');
            }
            if (resultMap.has('systemLogs')) {
                AppState.systemLogs = _normalizeCollectionObject(resultMap.get('systemLogs')).sort((a, b) => {
                    return new Date(b?.createdAt || b?.date || 0) - new Date(a?.createdAt || a?.date || 0);
                });
                _checkAndMarkLoaded('systemLogs');
            }
            if (resultMap.has('categories')) {
                const categoriesRaw = resultMap.get('categories');
                AppState.dynamicCategories = (categoriesRaw && typeof categoriesRaw === 'object') ? categoriesRaw : getCategoryDataFallback();
                _checkAndMarkLoaded('categories');
            }
            if (resultMap.has('pricing')) {
                AppState.pricingData = resultMap.get('pricing') || DEFAULT_PRICING_DATA;
                _checkAndMarkLoaded('pricing');
            }

            if (AppState.isSystemReady && resultMap.has('categories') && typeof DropdownController !== 'undefined') {
                DropdownController.populateMainCategoryDropdowns();
            }

            if (typeof AppState.warmDerivedCaches === 'function') {
                AppState.warmDerivedCaches(Array.from(resultMap.keys()));
            }

            _debouncedRefresh();
        } catch (err) {
            console.warn('Sync failed:', err?.message || err);
        } finally {
            AppState.isDataSyncing = false;
        }
    }

    function _checkAndMarkLoaded(key) {
        if (_markedKeys.has(key)) return;
        _markedKeys.add(key);
        AppState.markLoaded(key);

        if (!AppState.isSystemReady && AppState.isAllLoaded()) AppState.isSystemReady = true;
    }

    function _collectionsFromPath(path) {
        const p = String(path || '').toLowerCase();
        if (p.includes('/accounts')) return ['businesses', 'tasks'];
        if (p.includes('/tasks')) return ['tasks', 'notifications', 'businesses'];
        if (p.includes('/projects')) return ['projects', 'tasks'];
        if (p.includes('/users')) return ['users'];
        if (p.includes('/notifications')) return ['notifications'];
        if (p.includes('/pricing')) return ['pricing'];
        if (p.includes('/lov/categories')) return ['categories'];
        const base = ['businesses', 'tasks', 'notifications'];
        if (_canSyncProjects()) base.push('projects');
        return base;
    }

    function _getRealtimeIdentity() {
        const stateUser = (typeof AppState !== 'undefined' && AppState?.loggedInUser) ? AppState.loggedInUser : null;
        const id = localStorage.getItem('userId') || localStorage.getItem('devUserId') || stateUser?.id || '';
        const role = localStorage.getItem('userRole') || localStorage.getItem('devRole') || stateUser?._apiRole || '';
        if (!id || !role) return null;
        return { id, role };
    }

    function _startPollingFallback() {
        if (_pollTimer) return;
        _pollTimer = setInterval(() => {
            const keys = ['businesses', 'tasks', 'notifications'];
            if (_canSyncProjects()) keys.push('projects');
            _queueSync(keys);
        }, POLL_MS);
    }

    function _stopPollingFallback() {
        if (!_pollTimer) return;
        clearInterval(_pollTimer);
        _pollTimer = null;
    }

    function _startRealtimeInvalidation() {
        if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
            _startPollingFallback();
            return;
        }

        try {
            const url = new URL(`${DataService.getApiBase()}${EVENT_STREAM_PATH}`);
            const identity = _getRealtimeIdentity();
            if (identity) {
                url.searchParams.set('u', identity.id);
                url.searchParams.set('role', identity.role);
            }

            _eventSource = new EventSource(url.toString());
            _eventSource.onopen = () => {
                _stopPollingFallback();
            };
            _eventSource.onmessage = (evt) => {
                const raw = String(evt?.data || '');
                if (!raw || raw.startsWith(':')) return;
                let payload = null;
                try { payload = JSON.parse(raw); } catch { payload = null; }
                const keys = _collectionsFromPath(payload?.path || '');
                _queueSync(keys);
            };
            _eventSource.onerror = () => {
                _startPollingFallback();
            };
        } catch {
            _startPollingFallback();
        }
    }

    return { startSync, requestSync, bootstrapFullSync };
})();
