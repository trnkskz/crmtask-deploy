const { loadController, createDocument, createElement } = require('../testUtils/controllerTestUtils');

describe('DropdownController project filters', () => {
    function createSelectElement() {
        return {
            innerHTML: '',
            options: [],
            add(option) {
                this.options.push(option);
            },
            appendChild(node) {
                this.options.push(node);
            },
        };
    }

    function buildController(extraContext = {}) {
        const filterAllTasksProject = createSelectElement();
        const repFilterProject = createSelectElement();
        const passiveFilterProject = createSelectElement();
        const document = createDocument({
            filterAllTasksProject,
            repFilterProject,
            passiveFilterProject,
        });

        const context = {
            document,
            AppState: {
                projects: [],
                tasks: [],
                users: [],
                loggedInUser: { role: 'Yönetici' },
                getProjectTaskMap() { return {}; },
            },
            Option: function Option(label, value) {
                return { label, value };
            },
            isVisibleTaskListProjectTask: (task) => {
                if (!task) return false;
                if (['UNASSIGNED', 'Team 1', 'Team 2', 'TARGET_POOL'].includes(task.assignee)) return false;
                if (['deal', 'cold'].includes(task.status)) return false;
                if (task.status === 'pending_approval') return false;
                return Boolean(task.projectId);
            },
            ...extraContext,
        };

        const { controller } = loadController('controllers/dropdownController.js', 'DropdownController', context);
        return { controller, filterAllTasksProject };
    }

    it('includes projects that have visible active tasks even if status is not in the old hardcoded list', () => {
        const { controller, filterAllTasksProject } = buildController({
            AppState: {
                projects: [{ id: 'proj-1', name: 'Visible Project' }],
                tasks: [{ id: 'task-1', projectId: 'proj-1', assignee: 'Ayşe', status: 'call_today' }],
                users: [],
                loggedInUser: { role: 'Yönetici' },
                getProjectTaskMap() {
                    return {
                        'proj-1': [{ id: 'task-1', projectId: 'proj-1', assignee: 'Ayşe', status: 'call_today' }],
                    };
                },
            },
        });

        controller.populateProjectDropdowns();

        expect(filterAllTasksProject.options).toEqual([{ label: 'Visible Project', value: 'proj-1' }]);
    });

    it('keeps pool-only projects out of the active task project filter', () => {
        const { controller, filterAllTasksProject } = buildController({
            AppState: {
                projects: [{ id: 'proj-2', name: 'Pool Only Project' }],
                tasks: [{ id: 'task-2', projectId: 'proj-2', assignee: 'TARGET_POOL', status: 'new' }],
                users: [],
                loggedInUser: { role: 'Yönetici' },
                getProjectTaskMap() {
                    return {
                        'proj-2': [{ id: 'task-2', projectId: 'proj-2', assignee: 'TARGET_POOL', status: 'new' }],
                    };
                },
            },
        });

        controller.populateProjectDropdowns();

        expect(filterAllTasksProject.options).toEqual([]);
    });

    it('keeps empty draft projects visible in assignee dropdown project targets', () => {
        const newBizAssignee = createSelectElement();
        const document = createDocument({
            filterAllTasksProject: createSelectElement(),
            repFilterProject: createSelectElement(),
            passiveFilterProject: createSelectElement(),
            newBizAssignee,
            assigneeDropdown: createSelectElement(),
            existAssigneeSelect: createSelectElement(),
            filterAllTasksAssignee: createSelectElement(),
            repFilterAssignee: createSelectElement(),
            passiveFilterAssignee: createSelectElement(),
            filterBizAssignee: createSelectElement(),
            csvAssigneeSelect: createSelectElement(),
            transferAssigneeSelect: createSelectElement(),
        });
        document.createElement = jest.fn(() => ({
            style: {},
            className: '',
            innerHTML: '',
            children: [],
            appendChild(node) {
                this.children.push(node);
            },
        }));

        const { controller } = loadController('controllers/dropdownController.js', 'DropdownController', {
            document,
            AppState: {
                projects: [{ id: 'proj-draft', name: 'Taslak Proje' }],
                tasks: [],
                users: [{ name: 'Ayse', role: 'Satış Temsilcisi', status: 'Aktif', team: 'Team 1' }],
                loggedInUser: { role: 'Yönetici' },
                getProjectTaskMap() { return {}; },
            },
            Option: function Option(label, value) {
                return { label, value };
            },
            normalizeForComparison: (value) => String(value || '').toLowerCase(),
        });

        controller.updateAssigneeDropdowns();

        const projectGroup = newBizAssignee.options.find((option) => option.label === '🎯 Hedef Proje Listesine Ekle');
        expect(projectGroup.children).toEqual([{ label: 'Proje: Taslak Proje', value: 'TARGET_POOL_proj-draft' }]);
    });

    it('keeps active assignees under Personeller even when users list is unavailable', () => {
        const passiveFilterAssignee = createSelectElement();
        const document = createDocument({
            filterAllTasksProject: createSelectElement(),
            repFilterProject: createSelectElement(),
            passiveFilterProject: createSelectElement(),
            newBizAssignee: createSelectElement(),
            assigneeDropdown: createSelectElement(),
            existAssigneeSelect: createSelectElement(),
            filterAllTasksAssignee: createSelectElement(),
            repFilterAssignee: createSelectElement(),
            passiveFilterAssignee,
            filterBizAssignee: createSelectElement(),
            csvAssigneeSelect: createSelectElement(),
            transferAssigneeSelect: createSelectElement(),
        });
        document.createElement = jest.fn(() => ({
            style: {},
            className: '',
            innerHTML: '',
            children: [],
            appendChild(node) {
                this.children.push(node);
            },
        }));

        const { controller } = loadController('controllers/dropdownController.js', 'DropdownController', {
            document,
            AppState: {
                projects: [],
                users: [],
                tasks: [
                    { assignee: 'Elif Yavuzaslan', status: 'new' },
                    { assignee: 'Nazlı Polat', status: 'followup' },
                    { assignee: 'Eski Personel', status: 'deal' },
                ],
                loggedInUser: { role: 'Satış Temsilcisi' },
                getProjectTaskMap() { return {}; },
            },
            Option: function Option(label, value) {
                return { label, value };
            },
            normalizeForComparison: (value) => String(value || '').toLowerCase(),
            isActiveTask: (status) => ['new', 'hot', 'nothot', 'followup'].includes(status),
        });

        controller.updateAssigneeDropdowns();

        const personnelGroup = passiveFilterAssignee.options.find((option) => option.label === 'Personeller');
        const archivedGroup = passiveFilterAssignee.options.find((option) => option.label === 'Arşiv / Eski Personeller');

        expect(personnelGroup.children).toEqual([
            { label: 'Elif Yavuzaslan', value: 'Elif Yavuzaslan' },
            { label: 'Nazlı Polat', value: 'Nazlı Polat' },
        ]);
        expect(archivedGroup.children).toEqual([
            { label: 'Eski Personel', value: 'Eski Personel' },
        ]);
    });

    it('does not re-add team leaders into Personeller from active task history', () => {
        const newBizAssignee = createSelectElement();
        const document = createDocument({
            filterAllTasksProject: createSelectElement(),
            repFilterProject: createSelectElement(),
            passiveFilterProject: createSelectElement(),
            newBizAssignee,
            assigneeDropdown: createSelectElement(),
            existAssigneeSelect: createSelectElement(),
            filterAllTasksAssignee: createSelectElement(),
            repFilterAssignee: createSelectElement(),
            passiveFilterAssignee: createSelectElement(),
            filterBizAssignee: createSelectElement(),
            csvAssigneeSelect: createSelectElement(),
            transferAssigneeSelect: createSelectElement(),
        });
        document.createElement = jest.fn(() => ({
            style: {},
            className: '',
            innerHTML: '',
            children: [],
            appendChild(node) {
                this.children.push(node);
            },
        }));

        const { controller } = loadController('controllers/dropdownController.js', 'DropdownController', {
            document,
            AppState: {
                projects: [],
                users: [
                    { name: 'Turan Kuşaksız', role: 'Takım Lideri', status: 'Aktif', team: 'Team 1' },
                    { name: 'Elif Yavuzaslan', role: 'Satış Temsilcisi', status: 'Aktif', team: 'Team 1' },
                ],
                tasks: [
                    { assignee: 'Turan Kuşaksız', status: 'followup' },
                    { assignee: 'Elif Yavuzaslan', status: 'new' },
                ],
                loggedInUser: { role: 'Yönetici' },
                getProjectTaskMap() { return {}; },
            },
            Option: function Option(label, value) {
                return { label, value };
            },
            normalizeForComparison: (value) => String(value || '').toLowerCase(),
            isActiveTask: (status) => ['new', 'hot', 'nothot', 'followup'].includes(status),
        });

        controller.updateAssigneeDropdowns();

        const personnelGroup = newBizAssignee.options.find((option) => option.label === 'Personeller');
        expect(personnelGroup.children).toEqual([
            { label: 'Elif Yavuzaslan', value: 'Elif Yavuzaslan' },
        ]);
    });
});
