// ==========================================
// DASHBOARD CONTROLLER
// ==========================================
const DashboardController = {
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

    render() {
        if (!AppState.loggedInUser) return;
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        if (AppState.loggedInUser.role === 'Yönetici' || AppState.loggedInUser.role === 'Takım Lideri') {
            this._renderManagerDashboard(currentMonth, currentYear);
        } else {
            this._renderUserDashboard(currentMonth, currentYear);
        }
    },

    _renderManagerDashboard(currentMonth, currentYear) {
        const uDash = document.getElementById('userDashboardSection');
        const mDash = document.getElementById('managerDashboardSection');
        if (uDash) uDash.style.display = 'none';
        if (mDash) mDash.style.display = 'block';

        const currentUser = AppState.loggedInUser;
        const isTeamLeader = currentUser.role === 'Takım Lideri';
        const teamFilter = (isTeamLeader && currentUser.team && currentUser.team !== '-') ? currentUser.team : null;
        const taskIndex = this._getTaskDerivedIndex();
        const userTaskSummaryMap = this._getUserTaskSummaryMap();
        const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

        // Takım filtrelemesi olan personelleri getir
        const _getUsersInScope = () => this._getScopeUsers(teamFilter);

        const inScopeUsers = _getUsersInScope();
        const inScopeUserNames = inScopeUsers.map(u => u.name);

        // Selamlama
        const hour = new Date().getHours();
        const greeting = hour < 12 ? '☀️ Günaydın' : (hour < 18 ? '👋 İyi Günler' : '🌙 İyi Akşamlar');
        const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
        const titleRole = isTeamLeader ? `Takım Lideri (${currentUser.team})` : `Yönetici`;
        setEl('mgrHeroGreeting', `${greeting} ${titleRole}, ${currentUser.name}`);
        setEl('mgrHeroDate', new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));

        // Aktif görev sayısı
        const allActiveCount = teamFilter
            ? inScopeUserNames.reduce((sum, userName) => sum + (userTaskSummaryMap.get(userName)?.openCount || 0), 0)
            : taskIndex.nonPoolTasks.filter((task) => isActiveTask(task.status)).length;
        setEl('mgrTotalActive', allActiveCount);

        // Aylık deal istatistikleri
        const monthlyStats = (teamFilter ? inScopeUserNames : Array.from(userTaskSummaryMap.keys())).reduce((acc, userName) => {
            const monthly = this._getMonthlySummary(userTaskSummaryMap.get(userName), monthKey);
            acc.total += monthly.total;
            acc.deal += monthly.deal;
            acc.cold += monthly.cold;
            return acc;
        }, { total: 0, deal: 0, cold: 0 });
        setEl('mgrTotalDeal', monthlyStats.deal);
        const dealRatio = monthlyStats.total > 0 ? Math.round((monthlyStats.deal / monthlyStats.total) * 100) : 0;
        setEl('mgrDealRatio', `%${dealRatio}`);

        const openStatusCounts = this._getScopedOpenStatusCounts(teamFilter);
        setEl('mgrDashNew', openStatusCounts.new);
        setEl('mgrDashHot', openStatusCounts.hot);
        setEl('mgrDashNotHot', openStatusCounts.nothot);
        setEl('mgrDashFollowup', openStatusCounts.followup);

        // Performans kartları
        this._renderPerformanceGrid(currentMonth, currentYear);

        // --- AKILLI ODAK (MANAGER) ---
        const bizMap = AppState.getBizMap ? AppState.getBizMap() : {};
        const unassignedTasks = (userTaskSummaryMap.get('UNASSIGNED')?.tasks || []).filter((t) => (
            t.assignee === 'UNASSIGNED' &&
            isActiveTask(t.status) &&
            t.businessId &&
            Boolean(bizMap.get ? bizMap.get(t.businessId) : bizMap[t.businessId])
        ));
        let focusItems = [];
        
        if (!teamFilter && unassignedTasks.length > 0) {
            focusItems.push({ 
                text: `Havuzda bekleyen ${unassignedTasks.length} aktif kayıt var.`, 
                action: "switchPage('page-task-list')", 
                icon: "⚡" 
            });
        }
        if (monthlyStats.deal > 0) {
            focusItems.push({ 
                text: `Bu ay ${monthlyStats.deal} kapanış yapıldı.`, 
                action: "openSummaryModal('deal')", 
                icon: "✅" 
            });
        }
        
        inScopeUsers.forEach(u => {
            const uOpen = userTaskSummaryMap.get(u.name)?.openCount || 0;
            if (uOpen > 50) {
                focusItems.push({
                    text: `${u.name} üzerinde çok fazla (${uOpen}) açık görev birikmiş durumda.`,
                    action: "switchPage('page-all-tasks')",
                    icon: "📊"
                });
            }
            if (uOpen < 5) {
                focusItems.push({
                    text: `${u.name} üzerinde iş kalmadı (${uOpen} açık görev). Yeni atama yapın.`,
                    action: isTeamLeader ? "switchPage('page-all-tasks')" : "switchPage('page-task-list')",
                    icon: "⚡"
                });
            }
        });

        if (focusItems.length === 0) {
            focusItems.push({ 
                text: "Ekibinizin tüm metrikleri normal.", 
                action: "switchPage('page-all-tasks')", 
                icon: "🎯" 
            });
        }

        // Carousel render et
        this._renderSmartFocusCarousel('mgrSmartFocusText', focusItems);

        // Radar filtrelerini doldur
        const radarFilter = document.getElementById('mgrRadarUserFilter');
        if (radarFilter) {
            const currentVal = radarFilter.value;
            radarFilter.innerHTML = '<option value="">Tüm Ekip</option>';
            inScopeUsers.forEach(u => {
                radarFilter.add(new Option(u.name, u.name));
            });
            
            // Eğer seçili değer yeni filtrede yoksa sıfırla
            if(currentVal && inScopeUsers.some(u => u.name === currentVal)) {
                radarFilter.value = currentVal;
            } else {
                radarFilter.value = '';
            }
        }

        // Canlı akış
        this._renderLiveFeed();
    },

    _renderPerformanceGrid(currentMonth, currentYear) {
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
            const uDeal = monthlyStats.deal;
            const uCold = monthlyStats.cold;
            const uTotal = monthlyStats.total;
            const uRatio = uTotal > 0 ? Math.round((uDeal / uTotal) * 100) : 0;
            userStats.push({ name: u.name, team: u.team, open: uOpen, deal: uDeal, cold: uCold, ratio: uRatio });
        });

        const tfEl = document.getElementById('mgrTeamFilter');
        const tFilter = (tfEl && tfEl.value) ? tfEl.value : '';
        const filteredStats = (tFilter && !teamFilter) ? userStats.filter(u => u.team === tFilter) : userStats;
        const ptGrid = document.getElementById('mgrPerformanceGrid');
        if (!ptGrid) return;

        ptGrid.innerHTML = '';
        if (filteredStats.length === 0) {
            ptGrid.innerHTML = `<div class="no-records-dashboard">Kayıt yok.</div>`;
            return;
        }

        const sortedForMedal = [...userStats].sort((a, b) => b.ratio - a.ratio || b.deal - a.deal);
        const htmlParts = [];
        filteredStats.forEach(u => {
            const deg = (u.ratio / 100) * 360;
            const rankIndex = sortedForMedal.findIndex(x => x.name === u.name);
            let medalHtml = '';
            if (!tFilter && u.deal > 0) {
                if (rankIndex === 0) medalHtml = '<span title="1. Sırada" class="medal-icon">🥇</span> ';
                if (rankIndex === 1) medalHtml = '<span title="2. Sırada" class="medal-icon">🥈</span> ';
                if (rankIndex === 2) medalHtml = '<span title="3. Sırada" class="medal-icon">🥉</span> ';
            }
            htmlParts.push(`<div class="perf-card" onclick="openUserProfileModal('${u.name}')"><div class="perf-card-header"><div>${medalHtml}<strong style="color:var(--secondary-color); font-size:14px;">${u.name}</strong></div><span class="perf-team-badge">${u.team || '-'}</span></div><div class="perf-ring-container"><div class="perf-ring" style="background: conic-gradient(var(--success-color) ${deg}deg, #e2e8f0 0deg);"><div class="perf-ring-inner"><span style="font-size:20px; font-weight:bold; color:var(--secondary-color);">${u.ratio}%</span><span style="font-size:10px; color:#888;">Deal</span></div></div></div><div class="perf-stats"><div class="p-stat"><span>Açık</span><strong>${u.open}</strong></div><div class="p-stat"><span>Deal</span><strong style="color:var(--success-color)">${u.deal}</strong></div><div class="p-stat"><span>Cold</span><strong style="color:var(--danger-color)">${u.cold}</strong></div></div></div>`);
        });
        ptGrid.innerHTML = htmlParts.join('');
    },

    _renderLiveFeed() {
        const feed = document.getElementById('mgrLiveFeed');
        if (!feed) return;
        feed.innerHTML = '';

        const userFilter = document.getElementById('mgrRadarUserFilter')?.value || '';
        const bizMap = typeof AppState.getBizMap === 'function' ? AppState.getBizMap() : new Map();
        
        const currentUser = AppState.loggedInUser;
        const isTeamLeader = currentUser.role === 'Takım Lideri';
        const teamFilter = (isTeamLeader && currentUser.team && currentUser.team !== '-') ? currentUser.team : null;
        const allowedRadarUsers = this._getScopeUsers(teamFilter);
        const allowedRadarUserNames = new Set(allowedRadarUsers.map((user) => user.name));
        
        let inScopeUserNames = [];
        if (teamFilter) {
            inScopeUserNames = allowedRadarUsers.map(u => u.name);
        }

        let allLogs = [];
        const resolveEventTime = (rawDate, fallbackDate = '') => {
            const parsed = rawDate ? parseLogDate(rawDate) : 0;
            if (Number.isFinite(parsed) && parsed > 0) return parsed;
            const fallbackMs = fallbackDate ? new Date(fallbackDate).getTime() : 0;
            if (Number.isFinite(fallbackMs) && fallbackMs > 0) return fallbackMs;
            return 0;
        };
        const resolveRadarActor = (logUser, assignee) => {
            const rawUser = String(logUser || '').trim();
            if (!rawUser) return String(assignee || '').trim();
            const lower = rawUser.toLocaleLowerCase('tr-TR');
            if (lower === 'sistem' || lower.includes('sistem')) {
                return String(assignee || '').trim() || rawUser;
            }
            return rawUser;
        };
        const buildFallbackText = (task) => {
            const label = (typeof TASK_STATUS_LABELS !== 'undefined' && TASK_STATUS_LABELS[task?.status])
                ? TASK_STATUS_LABELS[task.status]
                : (task?.status || 'İşlem');
            if (task?.details) return `[${label}] ${String(task.details).trim()}`;
            return `[${label}] ${task?.assignee || 'Atanmamış'} üzerinde güncel görev hareketi`;
        };

        // Görev Loglarını topla (Sadece satış personeli odaklı)
        const recentTasks = [...AppState.tasks].sort((a, b) => {
            const dA = resolveEventTime(a.logs?.[0]?.date, a.createdAt);
            const dB = resolveEventTime(b.logs?.[0]?.date, b.createdAt);
            return dB - dA;
        }).slice(0, 200); // Tarama havuzu

        recentTasks.forEach(t => {
            // Eğer Takım Lideriyse ve görev personeli bu takımda değilse logu gösterme
            if (teamFilter && !inScopeUserNames.includes(t.assignee)) return;
            
            const biz = bizMap.get(t.businessId) || {};
            const taskLogs = Array.isArray(t.logs) ? t.logs : [];

            if (taskLogs.length > 0) {
                taskLogs.forEach(l => {
                    const text = String(l?.text || '');
                    if (text.includes('[Geçmiş Kayıt]')) return;

                    const effectiveUser = resolveRadarActor(l?.user || l?.author?.name, t.assignee);
                    if (!effectiveUser) return;
                    if (!allowedRadarUserNames.has(effectiveUser)) return;
                    if (!userFilter || effectiveUser === userFilter) {
                        if (teamFilter && !inScopeUserNames.includes(effectiveUser)) return;

                        allLogs.push({
                            time: resolveEventTime(l?.date, t.createdAt),
                            dateStr: l?.date || t.createdAt || '',
                            user: effectiveUser,
                            bizName: biz.companyName || 'Bilinmeyen İşletme',
                            text: text || buildFallbackText(t),
                            tId: t.id
                        });
                    }
                });
            } else {
                const effectiveUser = resolveRadarActor('', t.assignee);
                if (!effectiveUser) return;
                if (!allowedRadarUserNames.has(effectiveUser)) return;
                if (userFilter && effectiveUser !== userFilter) return;
                if (teamFilter && !inScopeUserNames.includes(effectiveUser)) return;

                allLogs.push({
                    time: resolveEventTime('', t.createdAt),
                    dateStr: t.createdAt || '',
                    user: effectiveUser,
                    bizName: biz.companyName || 'Bilinmeyen İşletme',
                    text: buildFallbackText(t),
                    tId: t.id
                });
            }
        });

        // Zamana göre sırala ve en güncel 20'yi al
        allLogs.sort((a, b) => b.time - a.time);
        const recentLogs = allLogs.slice(0, 20);

        if (recentLogs.length === 0) {
            feed.innerHTML = `<div class="no-feed-records" style="text-align:center; padding:40px 20px; color:#94a3b8; font-weight:600; font-size:13px;">Satış ekibine ait güncel bir hareket bulunamadı.</div>`;
            return;
        }

        const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

        let feedHtml = '';
        recentLogs.forEach(l => {
            let shortText = l.text.replace(/<[^>]*>?/gm, '');
            if (shortText.length > 80) shortText = shortText.substring(0, 80) + '...';
            
            let icon = '�';
            let statusColor = '#94a3b8';
            
            const lowerText = shortText.toLowerCase();
            if (lowerText.includes('deal')) { icon = '🤝'; statusColor = '#10b981'; }
            else if (lowerText.includes('cold') || lowerText.includes('istemiyor') || lowerText.includes('ulaşılamadı') || lowerText.includes('yetkili yok')) { icon = '❄️'; statusColor = '#3b82f6'; }
            else if (lowerText.includes('tekrar ara') || lowerText.includes('takip')) { icon = '🕒'; statusColor = '#f59e0b'; }
            else if (lowerText.includes('hot')) { icon = '🔥'; statusColor = '#ef4444'; }

            const timeStr = typeof timeAgo === 'function' ? timeAgo(l.time) : (l.dateStr.includes(' ') ? l.dateStr.split(' ')[1] : l.dateStr);
            
            // Kullanıcı adına göre avatar ve renk
            const initials = l.user.substring(0, 2).toUpperCase();
            const colorIndex = l.user.length % colors.length;
            const avatarColor = colors[colorIndex];

            feedHtml += `
            <div class="radar-feed-item" onclick="openTaskModal('${l.tId}')">
                <div class="rfi-avatar" style="background: ${avatarColor};">${initials}</div>
                <div class="rfi-content">
                    <div class="rfi-header">
                        <span class="rfi-name">${l.user}</span>
                        <span class="rfi-time"><span class="rfi-icon" style="color:${statusColor}">${icon}</span> ${timeStr}</span>
                    </div>
                    <div class="rfi-biz">${l.bizName}</div>
                    <div class="rfi-text">${shortText}</div>
                </div>
            </div>`;
        });

        feed.innerHTML = feedHtml;
    },

    _renderUserDashboard(currentMonth, currentYear) {
        const uDash = document.getElementById('userDashboardSection');
        const mDash = document.getElementById('managerDashboardSection');
        if (uDash) uDash.style.display = 'block';
        if (mDash) mDash.style.display = 'none';

        const hour = new Date().getHours();
        const greeting = hour < 12 ? '☀️ Günaydın' : (hour < 18 ? '👋 İyi Günler' : '🌙 İyi Akşamlar');
        const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
        setEl('userHeroGreeting', `${greeting}, ${AppState.loggedInUser.name}`);
        setEl('userHeroDate', new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));

        const userTaskSummaryMap = this._getUserTaskSummaryMap();
        const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
        const mySummary = userTaskSummaryMap.get(AppState.loggedInUser.name) || { tasks: [], openCount: 0, monthlyStats: {} };
        const myTasks = mySummary.tasks;
        const openTasksCount = mySummary.openCount;
        setEl('dashTotalTasks', openTasksCount);

        const myMonthlyStats = this._getMonthlySummary(mySummary, monthKey);
        const monthlyDeal = myMonthlyStats.deal;
        const monthlyCold = myMonthlyStats.cold;

        setEl('dashMyDealMonthly', monthlyDeal);
        setEl('dashMyColdMonthly', monthlyCold);

        const counts = { 'new': 0, 'hot': 0, 'nothot': 0, 'followup': 0 };
        myTasks.forEach(t => { if (counts[t.status] !== undefined) counts[t.status]++; });
        ['new', 'hot', 'nothot', 'followup'].forEach(st => {
            const el = document.getElementById('dash' + toTitleCase(st));
            if (el) el.innerText = counts[st] || 0;
        });

        // --- AKILLI ODAK (USER) ---
        let focusItems = [];
        const nowTime = Date.now();
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
        
        const delayedTasks = myTasks.filter(t => {
            if (t.status === 'cold' || t.status === 'deal') return false;
            const lastTime = (t.logs && t.logs.length > 0) ? parseLogDate(t.logs[0].date) : new Date(t.createdAt).getTime();
            return (lastTime > 0 && (nowTime - lastTime) > threeDaysMs);
        });
        
        const focusToday = new Date(); focusToday.setHours(0, 0, 0, 0);
        const focusTomorrow = new Date(focusToday); focusTomorrow.setDate(focusTomorrow.getDate() + 1);
        const dueFollowupCalls = myTasks.filter((t) => {
            if (t.status !== 'followup' || !t.nextCallDate) return false;
            const nextCallTime = new Date(t.nextCallDate);
            return !Number.isNaN(nextCallTime.getTime()) && nextCallTime < focusTomorrow;
        }).length;

        if (dueFollowupCalls > 0) {
            focusItems.push({ 
                text: `Bugün gerçekleştirmeniz gereken planlanmış ${dueFollowupCalls} aramanız (followup) bulunuyor.`, 
                action: "switchPage('page-my-tasks')", 
                icon: "📅" 
            });
        } else if (delayedTasks.length > 0) {
            focusItems.push({ 
                text: `Dikkat: Üzerinde 3 günden uzun süredir işlem yapmadığınız ${delayedTasks.length} görev var!`, 
                action: "switchPage('page-my-tasks')", 
                icon: "⚠️" 
            });
        } else if (openTasksCount > 0) {
            focusItems.push({ 
                text: `Üzerinizde aktif olarak bekleyen toplam ${openTasksCount} açık görev bulunuyor.`, 
                action: "switchPage('page-my-tasks')", 
                icon: "📋" 
            });
        } else {
            focusItems.push({ 
                text: "Harika! Bugün için acil bir işlem görünmüyor.", 
                action: "switchPage('page-my-tasks')", 
                icon: "🎉" 
            });
        }

        // Carousel render et
        this._renderSmartFocusCarousel('userSmartFocusText', focusItems);

        // Yaklaşan aramalar
        const upcomingList = document.getElementById('dashUpcomingList');
        if (upcomingList) {
            upcomingList.innerHTML = '';
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const nextWeek = new Date(today); nextWeek.setDate(nextWeek.getDate() + 7);
            let upcomingTasks = myTasks.filter(t => t.status === 'followup' && t.nextCallDate && new Date(t.nextCallDate) >= today && new Date(t.nextCallDate) <= nextWeek);
            upcomingTasks.sort((a, b) => new Date(a.nextCallDate) - new Date(b.nextCallDate));
            if (upcomingTasks.length === 0) {
                upcomingList.innerHTML = `<div class="no-upcoming-tasks">Önümüzdeki 7 gün için planlanmış arama yok.</div>`;
            } else {
                const fragment = document.createDocumentFragment();
                upcomingTasks.forEach(t => fragment.appendChild(TaskController.createMinimalCard(t)));
                upcomingList.appendChild(fragment);
            }
        }
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

    openSummaryModal(type) {
        let filtered = [], title = '';
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        const taskIndex = this._getTaskDerivedIndex();
        const bizMap = AppState.getBizMap ? AppState.getBizMap() : null;

        if (type === 'active') {
            filtered = taskIndex.nonPoolTasks.filter(t => isActiveTask(t.status));
            title = "Tüm Açık Tasklar";
        } else if (type === 'deal' || type === 'cold') {
            filtered = taskIndex.nonPoolTasks.filter(t => {
                if (t.status !== type) return false;
                const d = (t.logs && t.logs.length > 0) ? new Date(parseLogDate(t.logs[0].date)) : new Date(t.createdAt);
                return (d.getMonth() === currentMonth && d.getFullYear() === currentYear);
            });
            title = type === 'deal' ? "Bu Ayki Deal Görevler" : "Bu Ayki Cold Görevler";
        } else if (type === 'my-deal' || type === 'my-cold') {
            const s = type === 'my-deal' ? 'deal' : 'cold';
            const myTasks = taskIndex.tasksByAssignee.get(AppState.loggedInUser.name) || [];
            filtered = myTasks.filter(t => {
                if (t.status !== s) return false;
                const d = (t.logs && t.logs.length > 0) ? new Date(parseLogDate(t.logs[0].date)) : new Date(t.createdAt);
                return (d.getMonth() === currentMonth && d.getFullYear() === currentYear);
            });
            title = type === 'my-deal' ? "Bu Ayki Deal İşlemleri" : "Bu Ayki Cold İşlemleri";
        }

        let html = '';
        if (filtered.length === 0) {
            html = "<div style='color:var(--text-muted); font-size:13px;'>Görev bulunamadı.</div>";
        } else {
            filtered.forEach(t => {
                const b = bizMap?.get ? (bizMap.get(t.businessId) || t) : (AppState.businesses.find(x => x.id === t.businessId) || t);
                html += `<div class="summary-list-item" onclick="closeModal('summaryModal'); openTaskModal('${t.id}')"><span class="summary-title" title="${b.companyName}">${b.companyName || 'Bilinmeyen'}</span><span class="summary-assignee clickable-badge" onclick="event.stopPropagation(); openUserProfileModal('${t.assignee}')">👤 ${t.assignee}</span></div>`;
            });
        }
        const st = document.getElementById('summaryModalTitle'); if (st) st.innerText = title;
        const sl = document.getElementById('summaryModalList'); if (sl) sl.innerHTML = html;
        const sm = document.getElementById('summaryModal'); if (sm) sm.style.display = 'flex';
    },

    openTodayTasksModal(type) {
        const taskIndex = this._getTaskDerivedIndex();
        const bizMap = AppState.getBizMap ? AppState.getBizMap() : null;
        const filtered = taskIndex.nonPoolTasks.filter(t => t.status === type && t.logs && t.logs.length > 0 && isToday(t.logs[0].date));
        const mt = document.getElementById('todayTasksModalTitle');
        if (mt) mt.innerHTML = type === 'deal' ? '✅ Bugün Deal Olanlar' : '❄️ Bugün Cold Olanlar';
        const list = document.getElementById('todayTasksModalList');
        if (!list) return;
        list.innerHTML = '';

        if (filtered.length === 0) {
            list.innerHTML = `<div class="no-tasks-today">Bugün için kayıt yok.</div>`;
        } else {
            filtered.forEach(t => {
                const biz = bizMap?.get ? (bizMap.get(t.businessId) || {}) : (AppState.businesses.find(b => b.id === t.businessId) || {});
                list.innerHTML += `<div style="padding:12px 15px; background:#f8f9fa; border:1px solid var(--border-light); border-radius:8px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="closeModal('todayTasksModal'); openTaskModal('${t.id}')"><div><strong style="color:var(--secondary-color); display:block; font-size:14px;">${biz.companyName || 'Bilinmeyen'}</strong><span style="font-size:11px; color:#888;">📍 ${biz.city || '-'}</span></div><span style="color:var(--primary-color); font-weight:600; font-size:12px;">👤 ${t.assignee}</span></div>`;
            });
        }
        const tm = document.getElementById('todayTasksModal');
        if (tm) tm.style.display = 'flex';
    }
};

// window bindings (HTML onclick uyumluluğu)
window.renderDashboard = DashboardController.render.bind(DashboardController);
window.openSummaryModal = DashboardController.openSummaryModal.bind(DashboardController);
window.openTodayTasksModal = DashboardController.openTodayTasksModal.bind(DashboardController);
window.refreshLiveFeed = () => { if (DashboardController && DashboardController._renderLiveFeed) DashboardController._renderLiveFeed(); };
window.goToAllTasks = function(status) {
    switchPage('page-all-tasks');
    document.querySelectorAll('.all-status-filter').forEach(cb => { cb.checked = Boolean(status) && cb.value === status; });
    AppState.setPage('allTasks', 1);
    renderAllTasks();
};
window.goToMyTasks = function(status) {
    document.querySelectorAll('.my-status-filter').forEach(cb => { cb.checked = (cb.value === status); });
    switchPage('page-my-tasks');
};
