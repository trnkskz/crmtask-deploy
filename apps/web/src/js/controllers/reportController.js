// ============================================================
// controllers/reportController.js
// Raporlama ve arşiv sayfası yönetimi
// ============================================================

const ReportController = (() => {
    const reportUiState = {
        activeTab: 'tasks',
        hasSubmittedFilters: false,
        filteredTasks: [],
        taskRows: [],
        businessRows: [],
        taskStats: null,
        taskTotal: 0,
        businessTotal: 0,
        pagedTaskMode: false,
    };

    function stripHtml(value) {
        return String(value || '').replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
    }

    function toCsvText(value) {
        const normalized = String(value ?? '').replace(/\r?\n+/g, ' ').trim();
        return `"${normalized.replace(/"/g, '""')}"`;
    }

    function triggerCsvDownload(headers, rows, fileName) {
        const csvContent = [
            headers.map(toCsvText).join(','),
            ...rows.map(row => row.map(toCsvText).join(',')),
        ].join('\n');
        const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function getValue(id) {
        return document.getElementById(id)?.value || '';
    }

    function getDataService() {
        return typeof DataService !== 'undefined' ? DataService : null;
    }

    function createQueryParams() {
        if (typeof URLSearchParams !== 'undefined') return new URLSearchParams();
        const entries = [];
        return {
            set(key, value) {
                const idx = entries.findIndex((entry) => entry[0] === key);
                if (idx >= 0) entries[idx] = [key, String(value)];
                else entries.push([key, String(value)]);
            },
            toString() {
                return entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
            },
        };
    }

    function getStatusLabel(status) {
        return TASK_STATUS_LABELS?.[status] || String(status || '-');
    }

    function isOpenTaskStatus(status) {
        return !['deal', 'cold'].includes(String(status || '').toLowerCase());
    }

    function getColspan() {
        return 13;
    }

    function renderEmptyState(message, icon = '📊') {
        const tbody = document.getElementById('reportsTbody');
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="${getColspan()}"><div class="empty-state">
            <div style="font-size:48px; opacity:0.3; margin-bottom:10px;">${icon}</div>
            <h3>${message}</h3>
            <p>Uygun sonuçları görmek için filtreleri güncelleyin.</p>
        </div></td></tr>`;
    }

    function setMetric(slot, label, value, accent = '') {
        const labelEl = document.getElementById(`repMetricLabel${slot}`);
        const valueEl = document.getElementById(`repMetricValue${slot}`);
        if (labelEl) labelEl.innerText = label;
        if (valueEl) {
            valueEl.innerText = value;
            valueEl.style.color = accent || '#ffffff';
        }
    }

    function setDashboardMetrics(taskRows, businessRows) {
        const stats = reportUiState.taskStats || {};
        const openTaskCount = Number.isFinite(Number(stats.open)) ? Number(stats.open) : taskRows.filter(row => isOpenTaskStatus(row.statusKey)).length;
        const dealCount = Number.isFinite(Number(stats.deal)) ? Number(stats.deal) : taskRows.filter(row => row.statusKey === 'deal').length;
        const coldCount = Number.isFinite(Number(stats.cold)) ? Number(stats.cold) : taskRows.filter(row => row.statusKey === 'cold').length;
        const contactedTaskCount = taskRows.filter(row => row.conversationHistoryCount > 0).length;
        const totalTasks = Number(reportUiState.taskTotal || taskRows.length || 0);
        const totalBusinesses = Number(reportUiState.businessTotal || businessRows.length || 0);

        if (reportUiState.activeTab === 'businesses') {
            const activeBusinessCount = businessRows.filter(row => row.openTaskCount > 0).length;
            const dealBusinessCount = businessRows.filter(row => row.dealTaskCount > 0).length;
            const logBusinessCount = businessRows.filter(row => row.conversationHistoryCount > 0).length;
            const pricedBusinessCount = businessRows.filter(row => row.publishedFeeText !== '-').length;

            setMetric(1, 'Filtrelenen İşletme', businessRows.length);
            setMetric(2, 'Toplam Görev', taskRows.length);
            setMetric(3, 'Açık İşletme', activeBusinessCount, '#bfdbfe');
            setMetric(4, 'Deal Gören', dealBusinessCount, '#a7f3d0');
            setMetric(5, 'Loglu İşletme', logBusinessCount);
            setMetric(6, 'Yayın Bedelli', pricedBusinessCount, '#fde68a');
            return;
        }

        setMetric(1, 'Filtrelenen Görev', totalTasks);
        setMetric(2, 'İşletme', totalBusinesses);
        setMetric(3, 'Açık Görev', openTaskCount, '#bfdbfe');
        setMetric(4, 'Deal', dealCount, '#a7f3d0');
        setMetric(5, 'Cold', coldCount, '#fecaca');
        setMetric(6, 'Görüşülen', contactedTaskCount);
    }

    function syncTabButtons() {
        const taskBtn = document.getElementById('repTabTasks');
        const businessBtn = document.getElementById('repTabBusinesses');
        if (taskBtn) taskBtn.classList.toggle('active', reportUiState.activeTab === 'tasks');
        if (businessBtn) businessBtn.classList.toggle('active', reportUiState.activeTab === 'businesses');

        const taskExportBtn = document.getElementById('reportsExportTasksBtn');
        const businessExportBtn = document.getElementById('reportsExportAccountsBtn');
        if (taskExportBtn) taskExportBtn.style.display = reportUiState.activeTab === 'tasks' ? 'inline-flex' : 'none';
        if (businessExportBtn) businessExportBtn.style.display = reportUiState.activeTab === 'businesses' ? 'inline-flex' : 'none';
    }

    function setTableHead() {
        const thead = document.getElementById('reportsTableHead');
        if (!thead) return;
        if (reportUiState.activeTab === 'businesses') {
            thead.innerHTML = `<tr>
                <th>Son Hareket</th>
                <th>İşletme</th>
                <th>Şehir</th>
                <th>İlçe</th>
                <th>Görev Özeti</th>
                <th>Sorumlu / Takım</th>
                <th>Kaynak</th>
                <th>Ana Kat.</th>
                <th>Alt Kat.</th>
                <th>Yayın Bedeli</th>
                <th>Son Log</th>
                <th>Görüşme Geçmişi</th>
                <th>Log İçeriği</th>
            </tr>`;
            return;
        }

        thead.innerHTML = `<tr>
            <th>Tarih</th>
            <th>İşletme</th>
            <th>Şehir</th>
            <th>İlçe</th>
            <th>Sorumlu</th>
            <th>Durum</th>
            <th>Kaynak</th>
            <th>Ana Kat.</th>
            <th>Alt Kat.</th>
            <th>Yayın Bedeli</th>
            <th>Son Log</th>
            <th>Görüşme Geçmişi</th>
            <th>Log İçeriği</th>
        </tr>`;
    }

    function clearFilters() {
        ['repFilterAssignee', 'repFilterStatus', 'repFilterSource',
         'repFilterCategory', 'repFilterSubCategory', 'repFilterLogType', 'repFilterDealFee',
         'repFilterCity', 'repFilterDistrict', 'repStartDate', 'repEndDate'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        if (window.updateReportDistrictFilterOptions) window.updateReportDistrictFilterOptions();

        AppState.setFiltered('reports', []);
        AppState.setPage('reports', 1);
        reportUiState.hasSubmittedFilters = false;
        reportUiState.filteredTasks = [];
        reportUiState.taskRows = [];
        reportUiState.businessRows = [];
        reportUiState.taskStats = null;
        reportUiState.taskTotal = 0;
        reportUiState.businessTotal = 0;
        reportUiState.pagedTaskMode = false;
        syncTabButtons();
        setTableHead();
        setMetric(1, reportUiState.activeTab === 'businesses' ? 'Filtrelenen İşletme' : 'Filtrelenen Görev', 0);
        setMetric(2, reportUiState.activeTab === 'businesses' ? 'Toplam Görev' : 'İşletme', 0);
        setMetric(3, reportUiState.activeTab === 'businesses' ? 'Açık İşletme' : 'Açık Görev', 0, '#bfdbfe');
        setMetric(4, reportUiState.activeTab === 'businesses' ? 'Deal Gören' : 'Deal', 0, '#a7f3d0');
        setMetric(5, reportUiState.activeTab === 'businesses' ? 'Loglu İşletme' : 'Cold', 0, reportUiState.activeTab === 'businesses' ? '' : '#fecaca');
        setMetric(6, reportUiState.activeTab === 'businesses' ? 'Yayın Bedelli' : 'Görüşülen', 0, reportUiState.activeTab === 'businesses' ? '#fde68a' : '');
        renderEmptyState('Rapor Bekleniyor');

        const pagEl = document.getElementById('reportsPagination');
        if (pagEl) pagEl.innerHTML = '';
    }

    function formatTaskReportRow(row) {
        return {
            id: row.id,
            businessId: row.businessId || '',
            statusKey: typeof normalizeTaskStatusKey === 'function'
                ? normalizeTaskStatusKey(row.statusKey || '')
                : String(row.statusKey || '').toLowerCase(),
            createdAt: row.createdAt ? formatDate(row.createdAt).split(' ')[0] : '-',
            businessName: row.businessName || '-',
            city: row.city || '-',
            district: row.district || '-',
            assignee: row.assignee || '-',
            statusLabel: typeof getTaskStatusLabel === 'function' ? getTaskStatusLabel(row.statusKey || '') : getStatusLabel(row.statusKey),
            sourceLabel: typeof getTaskSourceLabel === 'function' ? getTaskSourceLabel(row.sourceKey || '') : (row.sourceKey || '-'),
            mainCategory: row.mainCategory || '-',
            subCategory: row.subCategory || '-',
            publishedFeeText: row.publishedFeeText || '-',
            latestLogLabel: row.latestLogLabel || '-',
            conversationHistoryLabel: row.conversationHistoryLabel || `${Number(row.conversationHistoryCount || 0)} kayıt`,
            conversationHistoryCount: Number(row.conversationHistoryCount || 0),
            logContent: row.logContent || '-',
            lastActionDate: row.lastActionDate ? formatDate(row.lastActionDate).split(' ')[0] : '-',
        };
    }

    function getLatestLogTag(text) {
        const match = String(text || '').match(/^\s*\[([^\]]+)\]/);
        return match ? match[1] : '';
    }

    function formatLocalTaskReportRow(task) {
        const bizMap = typeof AppState?.getBizMap === 'function' ? AppState.getBizMap() : new Map();
        const metaMap = typeof AppState?.getReportTaskMetaMap === 'function' ? AppState.getReportTaskMetaMap() : new Map();
        const biz = bizMap.get(task.businessId) || {};
        const meta = metaMap.get(task.id) || {};
        const latestLog = Array.isArray(task.logs) ? task.logs[0] : null;
        const latestLogText = meta.latestLogText || latestLog?.text || '';
        const sourceKey = typeof normalizeTaskSourceKey === 'function'
            ? normalizeTaskSourceKey(task.sourceType || task.source || '')
            : String(task.sourceType || task.source || '').trim();
        const statusKey = typeof normalizeTaskStatusKey === 'function'
            ? normalizeTaskStatusKey(task.status || '')
            : String(task.status || '').toLowerCase();
        return {
            id: task.id,
            businessId: task.businessId || '',
            statusKey,
            createdAt: meta.lastActionDate || meta.createdDateOnly || (task.createdAt ? formatDate(task.createdAt).split(' ')[0] : '-'),
            businessName: biz.companyName || biz.businessName || task.companyName || task.businessName || '-',
            city: biz.city || task.city || '-',
            district: biz.district || task.district || '-',
            assignee: task.assignee || '-',
            statusLabel: typeof getTaskStatusLabel === 'function' ? getTaskStatusLabel(statusKey) : getStatusLabel(statusKey),
            sourceLabel: typeof getTaskSourceLabel === 'function' ? getTaskSourceLabel(sourceKey) : (task.sourceType || sourceKey || '-'),
            sourceKey,
            mainCategory: task.mainCategory || '-',
            subCategory: task.subCategory || '-',
            publishedFeeText: meta.feeVal && meta.feeVal !== 'yok' ? meta.feeVal : '-',
            latestLogLabel: meta.latestLogTag || getLatestLogTag(latestLogText) || '-',
            conversationHistoryLabel: `${meta.latestLogText || latestLogText ? 1 : (Array.isArray(task.logs) ? task.logs.length : 0)} kayıt`,
            conversationHistoryCount: meta.latestLogText || latestLogText ? 1 : (Array.isArray(task.logs) ? task.logs.length : 0),
            logContent: latestLogText || '-',
            lastActionDate: meta.lastActionDate || (task.createdAt ? formatDate(task.createdAt).split(' ')[0] : '-'),
        };
    }

    function buildLocalFilterResults() {
        const selectedStatus = _toApiTaskStatus(getValue('repFilterStatus')).toLowerCase();
        const selectedSource = typeof normalizeTaskSourceKey === 'function'
            ? normalizeTaskSourceKey(getValue('repFilterSource'))
            : String(getValue('repFilterSource') || '').trim();
        const selectedLogType = getValue('repFilterLogType');
        const rows = (Array.isArray(AppState?.tasks) ? AppState.tasks : [])
            .map(formatLocalTaskReportRow)
            .filter((row) => {
                if (selectedStatus && String(row.statusKey || '').toLowerCase() !== selectedStatus) return false;
                if (selectedSource && String(row.sourceKey || '') !== selectedSource) return false;
                if (selectedLogType && row.latestLogLabel !== selectedLogType) return false;
                return true;
            });
        return {
            filteredTasks: [],
            taskRows: rows,
            businessRows: getBusinessRowsFromTaskRows(rows),
        };
    }

    function getBusinessRowsFromTaskRows(taskRows) {
        const grouped = new Map();
        taskRows.forEach((task) => {
            const groupKey = task.businessId || task.businessName || task.id;
            if (!grouped.has(groupKey)) {
                grouped.set(groupKey, {
                    id: task.businessId || task.id,
                    businessName: task.businessName || '-',
                    city: task.city || '-',
                    district: task.district || '-',
                    sources: new Set(),
                    mainCategories: new Set(),
                    subCategories: new Set(),
                    assignees: new Set(),
                    taskCount: 0,
                    openTaskCount: 0,
                    dealTaskCount: 0,
                    coldTaskCount: 0,
                    conversationHistoryCount: 0,
                    latestTask: task,
                    publishedFeeText: '-',
                });
            }

            const group = grouped.get(groupKey);
            const createdTime = new Date(task.createdAt || 0).getTime();
            const latestTime = new Date(group.latestTask?.createdAt || 0).getTime();
            if (createdTime > latestTime) {
                group.latestTask = task;
            }

            group.taskCount += 1;
            if (isOpenTaskStatus(task.statusKey)) group.openTaskCount += 1;
            if (String(task.statusKey || '').toLowerCase() === 'deal') group.dealTaskCount += 1;
            if (String(task.statusKey || '').toLowerCase() === 'cold') group.coldTaskCount += 1;
            group.conversationHistoryCount += Number(task.conversationHistoryCount || 0);
            group.sources.add(task.sourceLabel || '-');
            group.mainCategories.add(task.mainCategory || '-');
            group.subCategories.add(task.subCategory || '-');
            group.assignees.add(task.assignee || '-');

            const currentFee = task.publishedFeeText || '-';
            if (group.publishedFeeText === '-' && currentFee !== '-') group.publishedFeeText = currentFee;
        });

        return Array.from(grouped.values())
            .map((group) => ({
                id: group.id,
                createdAt: formatDate(group.latestTask?.createdAt).split(' ')[0],
                businessName: group.businessName,
                city: group.city,
                district: group.district,
                taskSummary: `${group.taskCount} görev / ${group.openTaskCount} açık`,
                assigneeSummary: Array.from(group.assignees).slice(0, 3).join(', ') || '-',
                sourceLabel: Array.from(group.sources).slice(0, 3).join(', ') || '-',
                mainCategory: Array.from(group.mainCategories).slice(0, 2).join(', ') || '-',
                subCategory: Array.from(group.subCategories).slice(0, 2).join(', ') || '-',
                publishedFeeText: group.publishedFeeText,
                latestLogLabel: group.latestTask?.latestLogLabel || '-',
                conversationHistoryLabel: `${group.conversationHistoryCount} kayıt`,
                conversationHistoryCount: group.conversationHistoryCount,
                logContent: group.latestTask?.logContent || '-',
                lastActionDate: group.latestTask?.lastActionDate || '-',
                latestTaskId: group.latestTask?.id || '',
                openTaskCount: group.openTaskCount,
                dealTaskCount: group.dealTaskCount,
                coldTaskCount: group.coldTaskCount,
            }))
            .sort((a, b) => new Date(b.lastActionDate || 0) - new Date(a.lastActionDate || 0));
    }

    function buildReportQuery() {
        const fAssignee = getValue('repFilterAssignee');
        const fStatus = getValue('repFilterStatus');
        const fSource = getValue('repFilterSource');
        const fCat = getValue('repFilterCategory');
        const fSubCat = getValue('repFilterSubCategory');
        const fLogType = getValue('repFilterLogType');
        const fDealFee = getValue('repFilterDealFee');
        const fCity = getValue('repFilterCity');
        const fDistrict = getValue('repFilterDistrict');
        const sDate = getValue('repStartDate');
        const eDate = getValue('repEndDate');
        const normalizedSourceFilter = typeof normalizeTaskSourceKey === 'function'
            ? normalizeTaskSourceKey(fSource)
            : String(fSource || '').trim();
        const query = createQueryParams();
        if (fStatus) query.set('status', _toApiTaskStatus(fStatus));
        if (normalizedSourceFilter) query.set('source', normalizedSourceFilter);
        if (fCat) query.set('mainCategory', fCat);
        if (fSubCat) query.set('subCategory', fSubCat);
        if (fLogType) query.set('logType', fLogType);
        if (fDealFee) query.set('dealFee', fDealFee);
        if (fCity) query.set('city', fCity);
        if (fDistrict) query.set('district', fDistrict);
        if (sDate) query.set('from', sDate);
        if (eDate) query.set('to', eDate);
        if (fAssignee === 'Team 1' || fAssignee === 'Team 2') {
            query.set('team', fAssignee);
        } else {
            const assigneeScope = _resolveOwnerIdFromFilter(fAssignee);
            if (assigneeScope?.ownerId) query.set('ownerId', assigneeScope.ownerId);
            if (assigneeScope?.historicalAssignee) query.set('historicalAssignee', assigneeScope.historicalAssignee);
        }
        return query.toString();
    }

    async function buildFilterResults() {
        const query = buildReportQuery();
        const dataService = getDataService();
        if (!dataService?.apiRequest && !dataService?.fetchAllReportTaskRows) {
            const local = buildLocalFilterResults();
            return {
                ...local,
                taskStats: null,
                taskTotal: local.taskRows.length,
                businessTotal: local.businessRows.length,
                pagedTaskMode: false,
            };
        }
        if (reportUiState.activeTab === 'businesses') {
            const response = typeof dataService.fetchAllReportTaskRows === 'function'
                ? await dataService.fetchAllReportTaskRows(query)
                : await dataService.apiRequest(`/reports/tasks${query ? `?${query}` : ''}`);
            const rawRows = typeof dataService.normalizeReportTaskRows === 'function'
                ? dataService.normalizeReportTaskRows(response)
                : (Array.isArray(response) ? response : (Array.isArray(response?.items) ? response.items : (Array.isArray(response?.rows) ? response.rows : [])));
            const taskRows = rawRows.map(formatTaskReportRow);
            const businessRows = getBusinessRowsFromTaskRows(taskRows);
            return {
                filteredTasks: [],
                taskRows,
                businessRows,
                taskStats: response?.stats || null,
                taskTotal: Number(response?.total || taskRows.length),
                businessTotal: Number(response?.businessTotal || businessRows.length),
                pagedTaskMode: false,
            };
        }

        const page = Math.max(1, Number(AppState?.pagination?.reports || 1));
        const pagedQuery = query ? `${query}&page=${page}&limit=${ITEMS_PER_PAGE}` : `page=${page}&limit=${ITEMS_PER_PAGE}`;
        const response = await dataService.apiRequest(`/reports/tasks?${pagedQuery}`);
        const rawRows = typeof dataService.normalizeReportTaskRows === 'function'
            ? dataService.normalizeReportTaskRows(response)
            : (Array.isArray(response) ? response : (Array.isArray(response?.items) ? response.items : (Array.isArray(response?.rows) ? response.rows : [])));
        const taskRows = rawRows.map(formatTaskReportRow);
        const businessRows = getBusinessRowsFromTaskRows(taskRows);
        return {
            filteredTasks: [],
            taskRows,
            businessRows,
            taskStats: response?.stats || null,
            taskTotal: Number(response?.total || taskRows.length),
            businessTotal: Number(response?.businessTotal || businessRows.length),
            pagedTaskMode: true,
        };
    }

    async function renderReports(forceApply = false, options = {}) {
        const silent = Boolean(options?.silent);
        if (forceApply) {
            reportUiState.hasSubmittedFilters = true;
            AppState.setPage('reports', 1);
        }

        syncTabButtons();
        setTableHead();

        if (!reportUiState.hasSubmittedFilters) {
            renderEmptyState('Rapor Bekleniyor');
            const pagEl = document.getElementById('reportsPagination');
            if (pagEl) pagEl.innerHTML = '';
            return;
        }

        const dataService = getDataService();
        if (!dataService?.apiRequest && !dataService?.fetchAllReportTaskRows) {
            const nextState = buildLocalFilterResults();
            reportUiState.filteredTasks = nextState.filteredTasks;
            reportUiState.taskRows = nextState.taskRows;
            reportUiState.businessRows = nextState.businessRows;
            reportUiState.taskStats = nextState.taskStats || null;
            reportUiState.taskTotal = Number(nextState.taskTotal || nextState.taskRows.length || 0);
            reportUiState.businessTotal = Number(nextState.businessTotal || nextState.businessRows.length || 0);
            reportUiState.pagedTaskMode = Boolean(nextState.pagedTaskMode);
            AppState.setFiltered('reports', nextState.filteredTasks);
            _displayReports();
            return;
        }

        if (!silent) {
            renderEmptyState('Rapor Hazırlanıyor', '⏳');
        }
        try {
            const nextState = await buildFilterResults();
            reportUiState.filteredTasks = nextState.filteredTasks;
            reportUiState.taskRows = nextState.taskRows;
            reportUiState.businessRows = nextState.businessRows;
            reportUiState.taskStats = nextState.taskStats || null;
            reportUiState.taskTotal = Number(nextState.taskTotal || nextState.taskRows.length || 0);
            reportUiState.businessTotal = Number(nextState.businessTotal || nextState.businessRows.length || 0);
            reportUiState.pagedTaskMode = Boolean(nextState.pagedTaskMode);
            AppState.setFiltered('reports', nextState.filteredTasks);
            _displayReports();
        } catch (err) {
            console.error(err);
            if (!silent) {
                renderEmptyState('Rapor yüklenemedi', '⚠️');
            }
        }
    }

    function _displayReports() {
        const tbody = document.getElementById('reportsTbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const pagContainer = getOrCreatePaginationContainer('reportsPagination');
        pagContainer.innerHTML = '';

        const filtered = reportUiState.activeTab === 'businesses'
            ? reportUiState.businessRows
            : reportUiState.taskRows;
        const page = AppState.pagination.reports;
        setDashboardMetrics(reportUiState.taskRows, reportUiState.businessRows);
        setTableHead();
        syncTabButtons();

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${getColspan()}"><div class="empty-state">
                <div style="font-size:48px; opacity:0.3; margin-bottom:10px;">🔍</div>
                <h3>Sonuç Bulunamadı</h3>
            </div></td></tr>`;
            return;
        }

        const statColors = {
            cold: '#94a3b8', deal: 'var(--success-color)', hot: 'var(--danger-color)',
            nothot: 'var(--warning-color)', followup: '#d97706', new: 'var(--info-color)'
        };

        const useServerPagedTaskRows = reportUiState.activeTab === 'tasks' && reportUiState.pagedTaskMode;
        const start = (page - 1) * ITEMS_PER_PAGE;
        const paginated = useServerPagedTaskRows ? filtered : filtered.slice(start, start + ITEMS_PER_PAGE);
        const rows = paginated.map(row => {
            if (reportUiState.activeTab === 'businesses') {
                return `<tr style="cursor:pointer;" onclick="${row.id ? `openBusinessDetailModal('${row.id}')` : `openTaskModal('${row.latestTaskId}')`}">
                    <td>${row.lastActionDate}</td>
                    <td><strong>${row.businessName}</strong></td>
                    <td>${row.city || '-'}</td>
                    <td>${row.district || '-'}</td>
                    <td>${row.taskSummary}</td>
                    <td>${row.assigneeSummary}</td>
                    <td>${row.sourceLabel}</td>
                    <td>${row.mainCategory}</td>
                    <td>${row.subCategory}</td>
                    <td>${row.publishedFeeText}</td>
                    <td><span class="modern-badge" style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1;">${row.latestLogLabel}</span></td>
                    <td>${row.conversationHistoryLabel}</td>
                    <td>${row.logContent}</td>
                </tr>`;
            }

            const statusColor = statColors[row.statusKey] || '#ccc';
            return `<tr style="cursor:pointer;" onclick="openTaskModal('${row.id}')">
                <td>${row.createdAt}</td>
                <td><strong>${row.businessName}</strong></td>
                <td>${row.city || '-'}</td>
                <td>${row.district || '-'}</td>
                <td>👤 ${row.assignee}</td>
                <td><span class="modern-badge" style="background:${statusColor};">${row.statusLabel}</span></td>
                <td>${row.sourceLabel}</td>
                <td>${row.mainCategory}</td>
                <td>${row.subCategory}</td>
                <td>${row.publishedFeeText}</td>
                <td><span class="modern-badge" style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1;">${row.latestLogLabel}</span></td>
                <td>${row.conversationHistoryLabel}</td>
                <td>${row.logContent}</td>
            </tr>`;
        }).join('');

        tbody.innerHTML = rows;

        const totalCount = useServerPagedTaskRows
            ? Number(reportUiState.taskTotal || filtered.length || 0)
            : filtered.length;
        renderPagination(pagContainer, totalCount, page, ITEMS_PER_PAGE, (i) => {
            AppState.setPage('reports', i);
            if (useServerPagedTaskRows) {
                renderReports(false, { silent: true });
                return;
            }
            _displayReports();
        }, { compact: true, resultLabel: 'kayıt' });
    }

    function switchReportsTab(tab) {
        reportUiState.activeTab = tab === 'businesses' ? 'businesses' : 'tasks';
        syncTabButtons();
        setTableHead();
        AppState.setPage('reports', 1);
        if (!reportUiState.hasSubmittedFilters) {
            clearFilters();
            return;
        }
        renderReports(false, { silent: true });
    }

    function _toApiTaskStatus(status) {
        const s = String(status || '').toLowerCase();
        if (s === 'hot') return 'HOT';
        if (s === 'nothot') return 'NOT_HOT';
        if (s === 'followup') return 'FOLLOWUP';
        if (s === 'deal') return 'DEAL';
        if (s === 'cold') return 'COLD';
        if (s === 'new') return 'NEW';
        return '';
    }

    function _resolveOwnerIdFromFilter(filterVal) {
        const val = String(filterVal || '').trim();
        if (!val || val === 'Team 1' || val === 'Team 2') return '';
        const user = AppState.users.find(u => u.id === val || u.name === val || u.email === val);
        if (user) return { ownerId: user.id };
        return { historicalAssignee: val };
    }

    async function exportTasksCSV() {
        if (typeof hasPermission === 'function' && !hasPermission('exportReports')) {
            showToast('Rapor export yetkiniz bulunmuyor.', 'warning');
            return;
        }
        try {
            if (!reportUiState.hasSubmittedFilters) {
                showToast('Önce filtreleme yapıp raporu oluşturun.', 'warning');
                return;
            }
            let exportRows = reportUiState.taskRows;
            const dataService = getDataService();
            if (typeof dataService?.fetchAllReportTaskRows === 'function') {
                const response = await dataService.fetchAllReportTaskRows(buildReportQuery());
                const rawRows = typeof dataService.normalizeReportTaskRows === 'function'
                    ? dataService.normalizeReportTaskRows(response)
                    : (Array.isArray(response) ? response : []);
                exportRows = rawRows.map(formatTaskReportRow);
            }
            const rows = exportRows.map((row) => ([
                row.createdAt,
                row.businessName,
                row.city,
                row.district,
                row.assignee,
                row.statusLabel,
                row.sourceLabel,
                row.mainCategory,
                row.subCategory,
                row.publishedFeeText,
                row.latestLogLabel,
                row.conversationHistoryLabel,
                row.logContent,
            ]));
            triggerCsvDownload(
                ['Tarih', 'İşletme', 'Şehir', 'İlçe', 'Sorumlu', 'Durum', 'Kaynak', 'Ana Kategori', 'Alt Kategori', 'Yayın Bedeli', 'Son Log', 'Görüşme Geçmişi', 'Log İçeriği'],
                rows,
                `task_raporlari_${new Date().toISOString().split('T')[0]}.csv`,
            );
        } catch (err) {
            console.error(err);
            showToast(err?.message || 'Rapor indirilemedi', 'error');
        }
    }

    async function exportAccountsCSV() {
        if (typeof hasPermission === 'function' && !hasPermission('exportReports')) {
            showToast('Rapor export yetkiniz bulunmuyor.', 'warning');
            return;
        }
        try {
            if (!reportUiState.hasSubmittedFilters) {
                showToast('Önce filtreleme yapıp raporu oluşturun.', 'warning');
                return;
            }
            let exportRows = reportUiState.businessRows;
            const dataService = getDataService();
            if (typeof dataService?.fetchAllReportTaskRows === 'function') {
                const response = await dataService.fetchAllReportTaskRows(buildReportQuery());
                const rawRows = typeof dataService.normalizeReportTaskRows === 'function'
                    ? dataService.normalizeReportTaskRows(response)
                    : (Array.isArray(response) ? response : []);
                exportRows = getBusinessRowsFromTaskRows(rawRows.map(formatTaskReportRow));
            }
            const rows = exportRows.map((row) => ([
                row.lastActionDate,
                row.businessName,
                row.city,
                row.district,
                row.taskSummary,
                row.assigneeSummary,
                row.sourceLabel,
                row.mainCategory,
                row.subCategory,
                row.publishedFeeText,
                row.latestLogLabel,
                row.conversationHistoryLabel,
                row.logContent,
            ]));
            triggerCsvDownload(
                ['Son Hareket', 'İşletme', 'Şehir', 'İlçe', 'Görev Özeti', 'Sorumlu / Takım', 'Kaynak', 'Ana Kategori', 'Alt Kategori', 'Yayın Bedeli', 'Son Log', 'Görüşme Geçmişi', 'Log İçeriği'],
                rows,
                `isletme_raporlari_${new Date().toISOString().split('T')[0]}.csv`,
            );
        } catch (err) {
            console.error(err);
            showToast(err?.message || 'Accounts raporu indirilemedi', 'error');
        }
    }

    function _setStatEl(id, val) {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    }

    return {
        clearFilters,
        renderReports,
        exportTasksCSV,
        exportAccountsCSV,
        switchReportsTab,
        resolveOwnerIdFromFilter: _resolveOwnerIdFromFilter,
        formatTaskReportRow,
        toApiTaskStatus: _toApiTaskStatus,
    };
})();

// ============================================================
// controllers/archiveController.js
// Arşiv (pasif görevler) sayfası yönetimi
// ============================================================

const ArchiveController = (() => {
    const ARCHIVE_PAGE_LIMIT = 50;
    let _hasSearched = false;

    function buildArchiveQuery() {
        const getValue = id => document.getElementById(id)?.value || '';
        const query = {
            generalStatus: 'CLOSED',
        };
        const searchFilter = normalizeText(getValue('passiveSearchInput'));
        const statusFilter = getValue('passiveFilterStatus');
        const yearFilter = getValue('passiveFilterYear');
        const monthFilter = getValue('passiveFilterMonth');
        const assigneeFilter = getValue('passiveFilterAssignee');
        const categoryFilter = getValue('passiveFilterCategory');
        const subCategoryFilter = getValue('passiveFilterSubCategory');
        const districtFilter = getValue('passiveFilterDistrict');

        if (searchFilter) query.q = searchFilter;
        if (statusFilter) query.status = ReportController.toApiTaskStatus(statusFilter);
        if (districtFilter) query.district = districtFilter;
        if (categoryFilter) query.mainCategory = categoryFilter;
        if (subCategoryFilter) query.subCategory = subCategoryFilter;
        if (yearFilter) query.from = `${yearFilter}-01-01`;
        if (yearFilter) {
            if (monthFilter) {
                const monthIndex = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'].indexOf(monthFilter);
                if (monthIndex >= 0) {
                    const month = String(monthIndex + 1).padStart(2, '0');
                    query.from = `${yearFilter}-${month}-01`;
                    query.to = `${yearFilter}-${month}-31`;
                } else {
                    query.to = `${yearFilter}-12-31`;
                }
            } else {
                query.to = `${yearFilter}-12-31`;
            }
        }

        if (assigneeFilter === 'Team 1' || assigneeFilter === 'Team 2') {
            query.team = assigneeFilter;
        } else {
            const assigneeScope = ReportController.resolveOwnerIdFromFilter(assigneeFilter);
            if (assigneeScope?.ownerId) query.ownerId = assigneeScope.ownerId;
            if (assigneeScope?.historicalAssignee) query.historicalAssignee = assigneeScope.historicalAssignee;
        }

        return query;
    }

    function mapArchiveReportRowToCard(row) {
        const formatted = ReportController.formatTaskReportRow(row);
        return {
            id: formatted.id,
            businessId: formatted.businessId,
            companyName: formatted.businessName,
            city: formatted.city,
            district: formatted.district,
            assignee: formatted.assignee,
            ownerId: row.ownerId || '',
            status: formatted.statusKey,
            sourceType: formatted.sourceLabel,
            mainCategory: formatted.mainCategory,
            subCategory: formatted.subCategory,
            createdAt: row.createdAt || '',
            logs: formatted.lastActionDate && formatted.lastActionDate !== '-'
                ? [{ date: formatted.lastActionDate, text: formatted.logContent || formatted.latestLogLabel || '-' }]
                : [],
        };
    }

    function clearFilters() {
        AppState.setPage('archive', 1);
        _hasSearched = false;
        ['passiveSearchInput', 'passiveFilterStatus', 'passiveFilterAssignee',
         'passiveFilterCategory', 'passiveFilterSubCategory', 'passiveFilterDistrict',
         'passiveFilterYear', 'passiveFilterMonth'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        if (window.updateArchiveDistrictFilterOptions) window.updateArchiveDistrictFilterOptions();
        const btnClear = document.getElementById('btnClearArchiveFilters');
        if (btnClear) btnClear.style.display = 'none';
        
        const container = document.getElementById('passiveTasksContainer');
        if (container) container.innerHTML = `<div style="grid-column:1/-1; padding:40px; text-align:center; color:var(--text-muted); background:#fff; border-radius:var(--radius-md); border:1px solid var(--border-light);">Arşiv sonuçlarını görmek için lütfen filtreleme veya arama yapın.</div>`;
        const pag = document.getElementById('archivePagination'); if(pag) pag.innerHTML='';
    }

    async function renderPassiveTasks(isExplicit = false, options = {}) {
        const silent = Boolean(options?.silent);
        if (isExplicit === true) {
            _hasSearched = true;
            AppState.setPage('archive', 1);
        }
        
        // Eğer hiçbir zaman arama yapılmadıysa ve sayfa 1 ise mesajı göster
        if (!_hasSearched && AppState.pagination.archive === 1) {
            const container = document.getElementById('passiveTasksContainer');
            if (container) container.innerHTML = `<div style="grid-column:1/-1; padding:40px; text-align:center; color:var(--text-muted); background:#fff; border-radius:var(--radius-md); border:1px solid var(--border-light);">Arşiv sonuçlarını görmek için lütfen filtreleme veya arama yapın.</div>`;
            return;
        }

        const btnClear = document.getElementById('btnClearArchiveFilters');
        if (btnClear) btnClear.style.display = 'inline-block';

        const query = buildArchiveQuery();
        let rows = [];
        let totalCount = 0;
        let page = Math.max(1, Number(AppState?.pagination?.archive || 1));
        try {
            const dataService = typeof DataService !== 'undefined' ? DataService : null;
            const payload = typeof dataService?.fetchTaskPage === 'function'
                ? await dataService.fetchTaskPage({
                    _path: '/reports/tasks',
                    ...query,
                    page,
                    limit: ARCHIVE_PAGE_LIMIT,
                })
                : { items: [], total: 0, page, limit: ARCHIVE_PAGE_LIMIT };

            rows = Array.isArray(payload?.items) ? payload.items : [];
            totalCount = Number(payload?.total || rows.length || 0);
            page = Number(payload?.page || page || 1);
        } catch (err) {
            console.error('Archive report load failed:', err);
            if (!silent) {
                const container = document.getElementById('passiveTasksContainer');
                if (container) {
                    container.innerHTML = `<div style="grid-column:1/-1; padding:40px; text-align:center; color:var(--danger-color); background:#fff; border-radius:var(--radius-md); border:1px solid var(--border-light);">Arşiv verileri yüklenemedi.</div>`;
                }
            }
            return;
        }

        if (!rows.length && totalCount > 0 && page > 1) {
            const lastPage = Math.max(1, Math.ceil(totalCount / ARCHIVE_PAGE_LIMIT));
            if (lastPage !== page) {
                AppState.setPage('archive', lastPage);
                return ArchiveController.renderPassiveTasks(false, options);
            }
        }

        const visibleRows = rows.map(mapArchiveReportRowToCard);
        AppState.setFiltered('archive', visibleRows);
        
        const container = document.getElementById('passiveTasksContainer');
        if (!container) return;
        container.innerHTML = '';

        const pagContainer = getOrCreatePaginationContainer('archivePagination');
        pagContainer.innerHTML = '';

        if (!visibleRows.length) {
            container.innerHTML = `<div style="grid-column:1/-1; padding:40px; text-align:center; color:var(--text-muted); background:#fff; border-radius:var(--radius-md); border:1px solid var(--border-light);">Kayıt bulunamadı.</div>`;
            return;
        }

        container.className = 'task-grid-2col';
        const fragment = document.createDocumentFragment();
        visibleRows.forEach(t => fragment.appendChild(TaskController.createMinimalCard(t)));
        container.appendChild(fragment);

        renderPagination(pagContainer, totalCount, page, ARCHIVE_PAGE_LIMIT, (i) => {
            AppState.setPage('archive', i);
            ArchiveController.renderPassiveTasks(false, { silent: true });
        }, { compact: true, resultLabel: 'kayıt' });
    }

    return { clearFilters, renderPassiveTasks };
})();

// Global erişim
window.renderReports = ReportController.renderReports.bind(ReportController);
window.exportReportsToExcel = ReportController.exportTasksCSV.bind(ReportController);
window.exportAccountsToExcel = ReportController.exportAccountsCSV.bind(ReportController);
window.clearReportFilters = ReportController.clearFilters.bind(ReportController);
window.switchReportsTab = ReportController.switchReportsTab.bind(ReportController);
window.renderPassiveTasks = ArchiveController.renderPassiveTasks.bind(ArchiveController);
window.clearArchiveFilters = ArchiveController.clearFilters.bind(ArchiveController);
