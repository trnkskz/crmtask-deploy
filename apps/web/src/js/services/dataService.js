// ============================================================
// services/dataService.js
// Doğrudan API tabanlı veri katmanı (doğrudan API tabanlı)
// ============================================================

const DataService = (() => {
    const API_BASE = window.__API_BASE_URL__ || 'http://localhost:3001/api';
    const COLLECTION_CACHE_TTL_MS = 10000;
    const SYSTEM_LOGS_STORAGE_KEY = 'crm_system_logs_v1';
    let refreshAccessTokenPromise = null;
    const PRICING_DATA_FALLBACK = (typeof DEFAULT_PRICING_DATA !== 'undefined')
        ? DEFAULT_PRICING_DATA
        : {
            COMMISSION: {
                title: 'Komisyon Oranları',
                items: [
                    { name: 'Masaj - SPA', val: '%20' },
                    { name: 'Güzellik', val: '%22-23' },
                    { name: 'Aktivite - Eğlence', val: '%16' },
                    { name: 'İftar', val: '%15-16' },
                    { name: 'Kahvaltı', val: '%15-16' },
                    { name: 'Yemek', val: '%15-16' },
                    { name: 'Bilet - Etkinlik', val: '%16' },
                    { name: 'Hizmet', val: '%19-20' },
                    { name: 'Spor - Eğitim - Kurs', val: '%19-20' },
                    { name: 'Yılbaşı', val: '%15-16' },
                ],
            },
            SERVICE: {
                title: 'Hizmet Bedelleri',
                items: [
                    { name: 'Kampanya Sayfası (Komisyonlu Model) - 1 Ay', priceEx: 2500, priceInc: 3000 },
                    { name: 'Kampanya Sayfası (Komisyonlu Model) - 3 Ay', priceEx: 5000, priceInc: 6000 },
                    { name: 'Tanıtım Sayfası (Komisyonsuz Model) - 1 Ay', priceEx: 4500, priceInc: 5400 },
                    { name: 'Tanıtım Sayfası (Komisyonsuz Model) - 3 Ay', priceEx: 10000, priceInc: 12000 },
                ],
            },
            DOPING: {
                title: 'Doping Ücretleri',
                items: [
                    { name: 'Kategori Banner - 5 Gün', priceEx: 3000, priceInc: 3600 },
                    { name: 'Kategori Banner - 7 Gün', priceEx: 4166.7, priceInc: 5000 },
                    { name: 'Kategori Vitrini (Top 5) - 3 Gün', priceEx: 2083, priceInc: 2500 },
                    { name: 'Kategori Vitrini (Top 5) - 5 Gün', priceEx: 3333, priceInc: 4000 },
                    { name: 'Instagram', priceEx: 1500, priceInc: 1800 },
                    { name: 'Mailing Banner', priceEx: 3750, priceInc: 4500 },
                    { name: 'Segment Maili', priceEx: 7500, priceInc: 9000 },
                    { name: 'Anasayfa Günün Fırsatı Banner Alanı - Maks. 2 Gün', priceEx: 5000, priceInc: 6000 },
                    { name: 'Anasayfa Listeleme - 1 Ay', priceEx: 20833, priceInc: 25000 },
                    { name: 'Anasayfa Listeleme - 1 Hafta', priceEx: 6250, priceInc: 7500 },
                ],
            },
            SOCIAL_MEDIA: {
                title: 'Sosyal Medya',
                items: [
                    { name: 'AI Reels', priceEx: 16666, priceInc: 20000 },
                    { name: 'Mikro Influencer Paylaşımı', priceEx: 20833, priceInc: 25000 },
                    { name: 'Anlatımlı Reels', priceEx: 20833, priceInc: 25000 },
                    { name: "Sosyal Medya Paketleri 3'lü Paket", priceEx: 41666, priceInc: 50000 },
                ],
            },
        };
    const PRICING_RULES_FALLBACK = (typeof PRICING_REFERENCE_RULES !== 'undefined')
        ? PRICING_REFERENCE_RULES
        : {
            codeBundles: [
                { name: '50 Kod', priceInc: 1000 },
                { name: '100 Kod', priceInc: 1800 },
                { name: '250 Kod', priceInc: 3750 },
            ],
            discountCoupons: [
                {
                    title: 'Cafe-Restoran',
                    rules: [
                        'Sabit Tutar: 400 TL ve üzeri -> 100 TL indirim',
                        'Kademeli: 500 TL ve üzeri 800 TL ve üzeri -> 200 TL indirim',
                        'Yüzdelik-Tavanlı: 500 TL ve üzeri -> %25 indirim max 200 TL',
                    ],
                },
                {
                    title: 'Çiçek-Çikolata-Hediye',
                    rules: [
                        'Sabit Tutar: 1000 TL ve üzeri -> 250 TL indirim (%25)',
                        'Kademeli: 800 TL ve üzeri 1.200 TL ve üzeri -> 350 TL indirim (%29)',
                        'Yüzdelik-Tavanlı: 1000 TL ve üzeri -> %25 indirim max 300 TL',
                    ],
                },
            ],
        };

    const runtimeCache = {
        users: null,
        taskListsByTag: new Map(),
        forbiddenRoots: new Set(),
        collections: new Map(),
    };

    function clone(v) {
        return JSON.parse(JSON.stringify(v ?? null));
    }

    function getStorage() {
        try {
            return typeof window !== 'undefined' ? window.localStorage : null;
        } catch (_) {
            return null;
        }
    }

    function loadStoredJson(key, fallback) {
        const storage = getStorage();
        if (!storage) return clone(fallback);
        try {
            const raw = storage.getItem(key);
            if (!raw) return clone(fallback);
            return JSON.parse(raw);
        } catch (_) {
            return clone(fallback);
        }
    }

    function saveStoredJson(key, value) {
        const storage = getStorage();
        if (!storage) return;
        try {
            storage.setItem(key, JSON.stringify(value));
        } catch (_) {
            // ignore quota / privacy mode failures
        }
    }

    function clearAuthTokens() {
        const storage = getStorage();
        if (!storage) return;
        try {
            storage.removeItem('accessToken');
            storage.removeItem('refreshToken');
        } catch (_) {
            // ignore storage failures
        }
    }

    async function clearAuthCookiesBestEffort() {
        const storage = getStorage();
        const refreshToken = storage?.getItem('refreshToken') || undefined;
        try {
            await rawApiRequest('/auth/logout', {
                method: 'POST',
                body: JSON.stringify(refreshToken ? { refreshToken } : {}),
            }, false);
        } catch (_) {
            // ignore logout cleanup failures, storage clear below still helps
        }
    }

    function buildRequestHeaders(init = {}, includeAuth = true) {
        const storage = getStorage();
        const token = storage?.getItem('accessToken');
        return {
            'Content-Type': 'application/json',
            ...(init.headers || {}),
            ...(includeAuth && token ? { Authorization: `Bearer ${token}` } : {}),
        };
    }

    async function readJsonResponse(res) {
        const text = await res.text();
        if (!text) return null;
        try {
            return JSON.parse(text);
        } catch (_) {
            return text;
        }
    }

    function parsePath(path) {
        const p = String(path || '').replace(/^\/+|\/+$/g, '');
        const parts = p ? p.split('/') : [];
        return { raw: p, parts, root: parts[0] || '', id: parts[1] || '', tail: parts.slice(2) };
    }

    function getCacheKey(root) {
        return String(root || '').trim();
    }

    function getCollectionFromCache(root) {
        const key = getCacheKey(root);
        const hit = runtimeCache.collections.get(key);
        if (!hit) return null;
        if ((Date.now() - hit.ts) > COLLECTION_CACHE_TTL_MS) {
            runtimeCache.collections.delete(key);
            return null;
        }
        return hit.value;
    }

    function setCollectionCache(root, value) {
        runtimeCache.collections.set(getCacheKey(root), { ts: Date.now(), value });
    }

    function invalidateCollectionCache(root) {
        runtimeCache.collections.delete(getCacheKey(root));
        runtimeCache.collections.delete('');
    }

    function apiRoleToUi(role) {
        const r = String(role || '').toUpperCase();
        if (r === 'ADMIN' || r === 'MANAGER') return 'Yönetici';
        if (r === 'TEAM_LEADER') return 'Takım Lideri';
        return 'Satış Temsilcisi';
    }

    function uiRoleToApi(role) {
        const r = String(role || '').toUpperCase();
        if (r.includes('TAKIM') || r.includes('TEAM')) return 'TEAM_LEADER';
        if (r.includes('YÖNET') || r.includes('YONET') || r.includes('ADMIN') || r.includes('MANAGER')) return 'MANAGER';
        return 'SALESPERSON';
    }

    function apiTaskStatusToUi(status) {
        const s = String(status || '').toUpperCase();
        if (s === 'HOT') return 'hot';
        if (s === 'NOT_HOT') return 'nothot';
        if (s === 'FOLLOWUP') return 'followup';
        if (s === 'DEAL') return 'deal';
        if (s === 'COLD') return 'cold';
        return 'new';
    }

    function apiCreationChannelToUi(channel) {
        const raw = String(channel || '').toUpperCase();
        if (raw === 'REQUEST_FLOW') return 'Görev Al / Yarat';
        if (raw === 'MANUAL_TASK_CREATE') return 'Task Yarat';
        if (raw === 'PROJECT_GENERATED') return 'Proje';
        return 'Bilinmiyor';
    }

    function uiTaskStatusToApi(status) {
        const s = String(status || '').toLowerCase();
        if (s === 'hot') return 'HOT';
        if (s === 'nothot') return 'NOT_HOT';
        if (s === 'followup') return 'FOLLOWUP';
        if (s === 'deal') return 'DEAL';
        if (s === 'cold') return 'COLD';
        return 'NEW';
    }

    function normalizeLog(log) {
        if (!log) return null;
        const when = log.createdAt ? new Date(log.createdAt) : new Date();
        return {
            id: log.id || `${Date.now()}`,
            date: when.toLocaleString('tr-TR'),
            user: log.author?.name || log.author?.email || 'Sistem',
            text: log.text || `[${log.reason || 'Kayıt'}]`,
        };
    }

    function parseDealDetails(logs, offers) {
        const offerList = Array.isArray(offers) ? [...offers] : [];
        offerList.sort((a, b) => {
            const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
        });
        const latestOffer = offerList.length > 0 ? offerList[0] : null;
        const dealLog = Array.isArray(logs)
            ? logs.find((log) => String(log?.text || '').includes('[Deal Sonucu]'))
            : null;

        if (!latestOffer && !dealLog) return null;

        const rawText = String(dealLog?.text || '');
        const readField = (label) => {
            const re = new RegExp(`${label}:\\s*([^|\\n]+)`, 'i');
            const match = rawText.match(re);
            return match ? String(match[1]).trim() : '';
        };

        return {
            commission: latestOffer?.commission != null ? String(latestOffer.commission) : (readField('Komisyon') || '0'),
            duration: readField('Süre') || '-',
            fee: latestOffer?.adFee != null ? String(latestOffer.adFee) : (readField('Yayın Bedeli') || 'Yok'),
            joker: latestOffer?.joker != null ? String(latestOffer.joker) : (readField('Joker') || 'Yok'),
            campCount: readField('Kampanya') || '-',
        };
    }

    function extractProjectId(details) {
        const raw = String(details || '');
        const match = raw.match(/\(Proje:\s*([^)]+)\)/i);
        return match ? String(match[1]).trim() : null;
    }

    function mapUser(u) {
        const apiRole = String(u.role || '').toUpperCase();
        const derivedTeam = (apiRole === 'ADMIN' || apiRole === 'MANAGER') ? '-' : (u.team || '-');
        return {
            id: u.id,
            name: u.name || u.email || 'Kullanıcı',
            email: u.email || '',
            role: apiRoleToUi(u.role),
            status: u.isActive ? 'Aktif' : 'Pasif',
            team: derivedTeam,
            phone: u.phone || '',
            settings: (u.settings && typeof u.settings === 'object') ? u.settings : undefined,
            managerId: u.managerId || null,
            _apiRole: u.role || null,
        };
    }

    function mapBusiness(b) {
        const rawAccountName = b.accountName || b.businessName || '-';
        const rawBusinessName = b.businessName || b.accountName || '-';
        const isImportedPlaceholder =
            /^Imported\s+/i.test(String(rawAccountName || '')) ||
            /^Imported\s+/i.test(String(rawBusinessName || ''));
        const displayName = isImportedPlaceholder ? 'İsimsiz İşletme' : rawAccountName;
        const displayBusinessName = isImportedPlaceholder ? 'İsimsiz İşletme' : rawBusinessName;
        const contacts = Array.isArray(b.contacts) ? b.contacts : [];
        const primaryContact = contacts.find((c) => c && c.isPrimary) || contacts[0] || null;
        const extraContacts = contacts
            .filter((c) => c && primaryContact && c.id !== primaryContact.id)
            .map((c) => ({ name: c.name || '', phone: c.phone || '', email: c.email || '' }));
        return {
            id: b.id,
            companyName: displayName,
            businessName: displayBusinessName,
            businessStatus: String(b.status || 'ACTIVE').toUpperCase() === 'ACTIVE' ? 'Aktif' : 'Pasif',
            sourceType: apiSourceToUi(b.source || 'FRESH'),
            accountType: b.type || 'KEY',
            mainCategory: b.mainCategory || '',
            subCategory: b.subCategory || '',
            city: b.city || '',
            district: b.district || '',
            address: b.address || '',
            contactPhone: b.contactPhone || primaryContact?.phone || b.businessContact || '',
            contactName: b.contactName || primaryContact?.name || b.contactPerson || '',
            contactEmail: b.contactEmail || primaryContact?.email || '',
            extraContacts: Array.isArray(b.extraContacts) ? b.extraContacts : extraContacts,
            website: b.website || '',
            instagram: b.instagram || '',
            campaignUrl: b.campaignUrl || '',
            notes: b.notes || '',
            createdAt: b.creationDate || b.createdAt || new Date().toISOString(),
            latestTaskStatus: b.latestTaskStatus ? apiTaskStatusToUi(b.latestTaskStatus) : '',
            latestTaskAssignee: b.latestTaskAssignee || '',
            latestTaskSource: b.latestTaskSource ? apiSourceToUi(b.latestTaskSource) : '',
            latestTaskCreatedAt: b.latestTaskCreatedAt || '',
            hasActiveTask: typeof b.hasActiveTask === 'boolean' ? b.hasActiveTask : undefined,
        };
    }

    function mapTask(t) {
        const logs = Array.isArray(t.logs) ? t.logs.map(normalizeLog).filter(Boolean) : [];
        const offers = Array.isArray(t.offers) ? t.offers : [];
        const resolvedProjectId = t.projectId || extractProjectId(t.details);
        const companyName = t.companyName || t.businessName || t.account?.accountName || t.account?.businessName || '';
        const businessName = t.businessName || t.companyName || t.account?.businessName || t.account?.accountName || '';
        const city = t.city || t.account?.city || '';
        const poolTeam = String(t.poolTeam || '').toUpperCase();
        let poolAssignee = 'UNASSIGNED';
        if (poolTeam === 'TEAM_1') poolAssignee = 'Team 1';
        else if (poolTeam === 'TEAM_2') poolAssignee = 'Team 2';
        let assignee = t.owner?.name || t.owner?.email || poolAssignee;
        if (!t.ownerId && poolTeam === 'GENERAL' && t.historicalAssignee === 'TARGET_POOL' && resolvedProjectId) {
            assignee = 'TARGET_POOL';
        } else if (!t.ownerId && poolTeam === 'GENERAL' && t.historicalAssignee && t.historicalAssignee !== 'TARGET_POOL') {
            assignee = t.historicalAssignee;
        }
        return {
            id: t.id,
            businessId: t.accountId,
            projectId: resolvedProjectId,
            assignee,
            ownerId: t.ownerId || null,
            createdById: t.createdById || null,
            creationChannel: t.creationChannel || 'UNKNOWN',
            creationChannelLabel: apiCreationChannelToUi(t.creationChannel),
            status: apiTaskStatusToUi(t.status),
            mainCategory: t.mainCategory || '',
            subCategory: t.subCategory || '',
            sourceType: apiSourceToUi(t.source || 'FRESH'),
            details: t.details || '',
            specificContactName: t.specificContactName || '',
            specificContactPhone: t.specificContactPhone || '',
            specificContactEmail: t.specificContactEmail || '',
            nextCallDate: t.nextCallDate || '',
            logs,
            offers,
            dealDetails: parseDealDetails(t.logs, offers),
            createdAt: t.creationDate || t.createdAt || new Date().toISOString(),
            companyName,
            businessName,
            city,
        };
    }

    function mapNotification(n, userMap) {
        return {
            id: n.id,
            taskId: n.taskId,
            user: userMap.get(n.toUserId) || (typeof AppState !== 'undefined' ? AppState?.loggedInUser?.name : null) || 'Sistem',
            toUserId: n.toUserId || null,
            text: n.message || 'Bildirim',
            read: Boolean(n.readAt),
        };
    }

    function mapProject(p) {
        const period = typeof extractProjectPeriod === 'function'
            ? extractProjectPeriod(p)
            : { month: '', year: '', display: '' };
        return {
            id: p.id,
            name: p.name,
            description: p.description || '',
            month: period.month,
            year: period.year,
            displayPeriod: period.display,
            status: (p.status || 'PLANNED').toLowerCase(),
            createdAt: p.createdAt || new Date().toISOString(),
        };
    }

    function buildCategoryMap(tree) {
        const out = {};
        (tree || []).forEach((m) => {
            const key = m.label || m.name || 'Kategori';
            out[key] = (m.children || []).map((c) => c.label || c.name || '').filter(Boolean);
        });
        return out;
    }

    function normalizePricingRules(rules) {
        const source = rules && typeof rules === 'object' ? rules : {};
        return {
            codeBundles: Array.isArray(source.codeBundles)
                ? source.codeBundles.map((item) => ({
                    name: String(item?.name || '').trim(),
                    priceInc: parsePrice(item?.priceInc),
                })).filter((item) => item.name)
                : JSON.parse(JSON.stringify(PRICING_RULES_FALLBACK.codeBundles || [])),
            discountCoupons: Array.isArray(source.discountCoupons)
                ? source.discountCoupons.map((group) => ({
                    title: String(group?.title || '').trim(),
                    rules: Array.isArray(group?.rules)
                        ? group.rules.map((rule) => String(rule || '').trim()).filter(Boolean)
                        : [],
                })).filter((group) => group.title)
                : JSON.parse(JSON.stringify(PRICING_RULES_FALLBACK.discountCoupons || [])),
        };
    }

    function buildPricingData(items, rules) {
        const pricingKey = (value) => String(value || '').trim().toLocaleUpperCase('tr-TR');
        const normalizedItems = Array.isArray(items) ? items.filter((item) => {
            const name = String(item?.name || '').trim();
            return Boolean(name);
        }) : [];
        const out = {
            ...JSON.parse(JSON.stringify(PRICING_DATA_FALLBACK)),
            RULES: normalizePricingRules(rules),
        };
        const categoryMaps = new Map();
        ['COMMISSION', 'SERVICE', 'DOPING', 'SOCIAL_MEDIA'].forEach((category) => {
            const itemsMap = new Map();
            (out?.[category]?.items || []).forEach((item, index) => {
                itemsMap.set(pricingKey(item?.name), index);
            });
            categoryMaps.set(category, itemsMap);
        });

        if (normalizedItems.length === 0) {
            return out;
        }

        normalizedItems.forEach((x) => {
            const category = String(x?.category || 'COMMISSION').trim().toUpperCase();
            const name = String(x?.name || '').trim();
            if (!name) return;
            if (!out[category]) {
                out[category] = { title: category, items: [] };
                categoryMaps.set(category, new Map());
            }
            const categoryItems = out[category].items || [];
            const categoryMap = categoryMaps.get(category) || new Map();
            const lookupKey = pricingKey(name);

            const rawUnitPrice = Number(x?.unitPrice || 0);
            const priceEx = Number.isFinite(rawUnitPrice) ? rawUnitPrice : 0;
            if (category === 'SERVICE' || category === 'DOPING' || category === 'SOCIAL_MEDIA') {
                const nextItem = {
                    ...(categoryMap.has(lookupKey) ? categoryItems[categoryMap.get(lookupKey)] : {}),
                    id: x.id,
                    name: categoryMap.has(lookupKey) ? categoryItems[categoryMap.get(lookupKey)].name : name,
                    priceEx,
                    priceInc: Math.round(priceEx * 1.2),
                };

                if (categoryMap.has(lookupKey)) {
                    categoryItems[categoryMap.get(lookupKey)] = nextItem;
                }
                return;
            }

            const commissionItem = {
                ...(categoryMap.has(lookupKey) ? categoryItems[categoryMap.get(lookupKey)] : {}),
                id: x.id,
                name: categoryMap.has(lookupKey) ? categoryItems[categoryMap.get(lookupKey)].name : name,
                val: formatCommissionValue(x.commissionRate, x.description),
                description: x.description || '',
            };

            if (categoryMap.has(lookupKey)) {
                categoryItems[categoryMap.get(lookupKey)] = commissionItem;
            }
        });
        return out;
    }

    function emptyPricingData() {
        return {
            ...JSON.parse(JSON.stringify(PRICING_DATA_FALLBACK)),
            RULES: normalizePricingRules(PRICING_RULES_FALLBACK),
        };
    }

    async function fetchPricingRules() {
        try {
            const rules = await apiRequest('/pricing/rules');
            return normalizePricingRules(rules);
        } catch (err) {
            console.warn('Pricing rules fetch failed, using fallback:', err?.message || err);
            return normalizePricingRules(PRICING_RULES_FALLBACK);
        }
    }

    function getCurrentApiRole() {
        const role = (typeof AppState !== 'undefined' ? AppState?.loggedInUser?._apiRole : null);
        return String(role || '').trim().toUpperCase();
    }

    function canReadUsers() {
        return getCurrentApiRole() !== 'SALESPERSON';
    }

    function canReadProjects() {
        if (runtimeCache.forbiddenRoots.has('projects')) return false;
        if (typeof window !== 'undefined' && typeof window.hasPermission === 'function') {
            try {
                return Boolean(window.hasPermission('manageProjects'));
            } catch (_) {
                // fall back to user snapshot below
            }
        }
        const explicitPermission = AppState?.loggedInUser?.settings?.permissions?.manageProjects;
        if (explicitPermission === false) return false;
        if (explicitPermission === true) return true;
        const role = getCurrentApiRole();
        return role === 'ADMIN' || role === 'MANAGER' || role === 'TEAM_LEADER';
    }

    function canReadPricing() {
        return true;
    }

    const COMMISSION_DISPLAY_MARKER = '__commission_display__:';

    function splitCommissionDescription(description) {
        const raw = String(description || '');
        if (!raw) return { display: '', plain: '' };
        const lines = raw.split('\n');
        let display = '';
        const plainLines = [];
        lines.forEach((line) => {
            const trimmed = String(line || '').trim();
            if (!trimmed) return;
            if (trimmed.startsWith(COMMISSION_DISPLAY_MARKER)) {
                display = trimmed.slice(COMMISSION_DISPLAY_MARKER.length).trim();
                return;
            }
            plainLines.push(line);
        });
        return {
            display,
            plain: plainLines.join('\n').trim(),
        };
    }

    function normalizeCommissionDisplay(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        return raw.replace(/^%+/, '').replace(/\s+/g, '');
    }

    function buildCommissionDescription(value, existingDescription = '') {
        const display = normalizeCommissionDisplay(value);
        const { plain } = splitCommissionDescription(existingDescription);
        if (!display) return plain || undefined;
        return [plain, `${COMMISSION_DISPLAY_MARKER}${display}`].filter(Boolean).join('\n');
    }

    function formatCommissionValue(rate, description = '') {
        const { display } = splitCommissionDescription(description);
        if (display) return `%${display}`;
        const numeric = Number(rate ?? 0);
        if (!Number.isFinite(numeric)) return '%0';
        return `%${String(numeric)}`;
    }

    function parseCommissionRate(value) {
        const raw = String(value || '').replace(',', '.');
        const normalized = raw.replace(/[–—−]/g, '-');
        const matches = normalized.match(/\d+(\.\d+)?/g) || [];
        const numbers = matches
            .map((part) => Number(part))
            .filter((n) => Number.isFinite(n));
        if (numbers.length === 0) return 0;
        if (numbers.length === 1) return numbers[0];
        const avg = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
        return Number(avg.toFixed(2));
    }

    function parsePrice(value) {
        const n = Number(String(value ?? '').replace(',', '.'));
        return Number.isFinite(n) ? n : 0;
    }

    function decodeJwtPayload(token) {
        try {
            const [, payload] = String(token || '').split('.');
            if (!payload) return null;
            const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
            const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
            if (typeof atob === 'function') {
                return JSON.parse(atob(padded));
            }
            if (typeof Buffer !== 'undefined') {
                return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
            }
        } catch (_) {
            return null;
        }
        return null;
    }

    function isAccessTokenExpiringSoon(token, thresholdSeconds = 45) {
        const payload = decodeJwtPayload(token);
        const exp = Number(payload?.exp || 0);
        if (!Number.isFinite(exp) || exp <= 0) return false;
        const nowSeconds = Math.floor(Date.now() / 1000);
        return exp <= (nowSeconds + thresholdSeconds);
    }

    async function rawApiRequest(path, init = {}, includeAuth = true) {
        const res = await fetch(`${API_BASE}${path}`, {
            ...init,
            headers: buildRequestHeaders(init, includeAuth),
            credentials: 'include',
        });
        const payload = await readJsonResponse(res);
        return { res, payload };
    }

    async function refreshAccessToken() {
        const storage = getStorage();
        const refreshToken = storage?.getItem('refreshToken');

        if (!refreshAccessTokenPromise) {
            refreshAccessTokenPromise = (async () => {
                const { res, payload } = await rawApiRequest('/auth/refresh', {
                    method: 'POST',
                    body: JSON.stringify(refreshToken ? { refreshToken } : {}),
                }, false);

                if (!res.ok || !payload?.accessToken) {
                    throw new Error(payload?.message || `HTTP ${res.status}`);
                }

                storage?.setItem('accessToken', payload.accessToken);
                return true;
            })().finally(() => {
                refreshAccessTokenPromise = null;
            });
        }

        try {
            return await refreshAccessTokenPromise;
        } catch (_) {
            return false;
        }
    }

    async function ensureFreshAccessToken() {
        const storage = getStorage();
        const accessToken = storage?.getItem('accessToken');
        if (!accessToken) return;
        if (!isAccessTokenExpiringSoon(accessToken)) return;
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
            await clearAuthCookiesBestEffort();
            clearAuthTokens();
        }
    }

    async function apiRequest(path, init = {}, options = {}) {
        const allowRefreshRetry = options.allowRefreshRetry !== false;
        const allowUnauthenticatedRetry = options.allowUnauthenticatedRetry !== false;
        const includeAuth = options.includeAuth !== false;
        if (includeAuth) {
            await ensureFreshAccessToken();
        }
        const { res, payload } = await rawApiRequest(path, init, includeAuth);

        if (!res.ok) {
            const msg = payload?.error?.message || payload?.message || `HTTP ${res.status}`;
            const isAuthEndpoint = /^\/auth\//.test(String(path || ''));
            const normalizedAuthMessage = String(msg || '').trim().toLocaleLowerCase('tr-TR');
            const isRecoverableUnauthorized = res.status === 401;

            if (!isAuthEndpoint && isRecoverableUnauthorized && allowRefreshRetry) {
                const refreshed = await refreshAccessToken();
                if (refreshed) {
                    return apiRequest(path, init, { ...options, allowRefreshRetry: false, includeAuth: true });
                }

                await clearAuthCookiesBestEffort();
                clearAuthTokens();
                if (allowUnauthenticatedRetry) {
                    return apiRequest(path, init, {
                        ...options,
                        allowRefreshRetry: false,
                        allowUnauthenticatedRetry: false,
                        includeAuth: false,
                    });
                }
            }

            const err = new Error(msg);
            err.status = res.status;
            err.payload = payload;
            throw err;
        }
        return payload;
    }

    async function collectPaged(path, limit = 100) {
        const all = [];
        let page = 1;
        let safety = 0;
        while (true) {
            const data = await apiRequest(`${path}${path.includes('?') ? '&' : '?'}page=${page}&limit=${limit}`);
            const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
            all.push(...items);
            if (!Array.isArray(data?.items)) break;

            const responseLimit = Number(data?.limit || limit);
            const responsePage = Number(data?.page || page);
            const responseTotal = Number(data?.total);
            if (Number.isFinite(responseTotal) && responseTotal >= 0) {
                if ((responsePage * responseLimit) >= responseTotal) break;
            } else if (items.length < responseLimit) {
                break;
            }

            page += 1;
            safety += 1;
            if (safety > 2000) break;
        }
        return all;
    }

    async function fetchTaskPage(query = {}) {
        const params = new URLSearchParams();
        Object.entries(query || {}).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') return;
            params.set(key, String(value));
        });
        const data = await apiRequest(`/tasks?${params.toString()}`);
        const items = Array.isArray(data?.items) ? data.items.map(mapTask) : [];
        return {
            items,
            total: Number(data?.total || items.length || 0),
            page: Number(data?.page || query.page || 1),
            limit: Number(data?.limit || query.limit || items.length || 0),
        };
    }

    async function fetchBusinessPage(query = {}) {
        const params = new URLSearchParams();
        Object.entries(query || {}).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') return;
            params.set(key, String(value));
        });
        const data = await apiRequest(`/accounts?${params.toString()}`);
        const items = Array.isArray(data?.items) ? data.items.map(mapBusiness) : [];
        return {
            items,
            total: Number(data?.total || items.length || 0),
            page: Number(data?.page || query.page || 1),
            limit: Number(data?.limit || query.limit || items.length || 0),
        };
    }

    async function fetchAccountTargetPreview(filters = {}) {
        const data = await apiRequest('/accounts/target-preview', {
            method: 'POST',
            body: JSON.stringify(filters || {}),
        });
        const items = Array.isArray(data?.items)
            ? data.items.map((item) => ({
                ...mapBusiness(item),
                latestTask: item?.latestTask ? mapTask(item.latestTask) : null,
            }))
            : [];

        return {
            count: Number(data?.count || items.length || 0),
            ids: Array.isArray(data?.ids) ? data.ids : items.map((item) => item.id),
            items,
        };
    }

    function toApiSourceType(value) {
        if (typeof normalizeTaskSourceKey === 'function') {
            return normalizeTaskSourceKey(value) || 'FRESH';
        }
        const raw = String(value || '').trim().toUpperCase();
        if (!raw) return 'FRESH';
        if (raw.includes('OLD ACCOUNT RAKIP') || raw.includes('OLD_RAKIP')) return 'OLD_RAKIP';
        if (raw.includes('OLD ACCOUNT QUERY') || raw.includes('OLD_QUERY')) return 'OLD_QUERY';
        if (raw === 'QUERY' || raw.startsWith('QUERY ') || raw.includes(' QUERY')) return 'QUERY';
        if (raw.includes('LEAD')) return 'LEAD';
        if (raw.includes('RAKIP')) return 'RAKIP';
        if (raw.includes('REFERANS')) return 'REFERANS';
        if (raw.includes('OLD')) return 'OLD';
        if (raw.includes('FRESH')) return 'FRESH';
        return 'FRESH';
    }

    function apiSourceToUi(value) {
        if (typeof getTaskSourceLabel === 'function') {
            return getTaskSourceLabel(value || '');
        }
        const raw = String(value || '').trim().toUpperCase();
        if (!raw) return 'Fresh Account';
        if (raw === 'OLD_RAKIP') return 'Old Account Rakip';
        if (raw === 'OLD_QUERY') return 'Old Account Query';
        if (raw === 'QUERY') return 'Query';
        if (raw === 'LEAD') return 'Lead';
        if (raw === 'RAKIP') return 'Rakip';
        if (raw === 'REFERANS') return 'Referans';
        if (raw === 'OLD') return 'Old Account';
        if (raw === 'FRESH') return 'Fresh Account';
        return String(value || '');
    }

    function toApiAccountType(value) {
        const raw = String(value || '').trim().toUpperCase();
        if (!raw) return 'KEY';
        if (raw.includes('LONG')) return 'LONG_TAIL';
        return 'KEY';
    }

    function toApiTaskCategory(value) {
        const raw = String(value || '').trim().toUpperCase();
        if (raw.includes('ANADOLU')) return 'ANADOLU_CORE';
        if (raw.includes('TRAVEL') || raw.includes('SEYAHAT')) return 'TRAVEL';
        return 'ISTANBUL_CORE';
    }

    function toApiTaskPriority(value) {
        const raw = String(value || '').trim().toUpperCase();
        if (raw === 'LOW' || raw === 'MEDIUM' || raw === 'HIGH' || raw === 'CRITICAL') return raw;
        return 'MEDIUM';
    }

    function toApiProjectStatus(value) {
        const raw = String(value || '').trim().toUpperCase();
        if (raw === 'PLANNED' || raw === 'ACTIVE' || raw === 'ON_HOLD' || raw === 'COMPLETED' || raw === 'CANCELLED') return raw;
        return 'PLANNED';
    }

    function normalizeCategoryMap(input) {
        const out = {};
        const entries = Object.entries(input || {});
        for (const [mainRaw, subsRaw] of entries) {
            const main = String(mainRaw || '').trim();
            if (!main) continue;
            const subs = Array.isArray(subsRaw) ? subsRaw : [];
            const seen = new Set();
            out[main] = [];
            for (const subRaw of subs) {
                const sub = String(subRaw || '').trim();
                if (!sub) continue;
                const key = sub.toLocaleLowerCase('tr-TR');
                if (seen.has(key)) continue;
                seen.add(key);
                out[main].push(sub);
            }
        }
        return out;
    }

    async function upsertCategoriesTree(categoryMap) {
        const desired = normalizeCategoryMap(categoryMap);
        const tree = await apiRequest('/lov/categories?mode=TREE');
        const existingMainByLabel = new Map();

        (tree || []).forEach((m) => {
            const mainLabel = String(m?.label || '').trim();
            if (!mainLabel) return;
            const subSet = new Set(((m?.children || []).map((s) => String(s?.label || '').trim().toLocaleLowerCase('tr-TR'))).filter(Boolean));
            existingMainByLabel.set(mainLabel.toLocaleLowerCase('tr-TR'), {
                id: m.id,
                label: mainLabel,
                subSet,
            });
        });

        for (const [mainLabel, subs] of Object.entries(desired)) {
            const mainKey = mainLabel.toLocaleLowerCase('tr-TR');
            let mainEntry = existingMainByLabel.get(mainKey);

            if (!mainEntry) {
                try {
                    const createdMain = await apiRequest('/lov/categories', {
                        method: 'POST',
                        body: JSON.stringify({ name: mainLabel, type: 'MAIN', active: true }),
                    });
                    mainEntry = {
                        id: createdMain?.id,
                        label: mainLabel,
                        subSet: new Set(),
                    };
                    existingMainByLabel.set(mainKey, mainEntry);
                } catch (err) {
                    // Concurrent/import yarışında kategori oluşmuş olabilir; tekrar çekip devam et.
                    const latestTree = await apiRequest('/lov/categories?mode=TREE');
                    const found = (latestTree || []).find((m) => String(m?.label || '').trim().toLocaleLowerCase('tr-TR') === mainKey);
                    if (!found?.id) throw err;
                    mainEntry = {
                        id: found.id,
                        label: String(found.label || mainLabel),
                        subSet: new Set(((found.children || []).map((s) => String(s?.label || '').trim().toLocaleLowerCase('tr-TR'))).filter(Boolean)),
                    };
                    existingMainByLabel.set(mainKey, mainEntry);
                }
            }

            if (!mainEntry?.id) continue;
            for (const subLabel of subs) {
                const subKey = subLabel.toLocaleLowerCase('tr-TR');
                if (mainEntry.subSet.has(subKey)) continue;
                try {
                    await apiRequest('/lov/categories', {
                        method: 'POST',
                        body: JSON.stringify({ name: subLabel, type: 'SUB', parentId: mainEntry.id, active: true }),
                    });
                    mainEntry.subSet.add(subKey);
                } catch (err) {
                    // Aynı alt kategori başka istekle oluşturulduysa devam et.
                    const latestTree = await apiRequest('/lov/categories?mode=TREE');
                    const foundMain = (latestTree || []).find((m) => String(m?.label || '').trim().toLocaleLowerCase('tr-TR') === mainKey);
                    const existsSub = (foundMain?.children || []).some((s) => String(s?.label || '').trim().toLocaleLowerCase('tr-TR') === subKey);
                    if (!existsSub) throw err;
                    mainEntry.subSet.add(subKey);
                }
            }
        }

        invalidateCollectionCache('categories');
    }

    async function reconcileRemovedCategories(categoryMap) {
        const desired = normalizeCategoryMap(categoryMap);
        const tree = await apiRequest('/lov/categories?mode=TREE');

        for (const main of tree || []) {
            const mainLabel = String(main?.label || '').trim();
            const desiredSubs = new Set((desired[mainLabel] || []).map((sub) => String(sub || '').trim().toLocaleLowerCase('tr-TR')).filter(Boolean));

            if (!Object.prototype.hasOwnProperty.call(desired, mainLabel)) {
                if (main?.id) await apiRequest(`/lov/categories/${main.id}`, { method: 'DELETE' });
                continue;
            }

            for (const sub of main?.children || []) {
                const subLabel = String(sub?.label || '').trim();
                if (!subLabel) continue;
                if (desiredSubs.has(subLabel.toLocaleLowerCase('tr-TR'))) continue;
                if (sub?.id) await apiRequest(`/lov/categories/${sub.id}`, { method: 'DELETE' });
            }
        }
    }

    function isLikelyLegacyId(id) {
        const val = String(id || '').trim();
        if (!val) return false;
        if (val.includes('_')) return true;
        if (!/^c[a-z0-9]{20,}$/i.test(val)) return true;
        return false;
    }

    function normalizeBusinessPatch(value) {
        const val = (value && typeof value === 'object') ? value : {};
        
        let cName = val.companyName || val.businessName || val.accountName;
        if (!cName || typeof cName !== 'string' || cName.trim() === '') {
            cName = 'Bilinmeyen Firma ' + Math.floor(Math.random() * 1000);
        }

        return {
            companyName: cName,
            businessName: cName,
            mainCategory: val.mainCategory,
            subCategory: val.subCategory,
            sourceType: val.sourceType ? toApiSourceType(val.sourceType) : undefined,
            accountType: val.accountType ? toApiAccountType(val.accountType) : undefined,
            businessStatus: val.businessStatus ? (String(val.businessStatus).toLowerCase() === 'pasif' ? 'PASSIVE' : 'ACTIVE') : undefined,
            city: val.city,
            district: val.district,
            address: val.address,
            contactPhone: val.contactPhone || val.businessContact,
            contactPerson: val.contactName || val.contactPerson,
            email: val.contactEmail || val.email,
            website: val.website,
            instagram: val.instagram,
            campaignUrl: val.campaignUrl,
            notes: val.notes,
        };
    }

    function businessTailToPatch(tail, value) {
        if (!tail.length) return normalizeBusinessPatch(value);
        const field = tail[0];
        const patch = {};
        if (field === 'companyName' || field === 'businessName') {
            patch.companyName = value;
            patch.businessName = value;
        } else if (field === 'mainCategory') patch.mainCategory = value;
        else if (field === 'subCategory') patch.subCategory = value;
        else if (field === 'sourceType') patch.sourceType = toApiSourceType(value);
        else if (field === 'accountType') patch.accountType = toApiAccountType(value);
        else if (field === 'city') patch.city = value;
        else if (field === 'district') patch.district = value;
        else if (field === 'address') patch.address = value;
        else if (field === 'contactPhone' || field === 'businessContact') patch.contactPhone = value;
        else if (field === 'contactName' || field === 'contactPerson') patch.contactPerson = value;
        else if (field === 'email') patch.email = value;
        else if (field === 'website') patch.website = value;
        else if (field === 'instagram') patch.instagram = value;
        else if (field === 'campaignUrl') patch.campaignUrl = value;
        else if (field === 'notes') patch.notes = value;
        else if (field === 'businessStatus' || field === 'status') patch.businessStatus = String(value).toLowerCase() === 'pasif' ? 'PASSIVE' : 'ACTIVE';
        return patch;
    }

    function taskTailToPatch(tail, value) {
        if (!tail.length) return {};
        const field = tail[0];
        const patch = {};
        if (field === 'mainCategory') patch.mainCategory = value;
        else if (field === 'subCategory') patch.subCategory = value;
        else if (field === 'city') patch.city = value;
        else if (field === 'district') patch.district = value;
        else if (field === 'sourceType' || field === 'source') patch.source = toApiSourceType(value);
        else if (field === 'accountType') patch.accountType = toApiAccountType(value);
        else if (field === 'taskCategory' || field === 'category') patch.category = toApiTaskCategory(value);
        else if (field === 'details') patch.details = value;
        else if (field === 'contact') patch.contact = value;
        else if (field === 'priority') patch.priority = toApiTaskPriority(value);
        return patch;
    }

    async function getUsers() {
        if (!canReadUsers()) {
            runtimeCache.forbiddenRoots.add('users');
            runtimeCache.users = [];
            return runtimeCache.users;
        }
        if (runtimeCache.forbiddenRoots.has('users')) return [];
        if (!runtimeCache.users) {
            try {
                runtimeCache.users = await collectPaged('/users?includeInactive=true');
            } catch (err) {
                if (err?.status === 403) {
                    runtimeCache.forbiddenRoots.add('users');
                    runtimeCache.users = [];
                    return runtimeCache.users;
                }
                throw err;
            }
        }
        return runtimeCache.users;
    }

    async function resolveOwnerId(assignee) {
        const val = String(assignee || '').trim();
        if (!val || val === 'UNASSIGNED' || val === 'TARGET_POOL' || val === 'Team 1' || val === 'Team 2') return undefined;
        const users = await getUsers();
        const lower = val.toLowerCase();
        const byId = users.find((u) => u.id === val);
        if (byId) return byId.id;
        const byName = users.find((u) => String(u.name || '').trim().toLowerCase() === lower);
        if (byName) return byName.id;
        const byEmail = users.find((u) => String(u.email || '').trim().toLowerCase() === lower);
        return byEmail?.id;
    }

    async function getTaskListIdByTag(tag) {
        const key = String(tag || 'GENERAL').toUpperCase();
        if (runtimeCache.taskListsByTag.has(key)) return runtimeCache.taskListsByTag.get(key);
        const lists = await apiRequest(`/tasklists?tag=${encodeURIComponent(key)}&isActive=true`);
        const arr = Array.isArray(lists) ? lists : [];
        const list = arr[0];
        if (!list?.id) throw new Error(`${key} tag için aktif task list bulunamadı`);
        runtimeCache.taskListsByTag.set(key, list.id);
        return list.id;
    }

    async function hasOpenGeneralTask(accountId) {
        if (!accountId) return false;
        const q = `/tasks?accountId=${encodeURIComponent(accountId)}&type=GENERAL&generalStatus=OPEN&page=1&limit=1`;
        const res = await apiRequest(q);
        const items = Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : []);
        return items.length > 0;
    }

    async function createBusiness(value) {
        const created = await apiRequest('/accounts', {
            method: 'POST',
            body: JSON.stringify(normalizeBusinessPatch(value)),
        });
        if (!created?.id) throw new Error('Account create yanıtında id yok');
        return created;
    }

    async function resolveAccountIdForTask(payload, ctx) {
        const sourceBusinessId = payload.businessId || payload.accountId;
        let accountId = ctx.accountIdMap.get(sourceBusinessId) || payload.accountId || payload.businessId;
        if (!accountId) throw new Error('Task create için accountId eksik');
        if (!isLikelyLegacyId(accountId)) return accountId;

        const safeName = String(payload.companyName || payload.businessName || '').trim();
        const fallbackName = safeName || 'İsimsiz İşletme';

        const created = await createBusiness({
            companyName: fallbackName,
            businessName: fallbackName,
            mainCategory: payload.mainCategory,
            subCategory: payload.subCategory,
            sourceType: payload.sourceType || payload.source,
            accountType: payload.accountType,
            city: payload.city,
            district: payload.district,
            contactPhone: payload.contactPhone,
            contactName: payload.contactName || payload.contact,
            contactEmail: payload.contactEmail || payload.email,
        });
        if (sourceBusinessId) ctx.accountIdMap.set(sourceBusinessId, created.id);
        return created.id;
    }

    async function createTaskFromLegacy(value, ctx) {
        const payload = value && typeof value === 'object' ? value : {};
        const accountId = await resolveAccountIdForTask(payload, ctx);

        const isProjectTask = Boolean(payload.projectId) || Boolean(payload.projectName) || String(payload.assignee || '').startsWith('TARGET_POOL');
        let type = isProjectTask ? 'PROJECT' : 'GENERAL';
        if (type === 'GENERAL' && await hasOpenGeneralTask(accountId)) {
            type = 'PROJECT';
        }
        const taskListId = await getTaskListIdByTag(type);
        const ownerId = await resolveOwnerId(payload.ownerId || payload.assignee);
        const firstLog = Array.isArray(payload.logs) ? payload.logs[0] : null;
        const details = String((firstLog && firstLog.text) || payload.details || '').trim() || 'Web adapter task create';

        const body = {
            taskListId,
            accountId,
            category: toApiTaskCategory(payload.taskCategory || payload.category),
            type,
            priority: toApiTaskPriority(payload.priority),
            accountType: toApiAccountType(payload.accountType),
            source: toApiSourceType(payload.sourceType || payload.source),
            mainCategory: payload.mainCategory || 'Belirtilmemiş',
            subCategory: payload.subCategory || 'Belirtilmemiş',
            contact: payload.specificContactName || payload.contact || undefined,
            details,
            city: payload.city || undefined,
            district: payload.district || undefined,
            ownerId: ownerId || undefined,
            historicalAssignee: !ownerId && (payload.ownerId || payload.assignee) ? String(payload.ownerId || payload.assignee).trim() : undefined,
            durationDays: ownerId ? Number(payload.durationDays || 7) : undefined,
            status: uiTaskStatusToApi(payload.status || 'new'),
            generalStatus: payload.status === 'deal' || payload.status === 'cold' ? 'CLOSED' : 'OPEN',
            externalRef: payload.externalRef ? String(payload.externalRef).trim() : undefined,
            creationDate: payload.createdAt || undefined,
        };
        const res = await apiRequest('/tasks', { method: 'POST', body: JSON.stringify(body) });
        
        // Görev oluştuktan sonra geçmiş kayıt logları varsa sunucuya ekleyelim.
        if (res && res.id && Array.isArray(payload.logs) && payload.logs.length > 0) {
            for (const log of payload.logs) {
                if (!log.text || log.text.trim() === '') continue;
                await apiRequest(`/tasks/${res.id}/activity`, {
                    method: 'POST',
                    body: JSON.stringify({
                        reason: 'YETKILIYE_ULASILAMADI', // Geçmiş notlar için generic default
                        text: log.text
                    })
                }).catch(e => console.warn("Log eklenemedi:", e));
            }
        }
        return res;
    }

    async function readCollectionObject(root) {
        const cached = getCollectionFromCache(root);
        if (cached !== null) return clone(cached);

        const userList = await getUsers();
        const userMap = new Map(userList.map((u) => [u.id, u.name || u.email || 'Kullanıcı']));

        if (root === 'users') {
            const items = userList.map(mapUser);
            const out = Object.fromEntries(items.map((x) => [x.id, x]));
            setCollectionCache(root, out);
            return clone(out);
        }
        if (root === 'businesses') {
            const visibleBusinesses = Array.isArray(AppState?.businesses) ? AppState.businesses : [];
            const out = Object.fromEntries(visibleBusinesses.map((x) => [x.id, x]));
            setCollectionCache(root, out);
            return clone(out);
        }
        if (root === 'tasks') {
            const visibleTasks = Array.isArray(AppState?.tasks) ? AppState.tasks : [];
            const out = Object.fromEntries(visibleTasks.map((x) => [x.id, x]));
            setCollectionCache(root, out);
            return clone(out);
        }
        if (root === 'notifications') {
            const data = await apiRequest('/notifications/me?page=1&limit=200');
            const items = (data.items || []).map((n) => mapNotification(n, userMap));
            const out = Object.fromEntries(items.map((x) => [x.id, x]));
            setCollectionCache(root, out);
            return clone(out);
        }
        if (root === 'projects') {
            if (!canReadProjects()) {
                runtimeCache.forbiddenRoots.add('projects');
                const out = {};
                setCollectionCache(root, out);
                return clone(out);
            }
            try {
                const items = (await collectPaged('/projects')).map(mapProject);
                const out = Object.fromEntries(items.map((x) => [x.id, x]));
                setCollectionCache(root, out);
                return clone(out);
            } catch (err) {
                if (err?.status === 403) {
                    runtimeCache.forbiddenRoots.add('projects');
                    const out = {};
                    setCollectionCache(root, out);
                    return clone(out);
                }
                throw err;
            }
        }
        if (root === 'categories') {
            const tree = await apiRequest('/lov/categories?mode=TREE');
            const out = buildCategoryMap(tree);
            setCollectionCache(root, out);
            return clone(out);
        }
        if (root === 'pricingData') {
            if (!canReadPricing()) {
                runtimeCache.forbiddenRoots.add('pricingData');
                const out = emptyPricingData();
                setCollectionCache(root, out);
                return clone(out);
            }
            if (runtimeCache.forbiddenRoots.has('pricingData')) return emptyPricingData();
            try {
                const [items, rules] = await Promise.all([
                    collectPaged('/pricing'),
                    fetchPricingRules(),
                ]);
                const out = buildPricingData(items, rules);
                setCollectionCache(root, out);
                return clone(out);
            } catch (err) {
                if (err?.status === 403) {
                    runtimeCache.forbiddenRoots.add('pricingData');
                    const out = emptyPricingData();
                    setCollectionCache(root, out);
                    return clone(out);
                }
                throw err;
            }
        }
        if (root === 'systemLogs') {
            const out = loadStoredJson(SYSTEM_LOGS_STORAGE_KEY, {});
            setCollectionCache(root, out);
            return clone(out);
        }
        if (root === '') {
            const [users, businesses, tasks, notifications, projects, categories, pricingData, systemLogs] = await Promise.all([
                readCollectionObject('users'),
                readCollectionObject('businesses'),
                readCollectionObject('tasks'),
                readCollectionObject('notifications'),
                readCollectionObject('projects'),
                readCollectionObject('categories'),
                readCollectionObject('pricingData'),
                readCollectionObject('systemLogs'),
            ]);
            const out = { users, businesses, tasks, notifications, projects, categories, pricingData, systemLogs };
            setCollectionCache(root, out);
            return clone(out);
        }
        return {};
    }

    async function readPath(path, options = {}) {
        const { root, id } = parsePath(path);
        const normalizedRoot = root === 'businesses' ? 'accounts' : root;
        const force = Boolean(options?.force);
        if (normalizedRoot === 'tasks' && id) {
            const cachedDetail = !force && typeof AppState?.getTaskDetail === 'function' ? AppState.getTaskDetail(id) : null;
            if (cachedDetail) return clone(cachedDetail);
            const item = await apiRequest(`/tasks/${id}`);
            const mapped = mapTask(item);
            if (typeof AppState?.setTaskDetail === 'function') AppState.setTaskDetail(id, mapped);
            return mapped;
        }
        if (normalizedRoot === 'accounts' && id) {
            const cachedDetail = !force && typeof AppState?.getBusinessDetail === 'function' ? AppState.getBusinessDetail(id) : null;
            if (cachedDetail) return clone(cachedDetail);
            const item = await apiRequest(`/accounts/${id}`);
            const mapped = mapBusiness(item);
            if (typeof AppState?.setBusinessDetail === 'function') AppState.setBusinessDetail(id, mapped);
            return mapped;
        }
        const col = await readCollectionObject(normalizedRoot);
        return id ? (col?.[id] ?? null) : col;
    }

    async function writeTask(id, partial, fullValue) {
        if (!id) return;

        if (fullValue && fullValue.status) {
            await apiRequest(`/tasks/${id}/status`, {
                method: 'PATCH',
                body: JSON.stringify({
                    status: uiTaskStatusToApi(fullValue.status),
                    close: fullValue.status === 'deal' || fullValue.status === 'cold',
                }),
            });
        }

        if (partial && Array.isArray(partial.logs) && partial.logs.length > 0) {
            const first = partial.logs[0] || {};
            const text = String(first.text || '').trim();
            const tagMatch = text.match(/^\[(.*?)\]\s*/);
            const tag = tagMatch ? tagMatch[1] : '';
            const freeText = tagMatch ? text.replace(/^\[(.*?)\]\s*/, '') : text;
            const reasonMap = {
                'Teklif Verildi': 'TEKLIF_VERILDI',
                'Karşı Teklif': 'KARSITEKLIF',
                'Teklif Kabul': 'TEKLIF_KABUL',
                'Teklif Red': 'TEKLIF_RED',
                'Yetkiliye Ulaşıldı': 'YETKILIYE_ULASILDI',
                'Yetkiliye Ulaşılamadı': 'YETKILIYE_ULASILAMADI',
                'İşletmeye Ulaşılamadı': 'ISLETMEYE_ULASILAMADI',
                'Tekrar Aranacak': 'TEKRAR_ARANACAK',
            };
            const reason = reasonMap[tag] || 'YETKILIYE_ULASILDI';
            await apiRequest(`/tasks/${id}/activity`, {
                method: 'POST',
                body: JSON.stringify({ reason, text: freeText || text, followUpDate: fullValue?.nextCallDate || undefined }),
            });
        }

        const assignee = fullValue?.assignee;
        if (assignee && assignee !== 'UNASSIGNED' && !String(assignee).startsWith('TARGET_POOL')) {
            if (assignee === 'Team 1' || assignee === 'Team 2') {
                const poolTeam = assignee === 'Team 1' ? 'TEAM_1' : 'TEAM_2';
                await apiRequest(`/tasks/${id}/pool`, {
                    method: 'POST',
                    body: JSON.stringify({ poolTeam }),
                });
                return;
            }
            const ownerId = await resolveOwnerId(fullValue?.ownerId || assignee);
            if (ownerId) {
                await apiRequest(`/tasks/${id}/assign`, {
                    method: 'POST',
                    body: JSON.stringify({ ownerId, durationDays: Number(fullValue?.durationDays || 7) }),
                });
            }
        } else if (assignee === 'UNASSIGNED') {
            await apiRequest(`/tasks/${id}/pool`, {
                method: 'POST',
                body: JSON.stringify({ poolTeam: 'GENERAL' }),
            });
        }
    }

    async function writeByPath(path, value, method = 'set', ctx = { accountIdMap: new Map() }) {
        const { root, id, tail } = parsePath(path);

        if (!root) {
            if (method === 'set' && value === null) {
                await Promise.all([
                    apiRequest('/projects/purge', { method: 'DELETE' }).catch(() => {}),
                    apiRequest('/tasks/purge', { method: 'DELETE' }).catch(() => {}),
                    apiRequest('/accounts/purge', { method: 'DELETE' }).catch(() => {}),
                ]);
                runtimeCache.collections.clear();
                runtimeCache.users = null;
                return;
            }

            if (method === 'set' && value && typeof value === 'object') {
                runtimeCache.collections.clear();
                const entries = Object.entries(value);
                for (const [k, v] of entries) {
                    if (v === null) await writeByPath(k, v, 'remove', ctx);
                    else await writeByPath(k, v, 'set', ctx);
                }
                return;
            }

            if (method === 'update' && value && typeof value === 'object') {
                const entries = Object.entries(value);
                const rootsToInvalidate = new Set(entries.map(([k]) => String(k).split('/')[0]));
                rootsToInvalidate.forEach((r) => invalidateCollectionCache(r));
                entries.sort(([a], [b]) => {
                    const order = { businesses: 0, tasks: 1 };
                    const ra = String(a).split('/')[0];
                    const rb = String(b).split('/')[0];
                    const ai = Object.prototype.hasOwnProperty.call(order, ra) ? order[ra] : 99;
                    const bi = Object.prototype.hasOwnProperty.call(order, rb) ? order[rb] : 99;
                    return ai - bi;
                });
                for (const [k, v] of entries) {
                    if (v === null) await writeByPath(k, v, 'remove', ctx);
                    else await writeByPath(k, v, 'set', ctx);
                }
            }
            return;
        }

        invalidateCollectionCache(root);
        if (root === 'users') runtimeCache.users = null;

        if (root === 'notifications' && id && method === 'remove') {
            await apiRequest(`/notifications/${id}/read`, { method: 'PATCH' });
            return;
        }

        if (root === 'users') {
            if (id && method === 'remove') return;
            if (id && method !== 'remove') {
                await apiRequest(`/users/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        name: value?.name,
                        isActive: String(value?.status || '').toLowerCase() !== 'pasif',
                    }),
                });
                return;
            }
            await apiRequest('/users', {
                method: 'POST',
                body: JSON.stringify({
                    email: value?.email,
                    name: value?.name,
                    role: uiRoleToApi(value?.role),
                    managerId: value?.managerId,
                    password: value?.password,
                }),
            });
            return;
        }

        if (root === 'businesses') {
            if (id && typeof AppState?.clearBusinessDetail === 'function') AppState.clearBusinessDetail(id);
            if (id && method === 'remove') return;
            if (id && method !== 'remove') {
                if (!tail.length && value && typeof value === 'object' && (value.companyName || value.businessName)) {
                    const isLegacyBusinessId = isLikelyLegacyId(id);
                    if (isLegacyBusinessId && !ctx.accountIdMap.get(id)) {
                        const created = await createBusiness(value);
                        ctx.accountIdMap.set(id, created.id);
                    } else {
                        const targetId = ctx.accountIdMap.get(id) || id;
                        try {
                            await apiRequest(`/accounts/${targetId}`, {
                                method: 'PATCH',
                                body: JSON.stringify(normalizeBusinessPatch(value)),
                            });
                        } catch (err) {
                            if (err?.status !== 404) throw err;
                            const created = await createBusiness(value);
                            ctx.accountIdMap.set(id, created.id);
                        }
                    }
                    return;
                }

                if (tail.length) {
                    const patch = businessTailToPatch(tail, value);
                    if (!Object.keys(patch).length) return;
                    if (patch.businessStatus && Object.keys(patch).length === 1) {
                        const targetId = ctx.accountIdMap.get(id) || id;
                        try {
                            await apiRequest(`/accounts/${targetId}/status`, {
                                method: 'PATCH',
                                body: JSON.stringify({ businessStatus: patch.businessStatus }),
                            });
                        } catch (err) {
                            if (err?.status !== 404) throw err;
                            const created = await createBusiness(value || {});
                            ctx.accountIdMap.set(id, created.id);
                            await apiRequest(`/accounts/${created.id}/status`, {
                                method: 'PATCH',
                                body: JSON.stringify({ businessStatus: patch.businessStatus }),
                            });
                        }
                        return;
                    }
                    const targetId = ctx.accountIdMap.get(id) || id;
                    try {
                        await apiRequest(`/accounts/${targetId}`, {
                            method: 'PATCH',
                            body: JSON.stringify(patch),
                        });
                    } catch (err) {
                        if (err?.status !== 404) throw err;
                        const created = await createBusiness(value || {});
                        ctx.accountIdMap.set(id, created.id);
                        await apiRequest(`/accounts/${created.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify(patch),
                        });
                    }
                    if (patch.businessStatus) {
                        const mappedTargetId = ctx.accountIdMap.get(id) || targetId;
                        await apiRequest(`/accounts/${mappedTargetId}/status`, {
                            method: 'PATCH',
                            body: JSON.stringify({ businessStatus: patch.businessStatus }),
                        });
                    }
                    return;
                }

                const targetId = ctx.accountIdMap.get(id) || id;
                await apiRequest(`/accounts/${targetId}`, {
                    method: 'PATCH',
                    body: JSON.stringify(normalizeBusinessPatch(value)),
                });
                if (value?.businessStatus) {
                    await apiRequest(`/accounts/${targetId}/status`, {
                        method: 'PATCH',
                        body: JSON.stringify({ businessStatus: String(value.businessStatus).toLowerCase() === 'pasif' ? 'PASSIVE' : 'ACTIVE' }),
                    });
                }
                return;
            }
            await createBusiness(value);
            return;
        }

        if (root === 'tasks') {
            if (id && typeof AppState?.clearTaskDetail === 'function') AppState.clearTaskDetail(id);
            if (id && method === 'remove') {
                await apiRequest(`/tasks/${id}`, { method: 'DELETE' });
                return;
            }
            if (id && (method === 'set' || method === 'update')) {
                if (tail.length) {
                    if (tail[0] === 'status') {
                        await apiRequest(`/tasks/${id}/status`, {
                            method: 'PATCH',
                            body: JSON.stringify({
                                status: uiTaskStatusToApi(value),
                                close: value === 'deal' || value === 'cold',
                            }),
                        });
                        return;
                    }
                    if (tail[0] === 'logs' && Array.isArray(value) && value.length > 0) {
                        await writeTask(id, { logs: value }, { nextCallDate: null });
                        return;
                    }
                    const patch = taskTailToPatch(tail, value);
                    if (Object.keys(patch).length > 0) {
                        await apiRequest(`/tasks/${id}`, {
                            method: 'PATCH',
                            body: JSON.stringify(patch),
                        });
                    }
                    return;
                }

                if (value && typeof value === 'object' && (value.businessId || value.accountId)) {
                    // Legacy task id'lerinde existence probe 404 üretir; direkt create'e düş.
                    if (isLikelyLegacyId(id)) {
                        await createTaskFromLegacy(value, ctx);
                        return;
                    }
                    // Modern id'lerde önce gerçek bir task var mı kontrol et.
                    // Aksi halde mevcut task üzerinde log/status güncellemesi yaparken yanlışlıkla
                    // duplicate task üretilebiliyor.
                    try {
                        await apiRequest(`/tasks/${id}`);
                        await writeTask(id, value, value);
                    } catch (err) {
                        if (err?.status !== 404) throw err;
                        await createTaskFromLegacy(value, ctx);
                    }
                    return;
                }
                await writeTask(id, value, value);
                return;
            }
            return;
        }

        if (root === 'projects') {
            if (id && method === 'remove') {
                await apiRequest(`/projects/${id}`, { method: 'DELETE' });
                return;
            }
            if (id && method !== 'remove') {
                await apiRequest(`/projects/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        name: value?.name,
                        description: value?.description,
                        status: toApiProjectStatus(value?.status),
                    }),
                });
                return;
            }
            await apiRequest('/projects', {
                method: 'POST',
                body: JSON.stringify({
                    name: value?.name || 'Yeni Proje',
                    description: value?.description,
                    status: toApiProjectStatus(value?.status),
                }),
            });
            return;
        }

        if (root === 'categories') {
            if (method === 'set' && value && typeof value === 'object' && !id && tail.length === 0) {
                await upsertCategoriesTree(value);
            }
            return;
        }

        if (root === 'pricingData' || root === 'systemLogs') {
            return;
        }
    }

    // --- Okuma ---
    function subscribeToCollection() {
        // SSE/Polling üzerinden real-time sync zaten SyncService tarafından yönetiliyor.
        return { off() {} };
    }

    function fetchOnce(path) {
        const { root } = parsePath(path || '');
        return readCollectionObject(root || '');
    }

    // --- REST API Doğrudan Yazma Sarmalayıcıları ---

    function deleteTask(taskId) {
        if (typeof AppState?.clearTaskDetail === 'function') AppState.clearTaskDetail(taskId);
        invalidateCollectionCache('tasks');
        invalidateCollectionCache('notifications');
        invalidateCollectionCache('businesses');
        return apiRequest(`/tasks/${taskId}`, { method: 'DELETE' });
    }

    function deleteBusiness(bizId) {
        if (typeof AppState?.clearBusinessDetail === 'function') AppState.clearBusinessDetail(bizId);
        return apiRequest(`/accounts/${bizId}`, { method: 'DELETE' });
    }

    function saveUser(user) {
        if (!user.id || !isNaN(user.id) || String(user.id).length < 15) { 
            return apiRequest('/users', {
                method: 'POST',
                body: JSON.stringify({
                    email: user.email,
                    name: user.name,
                    role: uiRoleToApi(user.role),
                    ...(user.managerId ? { managerId: user.managerId } : {}),
                    ...(user.team && user.team !== '-' ? { team: user.team } : {}),
                    ...(user.phone ? { phone: user.phone } : {}),
                    ...(user.settings ? { settings: user.settings } : {}),
                    password: user.password,
                })
            }).then(() => { runtimeCache.users = null; });
        } else {
            return apiRequest(`/users/${user.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    name: user.name,
                    email: user.email,
                    role: uiRoleToApi(user.role),
                    managerId: user.managerId || null,
                    team: user.team && user.team !== '-' ? user.team : null,
                    phone: user.phone || null,
                    settings: user.settings || null,
                    isActive: String(user.status || '').toLowerCase() !== 'pasif',
                })
            }).then(() => { runtimeCache.users = null; });
        }
    }

    function deleteUser(userId) {
        return apiRequest(`/users/${userId}`, {
            method: 'DELETE'
        }).then(() => { runtimeCache.users = null; });
    }

    function updateUserStatus(userId, status) {
        const isActive = String(status).toLowerCase() !== 'pasif';
        const path = isActive ? `/users/${userId}` : `/users/${userId}/deactivate`;
        const init = isActive
            ? { method: 'PATCH', body: JSON.stringify({ isActive: true }) }
            : { method: 'PATCH' };
        return apiRequest(path, init).then(() => { runtimeCache.users = null; });
    }

    function markNotificationRead(notifId) {
        return apiRequest(`/notifications/${notifId}/read`, { method: 'PATCH' })
            .then((result) => {
                invalidateCollectionCache('notifications');
                return result;
            })
            .catch(() => {});
    }

    function saveNotification(notif) {
        return apiRequest('/notifications', { method: 'POST', body: JSON.stringify(notif) }).catch(() => {});
    }

    function markAllNotificationsRead(notifIds) {
        if (!Array.isArray(notifIds) || notifIds.length === 0) return Promise.resolve([]);
        return apiRequest('/notifications/me/read-all', { method: 'PATCH' })
            .then((result) => {
                invalidateCollectionCache('notifications');
                return result;
            })
            .catch(() => {});
    }

    function addSystemLog(action, userName) {
        const current = loadStoredJson(SYSTEM_LOGS_STORAGE_KEY, {});
        const next = window.SystemPersistence?.appendSystemLog
            ? window.SystemPersistence.appendSystemLog(
                current,
                action,
                userName,
                new Date(),
                Math.random().toString(36).slice(2, 8),
            )
            : (() => {
                const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                return {
                    ...current,
                    [id]: {
                        id,
                        user: userName || 'Sistem',
                        action: action || '',
                        date: new Date().toLocaleString('tr-TR'),
                        timestamp: new Date().toISOString(),
                        createdAt: new Date().toISOString(),
                    },
                };
            })();
        saveStoredJson(SYSTEM_LOGS_STORAGE_KEY, next);
        setCollectionCache('systemLogs', next);
        if (typeof AppState !== 'undefined') {
            AppState.systemLogs = Object.values(next).sort((a, b) => {
                return new Date(b?.createdAt || b?.date || 0) - new Date(a?.createdAt || a?.date || 0);
            });
        }
        invalidateCollectionCache('');
        return Promise.resolve();
    }

    function clearSystemLogs() {
        saveStoredJson(SYSTEM_LOGS_STORAGE_KEY, {});
        setCollectionCache('systemLogs', {});
        if (typeof AppState !== 'undefined') {
            AppState.systemLogs = [];
        }
        invalidateCollectionCache('');
        return Promise.resolve();
    }

    function saveCategories(categories) {
        // Kategori ağacını backend ile iki yönlü senkronize et: önce silinenleri kaldır, sonra eksikleri ekle.
        return (async () => {
            await reconcileRemovedCategories(categories);
            await upsertCategoriesTree(categories);
        })();
    }

    function savePricing(data) {
        return (async () => {
            const existing = await collectPaged('/pricing');
            for (const item of existing) {
                await apiRequest(`/pricing/${item.id}`, { method: 'DELETE' });
            }

            const payload = data || {};
            const rows = [];

            const commissionItems = payload.komisyonlar || payload.COMMISSION?.items || [];
            const serviceItems = payload.hizmetler || payload.SERVICE?.items || [];
            const dopingItems = payload.dopingler || payload.DOPING?.items || [];
            const socialItems = payload.sosyalMedya || payload.SOCIAL_MEDIA?.items || [];

            commissionItems.forEach((x) => {
                rows.push({
                    name: String(x?.name || '').trim(),
                    category: 'COMMISSION',
                    unitPrice: 0,
                    commissionRate: parseCommissionRate(x?.val),
                    description: buildCommissionDescription(x?.val, x?.description),
                    status: 'ACTIVE',
                });
            });
            serviceItems.forEach((x) => {
                rows.push({
                    name: String(x?.name || '').trim(),
                    category: 'SERVICE',
                    unitPrice: parsePrice(x?.priceEx ?? x?.priceInc),
                    status: 'ACTIVE',
                });
            });
            dopingItems.forEach((x) => {
                rows.push({
                    name: String(x?.name || '').trim(),
                    category: 'DOPING',
                    unitPrice: parsePrice(x?.priceEx ?? x?.priceInc),
                    status: 'ACTIVE',
                });
            });
            socialItems.forEach((x) => {
                rows.push({
                    name: String(x?.name || '').trim(),
                    category: 'SOCIAL_MEDIA',
                    unitPrice: parsePrice(x?.priceEx ?? x?.priceInc),
                    status: 'ACTIVE',
                });
            });

            for (const row of rows) {
                if (!row.name) continue;
                await apiRequest('/pricing', {
                    method: 'POST',
                    body: JSON.stringify(row),
                });
            }

            const nextRules = normalizePricingRules(payload.RULES || payload.rules);
            await apiRequest('/pricing/rules', {
                method: 'POST',
                body: JSON.stringify(nextRules),
            });

            const [refreshedItems, refreshedRules] = await Promise.all([
                collectPaged('/pricing'),
                fetchPricingRules(),
            ]);
            const refreshed = buildPricingData(refreshedItems, refreshedRules);
            setCollectionCache('pricingData', refreshed);
            return refreshed;
        })();
    }

    function saveProject(project) {
        if (!project || !project.id) {
            return apiRequest('/projects', {
                method: 'POST',
                body: JSON.stringify({
                    name: project?.name || 'Yeni Proje',
                    description: project?.description,
                    status: toApiProjectStatus(project?.status),
                }),
            });
        }
        return apiRequest(`/projects/${project.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                name: project.name,
                description: project.description,
                status: toApiProjectStatus(project.status),
            }),
        });
    }

    function checkSystemInit() {
        // Sistem başlatma artık backend tarafında yönetiliyor
        return Promise.resolve();
    }

    function getApiBase() {
        return API_BASE;
    }

    return {
        apiRequest,
        mapBusiness,
        mapTask,
        subscribeToCollection,
        fetchOnce,
        fetchTaskPage,
        fetchBusinessPage,
        fetchAccountTargetPreview,
        readPath,
        deleteTask,
        deleteBusiness,
        saveUser,
        deleteUser,
        updateUserStatus,
        markNotificationRead,
        saveNotification,
        markAllNotificationsRead,
        addSystemLog,
        clearSystemLogs,
        saveCategories,
        savePricing,
        saveProject,
        checkSystemInit,
        getApiBase,
        canReadProjects,
        invalidateCollectionCache,
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataService;
}
