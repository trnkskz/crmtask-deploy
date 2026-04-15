const { loadController } = require('../testUtils/controllerTestUtils');

describe('SyncService bootstrap', () => {
    it('loads shell collections first and defers secondary collections', async () => {
        const fetchCalls = [];
        const fetchOnce = jest.fn(async (path) => {
            fetchCalls.push(path);
            if (path === 'pricingData') return {};
            if (path === 'categories') return {};
            return [];
        });

        const { controller } = loadController('services/syncService.js', 'SyncService', {
            AppState: {
                loggedInUser: { _apiRole: 'MANAGER' },
                resetLoadedState: jest.fn(),
                markLoaded: jest.fn(),
                isAllLoaded: jest.fn(() => false),
                isSystemReady: false,
                isDataSyncing: false,
                set users(v) { this._users = v; },
                set notifications(v) { this._notifications = v; },
                set projects(v) { this._projects = v; },
                set systemLogs(v) { this._systemLogs = v; },
                set dynamicCategories(v) { this._categories = v; },
                set pricingData(v) { this._pricing = v; },
            },
            DataService: { fetchOnce, getApiBase: () => 'http://localhost:3001/api' },
            DropdownController: {},
            getCategoryDataFallback: () => ({}),
            DEFAULT_PRICING_DATA: {},
            refreshCurrentView: jest.fn(),
            updateNotificationsUI: jest.fn(),
            setTimeout: (fn) => {
                if (typeof fn === 'function') fn();
                return 0;
            },
            clearTimeout: jest.fn(),
            setInterval: jest.fn(() => 1),
            clearInterval: jest.fn(),
            window: {},
            EventSource: undefined,
        });

        await controller.bootstrapFullSync();

        expect(fetchCalls.slice(0, 4)).toEqual(['users', 'notifications', 'categories', 'pricingData']);
        expect(fetchCalls).not.toContain('businesses');
        expect(fetchCalls).not.toContain('tasks');
        expect(fetchCalls).toContain('projects');
        expect(fetchCalls).toContain('systemLogs');
    });
});

describe('SyncService realtime catch-up', () => {
    it('reconnects with the last stored event id and persists newer event ids', () => {
        const storage = new Map([['crm_last_realtime_event_id_v1', '42']]);
        class FakeEventSource {
            constructor(url) {
                this.url = url;
                FakeEventSource.instances.push(this);
            }
        }
        FakeEventSource.instances = [];

        const { controller } = loadController('services/syncService.js', 'SyncService', {
            AppState: {
                loggedInUser: { _apiRole: 'MANAGER', id: 'user-1' },
            },
            DataService: { getApiBase: () => 'http://localhost:3001/api' },
            localStorage: {
                getItem: jest.fn((key) => storage.get(key) || null),
                setItem: jest.fn((key, value) => storage.set(key, String(value))),
            },
            refreshCurrentView: jest.fn(),
            updateNotificationsUI: jest.fn(),
            setTimeout: jest.fn(() => 1),
            clearTimeout: jest.fn(),
            setInterval: jest.fn(() => 1),
            clearInterval: jest.fn(),
            URL,
            window: { localStorage: {
                getItem: jest.fn((key) => storage.get(key) || null),
                setItem: jest.fn((key, value) => storage.set(key, String(value))),
            } },
            EventSource: FakeEventSource,
        });

        controller.startSync();

        expect(FakeEventSource.instances).toHaveLength(1);
        expect(FakeEventSource.instances[0].url).toContain('lastEventId=42');

        FakeEventSource.instances[0].onmessage({
            data: JSON.stringify({ type: 'NOTIFICATIONS_CHANGED' }),
            lastEventId: '43',
        });

        expect(storage.get('crm_last_realtime_event_id_v1')).toBe('43');
    });

    it('restores cached shell collections without waiting for the network', async () => {
        const storage = new Map([['crm_cached_shell_v1', JSON.stringify({
            schemaVersion: 2,
            cachedAt: Date.now(),
            userId: 'user-1',
            apiRole: 'MANAGER',
            payload: {
                users: [{ id: 'u1', name: 'Turan' }],
                notifications: [{ id: 'n1' }],
                categories: { Ana: ['Alt'] },
                pricing: { base: 1 },
                projects: [{ id: 'p1', name: 'Proje' }],
            },
        })]]);
        const appState = {
            loggedInUser: { _apiRole: 'MANAGER', id: 'user-1' },
            isSystemReady: false,
            set users(v) { this._users = v; },
            set notifications(v) { this._notifications = v; },
            set dynamicCategories(v) { this._categories = v; },
            set pricingData(v) { this._pricing = v; },
            set projects(v) { this._projects = v; },
        };

        const { controller } = loadController('services/syncService.js', 'SyncService', {
            AppState: appState,
            DataService: { getApiBase: () => 'http://localhost:3001/api' },
            localStorage: {
                getItem: jest.fn((key) => storage.get(key) || null),
                setItem: jest.fn((key, value) => storage.set(key, String(value))),
                removeItem: jest.fn((key) => storage.delete(key)),
            },
            refreshCurrentView: jest.fn(),
            updateNotificationsUI: jest.fn(),
            getCategoryDataFallback: () => ({}),
            DEFAULT_PRICING_DATA: {},
            DropdownController: {
                populateMainCategoryDropdowns: jest.fn(),
                updateAssigneeDropdowns: jest.fn(),
                populateProjectDropdowns: jest.fn(),
            },
            window: { localStorage: {
                getItem: jest.fn((key) => storage.get(key) || null),
                setItem: jest.fn((key, value) => storage.set(key, String(value))),
                removeItem: jest.fn((key) => storage.delete(key)),
            } },
            setTimeout: jest.fn(() => 1),
            clearTimeout: jest.fn(),
            setInterval: jest.fn(() => 1),
            clearInterval: jest.fn(),
            EventSource: undefined,
        });

        const restored = await controller.restoreCachedShell();

        expect(restored).toBe(true);
        expect(appState.isSystemReady).toBe(true);
        expect(appState._users).toEqual([{ id: 'u1', name: 'Turan' }]);
        expect(appState._projects).toEqual([{ id: 'p1', name: 'Proje' }]);
    });

    it('rejects cached shell snapshots that belong to a different user and clears them', async () => {
        const storage = new Map([['crm_cached_shell_v1', JSON.stringify({
            schemaVersion: 2,
            cachedAt: Date.now(),
            userId: 'someone-else',
            apiRole: 'MANAGER',
            payload: {
                users: [{ id: 'u1', name: 'Yanlis' }],
            },
        })]]);
        const removeItem = jest.fn((key) => storage.delete(key));
        const appState = {
            loggedInUser: { _apiRole: 'MANAGER', id: 'user-1' },
            isSystemReady: false,
            set users(v) { this._users = v; },
        };

        const { controller } = loadController('services/syncService.js', 'SyncService', {
            AppState: appState,
            DataService: { getApiBase: () => 'http://localhost:3001/api' },
            localStorage: {
                getItem: jest.fn((key) => storage.get(key) || null),
                setItem: jest.fn((key, value) => storage.set(key, String(value))),
                removeItem,
            },
            refreshCurrentView: jest.fn(),
            updateNotificationsUI: jest.fn(),
            getCategoryDataFallback: () => ({}),
            DEFAULT_PRICING_DATA: {},
            DropdownController: {},
            window: { localStorage: {
                getItem: jest.fn((key) => storage.get(key) || null),
                setItem: jest.fn((key, value) => storage.set(key, String(value))),
                removeItem,
            } },
            setTimeout: jest.fn(() => 1),
            clearTimeout: jest.fn(),
            setInterval: jest.fn(() => 1),
            clearInterval: jest.fn(),
            EventSource: undefined,
        });

        const restored = await controller.restoreCachedShell();

        expect(restored).toBe(false);
        expect(removeItem).toHaveBeenCalledWith('crm_cached_shell_v1');
        expect(appState._users).toBeUndefined();
    });
});
