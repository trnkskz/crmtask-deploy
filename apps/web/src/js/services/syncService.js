// ============================================================
// services/syncService.js
// API polling + SSE invalidation tabanlı senkronizasyon
// ============================================================

const SyncService = (() => {
    const POLL_MS = 8000;
    const EVENT_STREAM_PATH = '/events/stream';
    const INVALIDATION_DEBOUNCE_MS = 1200;
    const ENTITY_REFRESH_DEBOUNCE_MS = 180;
    const MAX_DIRECT_ENTITY_REFRESHES = 3;
    const LAST_EVENT_ID_STORAGE_KEY = 'crm_last_realtime_event_id_v1';
    const CACHED_SHELL_STORAGE_KEY = 'crm_cached_shell_v1';
    const CACHED_SHELL_SCHEMA_VERSION = 2;
    const CACHED_SHELL_TTL_MS = 60 * 60 * 1000;

    let _refreshTimeout = null;
    let _pollTimer = null;
    let _eventSource = null;
    let _syncInFlight = false;
    let _syncPending = false;
    let _started = false;
    let _invalidateTimer = null;
    let _taskRefreshTimer = null;
    let _businessRefreshTimer = null;
    let _bootstrapPromise = null;
    let _deferredBootstrapPromise = null;
    let _suppressRefreshUntilSettled = false;
    let _refreshQueuedDuringBootstrap = false;
    let _lastRealtimeEventId = 0;

    const _markedKeys = new Set();
    const _pendingCollections = new Set();
    const _pendingTaskRefreshes = new Map();
    const _pendingBusinessRefreshes = new Map();
    const CORE_BOOTSTRAP_COLLECTIONS = ['users', 'notifications', 'categories', 'pricing'];

    function _readStoredLastEventId() {
        try {
            const raw = window?.localStorage?.getItem(LAST_EVENT_ID_STORAGE_KEY) || '';
            const numeric = Number(raw);
            return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
        } catch (_) {
            return 0;
        }
    }

    function _persistLastEventId(nextId) {
        const numeric = Number(nextId);
        if (!Number.isFinite(numeric) || numeric <= 0) return _lastRealtimeEventId;
        _lastRealtimeEventId = Math.max(_lastRealtimeEventId, numeric);
        try {
            window?.localStorage?.setItem(LAST_EVENT_ID_STORAGE_KEY, String(_lastRealtimeEventId));
        } catch (_) {
            // ignore storage failures
        }
        return _lastRealtimeEventId;
    }

    function _clearCachedShellSnapshot() {
        try {
            window?.localStorage?.removeItem(CACHED_SHELL_STORAGE_KEY);
        } catch (_) {
            // ignore storage failures
        }
    }

    function _getCurrentShellIdentity() {
        const user = AppState?.loggedInUser || null;
        const userId = String(user?.id || '').trim();
        const apiRole = String(user?._apiRole || '').trim().toUpperCase();
        if (!userId || !apiRole) return null;
        return { userId, apiRole };
    }

    function _readCachedShellSnapshot() {
        try {
            const identity = _getCurrentShellIdentity();
            if (!identity) return null;
            const raw = window?.localStorage?.getItem(CACHED_SHELL_STORAGE_KEY) || '';
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            const schemaVersion = Number(parsed?.schemaVersion || 0);
            const cachedAt = Number(parsed?.cachedAt || 0);
            const userId = String(parsed?.userId || '').trim();
            const apiRole = String(parsed?.apiRole || '').trim().toUpperCase();
            if (schemaVersion !== CACHED_SHELL_SCHEMA_VERSION) {
                _clearCachedShellSnapshot();
                return null;
            }
            if (!cachedAt || (Date.now() - cachedAt) > CACHED_SHELL_TTL_MS) {
                _clearCachedShellSnapshot();
                return null;
            }
            if (userId !== identity.userId || apiRole !== identity.apiRole) {
                _clearCachedShellSnapshot();
                return null;
            }
            return parsed?.payload && typeof parsed.payload === 'object' ? parsed.payload : null;
        } catch (_) {
            _clearCachedShellSnapshot();
            return null;
        }
    }

    function _persistCachedShellSnapshot() {
        try {
            const identity = _getCurrentShellIdentity();
            if (!identity) return;
            const payload = {
                users: Array.isArray(AppState?.users) ? AppState.users : [],
                notifications: Array.isArray(AppState?.notifications) ? AppState.notifications : [],
                categories: AppState?.dynamicCategories && typeof AppState.dynamicCategories === 'object'
                    ? AppState.dynamicCategories
                    : getCategoryDataFallback(),
                pricing: AppState?.pricingData || DEFAULT_PRICING_DATA,
            };
            if (_canSyncProjects()) {
                payload.projects = Array.isArray(AppState?.projects) ? AppState.projects : [];
            }
            window?.localStorage?.setItem(CACHED_SHELL_STORAGE_KEY, JSON.stringify({
                schemaVersion: CACHED_SHELL_SCHEMA_VERSION,
                cachedAt: Date.now(),
                userId: identity.userId,
                apiRole: identity.apiRole,
                payload,
            }));
        } catch (_) {
            // ignore storage quota or serialization issues
        }
    }

    async function restoreCachedShell() {
        const payload = _readCachedShellSnapshot();
        if (!payload) return false;
        if (Array.isArray(payload.users)) AppState.users = payload.users;
        if (Array.isArray(payload.notifications)) AppState.notifications = payload.notifications;
        if (payload.categories && typeof payload.categories === 'object') AppState.dynamicCategories = payload.categories;
        if (payload.pricing) AppState.pricingData = payload.pricing;
        if (_canSyncProjects() && Array.isArray(payload.projects)) AppState.projects = payload.projects;
        AppState.isSystemReady = true;
        if (typeof DropdownController !== 'undefined') {
            DropdownController.populateMainCategoryDropdowns?.();
            DropdownController.updateAssigneeDropdowns?.();
            DropdownController.populateProjectDropdowns?.();
        }
        return true;
    }

    function _canSyncProjects() {
        if (typeof DataService !== 'undefined' && typeof DataService.canReadProjects === 'function') {
            return DataService.canReadProjects();
        }
        const role = String(AppState?.loggedInUser?._apiRole || '').toUpperCase();
        return role === 'ADMIN' || role === 'MANAGER' || role === 'TEAM_LEADER';
    }

    function _defaultCollections() {
        const base = ['users', 'notifications', 'systemLogs', 'categories', 'pricing'];
        if (_canSyncProjects()) base.push('projects');
        return base;
    }

    function _applySyncResults(resultMap, options = {}) {
        if (resultMap.has('users')) {
            AppState.users = _normalizeCollectionObject(resultMap.get('users'));
            _checkAndMarkLoaded('users');
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

        if (!_suppressRefreshUntilSettled && AppState.isSystemReady && resultMap.has('categories') && typeof DropdownController !== 'undefined') {
            DropdownController.populateMainCategoryDropdowns();
        }

        if (options.markShellReady) {
            AppState.isSystemReady = true;
        }

        if (resultMap.has('users') || resultMap.has('notifications') || resultMap.has('categories') || resultMap.has('pricing') || resultMap.has('projects')) {
            _persistCachedShellSnapshot();
        }

        _debouncedRefresh();
    }

    function _deferredBootstrapCollections() {
        const deferred = ['systemLogs'];
        if (_canSyncProjects()) deferred.push('projects');
        return deferred;
    }

    function startSync() {
        if (_started) return;
        _started = true;
        _startRealtimeInvalidation();
    }

    function _beginBootstrapSettlement() {
        _suppressRefreshUntilSettled = true;
        _refreshQueuedDuringBootstrap = false;
    }

    function _completeBootstrapSettlement() {
        _suppressRefreshUntilSettled = false;
        if (_refreshQueuedDuringBootstrap) {
            _refreshQueuedDuringBootstrap = false;
            _debouncedRefresh();
        }
    }

    function requestSync(collections) {
        _queueSync(collections && collections.length ? collections : _defaultCollections());
    }

    async function bootstrapFullSync() {
        if (_bootstrapPromise) return _bootstrapPromise;
        _bootstrapPromise = (async () => {
            const hadVisibleShell = Boolean(AppState.isSystemReady);
            _beginBootstrapSettlement();
            AppState.resetLoadedState();
            _markedKeys.clear();
            await _runSingleSync(CORE_BOOTSTRAP_COLLECTIONS, { markShellReady: true });
            _startDeferredBootstrap();
            if (!_started) startSync();
            _completeBootstrapSettlement();
            // Cold boot already renders the first page via AppController.init(),
            // so avoid scheduling a second immediate refresh that would re-fetch dashboard data.
            if (hadVisibleShell) {
                _debouncedRefresh();
            }
        })().finally(() => {
            _completeBootstrapSettlement();
            _bootstrapPromise = null;
        });
        return _bootstrapPromise;
    }

    function _startDeferredBootstrap() {
        if (_deferredBootstrapPromise) return _deferredBootstrapPromise;
        const deferredKeys = _deferredBootstrapCollections();
        if (!deferredKeys.length) return Promise.resolve();
        _deferredBootstrapPromise = new Promise((resolve) => {
            setTimeout(async () => {
                try {
                    await _runSingleSync(deferredKeys);
                } finally {
                    resolve();
                    _deferredBootstrapPromise = null;
                }
            }, 0);
        });
        return _deferredBootstrapPromise;
    }

    function _debouncedRefresh(options = {}) {
        const skipViewRefresh = Boolean(options?.skipViewRefresh);
        if (_suppressRefreshUntilSettled) {
            _refreshQueuedDuringBootstrap = true;
            return;
        }
        clearTimeout(_refreshTimeout);
        _refreshTimeout = setTimeout(() => {
            if (AppState.isSystemReady) {
                if (!skipViewRefresh) refreshCurrentView({ silent: true });
                updateNotificationsUI();
            }
        }, 250);
    }

    function _isTaskModalOpen(taskId = '') {
        return document.getElementById('taskModal')?.style?.display === 'flex'
            && String(window?._openTaskModalId || '') === String(taskId || '');
    }

    function _isBusinessModalOpen(businessId = '') {
        return document.getElementById('businessDetailModal')?.style?.display === 'flex'
            && String(window?._openBusinessDetailId || '') === String(businessId || '');
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

    async function _runSingleSync(keys, options = {}) {
        AppState.isDataSyncing = true;
        try {
            const keySet = new Set(keys);
            const pulls = [];
            const pull = (key, path) => {
                if (!keySet.has(key)) return;
                pulls.push(DataService.fetchOnce(path).then((v) => [key, v]));
            };

            pull('users', 'users');
            pull('notifications', 'notifications');
            pull('projects', 'projects');
            pull('systemLogs', 'systemLogs');
            pull('categories', 'categories');
            pull('pricing', 'pricingData');

            const results = await Promise.all(pulls);
            const resultMap = new Map(results);
            _applySyncResults(resultMap, options);
            return true;
        } catch (err) {
            console.warn('Sync failed:', err?.message || err);
            return false;
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
        if (p.includes('/accounts')) return [];
        if (p.includes('/tasks')) return ['notifications'];
        if (p.includes('/projects')) return ['projects'];
        if (p.includes('/users')) return ['users'];
        if (p.includes('/notifications')) return ['notifications'];
        if (p.includes('/pricing')) return ['pricing'];
        if (p.includes('/lov/categories')) return ['categories'];
        const base = ['notifications'];
        if (_canSyncProjects()) base.push('projects');
        return base;
    }

    function _mergeEntityIntoState(collectionKey, entity, cap = 200) {
        if (!entity?.id) return;
        const next = Array.isArray(AppState?.[collectionKey]) ? [...AppState[collectionKey]] : [];
        const index = next.findIndex((item) => item?.id === entity.id);
        if (index >= 0) next[index] = entity;
        else next.unshift(entity);
        AppState[collectionKey] = next.slice(0, cap);
    }

    function _removeEntityFromState(collectionKey, entityId) {
        if (!entityId) return;
        AppState[collectionKey] = (Array.isArray(AppState?.[collectionKey]) ? AppState[collectionKey] : [])
            .filter((item) => item?.id !== entityId);
    }

    function _isTaskVisible(taskId) {
        if (!taskId) return false;
        if ((Array.isArray(AppState?.tasks) ? AppState.tasks : []).some((task) => task?.id === taskId)) return true;
        return document.getElementById('taskModal')?.style?.display === 'flex';
    }

    function _isBusinessVisible(businessId) {
        if (!businessId) return false;
        if ((Array.isArray(AppState?.businesses) ? AppState.businesses : []).some((biz) => biz?.id === businessId)) return true;
        return document.getElementById('businessDetailModal')?.style?.display === 'flex';
    }

    async function _refreshTaskEntityNow(taskId, options = {}) {
        if (!taskId || (!options.force && !_isTaskVisible(taskId))) return;
        let refreshedTask = null;
        try {
            const task = await DataService.readPath(`tasks/${taskId}`, { force: true });
            refreshedTask = task;
            _mergeEntityIntoState('tasks', task);
        } catch (err) {
            if (err?.status === 404 || String(err?.message || '') === 'Task not found') {
                _removeEntityFromState('tasks', taskId);
            } else {
                console.warn('Realtime task refresh failed:', err?.message || err);
                return;
            }
        }
        const taskModalOpen = _isTaskModalOpen(taskId);
        if (taskModalOpen) {
            try {
                if (typeof window?.refreshTaskModalInPlace === 'function') {
                    window.refreshTaskModalInPlace(taskId);
                }
            } catch (err) {
                console.warn('Realtime task modal refresh failed:', err?.message || err);
            }
        }
        const businessId = String(refreshedTask?.businessId || '');
        const businessModalOpen = businessId && _isBusinessModalOpen(businessId);
        if (businessId && businessModalOpen) {
            try {
                if (typeof window?.openBusinessDetailModal === 'function') {
                    await window.openBusinessDetailModal(businessId);
                }
            } catch (err) {
                console.warn('Realtime business detail refresh failed:', err?.message || err);
            }
        }
        _debouncedRefresh({ skipViewRefresh: Boolean(taskModalOpen || businessModalOpen) });
    }

    async function _refreshBusinessEntityNow(businessId, options = {}) {
        if (!businessId || (!options.force && !_isBusinessVisible(businessId))) return;
        try {
            const business = await DataService.readPath(`accounts/${businessId}`, { force: true });
            _mergeEntityIntoState('businesses', business);
        } catch (err) {
            if (err?.status === 404 || String(err?.message || '').toLowerCase().includes('business not found')) {
                _removeEntityFromState('businesses', businessId);
                AppState.tasks = (Array.isArray(AppState.tasks) ? AppState.tasks : [])
                    .filter((task) => task?.businessId !== businessId);
            } else {
                console.warn('Realtime business refresh failed:', err?.message || err);
                return;
            }
        }
        const businessModalOpen = _isBusinessModalOpen(businessId);
        if (businessModalOpen) {
            try {
                if (typeof window?.openBusinessDetailModal === 'function') {
                    await window.openBusinessDetailModal(businessId);
                }
            } catch (err) {
                console.warn('Realtime business modal refresh failed:', err?.message || err);
            }
        }
        _debouncedRefresh({ skipViewRefresh: Boolean(businessModalOpen) });
    }

    function _enqueueEntityRefresh(queue, key, timerRefName, flushFn, options = {}) {
        if (!key) return;
        const existing = queue.get(key) || {};
        queue.set(key, { force: Boolean(existing.force || options.force) });
        if (timerRefName === 'task' && _taskRefreshTimer) return;
        if (timerRefName === 'business' && _businessRefreshTimer) return;
        const timeoutId = setTimeout(() => {
            if (timerRefName === 'task') _taskRefreshTimer = null;
            if (timerRefName === 'business') _businessRefreshTimer = null;
            flushFn().catch((err) => {
                console.warn('Realtime entity queue flush failed:', err?.message || err);
            });
        }, ENTITY_REFRESH_DEBOUNCE_MS);
        if (timerRefName === 'task') _taskRefreshTimer = timeoutId;
        if (timerRefName === 'business') _businessRefreshTimer = timeoutId;
    }

    function _refreshOpenModalsOnce() {
        const openTaskId = String(window?._openTaskModalId || '');
        const openBusinessId = String(window?._openBusinessDetailId || '');
        if (openTaskId) _pendingTaskRefreshes.set(openTaskId, { force: true });
        if (openBusinessId) _pendingBusinessRefreshes.set(openBusinessId, { force: true });
    }

    async function _flushTaskRefreshQueue() {
        const entries = Array.from(_pendingTaskRefreshes.entries());
        _pendingTaskRefreshes.clear();
        if (!entries.length) return;

        const directIds = entries
            .filter(([taskId, options]) => options?.force || _isTaskVisible(taskId))
            .map(([taskId, options]) => ({ taskId, force: Boolean(options?.force) }));

        if (directIds.length === 0) {
            _debouncedRefresh();
            return;
        }

        if (directIds.length > MAX_DIRECT_ENTITY_REFRESHES) {
            const modalTaskId = String(window?._openTaskModalId || '');
            if (modalTaskId && directIds.some((item) => item.taskId === modalTaskId)) {
                await _refreshTaskEntityNow(modalTaskId, { force: true });
            }
            _debouncedRefresh();
            return;
        }

        await Promise.all(directIds.map((item) => _refreshTaskEntityNow(item.taskId, { force: item.force })));
    }

    async function _flushBusinessRefreshQueue() {
        const entries = Array.from(_pendingBusinessRefreshes.entries());
        _pendingBusinessRefreshes.clear();
        if (!entries.length) return;

        const directIds = entries
            .filter(([businessId, options]) => options?.force || _isBusinessVisible(businessId))
            .map(([businessId, options]) => ({ businessId, force: Boolean(options?.force) }));

        if (directIds.length === 0) {
            _debouncedRefresh();
            return;
        }

        if (directIds.length > MAX_DIRECT_ENTITY_REFRESHES) {
            const modalBusinessId = String(window?._openBusinessDetailId || '');
            if (modalBusinessId && directIds.some((item) => item.businessId === modalBusinessId)) {
                await _refreshBusinessEntityNow(modalBusinessId, { force: true });
            }
            _debouncedRefresh();
            return;
        }

        await Promise.all(directIds.map((item) => _refreshBusinessEntityNow(item.businessId, { force: item.force })));
    }

    async function _refreshTaskEntity(taskId, options = {}) {
        _enqueueEntityRefresh(_pendingTaskRefreshes, taskId, 'task', _flushTaskRefreshQueue, options);
    }

    async function _refreshBusinessEntity(businessId, options = {}) {
        _enqueueEntityRefresh(_pendingBusinessRefreshes, businessId, 'business', _flushBusinessRefreshQueue, options);
    }

    async function _applyRealtimeDelta(payload = null) {
        const type = String(payload?.type || '').trim().toUpperCase();
        if (!type) return false;
        if (type === 'SYNC_REQUIRED') {
            _queueSync(_defaultCollections());
            const openTaskId = String(window?._openTaskModalId || '');
            const openBusinessId = String(window?._openBusinessDetailId || '');
            if (openTaskId) _refreshTaskEntity(openTaskId, { force: true }).catch(() => {});
            if (openBusinessId) _refreshBusinessEntity(openBusinessId, { force: true }).catch(() => {});
            _debouncedRefresh({ skipViewRefresh: Boolean(openTaskId || openBusinessId) });
            return true;
        }
        if (type === 'TASK_UPDATED') {
            if (payload?.task?.id) {
                _mergeEntityIntoState('tasks', payload.task);
                _refreshOpenModalsOnce();
                _debouncedRefresh({ skipViewRefresh: Boolean(_isTaskModalOpen(payload.task.id) || _isBusinessModalOpen(payload.task.businessId || '')) });
                return true;
            }
            await _refreshTaskEntity(String(payload?.taskId || ''));
            return true;
        }
        if (type === 'TASK_DELETED') {
            _removeEntityFromState('tasks', String(payload?.taskId || ''));
            _debouncedRefresh();
            return true;
        }
        if (type === 'ACCOUNT_UPDATED') {
            if (payload?.account?.id) {
                _mergeEntityIntoState('businesses', payload.account);
                _refreshOpenModalsOnce();
                _debouncedRefresh({ skipViewRefresh: Boolean(_isBusinessModalOpen(payload.account.id)) });
                return true;
            }
            await _refreshBusinessEntity(String(payload?.accountId || ''));
            return true;
        }
        if (type === 'ACCOUNT_DELETED') {
            const accountId = String(payload?.accountId || '');
            _removeEntityFromState('businesses', accountId);
            AppState.tasks = (Array.isArray(AppState.tasks) ? AppState.tasks : [])
                .filter((task) => task?.businessId !== accountId);
            _debouncedRefresh();
            return true;
        }
        if (type === 'NOTIFICATIONS_CHANGED') {
            _queueSync(['notifications']);
            return true;
        }
        if (type === 'USERS_CHANGED') {
            _queueSync(['users']);
            return true;
        }
        if (type === 'PROJECTS_CHANGED') {
            _queueSync(['projects']);
            return true;
        }
        if (type === 'CATEGORIES_CHANGED') {
            _queueSync(['categories']);
            return true;
        }
        if (type === 'PRICING_CHANGED') {
            _queueSync(['pricing']);
            return true;
        }
        return false;
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
            const keys = ['notifications'];
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
            _lastRealtimeEventId = _readStoredLastEventId();
            const url = new URL(`${DataService.getApiBase()}${EVENT_STREAM_PATH}`);
            const identity = _getRealtimeIdentity();
            if (identity) {
                url.searchParams.set('u', identity.id);
                url.searchParams.set('role', identity.role);
            }
            if (_lastRealtimeEventId > 0) {
                url.searchParams.set('lastEventId', String(_lastRealtimeEventId));
            }

            _eventSource = new EventSource(url.toString());
            _eventSource.onopen = () => {
                _stopPollingFallback();
            };
            _eventSource.onmessage = (evt) => {
                const raw = String(evt?.data || '');
                if (!raw || raw.startsWith(':')) return;
                const incomingEventId = Number(evt?.lastEventId || 0);
                if (Number.isFinite(incomingEventId) && incomingEventId > 0) {
                    if (_lastRealtimeEventId > 0 && incomingEventId <= _lastRealtimeEventId) {
                        return;
                    }
                    _persistLastEventId(incomingEventId);
                }
                let payload = null;
                try { payload = JSON.parse(raw); } catch { payload = null; }
                _applyRealtimeDelta(payload).then((handled) => {
                    if (handled) return;
                    const keys = _collectionsFromPath(payload?.path || '');
                    if (keys.length > 0) _queueSync(keys);
                }).catch((err) => {
                    console.warn('Realtime delta apply failed:', err?.message || err);
                });
            };
            _eventSource.onerror = () => {
                _startPollingFallback();
            };
        } catch {
            _startPollingFallback();
        }
    }

    return { startSync, requestSync, bootstrapFullSync, restoreCachedShell };
})();
