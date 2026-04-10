// ============================================================
// services/syncService.js
// API polling + SSE invalidation tabanlı senkronizasyon
// ============================================================

const SyncService = (() => {
    const POLL_MS = 8000;
    const EVENT_STREAM_PATH = '/events/stream';
    const INVALIDATION_DEBOUNCE_MS = 1200;
    const SNAPSHOT_DB_NAME = 'crm-shell-cache-v2';
    const SNAPSHOT_STORE_NAME = 'snapshots';
    const SNAPSHOT_KEY_PREFIX = 'core-shell';
    const SNAPSHOT_SCHEMA_VERSION = 3;
    const SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

    let _refreshTimeout = null;
    let _pollTimer = null;
    let _eventSource = null;
    let _syncInFlight = false;
    let _syncPending = false;
    let _started = false;
    let _invalidateTimer = null;
    let _bootstrapPromise = null;
    let _deferredBootstrapPromise = null;
    let _suppressRefreshUntilSettled = false;
    let _refreshQueuedDuringBootstrap = false;

    const _markedKeys = new Set();
    const _pendingCollections = new Set();
    const CORE_BOOTSTRAP_COLLECTIONS = ['users', 'businesses', 'tasks', 'notifications', 'categories'];

    function _serializeBusinessSummary(business) {
        const item = business && typeof business === 'object' ? business : {};
        return {
            id: item.id || '',
            companyName: item.companyName || item.businessName || '',
            businessName: item.businessName || item.companyName || '',
            businessStatus: item.businessStatus || 'Aktif',
            sourceType: item.sourceType || 'Fresh Account',
            accountType: item.accountType || 'KEY',
            mainCategory: item.mainCategory || '',
            subCategory: item.subCategory || '',
            city: item.city || '',
            district: item.district || '',
            address: item.address || '',
            contactPhone: item.contactPhone || '',
            contactName: item.contactName || '',
            contactEmail: item.contactEmail || '',
            website: item.website || '',
            instagram: item.instagram || '',
            campaignUrl: item.campaignUrl || '',
            notes: item.notes || '',
            createdAt: item.createdAt || new Date().toISOString(),
        };
    }

    function _serializeTaskSummary(task) {
        const item = task && typeof task === 'object' ? task : {};
        const latestLog = Array.isArray(item.logs) && item.logs[0]
            ? {
                id: item.logs[0].id || '',
                date: item.logs[0].date || '',
                user: item.logs[0].user || 'Sistem',
                text: item.logs[0].text || '',
            }
            : null;
        return {
            id: item.id || '',
            businessId: item.businessId || '',
            projectId: item.projectId || '',
            assignee: item.assignee || 'UNASSIGNED',
            ownerId: item.ownerId || null,
            createdById: item.createdById || null,
            creationChannel: item.creationChannel || 'UNKNOWN',
            creationChannelLabel: item.creationChannelLabel || 'Bilinmiyor',
            status: item.status || 'new',
            mainCategory: item.mainCategory || '',
            subCategory: item.subCategory || '',
            sourceType: item.sourceType || 'Fresh Account',
            details: item.details || '',
            specificContactName: item.specificContactName || '',
            specificContactPhone: item.specificContactPhone || '',
            specificContactEmail: item.specificContactEmail || '',
            specificCampaignUrl: item.specificCampaignUrl || '',
            nextCallDate: item.nextCallDate || '',
            logs: latestLog ? [latestLog] : [],
            offers: [],
            dealDetails: item.dealDetails || null,
            createdAt: item.createdAt || new Date().toISOString(),
        };
    }

    function _getSnapshotIdentity(user = AppState?.loggedInUser) {
        const userId = String(user?.id || '').trim();
        if (!userId) return '';
        return `${SNAPSHOT_KEY_PREFIX}:${userId}`;
    }

    function _openSnapshotDb() {
        return new Promise((resolve) => {
            try {
                const indexedDb = window?.indexedDB;
                if (!indexedDb) {
                    resolve(null);
                    return;
                }

                const request = indexedDb.open(SNAPSHOT_DB_NAME, 1);
                request.onupgradeneeded = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains(SNAPSHOT_STORE_NAME)) {
                        db.createObjectStore(SNAPSHOT_STORE_NAME, { keyPath: 'key' });
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(null);
            } catch (_) {
                resolve(null);
            }
        });
    }

    async function _readSnapshot(key) {
        if (!key) return null;
        const db = await _openSnapshotDb();
        if (!db) return null;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(SNAPSHOT_STORE_NAME, 'readonly');
                const store = tx.objectStore(SNAPSHOT_STORE_NAME);
                const request = store.get(key);
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => resolve(null);
                tx.oncomplete = () => db.close();
                tx.onerror = () => db.close();
            } catch (_) {
                try { db.close(); } catch {}
                resolve(null);
            }
        });
    }

    async function _writeSnapshot(record) {
        if (!record?.key) return false;
        const db = await _openSnapshotDb();
        if (!db) return false;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(SNAPSHOT_STORE_NAME, 'readwrite');
                const store = tx.objectStore(SNAPSHOT_STORE_NAME);
                store.put(record);
                tx.oncomplete = () => {
                    db.close();
                    resolve(true);
                };
                tx.onerror = () => {
                    db.close();
                    resolve(false);
                };
            } catch (_) {
                try { db.close(); } catch {}
                resolve(false);
            }
        });
    }

    async function _deleteSnapshot(key) {
        if (!key) return false;
        const db = await _openSnapshotDb();
        if (!db) return false;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(SNAPSHOT_STORE_NAME, 'readwrite');
                const store = tx.objectStore(SNAPSHOT_STORE_NAME);
                store.delete(key);
                tx.oncomplete = () => {
                    db.close();
                    resolve(true);
                };
                tx.onerror = () => {
                    db.close();
                    resolve(false);
                };
            } catch (_) {
                try { db.close(); } catch {}
                resolve(false);
            }
        });
    }

    function _isPrivilegedRole(user = AppState?.loggedInUser) {
        const role = String(user?._apiRole || '').toUpperCase();
        return role === 'ADMIN' || role === 'MANAGER' || role === 'TEAM_LEADER';
    }

    async function _persistCoreSnapshot() {
        const key = _getSnapshotIdentity();
        if (!key) return false;
        return _writeSnapshot({
            key,
            schemaVersion: SNAPSHOT_SCHEMA_VERSION,
            updatedAt: new Date().toISOString(),
            role: String(AppState?.loggedInUser?._apiRole || ''),
            data: {
                users: Array.isArray(AppState.users) ? AppState.users : [],
                businesses: Array.isArray(AppState.businesses) ? AppState.businesses.map(_serializeBusinessSummary) : [],
                tasks: Array.isArray(AppState.tasks) ? AppState.tasks.map(_serializeTaskSummary) : [],
                notifications: Array.isArray(AppState.notifications) ? AppState.notifications : [],
                categories: AppState.dynamicCategories && typeof AppState.dynamicCategories === 'object'
                    ? AppState.dynamicCategories
                    : getCategoryDataFallback(),
            },
        });
    }

    async function restoreCachedShell(user = AppState?.loggedInUser) {
        const key = _getSnapshotIdentity(user);
        const snapshot = await _readSnapshot(key);
        const data = snapshot?.data;
        const snapshotAgeMs = snapshot?.updatedAt ? (Date.now() - new Date(snapshot.updatedAt).getTime()) : Number.POSITIVE_INFINITY;
        if (
            !snapshot
            || Number(snapshot.schemaVersion || 0) !== SNAPSHOT_SCHEMA_VERSION
            || !Number.isFinite(snapshotAgeMs)
            || snapshotAgeMs > SNAPSHOT_MAX_AGE_MS
            || String(snapshot.role || '') !== String(user?._apiRole || '')
        ) {
            await _deleteSnapshot(key);
            return false;
        }
        if (!data || !Array.isArray(data.tasks) || !Array.isArray(data.businesses)) {
            return false;
        }
        const users = Array.isArray(data.users) ? data.users : [];
        const businesses = Array.isArray(data.businesses) ? data.businesses : [];
        const tasks = Array.isArray(data.tasks) ? data.tasks : [];
        const notifications = Array.isArray(data.notifications) ? data.notifications : [];
        const categories = (data.categories && typeof data.categories === 'object')
            ? data.categories
            : getCategoryDataFallback();

        if (_isPrivilegedRole(user) && (users.length === 0 || businesses.length === 0 || tasks.length === 0)) {
            await _deleteSnapshot(key);
            return false;
        }

        AppState.users = users;
        AppState.businesses = businesses;
        AppState.tasks = tasks;
        AppState.notifications = notifications;
        AppState.dynamicCategories = categories;

        AppState.resetLoadedState();
        CORE_BOOTSTRAP_COLLECTIONS.forEach((key) => AppState.markLoaded(key));
        if (typeof AppState.warmDerivedCaches === 'function') {
            AppState.warmDerivedCaches(CORE_BOOTSTRAP_COLLECTIONS);
        }
        AppState.isSystemReady = true;
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
        const base = ['users', 'businesses', 'tasks', 'notifications', 'systemLogs', 'categories', 'pricing'];
        if (_canSyncProjects()) base.push('projects');
        return base;
    }

    function _deferredBootstrapCollections() {
        const deferred = ['systemLogs', 'pricing'];
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
            const coreSyncSucceeded = await _runSingleSync(CORE_BOOTSTRAP_COLLECTIONS, { markShellReady: true });
            if (coreSyncSucceeded) {
                await _persistCoreSnapshot();
            }
            if (typeof AppState.warmDerivedCaches === 'function') {
                AppState.warmDerivedCaches(CORE_BOOTSTRAP_COLLECTIONS);
            }
            await _startDeferredBootstrap();
            if (!_started) startSync();
            _completeBootstrapSettlement();
            if (!hadVisibleShell) {
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
                    if (typeof AppState.warmDerivedCaches === 'function') {
                        AppState.warmDerivedCaches(deferredKeys);
                    }
                } finally {
                    resolve();
                    _deferredBootstrapPromise = null;
                }
            }, 0);
        });
        return _deferredBootstrapPromise;
    }

    function _debouncedRefresh() {
        if (_suppressRefreshUntilSettled) {
            _refreshQueuedDuringBootstrap = true;
            return;
        }
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

            if (!_suppressRefreshUntilSettled && AppState.isSystemReady && resultMap.has('categories') && typeof DropdownController !== 'undefined') {
                DropdownController.populateMainCategoryDropdowns();
            }

            if (typeof AppState.warmDerivedCaches === 'function') {
                AppState.warmDerivedCaches(Array.from(resultMap.keys()));
            }

            if (options.markShellReady) {
                AppState.isSystemReady = true;
            }

            _debouncedRefresh();
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

    return { startSync, requestSync, bootstrapFullSync, restoreCachedShell };
})();
