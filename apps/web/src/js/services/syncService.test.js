const { loadController } = require('../testUtils/controllerTestUtils');

describe('SyncService cache warm-up', () => {
    it('warms derived caches after full snapshot bootstrap', async () => {
        const fetchOnce = jest.fn(async (path) => {
            if (path === 'pricingData') return {};
            if (path === 'categories') return {};
            return [];
        });
        const warmDerivedCaches = jest.fn();

        const { controller } = loadController('services/syncService.js', 'SyncService', {
            AppState: {
                loggedInUser: { _apiRole: 'MANAGER' },
                resetLoadedState: jest.fn(),
                markLoaded: jest.fn(),
                isAllLoaded: jest.fn(() => false),
                isSystemReady: false,
                isDataSyncing: false,
                warmDerivedCaches,
                set users(v) { this._users = v; },
                set businesses(v) { this._businesses = v; },
                set tasks(v) { this._tasks = v; },
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

        expect(warmDerivedCaches).toHaveBeenCalled();
        expect(warmDerivedCaches.mock.calls[0][0]).toContain('tasks');
        expect(warmDerivedCaches.mock.calls[0][0]).toContain('projects');
    });
});
