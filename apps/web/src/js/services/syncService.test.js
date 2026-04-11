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
