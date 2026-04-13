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

    _getMonthlySummary(summary, monthKey) {
        return summary?.monthlyStats?.[monthKey] || { total: 0, deal: 0, cold: 0 };
    },

    _getScopedOpenStatusCounts(teamFilter = null) {
        return { new: 0, hot: 0, nothot: 0, followup: 0 };
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

    _getMonthlyStatsForTasks() { return { total: 0, deal: 0, cold: 0 }; },

    _getPulseMetric(record, metricKey, period = 'monthly') {
        return Number(record?.metrics?.[period]?.[metricKey]?.count || 0);
    },

    _buildPerformanceCard(record, medalHtml = '') {
        const openCount = this._getPulseMetric(record, 'open', 'monthly');
        const dealCount = this._getPulseMetric(record, 'deal', 'monthly');
        const coldCount = this._getPulseMetric(record, 'cold', 'monthly');
        const dealRatio = Math.max(0, Math.min(100, Math.round(Number(record?.dealRatio || 0))));
        
        // SVG Ring calculation (Radius = 26, Circumference = ~163.36) for smaller visual footprint
        const circumference = 163.36;
        const dashOffset = circumference - (circumference * dealRatio) / 100;
        const progressStroke = dealRatio === 0 ? "transparent" : "#0f766e";
        
        const userKey = record?.key || '';
        const safeName = record?.user?.name || '-';
        const safeTeam = record?.user?.team || '-';

        return `
            <div class="perf-card-micro" onclick="openTeamPulseModal('${userKey}', 'open')">
                <div class="pcm-header">
                    <div class="pcm-info">
                        <div class="pcm-name">${safeName}</div>
                        <div class="pcm-team">${safeTeam}</div>
                    </div>
                    <div class="pcm-ring-wrap">
                        <svg width="60" height="60" viewBox="0 0 60 60" class="pcm-ring-svg">
                            <circle cx="30" cy="30" r="26" fill="none" stroke="#f1f5f9" stroke-width="4" />
                            <circle cx="30" cy="30" r="26" fill="none" stroke="${progressStroke}" stroke-width="4" stroke-linecap="round"
                                stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}" transform="rotate(-90 30 30)" />
                        </svg>
                        <div class="pcm-ring-val">${dealRatio}<span class="pcm-ring-pct">%</span></div>
                    </div>
                </div>
                
                <div class="pcm-stats">
                    <button type="button" class="pcm-stat-btn" onclick="event.stopPropagation(); openTeamPulseModal('${userKey}', 'open')">
                        <span class="pcm-stat-lbl">Açık</span>
                        <strong class="pcm-stat-val">${openCount}</strong>
                    </button>
                    <button type="button" class="pcm-stat-btn" onclick="event.stopPropagation(); openTeamPulseModal('${userKey}', 'deal')">
                        <span class="pcm-stat-lbl">Deal</span>
                        <strong class="pcm-stat-val is-deal">${dealCount}</strong>
                    </button>
                    <button type="button" class="pcm-stat-btn" onclick="event.stopPropagation(); openTeamPulseModal('${userKey}', 'cold')">
                        <span class="pcm-stat-lbl">Cold</span>
                        <strong class="pcm-stat-val is-cold">${coldCount}</strong>
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

    _renderMetricLoadError(metricIds = []) {
        metricIds.forEach((id) => this._setMetric(id, '-'));
    },

    render(force = false, options = {}) {
        if (!AppState.loggedInUser) return;
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        if (AppState.loggedInUser.role === 'Yönetici' || AppState.loggedInUser.role === 'Takım Lideri') {
            this._renderManagerDashboard(currentMonth, currentYear, force, options);
        } else {
            this._renderUserDashboard(currentMonth, currentYear, force, options);
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

    async _renderManagerDashboard(currentMonth, currentYear, force = false, options = {}) {
        const uDash = document.getElementById('userDashboardSection');
        const mDash = document.getElementById('managerDashboardSection');
        if (uDash) uDash.style.display = 'none';
        if (mDash) mDash.style.display = 'block';

        const currentUser = AppState.loggedInUser;
        const isTeamLeader = currentUser.role === 'Takım Lideri';
        const hour = new Date().getHours();
        const greeting = hour < 12 ? '☀️ Günaydın' : (hour < 18 ? '👋 İyi Günler' : '🌙 İyi Akşamlar');
        const titleRole = isTeamLeader ? `Takım Lideri (${currentUser.team})` : 'Yönetici';

        if (!options.silent) {
            this._setMetric('mgrHeroGreeting', `${greeting} ${titleRole}, ${currentUser.name}`);
            this._setMetric('mgrHeroDate', new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
            this._setMetric('mgrTotalActive', '...');
            this._setMetric('mgrTotalDeal', '...');
            this._setMetric('mgrTotalCold', '...');
            this._setMetric('mgrDealRatio', '...');
            this._setMetric('mgrDashNew', '...');
            this._setMetric('mgrDashHot', '...');
            this._setMetric('mgrDashNotHot', '...');
            this._setMetric('mgrDashFollowup', '...');
        }

        this._renderPerformanceGrid(currentMonth, currentYear, force, options);

        const requestId = ++this._dashboardSnapshotRequestId;
        try {
            const snapshot = await DataService.apiRequest(this._withBypass('/reports/dashboard-snapshot', force));
            if (requestId !== this._dashboardSnapshotRequestId) return;

            const manager = snapshot?.manager || {};
            this._setMetric('mgrTotalActive', Number(manager.totalOpen || 0));
            this._setMetric('mgrTotalDeal', Number(manager.monthlyDeal || 0));
            this._setMetric('mgrTotalCold', Number(manager.monthlyCold || 0));
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
            console.error('Dashboard snapshot load failed:', err);
            this._renderMetricLoadError([
                'mgrTotalActive',
                'mgrTotalDeal',
                'mgrTotalCold',
                'mgrDealRatio',
                'mgrDashNew',
                'mgrDashHot',
                'mgrDashNotHot',
                'mgrDashFollowup',
            ]);
            this._renderSmartFocusCarousel('mgrSmartFocusText', [
                { text: 'Yönetici özet verileri şu anda yüklenemedi.', action: "switchPage('page-dashboard')", icon: '⚠️' },
            ]);
        }

        this._renderLiveFeed(options);
    },

    _renderManagerDashboardFallback(currentMonth, currentYear) {
        this._renderMetricLoadError([
            'mgrTotalActive',
            'mgrTotalDeal',
            'mgrTotalCold',
            'mgrDealRatio',
            'mgrDashNew',
            'mgrDashHot',
            'mgrDashNotHot',
            'mgrDashFollowup',
        ]);
    },

    _renderPerformanceGridFallback(currentMonth, currentYear) {
        const ptGrid = document.getElementById('mgrPerformanceGrid');
        if (!ptGrid) return;
        ptGrid.innerHTML = `<div class="no-records-dashboard">Performans verileri yüklenemedi.</div>`;
        if (typeof window.setTeamPulseRecords === 'function') {
            window.setTeamPulseRecords([]);
        }
    },

    async _renderPerformanceGrid(currentMonth, currentYear, force = false, options = {}) {
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
            return;
        } else if (!options.silent) {
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
            console.error('Performance grid load failed:', err);
            if (requestId !== this._performanceGridRequestId) return;
            ptGrid.innerHTML = `<div class="no-records-dashboard">Performans verileri yüklenemedi.</div>`;
            if (typeof window.setTeamPulseRecords === 'function') {
                window.setTeamPulseRecords([]);
            }
        }
    },

    async _renderLiveFeed(options = {}) {
        const feed = document.getElementById('mgrLiveFeed');
        if (!feed) return;
        if (!options.silent) {
            feed.innerHTML = `<div class="no-feed-records" style="text-align:center; padding:40px 20px; color:#94a3b8; font-weight:600; font-size:13px;">Yükleniyor...</div>`;
        }

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

    async _renderUserDashboard(currentMonth, currentYear, force = false, options = {}) {
        const uDash = document.getElementById('userDashboardSection');
        const mDash = document.getElementById('managerDashboardSection');
        if (uDash) uDash.style.display = 'block';
        if (mDash) mDash.style.display = 'none';

        const hour = new Date().getHours();
        const greeting = hour < 12 ? '☀️ Günaydın' : (hour < 18 ? '👋 İyi Günler' : '🌙 İyi Akşamlar');
        
        if (!options.silent) {
            this._setMetric('userHeroGreeting', `${greeting}, ${AppState.loggedInUser.name}`);
            this._setMetric('userHeroDate', new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
            this._setMetric('dashTotalTasks', '...');
            this._setMetric('dashMyDealMonthly', '...');
            this._setMetric('dashMyColdMonthly', '...');
            this._setMetric('dashNew', '...');
            this._setMetric('dashHot', '...');
            this._setMetric('dashNotHot', '...');
            this._setMetric('dashFollowup', '...');
        }

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
            console.error('Dashboard snapshot load failed:', err);
            this._renderMetricLoadError([
                'dashTotalTasks',
                'dashMyDealMonthly',
                'dashMyColdMonthly',
                'dashNew',
                'dashHot',
                'dashNotHot',
                'dashFollowup',
            ]);
            this._renderSmartFocusCarousel('userSmartFocusText', [
                { text: 'Gösterge paneli verileri şu anda yüklenemedi.', action: "switchPage('page-my-tasks')", icon: '⚠️' },
            ]);
            this._renderUpcomingFollowups([]);
        }
    },

    _renderUserDashboardFallback(currentMonth, currentYear) {
        this._renderMetricLoadError([
            'dashTotalTasks',
            'dashMyDealMonthly',
            'dashMyColdMonthly',
            'dashNew',
            'dashHot',
            'dashNotHot',
            'dashFollowup',
        ]);
        this._renderSmartFocusCarousel('userSmartFocusText', [
            { text: 'Gösterge paneli verileri şu anda yüklenemedi.', action: "switchPage('page-my-tasks')", icon: '⚠️' },
        ]);
        this._renderUpcomingFollowups([]);
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

    _getSummaryModalOwnerLabel(row) {
        return String(row?.ownerName || row?.assignee || row?.createdByName || '').trim();
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

    _currentSummaryRows: [],

    _getSummaryModalOwnerKey(row) {
        return String(row?.ownerId || row?.assignee || row?.createdByName || '').trim();
    },

    filterSummaryModal() {
        const filterEl = document.getElementById('summaryUserFilter');
        const listEl = document.getElementById('summaryModalList');
        if (!filterEl || !listEl) return;
        const selectedId = filterEl.value;
        const filtered = selectedId
            ? this._currentSummaryRows.filter(r => this._getSummaryModalOwnerKey(r) === selectedId)
            : this._currentSummaryRows;
        
        if (!filtered.length) {
            listEl.innerHTML = "<div style='color:var(--text-muted); font-size:13px;'>Seçili kullanıcıya ait görev bulunamadı.</div>";
            return;
        }
        listEl.innerHTML = this._renderSummaryModalRows(filtered);
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
        const uf = document.getElementById('summaryUserFilter');
        
        if (st) st.innerText = titles[type] || 'Görev Özeti';
        if (sl) sl.innerHTML = "<div style='color:var(--text-muted); font-size:13px;'>Veriler yükleniyor...</div>";
        if (uf) {
            uf.style.display = 'none';
            uf.innerHTML = '<option value="">Tüm Ekip</option>';
            uf.value = '';
        }
        if (sm) sm.style.display = 'flex';

        try {
            const rows = this._normalizeDashboardRows(await this._loadDashboardModalRows(type));
            this._currentSummaryRows = rows || [];
            if (!sl) return;
            if (!rows.length) {
                sl.innerHTML = "<div style='color:var(--text-muted); font-size:13px;'>Görev bulunamadı.</div>";
                return;
            }
            
            if (uf && (type === 'deal' || type === 'cold' || type === 'active') && AppState.loggedInUser?.role !== 'Satış Temsilcisi') {
                const usersMap = new Map();
                rows.forEach(r => {
                    const ownerId = this._getSummaryModalOwnerKey(r);
                    const ownerLabel = this._getSummaryModalOwnerLabel(r);
                    if (ownerId && ownerLabel) {
                        usersMap.set(ownerId, ownerLabel);
                    }
                });
                if (usersMap.size > 0) {
                    Array.from(usersMap.entries())
                        .sort((a,b) => a[1].localeCompare(b[1], 'tr'))
                        .forEach(([id, name]) => {
                            uf.add(new Option(name, id));
                        });
                    uf.style.display = 'block';
                }
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
window.filterSummaryModal = DashboardController.filterSummaryModal.bind(DashboardController);
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
