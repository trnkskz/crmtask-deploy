describe('DataService persistence helpers', () => {
    function createStorage() {
        const state = new Map();
        return {
            getItem(key) {
                return state.has(key) ? state.get(key) : null;
            },
            setItem(key, value) {
                state.set(key, String(value));
            },
            removeItem(key) {
                state.delete(key);
            },
            clear() {
                state.clear();
            },
        };
    }

    function loadService() {
        jest.resetModules();
        global.window = {
            __API_BASE_URL__: 'http://localhost:3001/api',
            localStorage: createStorage(),
        };
        return require('./dataService');
    }

    afterEach(() => {
        delete global.window;
    });

    it('writes a createdAt-backed system log record to storage', async () => {
        const dataService = loadService();

        await dataService.addSystemLog('CSV IMPORT: 2 işletme, 3 görev eklendi.', 'Ayse');

        const raw = global.window.localStorage.getItem('crm_system_logs_v1');
        const parsed = JSON.parse(raw);
        const firstRecord = Object.values(parsed)[0];

        expect(firstRecord.user).toBe('Ayse');
        expect(firstRecord.action).toBe('CSV IMPORT: 2 işletme, 3 görev eklendi.');
        expect(firstRecord.createdAt).toBeTruthy();
        expect(firstRecord.timestamp).toBeTruthy();
    });

    it('refreshes the access token and retries the original request once', async () => {
        const dataService = loadService();
        global.window.localStorage.setItem('accessToken', 'stale-token');
        global.window.localStorage.setItem('refreshToken', 'refresh-token');

        global.fetch = jest.fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 401,
                text: async () => JSON.stringify({ message: 'Invalid access token' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ accessToken: 'fresh-token' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                text: async () => JSON.stringify([{ id: 'cat-1', label: 'Yeme İçme', children: [] }]),
            });

        const result = await dataService.apiRequest('/lov/categories?mode=TREE');

        expect(result).toEqual([{ id: 'cat-1', label: 'Yeme İçme', children: [] }]);
        expect(global.window.localStorage.getItem('accessToken')).toBe('fresh-token');
        expect(global.fetch).toHaveBeenNthCalledWith(2,
            'http://localhost:3001/api/auth/refresh',
            expect.objectContaining({
                method: 'POST',
                credentials: 'include',
                body: JSON.stringify({ refreshToken: 'refresh-token' }),
            }),
        );
        expect(global.fetch).toHaveBeenNthCalledWith(3,
            'http://localhost:3001/api/lov/categories?mode=TREE',
            expect.objectContaining({
                credentials: 'include',
                headers: expect.objectContaining({ Authorization: 'Bearer fresh-token' }),
            }),
        );
    });

    it('refreshes access token using auth cookies even when refresh token is not stored locally', async () => {
        const dataService = loadService();
        global.window.localStorage.setItem('accessToken', 'stale-token');

        global.fetch = jest.fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 401,
                text: async () => JSON.stringify({ message: 'Authentication required' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ accessToken: 'fresh-cookie-token' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ id: 'proj-1', name: 'Nisan Projesi' }),
            });

        const result = await dataService.apiRequest('/projects', {
            method: 'POST',
            body: JSON.stringify({ name: 'Nisan Projesi' }),
        });

        expect(result).toEqual({ id: 'proj-1', name: 'Nisan Projesi' });
        expect(global.window.localStorage.getItem('accessToken')).toBe('fresh-cookie-token');
        expect(global.fetch).toHaveBeenNthCalledWith(2,
            'http://localhost:3001/api/auth/refresh',
            expect.objectContaining({
                method: 'POST',
                credentials: 'include',
                body: JSON.stringify({}),
            }),
        );
        expect(global.fetch).toHaveBeenNthCalledWith(3,
            'http://localhost:3001/api/projects',
            expect.objectContaining({
                method: 'POST',
                credentials: 'include',
                headers: expect.objectContaining({ Authorization: 'Bearer fresh-cookie-token' }),
            }),
        );
    });

    it('clears stale tokens and retries once without auth when refresh is unavailable', async () => {
        const dataService = loadService();
        global.window.localStorage.setItem('accessToken', 'stale-token');

        global.fetch = jest.fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 401,
                text: async () => JSON.stringify({ message: 'Invalid access token' }),
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 401,
                text: async () => JSON.stringify({ message: 'Missing refresh token' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ ok: true }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                text: async () => JSON.stringify([{ id: 'cat-1', label: 'Yeme İçme', children: [] }]),
            });

        const result = await dataService.apiRequest('/lov/categories?mode=TREE');

        expect(result).toEqual([{ id: 'cat-1', label: 'Yeme İçme', children: [] }]);
        expect(global.window.localStorage.getItem('accessToken')).toBe(null);
        expect(global.fetch).toHaveBeenNthCalledWith(2,
            'http://localhost:3001/api/auth/refresh',
            expect.objectContaining({
                method: 'POST',
                credentials: 'include',
                body: JSON.stringify({}),
            }),
        );
        expect(global.fetch).toHaveBeenNthCalledWith(3,
            'http://localhost:3001/api/auth/logout',
            expect.objectContaining({
                method: 'POST',
                credentials: 'include',
            }),
        );
        expect(global.fetch).toHaveBeenNthCalledWith(4,
            'http://localhost:3001/api/lov/categories?mode=TREE',
            expect.objectContaining({
                credentials: 'include',
                headers: expect.not.objectContaining({ Authorization: expect.any(String) }),
            }),
        );
    });

    it('recovers from non-token 401 messages by refreshing and retrying mutating requests', async () => {
        const dataService = loadService();
        global.window.localStorage.setItem('accessToken', 'stale-token');
        global.window.localStorage.setItem('refreshToken', 'refresh-token');

        global.fetch = jest.fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 401,
                text: async () => JSON.stringify({ message: 'Authentication required' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ accessToken: 'fresh-token' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ ok: true }),
            });

        const result = await dataService.apiRequest('/tasks/task-1', {
            method: 'PATCH',
            body: JSON.stringify({ status: 'HOT' }),
        });

        expect(result).toEqual({ ok: true });
        expect(global.window.localStorage.getItem('accessToken')).toBe('fresh-token');
        expect(global.fetch).toHaveBeenNthCalledWith(3,
            'http://localhost:3001/api/tasks/task-1',
            expect.objectContaining({
                method: 'PATCH',
                credentials: 'include',
                headers: expect.objectContaining({ Authorization: 'Bearer fresh-token' }),
            }),
        );
    });

    it('refreshes an about-to-expire access token before sending the protected request', async () => {
        const dataService = loadService();
        const expSoonPayload = Buffer.from(JSON.stringify({
            exp: Math.floor(Date.now() / 1000) + 20,
        })).toString('base64url');
        global.window.localStorage.setItem('accessToken', `header.${expSoonPayload}.sig`);
        global.window.localStorage.setItem('refreshToken', 'refresh-token');

        global.fetch = jest.fn()
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ accessToken: 'fresh-token' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ id: 'task-1' }),
            });

        const result = await dataService.apiRequest('/tasks/task-1');

        expect(result).toEqual({ id: 'task-1' });
        expect(global.fetch).toHaveBeenNthCalledWith(1,
            'http://localhost:3001/api/auth/refresh',
            expect.objectContaining({
                method: 'POST',
                credentials: 'include',
                body: JSON.stringify({ refreshToken: 'refresh-token' }),
            }),
        );
        expect(global.fetch).toHaveBeenNthCalledWith(2,
            'http://localhost:3001/api/tasks/task-1',
            expect.objectContaining({
                credentials: 'include',
                headers: expect.objectContaining({ Authorization: 'Bearer fresh-token' }),
            }),
        );
    });

    it('keeps the default pricing catalog stable and only overlays known persisted items', async () => {
        const dataService = loadService();

        global.fetch = jest.fn(async (url) => {
            const reqUrl = String(url);
            if (reqUrl.includes('/users?includeInactive=true&page=1&limit=100')) {
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({
                        items: [],
                        total: 0,
                        page: 1,
                        limit: 100,
                    }),
                };
            }

            if (reqUrl.includes('/pricing?page=1&limit=100')) {
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({
                        items: [
                            { id: 'price-1', name: 'KAMPANYA SAYFASI (KOMİSYONLU MODEL) - 1 AY', category: 'SERVICE', unitPrice: 2600 },
                            { id: 'price-2', name: 'MASAJ - SPA', category: 'COMMISSION', commissionRate: 21 },
                            { id: 'price-3', name: 'Standart Komisyon', category: 'COMMISSION', commissionRate: 15 },
                        ],
                        total: 3,
                        page: 1,
                        limit: 100,
                    }),
                };
            }

            if (reqUrl.includes('/pricing/rules')) {
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({
                        codeBundles: [{ name: '50 Kod', priceInc: 1000 }],
                        discountCoupons: [{ title: 'Cafe-Restoran', rules: ['500 TL ve üzeri -> 100 TL indirim'] }],
                    }),
                };
            }

            throw new Error(`Unexpected fetch call: ${reqUrl}`);
        });

        const pricingData = await dataService.fetchOnce('pricingData');

        expect(pricingData.SERVICE.items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: 'price-1', name: 'Kampanya Sayfası (Komisyonlu Model) - 1 Ay', priceEx: 2600, priceInc: 3120 }),
            ]),
        );
        expect(pricingData.COMMISSION.items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: 'price-2', name: 'Masaj - SPA', val: '%21' }),
            ]),
        );
        expect(pricingData.COMMISSION.items).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: 'price-3', name: 'Standart Komisyon' }),
            ]),
        );
        expect(pricingData.RULES).toEqual({
            codeBundles: [{ name: '50 Kod', priceInc: 1000 }],
            discountCoupons: [{ title: 'Cafe-Restoran', rules: ['500 TL ve üzeri -> 100 TL indirim'] }],
        });
    });

    it('falls back to default pricing catalog when backend has no persisted pricing items', async () => {
        const dataService = loadService();

        global.fetch = jest.fn(async (url) => {
            const reqUrl = String(url);
            if (reqUrl.includes('/users?includeInactive=true&page=1&limit=100')) {
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({ items: [], total: 0, page: 1, limit: 100 }),
                };
            }

            if (reqUrl.includes('/pricing?page=1&limit=100')) {
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({ items: [], total: 0, page: 1, limit: 100 }),
                };
            }

            if (reqUrl.includes('/pricing/rules')) {
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({ codeBundles: [], discountCoupons: [] }),
                };
            }

            throw new Error(`Unexpected fetch call: ${reqUrl}`);
        });

        const pricingData = await dataService.fetchOnce('pricingData');

        expect(pricingData.SERVICE.items.length).toBeGreaterThan(0);
        expect(pricingData.COMMISSION.items.length).toBeGreaterThan(0);
        expect(pricingData.DOPING.items.length).toBeGreaterThan(0);
        expect(pricingData.SOCIAL_MEDIA.items.length).toBeGreaterThan(0);
    });

    it('deletes removed categories from the backend before upserting the remaining tree', async () => {
        const dataService = loadService();
        global.window.localStorage.setItem('accessToken', 'token');

        const categoryTree = [
            {
                id: 'main-iftar',
                label: 'İftar (Core)',
                children: [
                    { id: 'sub-restoran', label: 'Restoranda İftar' },
                    { id: 'sub-tekne', label: 'Teknede İftar' },
                ],
            },
            {
                id: 'main-yemek',
                label: 'Yemek (Core)',
                children: [
                    { id: 'sub-aksam', label: 'Akşam Yemeği' },
                    { id: 'sub-fastfood', label: 'Fast Food' },
                ],
            },
        ];

        global.fetch = jest.fn(async (url, options = {}) => {
            const reqUrl = String(url);
            if (reqUrl.includes('/lov/categories?mode=TREE')) {
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify(categoryTree),
                };
            }

            if (reqUrl.includes('/lov/categories/main-iftar') || reqUrl.includes('/lov/categories/sub-fastfood')) {
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({ ok: true }),
                };
            }

            throw new Error(`Unexpected fetch call: ${reqUrl} ${options.method || 'GET'}`);
        });

        await dataService.saveCategories({
            'Yemek (Core)': ['Akşam Yemeği'],
        });

        expect(global.fetch).toHaveBeenCalledWith(
            'http://localhost:3001/api/lov/categories/main-iftar',
            expect.objectContaining({
                method: 'DELETE',
                credentials: 'include',
            }),
        );
        expect(global.fetch).toHaveBeenCalledWith(
            'http://localhost:3001/api/lov/categories/sub-fastfood',
            expect.objectContaining({
                method: 'DELETE',
                credentials: 'include',
            }),
        );
    });

    it('marks a notification as read via the dedicated read endpoint', async () => {
        const dataService = loadService();
        global.window.localStorage.setItem('accessToken', 'token');

        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ ok: true }),
        });

        await dataService.markNotificationRead('notif-1');

        expect(global.fetch).toHaveBeenCalledWith(
            'http://localhost:3001/api/notifications/notif-1/read',
            expect.objectContaining({
                method: 'PATCH',
                credentials: 'include',
                headers: expect.objectContaining({ Authorization: 'Bearer token' }),
            }),
        );
    });

    it('marks all notifications as read via the me/read-all endpoint', async () => {
        const dataService = loadService();
        global.window.localStorage.setItem('accessToken', 'token');

        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ ok: true, updatedCount: 2 }),
        });

        await dataService.markAllNotificationsRead(['notif-1', 'notif-2']);

        expect(global.fetch).toHaveBeenCalledWith(
            'http://localhost:3001/api/notifications/me/read-all',
            expect.objectContaining({
                method: 'PATCH',
                credentials: 'include',
                headers: expect.objectContaining({ Authorization: 'Bearer token' }),
            }),
        );
    });
});
