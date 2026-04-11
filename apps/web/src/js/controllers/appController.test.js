const { loadController, createDocument, createElement } = require('../testUtils/controllerTestUtils');

describe('AppController notifications', () => {
    function createStorage() {
        const state = new Map();
        return {
            getItem(key) {
                return state.has(key) ? state.get(key) : null;
            },
            setItem(key, value) {
                state.set(key, String(value));
            },
            removeItem(key) {
                state.delete(key);
            },
        };
    }

    it('builds dynamic notifications from backend task reports', async () => {
        const elements = {
            notifList: createElement(),
            notifBadge: createElement({ style: {} }),
        };
        const document = createDocument(elements);

        const RealDate = Date;
        class FixedDate extends RealDate {
            constructor(...args) {
                if (args.length === 0) {
                    super('2026-04-06T12:00:00.000Z');
                    return;
                }
                super(...args);
            }

            static now() {
                return new RealDate('2026-04-06T12:00:00.000Z').getTime();
            }
        }

        const staleTask = {
            id: 'task-1',
            businessId: 'biz-1',
            assignee: 'Ayse',
            status: 'followup',
            createdAt: '2026-04-01T10:00:00.000Z',
            logs: [{ date: '01.04.2026 10:00' }],
        };

        const { controller } = loadController('controllers/appController.js', 'AppController', {
            document,
            Date: FixedDate,
            AppState: {
                loggedInUser: { id: 'user-1', name: 'Ayse' },
                notifications: [],
                tasks: [],
                businesses: [],
            },
            DataService: {
                apiRequest: jest.fn(async () => ({
                    rows: [{
                        ...staleTask,
                        businessName: 'Acme',
                        lastActionDate: '2026-04-01T10:00:00.000Z',
                    }],
                })),
            },
            parseLogDate: () => new RealDate('2026-04-01T10:00:00.000Z').getTime(),
            window: { sessionStorage: createStorage() },
        });

        await controller.updateNotificationsUI();

        expect(elements.notifBadge.style.display).toBe('inline-block');
        expect(elements.notifList.innerHTML).toContain('Acme');
        expect(elements.notifList.innerHTML).toContain('3 günden uzun süredir');
    });

    it('renders unread API notifications for the logged-in user without matching by display name', async () => {
        const elements = {
            notifList: createElement(),
            notifBadge: createElement({ style: {} }),
        };
        const document = createDocument(elements);

        const { controller } = loadController('controllers/appController.js', 'AppController', {
            document,
            AppState: {
                loggedInUser: { id: 'user-1', name: 'Ayse' },
                notifications: [
                    { id: 'notif-1', toUserId: 'user-1', user: 'Sistem', text: 'Size görev atandı', read: false },
                ],
                tasks: [],
                businesses: [],
            },
            parseLogDate: () => 0,
            window: { sessionStorage: createStorage() },
        });

        await controller.updateNotificationsUI();

        expect(elements.notifBadge.style.display).toBe('inline-block');
        expect(elements.notifList.innerHTML).toContain('Size görev atandı');
    });

    it('keeps a read notification hidden after rerender within the same session', async () => {
        const elements = {
            notifList: createElement(),
            notifBadge: createElement({ style: {} }),
            notifDropdown: createElement({ style: {} }),
        };
        const document = createDocument(elements);
        const sessionStorage = createStorage();
        const notifications = [
            { id: 'notif-1', toUserId: 'user-1', user: 'Sistem', text: 'Size görev atandı', read: false },
        ];

        const { controller } = loadController('controllers/appController.js', 'AppController', {
            document,
            AppState: {
                loggedInUser: { id: 'user-1', name: 'Ayse' },
                notifications,
                tasks: [],
                businesses: [],
            },
            DataService: {
                apiRequest: jest.fn(async () => []),
                markNotificationRead: jest.fn(() => Promise.resolve({ ok: true })),
            },
            SyncService: {
                requestSync: jest.fn(),
            },
            parseLogDate: () => 0,
            window: { sessionStorage },
        });

        await controller.updateNotificationsUI();
        controller.markNotifRead('notif-1');

        notifications.push({ id: 'notif-1', toUserId: 'user-1', user: 'Sistem', text: 'Size görev atandı', read: false });
        await controller.updateNotificationsUI();

        expect(elements.notifList.innerHTML).not.toContain('Size görev atandı');
    });

    it('hides dynamic inactivity notifications after they are dismissed in the same session', async () => {
        const elements = {
            notifList: createElement(),
            notifBadge: createElement({ style: {} }),
            notifDropdown: createElement({ style: {} }),
        };
        const document = createDocument(elements);
        const sessionStorage = createStorage();
        const RealDate = Date;
        class FixedDate extends RealDate {
            constructor(...args) {
                if (args.length === 0) {
                    super('2026-04-06T12:00:00.000Z');
                    return;
                }
                super(...args);
            }

            static now() {
                return new RealDate('2026-04-06T12:00:00.000Z').getTime();
            }
        }
        const staleTask = {
            id: 'task-1',
            businessId: 'biz-1',
            assignee: 'Ayse',
            status: 'followup',
            createdAt: '2026-04-01T10:00:00.000Z',
            logs: [{ date: '01.04.2026 10:00' }],
        };

        const { controller } = loadController('controllers/appController.js', 'AppController', {
            document,
            Date: FixedDate,
            AppState: {
                loggedInUser: { id: 'user-1', name: 'Ayse' },
                notifications: [],
                tasks: [],
                businesses: [],
            },
            DataService: {
                apiRequest: jest.fn(async () => ({
                    rows: [{
                        ...staleTask,
                        businessName: 'Acme',
                        lastActionDate: '2026-04-01T10:00:00.000Z',
                    }],
                })),
            },
            parseLogDate: () => new RealDate('2026-04-01T10:00:00.000Z').getTime(),
            window: { sessionStorage },
        });

        await controller.updateNotificationsUI();
        controller.markDynamicNotifRead('dynamic:task-1');
        await controller.updateNotificationsUI();

        expect(elements.notifList.innerHTML).not.toContain('3 günden uzun süredir');
    });

    it('keeps settings and audit admin-only while allowing manager user-management permissions', () => {
        const { controller } = loadController('controllers/appController.js', 'AppController', {
            AppState: {
                loggedInUser: {
                    id: 'user-1',
                    name: 'Manager User',
                    role: 'Yönetici',
                    _apiRole: 'MANAGER',
                    settings: {
                        permissions: {
                            manageUsers: true,
                            manageRoles: true,
                            manageSettings: true,
                            viewAuditLogs: true,
                        },
                    },
                },
            },
            window: { sessionStorage: createStorage() },
        });

        expect(controller.hasPermission('manageUsers')).toBe(true);
        expect(controller.hasPermission('manageRoles')).toBe(true);
        expect(controller.hasPermission('manageSettings')).toBe(false);
        expect(controller.hasPermission('viewAuditLogs')).toBe(false);
        expect(controller.hasPermission('manageProjects')).toBe(true);
    });
});
