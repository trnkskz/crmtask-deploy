const { loadController, createDocument, createElement } = require('../testUtils/controllerTestUtils');

describe('AdminController user management', () => {
    it('renders visible users by default without forcing search or team filter', async () => {
        const usersListContainer = createElement();
        const elements = {
            usersListContainer,
            userSearchInput: createElement({ value: '' }),
            userTeamFilter: createElement({ value: '' }),
        };
        const document = createDocument(elements);

        const { context } = loadController('controllers/adminController.js', 'AdminController', {
            document,
            AppState: {
                users: [
                    { name: 'Ayse Kaya', email: 'ayse@example.com', role: 'Satış Temsilcisi', team: 'Team 1', status: 'Aktif' },
                ],
                tasks: [],
                loggedInUser: { email: 'manager@example.com', role: 'Yönetici', team: '-' },
            },
            DataService: {
                apiRequest: jest.fn().mockResolvedValue({
                    records: [{ user: { name: 'Ayse Kaya' }, metrics: { monthly: { open: { count: 2 }, deal: { count: 0 }, cold: { count: 0 } } } }],
                }),
            },
            isActiveTask: () => true,
        });

        context.window.switchAdminTab('users');
        await new Promise((resolve) => setImmediate(resolve));

        expect(usersListContainer.innerHTML).toContain('Ayse Kaya');
        expect(usersListContainer.innerHTML).toContain('2 Açık');
    });

    it('falls back to visible users when a stale team filter does not match any available team', async () => {
        const usersListContainer = createElement();
        const elements = {
            usersListContainer,
            userSearchInput: createElement({ value: '' }),
            userTeamFilter: createElement({ value: 'Team 9' }),
        };
        const document = createDocument(elements);

        const { context } = loadController('controllers/adminController.js', 'AdminController', {
            document,
            AppState: {
                users: [
                    { name: 'Ayse Kaya', email: 'ayse@example.com', role: 'Satış Temsilcisi', team: 'Team 1', status: 'Aktif' },
                ],
                tasks: [],
                loggedInUser: { email: 'manager@example.com', role: 'Yönetici', team: '-' },
            },
            DataService: {
                apiRequest: jest.fn().mockResolvedValue({
                    records: [{ user: { name: 'Ayse Kaya' }, metrics: { monthly: { open: { count: 2 }, deal: { count: 0 }, cold: { count: 0 } } } }],
                }),
            },
            isActiveTask: () => true,
        });

        context.window.switchAdminTab('users');
        await new Promise((resolve) => setImmediate(resolve));

        expect(usersListContainer.innerHTML).toContain('Ayse Kaya');
    });

    it('self-heals by refetching users when the local user state is empty', async () => {
        const usersListContainer = createElement();
        const elements = {
            usersListContainer,
            userSearchInput: createElement({ value: '' }),
            userTeamFilter: createElement({ value: '' }),
        };
        const document = createDocument(elements);
        const fetchOnce = jest.fn().mockResolvedValue([
            { name: 'Ayse Kaya', email: 'ayse@example.com', role: 'Satış Temsilcisi', team: 'Team 1', status: 'Aktif' },
        ]);

        const appState = {
            users: [],
            tasks: [],
            loggedInUser: { email: 'manager@example.com', role: 'Yönetici', team: '-' },
        };

        const { context } = loadController('controllers/adminController.js', 'AdminController', {
            document,
            AppState: appState,
            DataService: {
                fetchOnce,
                apiRequest: jest.fn().mockResolvedValue({
                    records: [{ user: { name: 'Ayse Kaya' }, metrics: { monthly: { open: { count: 2 }, deal: { count: 0 }, cold: { count: 0 } } } }],
                }),
            },
            isActiveTask: () => true,
        });

        context.window.switchAdminTab('users');
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));

        expect(fetchOnce).toHaveBeenCalledWith('users');
        expect(usersListContainer.innerHTML).toContain('Ayse Kaya');
    });

    it('scopes team leaders to their own team in the user list', async () => {
        const usersListContainer = createElement();
        const elements = {
            usersListContainer,
            userSearchInput: createElement({ value: '' }),
            userTeamFilter: createElement({ value: 'Team 2' }),
        };
        const document = createDocument(elements);

        const { context } = loadController('controllers/adminController.js', 'AdminController', {
            document,
            AppState: {
                users: [
                    { name: 'Lider', email: 'lider@example.com', role: 'Takım Lideri', team: 'Team 1', status: 'Aktif' },
                    { name: 'Ayse Kaya', email: 'ayse@example.com', role: 'Satış Temsilcisi', team: 'Team 1', status: 'Aktif' },
                    { name: 'Mehmet', email: 'mehmet@example.com', role: 'Satış Temsilcisi', team: 'Team 2', status: 'Aktif' },
                ],
                tasks: [],
                loggedInUser: { email: 'lider@example.com', role: 'Takım Lideri', team: 'Team 1' },
            },
            DataService: {
                apiRequest: jest.fn().mockResolvedValue({
                    records: [
                        { user: { name: 'Ayse Kaya', team: 'Team 1' }, metrics: { monthly: { open: { count: 4 }, deal: { count: 0 }, cold: { count: 0 } } } },
                        { user: { name: 'Mehmet', team: 'Team 2' }, metrics: { monthly: { open: { count: 8 }, deal: { count: 0 }, cold: { count: 0 } } } },
                    ],
                }),
            },
            isActiveTask: () => true,
        });

        context.window.switchAdminTab('users');
        await new Promise((resolve) => setImmediate(resolve));

        expect(usersListContainer.innerHTML).toContain('Ayse Kaya');
        expect(usersListContainer.innerHTML).not.toContain('Mehmet');
        expect(usersListContainer.innerHTML).toContain('Sadece Görüntüleme');
    });

    it('renders open task counts from the backend pulse summary', async () => {
        const usersListContainer = createElement();
        const elements = {
            usersListContainer,
            userSearchInput: createElement({ value: 'ayse' }),
            userTeamFilter: createElement({ value: '' }),
        };
        const document = createDocument(elements);

        const { controller, context } = loadController('controllers/adminController.js', 'AdminController', {
            document,
            AppState: {
                users: [
                    { name: 'Ayse Kaya', email: 'ayse@example.com', role: 'Satış Temsilcisi', team: 'Team 1', status: 'Aktif' },
                ],
                tasks: [],
            },
            DataService: {
                apiRequest: jest.fn().mockResolvedValue({
                    records: [{ user: { name: 'Ayse Kaya' }, metrics: { monthly: { open: { count: 7 }, deal: { count: 0 }, cold: { count: 0 } } } }],
                }),
            },
            isActiveTask: () => true,
        });

        context.window.switchAdminTab('users');
        await new Promise((resolve) => setImmediate(resolve));

        expect(usersListContainer.innerHTML).toContain('7 Açık');
        expect(controller).toBeTruthy();
    });

    it('sends raw password when creating a new user', async () => {
        const submitButton = createElement({ disabled: false, innerText: '🚀 Yeni Kullanıcıyı Sisteme Ekle' });
        const elements = {
            newUserName: createElement({ value: 'Yeni Kullanici' }),
            newUserEmail: createElement({ value: 'yeni@example.com' }),
            newUserPassword: createElement({ value: 'Secret123!' }),
            newPermExport: createElement({ checked: false }),
            newPermCreateBiz: createElement({ checked: true }),
            newPermDeleteArchive: createElement({ checked: false }),
            newUserManager: createElement({ value: '' }),
            newUserRole: createElement({ value: 'Yönetici' }),
            newUserTeam: createElement({ value: '-' }),
            newUserPhone: createElement({ value: '' }),
        };
        const document = {
            ...createDocument(elements),
            querySelector: jest.fn((selector) => selector === 'button[onclick="saveNewUser()"]' ? submitButton : null),
        };

        const saveUser = jest.fn().mockResolvedValue({});
        const { controller } = loadController('controllers/adminController.js', 'AdminController', {
            document,
            AppState: { users: [], tasks: [], loggedInUser: { email: 'admin@example.com' } },
            DataService: { saveUser, apiRequest: jest.fn() },
            showToast: jest.fn(),
            addSystemLog: jest.fn(),
            closeModal: jest.fn(),
            renderUsers: jest.fn(),
            esc: (value) => value,
            normalizeTeamForRole: (_role, team) => team || '-',
            hashPassword: jest.fn(async (value) => `hashed:${value}`),
        });

        await controller.saveNewUser();

        expect(saveUser).toHaveBeenCalledWith(expect.objectContaining({
            email: 'yeni@example.com',
            password: 'Secret123!',
        }));
        expect(saveUser.mock.calls[0][0].settings.dailyQuota).toBeUndefined();
    });

    it('persists edited passwords through the dedicated password endpoint', async () => {
        const saveButton = createElement({ disabled: false, innerText: '💾 Değişiklikleri Kaydet' });
        const user = {
            id: 'user_1',
            name: 'Eski Ad',
            email: 'user@example.com',
            role: 'Yönetici',
            team: '-',
            phone: '',
            settings: {},
            status: 'Aktif',
        };
        const elements = {
            editUserOriginalEmail: createElement({ value: 'user@example.com' }),
            editUserEmail: createElement({ value: 'user@example.com' }),
            editUserName: createElement({ value: 'Yeni Ad' }),
            editUserPassword: createElement({ value: 'NewSecret123!' }),
            editPermExport: createElement({ checked: false }),
            editPermCreateBiz: createElement({ checked: true }),
            editPermDeleteArchive: createElement({ checked: false }),
            editUserPhone: createElement({ value: '' }),
            editUserRole: createElement({ value: 'Yönetici' }),
            editUserTeam: createElement({ value: '-' }),
            editUserManager: createElement({ value: '' }),
        };
        const document = {
            ...createDocument(elements),
            querySelector: jest.fn((selector) => selector === 'button[onclick="saveEditedUser()"]' ? saveButton : null),
        };

        const saveUser = jest.fn().mockResolvedValue({});
        const apiRequest = jest.fn().mockResolvedValue({});
        const { controller, context } = loadController('controllers/adminController.js', 'AdminController', {
            document,
            AppState: {
                users: [user],
                tasks: [],
                loggedInUser: { email: 'user@example.com' },
            },
            DataService: { saveUser, apiRequest },
            showToast: jest.fn(),
            addSystemLog: jest.fn(),
            closeModal: jest.fn(),
            DropdownController: { updateAssigneeDropdowns: jest.fn() },
            esc: (value) => value,
            normalizeTeamForRole: (_role, team) => team || '-',
            sessionStorage: { setItem: jest.fn() },
        });

        await controller.saveEditedUser();
        await new Promise((resolve) => setImmediate(resolve));

        expect(saveUser).toHaveBeenCalledWith(expect.objectContaining({
            id: 'user_1',
            email: 'user@example.com',
        }));
        expect(saveUser.mock.calls[0][0].settings.dailyQuota).toBeUndefined();
        expect(apiRequest).toHaveBeenCalledWith('/users/user_1/password', expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ password: 'NewSecret123!' }),
        }));
        expect(context.AppState.loggedInUser.name).toBe('Yeni Ad');
    });

    it('uses backend task rows when deciding deletion transfer flow', async () => {
        const elements = {
            transferTaskDesc: createElement(),
            transferTargetUserEmail: createElement(),
            transferActionType: createElement(),
            transferTasksModal: createElement({ style: {} }),
        };
        const document = createDocument(elements);

        const { controller } = loadController('controllers/adminController.js', 'AdminController', {
            document,
            AppState: {
                users: [{ id: 'user_1', name: 'Ayse', email: 'ayse@example.com', role: 'Satış Temsilcisi', team: 'Team 1', status: 'Aktif' }],
                tasks: [],
            },
            askConfirm: jest.fn(),
            showToast: jest.fn(),
            DataService: {
                deleteUser: jest.fn(),
                apiRequest: jest.fn().mockResolvedValue(Array.from({ length: 7 }, (_, index) => ({ id: `task-${index}` }))),
            },
        });

        await controller.requestUserDeletion('ayse@example.com');

        expect(elements.transferTaskDesc.innerHTML).toContain('7 adet GÖREV');
        expect(elements.transferActionType.value).toBe('delete');
        expect(elements.transferTasksModal.style.display).toBe('flex');
    });
});
