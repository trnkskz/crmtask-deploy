// ============================================================
// controllers/reportController.js
// Raporlama ve arşiv sayfası yönetimi
// ============================================================

const ReportController = (() => {
    const API_BASE = window.__API_BASE_URL__ || 'http://localhost:3001/api';
    const reportUiState = {
        activeTab: 'tasks',
        hasSubmittedFilters: false,
        filteredTasks: [],
        taskRows: [],
        businessRows: [],
    };

    function getReportTaskMetaMap() {
        if (typeof AppState.getReportTaskMetaMap === 'function') {
            return AppState.getReportTaskMetaMap();
        }

        const metaMap = new Map();
        AppState.tasks.forEach((task) => {
            const latestLog = task.logs?.[0] || null;
            const plainText = String(latestLog?.text || '').replace(/<[^>]*>?/gm, '').trim();
            const tagMatch = plainText.match(/^\[(.*?)\]/);
            metaMap.set(task.id, {
                latestLogText: latestLog?.text || '',
                latestLogTag: tagMatch ? tagMatch[1] : '',
                lastActionDate: latestLog?.date?.split(' ')[0]
                    || (task.createdAt ? new Date(task.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'İşlem Yok'),
                createdDateOnly: (task.createdAt || '').split('T')[0],
                feeVal: (task.dealDetails?.fee || 'Yok').toString().toLowerCase(),
                jokerVal: (task.dealDetails?.joker || 'Yok').toString().toLowerCase(),
            });
        });
        return metaMap;
    }

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

    function getStatusLabel(status) {
        return TASK_STATUS_LABELS?.[status] || String(status || '-');
    }

    function getSourceLabel(task, biz) {
        return task.sourceType || task.source || biz?.sourceType || biz?.source || '-';
    }

    function getLatestLogText(task, meta) {
        return stripHtml(meta?.latestLogText || task?.logs?.[0]?.text || '');
    }

    function getLatestLogLabel(task, meta) {
        return String(meta?.latestLogTag || '').trim() || '-';
    }

    function getConversationHistory(task) {
        return Array.isArray(task?.logs) ? task.logs.length : 0;
    }

    function getPublishedFeeText(task, meta) {
        const rawFee = String(task?.dealDetails?.fee || meta?.feeVal || '').trim();
        if (!rawFee || rawFee.toLowerCase() === 'yok') return '-';
        return rawFee;
    }

    function getLastActionText(task, meta) {
        return meta?.lastActionDate || (task?.createdAt ? formatDate(task.createdAt).split(' ')[0] : '-');
    }

    function isOpenTaskStatus(status) {
        return !['deal', 'cold'].includes(String(status || '').toLowerCase());
    }

    function getTaskDateValue(task, meta) {
        return meta?.createdDateOnly || (task?.createdAt ? String(task.createdAt).split('T')[0] : '');
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
        const openTaskCount = taskRows.filter(row => isOpenTaskStatus(row.statusKey)).length;
        const dealCount = taskRows.filter(row => row.statusKey === 'deal').length;
        const coldCount = taskRows.filter(row => row.statusKey === 'cold').length;
        const followupCount = taskRows.filter(row => row.statusKey === 'followup').length;
        const contactedTaskCount = taskRows.filter(row => row.conversationHistoryCount > 0).length;

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

        setMetric(1, 'Filtrelenen Görev', taskRows.length);
        setMetric(2, 'İşletme', businessRows.length);
        setMetric(3, 'Açık Görev', openTaskCount, '#bfdbfe');
        setMetric(4, 'Deal', dealCount, '#a7f3d0');
        setMetric(5, 'Cold', coldCount, '#fecaca');
        setMetric(6, 'Görüşülen', contactedTaskCount || followupCount);
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

    function getTaskRows(tasks, bizMap, reportMetaMap) {
        return tasks.map((task) => {
            const biz = bizMap.get(task.businessId) || {};
            const reportMeta = reportMetaMap.get(task.id) || {};
            return {
                id: task.id,
                statusKey: String(task.status || '').toLowerCase(),
                createdAt: formatDate(task.createdAt).split(' ')[0],
                businessName: biz.companyName || '-',
                city: biz.city || '-',
                district: biz.district || '-',
                assignee: task.assignee || '-',
                statusLabel: getStatusLabel(task.status),
                sourceLabel: getSourceLabel(task, biz),
                mainCategory: task.mainCategory || biz.mainCategory || '-',
                subCategory: task.subCategory || biz.subCategory || '-',
                publishedFeeText: getPublishedFeeText(task, reportMeta),
                latestLogLabel: getLatestLogLabel(task, reportMeta),
                conversationHistoryLabel: `${getConversationHistory(task)} kayıt`,
                conversationHistoryCount: getConversationHistory(task),
                logContent: getLatestLogText(task, reportMeta) || '-',
                lastActionDate: getLastActionText(task, reportMeta),
                rawTask: task,
            };
        });
    }

    function getBusinessRows(tasks, bizMap, reportMetaMap) {
        const grouped = new Map();
        tasks.forEach((task) => {
            const biz = bizMap.get(task.businessId) || {};
            const groupKey = task.businessId || biz.companyName || task.id;
            if (!grouped.has(groupKey)) {
                grouped.set(groupKey, {
                    id: task.businessId || task.id,
                    businessName: biz.companyName || '-',
                    city: biz.city || '-',
                    district: biz.district || '-',
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
                    latestMeta: reportMetaMap.get(task.id) || {},
                    latestLogLabel: '-',
                    latestLogText: '-',
                    publishedFeeText: '-',
                });
            }

            const group = grouped.get(groupKey);
            const meta = reportMetaMap.get(task.id) || {};
            const createdTime = new Date(task.createdAt || 0).getTime();
            const latestTime = new Date(group.latestTask?.createdAt || 0).getTime();
            if (createdTime > latestTime) {
                group.latestTask = task;
                group.latestMeta = meta;
            }

            group.taskCount += 1;
            if (isOpenTaskStatus(task.status)) group.openTaskCount += 1;
            if (String(task.status || '').toLowerCase() === 'deal') group.dealTaskCount += 1;
            if (String(task.status || '').toLowerCase() === 'cold') group.coldTaskCount += 1;
            group.conversationHistoryCount += getConversationHistory(task);
            group.sources.add(getSourceLabel(task, biz));
            group.mainCategories.add(task.mainCategory || biz.mainCategory || '-');
            group.subCategories.add(task.subCategory || biz.subCategory || '-');
            group.assignees.add(task.assignee || '-');

            const currentFee = getPublishedFeeText(task, meta);
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
                latestLogLabel: getLatestLogLabel(group.latestTask, group.latestMeta),
                conversationHistoryLabel: `${group.conversationHistoryCount} kayıt`,
                conversationHistoryCount: group.conversationHistoryCount,
                logContent: getLatestLogText(group.latestTask, group.latestMeta) || '-',
                lastActionDate: getLastActionText(group.latestTask, group.latestMeta),
                latestTaskId: group.latestTask?.id || '',
                openTaskCount: group.openTaskCount,
                dealTaskCount: group.dealTaskCount,
                coldTaskCount: group.coldTaskCount,
            }))
            .sort((a, b) => new Date(b.lastActionDate || 0) - new Date(a.lastActionDate || 0));
    }

    function buildFilterResults() {
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

        const bizMap = AppState.getBizMap();
        const reportMetaMap = getReportTaskMetaMap();

        const filtered = AppState.tasks.filter(t => {
            const biz = bizMap.get(t.businessId) || {};
            const reportMeta = reportMetaMap.get(t.id) || {};
            if (t.assignee && typeof AppState.isOperationalTaskAssignee === 'function' && !AppState.isOperationalTaskAssignee(t.assignee)) {
                return false;
            }
            if (!matchesAssigneeFilter(t, fAssignee, AppState.users)) return false;
            if (fStatus && t.status !== fStatus) return false;
            if (normalizedSourceFilter) {
                const taskSource = typeof normalizeTaskSourceKey === 'function'
                    ? normalizeTaskSourceKey(t.sourceType || t.source || biz.sourceType || biz.source)
                    : String(t.sourceType || t.source || biz.sourceType || biz.source || '').trim();
                if (taskSource !== normalizedSourceFilter) return false;
            }
            if (!matchesCategoryFilter(t, fCat, fSubCat, biz.companyName)) return false;
            if (fCity && String(biz.city || '') !== fCity) return false;
            if (fDistrict && String(biz.district || '') !== fDistrict) return false;
            if (fLogType) {
                const latestLogTag = String(reportMeta.latestLogTag || '').trim();
                const latestLogText = String(reportMeta.latestLogText || '');
                if (latestLogTag !== fLogType && !latestLogText.includes(`[${fLogType}]`)) return false;
            }
            if (fDealFee) {
                if (t.status !== 'deal') return false;
                if (!t.dealDetails) return false;

                if (fDealFee === 'bedelsiz') {
                    if (reportMeta.feeVal !== 'yok' && reportMeta.feeVal !== '0' && reportMeta.feeVal !== '0 tl' && reportMeta.feeVal !== 'bedelsiz') return false;
                } else if (fDealFee === 'ucretli') {
                    if (reportMeta.feeVal === 'yok' || reportMeta.feeVal === '0' || reportMeta.feeVal === '0 tl' || reportMeta.feeVal === 'bedelsiz') return false;
                } else if (fDealFee === 'joker') {
                    if (reportMeta.jokerVal === 'yok' || reportMeta.jokerVal === '0' || reportMeta.jokerVal === '') return false;
                }
            }

            const taskDate = getTaskDateValue(t, reportMeta);
            if (sDate && taskDate && taskDate < sDate) return false;
            if (eDate && taskDate && taskDate > eDate) return false;
            return true;
        });

        filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        return {
            filteredTasks: filtered,
            taskRows: getTaskRows(filtered, bizMap, reportMetaMap),
            businessRows: getBusinessRows(filtered, bizMap, reportMetaMap),
        };
    }

    function renderReports(forceApply = false) {
        if (forceApply) {
            reportUiState.hasSubmittedFilters = true;
            AppState.setPage('reports', 1);
        }

        if (AppState.isDataSyncing) {
            renderEmptyState('Veriler Senkronize Ediliyor', '⏳');
            return;
        }

        syncTabButtons();
        setTableHead();

        if (!reportUiState.hasSubmittedFilters) {
            renderEmptyState('Rapor Bekleniyor');
            const pagEl = document.getElementById('reportsPagination');
            if (pagEl) pagEl.innerHTML = '';
            return;
        }

        const nextState = buildFilterResults();
        reportUiState.filteredTasks = nextState.filteredTasks;
        reportUiState.taskRows = nextState.taskRows;
        reportUiState.businessRows = nextState.businessRows;
        AppState.setFiltered('reports', nextState.filteredTasks);
        _displayReports();
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

        const start = (page - 1) * ITEMS_PER_PAGE;
        const paginated = filtered.slice(start, start + ITEMS_PER_PAGE);
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

        renderPagination(pagContainer, filtered.length, page, ITEMS_PER_PAGE, (i) => {
            AppState.setPage('reports', i);
            _displayReports();
        });
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
        _displayReports();
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
            const rows = reportUiState.taskRows.map((row) => ([
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
            const rows = reportUiState.businessRows.map((row) => ([
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

    return { clearFilters, renderReports, exportTasksCSV, exportAccountsCSV, switchReportsTab };
})();

// ============================================================
// controllers/archiveController.js
// Arşiv (pasif görevler) sayfası yönetimi
// ============================================================

const ArchiveController = (() => {
    let _hasSearched = false;

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

    function renderPassiveTasks(isExplicit = false) {
        if (isExplicit === true) _hasSearched = true;
        
        // Eğer hiçbir zaman arama yapılmadıysa ve sayfa 1 ise mesajı göster
        if (!_hasSearched && AppState.pagination.archive === 1) {
            const container = document.getElementById('passiveTasksContainer');
            if (container) container.innerHTML = `<div style="grid-column:1/-1; padding:40px; text-align:center; color:var(--text-muted); background:#fff; border-radius:var(--radius-md); border:1px solid var(--border-light);">Arşiv sonuçlarını görmek için lütfen filtreleme veya arama yapın.</div>`;
            return;
        }

        const getValue = id => document.getElementById(id)?.value || '';
        const searchFilter = normalizeText(getValue('passiveSearchInput'));
        const statusFilter = getValue('passiveFilterStatus');
        const yFilter = getValue('passiveFilterYear');
        const mFilter = getValue('passiveFilterMonth');
        const aFilter = getValue('passiveFilterAssignee');
        const cFilter = getValue('passiveFilterCategory');
        const sFilter = getValue('passiveFilterSubCategory');
        const dFilter = getValue('passiveFilterDistrict');

        const btnClear = document.getElementById('btnClearArchiveFilters');
        if (btnClear) btnClear.style.display = 'inline-block';

        const bizMap = AppState.getBizMap();
        const filtered = AppState.tasks
            .filter(t => {
                const stat = (t.status || '').toLowerCase();
                // Eğer status boş ama içinde deal/cold kelimesi geçiyorsa onları da yakala (Grupanya eski data koruması)
                if(stat === 'deal' || stat === 'cold') return true;
                
                // Ekstra Güvenlik: Status boş olsa bile loglardan son durumu kontrol et
                if (t.logs && t.logs.length > 0) {
                    const lastLogText = t.logs[0].text.toLowerCase();
                    if (lastLogText.includes('[deal sonucu]')) return true;
                }
                return false;
            })
            .filter(t => {
                const biz = bizMap.get(t.businessId) || t;
                if (searchFilter) {
                    const matchesSearch = typeof businessMatchesSearch === 'function'
                        ? businessMatchesSearch(biz, searchFilter)
                        : normalizeText(biz.companyName).includes(searchFilter);
                    if (!matchesSearch) return false;
                }
                const currentStatus = (t.status || '').toLowerCase();
                if (statusFilter && currentStatus !== statusFilter) return false;
                
                if (!matchesAssigneeFilter(t, aFilter, AppState.users)) return false;
                if (!matchesCategoryFilter(t, cFilter, sFilter, biz.companyName)) return false;
                if (dFilter && biz.district !== dFilter) return false;

                // Tarih bazlı kayıpları önlemek için güvenli tarih ayrıştırma
                let logTime = 0;
                if (t.logs && t.logs.length > 0) {
                    logTime = parseLogDate(t.logs[0].date);
                } 
                if (!logTime && t.createdAt) {
                    logTime = new Date(t.createdAt).getTime();
                }
                
                const d = new Date(logTime || Date.now());
                const tYear = d.getFullYear().toString();
                const tMonth = d.toLocaleDateString('tr-TR', { month: 'long' });
                const tMonthCap = tMonth.charAt(0).toUpperCase() + tMonth.slice(1);
                
                if (yFilter && tYear !== yFilter) return false;
                if (mFilter && tMonthCap !== mFilter) return false;
                
                return true;
            })
            .sort((a, b) =>
                ((b.logs?.length > 0 ? parseLogDate(b.logs[0].date) : 0)) -
                ((a.logs?.length > 0 ? parseLogDate(a.logs[0].date) : 0))
            );

        AppState.setFiltered('archive', filtered);
        
        // EĞER YENİ BİR ARAMA/FİLTRELEME YAPILDIYSA SAYFAYI 1'E SIFIRLA
        // SADECE SAYFA DEĞİŞTİRİLİYORSA MEVCUT SAYFAYI KORU
        if (isExplicit) {
            AppState.setPage('archive', 1);
        }
        
        const container = document.getElementById('passiveTasksContainer');
        if (!container) return;
        container.innerHTML = '';

        const pagContainer = getOrCreatePaginationContainer('archivePagination');
        pagContainer.innerHTML = '';

        if (filtered.length === 0) {
            container.innerHTML = `<div style="grid-column:1/-1; padding:40px; text-align:center; color:var(--text-muted); background:#fff; border-radius:var(--radius-md); border:1px solid var(--border-light);">Kayıt bulunamadı.</div>`;
            return;
        }

        container.className = 'task-grid-2col';
        const page = AppState.pagination.archive || 1; // Sabit 1 yerine State'ten dinamik al
        const start = (page - 1) * 25;
        const paginated = filtered.slice(start, start + 25);
        
        const fragment = document.createDocumentFragment();
        paginated.forEach(t => fragment.appendChild(TaskController.createMinimalCard(t)));
        container.appendChild(fragment);

        // Parametreye sabit 1 yerine dinamik 'page' değişkenini yolluyoruz
        renderPagination(pagContainer, filtered.length, page, 25, (i) => {
            AppState.setPage('archive', i);
            // 'false' gönderiyoruz ki yukarıdaki if(isExplicit) bloğuna girmesin ve sayfayı 1'e sıfırlamasın
            ArchiveController.renderPassiveTasks(false); 
        });
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
