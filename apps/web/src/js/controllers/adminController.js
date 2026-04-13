// ============================================================
// controllers/adminController.js
// Kullanıcı yönetimi, kategoriler, sistem logları
// ============================================================

const AdminController = (() => {

    let _activeTab = 'users';
    let _usersHydrationInFlight = false;
    let _userPulseCache = { byKey: new Map(), loadedAt: 0 };
    const BACKEND_ADMIN_ONLY_PERMISSIONS = new Set(['manageSettings', 'viewAuditLogs']);
    const PERMISSION_MATRIX_DEFS = [
        { key: 'viewAllTasks', label: 'Ekip görevlerini görüntüleyebilir', title: 'Ekip görevleri', group: 'Operasyon', detail: 'Tüm ekip akışını izleyebilir.' },
        { key: 'assignTasks', label: 'Görev atama yapabilir', title: 'Görev atama', group: 'Operasyon', detail: 'Görevleri kullanıcıya atayabilir.' },
        { key: 'reassignTask', label: 'Görev yeniden atayabilir', title: 'Yeniden atama', group: 'Operasyon', detail: 'Mevcut görevi başka kullanıcıya taşıyabilir.' },
        { key: 'bulkAssign', label: 'Toplu aktarım ve havuz işlemleri yapabilir', title: 'Toplu işlemler', group: 'Operasyon', detail: 'Havuz ve toplu aktarım aksiyonları.' },
        { key: 'closeDeal', label: 'Deal / kapatma işlemi yapabilir', title: 'Deal kapatma', group: 'Operasyon', detail: 'Kapatma ve deal sonucu işleyebilir.' },
        { key: 'viewReports', label: 'Raporları ve performans tablolarını görebilir', title: 'Rapor görünümü', group: 'Raporlama', detail: 'Performans ve rapor ekranlarını açabilir.' },
        { key: 'exportReports', label: 'Rapor export alabilir', title: 'Rapor export', group: 'Raporlama', detail: 'Rapor çıktıları oluşturabilir.' },
        { key: 'manageProjects', label: 'Proje / hedef kitle ekranlarını yönetebilir', title: 'Proje yönetimi', group: 'Proje', detail: 'Hedef kitle ve proje alanlarını yönetebilir.' },
        { key: 'createManualProject', label: 'Boş / taslak hedef proje oluşturabilir', title: 'Taslak proje', group: 'Proje', detail: 'Manuel veya boş proje başlatabilir.' },
        { key: 'importCsv', label: 'CSV import kullanabilir', title: 'CSV import', group: 'Proje', detail: 'Toplu veri içe aktarımı başlatabilir.' },
        { key: 'manageUsers', label: 'Kullanıcı profili düzenleyebilir', title: 'Kullanıcı düzenleme', group: 'Yönetim', detail: 'Kullanıcı kartlarını düzenleyebilir.' },
        { key: 'manageRoles', label: 'Rol ve mikro yetki yönetebilir', title: 'Rol yönetimi', group: 'Yönetim', detail: 'Rol ve mikro yetkileri değiştirebilir.' },
        { key: 'manageSettings', label: 'Ayarlar ve bakım araçlarını kullanabilir', title: 'Ayarlar & bakım', group: 'Yönetim', detail: 'Bakım ve sistem ayarlarına erişebilir.' },
        { key: 'viewAuditLogs', label: 'Audit / sistem loglarını görebilir', title: 'Audit logları', group: 'Yönetim', detail: 'Sistem ve audit loglarını görüntüleyebilir.' },
        { key: 'deleteArchive', label: 'Arşiv kaydı silebilir', title: 'Arşiv silme', group: 'Yönetim', detail: 'Geçmiş kaydı kaldırabilir.' },
    ];
    const GRUPANYA_CATEGORY_TREE = {
        'Aktivite - Eğlence (Core)': ['Binicilik - Parkur', 'Eğlence Merkezi', 'Havuz - Plaj', 'Poligon - Paintball', 'Rafting - Yamaç Paraşütü', 'Sanal Gerçeklik - Kaçış', 'Su Sporları'],
        'Bilet - Etkinlik (Core)': ['Akvaryum - Tema Park', 'Çocuk Tiyatro', 'Gösteri - Müzikal', 'Konser', 'Parti - Festival', 'Sergi - Müze', 'Sinema', 'Tiyatro'],
        'Güzellik (Core)': ['Biorezonans', 'Botoks - Dolgu', 'Cilt Bakımı', 'Epilasyon - Ağda', 'Kalıcı Makyaj', 'Kaş - Kirpik', 'Manikür - Pedikür', 'Saç - Makyaj', 'Solaryum', 'Zayıflama'],
        'Hizmet (Core)': ['Araç Kiralama - Vize', 'Ev Hizmetleri', 'Evcil Hayvan Hizmetleri', 'Fotoğrafçılık - Baskı', 'İndirim Çekleri', 'Kuru Temizleme', 'Oto Bakım', 'Sigorta', 'Transfer - Nakliye'],
        'İftar (Core)': ['Açık Büfe İftar', 'Anadolu Yakası İftar', 'Avrupa Yakası İftar', 'Otelde İftar', 'Restoranda İftar', 'Teknede İftar'],
        'Kahvaltı (Core)': ['Açık Büfe Kahvaltı', 'Açık Havada Kahvaltı', 'Boğazda Kahvaltı', 'Brunch', 'Cafede Kahvaltı', 'Deniz Kenarında Kahvaltı', 'Doğada Kahvaltı', 'Hafta İçi Kahvaltı', 'Hafta Sonu Kahvaltı', 'Kahvaltı Tabağı', 'Köy Kahvaltısı', 'Otelde Kahvaltı', 'Serpme Kahvaltı', 'Teknede Kahvaltı'],
        'Masaj - Spa (Core)': ['Anti Stress Masajı', 'Aromaterapi Masajı', 'Bali Masajı', 'Baş-Boyun ve Omuz Masajı', 'Bebek Spa', 'Çift Masajı', 'Hamam', 'İsveç Masajı', 'Klasik Masaj', 'Köpük Masajı', 'Lenf Drenaj Masajı', 'Masaj', 'Otel Spa', 'Refleksoloji Masajı', 'Shiatsu Masajı', 'Sıcak Taş Masajı', 'Sporcu Masajı', 'Thai Masajı', 'Yüz Masajı'],
        'Özel Günler (Core)': ['Anneler Günü', 'Bayram', 'Harika Cuma', 'Kadınlar Günü'],
        'Sevgililer Günü (Core)': ['Sevgililer Günü Etkinlik', 'Sevgililer Günü Hediye', 'Sevgililer Günü Konaklama', 'Sevgililer Günü Spa', 'Sevgililer Günü Tur', 'Sevgililer Günü Yemek'],
        'Spor - Eğitim - Kurs (Core)': ['Anaokulu - Çocuk', 'Atölye', 'Dans - Müzik', 'Dil Eğitimi', 'Fitness - Gym', 'Mesleki Eğitim', 'Online Kurslar', 'Pilates', 'Yoga - Nefes Terapisi', 'Yüzme Kursu'],
        'Yemek (Core)': ['Akşam Yemeği', 'Dünya Mutfağı', 'Fast Food', 'Kahve - Fırın - Tatlı', 'Mangal - Steakhouse', 'Meyhane - Fasıl', 'Tekne', 'Türk Mutfağı'],
        'Yılbaşı (Core)': ['Yılbaşı Eğlencesi', 'Yılbaşı Tatili', 'Yılbaşı Turları'],
        'Bayram Turları (Travel)': ['Kurban Bayramı Turları', 'Ramazan Bayramı Turları'],
        'Özel Günler (Travel)': ['Bayram', 'Harika Cuma'],
        'Tatil Otelleri (Travel)': ['Akdeniz Bölgesi', 'Ege Bölgesi', 'İç Anadolu Bölgesi', 'Karadeniz Bölgesi', 'Marmara Bölgesi'],
        'Tatil Teması (Travel)': ['Her Şey Dahil'],
        'Turistik Aktiviteler (Travel)': ['Havuz Girişi', 'Kış Sporları', 'Plaj Girişi', 'Ulaşım - Diğer', 'Ulaşım - Uçak', 'Yaz Sporları'],
        'Yurtdışı Turlar (Travel)': ['Afrika', 'Amerika', 'Asya', 'Avrupa', 'Balkanlar ve Yunanistan', 'Kıbrıs Otel', 'Uzakdoğu', 'Vizesiz Avrupa', 'Vizesiz Balkanlar', 'Yurtdışı Otel'],
        'Yurtiçi Otel (Travel)': ['Ankara Otelleri', 'Antalya Otelleri', 'Bursa Otelleri', 'Diğer Kentler', 'İstanbul Otelleri', 'İzmir Otelleri', 'Yurtiçi Termal Otel'],
        'Yurtiçi Turlar (Travel)': ['Günübirlik Turlar', 'Haftasonu Turları', 'Kapadokya Turları', 'Karadeniz Turları', 'Kayak Turları', 'Kültür Turları', 'Mavi Yolculuk', 'Yurtiçi Paket Tur'],
        'Eski Kategoriler': [],
    };

    function normalizeTeamForRole(role, team) {
        const normalizedRole = String(role || '').trim();
        if (normalizedRole === 'Yönetici') return '-';
        return team && team !== '' ? team : '-';
    }

    function getDefaultPermissionsForRole(role) {
        const normalizedRole = String(role || '').trim();
        const defaults = {
            export: false,
            createBiz: normalizedRole !== 'Takım Lideri',
            deleteArchive: false,
            viewAllTasks: normalizedRole !== 'Satış Temsilcisi',
            assignTasks: normalizedRole !== 'Satış Temsilcisi',
            reassignTask: normalizedRole === 'Yönetici' || normalizedRole === 'Takım Lideri',
            bulkAssign: normalizedRole === 'Yönetici' || normalizedRole === 'Takım Lideri',
            closeDeal: normalizedRole === 'Yönetici' || normalizedRole === 'Takım Lideri',
            manageProjects: normalizedRole === 'Yönetici' || normalizedRole === 'Takım Lideri',
            createManualProject: normalizedRole === 'Yönetici' || normalizedRole === 'Takım Lideri',
            viewReports: normalizedRole === 'Yönetici' || normalizedRole === 'Takım Lideri',
            exportReports: normalizedRole === 'Yönetici' || normalizedRole === 'Takım Lideri',
            importCsv: normalizedRole === 'Yönetici' || normalizedRole === 'Takım Lideri',
            manageUsers: false,
            manageRoles: false,
            manageSettings: false,
            viewAuditLogs: false,
        };
        if (normalizedRole === 'Yönetici') {
            Object.keys(defaults).forEach((key) => { defaults[key] = true; });
            BACKEND_ADMIN_ONLY_PERMISSIONS.forEach((permissionKey) => {
                defaults[permissionKey] = false;
            });
        }
        if (normalizedRole === 'Operasyon') {
            defaults.export = true;
            defaults.createBiz = true;
            defaults.viewAllTasks = true;
            defaults.importCsv = true;
        }
        return defaults;
    }

    function getPermissionPresetForRole(role) {
        const normalizedRole = String(role || '').trim();
        if (normalizedRole === 'Yönetici') return 'manager';
        if (normalizedRole === 'Takım Lideri') return 'team_lead';
        if (normalizedRole === 'Operasyon') return 'ops';
        return 'sales';
    }

    function getDefaultPermissionsForPreset(preset, fallbackRole = '') {
        const normalizedPreset = String(preset || '').trim();
        if (normalizedPreset === 'manager') return getDefaultPermissionsForRole('Yönetici');
        if (normalizedPreset === 'team_lead') return getDefaultPermissionsForRole('Takım Lideri');
        if (normalizedPreset === 'ops') return getDefaultPermissionsForRole('Operasyon');
        if (normalizedPreset === 'sales') return getDefaultPermissionsForRole('Satış Temsilcisi');
        return getDefaultPermissionsForRole(fallbackRole);
    }

    function renderPermissionMatrix(prefix, role = '') {
        const container = document.getElementById(`${prefix}UserPermissionMatrix`);
        if (!container) return;
        const groupedDefinitions = PERMISSION_MATRIX_DEFS.reduce((groups, permission) => {
            const groupKey = permission.group || 'Diğer';
            groups[groupKey] = groups[groupKey] || [];
            groups[groupKey].push(permission);
            return groups;
        }, {});

        container.innerHTML = Object.entries(groupedDefinitions).map(([groupName, permissions]) => `
            <section class="permission-cluster">
                <div class="permission-cluster-head">
                    <span class="permission-cluster-kicker">${groupName}</span>
                    <strong>${groupName === 'Operasyon' ? 'Görev akışı izinleri' : groupName === 'Raporlama' ? 'Rapor ve çıktı aksiyonları' : groupName === 'Proje' ? 'Hedefleme ve içe aktarma alanı' : 'Yönetim ve görünürlük alanı'}</strong>
                </div>
                <div class="permission-cluster-grid">
                    ${permissions.map((permission) => `
                        <label class="permission-chip">
                            <input type="checkbox" id="${prefix}Perm${permission.key.charAt(0).toUpperCase()}${permission.key.slice(1)}">
                            <span class="permission-chip-body">
                                <span class="permission-chip-title">${permission.title || permission.label}</span>
                                <span class="permission-chip-detail">${permission.detail || permission.label}</span>
                            </span>
                        </label>
                    `).join('')}
                </div>
            </section>
        `).join('');
        const presetEl = document.getElementById(`${prefix}UserPermissionPreset`);
        if (presetEl && presetEl.value !== 'custom') presetEl.value = getPermissionPresetForRole(role);
        applyPermissionSettings(prefix, getDefaultPermissionsForRole(role));
    }

    function collectPermissionSettings(prefix) {
        const permissions = {
            preset: document.getElementById(`${prefix}UserPermissionPreset`)?.value || 'custom',
            export: document.getElementById(`${prefix}PermExport`)?.checked || false,
            createBiz: document.getElementById(`${prefix}PermCreateBiz`)?.checked || false,
            deleteArchive: document.getElementById(`${prefix}PermDeleteArchive`)?.checked || false,
        };
        PERMISSION_MATRIX_DEFS.forEach((permission) => {
            const id = `${prefix}Perm${permission.key.charAt(0).toUpperCase()}${permission.key.slice(1)}`;
            permissions[permission.key] = document.getElementById(id)?.checked || false;
        });
        return permissions;
    }

    function applyPermissionSettings(prefix, settings = {}) {
        const permissions = { ...getDefaultPermissionsForRole(''), ...(settings || {}) };
        const setChecked = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.checked = Boolean(value);
        };
        const presetEl = document.getElementById(`${prefix}UserPermissionPreset`);
        if (presetEl) presetEl.value = permissions.preset || 'custom';
        setChecked(`${prefix}PermExport`, permissions.export);
        setChecked(`${prefix}PermCreateBiz`, permissions.createBiz !== false);
        setChecked(`${prefix}PermDeleteArchive`, permissions.deleteArchive);
        PERMISSION_MATRIX_DEFS.forEach((permission) => {
            const id = `${prefix}Perm${permission.key.charAt(0).toUpperCase()}${permission.key.slice(1)}`;
            setChecked(id, permissions[permission.key]);
        });
    }

    function buildUserSettings(existingSettings = {}, permissions = {}) {
        const nextSettings = { ...(existingSettings || {}) };
        delete nextSettings.dailyQuota;
        nextSettings.permissions = permissions;
        return nextSettings;
    }

    function getDisplayedTeam(user) {
        return normalizeTeamForRole(user?.role, user?.team);
    }

    function isTeamLeaderUser(user = AppState.loggedInUser) {
        return String(user?.role || '') === 'Takım Lideri';
    }

    function isManagerUser(user = AppState.loggedInUser) {
        return String(user?.role || '') === 'Yönetici';
    }

    function getUsersVisibleToCurrentManager() {
        const currentUser = AppState.loggedInUser || {};
        if (!isTeamLeaderUser(currentUser)) return [...AppState.users];

        return AppState.users.filter((user) => {
            if (!user) return false;
            if (user.email === currentUser.email) return true;
            return getDisplayedTeam(user) === currentUser.team;
        });
    }

    function canCurrentUserManageUser(targetUser) {
        const currentUser = AppState.loggedInUser || {};
        const targetApiRole = String(targetUser?._apiRole || '').toUpperCase();
        if (targetApiRole === 'ADMIN') return false;

        if (isManagerUser(currentUser)) return true;
        if (!isTeamLeaderUser(currentUser)) return false;

        return String(targetUser?.role || '') === 'Satış Temsilcisi'
            && getDisplayedTeam(targetUser) === currentUser.team;
    }

    function getUserEmailMap() {
        if (typeof AppState.getUserEmailMap === 'function') {
            return AppState.getUserEmailMap();
        }
        return new Map((AppState.users || []).filter((user) => user?.email).map((user) => [user.email, user]));
    }

    function getUserNameMap() {
        if (typeof AppState.getUserNameMap === 'function') {
            return AppState.getUserNameMap();
        }
        return new Map((AppState.users || []).filter((user) => user?.name).map((user) => [user.name, user]));
    }

    function getDataService() {
        return typeof DataService !== 'undefined' ? DataService : null;
    }

    async function syncUsersStateFromServer() {
        const dataService = getDataService();
        if (!dataService || typeof dataService.fetchOnce !== 'function') return AppState.users || [];
        const usersRaw = await dataService.fetchOnce('users');
        const normalizedUsers = Array.isArray(usersRaw) ? usersRaw : Object.values(usersRaw || {});
        if (Array.isArray(normalizedUsers)) AppState.users = normalizedUsers;
        return AppState.users || [];
    }

    async function loadUserPulseMap(force = false) {
        const now = Date.now();
        if (!force && _userPulseCache.loadedAt && (now - _userPulseCache.loadedAt) < 30000) {
            return _userPulseCache.byKey;
        }

        const dataService = getDataService();
        if (!dataService || typeof dataService.apiRequest !== 'function') {
            return new Map();
        }

        try {
            const response = await dataService.apiRequest('/reports/team-pulse');
            const records = Array.isArray(response?.records) ? response.records : [];
            const nextMap = new Map();
            records.forEach((record) => {
                const userId = String(record?.user?.id || '').trim();
                const userName = String(record?.user?.name || '').trim();
                const normalized = {
                    openCount: Number(record?.metrics?.monthly?.open?.count || 0),
                    dealCount: Number(record?.metrics?.monthly?.deal?.count || 0),
                    coldCount: Number(record?.metrics?.monthly?.cold?.count || 0),
                    totalCount: Number(record?.metrics?.monthly?.open?.count || 0)
                        + Number(record?.metrics?.monthly?.deal?.count || 0)
                        + Number(record?.metrics?.monthly?.cold?.count || 0),
                    record,
                };
                if (userId) nextMap.set(`id:${userId}`, normalized);
                if (userName) nextMap.set(`name:${userName}`, normalized);
            });
            _userPulseCache = { byKey: nextMap, loadedAt: now };
            return nextMap;
        } catch (err) {
            console.warn('User pulse load failed:', err);
            return new Map();
        }
    }

    function getPulseSummaryForUser(user, pulseMap) {
        if (!user || !(pulseMap instanceof Map)) return null;
        return pulseMap.get(`id:${user.id}`) || pulseMap.get(`name:${user.name}`) || null;
    }

    async function fetchScopedUserTaskRows(user) {
        if (!user?.id) return [];
        const dataService = getDataService();
        if (!dataService || typeof dataService.apiRequest !== 'function') return [];
        try {
            const response = await dataService.apiRequest(`/reports/tasks?ownerId=${encodeURIComponent(user.id)}`);
            if (typeof dataService.normalizeReportTaskRows === 'function') {
                return dataService.normalizeReportTaskRows(response);
            }
            return Array.isArray(response) ? response : (Array.isArray(response?.items) ? response.items : (Array.isArray(response?.rows) ? response.rows : []));
        } catch (err) {
            console.warn('Scoped user task rows load failed:', err);
            return [];
        }
    }

    function switchTab(tab) {
        if (typeof AppController !== 'undefined' && typeof AppController.canAccessAdminTab === 'function' && !AppController.canAccessAdminTab(tab)) {
            showToast('Bu yonetim sekmesine erisim yetkiniz bulunmuyor.', 'warning');
            tab = 'users';
        }
        _activeTab = tab;
        document.querySelectorAll('.adm-tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));

        const btn = document.querySelector(`.adm-tab-btn[onclick="switchAdminTab('${tab}')"]`);
        if (btn) btn.classList.add('active');

        const content = document.getElementById('adminTab' + tab.charAt(0).toUpperCase() + tab.slice(1));
        if (content) content.classList.add('active');

        if (tab === 'users') renderUsers();
        else if (tab === 'categories') renderCategoryList();
        else if (tab === 'data') {}
        else if (tab === 'logs') displaySystemLogs();
        else if (tab === 'settings') renderSettings();
        else if (tab === 'pricing') PricingController.renderAdminPricing();
    }

    function refreshActiveTab() {
        switchTab(_activeTab);
    }

    function renderSettings() {}

    function cloneCategoryTree(tree) {
        return JSON.parse(JSON.stringify(tree || {}));
    }

    function createGrupanyaCategoryTree() {
        return cloneCategoryTree(GRUPANYA_CATEGORY_TREE);
    }

    function getCategoryUsageFallback(type, oldMain, oldSub = null) {
        const matchedTaskIds = new Set();
        const matchedBusinessIds = new Set();

        AppState.tasks.forEach((task) => {
            const matches = type === 'main'
                ? task.mainCategory === oldMain
                : task.mainCategory === oldMain && task.subCategory === oldSub;
            if (!matches) return;
            matchedTaskIds.add(task.id);
            if (task.businessId) matchedBusinessIds.add(task.businessId);
        });

        AppState.businesses.forEach((biz) => {
            const matches = type === 'main'
                ? biz.mainCategory === oldMain
                : biz.mainCategory === oldMain && biz.subCategory === oldSub;
            if (!matches) return;
            if (biz.id) matchedBusinessIds.add(biz.id);
        });

        return {
            taskIds: Array.from(matchedTaskIds),
            businessIds: Array.from(matchedBusinessIds),
            taskCount: matchedTaskIds.size,
            businessCount: matchedBusinessIds.size,
            hasLinkedRecords: matchedTaskIds.size > 0 || matchedBusinessIds.size > 0,
        };
    }

    async function getCategoryUsage(type, oldMain, oldSub = null) {
        if (typeof DataService?.apiRequest !== 'function') {
            return getCategoryUsageFallback(type, oldMain, oldSub);
        }
        try {
            const response = await DataService.apiRequest('/admin/maintenance/category-usage', {
                method: 'POST',
                body: JSON.stringify({ type, oldMain, oldSub }),
            });
            return {
                taskIds: Array.isArray(response?.taskIds) ? response.taskIds : [],
                businessIds: Array.isArray(response?.businessIds) ? response.businessIds : [],
                taskCount: Number(response?.taskCount || 0),
                businessCount: Number(response?.businessCount || 0),
                hasLinkedRecords: Boolean(response?.hasLinkedRecords),
            };
        } catch (error) {
            console.warn('Category usage could not be loaded from backend, using local fallback:', error);
            return getCategoryUsageFallback(type, oldMain, oldSub);
        }
    }

    function shouldTransferCategoryEntity(entity, type, oldMain, oldSub = null) {
        return type === 'main'
            ? entity?.mainCategory === oldMain
            : entity?.mainCategory === oldMain && entity?.subCategory === oldSub;
    }

    async function runBatched(requests, batchSize = 10) {
        const results = [];
        for (let i = 0; i < requests.length; i += batchSize) {
            const batchResults = await Promise.all(requests.slice(i, i + batchSize).map((fn) => fn()));
            results.push(...batchResults);
        }
        return results;
    }

    // --- Kullanıcı Yönetimi ---

    function renderUsers() {
        const listContainer = document.getElementById('usersListContainer');
        if (!listContainer) return;
        const currentUser = AppState.loggedInUser || {};
        const canManageUsers = typeof hasPermission === 'function' ? hasPermission('manageUsers', currentUser) : isManagerUser(currentUser);
        const visibleUsers = getUsersVisibleToCurrentManager();

        if (visibleUsers.length === 0 && !_usersHydrationInFlight && typeof DataService?.fetchOnce === 'function') {
            _usersHydrationInFlight = true;
            listContainer.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#64748b;">Kullanıcı listesi yenileniyor...</td></tr>`;
            DataService.fetchOnce('users')
                .then((usersRaw) => {
                    const normalizedUsers = Array.isArray(usersRaw) ? usersRaw : Object.values(usersRaw || {});
                    if (normalizedUsers.length > 0) {
                        AppState.users = normalizedUsers;
                    }
                })
                .catch((err) => {
                    console.warn('User list refresh failed:', err);
                })
                .finally(() => {
                    _usersHydrationInFlight = false;
                    renderUsers();
                });
            return;
        }

        const paintRows = (pulseMap) => {
            const search = (document.getElementById('userSearchInput')?.value || '').toLowerCase().trim();
            const rawTeamFilter = document.getElementById('userTeamFilter')?.value || '';
            const availableTeams = Array.from(new Set(visibleUsers.map((user) => getDisplayedTeam(user)).filter(Boolean)));
            const teamFilter = isTeamLeaderUser(currentUser)
                ? currentUser.team
                : (rawTeamFilter && availableTeams.includes(rawTeamFilter) ? rawTeamFilter : '');

            let filtered = visibleUsers.filter(u => {
                const haystackName = String(u.name || '').toLowerCase();
                const haystackEmail = String(u.email || '').toLowerCase();
                const matchSearch = !search || haystackName.includes(search) || haystackEmail.includes(search);
                const matchTeam = !teamFilter || getDisplayedTeam(u) === teamFilter;
                return matchSearch && matchTeam;
            });

            if (filtered.length === 0 && visibleUsers.length > 0 && !search && !isTeamLeaderUser(currentUser)) {
                filtered = [...visibleUsers];
            }

            if (filtered.length === 0) {
                const emptyText = visibleUsers.length === 0
                    ? 'Bu kapsamda görüntüleyebileceğiniz kullanıcı bulunamadı.'
                    : 'Sonuç bulunamadı.';
                listContainer.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#888;">${emptyText}</td></tr>`;
                return;
            }

            const rows = filtered.map(u => {
                const pulseSummary = getPulseSummaryForUser(u, pulseMap);
                const openCount = Number(pulseSummary?.openCount || 0);
                const statusStyle = u.status === 'Pasif' ? 'color:var(--danger-color); font-weight:bold;' : 'color:var(--success-color);';
                const isSystemAdmin = String(u?._apiRole || '').toUpperCase() === 'ADMIN';
                const displayTeam = getDisplayedTeam(u);
                const canManage = canCurrentUserManageUser(u);

                const actions = isSystemAdmin
                    ? '<span style="font-size:11px; color:#ccc;">Sistem Yöneticisi</span>'
                    : !canManageUsers || !canManage
                    ? '<span style="font-size:11px; color:#64748b;">Sadece Görüntüleme</span>'
                    : `<div style="display:flex; gap:5px; justify-content:flex-end;">
                        ${u.status === 'Pasif'
                            ? `<button class="btn-tiny" style="background:var(--success-color); color:#fff;" onclick="activateUser('${u.email}')">Aktifleştir</button>`
                            : `<button class="btn-tiny" style="background:var(--warning-color); color:#fff;" onclick="requestUserDeactivation('${u.email}')">Pasife Çek</button>`
                        }
                        <button class="btn-tiny" style="background:var(--info-color); color:#fff;" onclick="openEditUserModal('${u.email}')">Düzenle</button>
                        <button class="btn-tiny" style="background:var(--danger-color); color:#fff;" onclick="requestUserDeletion('${u.email}')">Sil</button>
                       </div>`;

                return `<tr>
                    <td><button class="btn-user-badge" onclick="openUserProfileModal('${u.name}')">👤 ${u.name}</button></td>
                    <td>${u.role}</td>
                    <td>${displayTeam}</td>
                    <td style="${statusStyle}">${u.status || 'Aktif'}</td>
                    <td><span style="background:var(--primary-color); color:#fff; padding:2px 8px; border-radius:10px; font-size:11px;">${openCount} Açık</span></td>
                    <td style="text-align:right;">${actions}</td>
                </tr>`;
            }).join('');

            listContainer.innerHTML = rows;
        };

        const dataService = getDataService();
        if (!dataService || typeof dataService.apiRequest !== 'function') {
            listContainer.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#64748b;">Kullanıcı özetleri şu anda yüklenemedi.</td></tr>`;
            return;
        }

        listContainer.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#64748b;">Kullanıcı özetleri yükleniyor...</td></tr>`;
        loadUserPulseMap()
            .then((pulseMap) => paintRows(pulseMap))
            .catch(() => paintRows(new Map()));
    }

    async function saveNewUser() {
        if (typeof hasPermission === 'function' && !hasPermission('manageUsers')) {
            showToast('Yeni kullanici olusturma yetkiniz bulunmuyor.', 'warning');
            return;
        }
        const btn = document.querySelector('button[onclick="saveNewUser()"]');
        if (btn) { btn.disabled = true; btn.innerText = '⏳ Kaydediliyor...'; }

        const getValue = id => esc(document.getElementById(id)?.value.trim() || '');
        const name = getValue('newUserName');
        const email = getValue('newUserEmail');
        const pass = document.getElementById('newUserPassword')?.value || '';
        
        const canExport = document.getElementById('newPermExport')?.checked || false;
        const canCreate = document.getElementById('newPermCreateBiz')?.checked || false;
        const canDelArch = document.getElementById('newPermDeleteArchive')?.checked || false;

        if (!name || !email || !pass) {
            if (btn) { btn.disabled = false; btn.innerText = '🚀 Yeni Kullanıcıyı Sisteme Ekle'; }
            return showToast('Zorunlu alanları doldurun.', 'error');
        }
        if (pass.length < 6) {
            if (btn) { btn.disabled = false; btn.innerText = '🚀 Yeni Kullanıcıyı Sisteme Ekle'; }
            return showToast('Sifre en az 6 karakter olmalidir.', 'warning');
        }
        if (getUserEmailMap().has(email)) {
            if (btn) { btn.disabled = false; btn.innerText = '🚀 Yeni Kullanıcıyı Sisteme Ekle'; }
            return showToast('E-posta kayıtlı!', 'error');
        }

        const uId = Date.now().toString();
        const managerId = getValue('newUserManager');

        if (getValue('newUserRole') === 'Satış Temsilcisi' && !managerId) {
            if (btn) { btn.disabled = false; btn.innerText = '🚀 Yeni Kullanıcıyı Sisteme Ekle'; }
            return showToast('Satış temsilcisi için yönetici seçilmelidir.', 'warning');
        }

        DataService.saveUser({
            id: uId, name, email, password: pass,
            role: getValue('newUserRole'),
            managerId: managerId,
            team: normalizeTeamForRole(getValue('newUserRole'), getValue('newUserTeam')),
            phone: getValue('newUserPhone'),
            status: 'Aktif',
            settings: buildUserSettings({}, {
                ...collectPermissionSettings('new'),
                export: canExport,
                createBiz: canCreate,
                deleteArchive: canDelArch,
            }),
        }).then(async () => {
            await syncUsersStateFromServer();
            if (btn) { btn.disabled = false; btn.innerText = '🚀 Yeni Kullanıcıyı Sisteme Ekle'; }
            addSystemLog(`YENİ KULLANICI eklendi: ${name}`);
            showToast('Kullanıcı eklendi!', 'success');
            ['newUserName', 'newUserEmail', 'newUserPassword', 'newUserPhone'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const cbe = document.getElementById('newPermExport'); if(cbe) cbe.checked = false;
            const cbc = document.getElementById('newPermCreateBiz'); if(cbc) cbc.checked = true;
            const cbda = document.getElementById('newPermDeleteArchive'); if(cbda) cbda.checked = false;
            
            closeModal('createUserModal');
            renderUsers();
        }).catch((err) => {
            console.error('User create failed:', err);
            if (btn) { btn.disabled = false; btn.innerText = '🚀 Yeni Kullanıcıyı Sisteme Ekle'; }
            showToast(err?.message || 'Kullanici olusturulamadi.', 'error');
        });
    }

    function openCreateUserModal() {
        if (typeof hasPermission === 'function' && !hasPermission('manageUsers')) {
            showToast('Yeni kullanici olusturma yetkiniz bulunmuyor.', 'warning');
            return;
        }
        const modal = document.getElementById('createUserModal');
        if (modal) modal.style.display = 'flex';
        renderPermissionMatrix('new', document.getElementById('newUserRole')?.value || 'Satış Temsilcisi');
        toggleUserRoleFields('new');
    }

    function applyPermissionPreset(type) {
        const role = document.getElementById(type === 'new' ? 'newUserRole' : 'editUserRole')?.value || 'Satış Temsilcisi';
        const preset = document.getElementById(`${type}UserPermissionPreset`)?.value || getPermissionPresetForRole(role);
        if (preset === 'custom') return;
        renderPermissionMatrix(type, role);
        applyPermissionSettings(type, { ...getDefaultPermissionsForPreset(preset, role), preset });
    }

    window.toggleUserRoleFields = function(type) {
        const role = document.getElementById(type === 'new' ? 'newUserRole' : 'editUserRole').value;
        const managerGroup = document.getElementById(type === 'new' ? 'newUserManagerGroup' : 'editUserManagerGroup');
        const teamGroup = document.getElementById(type === 'new' ? 'newUserTeamGroup' : 'editUserTeamGroup');
        const teamSelect = document.getElementById(type === 'new' ? 'newUserTeam' : 'editUserTeam');
        if (role === 'Satış Temsilcisi') {
            if (managerGroup) managerGroup.style.display = 'block';
            populateManagerDropdown(type);
        } else {
            if (managerGroup) managerGroup.style.display = 'none';
        }

        if (role === 'Yönetici') {
            if (teamGroup) teamGroup.style.display = 'none';
            if (teamSelect) teamSelect.value = '-';
        } else {
            if (teamGroup) teamGroup.style.display = 'block';
        }

        renderPermissionMatrix(type, role);
    };

    function populateManagerDropdown(type) {
        const sel = document.getElementById(type === 'new' ? 'newUserManager' : 'editUserManager');
        if (!sel) return;
        sel.innerHTML = '<option value="">-- Yönetici Seçin --</option>';
        const managers = AppState.users.filter(u => {
            const apiRole = String(u?._apiRole || u?.role || '').toUpperCase();
            // Backend roles are ADMIN, MANAGER, TEAM_LEADER, SALESPERSON
            return (apiRole === 'ADMIN' || apiRole === 'MANAGER' || apiRole === 'TEAM_LEADER' || u.role === 'Yönetici' || u.role === 'Takım Lideri');
        });
        managers.forEach(m => sel.add(new Option(m.name, m.id)));
    }

    function openEditUserModal(email) {
        const u = getUserEmailMap().get(email);
        if (!u) return;
        if (typeof hasPermission === 'function' && !hasPermission('manageUsers')) {
            showToast('Kullanici duzenleme yetkiniz bulunmuyor.', 'warning');
            return;
        }
        if (!canCurrentUserManageUser(u)) {
            showToast('Bu kullanici icin duzenleme yetkiniz bulunmuyor.', 'warning');
            return;
        }
        const setValue = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        setValue('editUserOriginalEmail', u.email);
        setValue('editUserName', u.name);
        setValue('editUserEmail', u.email);
        setValue('editUserPassword', '');
        setValue('editUserTeam', getDisplayedTeam(u));
        setValue('editUserPhone', u.phone || '');
        setValue('editUserRole', u.role);
        
        const settings = u.settings || { permissions: {} };
        toggleUserRoleFields('edit');
        applyPermissionSettings('edit', settings.permissions || {});
        const mSel = document.getElementById('editUserManager');
        if (mSel) mSel.value = u.managerId || '';

        const m = document.getElementById('editUserModal');
        if (m) m.style.display = 'flex';
    }

    async function saveEditedUser() {
        if (typeof hasPermission === 'function' && !hasPermission('manageUsers')) {
            showToast('Kullanici duzenleme yetkiniz bulunmuyor.', 'warning');
            return;
        }
        const getValue = id => esc(document.getElementById(id)?.value.trim() || '');
        const btn = document.querySelector('button[onclick="saveEditedUser()"]');
        if (btn) { btn.disabled = true; btn.innerText = '⏳ Kaydediliyor...'; }

        const origEmail = getValue('editUserOriginalEmail');
        const newEmail = getValue('editUserEmail');
        const userEmailMap = getUserEmailMap();
        const u = userEmailMap.get(origEmail);
        if (!u) { if (btn) { btn.disabled = false; btn.innerText = '💾 Değişiklikleri Kaydet'; } return; }

        if (newEmail !== origEmail && userEmailMap.has(newEmail)) {
            if (btn) { btn.disabled = false; btn.innerText = '💾 Değişiklikleri Kaydet'; }
            return showToast('E-posta kullanımda!', 'error');
        }

        const oldName = u.name;
        const newName = getValue('editUserName');
        const rawNewPass = document.getElementById('editUserPassword')?.value || '';
        if (rawNewPass && rawNewPass.length < 6) {
            if (btn) { btn.disabled = false; btn.innerText = '💾 Değişiklikleri Kaydet'; }
            return showToast('Yeni sifre en az 6 karakter olmalidir.', 'warning');
        }
        const canExport = document.getElementById('editPermExport')?.checked || false;
        const canCreate = document.getElementById('editPermCreateBiz')?.checked || false;
        const canDelArch = document.getElementById('editPermDeleteArchive')?.checked || false;

        const uObj = {
            ...u,
            name: newName,
            email: newEmail,
            team: normalizeTeamForRole(document.getElementById('editUserRole')?.value || u.role, document.getElementById('editUserTeam')?.value || u.team),
            phone: getValue('editUserPhone'),
            role: document.getElementById('editUserRole')?.value || u.role,
            managerId: getValue('editUserRole') === 'Satış Temsilcisi' ? getValue('editUserManager') : null,
            settings: buildUserSettings(u.settings, {
                ...collectPermissionSettings('edit'),
                export: canExport,
                createBiz: canCreate,
                deleteArchive: canDelArch,
            }),
        };

        const postSavePromises = [];

        // 1. Kullanıcıyı güncelle
        DataService.saveUser(uObj).then(async () => {
            if (rawNewPass) {
                postSavePromises.push(
                    DataService.apiRequest(`/users/${u.id}/password`, {
                        method: 'PATCH',
                        body: JSON.stringify({ password: rawNewPass })
                    })
                );
            }
            // 2. İsim değiştiyse, görevlerdeki atanan kişiyi de güncelle
            if (oldName !== newName) {
                const tasksToUpdate = await fetchScopedUserTaskRows(u);
                const promises = tasksToUpdate.map(t =>
                    DataService.apiRequest(`/tasks/${t.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ assignee: newName })
                    }).catch(err => console.warn(`Task ${t.id} rename failed:`, err))
                );
                postSavePromises.push(Promise.all(promises));
            }
            await Promise.all(postSavePromises);
            await syncUsersStateFromServer();
        }).then(() => {
            const refreshedFromState = getUserEmailMap().get(newEmail) || getUserEmailMap().get(origEmail) || null;
            const refreshedUser = refreshedFromState && refreshedFromState.email === newEmail
                ? { ...refreshedFromState, ...uObj }
                : uObj;
            if (AppState.loggedInUser?.email === origEmail) {
                AppState.loggedInUser = refreshedUser;
                sessionStorage.setItem('logged_user', JSON.stringify(refreshedUser));
                const nameEl = document.getElementById('currentUserName');
                if (nameEl) nameEl.innerText = refreshedUser.name || '';
                const avatarEl = document.getElementById('userAvatarInitials');
                if (avatarEl) {
                    const parts = String(refreshedUser.name || 'U').split(' ');
                    avatarEl.innerText = ((parts[0]?.[0] || 'U') + (parts[1]?.[0] || '')).toUpperCase();
                }
            }
            if (btn) { btn.disabled = false; btn.innerText = '💾 Değişiklikleri Kaydet'; }
            addSystemLog(`KULLANICI DÜZENLENDİ: ${oldName} → ${newName}`);
            showToast('Güncellendi!', 'success');
            closeModal('editUserModal');
            renderUsers();
            if (AppState.loggedInUser?.id === refreshedUser?.id && typeof AppController !== 'undefined' && typeof AppController.refreshCurrentView === 'function') {
                AppController.refreshCurrentView({ silent: true });
            }
            if (oldName !== newName && typeof DropdownController !== 'undefined') DropdownController.updateAssigneeDropdowns();
        }).catch(err => {
            console.error(err);
            if (btn) { btn.disabled = false; btn.innerText = '💾 Değişiklikleri Kaydet'; }
            showToast(err?.message || 'Veritabani guncelleme hatasi!', 'error');
        });
    }

    async function requestUserDeactivation(email) {
        const u = getUserEmailMap().get(email);
        if (!u) return;
        if (typeof hasPermission === 'function' && !hasPermission('manageUsers')) {
            showToast('Kullanici durumu guncelleme yetkiniz bulunmuyor.', 'warning');
            return;
        }
        const dataService = getDataService();
        const openTasksCount = !dataService || typeof dataService.apiRequest !== 'function'
            ? 0
            : Number(getPulseSummaryForUser(u, await loadUserPulseMap())?.openCount || 0);

        if (openTasksCount > 0) {
            document.getElementById('transferTaskDesc').innerHTML =
                `<b>${u.name}</b> kullanıcısını pasife çekmek istiyorsunuz ancak üzerinde <b>${openTasksCount} adet AÇIK GÖREV</b> bulunuyor.<br><br>Lütfen bu görevlerin kime devredileceğini seçin.`;
            document.getElementById('transferTargetUserEmail').value = email;
            document.getElementById('transferActionType').value = 'deactivate';
            document.getElementById('transferTasksModal').style.display = 'flex';
        } else {
            askConfirm(`${u.name} adlı kullanıcıyı pasife çekmek istiyor musunuz?`, res => {
                if (res) {
                    DataService.updateUserStatus(u.id, 'Pasif').then(async () => {
                        await syncUsersStateFromServer();
                        addSystemLog(`KULLANICI PASİFE ÇEKİLDİ: ${u.name}`);
                        showToast('Kullanıcı pasife alındı.', 'success');
                        renderUsers();
                    });
                }
            });
        }
    }

    async function requestUserDeletion(email) {
        const u = getUserEmailMap().get(email);
        if (!u) return;
        if (typeof hasPermission === 'function' && !hasPermission('manageUsers')) {
            showToast('Kullanici silme yetkiniz bulunmuyor.', 'warning');
            return;
        }
        const dataService = getDataService();
        const totalTasks = (!dataService || typeof dataService.apiRequest !== 'function')
            ? 0
            : (await fetchScopedUserTaskRows(u)).length;

        if (totalTasks > 0) {
            document.getElementById('transferTaskDesc').innerHTML =
                `<b>${u.name}</b> kullanıcısını tamamen SİLMEK istiyorsunuz ancak üzerinde geçmiş ve açık toplam <b>${totalTasks} adet GÖREV</b> bulunuyor.<br><br>Veri kaybı olmaması için bu görevlerin kime devredileceğini seçin.`;
            document.getElementById('transferTargetUserEmail').value = email;
            document.getElementById('transferActionType').value = 'delete';
            document.getElementById('transferTasksModal').style.display = 'flex';
        } else {
            askConfirm(`${u.name} adlı kullanıcıyı SİLMEK istiyor musunuz?`, res => {
                if (res) {
                    DataService.deleteUser(u.id).then(async () => {
                        await syncUsersStateFromServer();
                        addSystemLog(`KULLANICI SİLİNDİ: ${u.name}`);
                        showToast('Kullanıcı silindi.', 'success');
                        renderUsers();
                    });
                }
            });
        }
    }

    function executeUserActionWithTransfer() {
        const btn = document.querySelector('#transferTasksModal .btn-action');
        if (btn) { btn.disabled = true; btn.innerText = "⏳ İşleniyor..."; }

        const email = document.getElementById('transferTargetUserEmail').value;
        const act = document.getElementById('transferActionType').value;
        const targetUserName = document.getElementById('transferAssigneeSelect').value;
        
        const u = getUserEmailMap().get(email);
        const targetU = getUserNameMap().get(targetUserName);

        if (!u || !targetU) {
            showToast('Kaynak veya hedef personel bulunamadı.', 'error');
            if (btn) { btn.disabled = false; btn.innerText = "Onayla ve Devret"; }
            return;
        }

        DataService.apiRequest(`/users/${u.id}/transfer-and-deactivate`, {
            method: 'POST',
            body: JSON.stringify({ targetOwnerId: targetU.id, isDelete: act === 'delete' })
        }).then(() => {
            const actionText = act === 'delete' ? 'SİLİNDİ' : 'pasife alındı';
            addSystemLog(`SİSTEM DEVİR: ${u.name} personeli işlemlerini ${targetU.name}'a devretti ve ${actionText}.`);
            showToast(`Görevler devredildi, personel ${actionText}.`, 'success');
            closeModal('transferTasksModal');
            // State Desync onarımı: Veriyi yenileyerek UI tablolarını temizle
            AppController.init(true);
        }).catch(err => {
            console.error('Devir işlemi başarısız:', err);
            showToast(`Aktarım sırasında hata oluştu: ${err.message}`, 'error');
        }).finally(() => {
            if (btn) { btn.disabled = false; btn.innerText = "Onayla ve Devret"; }
        });
    }

    function activateUser(email) {
        const u = getUserEmailMap().get(email);
        if (!u) return;
        if (typeof hasPermission === 'function' && !hasPermission('manageUsers')) {
            showToast('Kullanici aktiflestirme yetkiniz bulunmuyor.', 'warning');
            return;
        }
        DataService.updateUserStatus(u.id, 'Aktif').then(async () => {
            await syncUsersStateFromServer();
            addSystemLog(`KULLANICI AKTİFLEŞTİRİLDİ: ${u.name}`);
            showToast('Kullanıcı aktif edildi.', 'success');
            renderUsers();
        });
    }

    async function openUserProfileModal(userRef) {
        const rawRef = String(userRef || '').trim();
        const normalizedRef = rawRef.toLocaleLowerCase('tr-TR');
        const u = getUserNameMap().get(rawRef)
            || AppState.users.find((user) =>
                String(user?.id || '').trim() === rawRef
                || String(user?.email || '').trim().toLocaleLowerCase('tr-TR') === normalizedRef
                || String(user?.name || '').trim().toLocaleLowerCase('tr-TR') === normalizedRef
            );
        if (!u) return showToast('Bilgi bulunamadı.', 'warning');
        const pulseSummary = getPulseSummaryForUser(u, await loadUserPulseMap());
        const summaryTasks = await fetchScopedUserTaskRows(u);
        const followupCount = summaryTasks.filter((task) => String(task?.statusKey || '').toLowerCase() === 'followup').length;
        const lastTask = [...summaryTasks].sort((a, b) => new Date(b.lastActionDate || b.createdAt || 0).getTime() - new Date(a.lastActionDate || a.createdAt || 0).getTime())[0];
        const lastActionTime = lastTask?.lastActionDate ? formatDate(lastTask.lastActionDate) : '-';
        const defaultPermissions = getDefaultPermissionsForRole(u.role);
        const effectivePermissions = { ...defaultPermissions, ...(u.settings?.permissions || {}) };
        const enabledPermissionLabels = PERMISSION_MATRIX_DEFS
            .filter((permission) => effectivePermissions[permission.key])
            .map((permission) => permission.label)
            .slice(0, 6);
        const overrideCount = Object.keys(u.settings?.permissions || {}).filter((key) => defaultPermissions[key] !== effectivePermissions[key]).length;
        const openCount = Number(pulseSummary?.openCount || 0);
        const dealCount = Number(pulseSummary?.dealCount || 0);
        const coldCount = Number(pulseSummary?.coldCount || 0);
        const workloadLabel = openCount > 40 ? 'Yoğun' : openCount > 20 ? 'Dengeli' : 'Müsait';
        const riskScore = openCount > 40
            ? 'Yüksek'
            : coldCount > dealCount + 5
            ? 'Orta'
            : 'Düşük';

        document.getElementById('profileModalName').innerHTML = u.name;
        document.getElementById('profileModalTeam').innerHTML = getDisplayedTeam(u) === '-' ? 'Takımsız' : getDisplayedTeam(u);
        document.getElementById('profileModalPhone').innerHTML = u.phone ? `<a href="tel:${u.phone}" style="color:var(--primary-color)">${u.phone}</a>` : '-';
        document.getElementById('profileModalEmail').innerHTML = `<a href="mailto:${u.email}" style="color:var(--primary-color)">${u.email}</a>`;

        const stEl = document.getElementById('profileModalStatus');
        if (stEl) {
            stEl.innerText = u.status || 'Aktif';
            stEl.style.color = u.status === 'Pasif' ? 'var(--danger-color)' : 'var(--success-color)';
        }
        document.getElementById('profileModalRole').innerHTML = u.role;
        document.getElementById('profileModalOpenCount').innerText = String(openCount);
        document.getElementById('profileModalDealCount').innerText = String(dealCount);
        document.getElementById('profileModalColdCount').innerText = String(coldCount);
        document.getElementById('profileModalFollowupCount').innerText = String(followupCount);
        document.getElementById('profileModalLastAction').innerText = lastActionTime;
        document.getElementById('profileModalWorkload').innerText = workloadLabel;
        document.getElementById('profileModalRisk').innerText = riskScore;
        document.getElementById('profileModalPermissionReason').innerText = overrideCount > 0
            ? `Rol varsayılanları üzerine ${overrideCount} özel override uygulanmış. Deny wins mantığı aktif.`
            : 'Yetkiler rol varsayılanları ile çalışıyor.';
        document.getElementById('profileModalPermissionSummary').innerHTML = `
            <div class="user-360-permission-pill-row">
                ${enabledPermissionLabels.map((label) => `<span class="user-360-permission-pill">${label}</span>`).join('')}
            </div>
            <div class="user-360-permission-note">
                Profil: <strong>${u.settings?.permissions?.preset || getPermissionPresetForRole(u.role)}</strong>
                ${overrideCount > 0 ? `• Override: <strong>${overrideCount}</strong>` : ''}
            </div>`;
        const m = document.getElementById('userProfileModal');
        if (m) m.style.display = 'flex';
    }

    window.wipeBusinessAndTaskData = function() {
        askConfirm("DİKKAT! Tüm İşletme, Görev (Task) ve Proje verileri KALICI OLARAK SİLİNECEKTİR. Bu işlem geri alınamaz. Emin misiniz?", res => {
            if (res) {
                showProgressOverlay("Veriler Siliniyor...", "Sistem kayıtları temizleniyor", { percent: 20, meta: 'İşletme, görev ve proje verileri kaldırılıyor.' });
                
                DataService.apiRequest('/admin/system/wipe', { method: 'POST' }).then(() => {
                    updateProgressOverlay("Son sistem logu yazılıyor", { percent: 85 });
                    addSystemLog("TÜM İŞLETME VE GÖREV VERİLERİ SIFIRLANDI.").then(() => {
                        updateProgressOverlay("Sayfa yenileniyor", { percent: 100 });
                        location.reload();
                    });
                }).catch(err => {
                    showToast("Silme işlemi başarısız oldu", "error");
                    console.error(err);
                }).finally(() => {
                    hideProgressOverlay();
                });
            }
        });
    };

    // --- Kategori Yönetimi ---

    function renderCategoryList() {
        const list = document.getElementById('admCategoryList');
        const sel = document.getElementById('admSelectMainForSub');
        if (!list || !sel) return;

        list.innerHTML = '';
        sel.innerHTML = '';

        Object.keys(AppState.dynamicCategories).forEach(cat => {
            sel.add(new Option(cat, cat));
            
            const subs = AppState.dynamicCategories[cat].map((s, index) =>
                `<div style="padding:4px 8px; background:#e8f0e5; border-radius:4px; font-size:11px; color:#333; display:inline-flex; align-items:center; gap:5px;">
                    ${s}
                    <button onclick="removeSystemSubCategory('${cat.replace(/'/g, "\\'")}', ${index})" style="background:none; border:none; padding:0; color:var(--danger-color); cursor:pointer; box-shadow:none; font-size:14px; width:auto; line-height:1;">×</button>
                </div>`
            ).join(' ') || '<span style="font-size:11px; color:#888; font-style:italic;">Alt kategori yok.</span>';

            list.innerHTML += `<div style="background:#fff; border:1px solid var(--border-light); border-radius:8px; padding:15px; box-shadow:var(--shadow-sm);">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;">
                    <strong style="color:var(--primary-color);">${cat}</strong>
                    <button onclick="removeSystemMainCategory('${cat.replace(/'/g, "\\'")}')" class="btn-danger" style="padding:2px 6px; font-size:10px;">Sil</button>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:5px;">${subs}</div>
            </div>`;
        });
    }

    function addMainCategory() {
        const input = document.getElementById('admNewMainCat');
        if (!input) return;
        const val = esc(input.value.trim());
        if (!val) return;
        if (AppState.dynamicCategories[val]) return showToast('Kategori zaten var!', 'warning');
        AppState.dynamicCategories[val] = [];
        DataService.saveCategories(AppState.dynamicCategories).then(() => {
            addSystemLog(`KATEGORİ EKLENDİ: ${val}`);
            showToast('Kategori Eklendi', 'success');
            input.value = '';
            renderCategoryList();
        });
    }

    function removeMainCategory(cat) {
        return window.removeSystemMainCategory(cat);
    }

    function addSubCategory() {
        const mainEl = document.getElementById('admSelectMainForSub');
        const input = document.getElementById('admNewSubCat');
        if (!mainEl || !input) return;
        const main = mainEl.value;
        const val = esc(input.value.trim());
        if (!main || !val) return;
        if (AppState.dynamicCategories[main]?.includes(val)) return showToast('Alt kategori var!', 'warning');
        AppState.dynamicCategories[main] = AppState.dynamicCategories[main] || [];
        AppState.dynamicCategories[main].push(val);
        DataService.saveCategories(AppState.dynamicCategories).then(() => {
            addSystemLog(`ALT KATEGORİ EKLENDİ: ${val}`);
            showToast('Alt Kategori Eklendi', 'success');
            input.value = '';
            renderCategoryList();
        });
    }

    function removeSubCategory(main, index) {
        return window.removeSystemSubCategory(main, index);
    }

    function cleanAndMergeCategories() {
        const currentCats = AppState.dynamicCategories;
        if (!currentCats || Object.keys(currentCats).length === 0) return showToast("Temizlenecek kategori yok.", "info");

        askConfirm("DİKKAT: Sistem en üst düzey kural motoruyla çalışacak. Tüm isimler standartlaşacak, dağınık alt kategoriler (Örn: masaj, otel spa, kese) tekil şemsiyeler altında birleşecek ve işletmeler yeni ağaca ışınlanacaktır. Onaylıyor musunuz?", (res) => {
            if (!res) return;

            // 1. Akıllı Metin Çözücü ve Biçimlendirici
            const decode = (str) => str ? str.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim() : '';
            
            const smartFormat = (str) => {
                const lowers = ['ve', 'ile', 'için', 'veya'];
                const uppers = ['SPA', 'VIP', 'VR', 'AVM'];
                return str.toLocaleLowerCase('tr-TR').split(/\s+/).map((word, i) => {
                    if (lowers.includes(word) && i !== 0) return word;
                    const upMatch = uppers.find(u => u.toLocaleLowerCase('tr-TR') === word);
                    if (upMatch) return upMatch;
                    return word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1);
                }).join(' ').replace(/\s*&\s*/g, ' & ').replace(/\s*-\s*/g, ' - ');
            };

            // 2. ULTIMATE YÖNLENDİRME (ROUTING) SÖZLÜĞÜ
            const rx = (words) => new RegExp(`(?:^|[\\s\\W_])(?:${words})(?=$|[\\s\\W_])`, 'i');
            
            const routeCategory = (main, sub) => {
                let text = (main + " " + sub).toLowerCase();
                let tMain = "Diğer Hizmetler";
                let tSub = smartFormat(sub);

                // YEME & İÇME
                if (rx('yemek|restoran|cafe|kafe|kahvaltı|iftar|fast food|burger|pizza|pide|kebap|steak|et|balık|suşi|sushi|uzakdoğu|mutfağı|fasıl|meyhane|tatlı|kahve').test(text)) {
                    tMain = "Yeme & İçme";
                    if (rx('kahvaltı').test(text)) tSub = "Kahvaltı Mekanları";
                    else if (rx('iftar').test(text)) tSub = "İftar & Ramazan Menüsü";
                    else if (rx('fast food|burger|pizza|pide').test(text)) tSub = "Fast Food & Atıştırmalık";
                    else if (rx('steak|et|kebap|mangal').test(text)) tSub = "Et & Kebap & Steakhouse";
                    else if (rx('balık|deniz').test(text)) tSub = "Balık & Deniz Ürünleri";
                    else if (rx('suşi|sushi|uzakdoğu|dünya').test(text)) tSub = "Dünya Mutfağı & Sushi";
                    else if (rx('kahve|cafe|kafe|tatlı|pastane').test(text)) tSub = "Cafe & Tatlı & Kahve";
                    else tSub = "Restoranlar & Seçkin Lezzetler";
                }
                // MASAJ & SPA
                else if (rx('masaj|spa|hamam|kese|köpük|wellness|sauna|refleksoloji|thai').test(text)) {
                    tMain = "Masaj & SPA";
                    if (rx('bebek').test(text)) tSub = "Bebek SPA";
                    else if (rx('hamam|kese').test(text)) tSub = "Hamam & Kese Köpük";
                    else tSub = "SPA & Masaj Paketleri";
                }
                // GÜZELLİK & BAKIM
                else if (rx('güzellik|bakım|cilt|saç|makyaj|kuaför|manikür|pedikür|epilasyon|ağda|lazer|zayıflama|diyet|solaryum|kaş|kirpik|protez|botoks').test(text)) {
                    tMain = "Güzellik & Bakım";
                    if (rx('lazer|epilasyon|ağda').test(text)) tSub = "Lazer & Epilasyon";
                    else if (rx('saç|makyaj|kuaför|keratin').test(text)) tSub = "Kuaför & Saç Bakımı";
                    else if (rx('zayıflama|diyet|bölgesel|pilates').test(text)) tSub = "Bölgesel Zayıflama & Form";
                    else if (rx('cilt|yüz').test(text)) tSub = "Cilt & Yüz Bakımı";
                    else if (rx('tırnak|manikür|pedikür').test(text)) tSub = "Manikür & Pedikür & Tırnak";
                    else tSub = "Genel Güzellik & Bakım";
                }
                // SPOR & FİTNESS & EĞİTİM
                else if (rx('spor|fitness|gym|yoga|yüzme|kurs|eğitim|atölye|workshop').test(text)) {
                    tMain = "Spor & Eğitim & Kurs";
                    if (rx('yoga|pilates').test(text)) tSub = "Yoga & Pilates";
                    else if (rx('yüzme|havuz').test(text)) tSub = "Yüzme & Havuz Kullanımı";
                    else if (rx('fitness|gym').test(text)) tSub = "Fitness & Gym & Spor Salonu";
                    else if (rx('dil|yabancı').test(text)) tSub = "Yabancı Dil Eğitimleri";
                    else if (rx('dans|müzik').test(text)) tSub = "Dans & Müzik Kursları";
                    else tSub = "Atölye & Kişisel Gelişim";
                }
                // AKTİVİTE & EĞLENCE
                else if (rx('aktivite|eğlence|macera|extreme|paintball|binicilik|atış|poligon|kaçış|sanal|oyun|park|lunapark').test(text)) {
                    tMain = "Aktivite & Eğlence";
                    if (rx('paintball|atış|poligon').test(text)) tSub = "Poligon & Paintball";
                    else if (rx('kaçış|sanal|vr').test(text)) tSub = "Kaçış Oyunu & VR";
                    else if (rx('binicilik|at').test(text)) tSub = "Binicilik & Doğa Parkuru";
                    else tSub = "Eğlence Merkezleri & Oyun";
                }
                // BİLET & ETKİNLİK
                else if (rx('bilet|tiyatro|konser|sinema|gösteri|müze|sergi|sirk|müzikal').test(text)) {
                    tMain = "Bilet & Etkinlik";
                    if (rx('tiyatro').test(text)) tSub = "Tiyatro Oyunları";
                    else if (rx('çocuk').test(text)) tSub = "Çocuk Etkinlikleri";
                    else if (rx('konser').test(text)) tSub = "Konser & Canlı Müzik";
                    else tSub = "Sinema & Gösteri & Sergi";
                }
                // OTO & HİZMET & DİĞER
                else if (rx('oto|araç|yıkama|kiralama|temizlik|fotoğraf|vize|sigorta|transfer|konaklama|otel').test(text)) {
                    tMain = "Oto & Genel Hizmetler";
                    if (rx('oto|araç|yıkama|bakım').test(text)) tSub = "Oto Bakım & Yıkama";
                    else if (rx('konaklama|otel|tatil').test(text)) tSub = "Konaklama & Otel";
                    else if (rx('fotoğraf').test(text)) tSub = "Fotoğraf & Çekim Hizmetleri";
                    else if (rx('temizlik').test(text)) tSub = "Kuru Temizleme & Halı Yıkama";
                    else tSub = "Diğer Profesyonel Hizmetler";
                } else {
                    tMain = smartFormat(main);
                    tSub = smartFormat(sub);
                }

                return { tMain, tSub };
            };

            let newCategories = {};
            let categoryMap = {};
            let deletedGarbageCount = 0;

            // 3. TARAMA VE YÖNLENDİRME DÖNGÜSÜ
            for (let oldMain in currentCats) {
                categoryMap[oldMain] = {};
                let oldSubs = currentCats[oldMain] || [];

                if (oldSubs.length === 0) {
                    let decMain = decode(oldMain);
                    if (decMain.length < 3 || /test|deneme|sil/i.test(decMain)) continue;
                    let { tMain } = routeCategory(decMain, "");
                    if (!newCategories[tMain]) newCategories[tMain] = [];
                    categoryMap[oldMain]["__empty__"] = { newMain: tMain, newSub: "" };
                    continue;
                }

                for (let oldSub of oldSubs) {
                    let decM = decode(oldMain);
                    let decS = decode(oldSub);

                    // Acımasız Çöp Filtresi
                    if (decS.length < 3 || /^[\d\s\-\(\)]+$/.test(decS) || /\d{4,}/.test(decS) || /test|deneme|sil|boş|diger|diğer/i.test(decS)) {
                        deletedGarbageCount++;
                        categoryMap[oldMain][oldSub] = { newMain: "", newSub: "" };
                        continue;
                    }

                    // Yönlendir
                    let { tMain, tSub } = routeCategory(decM, decS);

                    // Yeni Ağaca Ekle (Tekilleştirerek)
                    if (!newCategories[tMain]) newCategories[tMain] = [];
                    if (tSub && !newCategories[tMain].includes(tSub)) newCategories[tMain].push(tSub);

                    // Haritayı Güncelle
                    categoryMap[oldMain][oldSub] = { newMain: tMain, newSub: tSub };
                }
            }

            // 4. GÖREV (TASK) SENKRONİZASYONU
            let taskUpdates = [];
            let updatedTaskCount = 0;
            let affectedBizIds = new Set();

            AppState.tasks.forEach(t => {
                let changed = false;
                let newMain = t.mainCategory;
                let newSub = t.subCategory;

                if (t.mainCategory && categoryMap[t.mainCategory]) {
                    if (t.subCategory && categoryMap[t.mainCategory][t.subCategory]) {
                        let mapInfo = categoryMap[t.mainCategory][t.subCategory];
                        if (t.mainCategory !== mapInfo.newMain || t.subCategory !== mapInfo.newSub) {
                            newMain = mapInfo.newMain; newSub = mapInfo.newSub; changed = true;
                        }
                    } else if (categoryMap[t.mainCategory]["__empty__"]) {
                        let mapInfo = categoryMap[t.mainCategory]["__empty__"];
                        if (t.mainCategory !== mapInfo.newMain) { newMain = mapInfo.newMain; changed = true; }
                    }
                }

                if (changed) {
                    taskUpdates.push(
                        DataService.apiRequest(`/tasks/${t.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ mainCategory: newMain || "", subCategory: newSub || "" })
                        }).catch(err => console.warn(`Task ${t.id} cat update failed:`, err))
                    );
                    affectedBizIds.add(t.businessId);
                    updatedTaskCount++;
                }
            });

            // 5. ALFABETİK SIRALAMA
            let sortedCategories = {};
            Object.keys(newCategories).sort().forEach(k => { sortedCategories[k] = newCategories[k].sort(); });

            // 6. Kategorileri kaydet ve görevleri güncelle
            DataService.saveCategories(sortedCategories).then(() => {
                return Promise.all(taskUpdates);
            }).then(() => {
                AppState.dynamicCategories = sortedCategories;
                addSystemLog(`ULTIMATE TEMİZLİK: ${deletedGarbageCount} çöp silindi, ${affectedBizIds.size} işletmeye ait ${updatedTaskCount} görev senkronize edildi.`);
                showToast(`Kusursuzlaştırıldı! ${deletedGarbageCount} çöp silindi, kategoriler akıllıca birleştirildi.`, "success");
                renderCategoryList();
                if(typeof DropdownController !== 'undefined') DropdownController.populateMainCategoryDropdowns();
                if(typeof BusinessController !== 'undefined' && AppState.isBizSearched) BusinessController.search(false);
            }).catch(err => {
                showToast("Güncelleme sırasında hata oluştu.", "error");
                console.error(err);
            });
        });
    }

    // --- Sistem Logları ---

    function renderSystemLogs() {
        const query = (document.getElementById('logSearchInput')?.value || '').toLowerCase().trim();
        const filtered = query
            ? AppState.systemLogs.filter(l =>
                l.action?.toLowerCase().includes(query) ||
                l.user?.toLowerCase().includes(query)
              )
            : [...AppState.systemLogs];

        AppState.setFiltered('logs', filtered);
        AppState.setPage('logs', 1);
        displaySystemLogs();
    }

    function displaySystemLogs() {
        const tbody = document.getElementById('systemLogsTbody');
        if (!tbody) return;

        const pagContainer = getOrCreatePaginationContainer('logsPagination');
        pagContainer.innerHTML = '';
        tbody.innerHTML = '';

        const filtered = AppState.filtered.logs || AppState.systemLogs;
        const page = AppState.pagination.logs;

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:20px; color:#888;">Kayıt bulunamadı.</td></tr>`;
            return;
        }

        const start = (page - 1) * ITEMS_PER_PAGE;
        const paginated = filtered.slice(start, start + ITEMS_PER_PAGE);

        tbody.innerHTML = paginated.map(l =>
            `<tr>
                <td style="font-size:11px; color:#666; white-space:nowrap;">${l.date}</td>
                <td><strong style="color:var(--primary-color);">${l.user}</strong></td>
                <td>${l.action}</td>
            </tr>`
        ).join('');

        renderPagination(pagContainer, filtered.length, page, ITEMS_PER_PAGE, (i) => {
            AppState.setPage('logs', i);
            displaySystemLogs();
        }, { compact: true, resultLabel: 'kayıt' });
    }

    function fixPastRecordsDates() {
        askConfirm("Geçmiş kayıtlardaki (import edilmiş) eksik tarihler log metinlerinden çıkarılarak düzeltilecek ve bu kayıtların listelerin en altına inmesi sağlanacak. Onaylıyor musunuz?", (res) => {
            if (!res) return;
            showProgressOverlay("Geçmiş Tarihler Düzeltiliyor", "Sunucu bakım işlemi başlatılıyor", { percent: 25 });
            DataService.apiRequest('/admin/maintenance/fix-past-record-dates', { method: 'POST' }).then((result) => {
                updateProgressOverlay("Sonuçlar işleniyor", { percent: 90 });
                const updatedCount = Number(result?.updatedCount || 0);
                if (updatedCount > 0) {
                    showToast(`${updatedCount} adet görev tarihi loglardan ayıklanarak düzeltildi!`, "success");
                    addSystemLog(`TARİH DÜZELTME: ${updatedCount} geçmiş kaydın tarihi loglardan ayıklandı.`);
                } else {
                    showToast("Düzeltilecek hatalı/tarihsiz geçmiş kayıt bulunamadı.", "info");
                }
            }).catch(err => {
                console.error(err);
                showToast("Tarih düzeltme sırasında hata oluştu.", "error");
            }).finally(() => {
                hideProgressOverlay();
            });
        });
    }

    function cleanArchiveAssignees() {
        askConfirm("Arşivdeki tüm kirli personel isimleri (boşluk, harf hatası, küçük harf vb.) aktif personellere göre düzeltilecek ve standartlaştırılacak. Onaylıyor musunuz?", (res) => {
            if (!res) return;
            showProgressOverlay("Arşiv İsimleri Temizleniyor", "Personel isimleri standartlaştırılıyor", { percent: 25 });
            DataService.apiRequest('/admin/maintenance/clean-archive-assignees', { method: 'POST' }).then((result) => {
                updateProgressOverlay("Dropdown ve sonuçlar yenileniyor", { percent: 90 });
                const updatedCount = Number(result?.updatedCount || 0);
                if (updatedCount > 0) {
                    showToast(`${updatedCount} adet görevdeki isim hatası düzeltildi!`, "success");
                    addSystemLog(`ARŞİV TEMİZLİĞİ: ${updatedCount} personelin ismi standartlaştırıldı.`);
                    if (typeof DropdownController !== 'undefined') DropdownController.updateAssigneeDropdowns();
                } else {
                    showToast("Düzeltilecek hatalı isim bulunamadı.", "info");
                }
            }).catch(err => {
                console.error(err);
                showToast("Arşiv isim temizliği sırasında hata oluştu.", "error");
            }).finally(() => {
                hideProgressOverlay();
            });
        });
    }

    function cleanAndMergeContacts() {
        askConfirm("DİKKAT: Tüm işletmelerdeki iletişim verileri (isim, telefon, e-posta) taranacak, tekrarlananlar silinecek ve parçalanmış isimler akıllıca birleştirilecektir. Bu işlem geri alınamaz. Onaylıyor musunuz?", (res) => {
            if (!res) return;

            const buildSnapshot = window.ContactParity?.buildBusinessContactSnapshot;
            const fallbackExtractPhones = window.ContactParity?.extractPhones || ((rawStr) => {
                if (!rawStr) return [];
                return String(rawStr).split(/[\/\-,|\\]/).map((part) => String(part || '').replace(/[^\d]/g, '')).filter((phone) => phone.length >= 10);
            });
            const fallbackExtractEmails = window.ContactParity?.extractEmails || ((rawStr) => {
                if (!rawStr) return [];
                return String(rawStr).split(/[\n,;\/|\\]+/).map((email) => email.trim().toLowerCase()).filter(Boolean);
            });
            const normalizeExtraContacts = (contacts = []) => contacts
                .map((contact) => ({
                    name: String(contact?.name || '').trim(),
                    phone: String(contact?.phone || '').trim(),
                    email: String(contact?.email || '').trim().toLowerCase(),
                }))
                .filter((contact) => contact.name || contact.phone || contact.email);
            const businesses = Array.isArray(AppState.businesses) ? [...AppState.businesses] : [];

            showProgressOverlay("İletişim Verileri Analiz Ediliyor", `0 / ${businesses.length} işletme taranıyor`, { percent: 5, meta: 'Görev geçmişleri sunucudan okunuyor.' });

            const fetchers = businesses.map((biz, index) => async () => {
                const rows = await DataService.apiRequest(`/accounts/${biz.id}/task-history`).catch((err) => {
                    console.warn(`Business ${biz.id} task history could not be loaded:`, err);
                    return [];
                });
                const done = index + 1;
                updateProgressOverlay(`${done} / ${businesses.length} işletme taranıyor`, {
                    percent: 5 + (done / Math.max(businesses.length, 1)) * 35,
                    meta: 'Görev geçmişi tabanlı iletişim snapshotı hazırlanıyor.',
                });
                return { biz, rows: Array.isArray(rows) ? rows : [] };
            });

            runBatched(fetchers, 5).then((snapshots) => {
                const bizUpdates = [];
                snapshots.forEach(({ biz, rows }) => {
                    const snapshot = typeof buildSnapshot === 'function' ? buildSnapshot(biz, rows) : null;
                    const primaryContact = snapshot?.primaryContact || {};
                    const primaryPhones = Array.isArray(primaryContact.phones) ? primaryContact.phones : fallbackExtractPhones(biz.contactPhone);
                    const primaryEmails = Array.isArray(primaryContact.emails) ? primaryContact.emails : fallbackExtractEmails(biz.contactEmail);
                    const mainName = String(primaryContact.name || biz.contactName || biz.contactPerson || '').trim();
                    const mainPhone = String(primaryPhones[0] || '').trim();
                    const mainEmail = String(primaryEmails[0] || '').trim().toLowerCase();
                    const extraContacts = normalizeExtraContacts((snapshot?.otherContacts || []).map((contact) => ({
                        name: contact?.name || '',
                        phone: Array.isArray(contact?.phones) ? (contact.phones[0] || '') : '',
                        email: Array.isArray(contact?.emails) ? (contact.emails[0] || '') : '',
                    })));

                    const currentName = String(biz.contactPerson || biz.contactName || '').trim();
                    const currentPhone = String(fallbackExtractPhones(biz.contactPhone)[0] || biz.contactPhone || '').trim();
                    const currentEmail = String(fallbackExtractEmails(biz.contactEmail)[0] || biz.contactEmail || '').trim().toLowerCase();
                    const currentExtra = JSON.stringify(normalizeExtraContacts(biz.extraContacts || []));
                    const nextExtra = JSON.stringify(extraContacts);

                    if (currentName !== mainName || currentPhone !== mainPhone || currentEmail !== mainEmail || currentExtra !== nextExtra) {
                        bizUpdates.push(() =>
                            DataService.apiRequest(`/accounts/${biz.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({
                                    contactPerson: mainName,
                                    contactPhone: mainPhone,
                                    contactEmail: mainEmail,
                                    extraContacts: extraContacts,
                                })
                            }).catch(err => console.warn(`Biz ${biz.id} cleaning failed:`, err))
                        );
                    }
                });

                const updatedBizCount = bizUpdates.length;
                if (updatedBizCount === 0) {
                    showToast("Temizlenecek veri bulunamadı.", "info");
                    return;
                }

                updateProgressOverlay("İletişim Verileri Temizleniyor", `0 / ${updatedBizCount} işletme işlendi`, { percent: 45, meta: 'Yinelenen iletişim kayıtları tekilleştiriliyor.' });
                const wrappedUpdates = bizUpdates.map((fn, index) => async () => {
                    await fn();
                    const done = index + 1;
                    updateProgressOverlay(`${done} / ${updatedBizCount} işletme işlendi`, {
                        percent: 45 + (done / updatedBizCount) * 50,
                        meta: 'Telefon, e-posta ve yetkili kayıtları birleştiriliyor.',
                    });
                });
                return runBatched(wrappedUpdates, 4).then(() => {
                    showToast(`${updatedBizCount} işletmenin iletişim verileri temizlendi!`, "success");
                    addSystemLog(`VERİ TEMİZLİĞİ: ${updatedBizCount} işletme tekilleştirildi.`);
                });
            }).catch((error) => {
                console.error(error);
                showToast("İletişim temizliği sırasında hata oluştu.", "error");
            }).finally(() => {
                hideProgressOverlay();
            });
        });
    }

    function deleteAllAdminLogs() {
        askConfirm("DİKKAT: Bu işlem yalnızca aktif listelerdeki admin kaynaklı test loglarını, tekliflerini, atamalarını ve durum etkilerini temizler. Geçmiş kayıt / arşiv import logları hedeflenmez. Onaylıyor musunuz?", (res) => {
            if (!res) return;
            showProgressOverlay("Admin Test Verileri Temizleniyor", "Sunucu verileri temizleniyor", { percent: 20 });
            DataService.apiRequest('/admin/maintenance/delete-admin-test-data', { method: 'POST' }).then((result) => {
                const updatedTaskCount = Number(result?.updatedTaskCount || 0);
                updateProgressOverlay("Yerel sistem logları temizleniyor", { percent: 75 });
                return DataService.clearSystemLogs().then(() => {
                    AppState.systemLogs = [];
                    AppState.setFiltered('logs', []);
                    if (updatedTaskCount > 0) {
                        showToast(`${updatedTaskCount} görev admin verilerinden arındırıldı!`, "success");
                        return addSystemLog(`VERİ TEMİZLİĞİ: Admin test verileri (log, teklif, durum) sıfırlandı.`);
                    }
                    showToast("Sistemde 'admin' kaynaklı test veri bulunamadı.", "info");
                    return null;
                });
            }).then(() => {
                updateProgressOverlay("Görev listeleri yenileniyor", { percent: 95 });
                if (typeof window.renderTasks === 'function') window.renderTasks();
            }).catch(err => {
                console.error(err);
                showToast("Silme sırasında hata oluştu.", "error");
            }).finally(() => {
                hideProgressOverlay();
            });
        });
    }

    return {
        switchTab,
        refreshActiveTab,
        renderUsers,
        saveNewUser,
        openEditUserModal,
        saveEditedUser,
        requestUserDeactivation,
        requestUserDeletion,
        executeUserActionWithTransfer,
        activateUser,
        openCreateUserModal,
        openUserProfileModal,
        renderCategoryList,
        addMainCategory,
        removeMainCategory,
        addSubCategory,
        removeSubCategory,
        cleanAndMergeCategories,
        fixPastRecordsDates,
        cleanArchiveAssignees,
        cleanAndMergeContacts,
        deleteAllAdminLogs,
        renderSystemLogs,
        displaySystemLogs,
        applyPermissionPreset,
    };
})();

// Global erişim
window.switchAdminTab = AdminController.switchTab.bind(AdminController);
window.renderUsers = AdminController.renderUsers.bind(AdminController);
window.saveNewUser = AdminController.saveNewUser.bind(AdminController);
window.openEditUserModal = AdminController.openEditUserModal.bind(AdminController);
window.saveEditedUser = AdminController.saveEditedUser.bind(AdminController);
window.requestUserDeactivation = AdminController.requestUserDeactivation.bind(AdminController);
window.requestUserDeletion = AdminController.requestUserDeletion.bind(AdminController);
window.executeUserActionWithTransfer = AdminController.executeUserActionWithTransfer.bind(AdminController);
window.activateUser = AdminController.activateUser.bind(AdminController);
window.openUserProfileModal = AdminController.openUserProfileModal.bind(AdminController);
window.applyPermissionPreset = AdminController.applyPermissionPreset.bind(AdminController);
window.renderAdminCategoryList = AdminController.renderCategoryList.bind(AdminController);
window.toggleUserRoleFields = window.toggleUserRoleFields || function() {};
window.toggleManagerSelect = window.toggleUserRoleFields;
window.addSystemMainCategory = AdminController.addMainCategory.bind(AdminController);
window.removeSystemMainCategory = AdminController.removeMainCategory.bind(AdminController);
window.addSystemSubCategory = AdminController.addSubCategory.bind(AdminController);
window.removeSystemSubCategory = AdminController.removeSubCategory.bind(AdminController);
window.cleanAndMergeCategories = AdminController.cleanAndMergeCategories.bind(AdminController);
window.fixPastRecordsDates = AdminController.fixPastRecordsDates.bind(AdminController);
window.renderSystemLogs = AdminController.renderSystemLogs.bind(AdminController);
window.displaySystemLogs = AdminController.displaySystemLogs.bind(AdminController);
window.cleanArchiveAssignees = AdminController.cleanArchiveAssignees.bind(AdminController);
window.cleanAndMergeContacts = AdminController.cleanAndMergeContacts.bind(AdminController);
window.deleteAllAdminLogs = AdminController.deleteAllAdminLogs.bind(AdminController);

const GROUPANYA_CATEGORY_TREE = {
    'Aktivite - Eğlence (Core)': ['Binicilik - Parkur', 'Eğlence Merkezi', 'Havuz - Plaj', 'Poligon - Paintball', 'Rafting - Yamaç Paraşütü', 'Sanal Gerçeklik - Kaçış', 'Su Sporları'],
    'Bilet - Etkinlik (Core)': ['Akvaryum - Tema Park', 'Çocuk Tiyatro', 'Gösteri - Müzikal', 'Konser', 'Parti - Festival', 'Sergi - Müze', 'Sinema', 'Tiyatro'],
    'Güzellik (Core)': ['Biorezonans', 'Botoks - Dolgu', 'Cilt Bakımı', 'Epilasyon - Ağda', 'Kalıcı Makyaj', 'Kaş - Kirpik', 'Manikür - Pedikür', 'Saç - Makyaj', 'Solaryum', 'Zayıflama'],
    'Hizmet (Core)': ['Araç Kiralama - Vize', 'Ev Hizmetleri', 'Evcil Hayvan Hizmetleri', 'Fotoğrafçılık - Baskı', 'İndirim Çekleri', 'Kuru Temizleme', 'Oto Bakım', 'Sigorta', 'Transfer - Nakliye'],
    'İftar (Core)': ['Açık Büfe İftar', 'Anadolu Yakası İftar', 'Avrupa Yakası İftar', 'Otelde İftar', 'Restoranda İftar', 'Teknede İftar'],
    'Kahvaltı (Core)': ['Açık Büfe Kahvaltı', 'Açık Havada Kahvaltı', 'Boğazda Kahvaltı', 'Brunch', 'Cafede Kahvaltı', 'Deniz Kenarında Kahvaltı', 'Doğada Kahvaltı', 'Hafta İçi Kahvaltı', 'Hafta Sonu Kahvaltı', 'Kahvaltı Tabağı', 'Köy Kahvaltısı', 'Otelde Kahvaltı', 'Serpme Kahvaltı', 'Teknede Kahvaltı'],
    'Masaj - Spa (Core)': ['Anti Stress Masajı', 'Aromaterapi Masajı', 'Bali Masajı', 'Baş-Boyun ve Omuz Masajı', 'Bebek Spa', 'Çift Masajı', 'Hamam', 'İsveç Masajı', 'Klasik Masaj', 'Köpük Masajı', 'Lenf Drenaj Masajı', 'Masaj', 'Otel Spa', 'Refleksoloji Masajı', 'Shiatsu Masajı', 'Sıcak Taş Masajı', 'Sporcu Masajı', 'Thai Masajı', 'Yüz Masajı'],
    'Özel Günler (Core)': ['Anneler Günü', 'Bayram', 'Harika Cuma', 'Kadınlar Günü'],
    'Sevgililer Günü (Core)': ['Sevgililer Günü Etkinlik', 'Sevgililer Günü Hediye', 'Sevgililer Günü Konaklama', 'Sevgililer Günü Spa', 'Sevgililer Günü Tur', 'Sevgililer Günü Yemek'],
    'Spor - Eğitim - Kurs (Core)': ['Anaokulu - Çocuk', 'Atölye', 'Dans - Müzik', 'Dil Eğitimi', 'Fitness - Gym', 'Mesleki Eğitim', 'Online Kurslar', 'Pilates', 'Yoga - Nefes Terapisi', 'Yüzme Kursu'],
    'Yemek (Core)': ['Akşam Yemeği', 'Dünya Mutfağı', 'Fast Food', 'Kahve - Fırın - Tatlı', 'Mangal - Steakhouse', 'Meyhane - Fasıl', 'Tekne', 'Türk Mutfağı'],
    'Yılbaşı (Core)': ['Yılbaşı Eğlencesi', 'Yılbaşı Tatili', 'Yılbaşı Turları'],
    'Bayram Turları (Travel)': ['Kurban Bayramı Turları', 'Ramazan Bayramı Turları'],
    'Özel Günler (Travel)': ['Bayram', 'Harika Cuma'],
    'Tatil Otelleri (Travel)': ['Akdeniz Bölgesi', 'Ege Bölgesi', 'İç Anadolu Bölgesi', 'Karadeniz Bölgesi', 'Marmara Bölgesi'],
    'Tatil Teması (Travel)': ['Her Şey Dahil'],
    'Turistik Aktiviteler (Travel)': ['Havuz Girişi', 'Kış Sporları', 'Plaj Girişi', 'Ulaşım - Diğer', 'Ulaşım - Uçak', 'Yaz Sporları'],
    'Yurtdışı Turlar (Travel)': ['Afrika', 'Amerika', 'Asya', 'Avrupa', 'Balkanlar ve Yunanistan', 'Kıbrıs Otel', 'Uzakdoğu', 'Vizesiz Avrupa', 'Vizesiz Balkanlar', 'Yurtdışı Otel'],
    'Yurtiçi Otel (Travel)': ['Ankara Otelleri', 'Antalya Otelleri', 'Bursa Otelleri', 'Diğer Kentler', 'İstanbul Otelleri', 'İzmir Otelleri', 'Yurtiçi Termal Otel'],
    'Yurtiçi Turlar (Travel)': ['Günübirlik Turlar', 'Haftasonu Turları', 'Kapadokya Turları', 'Karadeniz Turları', 'Kayak Turları', 'Kültür Turları', 'Mavi Yolculuk', 'Yurtiçi Paket Tur'],
    'Eski Kategoriler': [],
};

function cloneCategoryTree(tree) {
    return JSON.parse(JSON.stringify(tree || {}));
}

function createGrupanyaCategoryTree() {
    return cloneCategoryTree(GROUPANYA_CATEGORY_TREE);
}

function getCategoryUsage(type, oldMain, oldSub = null) {
    const matchedTaskIds = new Set();
    const matchedBusinessIds = new Set();

    AppState.tasks.forEach((task) => {
        const matches = type === 'main'
            ? task.mainCategory === oldMain
            : task.mainCategory === oldMain && task.subCategory === oldSub;
        if (!matches) return;
        matchedTaskIds.add(task.id);
        if (task.businessId) matchedBusinessIds.add(task.businessId);
    });

    AppState.businesses.forEach((biz) => {
        const matches = type === 'main'
            ? biz.mainCategory === oldMain
            : biz.mainCategory === oldMain && biz.subCategory === oldSub;
        if (!matches) return;
        if (biz.id) matchedBusinessIds.add(biz.id);
    });

    return {
        taskIds: Array.from(matchedTaskIds),
        businessIds: Array.from(matchedBusinessIds),
        taskCount: matchedTaskIds.size,
        businessCount: matchedBusinessIds.size,
        hasLinkedRecords: matchedTaskIds.size > 0 || matchedBusinessIds.size > 0,
    };
}

function shouldTransferCategoryEntity(entity, type, oldMain, oldSub = null) {
    return type === 'main'
        ? entity?.mainCategory === oldMain
        : entity?.mainCategory === oldMain && entity?.subCategory === oldSub;
}

async function runBatched(requests, batchSize = 10) {
    const results = [];
    for (let i = 0; i < requests.length; i += batchSize) {
        const batchResults = await Promise.all(requests.slice(i, i + batchSize).map((fn) => fn()));
        results.push(...batchResults);
    }
    return results;
}

// ---- Sistem Ayarları ----
    window.factoryReset = function() {
        askConfirm("SİSTEM SIFIRLANACAK! Tüm veriler KALICI olarak silinecek. Onaylıyor musunuz?", (res) => {
            if (res) { 
                DataService.apiRequest('/admin/system/factory-reset', { method: 'POST' }).then(() => { 
                    localStorage.clear(); 
                    sessionStorage.clear(); 
                    location.reload(); 
                }).catch(err => {
                    showToast("Sıfırlama başarısız oldu", "error");
                    console.error(err);
                });
            }
        });
    };

// --- KATEGORİ TRANSFER VE GÜVENLİ SİLME MOTORU ---
let catTransferCtx = null;

window.openCategoryTransferModal = async function(type, oldMain, oldSub, index, count) {
    const usage = await getCategoryUsage(type, oldMain, oldSub);
    catTransferCtx = {
        type,
        oldMain,
        oldSub,
        index,
        count: usage.businessCount || usage.taskCount || count || 0,
        usage,
    };
    let msg = '';
    const taskPart = usage.taskCount > 0 ? `<strong>${usage.taskCount} görev</strong>` : null;
    const bizPart = usage.businessCount > 0 ? `<strong>${usage.businessCount} işletme kaydı</strong>` : null;
    const impactText = [taskPart, bizPart].filter(Boolean).join(' ve ');
    if (type === 'main') {
        msg = `Sileceğiniz <strong>"${oldMain}"</strong> ana kategorisine bağlı ${impactText || `<strong>${catTransferCtx.count} kayıt</strong>`} bulunuyor. Görev geçmişi ve mevcut işletme kartları bozulmaması için silmeden önce yeni kategoriye taşımanız gerekir.`;
    } else {
        msg = `Sileceğiniz <strong>"${oldSub}"</strong> alt kategorisine bağlı ${impactText || `<strong>${catTransferCtx.count} kayıt</strong>`} bulunuyor. Görev geçmişi ve mevcut işletme kartları bozulmaması için silmeden önce yeni kategoriye taşımanız gerekir.`;
    }
    document.getElementById('catTransferMessage').innerHTML = msg;

    const mainSel = document.getElementById('catTransferNewMain');
    mainSel.innerHTML = '<option value="">-- Ana Kategori Seçin --</option>';
    Object.keys(AppState.dynamicCategories).sort().forEach(c => {
        if (type === 'main' && c === oldMain) return; // Silinen ana kategoriyi hedefe koyma
        mainSel.add(new Option(c, c));
    });

    document.getElementById('catTransferNewSub').innerHTML = '<option value="">-- Önce Ana Kategori Seçin --</option>';
    document.getElementById('categoryTransferModal').style.display = 'flex';
};

window.closeCategoryTransferModal = function() {
    document.getElementById('categoryTransferModal').style.display = 'none';
    catTransferCtx = null;
};

window.populateTransferSubDropdown = function() {
    const mainSel = document.getElementById('catTransferNewMain').value;
    const subSel = document.getElementById('catTransferNewSub');
    subSel.innerHTML = '<option value="">-- Alt Kategori Seçin --</option>';
    if (!mainSel || !AppState.dynamicCategories[mainSel]) return;

    AppState.dynamicCategories[mainSel].sort().forEach(s => {
        subSel.add(new Option(s, s));
    });
};

window.executeCategoryTransfer = function() {
    if (!catTransferCtx) return;
    const newMain = document.getElementById('catTransferNewMain').value;
    const newSub = document.getElementById('catTransferNewSub').value;

    if (!newMain) return showToast('Lütfen hedef bir ana kategori seçin.', 'warning');

    const nextSub = newSub || '';
    const fallbackUsage = catTransferCtx.usage || getCategoryUsageFallback(catTransferCtx.type, catTransferCtx.oldMain, catTransferCtx.oldSub);
    const transferredCount = Number(fallbackUsage?.businessCount || 0);
    showProgressOverlay("Kategori Transferi Başladı", "Kategori ağacı kaydediliyor", {
        percent: 10,
        meta: `${transferredCount} işletme için görev ve işletme kayıtları taşınacak.`,
    });

    // 2. Kategoriyi Ağaçtan Sil
    if (catTransferCtx.type === 'main') {
        delete AppState.dynamicCategories[catTransferCtx.oldMain];
    } else if (catTransferCtx.type === 'sub') {
        AppState.dynamicCategories[catTransferCtx.oldMain].splice(catTransferCtx.index, 1);
    }

    // 3. Kategorileri kaydet, sonra ilgili görev ve işletmeleri birlikte taşı
    DataService.saveCategories(AppState.dynamicCategories).then(async () => {
        updateProgressOverlay("Kategori kayıtları sunucuda taşınıyor", {
            percent: 55,
            meta: `${Number(fallbackUsage?.taskCount || 0)} görev ve ${Number(fallbackUsage?.businessCount || 0)} işletme güncelleniyor.`,
        });
        if (typeof DataService?.apiRequest === 'function') {
            return DataService.apiRequest('/admin/maintenance/transfer-category', {
                method: 'POST',
                body: JSON.stringify({
                    type: catTransferCtx.type,
                    oldMain: catTransferCtx.oldMain,
                    oldSub: catTransferCtx.oldSub,
                    newMain,
                    newSub: nextSub,
                    index: catTransferCtx.index,
                    categories: AppState.dynamicCategories,
                }),
            });
        }
        const taskUpdates = [];
        const businessUpdates = [];
        AppState.tasks.forEach((task) => {
            if (!shouldTransferCategoryEntity(task, catTransferCtx.type, catTransferCtx.oldMain, catTransferCtx.oldSub)) return;
            taskUpdates.push(() =>
                DataService.apiRequest(`/tasks/${task.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ mainCategory: newMain, subCategory: nextSub }),
                }),
            );
        });
        AppState.businesses.forEach((biz) => {
            if (!shouldTransferCategoryEntity(biz, catTransferCtx.type, catTransferCtx.oldMain, catTransferCtx.oldSub)) return;
            businessUpdates.push(() =>
                DataService.apiRequest(`/accounts/${biz.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ mainCategory: newMain, subCategory: nextSub }),
                }),
            );
        });
        await runBatched(taskUpdates, 10);
        await runBatched(businessUpdates, 10);
        return fallbackUsage;
    }).then((result) => {
        updateProgressOverlay("Ekran yenileniyor", { percent: 96 });
        const matchedTaskIds = new Set(Array.isArray(result?.taskIds) ? result.taskIds : fallbackUsage.taskIds || []);
        const matchedBusinessIds = new Set(Array.isArray(result?.businessIds) ? result.businessIds : fallbackUsage.businessIds || []);
        AppState.tasks = AppState.tasks.map((task) => (
            matchedTaskIds.has(task.id)
                ? { ...task, mainCategory: newMain, subCategory: nextSub }
                : task
        ));
        AppState.businesses = AppState.businesses.map((biz) => (
            matchedBusinessIds.has(biz.id)
                ? { ...biz, mainCategory: newMain, subCategory: nextSub }
                : biz
        ));
        addSystemLog(`KATEGORİ TRANSFERİ: ${transferredCount} işletme aktarıldı. Silinen: ${catTransferCtx.type === 'main' ? catTransferCtx.oldMain : catTransferCtx.oldSub}`);
        showToast(`${transferredCount} işletme taşındı ve kategori kalıcı olarak silindi.`, 'success');
        closeCategoryTransferModal();
        if (typeof AdminController !== 'undefined') AdminController.renderCategoryList();
        if (typeof DropdownController !== 'undefined') DropdownController.populateMainCategoryDropdowns();
        if (typeof BusinessController !== 'undefined' && AppState.isBizSearched) BusinessController.search(false);
    }).catch(err => {
        console.error(err);
        showToast('Transfer sırasında bir hata oluştu.', 'error');
    }).finally(() => {
        hideProgressOverlay();
    });
};

// 3. Eski Silme Fonksiyonlarını Güvenli Versiyonlarla Ez (Override)
window.removeSystemMainCategory = async function(cat) {
    const usage = await getCategoryUsage('main', cat);

    if (usage.hasLinkedRecords) {
        return openCategoryTransferModal('main', cat, null, null, usage.businessCount || usage.taskCount);
    }

    askConfirm(`'${cat}' kategorisini silmek istediğinize emin misiniz?`, res => {
        if (!res) return;
        delete AppState.dynamicCategories[cat];
        DataService.saveCategories(AppState.dynamicCategories).then(() => {
            addSystemLog(`ANA KATEGORİ SİLİNDİ: ${cat}`);
            showToast('Kategori silindi', 'success');
            if (typeof AdminController !== 'undefined') AdminController.renderCategoryList();
            if (typeof DropdownController !== 'undefined') DropdownController.populateMainCategoryDropdowns();
        });
    });
};

window.removeSystemSubCategory = async function(main, index) {
    if (!AppState.dynamicCategories[main]) return;
    const subName = AppState.dynamicCategories[main][index];
    const usage = await getCategoryUsage('sub', main, subName);

    if (usage.hasLinkedRecords) {
        return openCategoryTransferModal('sub', main, subName, index, usage.businessCount || usage.taskCount);
    }

    AppState.dynamicCategories[main].splice(index, 1);
    DataService.saveCategories(AppState.dynamicCategories).then(() => {
        addSystemLog(`ALT KATEGORİ SİLİNDİ: ${subName}`);
        showToast('Alt kategori silindi', 'success');
        if (typeof AdminController !== 'undefined') AdminController.renderCategoryList();
    });
};

window.executeGrupanyaMigration = function() {
    askConfirm("DİKKAT! Sistemdeki eski kategoriler tamamen SİLİNECEK, Grupanya formatı eklenecek ve eşleşmeyen işletmeler 'Eski Kategoriler' altında toplanacaktır. Onaylıyor musunuz?", (res) => {
        if(!res) return;

        showProgressOverlay("Grupanya Altyapısına Geçiliyor", "Kategori ağacı hazırlanıyor", {
            percent: 8,
            meta: 'Görev ve işletme kayıtları sunucuda toplu olarak dönüştürülüyor.',
        });

        DataService.apiRequest('/admin/maintenance/migrate-grupanya-categories', {
            method: 'POST',
        }).then((result) => {
            updateProgressOverlay("Arayüz yenileniyor", {
                percent: 92,
                meta: 'Yeni kategori ağacı ve güncel kayıtlar eşitleniyor.',
            });

            const transferredCount = Number(result?.updatedBusinessCount || 0);
            const quarantineCount = Number(result?.quarantineCount || 0);
            AppState.dynamicCategories = createGrupanyaCategoryTree();
            addSystemLog(`GRUPANYA GÖÇÜ TAMAMLANDI: ${transferredCount} işletme aktarıldı, ${quarantineCount} tanesi karantinaya alındı.`);

            let toastMsg = `Mükemmel! Sistem Grupanya standartlarına geçti. ${transferredCount} işletme yerleştirildi.`;
            if(quarantineCount > 0) toastMsg += ` (${quarantineCount} işletme Eski Kategoriler'e alındı, lütfen inceleyin.)`;

            showToast(toastMsg, "success");

            if (typeof SyncService !== 'undefined' && typeof SyncService.requestSync === 'function') {
                SyncService.requestSync(['tasks', 'businesses', 'categories']);
            }
            if (typeof AdminController !== 'undefined') AdminController.renderCategoryList();
            if (typeof DropdownController !== 'undefined') DropdownController.populateMainCategoryDropdowns();
            if (typeof BusinessController !== 'undefined' && AppState.isBizSearched) BusinessController.search(false);
        }).catch(err => {
            console.error(err);
            showToast(err?.message || 'Göç sırasında bir hata oluştu.', 'error');
        }).finally(() => {
            hideProgressOverlay();
        });
    });
};
