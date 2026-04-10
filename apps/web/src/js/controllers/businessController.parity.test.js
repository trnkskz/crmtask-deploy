const { loadController, createDocument, createElement } = require('../testUtils/controllerTestUtils');
const CsvImportUtils = require('../utils/csvImport');

describe('BusinessController parity flows', () => {
    it('renders a named fallback contact and campaign archive links in business detail', async () => {
        const businessDetailArea = createElement();
        const businessDetailModal = createElement({ style: {}, classList: { add: jest.fn() } });
        const elements = {
            modalContentArea: createElement(),
            businessDetailArea,
            businessDetailModal,
        };
        const document = createDocument(elements);

        const biz = {
            id: 'biz-1',
            companyName: 'Acme',
            createdAt: '2026-04-05T10:00:00.000Z',
            contactName: 'Yok',
            contactPhone: '',
            contactEmail: '',
            extraContacts: [{ name: 'Berna Hanim', phone: '0544 204 67 86', email: '' }],
            campaignUrl: 'https://example.com/base-campaign',
            businessStatus: 'Aktif',
            city: 'Istanbul',
        };
        const tasks = [
            {
                id: 'task-1',
                businessId: 'biz-1',
                status: 'followup',
                assignee: 'Ayse',
                mainCategory: 'Yemek',
                subCategory: 'Iftar',
                sourceType: 'Old Account',
                specificCampaignUrl: 'https://example.com/task-campaign',
                logs: [{ date: '06.04.2026 09:30' }],
                createdAt: '2026-04-06T09:30:00.000Z',
            },
        ];

        const { controller } = loadController('controllers/businessController.js', 'BusinessController', {
            document,
            AppState: {
                businesses: [biz],
                tasks,
                loggedInUser: { role: 'Yönetici' },
                getTaskMap: () => ({ 'biz-1': tasks }),
                invalidateBizMapCache: jest.fn(),
            },
            DataService: {
                apiRequest: jest.fn().mockResolvedValue(biz),
                mapBusiness: (value) => value,
            },
            ContactParity: {
                isPlaceholderContactName: (name) => ['yok', 'isimsiz / genel', '-', 'belirtilmemiş', 'belirtilmemis', '']
                    .includes(String(name || '').trim().toLocaleLowerCase('tr-TR')),
                buildBusinessContactSnapshot: () => ({
                    primaryContact: { name: 'Yok', phones: [], emails: [] },
                    otherContacts: [{ name: 'Berna Hanim', phones: ['05442046786'], emails: [] }],
                }),
            },
            formatDate: () => '05.04.2026 10:00',
            showToast: jest.fn(),
            closeModal: jest.fn(),
            setTimeout: (fn) => {
                fn();
                return 0;
            },
        });

        global.renderBizTaskHistoryPage = jest.fn();

        await controller.openDetailModal('biz-1');

        expect(businessDetailArea.innerHTML).toContain('Berna Hanim');
        expect(businessDetailArea.innerHTML).toContain('1. YETKİLİ (SON GÖRÜŞÜLEN)');
        expect(businessDetailArea.innerHTML).toContain('https://example.com/base-campaign');
        expect(businessDetailArea.innerHTML).toContain('https://example.com/task-campaign');
        expect(businessDetailModal.style.display).toBe('flex');
    });

    it('promotes a real extra contact to the primary card even when placeholder primary still has a phone', async () => {
        const businessDetailArea = createElement();
        const businessDetailModal = createElement({ style: {}, classList: { add: jest.fn() } });
        const elements = {
            modalContentArea: createElement(),
            businessDetailArea,
            businessDetailModal,
        };
        const document = createDocument(elements);

        const biz = {
            id: 'biz-2',
            companyName: 'Acme 2',
            createdAt: '2026-04-05T10:00:00.000Z',
            contactName: 'Yok',
            contactPhone: '02125550000',
            contactEmail: '',
            extraContacts: [{ name: 'Berna Hanim', phone: '0544 204 67 86', email: '' }],
            businessStatus: 'Aktif',
            city: 'Istanbul',
        };

        const { controller } = loadController('controllers/businessController.js', 'BusinessController', {
            document,
            AppState: {
                businesses: [biz],
                tasks: [],
                loggedInUser: { role: 'Yönetici' },
                getTaskMap: () => ({ 'biz-2': [] }),
                invalidateBizMapCache: jest.fn(),
            },
            DataService: {
                apiRequest: jest.fn().mockResolvedValue(biz),
                mapBusiness: (value) => value,
            },
            ContactParity: {
                isPlaceholderContactName: (name) => ['yok', 'isimsiz / genel', '-', 'belirtilmemiş', 'belirtilmemis', '']
                    .includes(String(name || '').trim().toLocaleLowerCase('tr-TR')),
                buildBusinessContactSnapshot: () => ({
                    primaryContact: { name: 'Yok', phones: ['02125550000'], emails: [] },
                    otherContacts: [{ name: 'Berna Hanim', phones: ['05442046786'], emails: [] }],
                }),
            },
            formatDate: () => '05.04.2026 10:00',
            showToast: jest.fn(),
            closeModal: jest.fn(),
            setTimeout: (fn) => {
                fn();
                return 0;
            },
        });

        global.renderBizTaskHistoryPage = jest.fn();

        await controller.openDetailModal('biz-2');

        expect(businessDetailArea.innerHTML).toContain('Berna Hanim');
        expect(businessDetailArea.innerHTML).toContain('0544 204 67 86');
    });

    it('removes stale cached business entries when detail endpoint returns 404', async () => {
        const businessDetailArea = createElement();
        const businessDetailModal = createElement({ style: {}, classList: { add: jest.fn() } });
        const elements = {
            modalContentArea: createElement(),
            businessDetailArea,
            businessDetailModal,
        };
        const document = createDocument(elements);
        const showToast = jest.fn();
        const invalidateBizMapCache = jest.fn();

        const appState = {
            businesses: [
                {
                    id: 'missing-biz',
                    companyName: 'Ghost Co',
                    businessStatus: 'Aktif',
                },
            ],
            tasks: [],
            loggedInUser: { role: 'Yönetici' },
            getTaskMap: () => ({}),
            invalidateBizMapCache,
        };

        const { controller } = loadController('controllers/businessController.js', 'BusinessController', {
            document,
            AppState: appState,
            DataService: {
                apiRequest: jest.fn().mockRejectedValue(Object.assign(new Error('Business not found'), { status: 404 })),
                mapBusiness: (value) => value,
            },
            ContactParity: {
                isPlaceholderContactName: () => false,
                buildBusinessContactSnapshot: () => ({
                    primaryContact: { name: 'Test', phones: [], emails: [] },
                    otherContacts: [],
                }),
            },
            formatDate: () => '05.04.2026 10:00',
            showToast,
            closeModal: jest.fn(),
            setTimeout: (fn) => {
                fn();
                return 0;
            },
        });

        await controller.openDetailModal('missing-biz');

        expect(appState.businesses).toEqual([]);
        expect(invalidateBizMapCache).toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith('Bu isletme kaydi artik bulunamiyor. Liste yenilendi.', 'warning');
        expect(businessDetailModal.style.display).not.toBe('flex');
    });

    it('keeps row numbers and follow-up dates when preparing CSV import chunks', async () => {
        const importButton = createElement({ innerText: 'Verileri İçeri Aktar 🚀' });
        const csvInput = createElement({
            files: [{ name: 'import.csv' }],
            value: 'import.csv',
        });
        const assigneeSelect = createElement({ value: 'user-42' });
        const loader = createElement({ style: {} });
        const elements = {
            csvFileInput: csvInput,
            csvAssigneeSelect: assigneeSelect,
            'global-loader': loader,
        };

        const rows = [
            ['İşletme Adı', 'Yetkili', 'Telefon', 'Kampanya Linki', 'Aranacak Tarih', 'Loglama'],
            ['Alpha Ltd', 'Ayse', '05321112233', 'https://example.com/a', '01/01/25', 'ilk not'],
            ['Beta Ltd', 'Mehmet', '05334445566', 'https://example.com/b', '44927', 'ikinci not'],
        ];

        const document = {
            ...createDocument(elements),
            querySelector: jest.fn((selector) => {
                if (selector === 'button[onclick="importCSV()"]') return importButton;
                return null;
            }),
        };

        const apiRequest = jest.fn().mockResolvedValue({
                addedBizCount: 1,
                addedTaskCount: 2,
                processedRowCount: 2,
                failedRowCount: 0,
                warningCount: 1,
                warnings: [
                    {
                        rowNumber: 2,
                        companyName: 'Alpha Ltd',
                        field: 'taskTarihi',
                        originalValue: '25.06.3202',
                        fallbackValue: '2000-01-01T12:00:00.000Z',
                        message: 'Geçersiz görev tarihi 01.01.2000 olarak kaydedildi: 25.06.3202',
                    },
                ],
                errors: [],
            });

        const showToast = jest.fn();
        const addSystemLog = jest.fn();

        const { controller } = loadController('controllers/businessController.js', 'BusinessController', {
            document,
            AppState: {
                isBizSearched: false,
            },
            Papa: {
                parse: (_file, options) => {
                    rows.forEach((row) => options.step({ data: row }));
                    return options.complete();
                },
            },
            askConfirm: (_message, callback) => callback(true),
            showToast,
            addSystemLog,
            CsvImportUtils,
            DataService: { apiRequest },
            console: { ...console, groupCollapsed: jest.fn(), table: jest.fn(), groupEnd: jest.fn(), error: jest.fn() },
        });

        await controller.importCSV();
        await new Promise((resolve) => setImmediate(resolve));

        expect(apiRequest).toHaveBeenCalledTimes(1);
        const [path, request] = apiRequest.mock.calls[0];
        const payload = JSON.parse(request.body);
        expect(path).toBe('/accounts/import');
        expect(payload.defaultAssigneeId).toBe('user-42');
        expect(payload.rows).toEqual([
            expect.objectContaining({
                rowNumber: 2,
                companyName: 'Alpha Ltd',
                campaignUrl: 'https://example.com/a',
                aranacakTarih: '01/01/25',
            }),
            expect.objectContaining({
                rowNumber: 3,
                companyName: 'Beta Ltd',
                campaignUrl: 'https://example.com/b',
                aranacakTarih: '44927',
            }),
        ]);
        expect(loader.innerHTML).toContain('Uyarı: 1');
        expect(importButton.disabled).toBe(false);
        expect(importButton.innerText).toBe('Verileri İçeri Aktar 🚀');
        expect(showToast).toHaveBeenCalledWith(
            'İçe aktarma tamamlandı. 1 yeni işletme, 2 görev eklendi, 1 tarih alanı 01.01.2000\'a alındı.',
            'info'
        );
        expect(addSystemLog).toHaveBeenCalledWith(
            "CSV IMPORT: 1 işletme, 2 görev eklendi. 1 tarih alanı 01.01.2000'a alındı."
        );
    });

    it('detects a blank-header status column and sends imported task statuses', async () => {
        const importButton = createElement({ innerText: 'Verileri İçeri Aktar 🚀' });
        const csvInput = createElement({
            files: [{ name: 'import.csv' }],
            value: 'import.csv',
        });
        const assigneeSelect = createElement({ value: 'UNASSIGNED' });
        const loader = createElement({ style: {} });
        const elements = {
            csvFileInput: csvInput,
            csvAssigneeSelect: assigneeSelect,
            'global-loader': loader,
        };

        const rows = [
            ['İşletme Adı', 'Loglama', '', 'Task Yaratma Tarihi', 'Son Satışçı'],
            ['Alpha Ltd', 'ilk not', 'hot', '01/01/25', 'Ayse'],
            ['Beta Ltd', 'ikinci not', 'not hot', '02/01/25', 'Mehmet'],
        ];

        const document = {
            ...createDocument(elements),
            querySelector: jest.fn((selector) => {
                if (selector === 'button[onclick="importCSV()"]') return importButton;
                return null;
            }),
        };

        const apiRequest = jest.fn().mockResolvedValue({
            addedBizCount: 1,
            addedTaskCount: 2,
            processedRowCount: 2,
            failedRowCount: 0,
            warningCount: 0,
            warnings: [],
            errors: [],
        });

        const { controller } = loadController('controllers/businessController.js', 'BusinessController', {
            document,
            AppState: {
                isBizSearched: false,
            },
            Papa: {
                parse: (_file, options) => {
                    rows.forEach((row) => options.step({ data: row }));
                    return options.complete();
                },
            },
            askConfirm: (_message, callback) => callback(true),
            showToast: jest.fn(),
            addSystemLog: jest.fn(),
            CsvImportUtils,
            DataService: { apiRequest },
            console: { ...console, groupCollapsed: jest.fn(), table: jest.fn(), groupEnd: jest.fn(), error: jest.fn() },
        });

        await controller.importCSV();
        await new Promise((resolve) => setImmediate(resolve));

        const [, request] = apiRequest.mock.calls[0];
        const payload = JSON.parse(request.body);
        expect(payload.rows).toEqual([
            expect.objectContaining({ companyName: 'Alpha Ltd', durum: 'hot' }),
            expect.objectContaining({ companyName: 'Beta Ltd', durum: 'not hot' }),
        ]);
    });

    it('includes businesses when any historical task matches the selected category filter', () => {
        const elements = {
            selectAllBiz: createElement({ checked: false }),
            btnClearBizFilters: createElement({ style: {} }),
            filterBizName: createElement({ value: '' }),
            filterBizCategory: createElement({ value: 'İftar (Core)' }),
            filterBizSubCategory: createElement({ value: '' }),
            filterBizCity: createElement({ value: '' }),
            filterBizDateStart: createElement({ value: '' }),
            filterBizDateEnd: createElement({ value: '' }),
            filterBizAssignee: createElement({ value: '' }),
            filterBizStatus: createElement({ value: 'Aktif' }),
        };
        const document = createDocument(elements);

        const biz = {
            id: 'biz-1',
            companyName: 'Acme',
            contactPhone: '',
            businessStatus: 'Aktif',
            city: 'Istanbul',
            createdAt: '2026-04-01T10:00:00.000Z',
        };
        const tasks = [
            {
                id: 'task-new',
                businessId: 'biz-1',
                status: 'new',
                assignee: 'Ayse',
                mainCategory: 'Yemek (Core)',
                subCategory: 'Akşam Yemeği',
                sourceType: 'Fresh Account',
                createdAt: '2026-04-06T10:00:00.000Z',
            },
            {
                id: 'task-old',
                businessId: 'biz-1',
                status: 'deal',
                assignee: 'Ayse',
                mainCategory: 'Yemek',
                subCategory: 'Iftar',
                sourceType: 'Old Account',
                createdAt: '2026-03-15T10:00:00.000Z',
            },
        ];

        const { controller } = loadController('controllers/businessController.js', 'BusinessController', {
            document,
            AppState: {
                businesses: [biz],
                users: [{ name: 'Ayse', team: 'Team 1' }],
                getTaskMap: () => ({ 'biz-1': tasks }),
            },
            normalizeText: (value) => String(value || '').toLocaleLowerCase('tr-TR'),
            matchesCategoryFilter: (taskLike, mainFilter, subFilter) => {
                const joined = `${taskLike?.mainCategory || ''} ${taskLike?.subCategory || ''}`.toLocaleLowerCase('tr-TR');
                if (mainFilter && !/(iftar|ıftar)/.test(joined)) return false;
                if (subFilter && !joined.includes(String(subFilter).toLocaleLowerCase('tr-TR'))) return false;
                return true;
            },
            matchesTaskHistoryCategoryFilter: (taskList) => taskList.some((task) => {
                const joined = `${task.mainCategory || ''} ${task.subCategory || ''}`.toLocaleLowerCase('tr-TR');
                return /(iftar|ıftar)/.test(joined);
            }),
            isActiveTask: (status) => ['new', 'hot', 'nothot', 'followup'].includes(String(status || '').toLowerCase()),
        });

        controller._isBizSearched = true;
        controller._renderList = jest.fn();

        controller.search(true);

        expect(controller._currentFilteredBiz).toHaveLength(1);
        expect(controller._currentFilteredBiz[0].id).toBe('biz-1');
    });

    it('resolves assignee owner id with Turkish characters when creating a task from business detail', async () => {
        const inlineButton = createElement({ disabled: false, innerText: 'Görevi Başlat' });
        const elements = {
            inl_assigneeDropdown: createElement({ value: 'Ozge Ergun' }),
            inl_assignTaskDetails: createElement({ value: '' }),
            inl_assignTaskCat: createElement({ value: 'İstanbul Core' }),
            inl_assignMainCat: createElement({ value: 'Yemek' }),
            inl_assignSubCat: createElement({ value: 'İftar' }),
            inl_assignSourceType: createElement({ value: 'Fresh Account' }),
            inl_assignCampaignUrl: createElement({ value: '' }),
            inl_assignUseExistingContact: createElement({ checked: true }),
            allActiveTaskList: createElement(),
            allTasksPagination: createElement(),
        };
        const document = {
            ...createDocument(elements),
            querySelector: jest.fn((selector) => {
                if (selector === `button[onclick="saveInlineAssignedTask('biz-1')"]`) return inlineButton;
                return null;
            }),
            querySelectorAll: jest.fn(() => []),
        };
        const apiRequest = jest.fn()
            .mockResolvedValueOnce({ id: 'task_1' })
            .mockResolvedValueOnce({
                id: 'task_1',
                businessId: 'biz-1',
                ownerId: 'sales_1',
                assignee: 'Özge Ergün',
                status: 'new',
            });

        const { controller } = loadController('controllers/businessController.js', 'BusinessController', {
            document,
            AppState: {
                businesses: [{ id: 'biz-1', companyName: 'Acme' }],
                tasks: [],
                users: [{ id: 'sales_1', name: 'Özge Ergün', email: 'ozge@example.com', role: 'Satış Temsilcisi', status: 'Aktif' }],
                loggedInUser: { role: 'Yönetici', name: 'Admin' },
                getTaskMap: () => ({ 'biz-1': [] }),
                getBizMap: () => new Map([['biz-1', { companyName: 'Acme' }]]),
            },
            DataService: {
                apiRequest,
                readPath: jest.fn().mockResolvedValue({
                    id: 'task_1',
                    businessId: 'biz-1',
                    ownerId: 'sales_1',
                    assignee: 'Özge Ergün',
                    status: 'new',
                }),
            },
            normalizeForComparison: (value) => String(value || '').toLocaleLowerCase('tr-TR')
                .replace(/[çğıöşü]/g, (char) => ({ ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u' }[char] || char))
                .replace(/[^a-z0-9]/g, ''),
            isValidPhone: () => true,
            isValidEmail: () => true,
            esc: (value) => String(value || ''),
            isCampaignUrlRequiredSource: () => false,
            addSystemLog: jest.fn(),
            showToast: jest.fn(),
            setTimeout: (fn) => { fn(); return 0; },
            renderBizTaskHistoryPage: jest.fn(),
            isActiveTask: (status) => ['new', 'hot', 'nothot', 'followup'].includes(String(status || '').toLowerCase()),
        });

        controller.saveNewAssignedTask('biz-1');
        await Promise.resolve();
        await Promise.resolve();

        expect(apiRequest).toHaveBeenCalledWith('/tasks', expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"ownerId":"sales_1"'),
        }));
    });
});
