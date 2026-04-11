const { loadController, createDocument, createElement } = require('../testUtils/controllerTestUtils');

describe('PoolController pool rendering', () => {
    it('renders pool lists from paged backend payloads', async () => {
        const elements = {
            poolGeneralList: createElement({ closest: jest.fn(() => null) }),
            poolTeam1List: createElement({ closest: jest.fn(() => null) }),
            poolTeam2List: createElement({ closest: jest.fn(() => null) }),
            'dot-general': createElement({ classList: { add: jest.fn(), remove: jest.fn() } }),
            'dot-team1': createElement({ classList: { add: jest.fn(), remove: jest.fn() } }),
            'dot-team2': createElement({ classList: { add: jest.fn(), remove: jest.fn() } }),
            selectAllGen: createElement({ checked: true }),
            selectAllT1: createElement({ checked: true }),
            selectAllT2: createElement({ checked: true }),
            poolActionBar: createElement({ style: {}, classList: { toggle: jest.fn() } }),
            poolSelectedCount: createElement(),
        };
        const document = createDocument(elements);
        document.querySelectorAll = jest.fn((selector) => {
            if (selector === '.pool-source-filter:checked') return [];
            return [];
        });

        const generalTask = {
            id: 'task-1',
            businessId: 'biz-1',
            assignee: 'UNASSIGNED',
            status: 'new',
            sourceType: 'Old Account',
        };
        const fetchTaskPage = jest.fn().mockResolvedValue({
            items: [generalTask],
            total: 1,
            page: 1,
            limit: 25,
        });

        const { controller } = loadController('controllers/poolController.js', 'PoolController', {
            document,
            AppState: {
                currentPoolTab: 'general',
                pagination: { poolGen: 1, poolTeam1: 1, poolTeam2: 1 },
                selectedPoolIds: new Set(),
                setPage: jest.fn(),
                getBizMap: () => new Map([['biz-1', { companyName: 'Acme', city: 'Istanbul' }]]),
            },
            DataService: { fetchTaskPage },
            ITEMS_PER_PAGE: 25,
            renderPagination: jest.fn(),
        });

        await controller.renderPoolTasks();

        expect(elements.poolGeneralList.innerHTML).toContain('Acme');
        expect(elements['dot-general'].classList.add).toHaveBeenCalledWith('active');
        expect(elements.selectAllGen.checked).toBe(false);
        expect(fetchTaskPage).toHaveBeenCalledWith(expect.objectContaining({
            pool: 'GENERAL',
            poolTeam: 'GENERAL',
            generalStatus: 'OPEN',
        }));
    });
});
