// ============================================================
// controllers/appController.js
// Uygulama başlatma, sayfa yönlendirme ve genel UI kontrolü
// ============================================================

const AppController = (() => {
    const DISMISSED_NOTIFICATION_STORAGE_KEY = 'crm_dismissed_notifications_v1';
    const BACKEND_ADMIN_ONLY_PERMISSIONS = new Set(['manageSettings', 'viewAuditLogs']);
    const MANAGER_PROTECTED_PERMISSIONS = new Set(['reassignTask', 'manageUsers', 'manageRoles']);
    const dismissedNotificationIds = new Set();

    function getNotificationDismissKey(id) {
        const value = String(id || '').trim();
        return value ? `notif:${value}` : '';
    }

    function getDynamicDismissKey(notification) {
        const taskId = String(notification?.taskId || '').trim();
        if (taskId) return `dynamic:${taskId}`;
        return `dynamic-text:${String(notification?.text || '').trim()}`;
    }

    function loadDismissedNotifications() {
        try {
            const raw = window?.sessionStorage?.getItem(DISMISSED_NOTIFICATION_STORAGE_KEY);
            const parsed = JSON.parse(raw || '[]');
            dismissedNotificationIds.clear();
            if (Array.isArray(parsed)) {
                parsed.forEach((id) => {
                    const value = String(id || '').trim();
                    if (value) dismissedNotificationIds.add(value);
                });
            }
        } catch {}
    }

    function persistDismissedNotifications() {
        try {
            window?.sessionStorage?.setItem(
                DISMISSED_NOTIFICATION_STORAGE_KEY,
                JSON.stringify(Array.from(dismissedNotificationIds)),
            );
        } catch {}
    }

    loadDismissedNotifications();

    function getDefaultPermissionsForRole(role = '', user = null) {
        const normalizedRole = String(role || '').trim();
        const apiRole = String(user?._apiRole || '').toUpperCase();
        const isBackendAdmin = apiRole === 'ADMIN';
        const defaults = {
            export: false,
            createBiz: normalizedRole !== 'Satış Temsilcisi',
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
            manageUsers: isBackendAdmin,
            manageRoles: isBackendAdmin,
            manageSettings: isBackendAdmin,
            viewAuditLogs: isBackendAdmin,
        };

        if (normalizedRole === 'Yönetici' || isBackendAdmin) {
            Object.keys(defaults).forEach((key) => { defaults[key] = true; });
            if (!isBackendAdmin) {
                BACKEND_ADMIN_ONLY_PERMISSIONS.forEach((permissionKey) => {
                    defaults[permissionKey] = false;
                });
            }
        }

        if (normalizedRole === 'Operasyon') {
            defaults.export = true;
            defaults.createBiz = true;
            defaults.viewAllTasks = true;
            defaults.importCsv = true;
            defaults.viewAuditLogs = true;
        }

        return defaults;
    }

    function getUserPermissions(user = AppState.loggedInUser) {
        if (!user) return {};
        const permissions = {
            ...getDefaultPermissionsForRole(user.role, user),
            ...(user.settings?.permissions || {}),
        };
        const apiRole = String(user?._apiRole || '').toUpperCase();
        if (apiRole === 'MANAGER') {
            MANAGER_PROTECTED_PERMISSIONS.forEach((permissionKey) => {
                permissions[permissionKey] = true;
            });
        }
        return permissions;
    }

    function hasPermission(permissionKey, user = AppState.loggedInUser) {
        if (!permissionKey) return true;
        const apiRole = String(user?._apiRole || '').toUpperCase();
        if (BACKEND_ADMIN_ONLY_PERMISSIONS.has(permissionKey) && apiRole !== 'ADMIN') {
            return false;
        }
        const permissions = getUserPermissions(user);
        return Boolean(permissions?.[permissionKey]);
    }

    /**
     * Oturum açıldıktan sonra uygulamayı başlatır.
     */
    function init() {
        const user = AppState.loggedInUser;
        document.getElementById('login-wrapper').style.display = 'none';
        document.getElementById('app-section').style.display = 'block';

        // Kullanıcı adını güncelle
        const nameEl = document.getElementById('currentUserName');
        if (nameEl) nameEl.innerText = user.name;

        const avatarEl = document.getElementById('userAvatarInitials');
        if (avatarEl) {
            const parts = (user.name || 'U').split(' ');
            avatarEl.innerText = (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
        }

        _applyRoleVisibility(user);
        DropdownController.updateAssigneeDropdowns();
        DropdownController.populateProjectDropdowns();
        DropdownController.populateMainCategoryDropdowns();
        DropdownController.populateCityDropdowns();
        updateNotificationsUI();
        switchPage('page-dashboard');
    }

    /**
     * Role göre UI elementlerini göster/gizle.
     */
    function _applyRoleVisibility(user) {
        const show = (selector) => document.querySelectorAll(selector).forEach(el => el.style.display = '');
        const hide = (selector) => document.querySelectorAll(selector).forEach(el => el.style.display = 'none');
        const setVisible = (selector, isVisible, displayValue = '') => {
            document.querySelectorAll(selector).forEach((el) => {
                el.style.display = isVisible ? displayValue : 'none';
            });
        };

        if (user.role === USER_ROLES.MANAGER) {
            show('.manager-only');
            show('.admin-tl-only');
            hide('.user-only');
            AppState.currentPoolTab = 'general';
        } else if (user.role === USER_ROLES.TEAM_LEAD) {
            hide('.manager-only');
            show('.admin-tl-only');
            show('.user-only');
            hide('#nav-rep-request');
            hide('#nav-my-tasks');
            hide('#page-rep-request');
            hide('#page-my-tasks');
            show('#nav-add-business');
            show('#nav-all-tasks');
            show('#page-add-business');
            show('#page-all-tasks');
            if (user.team === 'Team 1') {
                const tb = document.getElementById('tabBtn-team2');
                if (tb) tb.style.display = 'none';
                AppState.currentPoolTab = 'team1';
            }
            if (user.team === 'Team 2') {
                const tb = document.getElementById('tabBtn-team1');
                if (tb) tb.style.display = 'none';
                AppState.currentPoolTab = 'team2';
            }
        } else {
            hide('.manager-only');
            hide('.admin-tl-only');
            show('.user-only');
            hide('#nav-add-business');
            hide('#page-add-business');
        }

        // Özel admin sekmeleri: email hardcode yerine API rolünü esas al.
        const isSystemAdmin = String(user?._apiRole || '').toUpperCase() === 'ADMIN';
        const btnLogs = document.getElementById('tabBtnLogs');
        const btnSettings = document.getElementById('tabBtnSettings');
        if (btnLogs) btnLogs.style.display = (isSystemAdmin || hasPermission('viewAuditLogs', user)) ? 'inline-block' : 'none';
        if (btnSettings) btnSettings.style.display = (isSystemAdmin || hasPermission('manageSettings', user)) ? 'inline-block' : 'none';

        const isSalesRep = user.role === USER_ROLES.SALES_REP;
        setVisible('#nav-task-list', hasPermission('viewAllTasks', user));
        setVisible('#nav-add-business', !isSalesRep && hasPermission('createBiz', user));
        setVisible('#nav-all-tasks', hasPermission('viewAllTasks', user));
        setVisible('#nav-reports', hasPermission('viewReports', user));
        setVisible('#nav-admin', hasPermission('manageUsers', user) || hasPermission('manageRoles', user) || hasPermission('manageSettings', user) || hasPermission('viewAuditLogs', user));
        setVisible('#tabBtn-target', hasPermission('manageProjects', user), 'flex');
        setVisible('#tabBtn-reports', hasPermission('viewAllTasks', user), 'flex');
        setVisible('#poolActionBar', hasPermission('bulkAssign', user), 'flex');
        setVisible('#adminCreateUserBtn', hasPermission('manageUsers', user), 'inline-flex');
        setVisible('#reportsExportTasksBtn', hasPermission('exportReports', user), 'inline-flex');
        setVisible('#reportsExportAccountsBtn', hasPermission('exportReports', user), 'inline-flex');
        setVisible('#page-add-business', !isSalesRep && hasPermission('createBiz', user));
    }

    /**
     * Sayfalar arası geçiş yapar.
     */
    function switchPage(pageId) {
        const requiredPermissionByPage = {
            'page-task-list': 'viewAllTasks',
            'page-all-tasks': 'viewAllTasks',
            'page-add-business': 'createBiz',
            'page-reports': 'viewReports',
            'page-operations-radar': 'viewReports',
        };
        const requiredPermission = requiredPermissionByPage[pageId];
        if (requiredPermission && !hasPermission(requiredPermission)) {
            showToast('Bu alana erisim yetkiniz bulunmuyor.', 'warning');
            pageId = 'page-dashboard';
        }
        if (pageId === 'page-admin') {
            const canOpenAdmin = hasPermission('manageUsers') || hasPermission('manageRoles') || hasPermission('manageSettings') || hasPermission('viewAuditLogs');
            if (!canOpenAdmin) {
                showToast('Yonetim paneline erisim yetkiniz bulunmuyor.', 'warning');
                pageId = 'page-dashboard';
            }
        }

        // Tüm sayfaları gizle, hedefi göster
        document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active'));
        const target = document.getElementById(pageId);
        if (target) target.classList.add('active');

        // Navbar'ı güncelle
        const navLinks = document.getElementById('navLinks');
        if (navLinks && navLinks.classList.contains('show')) navLinks.classList.remove('show');

        document.querySelectorAll('.nav-links button').forEach(btn => btn.classList.remove('active'));
        const activeBtn = Array.from(document.querySelectorAll('.nav-links button')).find(btn =>
            btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(pageId)
        );
        if (activeBtn) activeBtn.classList.add('active');

        window.scrollTo(0, 0);
        updateNotificationsUI();

        // Her sayfanın ilk yükleme işlevi
        const pageInitMap = {
            'page-dashboard': () => DashboardController.render(),
            'page-task-list': () => PoolController.switchTab(AppState.currentPoolTab),
            'page-my-tasks': () => TaskController.renderMyTasks(),
            'page-rep-request': () => { if(typeof RequestController !== 'undefined') RequestController.initWizard(); },
            'page-all-tasks': () => { if (typeof TaskController.resetAllTasksFilters === 'function') TaskController.resetAllTasksFilters(); TaskController.renderAllTasks(); },
            'page-add-business': () => ProjectController.switchTaskCreateTab('new'),
            'page-reports': () => ReportController.clearFilters(),
            'page-passive-tasks': () => ArchiveController.clearFilters(),
            'page-businesses': () => BusinessController.clearFilters(),
            'page-admin': () => AdminController.switchTab('users'),
            'page-pricing': () => renderPricingPage(),
            'page-operations-radar': () => renderOperationsRadarPage(),
        };

        if (pageInitMap[pageId]) pageInitMap[pageId]();
    }

    function toggleMobileMenu() {
        const navLinks = document.getElementById('navLinks');
        if (navLinks) navLinks.classList.toggle('show');
    }

    // --- Bildirim UI ---

    function updateNotificationsUI() {
        if (!AppState.loggedInUser) return;
        const notifList = document.getElementById('notifList');
        if (!notifList) return;
        notifList.innerHTML = '';

        const user = AppState.loggedInUser;
        const unreadStored = AppState.notifications.filter((n) => {
            if (dismissedNotificationIds.has(getNotificationDismissKey(n.id))) return false;
            if (n.read) return false;
            if (n.toUserId && user.id) return n.toUserId === user.id;
            return true;
        });
        const liveIds = new Set(AppState.notifications.map((n) => String(n.id || '').trim()).filter(Boolean));
        let dismissedPruned = false;
        Array.from(dismissedNotificationIds).forEach((id) => {
            if (!String(id).startsWith('notif:')) return;
            const liveId = String(id).replace(/^notif:/, '');
            if (!liveIds.has(liveId)) {
                dismissedNotificationIds.delete(id);
                dismissedPruned = true;
            }
        });
        if (dismissedPruned) persistDismissedNotifications();

        // Dinamik bildirimler: 3 günden uzun süredir işlem yapılmayan görevler
        const dynamicNotifs = _buildDynamicNotifications(user)
            .filter((n) => !dismissedNotificationIds.has(getDynamicDismissKey(n)));

        const totalCount = unreadStored.length + dynamicNotifs.length;
        const badge = document.getElementById('notifBadge');
        if (badge) badge.style.display = totalCount > 0 ? 'inline-block' : 'none';

        // Onay bekleyen işletme güncellemesi mekanizması kaldırıldı

        if (totalCount === 0) {
            notifList.innerHTML = `<div style="padding:15px; text-align:center; color:var(--text-muted); font-size:12px;">Yeni bildiriminiz yok.</div>`;
            return;
        }

        const items = [];
        dynamicNotifs.forEach(n => {
            const dismissKey = getDynamicDismissKey(n);
            const clickAttr = n.taskId
                ? `onclick="markDynamicNotifRead('${dismissKey}'); openTaskModal('${n.taskId}')"`
                : `onclick="markDynamicNotifRead('${dismissKey}')"`;
            items.push(`<div class="notif-item" style="border-left: 3px solid ${n.color};" ${clickAttr}>
                <div style="font-size:12px; color:#334155;">${n.text}</div>
                <div style="font-size:10px; color:#94a3b8; margin-top:3px;">${n.date}</div>
            </div>`);
        });

        unreadStored.forEach(n => {
            const clickAttr = n.taskId
                ? `onclick="markNotifRead('${n.id}'); openTaskModal('${n.taskId}')"` 
                : (n.bizId ? `onclick="markNotifRead('${n.id}'); openBizFromNotif('${n.bizId}')"` : `onclick="markNotifRead('${n.id}')"`);
            items.push(`<div class="notif-item" style="border-left: 3px solid var(--primary-color);" ${clickAttr}>
                <div style="font-size:12px; color:#334155;">${n.text}</div>
                <div style="font-size:10px; color:#94a3b8; margin-top:3px;">Sistem Bildirimi</div>
            </div>`);
        });

        notifList.innerHTML = items.join('');
    }

    function _buildDynamicNotifications(user) {
        const notifs = [];
        const teamLeadRole = (typeof USER_ROLES !== 'undefined' && USER_ROLES?.TEAM_LEAD) ? USER_ROLES.TEAM_LEAD : 'Takım Lideri';
        if (String(user?.role || '') === teamLeadRole) {
            return notifs;
        }
        const nowTime = Date.now();
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
        const userTaskSummaryMap = typeof AppState.getUserTaskSummaryMap === 'function'
            ? AppState.getUserTaskSummaryMap()
            : null;
        const bizMap = typeof AppState.getBizMap === 'function'
            ? AppState.getBizMap()
            : null;
        const mySummary = userTaskSummaryMap?.get(user.name) || null;
        const myActiveTasks = mySummary
            ? mySummary.tasks.filter((task) => task.status !== 'cold' && task.status !== 'deal')
            : AppState.tasks.filter(t =>
                t.assignee === user.name &&
                t.status !== 'cold' &&
                t.status !== 'deal'
            );

        myActiveTasks.forEach(t => {
            const lastTime = (t.logs && t.logs.length > 0)
                ? parseLogDate(t.logs[0].date)
                : new Date(t.createdAt).getTime();
            if (lastTime > 0 && (nowTime - lastTime) > threeDaysMs) {
                const biz = bizMap?.get ? (bizMap.get(t.businessId) || t) : (AppState.businesses.find(b => b.id === t.businessId) || t);
                notifs.push({
                    text: `<b>${biz.companyName || 'İşletme'}</b> görevi için 3 günden uzun süredir işlem yapmadınız!`,
                    date: 'Sistem Uyarısı',
                    color: 'var(--warning-color)',
                    taskId: t.id
                });
            }
        });

        return notifs;
    }

    function toggleNotif(e) {
        e.stopPropagation();
        const el = document.getElementById('notifDropdown');
        if (el) el.style.display = el.style.display === 'block' ? 'none' : 'block';
        const ud = document.getElementById('userDropdown');
        if (ud && ud.style.display === 'block') ud.style.display = 'none';
    }

    function toggleUserMenu(e) {
        e.stopPropagation();
        const el = document.getElementById('userDropdown');
        if (el) el.style.display = el.style.display === 'block' ? 'none' : 'block';
        const nd = document.getElementById('notifDropdown');
        if (nd && nd.style.display === 'block') nd.style.display = 'none';
    }

    function formatCalculatorCurrency(amount) {
        const value = Number(amount || 0);
        return `${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
    }

    function getCalculatorValue(id) {
        return Number(document.getElementById(id)?.value || 0);
    }

    function renderRevenueCalculator(result) {
        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        setText('calcScenarioLabel', result.includeVat ? 'Paylar üzerinden KDV hesaplanıyor' : 'KDV uygulanmayan senaryo');
        setText('calcBrandShare', formatCalculatorCurrency(result.brandNetShare));
        setText('calcPartnerShare', formatCalculatorCurrency(result.partnerNetShare));
        setText('calcMetaSale', formatCalculatorCurrency(result.salePrice));
        setText('calcMetaCommission', `%${result.commissionRate.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`);
        setText('calcNetBase', formatCalculatorCurrency(result.salePrice));
        setText('calcVatAmount', formatCalculatorCurrency(result.totalVatAmount));
        setText('calcCommissionAmount', formatCalculatorCurrency(result.commissionAmount));
        setText('calcFinalBrandShare', formatCalculatorCurrency(result.brandNetShare));
        setText('calcFinalPartnerShare', formatCalculatorCurrency(result.partnerNetShare));
    }

    function updateRevenueCalculator() {
        const salePrice = Math.max(0, getCalculatorValue('calcSalePrice'));
        const commissionRate = Math.max(0, getCalculatorValue('calcCommissionRate'));
        const includeVat = Boolean(document.getElementById('calcIncludeVat')?.checked);
        const vatRate = Math.max(0, getCalculatorValue('calcVatRate'));

        const commissionAmount = salePrice * (commissionRate / 100);
        const partnerGrossShare = Math.max(0, salePrice - commissionAmount);
        const brandVatAmount = includeVat ? commissionAmount * (vatRate / 100) : 0;
        const partnerVatAmount = includeVat ? partnerGrossShare * (vatRate / 100) : 0;
        const totalVatAmount = brandVatAmount + partnerVatAmount;
        const brandNetShare = Math.max(0, commissionAmount - brandVatAmount);
        const partnerNetShare = Math.max(0, partnerGrossShare - partnerVatAmount);

        renderRevenueCalculator({
            salePrice,
            commissionRate,
            includeVat,
            vatRate,
            commissionAmount,
            partnerGrossShare,
            brandVatAmount,
            partnerVatAmount,
            totalVatAmount,
            brandNetShare,
            partnerNetShare,
        });
    }

    function toggleRevenueVatFields() {
        const includeVat = Boolean(document.getElementById('calcIncludeVat')?.checked);
        const vatGroup = document.getElementById('calcVatRateGroup');
        if (vatGroup) vatGroup.style.display = includeVat ? 'block' : 'none';
        updateRevenueCalculator();
    }

    function openRevenueCalculatorModal() {
        const modal = document.getElementById('revenueCalculatorModal');
        if (modal) modal.style.display = 'flex';
        updateRevenueCalculator();
    }

    async function clearNotifs() {
        const toMarkRead = AppState.notifications.filter((n) => {
            if (n.read) return false;
            if (n.toUserId && AppState.loggedInUser?.id) return n.toUserId === AppState.loggedInUser.id;
            return true;
        });
        const dynamicKeys = _buildDynamicNotifications(AppState.loggedInUser).map((n) => getDynamicDismissKey(n));
        if (toMarkRead.length === 0 && dynamicKeys.length === 0) return;

        // Optimistic UI Update: okunmamışları anında listeden çıkar
        const markedIds = new Set(toMarkRead.map((n) => n.id));
        markedIds.forEach((id) => dismissedNotificationIds.add(getNotificationDismissKey(id)));
        dynamicKeys.forEach((key) => dismissedNotificationIds.add(key));
        persistDismissedNotifications();
        AppState.notifications = AppState.notifications.filter((n) => !markedIds.has(n.id));
        updateNotificationsUI();

        try {
            await DataService.markAllNotificationsRead(toMarkRead.map((n) => n.id));
            if (typeof SyncService !== 'undefined' && typeof SyncService.requestSync === 'function') {
                SyncService.requestSync(['notifications']);
            }
        } catch (error) {
            console.error("Bildirimleri temizleme hatası:", error);
        }
    }

    function markNotifRead(nId) {
        // Optimistic UI Update: bildirimi anında listeden çıkar
        dismissedNotificationIds.add(getNotificationDismissKey(nId));
        persistDismissedNotifications();
        AppState.notifications = AppState.notifications.filter((n) => n.id !== nId);
        updateNotificationsUI();
        
        DataService.markNotificationRead(nId).then(() => {
            if (typeof SyncService !== 'undefined' && typeof SyncService.requestSync === 'function') {
                SyncService.requestSync(['notifications']);
            }
        });
        const nd = document.getElementById('notifDropdown');
        if (nd) nd.style.display = 'none';
    }

    function markDynamicNotifRead(dismissKey) {
        const value = String(dismissKey || '').trim();
        if (!value) return;
        dismissedNotificationIds.add(value);
        persistDismissedNotifications();
        updateNotificationsUI();
        const nd = document.getElementById('notifDropdown');
        if (nd) nd.style.display = 'none';
    }

    function openBizFromNotif(bizId) {
        const nd = document.getElementById('notifDropdown');
        if (nd) nd.style.display = 'none';
        switchPage('page-businesses');

        const biz = AppState.businesses.find(b => b.id === bizId);
        if (biz) {
            BusinessController.openDetailModal(bizId);
        }
    }

    /**
     * Mevcut aktif sayfayı yeniler (debounce sonrası çağrılır).
     */
    function refreshCurrentView() {
        if (!AppState.loggedInUser) return;
        if (typeof DropdownController !== 'undefined') {
            DropdownController.updateAssigneeDropdowns();
            DropdownController.populateProjectDropdowns();
        }
        const activePage = document.querySelector('.page-content.active');
        if (!activePage) return;

        const refreshMap = {
            'page-dashboard': () => DashboardController.render(),
            'page-task-list': () => PoolController.switchTab(AppState.currentPoolTab),
            'page-my-tasks': () => TaskController.renderMyTasks(),
            'page-all-tasks': () => TaskController.renderAllTasks(),
            'page-businesses': () => { if (AppState.isBizSearched) BusinessController.search(false); },
            'page-passive-tasks': () => ArchiveController.renderPassiveTasks(),
            'page-reports': () => ReportController.renderReports(),
            'page-admin': () => AdminController.refreshActiveTab(),
            'page-pricing': () => renderPricingPage(),
            'page-operations-radar': () => renderOperationsRadarPage(),
        };

        const fn = refreshMap[activePage.id];
        if (fn) fn();
    }

    /**
     * Global click dinleyicisi — açık dropdown'ları kapatır.
     */
    function bindGlobalListeners() {
        document.addEventListener('click', (event) => {
            _closeDropdownIfOutside('notifDropdown', 'notifContainer', event);
            _closeDropdownIfOutside('userDropdown', 'userProfileContainer', event);

            const acDropdown = document.getElementById('existingBizDropdown');
            const acInput = document.getElementById('taskSearchExistingBiz');
            if (acDropdown && acDropdown.style.display === 'block' &&
                event.target !== acInput && event.target !== acDropdown) {
                acDropdown.style.display = 'none';
            }

            const customMenu = document.getElementById('customLogTypeMenu');
            if (customMenu && customMenu.style.display === 'block' &&
                event.target.id !== 'btnCustomLogType') {
                customMenu.style.display = 'none';
            }

            const nLinks = document.getElementById('navLinks');
            const hBtn = document.querySelector('.hamburger-btn');
            if (nLinks && nLinks.classList.contains('show') &&
                event.target !== hBtn && !nLinks.contains(event.target)) {
                nLinks.classList.remove('show');
            }

            // Yeni Eklenen: Telefon ve Kampanya Popover'larını boşluğa tıklayınca kapatır
            document.querySelectorAll('.smart-popover, .tm-phone-menu').forEach(popover => {
                if (popover.style.display === 'block') {
                    if (!popover.parentNode.contains(event.target)) {
                        popover.style.display = 'none';
                    }
                }
            });

            // Tarih/saat inputlarına tıklanınca picker'ı aç
            if (event.target && (event.target.type === 'date' || event.target.type === 'time')) {
                if (typeof event.target.showPicker === 'function' && event.target.id !== 'flatpickrInput') {
                    try { event.target.showPicker(); } catch (err) {}
                }
            }
        });
    }

    function _closeDropdownIfOutside(dropdownId, containerId, event) {
        const dropdown = document.getElementById(dropdownId);
        const container = document.getElementById(containerId);
        if (dropdown && dropdown.style.display === 'block' &&
            container && !container.contains(event.target)) {
            dropdown.style.display = 'none';
        }
    }

    return {
        init,
        switchPage,
        toggleMobileMenu,
        updateNotificationsUI,
        toggleNotif,
        toggleUserMenu,
        openRevenueCalculatorModal,
        updateRevenueCalculator,
        toggleRevenueVatFields,
        clearNotifs,
        markNotifRead,
        markDynamicNotifRead,
        openBizFromNotif,
        refreshCurrentView,
        bindGlobalListeners,
        getUserPermissions,
        hasPermission,
    };
})();

// Global erişim
window.switchPage = AppController.switchPage.bind(AppController);
window.toggleMobileMenu = AppController.toggleMobileMenu;
window.toggleNotif = AppController.toggleNotif;
window.toggleUserMenu = AppController.toggleUserMenu;
window.openRevenueCalculatorModal = AppController.openRevenueCalculatorModal;
window.updateRevenueCalculator = AppController.updateRevenueCalculator;
window.toggleRevenueVatFields = AppController.toggleRevenueVatFields;
window.clearNotifs = AppController.clearNotifs;
window.markNotifRead = AppController.markNotifRead;
window.markDynamicNotifRead = AppController.markDynamicNotifRead;
window.openBizFromNotif = AppController.openBizFromNotif;
window.updateNotificationsUI = AppController.updateNotificationsUI.bind(AppController);
window.refreshCurrentView = AppController.refreshCurrentView.bind(AppController);
window.getUserPermissions = AppController.getUserPermissions.bind(AppController);
window.hasPermission = AppController.hasPermission.bind(AppController);

// Global function to open unassigned pool
window.openUnassignedPool = function() {
    // Yeni mimariye göre Havuz ve Projeler sayfasına geçiş yap
    switchPage('page-task-list');
    
    // Genel Havuz sekmesini aç
    if (typeof switchPoolTab === 'function') {
        switchPoolTab('general');
    } else if (typeof PoolController !== 'undefined') {
        PoolController.switchTab('general');
    }
};
