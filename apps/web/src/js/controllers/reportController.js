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

    function formatTaskReportRow(row) {
        const sourceMap = {
            FRESH: 'Fresh Account',
            OLD: 'Old Account',
            QUERY: 'Old Account Query',
            RAKIP: 'Rakip',
            OLD_RAKIP: 'Old Account Rakip',
            REFERANS: 'Referans',
        };
        return {
            id: row.id,
            businessId: row.businessId || '',
            statusKey: String(row.statusKey || '').toLowerCase(),
            createdAt: row.createdAt ? formatDate(row.createdAt).split(' ')[0] : '-',
            businessName: row.businessName || '-',
            city: row.city || '-',
            district: row.district || '-',
            assignee: row.assignee || '-',
            statusLabel: getStatusLabel(row.statusKey),
            sourceLabel: sourceMap[String(row.sourceKey || '').toUpperCase()] || row.sourceKey || '-',
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
        const query = new URLSearchParams();
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
        const response = await DataService.apiRequest(`/reports/tasks${query ? `?${query}` : ''}`);
        const taskRows = (Array.isArray(response) ? response : []).map(formatTaskReportRow);
        const businessRows = getBusinessRowsFromTaskRows(taskRows);
        return {
            filteredTasks: [],
            taskRows,
            businessRows,
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

        if (!silent) {
            renderEmptyState('Rapor Hazırlanıyor', '⏳');
        }
        try {
            const nextState = await buildFilterResults();
            reportUiState.filteredTasks = nextState.filteredTasks;
            reportUiState.taskRows = nextState.taskRows;
            reportUiState.businessRows = nextState.businessRows;
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
    let _hasSearched = false;

    function buildArchiveQuery() {
        const getValue = id => document.getElementById(id)?.value || '';
        const query = new URLSearchParams();
        const searchFilter = normalizeText(getValue('passiveSearchInput'));
        const statusFilter = getValue('passiveFilterStatus');
        const yearFilter = getValue('passiveFilterYear');
        const monthFilter = getValue('passiveFilterMonth');
        const assigneeFilter = getValue('passiveFilterAssignee');
        const categoryFilter = getValue('passiveFilterCategory');
        const subCategoryFilter = getValue('passiveFilterSubCategory');
        const districtFilter = getValue('passiveFilterDistrict');

        if (searchFilter) query.set('q', searchFilter);
        if (statusFilter) query.set('status', ReportController.toApiTaskStatus(statusFilter));
        else query.set('generalStatus', 'CLOSED');
        if (districtFilter) query.set('district', districtFilter);
        if (categoryFilter) query.set('mainCategory', categoryFilter);
        if (subCategoryFilter) query.set('subCategory', subCategoryFilter);
        if (yearFilter) query.set('from', `${yearFilter}-01-01`);
        if (yearFilter) {
            if (monthFilter) {
                const monthIndex = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'].indexOf(monthFilter);
                if (monthIndex >= 0) {
                    const month = String(monthIndex + 1).padStart(2, '0');
                    query.set('from', `${yearFilter}-${month}-01`);
                    query.set('to', `${yearFilter}-${month}-31`);
                } else {
                    query.set('to', `${yearFilter}-12-31`);
                }
            } else {
                query.set('to', `${yearFilter}-12-31`);
            }
        }

        if (assigneeFilter === 'Team 1' || assigneeFilter === 'Team 2') {
            query.set('team', assigneeFilter);
        } else {
            const assigneeScope = ReportController.resolveOwnerIdFromFilter(assigneeFilter);
            if (assigneeScope?.ownerId) query.set('ownerId', assigneeScope.ownerId);
            if (assigneeScope?.historicalAssignee) query.set('historicalAssignee', assigneeScope.historicalAssignee);
        }

        return query.toString();
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
        if (isExplicit === true) _hasSearched = true;
        
        // Eğer hiçbir zaman arama yapılmadıysa ve sayfa 1 ise mesajı göster
        if (!_hasSearched && AppState.pagination.archive === 1) {
            const container = document.getElementById('passiveTasksContainer');
            if (container) container.innerHTML = `<div style="grid-column:1/-1; padding:40px; text-align:center; color:var(--text-muted); background:#fff; border-radius:var(--radius-md); border:1px solid var(--border-light);">Arşiv sonuçlarını görmek için lütfen filtreleme veya arama yapın.</div>`;
            return;
        }

        const btnClear = document.getElementById('btnClearArchiveFilters');
        if (btnClear) btnClear.style.display = 'inline-block';

        const query = buildArchiveQuery();
        let filtered = [];
        try {
            const response = await DataService.apiRequest(`/reports/tasks${query ? `?${query}` : ''}`);
            filtered = (Array.isArray(response) ? response : [])
                .map((row) => ReportController.formatTaskReportRow(row))
                .filter((row) => ['deal', 'cold'].includes(String(row.statusKey || '').toLowerCase()))
                .map((row) => ({
                    id: row.id,
                    businessId: row.businessId,
                    companyName: row.businessName,
                    city: row.city,
                    district: row.district,
                    assignee: row.assignee,
                    status: row.statusKey,
                    sourceType: row.sourceLabel,
                    mainCategory: row.mainCategory,
                    subCategory: row.subCategory,
                    createdAt: row.createdAt,
                    logs: row.lastActionDate && row.lastActionDate !== '-'
                        ? [{ date: row.lastActionDate, text: row.logContent || row.latestLogLabel || '-' }]
                        : [],
                }))
                .sort((a, b) => {
                    const bTime = b.logs?.length > 0 ? parseLogDate(b.logs[0].date) : new Date(b.createdAt || 0).getTime();
                    const aTime = a.logs?.length > 0 ? parseLogDate(a.logs[0].date) : new Date(a.createdAt || 0).getTime();
                    return bTime - aTime;
                });
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
