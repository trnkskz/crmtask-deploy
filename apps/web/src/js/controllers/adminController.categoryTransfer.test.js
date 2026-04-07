const { loadController, createDocument, createElement } = require('../testUtils/controllerTestUtils');

function createSelect(overrides = {}) {
    return createElement({
        innerHTML: '',
        value: '',
        add: jest.fn(),
        ...overrides,
    });
}

describe('AdminController category safety and migration', () => {
    it('opens transfer modal when only business records still use the category', () => {
        const elements = {
            catTransferMessage: createElement({ innerHTML: '' }),
            catTransferNewMain: createSelect(),
            catTransferNewSub: createSelect(),
            categoryTransferModal: createElement({ style: { display: 'none' } }),
        };
        const document = createDocument(elements);
        const saveCategories = jest.fn().mockResolvedValue({});

        const { context } = loadController('controllers/adminController.js', 'AdminController', {
            document,
            Option: function Option(label, value) { return { label, value }; },
            AppState: {
                dynamicCategories: {
                    'İftar (Core)': ['Restoranda İftar'],
                    'Yemek (Core)': ['Akşam Yemeği'],
                },
                tasks: [],
                businesses: [{ id: 'biz-1', mainCategory: 'İftar (Core)', subCategory: 'Restoranda İftar' }],
            },
            DataService: { saveCategories },
            showToast: jest.fn(),
            showProgressOverlay: jest.fn(),
            updateProgressOverlay: jest.fn(),
            hideProgressOverlay: jest.fn(),
            addSystemLog: jest.fn(),
            askConfirm: jest.fn(),
        });

        context.window.removeSystemMainCategory('İftar (Core)');

        expect(elements.categoryTransferModal.style.display).toBe('flex');
        expect(elements.catTransferMessage.innerHTML).toContain('1 işletme kaydı');
        expect(saveCategories).not.toHaveBeenCalled();
    });

    it('opens transfer modal when tasks still use the category even if there is no linked business id', () => {
        const elements = {
            catTransferMessage: createElement({ innerHTML: '' }),
            catTransferNewMain: createSelect(),
            catTransferNewSub: createSelect(),
            categoryTransferModal: createElement({ style: { display: 'none' } }),
        };
        const document = createDocument(elements);
        const saveCategories = jest.fn().mockResolvedValue({});

        const { context } = loadController('controllers/adminController.js', 'AdminController', {
            document,
            Option: function Option(label, value) { return { label, value }; },
            AppState: {
                dynamicCategories: {
                    'İftar (Core)': ['Restoranda İftar'],
                    'Yemek (Core)': ['Akşam Yemeği'],
                },
                tasks: [{
                    id: 'task-legacy-1',
                    businessId: '',
                    mainCategory: 'İftar (Core)',
                    subCategory: 'Restoranda İftar',
                }],
                businesses: [],
            },
            DataService: { saveCategories },
            showToast: jest.fn(),
            showProgressOverlay: jest.fn(),
            updateProgressOverlay: jest.fn(),
            hideProgressOverlay: jest.fn(),
            addSystemLog: jest.fn(),
            askConfirm: jest.fn(),
        });

        context.window.removeSystemMainCategory('İftar (Core)');

        expect(elements.categoryTransferModal.style.display).toBe('flex');
        expect(elements.catTransferMessage.innerHTML).toContain('1 görev');
        expect(saveCategories).not.toHaveBeenCalled();
    });

    it('transfers both tasks and businesses before deleting the category', async () => {
        const elements = {
            catTransferMessage: createElement({ innerHTML: '' }),
            catTransferNewMain: createSelect({ value: 'Yemek (Core)' }),
            catTransferNewSub: createSelect({ value: 'Akşam Yemeği' }),
            categoryTransferModal: createElement({ style: { display: 'none' } }),
        };
        const document = createDocument(elements);
        const saveCategories = jest.fn().mockResolvedValue({});
        const apiRequest = jest.fn().mockResolvedValue({});
        const addSystemLog = jest.fn();
        const showToast = jest.fn();

        const { context } = loadController('controllers/adminController.js', 'AdminController', {
            document,
            Option: function Option(label, value) { return { label, value }; },
            AppState: {
                dynamicCategories: {
                    'İftar (Core)': ['Restoranda İftar'],
                    'Yemek (Core)': ['Akşam Yemeği'],
                },
                tasks: [{
                    id: 'task-1',
                    businessId: 'biz-1',
                    mainCategory: 'İftar (Core)',
                    subCategory: 'Restoranda İftar',
                }],
                businesses: [{
                    id: 'biz-1',
                    companyName: 'Acme',
                    mainCategory: 'İftar (Core)',
                    subCategory: 'Restoranda İftar',
                }],
                isBizSearched: false,
            },
            DataService: { saveCategories, apiRequest },
            showToast,
            showProgressOverlay: jest.fn(),
            updateProgressOverlay: jest.fn(),
            hideProgressOverlay: jest.fn(),
            addSystemLog,
            askConfirm: jest.fn(),
        });

        context.window.openCategoryTransferModal('main', 'İftar (Core)', null, null, 1);
        context.window.executeCategoryTransfer();
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));

        expect(saveCategories).toHaveBeenCalled();
        expect(apiRequest).toHaveBeenCalledWith('/tasks/task-1', expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ mainCategory: 'Yemek (Core)', subCategory: 'Akşam Yemeği' }),
        }));
        expect(apiRequest).toHaveBeenCalledWith('/accounts/biz-1', expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ mainCategory: 'Yemek (Core)', subCategory: 'Akşam Yemeği' }),
        }));
        expect(context.AppState.tasks[0].mainCategory).toBe('Yemek (Core)');
        expect(context.AppState.businesses[0].mainCategory).toBe('Yemek (Core)');
        expect(elements.categoryTransferModal.style.display).toBe('none');
        expect(addSystemLog).toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith('1 işletme taşındı ve kategori kalıcı olarak silindi.', 'success');
    });

    it('migrates orphan business categories during Grupanya transition', async () => {
        const document = createDocument({});
        const saveCategories = jest.fn().mockResolvedValue({});
        const apiRequest = jest.fn().mockResolvedValue({});
        const addSystemLog = jest.fn();
        const showToast = jest.fn();

        const { context } = loadController('controllers/adminController.js', 'AdminController', {
            document,
            AppState: {
                dynamicCategories: { Legacy: ['Legacy Sub'] },
                tasks: [],
                businesses: [{
                    id: 'biz-1',
                    companyName: 'Kahvalti Bahcesi',
                    mainCategory: 'Kahvalti',
                    subCategory: 'Serpme',
                    createdAt: '2026-04-01T10:00:00.000Z',
                }],
                isBizSearched: false,
                getBizMap: () => new Map([['biz-1', { id: 'biz-1', companyName: 'Kahvalti Bahcesi' }]]),
            },
            DataService: { saveCategories, apiRequest },
            resolveCanonicalCategory: () => ({
                mainCategory: 'Kahvaltı (Core)',
                subCategory: 'Serpme Kahvaltı',
                matched: true,
            }),
            askConfirm: (_message, cb) => cb(true),
            showToast,
            showProgressOverlay: jest.fn(),
            updateProgressOverlay: jest.fn(),
            hideProgressOverlay: jest.fn(),
            addSystemLog,
        });

        context.window.executeGrupanyaMigration();
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));

        expect(saveCategories).toHaveBeenCalled();
        expect(apiRequest).toHaveBeenCalledWith('/accounts/biz-1', expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ mainCategory: 'Kahvaltı (Core)', subCategory: 'Serpme Kahvaltı' }),
        }));
        expect(context.AppState.businesses[0].mainCategory).toBe('Kahvaltı (Core)');
        expect(context.AppState.dynamicCategories['Eski Kategoriler']).toEqual([]);
        expect(addSystemLog).toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Sistem Grupanya standartlarına geçti.'), 'success');
    });

    it('does not show success when Grupanya transition patches fail and requests a sync refresh', async () => {
        const document = createDocument({});
        const saveCategories = jest.fn().mockResolvedValue({});
        const apiRequest = jest.fn()
            .mockResolvedValueOnce({})
            .mockRejectedValueOnce(new Error('patch failed'));
        const showToast = jest.fn();
        const requestSync = jest.fn();

        const { context } = loadController('controllers/adminController.js', 'AdminController', {
            document,
            AppState: {
                dynamicCategories: { Legacy: ['Legacy Sub'] },
                tasks: [{
                    id: 'task-1',
                    businessId: 'biz-1',
                    mainCategory: 'Kahvalti',
                    subCategory: 'Serpme',
                    createdAt: '2026-04-01T10:00:00.000Z',
                }],
                businesses: [{
                    id: 'biz-1',
                    companyName: 'Kahvalti Bahcesi',
                    mainCategory: 'Kahvalti',
                    subCategory: 'Serpme',
                    createdAt: '2026-04-01T10:00:00.000Z',
                }],
                isBizSearched: false,
                getBizMap: () => new Map([['biz-1', { id: 'biz-1', companyName: 'Kahvalti Bahcesi' }]]),
            },
            DataService: { saveCategories, apiRequest },
            SyncService: { requestSync },
            resolveCanonicalCategory: () => ({
                mainCategory: 'Kahvaltı (Core)',
                subCategory: 'Serpme Kahvaltı',
                matched: true,
            }),
            askConfirm: (_message, cb) => cb(true),
            showToast,
            showProgressOverlay: jest.fn(),
            updateProgressOverlay: jest.fn(),
            hideProgressOverlay: jest.fn(),
            addSystemLog: jest.fn(),
        });

        context.window.executeGrupanyaMigration();
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));

        expect(requestSync).toHaveBeenCalledWith(['tasks', 'businesses', 'categories']);
        expect(showToast).toHaveBeenCalledWith(expect.stringContaining('kalici olarak guncellenemedi'), 'error');
    });
});
