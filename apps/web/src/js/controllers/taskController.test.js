describe('TaskController.executeSaveAction', () => {
    const TaskSavePayload = require('../utils/taskSavePayload');

    function createElement(initial = {}) {
        return {
            value: '',
            innerText: '',
            disabled: false,
            style: {},
            ...initial,
        };
    }

    function setupDom() {
        const elements = {
            btnSaveModalLog: createElement({ innerText: 'Kaydet 🚀' }),
            modalLogInput: createElement({ value: ' Elden kapatildi ' }),
            miniModalOverlay: createElement({ style: { display: 'flex' } }),
            miniModalDeal: createElement({ style: { display: 'block' } }),
            miniModalDate: createElement({ style: { display: 'none' } }),
            miniModalContact: createElement({ style: { display: 'none' } }),
        };

        global.document = {
            getElementById: jest.fn((id) => elements[id] || null),
            querySelectorAll: jest.fn(() => []),
        };

        return elements;
    }

    beforeEach(() => {
        jest.resetModules();
        setupDom();

        global.window = global;
        global.TaskSavePayload = TaskSavePayload;
        global.esc = (value) => String(value ?? '').trim();
        global.showToast = jest.fn();
        global.refreshTaskModalInPlace = jest.fn();
        global.renderTaskInline = jest.fn();
        global.setTimeout = jest.fn((fn) => {
            if (typeof fn === 'function') fn();
            return 0;
        });
        global.clearTimeout = jest.fn();
        global.ITEMS_PER_PAGE_TASKS = 25;

        global.AppState = {
            tasks: [
                {
                    id: 'task_1',
                    status: 'hot',
                    updatedAt: '2026-04-14T08:00:00.000Z',
                },
            ],
            invalidateTaskMapCache: jest.fn(),
        };

        global.DataService = {
            apiRequest: jest.fn().mockResolvedValue({}),
            readPath: jest.fn().mockResolvedValue({
                id: 'task_1',
                status: 'deal',
                logs: [],
            }),
        };

        window._selectedModalLogType = '';
        window._selectedModalStatus = 'deal';
        window._dealDetails = {
            commission: '10',
            duration: '6',
            fee: 'Yok',
            joker: 'Yok',
            campCount: '2',
        };
    });

    afterEach(() => {
        delete global.window;
        delete global.TaskSavePayload;
        delete global.document;
        delete global.esc;
        delete global.showToast;
        delete global.refreshTaskModalInPlace;
        delete global.renderTaskInline;
        delete global.setTimeout;
        delete global.clearTimeout;
        delete global.ITEMS_PER_PAGE_TASKS;
        delete global.AppState;
        delete global.DataService;
    });

    it('sends deal details and wraps the manual note as a deal activity', async () => {
        require('./taskController');

        await window.executeSaveAction('task_1');

        const [path, request] = DataService.apiRequest.mock.calls[0];
        expect(path).toBe('/tasks/task_1');
        expect(request.method).toBe('PATCH');
        expect(JSON.parse(request.body)).toEqual(expect.objectContaining({
            dealDetails: {
                commission: '10',
                duration: '6',
                fee: 'Yok',
                joker: 'Yok',
                campCount: '2',
            },
            status: 'deal',
            activity: {
                text: '[Deal Notu] Elden kapatildi',
                reason: 'GORUSME',
            },
            expectedUpdatedAt: '2026-04-14T08:00:00.000Z',
            mutationKey: expect.stringMatching(/^task-save-task_1-/),
        }));
        expect(DataService.readPath).toHaveBeenCalledWith('tasks/task_1', { force: true });
        expect(AppState.tasks[0].status).toBe('deal');
        expect(window._dealDetails).toBeNull();
        expect(showToast).toHaveBeenCalledWith('İşlem başarıyla kaydedildi!', 'success');
        expect(document.getElementById('btnSaveModalLog').disabled).toBe(false);
    });

    it('refreshes the open modal back to previous task state when save fails', async () => {
        const elements = setupDom();
        elements.taskModal = createElement({ style: { display: 'flex' } });
        global.document.getElementById = jest.fn((id) => elements[id] || null);

        global.DataService = {
            apiRequest: jest.fn().mockRejectedValue(new Error('Patch failed')),
            readPath: jest.fn(),
        };

        require('./taskController');
        window.refreshTaskModalInPlace = jest.fn();

        await window.executeSaveAction('task_1');

        expect(window.refreshTaskModalInPlace).toHaveBeenCalledWith('task_1');
        expect(AppState.tasks[0].status).toBe('hot');
        expect(showToast).toHaveBeenCalledWith('Hata: Patch failed', 'error');
        expect(document.getElementById('btnSaveModalLog').disabled).toBe(false);
    });
});

describe('TaskController.renderAllTasks', () => {
    const { loadController, createDocument, createElement } = require('../testUtils/controllerTestUtils');

    it('uses the backend summary payload for counts and list rendering', async () => {
        const allActiveTaskList = createElement({ appendChild: jest.fn() });
        const allActiveCount = createElement();
        const btnTodayDealCount = createElement();
        const btnTodayColdCount = createElement();
        const allTasksPagination = createElement();
        const teamPulseContainer = createElement();

        const document = createDocument({
            allActiveTaskList,
            allActiveCount,
            btnTodayDealCount,
            btnTodayColdCount,
            allTasksPagination,
            teamPulseContainer,
            filterAllTasksAssignee: createElement({ value: '' }),
            filterAllTasksProject: createElement({ value: '' }),
            allFilterBizName: createElement({ value: '' }),
            allTaskSort: createElement({ value: 'newest' }),
        });
        document.querySelectorAll = jest.fn(() => []);

        const derivedTask = {
            id: 'task-cache-1',
            businessId: 'biz-1',
            status: 'hot',
            assignee: 'Ayse',
            sourceType: 'Old Account',
            mainCategory: 'Yemek',
            subCategory: 'Iftar',
            logs: [{ date: '06.04.2026 10:00' }],
            createdAt: '2026-04-06T10:00:00.000Z',
            companyName: 'Acme',
            city: 'Istanbul',
        };
        const fetchTaskPage = jest.fn().mockImplementation((query) => {
            if (query?.status === 'DEAL') return Promise.resolve({ items: [], total: 4, page: 1, limit: 1 });
            if (query?.status === 'COLD') return Promise.resolve({ items: [], total: 2, page: 1, limit: 1 });
            return Promise.resolve({ items: [derivedTask], total: 1, page: 1, limit: 25 });
        });

        const { controller } = loadController('controllers/taskController.js', 'TaskController', {
            document,
            AppState: {
                tasks: [],
                users: [{ name: 'Ayse', role: 'Satış Temsilcisi', status: 'Aktif', team: 'Team 1' }],
                loggedInUser: { role: 'Yönetici' },
                pagination: { allTasks: 1 },
                setPage: jest.fn(),
                getBizMap: () => new Map([['biz-1', { id: 'biz-1', companyName: 'Acme', city: 'Istanbul' }]]),
                getTaskDerivedIndex: () => ({
                    nonPoolTasks: [derivedTask],
                    openNonPoolTasks: [derivedTask],
                    tasksByAssignee: new Map([['Ayse', [derivedTask]]]),
                    activeAssigneeNames: new Set(['Ayse']),
                    todayDealCount: 4,
                    todayColdCount: 2,
                }),
            },
            DataService: {
                fetchTaskPage,
                apiRequest: jest.fn().mockResolvedValue({
                    records: [{
                        key: 'Ayse',
                        user: { name: 'Ayse', team: 'Team 1' },
                        metrics: {
                            daily: {
                                contacted: { count: 1 },
                                idle: { count: 0 },
                                opened: { count: 1 },
                                open: { count: 1 },
                            },
                        },
                    }],
                }),
            },
            TASK_STATUS_LABELS: { hot: 'Hot' },
            POOL_ASSIGNEES: ['UNASSIGNED', 'Team 1', 'Team 2', 'TARGET_POOL'],
            PASSIVE_STATUSES: ['deal', 'cold'],
            ITEMS_PER_PAGE_TASKS: 25,
            requestAnimationFrame: (fn) => {
                if (typeof fn === 'function') fn();
                return 0;
            },
            addEventListener: jest.fn(),
            isToday: () => true,
            isActiveTask: (status) => ['new', 'hot', 'nothot', 'followup'].includes(status),
            matchesAssigneeFilter: () => true,
            normalizeText: (value) => String(value || '').toLocaleLowerCase('tr-TR'),
            sortTasksByUrgency: () => 0,
            sortTasksByUrgencyOldest: () => 0,
            renderPagination: jest.fn(),
            parseLogDate: () => new Date('2026-04-01T10:00:00.000Z').getTime(),
            formatDate: () => '06.04.2026 10:00',
        });

        await controller.renderAllTasks();

        expect(btnTodayDealCount.innerText).toBe(4);
        expect(btnTodayColdCount.innerText).toBe(2);
        expect(allActiveCount.innerText).toBe(1);
        expect(allActiveTaskList.appendChild).toHaveBeenCalledTimes(1);
        expect(teamPulseContainer.innerHTML).toContain('Ayse');
        expect(fetchTaskPage).toHaveBeenCalled();
    });
});

describe('TaskController._buildActionBarHTML', () => {
    const { loadController } = require('../testUtils/controllerTestUtils');

    it('shows task transfer action for manager users', () => {
        const { controller } = loadController('controllers/taskController.js', 'TaskController', {
            AppState: {
                tasks: [
                    { id: 'task_1', ownerId: 'sales_1', assignee: 'Ayse', status: 'hot' },
                    { id: 'task_2', ownerId: 'sales_2', assignee: 'Mehmet', status: 'new' },
                ],
                users: [
                    { id: 'manager_1', name: 'Mudur', role: 'Yönetici', team: '-', status: 'Aktif' },
                    { id: 'sales_1', name: 'Ayse', role: 'Satış Temsilcisi', team: 'Team 1', status: 'Aktif' },
                    { id: 'sales_2', name: 'Mehmet', role: 'Satış Temsilcisi', team: 'Team 2', status: 'Aktif' },
                ],
                loggedInUser: { id: 'manager_1', role: 'Yönetici', team: '-' },
            },
            USER_ROLES: {
                MANAGER: 'Yönetici',
                TEAM_LEAD: 'Takım Lideri',
                SALES_REP: 'Satış Temsilcisi',
            },
            PASSIVE_STATUSES: ['deal', 'cold'],
            ITEMS_PER_PAGE_TASKS: 25,
            TASK_STATUS_LABELS: { hot: 'Hot' },
            isActiveTask: (status) => ['new', 'hot', 'nothot', 'followup'].includes(status),
            hasPermission: () => true,
            window: { hasPermission: () => true },
        });

        const html = controller._buildActionBarHTML({
            id: 'task_1',
            ownerId: 'sales_1',
            assignee: 'Ayse',
            status: 'hot',
            durationDays: 7,
        });

        expect(html).toContain('Görev Devri');
        expect(html).toContain('Mehmet');
    });

    it('shows task transfer action and limits transfer candidates to the team leader team', () => {
        const { controller } = loadController('controllers/taskController.js', 'TaskController', {
            AppState: {
                tasks: [
                    { id: 'task_1', ownerId: 'sales_1', assignee: 'Ayse', status: 'hot' },
                    { id: 'task_2', ownerId: 'sales_2', assignee: 'Mehmet', status: 'new' },
                ],
                users: [
                    { id: 'lead_1', name: 'Lider', role: 'Takım Lideri', team: 'Team 1', status: 'Aktif' },
                    { id: 'sales_1', name: 'Ayse', role: 'Satış Temsilcisi', team: 'Team 1', status: 'Aktif' },
                    { id: 'sales_2', name: 'Mehmet', role: 'Satış Temsilcisi', team: 'Team 2', status: 'Aktif' },
                    { id: 'sales_3', name: 'Zeynep', role: 'Satış Temsilcisi', team: 'Team 1', status: 'Aktif' },
                ],
                loggedInUser: { id: 'lead_1', role: 'Takım Lideri', team: 'Team 1' },
            },
            USER_ROLES: {
                MANAGER: 'Yönetici',
                TEAM_LEAD: 'Takım Lideri',
                SALES_REP: 'Satış Temsilcisi',
            },
            PASSIVE_STATUSES: ['deal', 'cold'],
            ITEMS_PER_PAGE_TASKS: 25,
            TASK_STATUS_LABELS: { hot: 'Hot' },
            isActiveTask: (status) => ['new', 'hot', 'nothot', 'followup'].includes(status),
            hasPermission: () => true,
            window: { hasPermission: () => true },
        });

        const html = controller._buildActionBarHTML({
            id: 'task_1',
            ownerId: 'sales_1',
            assignee: 'Ayse',
            status: 'hot',
            durationDays: 7,
        });

        expect(html).toContain('Görev Devri');
        expect(html).toContain('Zeynep');
        expect(html).not.toContain('Mehmet');
    });
});
