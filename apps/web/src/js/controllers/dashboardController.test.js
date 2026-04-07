const { loadController, createDocument, createElement } = require('../testUtils/controllerTestUtils');

describe('DashboardController render', () => {
    it('renders salesperson dashboard from cached user task summaries', () => {
        const elements = {
            userDashboardSection: createElement({ style: {} }),
            managerDashboardSection: createElement({ style: {} }),
            userHeroGreeting: createElement(),
            userHeroDate: createElement(),
            dashTotalTasks: createElement(),
            dashMyDealMonthly: createElement(),
            dashMyColdMonthly: createElement(),
            dashNew: createElement(),
            dashHot: createElement(),
            dashNothot: createElement(),
            dashFollowup: createElement(),
            userSmartFocusText: createElement(),
            dashUpcomingList: createElement(),
        };

        const document = {
            ...createDocument(elements),
            createDocumentFragment: jest.fn(() => ({ appendChild: jest.fn() })),
        };

        const myTasks = [
            { id: 'task-1', status: 'new', assignee: 'Ayse', createdAt: '2026-04-06T10:00:00.000Z' },
            { id: 'task-2', status: 'hot', assignee: 'Ayse', createdAt: '2026-04-06T10:00:00.000Z' },
            { id: 'task-3', status: 'followup', assignee: 'Ayse', nextCallDate: '2026-04-06T15:00:00.000Z', createdAt: '2026-04-06T10:00:00.000Z' },
        ];

        const { controller } = loadController('controllers/dashboardController.js', 'DashboardController', {
            document,
            AppState: {
                tasks: [],
                users: [],
                loggedInUser: { name: 'Ayse', role: 'Satış Temsilcisi' },
                getUserTaskSummaryMap: () => new Map([['Ayse', {
                    tasks: myTasks,
                    openCount: 3,
                    totalCount: 3,
                    monthlyStats: { '2026-04': { total: 5, deal: 2, cold: 1 } },
                }]]),
            },
            toTitleCase: (value) => String(value || '').charAt(0).toUpperCase() + String(value || '').slice(1),
            isActiveTask: (status) => ['new', 'hot', 'nothot', 'followup'].includes(status),
            parseLogDate: () => new Date('2026-04-06T10:00:00.000Z').getTime(),
            TaskController: { createMinimalCard: jest.fn(() => createElement()) },
        });

        controller.render();

        expect(elements.dashTotalTasks.innerText).toBe(3);
        expect(elements.dashMyDealMonthly.innerText).toBe(2);
        expect(elements.dashMyColdMonthly.innerText).toBe(1);
        expect(elements.dashNew.innerText).toBe(1);
        expect(elements.dashHot.innerText).toBe(1);
        expect(elements.dashFollowup.innerText).toBe(1);
        expect(elements.userSmartFocusText.innerHTML).toContain('Bugün gerçekleştirmeniz gereken planlanmış 1 aramanız');
    });

    it('renders manager radar safely and shows scoped open task distribution', () => {
        const radarFilter = createElement({ value: '', innerHTML: '', add: jest.fn() });
        const elements = {
            userDashboardSection: createElement({ style: {} }),
            managerDashboardSection: createElement({ style: {} }),
            mgrHeroGreeting: createElement(),
            mgrHeroDate: createElement(),
            mgrTotalActive: createElement(),
            mgrTotalDeal: createElement(),
            mgrDealRatio: createElement(),
            mgrSmartFocusText: createElement(),
            mgrRadarUserFilter: radarFilter,
            mgrLiveFeed: createElement(),
            mgrPerformanceGrid: createElement(),
            mgrDashNew: createElement(),
            mgrDashHot: createElement(),
            mgrDashNotHot: createElement(),
            mgrDashFollowup: createElement(),
        };

        const document = createDocument(elements);
        const taskDate = '2026-04-06T10:00:00.000Z';
        const inScopeTasks = [
            {
                id: 'task-1',
                businessId: 'biz-1',
                assignee: 'Ayse',
                status: 'new',
                createdAt: taskDate,
                logs: [{ date: taskDate, user: 'Ayse', text: 'İlk görüşme yapıldı' }],
            },
            {
                id: 'task-2',
                businessId: 'biz-2',
                assignee: 'Ayse',
                status: 'hot',
                createdAt: taskDate,
                logs: [{ date: taskDate, user: 'Ayse', text: 'Hot takip notu' }],
            },
            {
                id: 'task-3',
                businessId: 'biz-3',
                assignee: 'Ayse',
                status: 'nothot',
                createdAt: taskDate,
                logs: [{ date: taskDate, user: 'Ayse', text: 'Not hot oldu' }],
            },
            {
                id: 'task-4',
                businessId: 'biz-4',
                assignee: 'Ayse',
                status: 'followup',
                createdAt: taskDate,
                logs: [{ date: taskDate, user: 'Ayse', text: 'Takip araması planlandı' }],
            },
        ];

        const { controller } = loadController('controllers/dashboardController.js', 'DashboardController', {
            document,
            Option: function(label, value) { return { label, value }; },
            AppState: {
                tasks: [
                    ...inScopeTasks,
                    {
                        id: 'task-5',
                        businessId: 'biz-5',
                        assignee: 'Mehmet',
                        status: 'new',
                        createdAt: taskDate,
                        logs: [{ date: taskDate, user: 'Mehmet', text: 'Takım dışı log' }],
                    },
                ],
                users: [
                    { name: 'Ayse', role: 'Satış Temsilcisi', team: 'Team 1', status: 'Aktif' },
                    { name: 'Mehmet', role: 'Satış Temsilcisi', team: 'Team 2', status: 'Aktif' },
                ],
                loggedInUser: { name: 'Lider', role: 'Takım Lideri', team: 'Team 1' },
                getTaskDerivedIndex: () => ({
                    nonPoolTasks: inScopeTasks,
                    openNonPoolTasks: inScopeTasks,
                    tasksByAssignee: new Map([['Ayse', inScopeTasks]]),
                    openCountByAssignee: new Map([['Ayse', 4]]),
                }),
                getUserTaskSummaryMap: () => new Map([
                    ['Ayse', {
                        tasks: inScopeTasks,
                        openCount: 4,
                        totalCount: 4,
                        monthlyStats: { '2026-04': { total: 4, deal: 1, cold: 0 } },
                    }],
                ]),
            },
            isActiveTask: (status) => ['new', 'hot', 'nothot', 'followup'].includes(status),
            parseLogDate: () => new Date(taskDate).getTime(),
            timeAgo: () => 'Az once',
        });

        controller.render();

        expect(elements.mgrLiveFeed.innerHTML).toContain('Ayse');
        expect(elements.mgrDashNew.innerText).toBe(1);
        expect(elements.mgrDashHot.innerText).toBe(1);
        expect(elements.mgrDashNotHot.innerText).toBe(1);
        expect(elements.mgrDashFollowup.innerText).toBe(1);
        expect(elements.mgrPerformanceGrid.innerHTML).toContain('Ayse');
    });
});
