const { loadController, createDocument, createElement } = require('../testUtils/controllerTestUtils');
const TaskSavePayload = require('../utils/taskSavePayload');

describe('TaskController.executeSaveAction', () => {
    it('sends deal details and manual note together in a single PATCH request', async () => {
        const apiRequest = jest.fn().mockResolvedValue({});
        const readPath = jest.fn().mockResolvedValue({ id: 'task-1', status: 'deal' });
        const showToast = jest.fn();

        const elements = {
            btnSaveModalLog: createElement({ innerText: 'Kaydet 🚀' }),
            modalLogInput: createElement({ value: 'Manuel kapanis notu' }),
        };
        const document = createDocument(elements);

        const tasks = [{ id: 'task-1', status: 'hot' }];
        const { controller, context } = loadController('controllers/taskController.js', 'TaskController', {
            document,
            AppState: {
                tasks,
                loggedInUser: { id: 'user-1', name: 'Deneme Kullanici' },
                invalidateTaskMapCache: jest.fn(),
            },
            DataService: {
                apiRequest,
                readPath,
                addSystemLog: jest.fn(),
            },
            TASK_STATUS_LABELS: {},
            PASSIVE_STATUSES: [],
            showToast,
            esc: (value) => value,
            TaskSavePayload,
            formatDate: () => '06.04.2026 10:00',
            closeModal: jest.fn(),
            askConfirm: jest.fn(),
            isToday: () => false,
            isActiveTask: () => true,
            normalizeText: (value) => value,
            matchesCategoryFilter: () => true,
        });

        context.window._selectedModalStatus = 'deal';
        context.window._selectedModalLogType = '';
        context.window._dealDetails = {
            commission: '10',
            duration: '3',
            fee: '5000',
            joker: '1',
            campCount: '2',
        };

        await controller.executeSaveAction('task-1');

        expect(apiRequest).toHaveBeenCalledWith(
            '/tasks/task-1',
            expect.objectContaining({
                method: 'PATCH',
                body: expect.any(String),
            }),
        );
        expect(JSON.parse(apiRequest.mock.calls[0][1].body)).toEqual({
            status: 'deal',
            dealDetails: {
                commission: '10',
                duration: '3',
                fee: '5000',
                joker: '1',
                campCount: '2',
            },
            activity: {
                text: '[Deal Notu] Manuel kapanis notu',
                reason: 'GORUSME',
            },
        });
        expect(readPath).toHaveBeenCalledWith('tasks/task-1');
        expect(tasks[0]).toEqual({ id: 'task-1', status: 'deal' });
        expect(showToast).toHaveBeenCalledWith('İşlem başarıyla kaydedildi!', 'success');
        expect(elements.btnSaveModalLog.disabled).toBe(false);
        expect(elements.btnSaveModalLog.innerText).toBe('Kaydet 🚀');
        expect(context.window._dealDetails).toBeNull();
    });
});
