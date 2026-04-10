const { loadController, createDocument, createElement } = require('../testUtils/controllerTestUtils');

beforeEach(() => {
    global.Blob = jest.fn(function Blob(parts, options) {
        this.parts = parts;
        this.options = options;
    });
});

describe('ReportController exportTasksCSV', () => {
    it('exports filtered task rows as csv after report submission', async () => {
        const elements = {
            repFilterAssignee: createElement({ value: '' }),
            repFilterStatus: createElement({ value: 'deal' }),
            repFilterSource: createElement({ value: 'Old Account' }),
            repFilterCategory: createElement({ value: 'İftar (Core)' }),
            repFilterSubCategory: createElement({ value: 'Restoranda İftar' }),
            repFilterLogType: createElement({ value: '' }),
            repFilterDealFee: createElement({ value: '' }),
            repFilterCity: createElement({ value: '' }),
            repFilterDistrict: createElement({ value: '' }),
            repStartDate: createElement({ value: '2026-04-01' }),
            repEndDate: createElement({ value: '2026-04-06' }),
            reportsTbody: createElement(),
            reportsPagination: createElement(),
            reportsTableHead: createElement(),
            reportsExportTasksBtn: createElement({ style: {} }),
            reportsExportAccountsBtn: createElement({ style: {} }),
            repMetricLabel1: createElement(),
            repMetricLabel2: createElement(),
            repMetricLabel3: createElement(),
            repMetricLabel4: createElement(),
            repMetricLabel5: createElement(),
            repMetricLabel6: createElement(),
            repMetricValue1: createElement({ style: {} }),
            repMetricValue2: createElement({ style: {} }),
            repMetricValue3: createElement({ style: {} }),
            repMetricValue4: createElement({ style: {} }),
            repMetricValue5: createElement({ style: {} }),
            repMetricValue6: createElement({ style: {} }),
            repTabTasks: createElement({ classList: { toggle: jest.fn() } }),
            repTabBusinesses: createElement({ classList: { toggle: jest.fn() } }),
        };
        const linkEl = createElement({ click: jest.fn() });
        const document = {
            ...createDocument(elements),
            body: {
                appendChild: jest.fn(),
                removeChild: jest.fn(),
            },
            createElement: jest.fn(() => linkEl),
        };

        const fetch = jest.fn().mockResolvedValue({
            ok: true,
            blob: async () => Buffer.from('csv'),
        });

        const task = {
            id: 'task-1',
            businessId: 'biz-1',
            status: 'deal',
            assignee: 'Ayse',
            sourceType: 'Old Account',
            mainCategory: 'İftar (Core)',
            subCategory: 'Restoranda İftar',
            createdAt: '2026-04-05T10:00:00.000Z',
            dealDetails: { fee: 1500 },
            logs: [{ text: '[Teklif Verildi] Fiyat paylaşıldı' }],
        };

        const { controller } = loadController('controllers/reportController.js', 'ReportController', {
            document,
            fetch,
            localStorage: { getItem: jest.fn(() => 'token-123') },
            URLSearchParams,
            Blob: global.Blob,
            URL: { createObjectURL: jest.fn(() => 'blob:report') },
            AppState: {
                isDataSyncing: false,
                tasks: [task],
                users: [],
                pagination: { reports: 1 },
                setFiltered: jest.fn(),
                setPage: jest.fn(),
                getBizMap: () => new Map([['biz-1', { companyName: 'Acme Deal', city: 'İstanbul', district: 'Beşiktaş' }]]),
            },
            matchesAssigneeFilter: () => true,
            matchesCategoryFilter: () => true,
            getOrCreatePaginationContainer: () => elements.reportsPagination,
            renderPagination: jest.fn(),
            ITEMS_PER_PAGE: 25,
            TASK_STATUS_LABELS: { deal: 'Deal' },
            formatDate: () => '05.04.2026 10:00',
            showToast: jest.fn(),
        });

        controller.renderReports(true);
        await controller.exportTasksCSV();

        expect(fetch).not.toHaveBeenCalled();
        expect(document.createElement).toHaveBeenCalledWith('a');
        expect(linkEl.download).toContain('task_raporlari_');
        expect(linkEl.click).toHaveBeenCalled();
    });

    it('exports filtered business rows as csv for Old Account Rakip records', async () => {
        const elements = {
            repFilterAssignee: createElement({ value: '' }),
            repFilterStatus: createElement({ value: '' }),
            repFilterSource: createElement({ value: 'Old Account Rakip' }),
            repFilterCategory: createElement({ value: '' }),
            repFilterSubCategory: createElement({ value: '' }),
            repFilterLogType: createElement({ value: '' }),
            repFilterDealFee: createElement({ value: '' }),
            repFilterCity: createElement({ value: '' }),
            repFilterDistrict: createElement({ value: '' }),
            repStartDate: createElement({ value: '' }),
            repEndDate: createElement({ value: '' }),
            reportsTbody: createElement(),
            reportsPagination: createElement(),
            reportsTableHead: createElement(),
            reportsExportTasksBtn: createElement({ style: {} }),
            reportsExportAccountsBtn: createElement({ style: {} }),
            repMetricLabel1: createElement(),
            repMetricLabel2: createElement(),
            repMetricLabel3: createElement(),
            repMetricLabel4: createElement(),
            repMetricLabel5: createElement(),
            repMetricLabel6: createElement(),
            repMetricValue1: createElement({ style: {} }),
            repMetricValue2: createElement({ style: {} }),
            repMetricValue3: createElement({ style: {} }),
            repMetricValue4: createElement({ style: {} }),
            repMetricValue5: createElement({ style: {} }),
            repMetricValue6: createElement({ style: {} }),
            repTabTasks: createElement({ classList: { toggle: jest.fn() } }),
            repTabBusinesses: createElement({ classList: { toggle: jest.fn() } }),
        };
        const linkEl = createElement({ click: jest.fn() });
        const document = {
            ...createDocument(elements),
            body: {
                appendChild: jest.fn(),
                removeChild: jest.fn(),
            },
            createElement: jest.fn(() => linkEl),
        };

        const fetch = jest.fn().mockResolvedValue({
            ok: true,
            blob: async () => Buffer.from('csv'),
        });

        const task = {
            id: 'task-1',
            businessId: 'biz-1',
            status: 'new',
            assignee: 'Ayse',
            sourceType: 'Old Account Rakip',
            createdAt: '2026-04-05T10:00:00.000Z',
            logs: [],
        };

        const { controller } = loadController('controllers/reportController.js', 'ReportController', {
            document,
            fetch,
            localStorage: { getItem: jest.fn(() => 'token-123') },
            URLSearchParams,
            Blob: global.Blob,
            URL: { createObjectURL: jest.fn(() => 'blob:report') },
            AppState: {
                isDataSyncing: false,
                tasks: [task],
                users: [],
                pagination: { reports: 1 },
                setFiltered: jest.fn(),
                setPage: jest.fn(),
                getBizMap: () => new Map([['biz-1', { companyName: 'Acme Rakip', city: 'İstanbul', district: 'Kadıköy' }]]),
            },
            matchesAssigneeFilter: () => true,
            matchesCategoryFilter: () => true,
            normalizeTaskSourceKey: (value) => {
                const raw = String(value || '').trim().toUpperCase();
                if (raw.includes('OLD ACCOUNT RAKIP') || raw === 'OLD_RAKIP') return 'OLD_RAKIP';
                return raw;
            },
            getOrCreatePaginationContainer: () => elements.reportsPagination,
            renderPagination: jest.fn(),
            ITEMS_PER_PAGE: 25,
            TASK_STATUS_LABELS: { new: 'Yeni' },
            formatDate: () => '05.04.2026 10:00',
            showToast: jest.fn(),
        });

        controller.renderReports(true);
        controller.switchReportsTab('businesses');
        await controller.exportAccountsCSV();

        expect(fetch).not.toHaveBeenCalled();
        expect(linkEl.download).toContain('isletme_raporlari_');
        expect(linkEl.click).toHaveBeenCalled();
    });
});

describe('ReportController.renderReports', () => {
    it('renders from the existing snapshot even while background sync is running', () => {
        const filteredStore = { reports: [] };
        const elements = {
            repFilterAssignee: createElement({ value: '' }),
            repFilterStatus: createElement({ value: '' }),
            repFilterSource: createElement({ value: '' }),
            repFilterCategory: createElement({ value: '' }),
            repFilterSubCategory: createElement({ value: '' }),
            repFilterLogType: createElement({ value: '' }),
            repFilterDealFee: createElement({ value: '' }),
            repFilterCity: createElement({ value: '' }),
            repFilterDistrict: createElement({ value: '' }),
            repStartDate: createElement({ value: '' }),
            repEndDate: createElement({ value: '' }),
            reportsTbody: createElement(),
            reportsPagination: createElement(),
            reportsTableHead: createElement(),
            reportsExportTasksBtn: createElement({ style: {} }),
            reportsExportAccountsBtn: createElement({ style: {} }),
            repMetricLabel1: createElement(),
            repMetricLabel2: createElement(),
            repMetricLabel3: createElement(),
            repMetricLabel4: createElement(),
            repMetricLabel5: createElement(),
            repMetricLabel6: createElement(),
            repMetricValue1: createElement({ style: {} }),
            repMetricValue2: createElement({ style: {} }),
            repMetricValue3: createElement({ style: {} }),
            repMetricValue4: createElement({ style: {} }),
            repMetricValue5: createElement({ style: {} }),
            repMetricValue6: createElement({ style: {} }),
            repTabTasks: createElement({ classList: { toggle: jest.fn() } }),
            repTabBusinesses: createElement({ classList: { toggle: jest.fn() } }),
        };
        const document = {
            ...createDocument(elements),
            querySelector: jest.fn(() => ({ nextSibling: null })),
        };

        const task = {
            id: 'task-1',
            businessId: 'biz-1',
            status: 'new',
            assignee: 'Ayse',
            sourceType: 'Old Account',
            createdAt: '2026-04-06T10:00:00.000Z',
            logs: [],
        };

        const { controller } = loadController('controllers/reportController.js', 'ReportController', {
            document,
            AppState: {
                isDataSyncing: true,
                tasks: [task],
                users: [],
                loadedState: { tasks: true, businesses: true },
                filtered: filteredStore,
                pagination: { reports: 1 },
                setFiltered: jest.fn((key, value) => { filteredStore[key] = value; }),
                setPage: jest.fn(),
                getBizMap: () => new Map([['biz-1', { companyName: 'Acme' }]]),
            },
            matchesAssigneeFilter: () => true,
            matchesCategoryFilter: () => true,
            getOrCreatePaginationContainer: () => elements.reportsPagination,
            renderPagination: jest.fn(),
            ITEMS_PER_PAGE: 25,
            TASK_STATUS_LABELS: { new: 'Yeni' },
            formatDate: () => '06.04.2026 10:00',
        });

        controller.renderReports(true);

        expect(elements.reportsTbody.innerHTML).toContain('Acme');
        expect(elements.reportsTbody.innerHTML).not.toContain('Veriler Senkronize Ediliyor');
    });

    it('uses cached report task metadata for filtering and row details', () => {
        const filteredStore = { reports: [] };
        const elements = {
            repFilterAssignee: createElement({ value: '' }),
            repFilterStatus: createElement({ value: '' }),
            repFilterSource: createElement({ value: '' }),
            repFilterCategory: createElement({ value: '' }),
            repFilterSubCategory: createElement({ value: '' }),
            repFilterLogType: createElement({ value: 'Tekrar Aranacak' }),
            repFilterDealFee: createElement({ value: '' }),
            repFilterCity: createElement({ value: '' }),
            repFilterDistrict: createElement({ value: '' }),
            repStartDate: createElement({ value: '2026-04-01' }),
            repEndDate: createElement({ value: '2026-04-07' }),
            reportsTbody: createElement(),
            reportsPagination: createElement(),
            reportsTableHead: createElement(),
            reportsExportTasksBtn: createElement({ style: {} }),
            reportsExportAccountsBtn: createElement({ style: {} }),
            repMetricLabel1: createElement(),
            repMetricLabel2: createElement(),
            repMetricLabel3: createElement(),
            repMetricLabel4: createElement(),
            repMetricLabel5: createElement(),
            repMetricLabel6: createElement(),
            repMetricValue1: createElement({ style: {} }),
            repMetricValue2: createElement({ style: {} }),
            repMetricValue3: createElement({ style: {} }),
            repMetricValue4: createElement({ style: {} }),
            repMetricValue5: createElement({ style: {} }),
            repMetricValue6: createElement({ style: {} }),
            repTabTasks: createElement({ classList: { toggle: jest.fn() } }),
            repTabBusinesses: createElement({ classList: { toggle: jest.fn() } }),
        };
        const document = {
            ...createDocument(elements),
            querySelector: jest.fn(() => ({ nextSibling: null })),
        };

        const task = {
            id: 'task-1',
            businessId: 'biz-1',
            status: 'followup',
            assignee: 'Ayse',
            sourceType: 'Old Account',
            mainCategory: 'Yemek',
            subCategory: 'Iftar',
            createdAt: '2026-04-06T10:00:00.000Z',
            offers: [{ id: 'offer-1' }],
            logs: [],
        };

        const { controller } = loadController('controllers/reportController.js', 'ReportController', {
            document,
            AppState: {
                isDataSyncing: false,
                tasks: [task],
                users: [],
                filtered: filteredStore,
                pagination: { reports: 1 },
                setFiltered: jest.fn((key, value) => { filteredStore[key] = value; }),
                setPage: jest.fn(),
                getBizMap: () => new Map([['biz-1', { companyName: 'Acme' }]]),
                getReportTaskMetaMap: () => new Map([['task-1', {
                    latestLogText: '[Tekrar Aranacak] Yarin ara',
                    latestLogTag: 'Tekrar Aranacak',
                    lastActionDate: '06.04.2026',
                    createdDateOnly: '2026-04-06',
                    feeVal: 'yok',
                    jokerVal: 'yok',
                }]]),
            },
            matchesAssigneeFilter: () => true,
            matchesCategoryFilter: () => true,
            getOrCreatePaginationContainer: () => elements.reportsPagination,
            renderPagination: jest.fn(),
            ITEMS_PER_PAGE: 25,
            TASK_STATUS_LABELS: { followup: 'Takip' },
            formatDate: () => '06.04.2026 10:00',
        });

        controller.renderReports(true);

        expect(elements.repMetricValue1.innerText).toBe(1);
        expect(elements.repMetricValue6.innerText).toBe(1);
        expect(elements.reportsTbody.innerHTML).toContain('Tekrar Aranacak');
        expect(elements.reportsTbody.innerHTML).toContain('06.04.2026');
    });

    it('normalizes source filters so Old Account Query and Lead records are not dropped', () => {
        const filteredStore = { reports: [] };
        const elements = {
            repFilterAssignee: createElement({ value: '' }),
            repFilterStatus: createElement({ value: '' }),
            repFilterSource: createElement({ value: 'Old Account Query' }),
            repFilterCategory: createElement({ value: '' }),
            repFilterSubCategory: createElement({ value: '' }),
            repFilterLogType: createElement({ value: '' }),
            repFilterDealFee: createElement({ value: '' }),
            repFilterCity: createElement({ value: '' }),
            repFilterDistrict: createElement({ value: '' }),
            repStartDate: createElement({ value: '' }),
            repEndDate: createElement({ value: '' }),
            reportsTbody: createElement(),
            reportsPagination: createElement(),
            reportsTableHead: createElement(),
            reportsExportTasksBtn: createElement({ style: {} }),
            reportsExportAccountsBtn: createElement({ style: {} }),
            repMetricLabel1: createElement(),
            repMetricLabel2: createElement(),
            repMetricLabel3: createElement(),
            repMetricLabel4: createElement(),
            repMetricLabel5: createElement(),
            repMetricLabel6: createElement(),
            repMetricValue1: createElement({ style: {} }),
            repMetricValue2: createElement({ style: {} }),
            repMetricValue3: createElement({ style: {} }),
            repMetricValue4: createElement({ style: {} }),
            repMetricValue5: createElement({ style: {} }),
            repMetricValue6: createElement({ style: {} }),
            repTabTasks: createElement({ classList: { toggle: jest.fn() } }),
            repTabBusinesses: createElement({ classList: { toggle: jest.fn() } }),
        };

        const document = {
            ...createDocument(elements),
            querySelector: jest.fn(() => ({ nextSibling: null })),
        };

        const tasks = [
            {
                id: 'task-query',
                businessId: 'biz-1',
                status: 'new',
                assignee: 'Ayse',
                sourceType: 'Lead',
                createdAt: '2026-04-06T10:00:00.000Z',
                offers: [],
                logs: [],
            },
            {
                id: 'task-old',
                businessId: 'biz-2',
                status: 'new',
                assignee: 'Ayse',
                sourceType: 'Old Account',
                createdAt: '2026-04-05T10:00:00.000Z',
                offers: [],
                logs: [],
            },
        ];

        const { controller } = loadController('controllers/reportController.js', 'ReportController', {
            document,
            AppState: {
                isDataSyncing: false,
                tasks,
                users: [],
                filtered: filteredStore,
                pagination: { reports: 1 },
                setFiltered: jest.fn((key, value) => { filteredStore[key] = value; }),
                setPage: jest.fn(),
                getBizMap: () => new Map([
                    ['biz-1', { companyName: 'Acme Query' }],
                    ['biz-2', { companyName: 'Acme Old' }],
                ]),
            },
            matchesAssigneeFilter: () => true,
            matchesCategoryFilter: () => true,
            normalizeTaskSourceKey: (value) => {
                const raw = String(value || '').trim().toUpperCase();
                if (raw.includes('OLD ACCOUNT QUERY') || raw === 'QUERY' || raw.includes('LEAD')) return 'QUERY';
                if (raw.includes('OLD')) return 'OLD';
                return raw;
            },
            getOrCreatePaginationContainer: () => elements.reportsPagination,
            renderPagination: jest.fn(),
            ITEMS_PER_PAGE: 25,
            TASK_STATUS_LABELS: { new: 'Yeni' },
            formatDate: () => '06.04.2026 10:00',
        });

        controller.renderReports(true);

        expect(elements.repMetricValue1.innerText).toBe(1);
        expect(elements.reportsTbody.innerHTML).toContain('Acme Query');
        expect(elements.reportsTbody.innerHTML).not.toContain('Acme Old');
    });
});
