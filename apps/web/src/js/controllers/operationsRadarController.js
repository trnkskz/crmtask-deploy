const OperationsRadarController = (() => {
    let currentState = {
        mode: 'today',
        date: '',
        userId: '',
        team: '',
    };
    let latestRequestId = 0;

    function getScopeUsers() {
        const currentUser = AppState.loggedInUser || {};
        const isTeamLead = currentUser.role === 'Takım Lideri';
        const actorTeam = String(currentUser.team || '').trim();
        return AppState.users.filter((user) => {
            if (String(user.status || '') === 'Pasif') return false;
            if (String(user.role || '') !== 'Satış Temsilcisi') return false;
            if (isTeamLead && actorTeam && String(user.team || '').trim() !== actorTeam) return false;
            return true;
        });
    }

    function populateFilters() {
        const users = getScopeUsers();
        const currentUser = AppState.loggedInUser || {};
        const isTeamLead = currentUser.role === 'Takım Lideri';
        const userFilter = document.getElementById('operationsRadarUserFilter');
        const teamFilter = document.getElementById('operationsRadarTeamFilter');

        if (userFilter) {
            const keep = currentState.userId;
            userFilter.innerHTML = '<option value="">Tüm Kullanıcılar</option>';
            users.forEach((user) => userFilter.add(new Option(user.name, user.id)));
            userFilter.value = users.some((user) => user.id === keep) ? keep : '';
            currentState.userId = userFilter.value;
        }

        if (teamFilter) {
            const teams = Array.from(new Set(users.map((user) => String(user.team || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'tr'));
            const keep = currentState.team;
            teamFilter.innerHTML = '<option value="">Tüm Ekipler</option>';
            teams.forEach((team) => teamFilter.add(new Option(team, team)));
            if (isTeamLead) {
                teamFilter.value = String(currentUser.team || '').trim();
                teamFilter.disabled = true;
                currentState.team = teamFilter.value;
            } else {
                teamFilter.disabled = false;
                teamFilter.value = teams.includes(keep) ? keep : '';
                currentState.team = teamFilter.value;
            }
        }
    }

    function syncVisibility() {
        const dateWrap = document.getElementById('operationsRadarDateWrap');
        if (dateWrap) dateWrap.style.display = currentState.mode === 'day' ? 'flex' : 'none';
    }

    function buildQuery() {
        const params = new URLSearchParams();
        params.set('mode', currentState.mode || 'today');
        if (currentState.mode === 'day' && currentState.date) params.set('date', currentState.date);
        if (currentState.userId) params.set('userId', currentState.userId);
        if (currentState.team) params.set('team', currentState.team);
        return params.toString();
    }

    function formatDayLabel(dateStr) {
        const date = new Date(`${dateStr}T00:00:00`);
        if (Number.isNaN(date.getTime())) return dateStr;
        return date.toLocaleDateString('tr-TR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric',
        });
    }

    function formatTime(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '--:--';
        return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }

    function getStatusIcon(status, text) {
        const lowerText = String(text || '').toLocaleLowerCase('tr-TR');
        const lowerStatus = String(status || '').toLocaleLowerCase('tr-TR');
        if (lowerStatus === 'deal' || lowerText.includes('deal')) return { icon: '🤝', cls: 'deal' };
        if (lowerStatus === 'cold' || lowerText.includes('istemiyor') || lowerText.includes('ulaşılamadı')) return { icon: '❄️', cls: 'cold' };
        if (lowerStatus === 'hot') return { icon: '🔥', cls: 'hot' };
        if (lowerStatus === 'followup' || lowerText.includes('takip') || lowerText.includes('tekrar')) return { icon: '🕒', cls: 'followup' };
        if (lowerStatus === 'new') return { icon: '🆕', cls: 'new' };
        return { icon: '•', cls: 'neutral' };
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function stripHtml(value) {
        const raw = String(value || '');
        const div = document.createElement('div');
        div.innerHTML = raw;
        return (div.textContent || div.innerText || '').trim();
    }

    function renderGroups(groups) {
        const container = document.getElementById('operationsRadarResults');
        if (!container) return;
        if (!Array.isArray(groups) || groups.length === 0) {
            container.innerHTML = '<div class="operations-radar-empty">Seçilen aralıkta operasyon hareketi bulunamadı.</div>';
            return;
        }

        container.innerHTML = groups.map((group) => `
            <section class="operations-radar-group">
                <div class="operations-radar-group-title">${escapeHtml(formatDayLabel(group.date))}</div>
                <div class="operations-radar-list">
                    ${(group.events || []).map((event) => {
                        const statusMeta = getStatusIcon(event.status, event.text);
                        const cleanText = stripHtml(event.text);
                        return `
                            <button type="button" class="operations-radar-row" onclick="openTaskModal('${escapeHtml(event.taskId)}')">
                                <span class="operations-radar-time">${escapeHtml(formatTime(event.timestamp))}</span>
                                <span class="operations-radar-indicator ${statusMeta.cls}">${statusMeta.icon}</span>
                                <span class="operations-radar-main">
                                    <span class="operations-radar-topline">
                                        <strong>${escapeHtml(event.actorName)}</strong>
                                        <span>${escapeHtml(event.businessName)}</span>
                                    </span>
                                    <span class="operations-radar-text">${escapeHtml(cleanText)}</span>
                                </span>
                            </button>
                        `;
                    }).join('')}
                </div>
            </section>
        `).join('');
    }

    async function load() {
        const requestId = ++latestRequestId;
        const container = document.getElementById('operationsRadarResults');
        if (container) container.innerHTML = '<div class="operations-radar-empty">Yükleniyor...</div>';
        try {
            const data = await DataService.apiRequest(`/reports/operations-radar?${buildQuery()}`);
            if (requestId !== latestRequestId) return;
            renderGroups(data?.groups || []);
        } catch (err) {
            if (requestId !== latestRequestId) return;
            if (container) container.innerHTML = '<div class="operations-radar-empty">Operasyon verisi yüklenemedi.</div>';
            console.error('Operations radar load failed:', err);
        }
    }

    function bindStateFromDom() {
        const mode = document.getElementById('operationsRadarMode');
        const date = document.getElementById('operationsRadarDate');
        const user = document.getElementById('operationsRadarUserFilter');
        const team = document.getElementById('operationsRadarTeamFilter');
        currentState.mode = mode?.value || 'today';
        currentState.date = date?.value || '';
        currentState.userId = user?.value || '';
        currentState.team = team?.value || '';
    }

    function handleFilterChange() {
        bindStateFromDom();
        syncVisibility();
        load();
    }

    function render() {
        const dateInput = document.getElementById('operationsRadarDate');
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().slice(0, 10);
            currentState.date = dateInput.value;
        }
        populateFilters();
        bindStateFromDom();
        syncVisibility();
        load();
    }

    return {
        render,
        handleFilterChange,
    };
})();

window.renderOperationsRadarPage = OperationsRadarController.render.bind(OperationsRadarController);
window.handleOperationsRadarFilterChange = OperationsRadarController.handleFilterChange.bind(OperationsRadarController);
