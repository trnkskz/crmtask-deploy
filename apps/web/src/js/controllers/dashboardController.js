// ==========================================
// DASHBOARD CONTROLLER
// ==========================================
const DashboardController = {
    _managerSummaryRequestId: 0,
    _performanceGridRequestId: 0,
    _dashboardSnapshotRequestId: 0,
    _performanceGridCache: new Map(),

    _escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    _normalizeDashboardRows(rows) {
        if (Array.isArray(rows)) return rows;
        if (Array.isArray(rows?.rows)) return rows.rows;
        return [];
    },

    _getTaskDerivedIndex() {
        if (typeof AppState.getTaskDerivedIndex === 'function') {
            return AppState.getTaskDerivedIndex();
        }

        const nonPoolTasks = AppState.tasks.filter((task) => !['UNASSIGNED', 'Team 1', 'Team 2', 'TARGET_POOL'].includes(task.assignee));
        const tasksByAssignee = new Map();
        const openCountByAssignee = new Map();

        nonPoolTasks.forEach((task) => {
            const assigneeTasks = tasksByAssignee.get(task.assignee) || [];
            assigneeTasks.push(task);
            tasksByAssignee.set(task.assignee, assigneeTasks);

            if (isActiveTask(task.status)) {
                openCountByAssignee.set(task.assignee, (openCountByAssignee.get(task.assignee) || 0) + 1);
            }
        });

        return { nonPoolTasks, tasksByAssignee, openCountByAssignee };
    },

    _getUserTaskSummaryMap() {
        if (typeof AppState.getUserTaskSummaryMap === 'function') {
            return AppState.getUserTaskSummaryMap();
        }

        const taskIndex = this._getTaskDerivedIndex();
        const summaryMap = new Map();
        taskIndex.tasksByAssignee.forEach((tasks, assignee) => {
            const summary = {
                tasks: Array.isArray(tasks) ? tasks : [],
                totalCount: Array.isArray(tasks) ? tasks.length : 0,
                openCount: taskIndex.openCountByAssignee.get(assignee) || 0,
                monthlyStats: {},
            };

            summary.tasks.forEach((task) => {
                const effectiveMs = task.logs?.length > 0 ? parseLogDate(task.logs[0].date) : new Date(task.createdAt || 0).getTime();
                if (!effectiveMs) return;
                const effectiveDate = new Date(effectiveMs);
                if (Number.isNaN(effectiveDate.getTime())) return;
                const monthKey = `${effectiveDate.getFullYear()}-${String(effectiveDate.getMonth() + 1).padStart(2, '0')}`;
                const monthly = summary.monthlyStats[monthKey] || { total: 0, deal: 0, cold: 0 };
                monthly.total += 1;
                if (task.status === 'deal') monthly.deal += 1;
                if (task.status === 'cold') monthly.cold += 1;
                summary.monthlyStats[monthKey] = monthly;
            });

            summaryMap.set(assignee, summary);
        });

        return summaryMap;
    },

    _getMonthlySummary(summary, monthKey) {
        return summary?.monthlyStats?.[monthKey] || { total: 0, deal: 0, cold: 0 };
    },

    _getScopedOpenStatusCounts(teamFilter = null) {
        const statusCounts = { new: 0, hot: 0, nothot: 0, followup: 0 };
        const scopedUsers = teamFilter ? new Set(this._getScopeUsers(teamFilter).map((user) => user.name)) : null;
        const taskIndex = this._getTaskDerivedIndex();
        const openTasks = Array.isArray(taskIndex.openNonPoolTasks)
            ? taskIndex.openNonPoolTasks
            : taskIndex.nonPoolTasks.filter((task) => isActiveTask(task.status));

        openTasks.forEach((task) => {
            if (scopedUsers && !scopedUsers.has(task.assignee)) return;
            if (statusCounts[task.status] === undefined) return;
            statusCounts[task.status] += 1;
        });

        return statusCounts;
    },

    _getScopeUsers(teamFilter = null) {
        return AppState.users.filter((user) => {
            if (user.status === 'Pasif') return false;
            if (user.role !== 'Satış Temsilcisi') {
                return false;
            }
            if (teamFilter && user.team !== teamFilter) return false;
            return true;
        });
    },

    _getMonthlyStatsForTasks(tasks, currentMonth, currentYear) {
        let total = 0;
        let deal = 0;
        let cold = 0;

        tasks.forEach((task) => {
            const d = (task.logs && task.logs.length > 0) ? new Date(parseLogDate(task.logs[0].date)) : new Date(task.createdAt);
            if (d.getMonth() !== currentMonth || d.getFullYear() !== currentYear) return;
            total += 1;
            if (task.status === 'deal') deal += 1;
            if (task.status === 'cold') cold += 1;
        });

        return { total, deal, cold };
    },

    _getPulseMetric(record, metricKey, period = 'monthly') {
        return Number(record?.metrics?.[period]?.[metricKey]?.count || 0);
    },

    _buildPerformanceCard(record, medalHtml = '') {
        const openCount = this._getPulseMetric(record, 'open', 'monthly');
        const dealCount = this._getPulseMetric(record, 'deal', 'monthly');
        const coldCount = this._getPulseMetric(record, 'cold', 'monthly');
        const dealRatio = Math.max(0, Math.min(100, Math.round(Number(record?.dealRatio || 0))));
        const deg = (dealRatio / 100) * 360;
        const userKey = record?.key || '';
        const safeName = record?.user?.name || '-';
        const safeTeam = record?.user?.team || '-';

        return `
            <div class="perf-card perf-card-reference" onclick="openTeamPulseModal('${userKey}', 'open')">
                <div class="perf-card-header">
                    <div class="perf-card-title-block">
                        <div class="perf-card-name">${safeName}</div>
                        <span class="perf-team-badge">${safeTeam || '-'}</span>
                    </div>
                </div>
                <div class="perf-ring-container">
                    <div class="perf-ring" style="background: conic-gradient(#dfe6f1 0deg, #dfe6f1 ${Math.max(0, 360 - deg)}deg, #1f3325 ${Math.max(0, 360 - deg)}deg, #1f3325 360deg);">
                        <div class="perf-ring-inner">
                            <span class="perf-ring-value">${dealRatio}%</span>
                            <span class="perf-ring-label">Deal</span>
                        </div>
                    </div>
                </div>
                <div class="perf-card-divider"></div>
                <div class="perf-stats perf-stats-reference">
                    <button type="button" class="p-stat p-stat-reference" onclick="event.stopPropagation(); openTeamPulseModal('${userKey}', 'open')">
                        <span>AÇIK</span>
                        <strong>${openCount}</strong>
                    </button>
                    <button type="button" class="p-stat p-stat-reference" onclick="event.stopPropagation(); openTeamPulseModal('${userKey}', 'deal')">
                        <span>DEAL</span>
                        <strong class="is-deal">${dealCount}</strong>
                    </button>
                    <button type="button" class="p-stat p-stat-reference" onclick="event.stopPropagation(); openTeamPulseModal('${userKey}', 'cold')">
                        <span>COLD</span>
                        <strong class="is-cold">${coldCount}</strong>
                    </button>
                </div>
            </div>
        `;
    },

    _withBypass(path, force = false) {
        if (!force) return path;
        const sep = path.includes('?') ? '&' : '?';
        return `${path}${sep}_ts=${Date.now()}`;
    },

    render(force = false) {
        if (!AppState.loggedInUser) return;
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        if (AppState.loggedInUser.role === 'Yönetici' || AppState.loggedInUser.role === 'Takım Lideri') {
            this._renderManagerDashboard(currentMonth, currentYear, force);
        } else {
            this._renderUserDashboard(currentMonth, currentYear, force);
        }
    },

    _setMetric(id, value) {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    },

    _renderUpcomingFollowups(items) {
        const upcomingList = document.getElementById('dashUpcomingList');
        if (!upcomingList) return;

        const safeItems = Array.isArray(items) ? items : [];
        if (!safeItems.length) {
            upcomingList.innerHTML = `<div class="no-upcoming-tasks">Önümüzdeki 7 gün için planlanmış arama yok.</div>`;
            return;
        }

        upcomingList.innerHTML = '';
        safeItems.forEach((item) => {
            const taskLike = {
                id: item.taskId,
                businessId: item.businessId || item.taskId,
                assignee: item.assignee || AppState.loggedInUser?.name || '',
                ownerId: item.ownerId || AppState.loggedInUser?.id || null,
                status: 'followup',
                sourceType: item.sourceType || '-',
                mainCategory: item.mainCategory || '',
                subCategory: item.subCategory || '',
                nextCallDate: item.nextCallDate || '',
                logs: Array.isArray(item.logs) ? item.logs : [],
                createdAt: item.createdAt || item.nextCallDate || new Date().toISOString(),
                companyName: item.businessName || 'Bilinmeyen İşletme',
                city: item.city || '-',
            };

            if (typeof window.createMinimalTaskCard === 'function') {
                upcomingList.appendChild(window.createMinimalTaskCard(taskLike));
                return;
            }

            const fallbackCard = document.createElement('button');
            fallbackCard.type = 'button';
            fallbackCard.className = 'left-border-card followup';
            fallbackCard.style.width = '100%';
            fallbackCard.style.textAlign = 'left';
            fallbackCard.onclick = () => openTaskModal(item.taskId);
            fallbackCard.innerHTML = `<div style="padding:14px 16px;">${item.businessName || 'Bilinmeyen İşletme'}</div>`;
            upcomingList.appendChild(fallbackCard);
        });
    },

    async _syncManagerKpisFromBackend() {
        const requestId = ++this._managerSummaryRequestId;
        try {
            const taskStatus = await DataService.apiRequest('/reports/task-status');
            if (requestId !== this._managerSummaryRequestId) return;

            const byStatus = Array.isArray(taskStatus?.byStatus) ? taskStatus.byStatus : [];
            const statusMap = byStatus.reduce((acc, row) => {
                const rawKey = String(row?.status || '').toUpperCase();
                const key = rawKey === 'NOT_HOT' ? 'nothot' : rawKey.toLowerCase();
                const count = Number(row?._count?.status || 0);
                if (key) acc[key] = count;
                return acc;
            }, {});

            const totalOpen = Number(taskStatus?.total || 0) - Number((taskStatus?.byGeneralStatus || []).find((row) => String(row?.generalStatus || '').toUpperCase() === 'CLOSED')?._count?.generalStatus || 0);

            const setEl = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.innerText = val;
            };

            setEl('mgrTotalActive', totalOpen);
            setEl('mgrDashNew', statusMap.new || 0);
            setEl('mgrDashHot', statusMap.hot || 0);
            setEl('mgrDashNotHot', statusMap.nothot || 0);
            setEl('mgrDashFollowup', statusMap.followup || 0);
        } catch (err) {
            console.error('Manager KPI summary load failed:', err);
        }
    },

    async _renderManagerDashboard(currentMonth, currentYear, force = false) {
        const uDash = document.getElementById('userDashboardSection');
        const mDash = document.getElementById('managerDashboardSection');
        if (uDash) uDash.style.display = 'none';
        if (mDash) mDash.style.display = 'block';

        const currentUser = AppState.loggedInUser;
        const isTeamLeader = currentUser.role === 'Takım Lideri';
        const hour = new Date().getHours();
        const greeting = hour < 12 ? '☀️ Günaydın' : (hour < 18 ? '👋 İyi Günler' : '🌙 İyi Akşamlar');
        const titleRole = isTeamLeader ? `Takım Lideri (${currentUser.team})` : 'Yönetici';

        this._setMetric('mgrHeroGreeting', `${greeting} ${titleRole}, ${currentUser.name}`);
        this._setMetric('mgrHeroDate', new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
        this._setMetric('mgrTotalActive', '...');
        this._setMetric('mgrTotalDeal', '...');
        this._setMetric('mgrDealRatio', '...');
        this._setMetric('mgrDashNew', '...');
        this._setMetric('mgrDashHot', '...');
        this._setMetric('mgrDashNotHot', '...');
        this._setMetric('mgrDashFollowup', '...');

        this._renderPerformanceGrid(currentMonth, currentYear);

        const requestId = ++this._dashboardSnapshotRequestId;
        try {
            const snapshot = await DataService.apiRequest(this._withBypass('/reports/dashboard-snapshot', force));
            if (requestId !== this._dashboardSnapshotRequestId) return;

            const manager = snapshot?.manager || {};
            this._setMetric('mgrTotalActive', Number(manager.totalOpen || 0));
            this._setMetric('mgrTotalDeal', Number(manager.monthlyDeal || 0));
            this._setMetric('mgrDealRatio', `%${Math.round(Number(manager.dealRatio || 0))}`);
            this._setMetric('mgrDashNew', Number(manager.openStatusCounts?.new || 0));
            this._setMetric('mgrDashHot', Number(manager.openStatusCounts?.hot || 0));
            this._setMetric('mgrDashNotHot', Number(manager.openStatusCounts?.nothot || 0));
            this._setMetric('mgrDashFollowup', Number(manager.openStatusCounts?.followup || 0));

            this._renderSmartFocusCarousel('mgrSmartFocusText', Array.isArray(manager.focusItems) && manager.focusItems.length
                ? manager.focusItems
                : [{ text: 'Ekibinizin tüm metrikleri normal.', action: "switchPage('page-all-tasks')", icon: '🎯' }]);

            const radarFilter = document.getElementById('mgrRadarUserFilter');
            if (radarFilter) {
                const currentVal = radarFilter.value;
                const radarUsers = Array.isArray(manager.radarUsers) ? manager.radarUsers : [];
                radarFilter.innerHTML = '<option value="">Tüm Ekip</option>';
                radarUsers.forEach((user) => {
                    radarFilter.add(new Option(user.name, user.id));
                });
                radarFilter.value = radarUsers.some((user) => user.id === currentVal) ? currentVal : '';
            }
        } catch (err) {
            console.error('Dashboard snapshot load failed, manager fallback kullanılacak:', err);
            this._renderManagerDashboardFallback(currentMonth, currentYear);
        }

        this._renderLiveFeed();
    },

    _renderManagerDashboardFallback(currentMonth, currentYear) {
        const currentUser = AppState.loggedInUser;
        const isTeamLeader = currentUser.role === 'Takım Lideri';
        const teamFilter = (isTeamLeader && currentUser.team && currentUser.team !== '-') ? currentUser.team : null;
        const taskIndex = this._getTaskDerivedIndex();
        const userTaskSummaryMap = this._getUserTaskSummaryMap();
        const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
        const inScopeUsers = this._getScopeUsers(teamFilter);
        const inScopeUserNames = inScopeUsers.map((u) => u.name);

        const allActiveCount = teamFilter
            ? inScopeUserNames.reduce((sum, userName) => sum + (userTaskSummaryMap.get(userName)?.openCount || 0), 0)
            : taskIndex.nonPoolTasks.filter((task) => isActiveTask(task.status)).length;
        this._setMetric('mgrTotalActive', allActiveCount);

        const monthlyStats = (teamFilter ? inScopeUserNames : Array.from(userTaskSummaryMap.keys())).reduce((acc, userName) => {
            const monthly = this._getMonthlySummary(userTaskSummaryMap.get(userName), monthKey);
            acc.total += monthly.total;
            acc.deal += monthly.deal;
            acc.cold += monthly.cold;
            return acc;
        }, { total: 0, deal: 0, cold: 0 });
        this._setMetric('mgrTotalDeal', monthlyStats.deal);
        const closedBase = monthlyStats.deal + monthlyStats.cold;
        this._setMetric('mgrDealRatio', `%${closedBase > 0 ? Math.round((monthlyStats.deal / closedBase) * 100) : 0}`);

        const openStatusCounts = this._getScopedOpenStatusCounts(teamFilter);
        this._setMetric('mgrDashNew', openStatusCounts.new);
        this._setMetric('mgrDashHot', openStatusCounts.hot);
        this._setMetric('mgrDashNotHot', openStatusCounts.nothot);
        this._setMetric('mgrDashFollowup', openStatusCounts.followup);

        const focusItems = [];
        const bizMap = AppState.getBizMap ? AppState.getBizMap() : {};
        const unassignedTasks = (userTaskSummaryMap.get('UNASSIGNED')?.tasks || []).filter((t) => (
            t.assignee === 'UNASSIGNED' &&
            isActiveTask(t.status) &&
            t.businessId &&
            Boolean(bizMap.get ? bizMap.get(t.businessId) : bizMap[t.businessId])
        ));
        if (!teamFilter && unassignedTasks.length > 0) {
            focusItems.push({ text: `Havuzda bekleyen ${unassignedTasks.length} aktif kayıt var.`, action: "switchPage('page-task-list')", icon: '⚡' });
        }
        if (monthlyStats.deal > 0) {
            focusItems.push({ text: `Bu ay ${monthlyStats.deal} kapanış yapıldı.`, action: "openSummaryModal('deal')", icon: '✅' });
        }
        inScopeUsers.forEach((u) => {
            const uOpen = userTaskSummaryMap.get(u.name)?.openCount || 0;
            if (uOpen > 50) focusItems.push({ text: `${u.name} üzerinde çok fazla (${uOpen}) açık görev birikmiş durumda.`, action: "switchPage('page-all-tasks')", icon: '📊' });
            if (uOpen < 5) focusItems.push({ text: `${u.name} üzerinde iş kalmadı (${uOpen} açık görev). Yeni atama yapın.`, action: isTeamLeader ? "switchPage('page-all-tasks')" : "switchPage('page-task-list')", icon: '⚡' });
        });
        this._renderSmartFocusCarousel('mgrSmartFocusText', focusItems.length ? focusItems : [{ text: 'Ekibinizin tüm metrikleri normal.', action: "switchPage('page-all-tasks')", icon: '🎯' }]);

        const radarFilter = document.getElementById('mgrRadarUserFilter');
        if (radarFilter) {
            const currentVal = radarFilter.value;
            radarFilter.innerHTML = '<option value="">Tüm Ekip</option>';
            inScopeUsers.forEach((u) => radarFilter.add(new Option(u.name, u.id)));
            radarFilter.value = inScopeUsers.some((u) => u.id === currentVal) ? currentVal : '';
        }
    },

    _renderPerformanceGridFallback(currentMonth, currentYear) {
        const currentUser = AppState.loggedInUser;
        const isTeamLeader = currentUser.role === 'Takım Lideri';
        const teamFilter = (isTeamLeader && currentUser.team && currentUser.team !== '-') ? currentUser.team : null;
        const userTaskSummaryMap = this._getUserTaskSummaryMap();
        const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

        const userStats = [];
        const scopeUsers = this._getScopeUsers(teamFilter);

        scopeUsers.forEach(u => {
            const summary = userTaskSummaryMap.get(u.name);
            const uOpen = summary?.openCount || 0;
            const monthlyStats = this._getMonthlySummary(summary, monthKey);
            userStats.push({
                key: encodeURIComponent(u.id || u.name),
                user: { id: u.id, name: u.name, team: u.team },
                metrics: {
                    daily: {
                        contacted: { count: 0, items: [] },
                    },
                    monthly: {
                        open: { count: uOpen, items: [] },
                        deal: { count: monthlyStats.deal || 0, items: [] },
                        cold: { count: monthlyStats.cold || 0, items: [] },
                        opened: { count: 0, items: [] },
                    },
                },
                dealRatio: monthlyStats.total > 0 ? Math.round(((monthlyStats.deal || 0) / monthlyStats.total) * 100) : 0,
            });
        });

        const tfEl = document.getElementById('mgrTeamFilter');
        const tFilter = (tfEl && tfEl.value) ? tfEl.value : '';
        const filteredStats = (tFilter && !teamFilter) ? userStats.filter(u => u.team === tFilter) : userStats;
        const ptGrid = document.getElementById('mgrPerformanceGrid');
        if (!ptGrid) return;

        if (typeof window.setTeamPulseRecords === 'function') {
            window.setTeamPulseRecords(filteredStats);
        }

        ptGrid.innerHTML = '';
        if (filteredStats.length === 0) {
            ptGrid.innerHTML = `<div class="no-records-dashboard">Kayıt yok.</div>`;
            return;
        }

        const sortedForMedal = [...userStats].sort((a, b) => this._getPulseMetric(b, 'deal', 'monthly') - this._getPulseMetric(a, 'deal', 'monthly') || this._getPulseMetric(b, 'open', 'monthly') - this._getPulseMetric(a, 'open', 'monthly'));
        const htmlParts = [];
        filteredStats.forEach(u => {
            const rankIndex = sortedForMedal.findIndex(x => x.key === u.key);
            let medalHtml = '';
            if (!tFilter && this._getPulseMetric(u, 'deal', 'monthly') > 0) {
                if (rankIndex === 0) medalHtml = '<span title="1. Sırada" class="medal-icon">🥇</span> ';
                if (rankIndex === 1) medalHtml = '<span title="2. Sırada" class="medal-icon">🥈</span> ';
                if (rankIndex === 2) medalHtml = '<span title="3. Sırada" class="medal-icon">🥉</span> ';
            }
            htmlParts.push(this._buildPerformanceCard(u, medalHtml));
        });
        ptGrid.innerHTML = htmlParts.join('');
    },

    async _renderPerformanceGrid(currentMonth, currentYear) {
        const ptGrid = document.getElementById('mgrPerformanceGrid');
        if (!ptGrid) return;

        const currentUser = AppState.loggedInUser || {};
        const isTeamLeader = currentUser.role === 'Takım Lideri';
        const hardTeamFilter = (isTeamLeader && currentUser.team && currentUser.team !== '-') ? currentUser.team : null;
        const tfEl = document.getElementById('mgrTeamFilter');
        const selectedTeamFilter = (tfEl && tfEl.value) ? tfEl.value : '';
        const activeTeamFilter = hardTeamFilter || selectedTeamFilter || '';
        const requestId = ++this._performanceGridRequestId;
        const cacheKey = JSON.stringify({
            team: activeTeamFilter,
            role: currentUser.role || '',
            userId: currentUser.id || '',
        });
        const cached = this._performanceGridCache.get(cacheKey);
        const now = Date.now();
        if (cached && (now - cached.at) < 30000) {
            ptGrid.innerHTML = cached.html;
            if (typeof window.setTeamPulseRecords === 'function') {
                window.setTeamPulseRecords(cached.records || []);
            }
        } else {
            ptGrid.innerHTML = `<div class="no-records-dashboard">Performans verileri yükleniyor...</div>`;
        }

        try {
            const response = await DataService.apiRequest('/reports/team-pulse');
            if (requestId !== this._performanceGridRequestId) return;

            const stats = (Array.isArray(response?.records) ? response.records : [])
                .filter((record) => record?.user?.name && (!activeTeamFilter || String(record?.user?.team || '') === activeTeamFilter));

            if (typeof window.setTeamPulseRecords === 'function') {
                window.setTeamPulseRecords(stats);
            }

            if (!stats.length) {
                ptGrid.innerHTML = `<div class="no-records-dashboard">Kayıt yok.</div>`;
                return;
            }

            const sortedForMedal = [...stats].sort((a, b) => this._getPulseMetric(b, 'deal', 'monthly') - this._getPulseMetric(a, 'deal', 'monthly') || this._getPulseMetric(b, 'open', 'monthly') - this._getPulseMetric(a, 'open', 'monthly'));
            ptGrid.innerHTML = stats.map((u) => {
                const rankIndex = sortedForMedal.findIndex((x) => x.key === u.key);
                let medalHtml = '';
                if (!activeTeamFilter && this._getPulseMetric(u, 'deal', 'monthly') > 0) {
                    if (rankIndex === 0) medalHtml = '<span title="1. Sırada" class="medal-icon">🥇</span> ';
                    if (rankIndex === 1) medalHtml = '<span title="2. Sırada" class="medal-icon">🥈</span> ';
                    if (rankIndex === 2) medalHtml = '<span title="3. Sırada" class="medal-icon">🥉</span> ';
                }
                return this._buildPerformanceCard(u, medalHtml);
            }).join('');
            this._performanceGridCache.set(cacheKey, { html: ptGrid.innerHTML, records: stats, at: now });
        } catch (err) {
            console.error('Performance grid load failed, falling back to local summary:', err);
            if (requestId !== this._performanceGridRequestId) return;
            this._renderPerformanceGridFallback(currentMonth, currentYear);
        }
    },

    async _renderLiveFeed() {
        const feed = document.getElementById('mgrLiveFeed');
        if (!feed) return;
        feed.innerHTML = `<div class="no-feed-records" style="text-align:center; padding:40px 20px; color:#94a3b8; font-weight:600; font-size:13px;">Yükleniyor...</div>`;

        const currentUser = AppState.loggedInUser || {};
        const selectedUserId = document.getElementById('mgrRadarUserFilter')?.value || '';
        const buildQuery = (mode) => {
            const query = new URLSearchParams({ mode });
            if (selectedUserId) query.set('userId', selectedUserId);
            return query.toString();
        };

        let recentLogs = [];
        try {
            let data = await DataService.apiRequest(`/reports/operations-radar?${buildQuery('today')}`);
            let groups = Array.isArray(data?.groups) ? data.groups : [];
            if (!groups.length) {
                data = await DataService.apiRequest(`/reports/operations-radar?${buildQuery('last7')}`);
                groups = Array.isArray(data?.groups) ? data.groups : [];
            }
            recentLogs = groups
                .flatMap((group) => Array.isArray(group?.events) ? group.events : [])
                .slice(0, 20);
        } catch (err) {
            console.error('Dashboard live feed load failed:', err);
            feed.innerHTML = `<div class="no-feed-records" style="text-align:center; padding:40px 20px; color:#94a3b8; font-weight:600; font-size:13px;">Canlı operasyon verisi yüklenemedi.</div>`;
            return;
        }

        if (recentLogs.length === 0) {
            feed.innerHTML = `<div class="no-feed-records" style="text-align:center; padding:40px 20px; color:#94a3b8; font-weight:600; font-size:13px;">Satış ekibine ait güncel bir hareket bulunamadı.</div>`;
            return;
        }

        const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

        let feedHtml = '';
        recentLogs.forEach((l) => {
            let shortText = String(l.text || '').replace(/<[^>]*>?/gm, '');
            if (shortText.length > 80) shortText = shortText.substring(0, 80) + '...';
            
            let icon = '•';
            let statusColor = '#94a3b8';
            
            const lowerText = shortText.toLowerCase();
            const lowerStatus = String(l.status || '').toLowerCase();
            if (lowerStatus === 'deal' || lowerText.includes('deal')) { icon = '🤝'; statusColor = '#10b981'; }
            else if (lowerStatus === 'cold' || lowerText.includes('cold') || lowerText.includes('istemiyor') || lowerText.includes('ulaşılamadı') || lowerText.includes('yetkili yok')) { icon = '❄️'; statusColor = '#3b82f6'; }
            else if (lowerStatus === 'followup' || lowerText.includes('tekrar ara') || lowerText.includes('takip')) { icon = '🕒'; statusColor = '#f59e0b'; }
            else if (lowerStatus === 'hot' || lowerText.includes('hot')) { icon = '🔥'; statusColor = '#ef4444'; }
            else if (lowerStatus === 'new') { icon = '🆕'; statusColor = '#22c55e'; }

            const timeStr = typeof timeAgo === 'function'
                ? timeAgo(new Date(l.timestamp || 0).getTime())
                : String(l.timestamp || '');
            
            // Kullanıcı adına göre avatar ve renk
            const actorName = String(l.actorName || currentUser.name || '?').trim();
            const initials = actorName.substring(0, 2).toUpperCase();
            const colorIndex = actorName.length % colors.length;
            const avatarColor = colors[colorIndex];

            feedHtml += `
            <div class="radar-feed-item" onclick="openTaskModal('${l.taskId}')">
                <div class="rfi-avatar" style="background: ${avatarColor};">${initials}</div>
                <div class="rfi-content">
                    <div class="rfi-header">
                        <span class="rfi-name">${actorName}</span>
                        <span class="rfi-time"><span class="rfi-icon" style="color:${statusColor}">${icon}</span> ${timeStr}</span>
                    </div>
                    <div class="rfi-biz">${l.businessName || 'Bilinmeyen İşletme'}</div>
                    <div class="rfi-text">${shortText}</div>
                </div>
            </div>`;
        });

        feed.innerHTML = feedHtml;
    },

    async _renderUserDashboard(currentMonth, currentYear, force = false) {
        const uDash = document.getElementById('userDashboardSection');
        const mDash = document.getElementById('managerDashboardSection');
        if (uDash) uDash.style.display = 'block';
        if (mDash) mDash.style.display = 'none';

        const hour = new Date().getHours();
        const greeting = hour < 12 ? '☀️ Günaydın' : (hour < 18 ? '👋 İyi Günler' : '🌙 İyi Akşamlar');
        this._setMetric('userHeroGreeting', `${greeting}, ${AppState.loggedInUser.name}`);
        this._setMetric('userHeroDate', new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
        this._setMetric('dashTotalTasks', '...');
        this._setMetric('dashMyDealMonthly', '...');
        this._setMetric('dashMyColdMonthly', '...');
        this._setMetric('dashNew', '...');
        this._setMetric('dashHot', '...');
        this._setMetric('dashNotHot', '...');
        this._setMetric('dashFollowup', '...');

        const requestId = ++this._dashboardSnapshotRequestId;
        try {
            const snapshot = await DataService.apiRequest(this._withBypass('/reports/dashboard-snapshot', force));
            if (requestId !== this._dashboardSnapshotRequestId) return;

            const userSnapshot = snapshot?.user || {};
            this._setMetric('dashTotalTasks', Number(userSnapshot.openTasks || 0));
            this._setMetric('dashMyDealMonthly', Number(userSnapshot.monthlyDeal || 0));
            this._setMetric('dashMyColdMonthly', Number(userSnapshot.monthlyCold || 0));
            this._setMetric('dashNew', Number(userSnapshot.openStatusCounts?.new || 0));
            this._setMetric('dashHot', Number(userSnapshot.openStatusCounts?.hot || 0));
            this._setMetric('dashNotHot', Number(userSnapshot.openStatusCounts?.nothot || 0));
            this._setMetric('dashFollowup', Number(userSnapshot.openStatusCounts?.followup || 0));
            this._renderSmartFocusCarousel('userSmartFocusText', Array.isArray(userSnapshot.focusItems) && userSnapshot.focusItems.length
                ? userSnapshot.focusItems
                : [{ text: 'Harika! Bugün için acil bir işlem görünmüyor.', action: "switchPage('page-my-tasks')", icon: '🎉' }]);
            this._renderUpcomingFollowups(userSnapshot.upcomingFollowups || []);
        } catch (err) {
            console.error('Dashboard snapshot load failed, user fallback kullanılacak:', err);
            this._renderUserDashboardFallback(currentMonth, currentYear);
        }
    },

    _renderUserDashboardFallback(currentMonth, currentYear) {
        const userTaskSummaryMap = this._getUserTaskSummaryMap();
        const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
        const mySummary = userTaskSummaryMap.get(AppState.loggedInUser.name) || { tasks: [], openCount: 0, monthlyStats: {} };
        const myTasks = mySummary.tasks;
        const openTasksCount = mySummary.openCount;
        this._setMetric('dashTotalTasks', openTasksCount);

        const myMonthlyStats = this._getMonthlySummary(mySummary, monthKey);
        this._setMetric('dashMyDealMonthly', myMonthlyStats.deal);
        this._setMetric('dashMyColdMonthly', myMonthlyStats.cold);

        const counts = { new: 0, hot: 0, nothot: 0, followup: 0 };
        myTasks.forEach((task) => { if (counts[task.status] !== undefined) counts[task.status] += 1; });
        this._setMetric('dashNew', counts.new);
        this._setMetric('dashHot', counts.hot);
        this._setMetric('dashNotHot', counts.nothot);
        this._setMetric('dashFollowup', counts.followup);

        const nowTime = Date.now();
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
        const delayedTasks = myTasks.filter((task) => {
            if (task.status === 'cold' || task.status === 'deal') return false;
            const lastTime = (task.logs && task.logs.length > 0) ? parseLogDate(task.logs[0].date) : new Date(task.createdAt).getTime();
            return (lastTime > 0 && (nowTime - lastTime) > threeDaysMs);
        });

        const focusToday = new Date(); focusToday.setHours(0, 0, 0, 0);
        const focusTomorrow = new Date(focusToday); focusTomorrow.setDate(focusTomorrow.getDate() + 1);
        const dueFollowupCalls = myTasks.filter((task) => {
            if (task.status !== 'followup' || !task.nextCallDate) return false;
            const nextCallTime = new Date(task.nextCallDate);
            return !Number.isNaN(nextCallTime.getTime()) && nextCallTime < focusTomorrow;
        }).length;

        const focusItems = [];
        if (dueFollowupCalls > 0) {
            focusItems.push({ text: `Bugün gerçekleştirmeniz gereken planlanmış ${dueFollowupCalls} aramanız (followup) bulunuyor.`, action: "switchPage('page-my-tasks')", icon: '📅' });
        } else if (delayedTasks.length > 0) {
            focusItems.push({ text: `Dikkat: Üzerinde 3 günden uzun süredir işlem yapmadığınız ${delayedTasks.length} görev var!`, action: "switchPage('page-my-tasks')", icon: '⚠️' });
        } else if (openTasksCount > 0) {
            focusItems.push({ text: `Üzerinizde aktif olarak bekleyen toplam ${openTasksCount} açık görev bulunuyor.`, action: "switchPage('page-my-tasks')", icon: '📋' });
        } else {
            focusItems.push({ text: 'Harika! Bugün için acil bir işlem görünmüyor.', action: "switchPage('page-my-tasks')", icon: '🎉' });
        }
        this._renderSmartFocusCarousel('userSmartFocusText', focusItems);

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const nextWeek = new Date(today); nextWeek.setDate(nextWeek.getDate() + 7);
        const upcomingTasks = myTasks
            .filter((task) => task.status === 'followup' && task.nextCallDate && new Date(task.nextCallDate) >= today && new Date(task.nextCallDate) <= nextWeek)
            .sort((a, b) => new Date(a.nextCallDate) - new Date(b.nextCallDate))
            .map((task) => ({
                taskId: task.id,
                businessId: task.businessId,
                ownerId: task.ownerId || null,
                assignee: task.assignee || '',
                sourceType: task.sourceType || '',
                mainCategory: task.mainCategory || '',
                subCategory: task.subCategory || '',
                logs: Array.isArray(task.logs) ? task.logs : [],
                createdAt: task.createdAt || '',
                businessName: (AppState.getBizMap().get(task.businessId) || task).companyName || 'Bilinmeyen İşletme',
                city: (AppState.getBizMap().get(task.businessId) || task).city || '-',
                nextCallDate: task.nextCallDate,
            }));
        this._renderUpcomingFollowups(upcomingTasks);
    },

    _renderSmartFocusCarousel(elementId, focusItems) {
        const container = document.getElementById(elementId);
        if (!container || focusItems.length === 0) return;

        // Eğer sadece bir item varsa carousel yapma
        if (focusItems.length === 1) {
            container.innerHTML = `<div class="smart-focus-item" onclick="${focusItems[0].action}">${focusItems[0].icon} ${focusItems[0].text}</div>`;
            return;
        }

        // Carousel HTML oluştur
        const itemsHtml = focusItems.map(item => 
            `<div class="smart-focus-item" onclick="${item.action}">${item.icon} ${item.text}</div>`
        ).join('');

        container.innerHTML = `
            <div class="smart-focus-carousel">
                <div class="smart-focus-track" id="${elementId}-track">
                    ${itemsHtml}
                </div>
            </div>
        `;

        // Carousel animasyonu başlat
        this._startCarouselAnimation(elementId, focusItems.length);
    },

    async _loadDashboardModalRows(type) {
        const params = new URLSearchParams();
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        if (type === 'active') {
            params.set('generalStatus', 'OPEN');
        } else if (type === 'deal' || type === 'cold') {
            params.set('status', type);
            params.set('from', monthStart.toISOString());
            params.set('to', now.toISOString());
        } else if (type === 'my-deal' || type === 'my-cold') {
            params.set('status', type === 'my-deal' ? 'deal' : 'cold');
            params.set('ownerId', AppState.loggedInUser?.id || '');
            params.set('from', monthStart.toISOString());
            params.set('to', now.toISOString());
        } else if (type === 'today-deal' || type === 'today-cold') {
            params.set('status', type === 'today-deal' ? 'deal' : 'cold');
            params.set('from', todayStart.toISOString());
            params.set('to', todayEnd.toISOString());
        }

        return DataService.apiRequest(`/reports/tasks?${params.toString()}`);
    },

    _renderSummaryModalRows(rows) {
        return rows.map((row) => {
            const taskId = this._escapeHtml(row?.id || '');
            const ownerRef = this._escapeHtml(row?.ownerId || row?.assignee || '');
            const businessName = this._escapeHtml(row?.businessName || 'Bilinmeyen');
            const assignee = this._escapeHtml(row?.assignee || 'Atanmamış');
            return `
                <div class="summary-list-item" onclick="closeModal('summaryModal'); openTaskModal('${taskId}')">
                    <span class="summary-title" title="${businessName}">${businessName}</span>
                    <span class="summary-assignee clickable-badge" onclick="event.stopPropagation(); openUserProfileModal('${ownerRef}')">👤 ${assignee}</span>
                </div>
            `;
        }).join('');
    },

    _renderTodayModalRows(rows) {
        return rows.map((row) => {
            const taskId = this._escapeHtml(row?.id || '');
            const businessName = this._escapeHtml(row?.businessName || 'Bilinmeyen');
            const city = this._escapeHtml(row?.city || '-');
            const assignee = this._escapeHtml(row?.assignee || 'Atanmamış');
            return `
                <div style="padding:12px 15px; background:#f8f9fa; border:1px solid var(--border-light); border-radius:8px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="closeModal('todayTasksModal'); openTaskModal('${taskId}')">
                    <div>
                        <strong style="color:var(--secondary-color); display:block; font-size:14px;">${businessName}</strong>
                        <span style="font-size:11px; color:#888;">📍 ${city}</span>
                    </div>
                    <span style="color:var(--primary-color); font-weight:600; font-size:12px;">👤 ${assignee}</span>
                </div>
            `;
        }).join('');
    },

    _startCarouselAnimation(elementId, itemCount) {
        const track = document.getElementById(`${elementId}-track`);
        if (!track || itemCount <= 1) return;

        let currentIndex = 0;
        
        // Önceki interval'i temizle
        if (this._carouselInterval) {
            clearInterval(this._carouselInterval);
        }

        // Yeni interval başlat
        this._carouselInterval = setInterval(() => {
            currentIndex = (currentIndex + 1) % itemCount;
            const translateY = -currentIndex * 44; // 44px = item height
            track.style.transform = `translateY(${translateY}px)`;
        }, 3500); // Her 3.5 saniyede bir
    },

    async openSummaryModal(type) {
        const titles = {
            active: 'Tüm Açık Tasklar',
            deal: 'Bu Ayki Deal Görevler',
            cold: 'Bu Ayki Cold Görevler',
            'my-deal': 'Bu Ayki Deal İşlemleri',
            'my-cold': 'Bu Ayki Cold İşlemleri',
        };
        const st = document.getElementById('summaryModalTitle');
        const sl = document.getElementById('summaryModalList');
        const sm = document.getElementById('summaryModal');
        if (st) st.innerText = titles[type] || 'Görev Özeti';
        if (sl) sl.innerHTML = "<div style='color:var(--text-muted); font-size:13px;'>Veriler yükleniyor...</div>";
        if (sm) sm.style.display = 'flex';

        try {
            const rows = this._normalizeDashboardRows(await this._loadDashboardModalRows(type));
            if (!sl) return;
            if (!rows.length) {
                sl.innerHTML = "<div style='color:var(--text-muted); font-size:13px;'>Görev bulunamadı.</div>";
                return;
            }
            sl.innerHTML = this._renderSummaryModalRows(rows);
        } catch (err) {
            console.error('Dashboard summary modal load failed:', err);
            if (sl) sl.innerHTML = "<div style='color:var(--danger-color); font-size:13px;'>Liste yüklenemedi.</div>";
        }
    },

    async openTodayTasksModal(type) {
        const mt = document.getElementById('todayTasksModalTitle');
        if (mt) mt.innerHTML = type === 'deal' ? '✅ Bugün Deal Olanlar' : '❄️ Bugün Cold Olanlar';
        const list = document.getElementById('todayTasksModalList');
        if (!list) return;
        list.innerHTML = `<div class="no-tasks-today">Veriler yükleniyor...</div>`;
        const tm = document.getElementById('todayTasksModal');
        if (tm) tm.style.display = 'flex';

        try {
            const rows = this._normalizeDashboardRows(await this._loadDashboardModalRows(type === 'deal' ? 'today-deal' : 'today-cold'));
            if (!rows.length) {
                list.innerHTML = `<div class="no-tasks-today">Bugün için kayıt yok.</div>`;
                return;
            }
            list.innerHTML = this._renderTodayModalRows(rows);
        } catch (err) {
            console.error('Today tasks modal load failed:', err);
            list.innerHTML = `<div class="no-tasks-today">Liste yüklenemedi.</div>`;
        }
    }
};

// window bindings (HTML onclick uyumluluğu)
window.renderDashboard = DashboardController.render.bind(DashboardController);
window.openSummaryModal = DashboardController.openSummaryModal.bind(DashboardController);
window.openTodayTasksModal = DashboardController.openTodayTasksModal.bind(DashboardController);
window.refreshLiveFeed = () => { if (DashboardController && DashboardController._renderLiveFeed) DashboardController._renderLiveFeed(); };
window.goToAllTasks = function(status) {
    switchPage('page-all-tasks');
    if (typeof resetAllTasksFilters === 'function') resetAllTasksFilters();
    document.querySelectorAll('.all-status-filter').forEach(cb => { cb.checked = Boolean(status) && cb.value === status; });
    AppState.setPage('allTasks', 1);
    renderAllTasks();
};
window.goToMyTasks = function(status) {
    document.querySelectorAll('.my-status-filter').forEach(cb => { cb.checked = (cb.value === status); });
    switchPage('page-my-tasks');
};
