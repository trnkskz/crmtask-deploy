const { loadController, createDocument, createElement } = require('../testUtils/controllerTestUtils');

describe('ProjectController target audience filters', () => {
    function buildController(extraContext = {}) {
        return loadController('controllers/projectController.js', 'ProjectController', {
            document: createDocument({}),
            AppState: {
                businesses: [],
                tasks: [],
                projects: [],
                getTaskMap: () => ({}),
                getProjectTaskMap: () => ({}),
            },
            isActiveTask: (status) => ['new', 'hot', 'nothot', 'followup'].includes(status),
            matchesTaskHistoryCategoryFilter: (tasks, mainCategories, subCategories) => {
                return (tasks || []).some((task) => {
                    const mainOk = !mainCategories.length || mainCategories.includes(task.mainCategory);
                    const subOk = !subCategories.length || subCategories.includes(task.subCategory);
                    return mainOk && subOk;
                });
            },
            resolveCanonicalCategory: (mainCategory, subCategory) => ({ mainCategory, subCategory }),
            ...extraContext,
        }).controller;
    }

    it('matches source filters against enum-backed task sources', () => {
        const controller = buildController();
        const biz = {
            id: 'biz-1',
            businessStatus: 'Aktif',
            city: 'İstanbul',
            district: 'Kadıköy',
        };
        const taskMap = {
            'biz-1': [{ id: 'task-1', status: 'deal', sourceType: 'QUERY', createdAt: '2026-04-05T10:00:00.000Z' }],
        };

        const result = controller._matchesTargetAudienceFilters(biz, {
            mainCategories: [],
            subCategories: [],
            cities: [],
            districts: [],
            sources: ['Old Account Query'],
            years: [],
            months: [],
            includeActive: true,
        }, taskMap);

        expect(result).toBe(true);
    });

    it('matches date filters against any historical task date instead of only the latest task', () => {
        const controller = buildController();
        const biz = {
            id: 'biz-2',
            businessStatus: 'Aktif',
            city: 'İstanbul',
            district: 'Beşiktaş',
            createdAt: '2026-04-01T10:00:00.000Z',
        };
        const taskMap = {
            'biz-2': [
                { id: 'task-new', status: 'deal', createdAt: '2026-04-05T10:00:00.000Z' },
                { id: 'task-old', status: 'deal', createdAt: '2025-12-15T10:00:00.000Z' },
            ],
        };

        const result = controller._matchesTargetAudienceFilters(biz, {
            mainCategories: [],
            subCategories: [],
            cities: [],
            districts: [],
            sources: [],
            years: ['2025'],
            months: ['Aralık'],
            includeActive: true,
        }, taskMap);

        expect(result).toBe(true);
    });

    it('falls back to the business category when there is no task history yet', () => {
        const controller = buildController();
        const biz = {
            id: 'biz-3',
            businessStatus: 'Aktif',
            city: 'İstanbul',
            district: 'Şişli',
            companyName: 'Acme',
            mainCategory: 'İftar (Core)',
            subCategory: 'Restoranda İftar',
        };

        const result = controller._matchesTargetAudienceFilters(biz, {
            mainCategories: ['İftar (Core)'],
            subCategories: ['Restoranda İftar'],
            cities: [],
            districts: [],
            sources: [],
            years: [],
            months: [],
            includeActive: true,
        }, {});

        expect(result).toBe(true);
    });

    it('normalizes project pool source counts for enum-backed tasks', () => {
        const sourceSelect = createElement({ value: 'Old Account Query' });
        const countEl = createElement({ innerText: '' });
        const document = createDocument({
            dist_source_proj_1: sourceSelect,
            pool_count_proj_1: countEl,
        });

        const controller = buildController({
            document,
            AppState: {
                tasks: [
                    { id: 'task-1', projectId: 'proj_1', assignee: 'TARGET_POOL', sourceType: 'QUERY' },
                    { id: 'task-2', projectId: 'proj_1', assignee: 'TARGET_POOL', sourceType: 'OLD' },
                ],
            },
        });

        controller.updateProjectPoolCount('proj_1');

        expect(countEl.innerText).toBe(1);
    });

    it('keeps distributed projects active while they still have open assigned tasks', () => {
        const controller = buildController({
            AppState: {
                tasks: [
                    { id: 'task-1', projectId: 'proj_1', assignee: 'Ayşe', status: 'followup' },
                    { id: 'task-2', projectId: 'proj_1', assignee: 'Ayşe', status: 'deal' },
                ],
                getProjectTaskMap: () => ({
                    'proj_1': [
                        { id: 'task-1', projectId: 'proj_1', assignee: 'Ayşe', status: 'followup' },
                        { id: 'task-2', projectId: 'proj_1', assignee: 'Ayşe', status: 'deal' },
                    ],
                }),
            },
        });

        const summary = controller._summarizeProject({ id: 'proj_1', name: 'Nisan Projesi' });

        expect(summary.isActiveDistributed).toBe(true);
        expect(summary.isArchived).toBe(false);
        expect(summary.openCount).toBe(1);
    });

    it('archives projects only after both pool and active task channels are empty', () => {
        const controller = buildController({
            AppState: {
                tasks: [
                    { id: 'task-1', projectId: 'proj_2', assignee: 'Ayşe', status: 'deal' },
                    { id: 'task-2', projectId: 'proj_2', assignee: 'Ayşe', status: 'cold' },
                ],
                getProjectTaskMap: () => ({
                    'proj_2': [
                        { id: 'task-1', projectId: 'proj_2', assignee: 'Ayşe', status: 'deal' },
                        { id: 'task-2', projectId: 'proj_2', assignee: 'Ayşe', status: 'cold' },
                    ],
                }),
            },
        });

        const summary = controller._summarizeProject({ id: 'proj_2', name: 'Mart Projesi' });

        expect(summary.isActiveDistributed).toBe(false);
        expect(summary.isArchived).toBe(true);
        expect(summary.openCount).toBe(0);
    });

    it('keeps projects active while open tasks are still waiting in team pools', () => {
        const controller = buildController({
            AppState: {
                tasks: [
                    { id: 'task-1', projectId: 'proj_4', assignee: 'Team 1', status: 'new' },
                    { id: 'task-2', projectId: 'proj_4', assignee: 'Team 2', status: 'followup' },
                    { id: 'task-3', projectId: 'proj_4', assignee: 'Ayşe', status: 'deal' },
                ],
                getProjectTaskMap: () => ({
                    'proj_4': [
                        { id: 'task-1', projectId: 'proj_4', assignee: 'Team 1', status: 'new' },
                        { id: 'task-2', projectId: 'proj_4', assignee: 'Team 2', status: 'followup' },
                        { id: 'task-3', projectId: 'proj_4', assignee: 'Ayşe', status: 'deal' },
                    ],
                }),
            },
            isVisibleTaskListProjectTask: (task) => {
                if (!task) return false;
                if (task.assignee === 'TARGET_POOL') return false;
                return !['deal', 'cold', 'pending_approval'].includes(task.status);
            },
        });

        const summary = controller._summarizeProject({ id: 'proj_4', name: 'Haziran Projesi' });

        expect(summary.isActiveDistributed).toBe(true);
        expect(summary.isArchived).toBe(false);
        expect(summary.openCount).toBe(2);
    });

    it('renders active project cards as drill-down entry points for open tasks', () => {
        const controller = buildController();
        const html = controller._renderProjectSummaryCard({
            project: { id: 'proj_3', name: 'Mayis Projesi' },
            total: 3,
            openCount: 2,
            poolTasks: [],
            dealCount: 0,
            coldCount: 0,
        });

        expect(html).toContain("openProjectDetailsModal('proj_3', 'active')");
        expect(html).toContain('Açık: <b>2</b>');
    });
});

describe('ProjectController.submitCreateNewTask', () => {
    it('does not fabricate a task note when the note field is blank and sends projectId separately', async () => {
        const button = createElement({ disabled: false, innerText: '🚀 Taskı Oluştur ve Atama Yap' });
        const form = createElement({ reset: jest.fn() });
        const warning = createElement({ style: { display: 'block' } });
        const document = createDocument({
            companyName: createElement({ value: 'Acme Cafe' }),
            contactPhone: createElement({ value: '' }),
            contactEmail: createElement({ value: '' }),
            sourceType: createElement({ value: 'Fresh Account' }),
            campaignUrl: createElement({ value: '' }),
            newBizAssignee: createElement({ value: 'TARGET_POOL_proj_99' }),
            newTaskNote: createElement({ value: '   ' }),
            contactName: createElement({ value: '' }),
            city: createElement({ value: 'İstanbul' }),
            district: createElement({ value: 'Kadıköy' }),
            address: createElement({ value: '' }),
            website: createElement({ value: '' }),
            instagram: createElement({ value: '' }),
            mainCategory: createElement({ value: 'Yeme İçme' }),
            subCategory: createElement({ value: 'Cafe' }),
            taskCategory: createElement({ value: 'İstanbul Core' }),
            businessForm: form,
            newBizDuplicateWarning: warning,
        });
        document.querySelector = jest.fn(() => button);

        const apiRequest = jest.fn()
            .mockResolvedValueOnce({ id: 'acc_1' })
            .mockResolvedValueOnce({ id: 'task_1' });

        const { controller } = loadController('controllers/projectController.js', 'ProjectController', {
            document,
            AppState: {
                users: [],
                projects: [{ id: 'proj_99', name: 'Nisan Hedefleri' }],
            },
            DataService: { apiRequest },
            showToast: jest.fn(),
            addSystemLog: jest.fn(),
            esc: (value) => String(value ?? ''),
            isValidName: () => true,
            isValidPhone: () => true,
            isValidEmail: () => true,
            isCampaignUrlRequiredSource: () => false,
        });

        controller.submitCreateNewTask();
        await Promise.resolve();
        await Promise.resolve();

        const [, taskRequest] = apiRequest.mock.calls[1];
        const payload = JSON.parse(taskRequest.body);

        expect(payload.details).toBeUndefined();
        expect(payload.projectId).toBe('proj_99');
        expect(payload.historicalAssignee).toBe('TARGET_POOL');
    });
});

describe('ProjectController.generateStrategicList', () => {
    it('creates an empty draft project when existing data pull is disabled', async () => {
        const targetProjectName = createElement({ value: 'Taslak Nisan Projesi' });
        const targetPullExisting = createElement({ checked: false });
        const targetYear = createElement({ selectedOptions: [] });
        const targetMonth = createElement({ selectedOptions: [] });
        const targetBulkNote = createElement({ value: '' });
        const targetBaseNote = createElement({ value: 'Taslak notu' });
        const document = createDocument({
            targetProjectName,
            targetPullExisting,
            targetYear,
            targetMonth,
            targetBulkNote,
            targetBaseNote,
        });

        const apiRequest = jest.fn().mockResolvedValue({ id: 'proj_1', name: 'Taslak Nisan Projesi' });
        const renderActiveProjects = jest.fn();

        const { controller } = loadController('controllers/projectController.js', 'ProjectController', {
            document,
            AppState: {
                businesses: [],
                tasks: [],
                projects: [],
                loggedInUser: { name: 'Admin' },
                getTaskMap: () => ({}),
                getProjectTaskMap: () => ({}),
            },
            DataService: { apiRequest },
            DropdownController: { updateAssigneeDropdowns: jest.fn() },
            showToast: jest.fn(),
            addSystemLog: jest.fn(),
            esc: (value) => String(value ?? ''),
            matchesTaskHistoryCategoryFilter: () => true,
            resolveCanonicalCategory: (mainCategory, subCategory) => ({ mainCategory, subCategory }),
        });

        controller.renderActiveProjects = renderActiveProjects;
        controller.generateStrategicList();
        await Promise.resolve();
        await Promise.resolve();

        expect(apiRequest).toHaveBeenCalledTimes(1);
        const [, projectRequest] = apiRequest.mock.calls[0];
        expect(JSON.parse(projectRequest.body).mode).toBe('MANUAL');
        expect(renderActiveProjects).toHaveBeenCalled();
    });
});
