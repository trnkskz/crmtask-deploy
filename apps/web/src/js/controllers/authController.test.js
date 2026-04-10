const { loadController } = require('../testUtils/controllerTestUtils');

describe('AuthController project sync bootstrap', () => {
    afterEach(() => {
        delete global.localStorage;
        delete global.fetch;
    });

    it('runs full snapshot bootstrap immediately after restoring a session from auth/me', async () => {
        global.localStorage = {
            getItem: jest.fn((key) => (key === 'accessToken' ? 'token-1' : null)),
            removeItem: jest.fn(),
            setItem: jest.fn(),
        };
        const elements = {
            'global-loader': { style: {} },
            loadingScreen: { style: {} },
        };
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
                user: {
                    id: 'user-1',
                    name: 'Yonetici',
                    email: 'yonetici@example.com',
                    role: 'MANAGER',
                    team: '-',
                },
            }),
        });

        const bootstrapFullSync = jest.fn().mockResolvedValue(undefined);
        const restoreCachedShell = jest.fn().mockResolvedValue(false);
        const init = jest.fn();

        const { controller, context } = loadController('controllers/authController.js', 'AuthController', {
            localStorage: global.localStorage,
            fetch: global.fetch,
            USER_ROLES: {
                MANAGER: 'Yönetici',
                TEAM_LEAD: 'Takım Lideri',
                SALES_REP: 'Satış Temsilcisi',
            },
            AppState: { loggedInUser: null },
            AppController: { init },
            SyncService: { bootstrapFullSync, restoreCachedShell },
            document: {
                getElementById: jest.fn((id) => elements[id] || null),
            },
            window: {
                __API_BASE_URL__: 'http://localhost:3001/api',
                localStorage: global.localStorage,
            },
            showToast: jest.fn(),
            setTimeout: (fn) => {
                if (typeof fn === 'function') fn();
                return 0;
            },
        });

        await controller.onSystemReady();

        expect(bootstrapFullSync).toHaveBeenCalled();
        expect(restoreCachedShell).toHaveBeenCalled();
        expect(init).toHaveBeenCalled();
        expect(context.AppState.loggedInUser._apiRole).toBe('MANAGER');
        expect(elements.loadingScreen.style.display).toBe('none');
    });

    it('opens immediately from cached shell and refreshes in background', async () => {
        global.localStorage = {
            getItem: jest.fn((key) => (key === 'accessToken' ? 'token-1' : null)),
            removeItem: jest.fn(),
            setItem: jest.fn(),
        };
        const elements = {
            'global-loader': { style: {} },
            loadingScreen: { style: {} },
        };
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
                user: {
                    id: 'user-1',
                    name: 'Yonetici',
                    email: 'yonetici@example.com',
                    role: 'MANAGER',
                    team: '-',
                },
            }),
        });

        const bootstrapFullSync = jest.fn().mockResolvedValue(undefined);
        const restoreCachedShell = jest.fn().mockResolvedValue(true);
        const init = jest.fn();

        const { controller } = loadController('controllers/authController.js', 'AuthController', {
            localStorage: global.localStorage,
            fetch: global.fetch,
            USER_ROLES: {
                MANAGER: 'Yönetici',
                TEAM_LEAD: 'Takım Lideri',
                SALES_REP: 'Satış Temsilcisi',
            },
            AppState: { loggedInUser: null },
            AppController: { init },
            SyncService: { bootstrapFullSync, restoreCachedShell },
            document: {
                getElementById: jest.fn((id) => elements[id] || null),
            },
            window: {
                __API_BASE_URL__: 'http://localhost:3001/api',
                localStorage: global.localStorage,
            },
            showToast: jest.fn(),
            setTimeout: (fn) => {
                if (typeof fn === 'function') fn();
                return 0;
            },
        });

        await controller.onSystemReady();

        expect(restoreCachedShell).toHaveBeenCalled();
        expect(init).toHaveBeenCalled();
        expect(bootstrapFullSync).toHaveBeenCalled();
        expect(elements.loadingScreen.style.display).toBe('none');
    });
});
