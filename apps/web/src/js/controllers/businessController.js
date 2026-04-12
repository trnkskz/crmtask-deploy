// ==========================================
// BUSINESS CONTROLLER
// ==========================================
const BusinessController = {
    _findAssignableUser(ref) {
        const raw = String(ref || '').trim();
        if (!raw) return null;
        const users = Array.isArray(AppState?.users) ? AppState.users : [];
        const normalizedRef = typeof normalizeForComparison === 'function'
            ? normalizeForComparison(raw)
            : raw.toLocaleLowerCase('tr-TR');

        return users.find((user) => {
            const byId = String(user?.id || '').trim() === raw;
            const byName = (typeof normalizeForComparison === 'function'
                ? normalizeForComparison(user?.name)
                : String(user?.name || '').trim().toLocaleLowerCase('tr-TR')) === normalizedRef;
            const byEmail = (typeof normalizeForComparison === 'function'
                ? normalizeForComparison(user?.email)
                : String(user?.email || '').trim().toLocaleLowerCase('tr-TR')) === normalizedRef;
            return byId || byName || byEmail;
        }) || null;
    },

    async _resolveAssignableOwnerId(ref) {
        const raw = String(ref || '').trim();
        if (!raw || raw === 'UNASSIGNED' || raw === 'TARGET_POOL' || raw.startsWith('TARGET_POOL') || raw === 'Team 1' || raw === 'Team 2') {
            return null;
        }

        let matchedUser = this._findAssignableUser(raw);
        if (!matchedUser && typeof DataService?.fetchOnce === 'function') {
            try {
                const usersRaw = await DataService.fetchOnce('users');
                const users = Array.isArray(usersRaw) ? usersRaw : Object.values(usersRaw || {});
                if (users.length > 0) {
                    AppState.users = users;
                    matchedUser = this._findAssignableUser(raw);
                }
            } catch (err) {
                console.warn('Assignable user refresh failed:', err);
            }
        }

        return matchedUser?.id || null;
    },

    _refreshTaskSurfaces() {
        if (typeof window.renderMyTasks === 'function') {
            setTimeout(() => window.renderMyTasks(), 0);
        }
        if (typeof window.renderAllTasks === 'function') {
            setTimeout(() => window.renderAllTasks(), 0);
        }
        if (typeof DashboardController !== 'undefined' && typeof DashboardController.render === 'function') {
            setTimeout(() => DashboardController.render(true), 0);
        }
    },

    async _syncBusinessTasksIntoState(bizId) {
        if (!bizId) return;
        const rows = await DataService.apiRequest(`/accounts/${bizId}/task-history`);
        if (!Array.isArray(rows) || rows.length === 0) return;

        const historyMap = new Map(rows.map((row) => [row.id, row]));
        const nextTasks = Array.isArray(AppState.tasks) ? [...AppState.tasks] : [];
        let changed = false;

        for (let i = 0; i < nextTasks.length; i += 1) {
            const task = nextTasks[i];
            if (!task || task.businessId !== bizId) continue;
            const snapshot = historyMap.get(task.id);
            if (!snapshot) continue;

            const nextStatus = String(snapshot.status || '').toLowerCase();
            if (nextStatus && nextStatus !== task.status) {
                nextTasks[i] = {
                    ...task,
                    status: nextStatus,
                    closedAt: snapshot.closedAt || task.closedAt || null,
                    closedReason: snapshot.closedReason || task.closedReason || null,
                };
                if (typeof AppState.setTaskDetail === 'function') {
                    AppState.setTaskDetail(task.id, nextTasks[i]);
                }
                changed = true;
            }
        }

        if (changed) {
            AppState.tasks = nextTasks;
        }
    },

    _commitBusinessState(biz) {
        if (!biz?.id) return null;
        const bizIndex = AppState.businesses.findIndex((item) => item.id === biz.id);
        if (bizIndex < 0) {
            AppState.businesses = [...AppState.businesses, biz];
        } else {
            const nextBusinesses = [...AppState.businesses];
            nextBusinesses[bizIndex] = biz;
            AppState.businesses = nextBusinesses;
        }
        if (typeof AppState.setBusinessDetail === 'function') {
            AppState.setBusinessDetail(biz.id, biz);
        }
        return biz;
    },

    _mergeVisibleBusinesses(items = []) {
        const incoming = Array.isArray(items) ? items.filter((item) => item?.id) : [];
        const nextMap = new Map();
        (Array.isArray(AppState.businesses) ? AppState.businesses : []).forEach((item) => {
            if (item?.id) nextMap.set(item.id, item);
        });
        incoming.forEach((item) => nextMap.set(item.id, item));
        AppState.businesses = Array.from(nextMap.values()).slice(-200);
    },

    _normalizeSourceKey(value) {
        if (typeof normalizeTaskSourceKey === 'function') return normalizeTaskSourceKey(value);
        const raw = String(value || '').trim().toUpperCase();
        if (!raw) return '';
        if (raw.includes('OLD ACCOUNT RAKIP') || raw.includes('OLD_RAKIP')) return 'OLD_RAKIP';
        if (raw.includes('OLD ACCOUNT QUERY') || raw.includes('OLD_QUERY')) return 'OLD_QUERY';
        if (raw === 'QUERY' || raw.startsWith('QUERY ') || raw.includes(' QUERY')) return 'QUERY';
        if (raw.includes('LEAD')) return 'LEAD';
        if (raw.includes('RAKIP')) return 'RAKIP';
        if (raw.includes('REFERANS')) return 'REFERANS';
        if (raw.includes('OLD')) return 'OLD';
        if (raw.includes('FRESH')) return 'FRESH';
        return raw;
    },

    _detectCsvColumnMap(rawHeaders) {
        const headers = Array.isArray(rawHeaders)
            ? rawHeaders.map((h) => h ? h.trim().toLocaleLowerCase('tr-TR').replace(/\u0307/g, '') : '')
            : [];
        return {
            companyName: headers.findIndex(h => h.includes('işletme') || h.includes('firma') || h.includes('şube')),
            taskCategory: headers.findIndex(h => h.includes('task kategorisi') || h.includes('task kategori')),
            sourceType: headers.findIndex(h => h.includes('kaynak')),
            city: headers.findIndex(h => h === 'il' || h === 'şehir'),
            district: headers.findIndex(h => h.includes('ilçe')),
            address: headers.findIndex(h => h.includes('adres')),
            mainCategory: headers.findIndex(h => h.includes('ana kategori')),
            subCategory: headers.findIndex(h => h.includes('alt kategori')),
            campaignUrl: headers.findIndex(h => h.includes('kampanya') || h.includes('link')),
            contactName: headers.findIndex(h => h.includes('yetkili') || h.includes('isim')),
            contactPhone: headers.findIndex(h => h.includes('telefon') || h.includes('iletişim')),
            contactEmail: headers.findIndex(h => h.includes('e-posta') || h.includes('email') || h.includes('mail')),
            website: headers.findIndex(h => h.includes('web')),
            instagram: headers.findIndex(h => h.includes('instagram') || h.includes('ınstagram')),
            loglama: headers.findIndex(h => h.includes('loglama') || h.includes('görüşme') || h.includes('log')),
            durum: headers.findIndex(h => h === 'durum' || h === 'status' || h === 'öncelik'),
            taskTarihi: headers.findIndex(h =>
                (h.includes('tarih') || h.includes('task yaratma')) &&
                !h.includes('aranacak') &&
                !h.includes('tekrar ara') &&
                !h.includes('next call') &&
                !h.includes('nextcall') &&
                !h.includes('follow up')
            ),
            aranacakTarih: headers.findIndex(h => h.includes('aranacak') || h.includes('tekrar ara') || h.includes('next call') || h.includes('nextcall') || h.includes('follow up')),
            sonSatisci: headers.findIndex(h => h.includes('satışçı') || h.includes('satisci') || h.includes('sorumlu') || h.includes('satışcı'))
        };
    },

    _inferCsvStatusColumnIndex(rows, map) {
        if (!Array.isArray(rows) || rows.length < 2) return map?.durum ?? -1;
        if (Number.isInteger(map?.durum) && map.durum >= 0) return map.durum;

        const header = Array.isArray(rows[0]) ? rows[0] : [];
        const sampleRows = rows.slice(1, 26).filter(Array.isArray);
        const knownStatuses = new Set([
            'cold',
            'deal',
            'hot',
            'not hot',
            'nothot',
            'followup',
            'follow up',
            'new',
            'takip',
            'ılık',
            'ilik',
            'sicak',
            'sıcak',
        ]);

        let bestIndex = -1;
        let bestScore = 0;

        for (let col = 0; col < header.length; col += 1) {
            const headerValue = String(header[col] || '').trim();
            if (headerValue) continue;
            if (col === map?.loglama || col === map?.taskTarihi || col === map?.aranacakTarih) continue;

            let score = 0;
            for (const row of sampleRows) {
                const rawValue = String(row[col] || '').trim().toLocaleLowerCase('tr-TR');
                if (!rawValue) continue;
                if (knownStatuses.has(rawValue)) score += 1;
            }

            if (score > bestScore) {
                bestScore = score;
                bestIndex = col;
            }
        }

        return bestScore > 0 ? bestIndex : -1;
    },

    _buildCsvImportRows(rows, map) {
        const payloadRows = [];
        for (let j = 1; j < rows.length; j++) {
            const rowData = rows[j];
            const getCol = (k) => map[k] !== -1 && rowData[map[k]] ? rowData[map[k]].trim() : '';

            payloadRows.push({
                rowNumber: j + 1,
                companyName: getCol('companyName'),
                taskCategory: getCol('taskCategory'),
                sourceType: getCol('sourceType'),
                city: getCol('city'),
                district: getCol('district'),
                address: getCol('address'),
                mainCategory: getCol('mainCategory'),
                subCategory: getCol('subCategory'),
                campaignUrl: getCol('campaignUrl'),
                contactName: getCol('contactName'),
                contactPhone: getCol('contactPhone'),
                contactEmail: getCol('contactEmail'),
                website: getCol('website'),
                instagram: getCol('instagram'),
                loglama: getCol('loglama'),
                durum: getCol('durum'),
                taskTarihi: getCol('taskTarihi'),
                aranacakTarih: getCol('aranacakTarih'),
                sonSatisci: getCol('sonSatisci')
            });
        }
        return payloadRows;
    },

    _resolveCsvImportChunkSize(totalRowCount) {
        return Number(totalRowCount) >= 10000 ? 50 : 100;
    },

    toggleCampaignUrl() {
        syncCampaignUrlVisibility('sourceType', 'campaignUrlGroup', 'campaignUrl');
    },

    addDynamicContactRow() {
        const container = document.getElementById('dynamicContactsContainer');
        if (!container) return;

        const row = document.createElement('div');
        row.className = 'dynamic-contact-row';
        row.innerHTML = `
            <button type="button" onclick="this.parentElement.remove()" class="btn-remove-contact">✖ Sil</button>
            <div class="form-grid">
                <div class="form-group"><label>Yetkili İsim</label><input type="text" class="dyn-name" value=""></div>
                <div class="form-group"><label>Telefon</label><input type="text" class="dyn-phone" value=""></div>
                <div class="form-group full-width"><label>E-Posta</label><input type="text" class="dyn-email" value=""></div>
            </div>
        `;
        container.appendChild(row);
    },

    updateUpdDistricts() {
        const city = document.getElementById('upd_city')?.value || '';
        const districtSelect = document.getElementById('upd_district');
        if (!districtSelect) return;

        const selectedDistrict = districtSelect.value || '';
        const districtSource = (typeof DISTRICT_DATA !== 'undefined' ? DISTRICT_DATA : districtData) || {};
        const districts = city ? (districtSource[city] || ['Merkez', 'Diğer']) : [];

        districtSelect.innerHTML = '<option value="">Seçilmedi</option>';
        districts.forEach((district) => districtSelect.add(new Option(district, district)));

        districtSelect.value = selectedDistrict && districts.includes(selectedDistrict) ? selectedDistrict : '';
    },

    // ---- Filtre durumu ----
    _taskFilterState: 0,   // 0=tümü 1=open 2=close
    _isBizSearched: false,
    _currentFilteredBiz: [],
    _currentBizTotal: 0,
    _bizCurrentPage: 1,
    _globalSelectedBizIds: new Set(),

    async _fetchBusinessTaskHistory(bizId) {
        if (!bizId || typeof DataService?.apiRequest !== 'function') return [];
        const response = await DataService.apiRequest(`/accounts/${encodeURIComponent(bizId)}/task-history`);
        return Array.isArray(response) ? response : [];
    },

    _mapBusinessTaskRows(historyRows) {
        const rows = Array.isArray(historyRows) ? historyRows : [];
        return rows.map((row) => ({
            id: row.id,
            createdAt: row.creationDate || '',
            creationDate: row.creationDate || '',
            assignee: row.historicalAssignee || row.owner?.name || row.owner?.email || 'Havuz',
            historicalAssignee: row.historicalAssignee || '',
            owner: row.owner || null,
            mainCategory: row.mainCategory || '-',
            subCategory: row.subCategory || '-',
            sourceType: row.source || '-',
            sourceKey: row.source || '-',
            status: row.status || '',
            statusKey: typeof normalizeTaskStatusKey === 'function'
                ? normalizeTaskStatusKey(row.status || '')
                : String(row.status || '').toLowerCase(),
            statusLabel: row.status || '',
            generalStatus: row.generalStatus || '',
            closedAt: row.closedAt || null,
            closedReason: row.closedReason || null,
        }));
    },

    _buildBusinessQuery() {
        const selectedSources = Array.from(document.querySelectorAll('.biz-source-filter:checked'))
            .map(cb => this._normalizeSourceKey(cb.value))
            .filter(Boolean);
        const getValue = id => {
            const el = document.getElementById(id);
            return el ? String(el.value || '').trim() : '';
        };
        const assigneeFilter = getValue('filterBizAssignee');
        const businessStatus = getValue('filterBizStatus') || 'Aktif';
        const query = {
            view: 'summary',
            page: this._bizCurrentPage,
            limit: 25,
            q: getValue('filterBizName'),
            sourceType: selectedSources.join(','),
            mainCategory: getValue('filterBizCategory'),
            subCategory: getValue('filterBizSubCategory'),
            city: getValue('filterBizCity'),
            district: getValue('filterBizDistrict'),
            businessStatus: businessStatus === 'Tümü' ? '' : businessStatus,
            createdFrom: getValue('filterBizDateStart'),
            createdTo: getValue('filterBizDateEnd'),
            taskScope: this._taskFilterState === 1 ? 'open' : (this._taskFilterState === 2 ? 'closed' : 'all'),
            sort: 'newest',
        };

        if (assigneeFilter === 'Team 1' || assigneeFilter === 'Team 2') {
            query.team = assigneeFilter;
        } else if (assigneeFilter) {
            query.assignee = assigneeFilter;
        }

        return query;
    },

    // ---- Arama & Listeleme ----

    async search(isExplicitSearch = false) {
        if (isExplicitSearch) {
            this._bizCurrentPage = 1;
            this._globalSelectedBizIds.clear();
            const selectAllCheckbox = document.getElementById('selectAllBiz');
            if (selectAllCheckbox) selectAllCheckbox.checked = false;
        }

        if (isExplicitSearch) { this._isBizSearched = true; this._bizCurrentPage = 1; }
        if (!this._isBizSearched) {
            const listContainer = document.getElementById('businessesListContainer');
            if (listContainer) listContainer.innerHTML = `<div class="empty-search-message">İşletmeleri listelemek için arama yapın.</div>`;
            const bulkContainer = document.getElementById('bulkActionContainer'); if (bulkContainer) bulkContainer.style.display = 'none';
            const pagContainer = document.getElementById('bizPagination'); if (pagContainer) pagContainer.innerHTML = '';
            const btnClear = document.getElementById('btnClearBizFilters'); if (btnClear) btnClear.style.display = 'none';
            return;
        }

        const btnClear = document.getElementById('btnClearBizFilters'); if (btnClear) btnClear.style.display = 'inline-block';
        const btnClear2 = document.getElementById('btnClearBizFilters2'); if (btnClear2) btnClear2.style.display = 'inline-flex';

        const listContainer = document.getElementById('businessesListContainer');
        if (listContainer) listContainer.innerHTML = `<div class="no-records-message">Kayıtlar yükleniyor...</div>`;

        try {
            const payload = await DataService.fetchBusinessPage(this._buildBusinessQuery());
            if (!payload.items.length && payload.total > 0 && this._bizCurrentPage > 1) {
                this._bizCurrentPage = Math.max(1, Math.ceil(payload.total / Math.max(payload.limit || 25, 1)));
                return this.search(false);
            }
            this._currentFilteredBiz = payload.items;
            this._currentBizTotal = payload.total;
            this._mergeVisibleBusinesses(payload.items);
            this._renderList();
        } catch (err) {
            console.error('Business list backend query failed:', err);
            showToast(err?.message || 'İşletme listesi yüklenemedi.', 'error');
            this._currentFilteredBiz = [];
            this._currentBizTotal = 0;
            this._renderList();
        }
    },

    _renderList() {
        const listContainer = document.getElementById('businessesListContainer');
        if (!listContainer) return;
        listContainer.innerHTML = '';
        listContainer.className = '';

        let pagContainer = document.getElementById('bizPagination');
        if (!pagContainer) {
            pagContainer = document.createElement('div');
            pagContainer.id = 'bizPagination';
            pagContainer.className = 'pagination-container';
            listContainer.parentNode.insertBefore(pagContainer, listContainer);
        }
        pagContainer.innerHTML = '';

        if (AppState.loggedInUser.role === 'Yönetici') {
            const bulkContainer = document.getElementById('bulkActionContainer');
            if (bulkContainer) bulkContainer.style.display = this._currentBizTotal > 0 ? 'flex' : 'none';
        }
        if (this._currentBizTotal === 0 || this._currentFilteredBiz.length === 0) {
            listContainer.innerHTML = `<div class="no-records-message">Kayıt bulunamadı.</div>`;
            return;
        }

        const itemsPerPage = 25;
        const totalPages = Math.ceil(this._currentBizTotal / itemsPerPage);
        if (this._bizCurrentPage > totalPages) this._bizCurrentPage = totalPages || 1;

        this._currentFilteredBiz.forEach(biz => {
            const statusClass = String(biz.latestTaskStatus || '').toLowerCase();
            const statusText = biz.latestTaskStatus
                ? ((typeof TASK_STATUS_LABELS !== 'undefined' && TASK_STATUS_LABELS[statusClass]) ? TASK_STATUS_LABELS[statusClass] : String(biz.latestTaskStatus).toUpperCase())
                : (biz.hasActiveTask ? 'AKTİF' : 'GÖREV YOK');
            const card = document.createElement('div');
            
            // Çakışmayı önlemek için inline cssText ve event listener'ları temizledik
            card.style.cssText = ''; 
            card.className = 'ultra-biz-card';
            card.setAttribute('onclick', `openBusinessDetailModal('${biz.id}')`);

            const checkboxHtml = '';

            const safeStatusClass = statusClass || (biz.hasActiveTask ? 'active' : 'none');
            const assigneeText = biz.latestTaskAssignee || 'Atanmamış';
            const sourceText = biz.latestTaskSource || biz.sourceType || '-';

            const initials = (biz.companyName || 'I').charAt(0).toUpperCase();
            const isPasif = (biz.businessStatus === 'Pasif');
            card.innerHTML = `
                <div class="ubc-left" style="${isPasif ? 'opacity:0.6' : ''}">
                    <div class="ubc-corporate-icon" style="${isPasif ? 'background:#64748b' : ''}">${initials}</div>
                    <div class="ubc-info">
                        <h4 title="${biz.companyName}">${biz.companyName} ${isPasif ? '<span style="font-size:10px; color:#ef4444; font-weight:800;">[PASİF]</span>' : ''}</h4>
                        <span>📍 ${biz.city || '-'}</span>
                    </div>
                </div>
                <div class="ubc-tags">
                    <span class="ubc-tag">${sourceText}</span>
                    <span class="ubc-tag">${assigneeText}</span>
                    <span class="ubc-tag status-${safeStatusClass}">${statusText}</span>
                </div>
            `;
            listContainer.appendChild(card);
        });

        renderPagination(pagContainer, this._currentBizTotal, this._bizCurrentPage, itemsPerPage, (i) => {
            this._bizCurrentPage = i;
            this.search(false);
        }, { compact: true, resultLabel: 'kayıt' });
    },

    triggerBizLiveFilter() {
        if (this._isBizSearched) {
            this.search(true);
        }
    },

    clearFilters() {
        this._bizCurrentPage = 1;
        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        setVal('filterBizName', ''); setVal('filterBizCategory', '');
        setVal('filterBizCity', ''); setVal('filterBizDistrict', ''); setVal('filterBizAssignee', '');
        setVal('filterBizDateStart', ''); setVal('filterBizDateEnd', '');
        if (window.updateBizDistrictFilterOptions) window.updateBizDistrictFilterOptions();
        if (window.populateAllSubCategoriesForFilter) window.populateAllSubCategoriesForFilter();
        document.querySelectorAll('.biz-source-filter').forEach(cb => cb.checked = false);

        this._taskFilterState = 0;
        const btnOpen = document.getElementById('btnOpenTaskFilter');
        if (btnOpen) { btnOpen.style.background = '#e8f0e5'; btnOpen.style.color = 'var(--secondary-color)'; btnOpen.innerHTML = '⚪ Task: Tümü'; }

        this._isBizSearched = false;
        this._globalSelectedBizIds.clear();
        const selectAllCheckbox = document.getElementById('selectAllBiz'); if (selectAllCheckbox) selectAllCheckbox.checked = false;
        this._currentFilteredBiz = [];
        this._currentBizTotal = 0;

        const listContainer = document.getElementById('businessesListContainer');
        if (listContainer) listContainer.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-muted); background:#fff; border-radius:8px; border:1px solid var(--border-light);">İşletmeleri listelemek için arama yapın.</div>`;
        const bulkContainer = document.getElementById('bulkActionContainer'); if (bulkContainer) bulkContainer.style.display = 'none';
        const pagContainer = document.getElementById('bizPagination'); if (pagContainer) pagContainer.innerHTML = '';
        const btnClear = document.getElementById('btnClearBizFilters'); if (btnClear) btnClear.style.display = 'none';
        const btnClear2 = document.getElementById('btnClearBizFilters2'); if (btnClear2) btnClear2.style.display = 'none';
    },

    toggleOpenTaskFilter() {
        this._taskFilterState = (this._taskFilterState + 1) % 3;
        const btn = document.getElementById('btnOpenTaskFilter');
        if (!btn) return;
        if (this._taskFilterState === 0) { btn.style.background = '#e8f0e5'; btn.style.color = 'var(--secondary-color)'; btn.innerHTML = '⚪ Task: Tümü'; }
        else if (this._taskFilterState === 1) { btn.style.background = '#dcfce7'; btn.style.color = '#166534'; btn.innerHTML = '🟢 Open Task'; }
        else if (this._taskFilterState === 2) { btn.style.background = '#fee2e2'; btn.style.color = '#991b1b'; btn.innerHTML = '🔴 Close Task'; }
        if (this._isBizSearched) this.search(true);
    },

    toggleBusinessActiveStatus(bizId, currentStatus = 'Aktif') {
        const biz = AppState.businesses.find((b) => b.id === bizId);
        if (!bizId || !biz) return;

        const normalizedCurrent = String(currentStatus || biz.businessStatus || 'Aktif');
        const nextStatus = normalizedCurrent === 'Pasif' ? 'Aktif' : 'Pasif';
        const actionLabel = nextStatus === 'Pasif' ? 'pasife almak' : 'aktifleştirmek';

        askConfirm(`"${biz.companyName}" işletmesini ${actionLabel} istiyor musunuz?`, async (confirmed) => {
            if (!confirmed) return;

            try {
                await DataService.apiRequest(`/accounts/${bizId}/status`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        businessStatus: nextStatus === 'Pasif' ? 'PASSIVE' : 'ACTIVE'
                    })
                });

                biz.businessStatus = nextStatus;
                AppState.invalidateBizMapCache?.();
                await this._syncBusinessTasksIntoState(bizId);

                if (typeof addSystemLog === 'function') {
                    addSystemLog(`İşletme durumu güncellendi: ${biz.companyName} -> ${nextStatus}`);
                }
                showToast(`İşletme ${nextStatus === 'Pasif' ? 'pasife alındı' : 'aktifleştirildi'}.`, 'success');
                this._refreshTaskSurfaces();

                if (this._isBizSearched) this.search(false);
                this.openDetailModal(bizId);
            } catch (err) {
                console.error('Business status toggle failed:', err);
                showToast(err?.message || 'İşletme durumu güncellenemedi.', 'error');
            }
        });
    },

    deleteBusinessAction(bizId) {
        const biz = AppState.businesses.find((b) => b.id === bizId);
        if (!bizId || !biz) return;

        askConfirm(`"${biz.companyName}" işletmesini SİLMEK istediğinize emin misiniz?`, async (confirmed) => {
            if (!confirmed) return;

            try {
                await DataService.deleteBusiness(bizId);

                AppState.businesses = AppState.businesses.filter((item) => item.id !== bizId);
                AppState.tasks = AppState.tasks.filter((task) => task.businessId !== bizId);
                this._globalSelectedBizIds.delete(bizId);

                if (typeof addSystemLog === 'function') {
                    addSystemLog(`İşletme silindi: ${biz.companyName}`);
                }
                showToast('İşletme silindi.', 'success');

                closeModal('businessDetailModal');
                if (this._isBizSearched) this.search(false);
            } catch (err) {
                console.error('Business delete failed:', err);
                showToast(err?.message || 'İşletme silinemedi.', 'error');
            }
        });
    },

    // ---- Detay Modalı ----

    async openDetailModal(bizId) {
        document.getElementById('modalContentArea').innerHTML = ''; 
        const closeBtn = document.querySelector('#businessDetailModal .modal-close-btn');
        if (closeBtn) closeBtn.setAttribute('onclick', "closeModal('businessDetailModal')");

        let biz = AppState.businesses.find(b => b.id === bizId) || null;
        try {
            const mappedDetail = await DataService.readPath('accounts/' + bizId, { force: true });
            if (mappedDetail) {
                biz = { ...(biz || {}), ...mappedDetail };
                this._commitBusinessState(biz);
            }
        } catch (err) {
            if (err?.status === 404) {
                AppState.businesses = AppState.businesses.filter((item) => item.id !== bizId);
                AppState.invalidateBizMapCache?.();
                showToast('Bu isletme kaydi artik bulunamiyor. Liste yenilendi.', 'warning');
                return;
            }
            console.warn('Business detail fetch failed, falling back to cached state.', err);
        }
        if (!biz) return;
        window._openBusinessDetailId = bizId;

        const bStatus = biz.businessStatus || 'Aktif';
        let bizTaskHistory = [];
        try {
            bizTaskHistory = await this._fetchBusinessTaskHistory(bizId);
        } catch (error) {
            console.warn('Business task history load failed:', error);
            bizTaskHistory = [];
        }
        const bizTasks = this._mapBusinessTaskRows(bizTaskHistory);
        window._currentBizTasks = bizTasks;

        let pendingUpdateBanner = ''; // Kaldırıldı

        const contactSnapshot = window.ContactParity
            ? window.ContactParity.buildBusinessContactSnapshot(biz, bizTaskHistory)
            : {
                primaryContact: {
                    name: biz.contactName || 'İsimsiz / Genel',
                    phones: biz.contactPhone ? [biz.contactPhone] : [],
                    emails: biz.contactEmail ? [biz.contactEmail] : [],
                },
                otherContacts: [],
            };
        let primaryContact = contactSnapshot.primaryContact;
        let otherContacts = contactSnapshot.otherContacts;
        const isPlaceholderContactName = window.ContactParity?.isPlaceholderContactName || ((name) => {
            const normalized = String(name || '').trim().toLocaleLowerCase('tr-TR');
            return !normalized || normalized === 'isimsiz / genel' || normalized === 'yok' || normalized === '-' || normalized === 'belirtilmemiş' || normalized === 'belirtilmemis';
        });

        const primaryHasPlaceholderName = !primaryContact || isPlaceholderContactName(primaryContact.name);
        const primaryLooksEmpty = !primaryContact ||
            (
                primaryHasPlaceholderName
            ) &&
            (!Array.isArray(primaryContact?.phones) || primaryContact.phones.length === 0) &&
            (!Array.isArray(primaryContact?.emails) || primaryContact.emails.length === 0);

        if ((primaryLooksEmpty || primaryHasPlaceholderName) && Array.isArray(otherContacts) && otherContacts.length > 0) {
            const namedFallbackIndex = otherContacts.findIndex((contact) =>
                !isPlaceholderContactName(contact?.name)
            );

            if (namedFallbackIndex >= 0) {
                const promotedContact = otherContacts[namedFallbackIndex];
                primaryContact = {
                    name: promotedContact.name,
                    phones: Array.from(new Set([
                        ...(Array.isArray(promotedContact?.phones) ? promotedContact.phones : []),
                        ...(Array.isArray(primaryContact?.phones) ? primaryContact.phones : []),
                    ])),
                    emails: Array.from(new Set([
                        ...(Array.isArray(promotedContact?.emails) ? promotedContact.emails : []),
                        ...(Array.isArray(primaryContact?.emails) ? primaryContact.emails : []),
                    ])),
                };
                otherContacts = otherContacts.filter((_, index) => index !== namedFallbackIndex);
            }
        }

        const formatPhone = (p) => {
            if (!p) return '';
            let c = p.replace(/\D/g, '');
            if(c.length === 10 && !c.startsWith('0')) c = '0' + c;
            if(c.length === 11) return c.replace(/(\d{4})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4');
            return p;
        };

        const createDropdown = (items, type, dropdownId) => {
            if(items.length <= 1) return '';
            const icon = type === 'phone' ? '📞' : '✉️';
            const rItems = items.slice(1).map(i => `<div class="smart-popover-item">${icon} ${type === 'phone' ? formatPhone(i) : i}</div>`).join('');
            return `<div id="${dropdownId}" class="smart-popover animated-drop phone-centered-drop" style="display:none; position:absolute; top:100%; left:0; width:100%; z-index:100; margin-top:4px;">${rItems}</div>`;
        };

        const renderContactPill = (items, type, dropdownId, isLight = false) => {
            if (!items.length) return '';
            const icon = type === 'phone' ? '📞' : '✉️';
            const baseText = type === 'phone' ? formatPhone(items[0]) : items[0];
            const pillClass = isLight ? 'soft-pill' : 'soft-pill emerald-glass-pill';
            const inlineStyle = isLight
                ? 'padding:6px 10px; font-size:12px; background:#f8fafc; border:1px solid #e2e8f0; word-break:break-all; max-width:100%;'
                : 'width:100%; justify-content:center; word-break:break-all;';
            const onClick = items.length > 1
                ? `onclick="const d = document.getElementById('${dropdownId}'); d.style.display = d.style.display === 'block' ? 'none' : 'block'; event.stopPropagation();"`
                : '';
            return `
                <div style="position:relative; display:flex; justify-content:center; width:100%;">
                    <span class="${pillClass}" style="${inlineStyle}" ${onClick}>${icon} ${baseText} ${items.length > 1 ? '▾' : ''}</span>
                    ${items.length > 1 ? createDropdown(items, type, dropdownId) : ''}
                </div>
            `;
        };

        const pPhones = primaryContact.phones || [];
        const pEmails = primaryContact.emails || [];
        let primaryContactHtml = `
            <div class="biz-contact-card emerald-glass-panel">
                <div class="biz-contact-title" style="color:rgba(255,255,255,0.7); text-align:center;">1. YETKİLİ (SON GÖRÜŞÜLEN)</div>
                <div class="biz-contact-name emerald-executive-name">${primaryContact.name}</div>
                <div class="biz-contact-pills centered-pills">
                    ${pPhones.length > 0 ? renderContactPill(pPhones, 'phone', `primaryPhoneDrop_${biz.id}`) : '<span style="color:rgba(255,255,255,0.5); font-size:12px; font-style:italic;">Telefon Yok</span>'}
                    <div style="position:relative; display:flex; justify-content:center; width:100%; margin-top:8px;">
                        ${pEmails.length > 0 ? renderContactPill(pEmails, 'email', `primaryEmailDrop_${biz.id}`) : ''}
                    </div>
                </div>
            </div>
        `;

        let linksHtml = '';
        if (biz.website) linksHtml += `<a href="${biz.website.startsWith('http') ? biz.website : 'http://' + biz.website}" target="_blank" class="social-icon-btn emerald-glass-icon" title="Web Sitesi">🌐</a>`;
        if (biz.instagram) linksHtml += `<a href="${biz.instagram.startsWith('http') ? biz.instagram : 'https://instagram.com/' + biz.instagram.replace('@', '')}" target="_blank" class="social-icon-btn emerald-glass-icon" title="Instagram">📸</a>`;
        
        const allCampUrls = [];
        if (biz.campaignUrl) allCampUrls.push({ url: biz.campaignUrl, date: formatDate(biz.createdAt).split(' ')[0] });
        bizTasks.forEach(t => {
            const taskDate = (t.logs && t.logs.length > 0) ? t.logs[0].date.split(' ')[0] : formatDate(t.createdAt).split(' ')[0];
            if (t.specificCampaignUrl && !allCampUrls.some(c => c.url === t.specificCampaignUrl)) allCampUrls.push({ url: t.specificCampaignUrl, date: taskDate });
        });

        if (allCampUrls.length > 0) {
            const archiveItems = allCampUrls.map((c) => `<div class="smart-popover-item"><a href="${c.url}" target="_blank" style="color:inherit; text-decoration:none;">🔗 ${c.date} Kampanyası</a></div>`).join('');
            linksHtml += `<div style="position:relative; display:inline-block;"><button class="social-icon-btn emerald-glass-icon" title="Kampanya Linkleri" onclick="const d = document.getElementById('campDrop_${biz.id}'); d.style.display = d.style.display === 'block' ? 'none' : 'block'; event.stopPropagation();">🔗</button><div id="campDrop_${biz.id}" class="smart-popover animated-drop" style="display:none; position:absolute; top:100%; left:50%; transform:translateX(-50%); z-index:100; margin-top:8px; min-width:180px; background:rgba(15, 23, 42, 0.95); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:6px; box-shadow:0 10px 30px rgba(0,0,0,0.3);">${archiveItems}</div></div>`;
        }

        const statusBtnText = bStatus === 'Aktif' ? '🔴 İşletmeyi Pasife Al' : '🟢 İşletmeyi Aktifleştir';
        const assignBtnText = ['Yönetici', 'Takım Lideri'].includes(AppState.loggedInUser.role) ? 'Görev Ata' : 'Kendime Görev Yarat';
        const assignBtn = (bStatus === 'Aktif') 
            ? `<button class="btn-action emerald-outline-btn" onclick="checkAndAssignTask('${biz.id}')">${assignBtnText}</button>` 
            : '';

        let actionBtnsHtml = `
            <div class="biz-action-row" style="border-top: 1px dashed rgba(255,255,255,0.2); margin-top:20px; padding-top:20px; display:flex; flex-direction:column; gap:10px;">
                <div style="display:flex; gap:10px; width:100%;">
                    ${assignBtn}
                    <button class="btn-action emerald-outline-btn" onclick="showUpdateBusinessForm('${biz.id}')">Güncelle</button>
                </div>
                <div style="display:flex; gap:10px; width:100%;">
                    <button class="btn-action emerald-outline-btn" style="background:rgba(255,255,255,0.1) !important;" onclick="BusinessController.toggleBusinessActiveStatus('${biz.id}', '${bStatus}')">${statusBtnText}</button>
                    ${AppState.loggedInUser.role === 'Yönetici' ? `<button class="btn-action emerald-outline-btn danger" onclick="deleteBusinessAction('${biz.id}')" title="İşletmeyi Sil"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>` : ''}
                </div>
            </div>
        `;

        let otherContactsHtml = otherContacts.map(c => {
            const cPhones = Array.from(c.phones); const cEmails = Array.from(c.emails);
            const contactSlug = String(c.name || 'contact').replace(/[^a-zA-Z0-9]+/g, '_');
            return `<div style="display:flex; align-items:center; gap:15px; padding:12px; border-bottom:1px solid #f1f5f9; flex-wrap:wrap; background:#fff; border-radius:8px; margin-bottom:8px; border:1px solid #e2e8f0;">
                <div style="font-size:13px; font-weight:700; color:#475569; min-width: 140px;">👤 ${c.name}</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; flex:1; align-items:flex-start; flex-direction:column;">
                    ${cPhones.length > 0 ? renderContactPill(cPhones, 'phone', `otherPhoneDrop_${biz.id}_${contactSlug}`, true) : ''}
                    ${cEmails.length > 0 ? renderContactPill(cEmails, 'email', `otherEmailDrop_${biz.id}_${contactSlug}`, true) : ''}
                </div>
            </div>`;
        }).join('');

        const uiHtml = `
            <div class="biz-premium-modal">
                <div class="biz-top-header saas-premium-header">
                    
                    <div class="biz-close-btn-wrapper">
                        <button class="premium-icon-btn close-btn" onclick="closeModal('businessDetailModal')" title="Kapat">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>

                    <div class="biz-header-content">
                        <h2 class="biz-main-title" style="margin:0; font-size:22px; color:#fff;">${biz.companyName}</h2>
                        <button class="premium-icon-btn biz-copy-btn" onclick="navigator.clipboard.writeText('${biz.id}'); showToast('ID Kopyalandı', 'success'); event.stopPropagation();" title="ID Kopyala">📋</button>
                        <div class="biz-top-badges">
                            <span class="badge">📍 ${biz.city || '-'}</span>
                            ${bStatus === 'Pasif' ? '<span class="badge" style="background:#ef4444 !important; color:#fff !important;">🛑 KAPANMIŞ İŞLETME</span>' : ''}
                        </div>
                    </div>
                </div>

                <div class="biz-dual-layout saas-dual-layout">
                    <div class="biz-left-panel theme-emerald-panel">
                        ${primaryContactHtml}
                        ${linksHtml ? `<div class="biz-social-links">${linksHtml}</div>` : ''}
                        
                        <div class="extra-info-btns">
                            <button class="emerald-action-btn" onclick="document.getElementById('popupAddress_${biz.id}').style.display='flex'">📍 Adres Detayı</button>
                            ${otherContacts.length > 0 ? `<button class="emerald-action-btn" onclick="document.getElementById('popupContacts_${biz.id}').style.display='flex'">👥 Diğer Yetkililer</button>` : ''}
                        </div>
                        
                        ${actionBtnsHtml}
                    </div>

                    <div class="biz-right-panel theme-light-panel" id="bizRightPanelContent_${biz.id}">
                        <h3 style="color:var(--secondary-color); font-size:18px; margin:0 0 15px 0;">Geçmiş Tasklar</h3>
                        <div class="biz-history-container">
                            <table class="history-table">
                                <thead><tr><th>Açılış</th><th>Sorumlu</th><th>Kategori</th><th>Kaynak</th><th>Son Durum</th><th>İşlem</th></tr></thead>
                                <tbody id="bizTaskHistoryBody"></tbody>
                            </table>
                        </div>
                        <div id="bizTaskHistoryPagination" class="pagination-container"></div>
                    </div>
                </div>
            </div>

            <div id="popupAddress_${biz.id}" class="biz-popup-overlay" onclick="this.style.display='none'">
                <div class="biz-popup-box" onclick="event.stopPropagation()">
                    <button class="modal-close-btn" onclick="document.getElementById('popupAddress_${biz.id}').style.display='none'">X</button>
                    <h3 style="margin:0 0 15px 0; color:var(--secondary-color);">📍 Açık Adres</h3>
                    <div style="font-size:14px; color:#334155; line-height:1.6;">${biz.address && biz.address !== '-' ? biz.address : '<span style="color:#94a3b8; font-style:italic;">Adres bilgisi girilmemiş.</span>'}</div>
                </div>
            </div>

            <div id="popupContacts_${biz.id}" class="biz-popup-overlay" onclick="this.style.display='none'">
                <div class="biz-popup-box" onclick="event.stopPropagation()">
                    <button class="modal-close-btn" onclick="document.getElementById('popupContacts_${biz.id}').style.display='none'">X</button>
                    <h3 style="margin:0 0 15px 0; color:var(--secondary-color);">👥 Diğer Yetkililer</h3>
                    <div style="max-height:300px; overflow-y:auto; padding-right:10px;">${otherContactsHtml}</div>
                </div>
            </div>
        `;

        const a = document.getElementById('businessDetailArea'); if (!a) return;
        a.innerHTML = pendingUpdateBanner + uiHtml;

        window.renderBizTaskHistoryPage(1);
        const m = document.getElementById('businessDetailModal'); 
        if (m) { 
            m.style.display = 'flex';
            // Drawer animasyonu için kısa bir gecikme ile active class'ı ekle
            setTimeout(() => {
                m.classList.add('active');
            }, 10);
        }
    },

    // ---- İşletme Detayı Sayfalama (Pagination) ----
    renderBizTaskHistoryPage(page) {
        const tbody = document.getElementById('bizTaskHistoryBody');
        const pagContainer = document.getElementById('bizTaskHistoryPagination');
        if (!tbody || !pagContainer || !window._currentBizTasks) return;

        const limit = 5;
        const start = (page - 1) * limit;
        const paginated = window._currentBizTasks.slice(start, start + limit);
        const statusLabels = { 'cold': 'Cold', 'deal': 'Deal', 'hot': 'Hot', 'nothot': 'Not Hot', 'followup': 'Takip', 'new': 'Yeni' };

        if (paginated.length === 0) {
            tbody.innerHTML = "<tr><td colspan='4' style='text-align:center; color:var(--text-muted);'>Görev atanmamış.</td></tr>";
            pagContainer.innerHTML = '';
            return;
        }

        tbody.innerHTML = paginated.map((t) => {
            const createdAt = t.createdAt || t.creationDate || '';
            const assignee = t.assignee || t.historicalAssignee || t.owner?.name || t.owner?.email || 'Havuz';
            const statusKey = typeof normalizeTaskStatusKey === 'function'
                ? normalizeTaskStatusKey(t.statusKey || t.status || '')
                : String(t.statusKey || t.status || '').toLowerCase();
            const sourceLabel = typeof getTaskSourceLabel === 'function'
                ? getTaskSourceLabel(t.sourceType || t.sourceKey || '')
                : (t.sourceType || t.sourceKey || '-');
            return `<tr><td>${createdAt ? formatDate(createdAt).split(' ')[0] : '-'}</td><td><span class="clickable-badge" onclick="openUserProfileModal('${assignee}')">${assignee}</span></td><td><span style="font-size:11px; color:#64748b;">${t.mainCategory || '-'}<br>${t.subCategory || '-'}</span></td><td><span class="badge badge-source">${sourceLabel}</span></td><td><strong>${statusLabels[statusKey] || t.statusLabel || t.status || '-'}</strong></td><td><button class="btn-action" onclick="openTaskModal('${t.id}')" style="padding: 4px 8px; font-size:11px; cursor:pointer;">Detay</button></td></tr>`;
        }).join('');

        renderPagination(pagContainer, window._currentBizTasks.length, page, limit, (i) => {
            window.renderBizTaskHistoryPage(i);
        }, { compact: true, resultLabel: 'kayıt' });
    },

    // ---- İşletme Güncelleme ----

    showUpdateForm(bizId) {
        const biz = AppState.businesses.find(b => b.id === bizId); if (!biz) return;
        const panel = document.getElementById('bizRightPanelContent_' + bizId); if (!panel) return;

        const districtSource = (typeof DISTRICT_DATA !== 'undefined' ? DISTRICT_DATA : districtData) || {};
        const allCities = (typeof cities !== 'undefined' && Array.isArray(cities) ? cities : (typeof CITIES !== 'undefined' ? CITIES : Object.keys(districtSource)));
        const cityOptions = [
            `<option value="" ${!biz.city ? 'selected' : ''}>Seçilmedi</option>`,
            ...allCities.map(c => `<option value="${c}" ${c === biz.city ? 'selected' : ''}>${c}</option>`),
        ].join('');
        const dists = biz.city ? (districtSource[biz.city] || ['Merkez', 'Diğer']) : [];
        const distOptions = [
            `<option value="" ${!biz.district ? 'selected' : ''}>Seçilmedi</option>`,
            ...dists.map(d => `<option value="${d}" ${d === biz.district ? 'selected' : ''}>${d}</option>`),
        ].join('');
        // İşletme üzerinden kategori ve kaynak alındığı alanlar Görev (Task) yapısına taşındı.

        let extraContactsFields = `<div id="dynamicContactsContainer">`;
        const eContacts = biz.extraContacts || [];
        eContacts.forEach((c, i) => {
            extraContactsFields += `
            <div class="dynamic-contact-row">
                <button type="button" onclick="this.parentElement.remove()" class="btn-remove-contact">✖ Sil</button>
                <div class="form-grid">
                    <div class="form-group"><label>Yetkili İsim</label><input type="text" class="dyn-name" value="${c.name || ''}"></div>
                    <div class="form-group"><label>Telefon</label><input type="text" class="dyn-phone" value="${c.phone || ''}"></div>
                    <div class="form-group full-width"><label>E-Posta</label><input type="text" class="dyn-email" value="${c.email || ''}"></div>
                </div>
            </div>`;
        });
        extraContactsFields += `</div>
            <div style="font-size:11px; color:#64748b; margin:6px 0 10px 0;">
                Ayni yetkiliye birden fazla telefon veya e-posta eklemek icin ayni isimle yeni satir ekleyebilirsiniz.
            </div>
            <button type="button" class="btn-ghost" style="width:100%; margin-bottom:15px; border-style:dashed;" onclick="addDynamicContactRow()">👤 Farklı Bir Yetkili Ekle</button>`;

        const formHtml = `
            <div style="background:#fff; border-radius:12px; padding:15px 20px; box-shadow:0 4px 15px rgba(0,0,0,0.05); height:100%; display:flex; flex-direction:column;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
                    <h3 style="margin:0; color:var(--secondary-color); font-size:15px;">✏️ İşletme Bilgilerini Güncelle</h3>
                    <button class="premium-icon-btn close-btn" style="width:28px; height:28px; background:#f1f5f9; color:#64748b; border:none;" onclick="BusinessController.restoreRightPanel('${biz.id}')" title="İptal">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                <div class="compact-form-scroll" style="flex:1; overflow-y:auto; padding-right:5px;">
                    <div class="form-grid compact-grid" style="margin-bottom:10px;">
                        <div class="form-group full-width"><label>İşletme Adı *</label><input type="text" id="upd_companyName" value="${biz.companyName || ''}"></div>
                        <div class="form-group"><label>İl</label><select id="upd_city" onchange="updateUpdDistricts()">${cityOptions}</select></div>
                        <div class="form-group"><label>İlçe</label><select id="upd_district">${distOptions}</select></div>
                        <div class="form-group full-width"><label>Açık Adres</label><textarea id="upd_address" rows="1">${biz.address || ''}</textarea></div>
                    </div>
                    <h4 style="margin:10px 0 8px 0; color:var(--secondary-color); border-bottom:1px solid #e2e8f0; padding-bottom:4px; font-size:13px;">İletişim Bilgileri</h4>
                    <div class="form-grid compact-grid" style="margin-bottom:10px;">
                        <div class="form-group"><label>1. Yetkili İsim</label><input type="text" id="upd_contactName" value="${biz.contactName || ''}"></div>
                        <div class="form-group"><label>1. Yetkili Telefon</label><input type="text" id="upd_contactPhone" value="${biz.contactPhone || ''}"></div>
                        <div class="form-group full-width"><label>1. Yetkili E-Posta</label><input type="text" id="upd_contactEmail" value="${biz.contactEmail || ''}"></div>
                    </div>
                    ${extraContactsFields}
                    <div class="form-grid compact-grid" style="margin-top:10px; padding-top:10px; border-top:1px dashed #e2e8f0;">
                        <div class="form-group"><label>Web Sitesi</label><input type="text" id="upd_website" value="${biz.website || ''}"></div>
                        <div class="form-group"><label>Instagram</label><input type="text" id="upd_instagram" value="${biz.instagram || ''}"></div>
                        <div class="form-group full-width"><label>Kampanya Linki</label><input type="text" id="upd_campaignUrl" value="${biz.campaignUrl || ''}"></div>
                    </div>
                </div>
                <button type="button" onclick="submitBusinessUpdate('${biz.id}')" style="width:100%; margin-top:10px; padding:10px; background:var(--success-color); flex-shrink:0;">💾 Tümünü Kaydet</button>
            </div>
        `;
        panel.innerHTML = formHtml;
        
        // Kategori güncellemeleri kaldırıldığı için setTimeout bloğu kaldırıldı.
    },

    submitUpdate(bizId) {
        const biz = AppState.businesses.find(b => b.id === bizId); if (!biz) return;
        const nEl = document.getElementById('upd_companyName'); if (!nEl) return;
        const compName = esc(nEl.value.trim()); if (!compName) return showToast("İşletme Adı zorunludur!", "error");
        if (!isValidName(compName)) return showToast("Geçersiz işletme adı!", "error");
        const getValue = id => { const el = document.getElementById(id); return el ? esc(el.value) : ''; };
        
        // 1. Yetkili bilgilerini STATIK alanlardan oku (upd_contactName/Phone/Email)
        const primaryName = getValue('upd_contactName');
        const primaryPhone = getValue('upd_contactPhone');
        const primaryEmail = getValue('upd_contactEmail');

        // Ek yetkilileri (dynamic-contact-row) ayrı oku — hepsi extra contact
        if (primaryPhone && !isValidPhone(primaryPhone)) return showToast("1. Yetkili telefonu geçersiz!", "error");
        if (primaryEmail && !isValidEmail(primaryEmail)) return showToast("1. Yetkili e-postası geçersiz!", "error");

        let payload;
        try {
            const extraContacts = [];
            document.querySelectorAll('.dynamic-contact-row').forEach((row) => {
                const n = row.querySelector('.dyn-name')?.value.trim() || '';
                const p = row.querySelector('.dyn-phone')?.value.trim() || '';
                const e = row.querySelector('.dyn-email')?.value.trim() || '';
                if (p && !isValidPhone(p)) throw new Error('Ek yetkili telefonu gecersiz');
                if (e && !isValidEmail(e)) throw new Error('Ek yetkili e-postasi gecersiz');
                if (n || p || e) extraContacts.push({ name: n, phone: p, email: e });
            });
            payload = { 
                companyName: compName, 
                city: getValue('upd_city'), 
                district: getValue('upd_district'), 
                address: getValue('upd_address'), 
                website: getValue('upd_website'), 
                instagram: getValue('upd_instagram'), 
                campaignUrl: getValue('upd_campaignUrl'),
                contactPerson: primaryName, 
                contactPhone: primaryPhone, 
                email: primaryEmail,
                extraContacts: extraContacts
            };
        } catch (validationErr) {
            return showToast(validationErr.message === 'Ek yetkili telefonu gecersiz' ? "Ek yetkili telefonu geçersiz!" : "Ek yetkili e-postası geçersiz!", "error");
        }

        DataService.apiRequest('/accounts/' + bizId, { method: 'PATCH', body: JSON.stringify(payload) })
        .then(async () => {
            const refreshedBiz = await DataService.apiRequest('/accounts/' + bizId);
            const normalizedBiz = (typeof DataService.mapBusiness === 'function')
                ? DataService.mapBusiness(refreshedBiz)
                : {
                    ...biz,
                    companyName: refreshedBiz.companyName || refreshedBiz.accountName || biz.companyName,
                    contactName: refreshedBiz.contactName || payload.contactPerson || '',
                    contactPhone: refreshedBiz.contactPhone || payload.contactPhone || '',
                    contactEmail: refreshedBiz.contactEmail || payload.email || '',
                    extraContacts: refreshedBiz.extraContacts || payload.extraContacts || [],
                    address: refreshedBiz.address || payload.address || '',
                    city: refreshedBiz.city || payload.city || '',
                    district: refreshedBiz.district || payload.district || '',
                    website: refreshedBiz.website || payload.website || '',
                    instagram: refreshedBiz.instagram || payload.instagram || '',
                    campaignUrl: refreshedBiz.campaignUrl || payload.campaignUrl || '',
                };
            this._commitBusinessState(normalizedBiz);
            addSystemLog(`${AppState.loggedInUser.name}, "${compName}" işletmesinin bilgilerini güncelledi.`);
            showToast("İşletme bilgileri başarıyla güncellendi.", "success"); 
            this.openDetailModal(bizId); 
        }).catch(err => {
            console.error(err);
            showToast("Güncelleme sırasında hata oluştu.", "error");
        });
    },

    restoreRightPanel(bizId) {
        const panel = document.getElementById('bizRightPanelContent_' + bizId);
        if (!panel) return;
        panel.innerHTML = `
            <h3 style="color:var(--secondary-color); font-size:18px; margin:0 0 15px 0;">Geçmiş Tasklar</h3>
            <div style="overflow-x:auto; background:#fff; border-radius:12px; border:1px solid #e2e8f0; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                <table class="history-table" style="margin:0; background:transparent;">
                    <thead><tr><th>Açılış</th><th>Sorumlu</th><th>Son Durum</th><th>İşlem</th></tr></thead>
                    <tbody id="bizTaskHistoryBody"></tbody>
                </table>
            </div>
            <div id="bizTaskHistoryPagination" class="pagination-container" style="margin-top:15px;"></div>
        `;
        window.renderBizTaskHistoryPage(1);
    },

    // ---- Görev Atama (İşletmeler sayfasından) ----

    async checkAndAssignTask(bizId) {
        let hasActiveTask = false;
        try {
            const rows = await DataService.apiRequest(`/accounts/${bizId}/task-history`);
            hasActiveTask = Array.isArray(rows)
                ? rows.some((task) => {
                    const generalStatus = String(task?.generalStatus || '').toUpperCase();
                    const status = String(task?.status || '').toLowerCase();
                    return generalStatus === 'OPEN' || isActiveTask(status);
                })
                : false;
        } catch (error) {
            console.warn('Business task history could not be loaded, using visible task cache only:', error);
            hasActiveTask = (Array.isArray(AppState.tasks) ? AppState.tasks : []).some((task) => (
                task?.businessId === bizId && isActiveTask(task.status)
            ));
        }

        if (hasActiveTask) {
            askConfirm("⚠️ Bu işletmenin halihazırda aktif bir görevi (Open Task) bulunuyor. Yine de yeni bir görev atamak istiyor musunuz?", (res) => { if (res) this._openAssignTaskModal(bizId); });
            return;
        }

        this._openAssignTaskModal(bizId);
    },

    _openAssignTaskModal(bizId) {
        const biz = AppState.businesses.find(b => b.id === bizId); if (!biz) return;
        const panel = document.getElementById('bizRightPanelContent_' + bizId);
        
        if (!panel) {
            const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
            setVal('assignBusinessId', biz.id);
            const bNameEl = document.getElementById('assignBusinessName'); if (bNameEl) bNameEl.innerText = `İşletme: ${biz.companyName}`;
            setVal('assigneeDropdown', '');
            setVal('assignTaskDetails', '');
            setVal('assignTaskCat', 'İstanbul Core');
            setVal('assignSourceType', 'Fresh Account');
            if (typeof syncCampaignUrlVisibility === 'function') syncCampaignUrlVisibility('assignSourceType', 'assignCampaignUrlGroup', 'assignCampaignUrl');
            const mainCatEl = document.getElementById('assignMainCat');
            if (mainCatEl) {
                mainCatEl.innerHTML = '';
                Object.keys(AppState.dynamicCategories).forEach(cat => mainCatEl.add(new Option(cat, cat)));
                mainCatEl.value = 'Yemek';
            }
            if(typeof updateAssignSubCategories === 'function') updateAssignSubCategories();
            setVal('assignSubCat', '');
            
            const cb = document.getElementById('assignUseExistingContact');
            if (cb) { cb.checked = true; document.getElementById('assignNewContactFields').style.display = 'none'; }
            setVal('assignNewContactName', '');
            setVal('assignNewContactPhone', '');
            setVal('assignNewContactEmail', '');

            closeModal('businessDetailModal');
            const am = document.getElementById('assignTaskModal'); 
            if (am) { 
                am.style.display = 'flex'; 
                const isManagerOrTL = ['Yönetici', 'Takım Lideri'].includes(AppState.loggedInUser.role);
                const dropWrap = document.getElementById('assigneeDropdownWrapper');
                if (dropWrap) dropWrap.style.display = isManagerOrTL ? 'block' : 'none';
                if (!isManagerOrTL) {
                    const sel = document.getElementById('assigneeDropdown');
                    if (sel) {
                        sel.innerHTML = `<option value="${AppState.loggedInUser.name}">${AppState.loggedInUser.name}</option>`;
                        sel.value = AppState.loggedInUser.name;
                    }
                }
            }
        } else {
            const assignableUsers = typeof AppState.getAssignableUsers === 'function'
                ? AppState.getAssignableUsers()
                : AppState.users.filter((u) => u.role === USER_ROLES.SALES_REP && u.status !== 'Pasif');
            const userOptions = assignableUsers.map(u => `<option value="${u.name}">${u.name}</option>`).join('');
            
            const taskCatOptions = ['İstanbul Core', 'Anadolu Core', 'Travel'].map(c => `<option value="${c}">${c}</option>`).join('');
            const sourceOptions = ['Fresh Account', 'Old Account', 'Old Account Rakip', 'Old Account Query', 'Query', 'Lead', 'Rakip'].map(c => `<option value="${c}">${c}</option>`).join('');
            const currentMainCat = Object.keys(AppState.dynamicCategories)[0] || '';
            const mainCatOptions = Object.keys(AppState.dynamicCategories).map(c => `<option value="${c}">${c}</option>`).join('');
            const subCats = AppState.dynamicCategories[currentMainCat] || [];
            const subCatOptions = subCats.map(c => `<option value="${c}">${c}</option>`).join('');

            const isManagerOrTL = ['Yönetici', 'Takım Lideri'].includes(AppState.loggedInUser.role);
            const assignTitle = isManagerOrTL ? "➕ Yeni Görev Ata" : "➕ Kendime Görev Yarat";
            const assigneeGroup = isManagerOrTL ? 
                `<div class="form-group compact-group"><label>Sorumlu Personel Seçin</label>
                    <select id="inl_assigneeDropdown">
                        <option value="UNASSIGNED">-- Havuza At (Atanmasın) --</option>
                        <optgroup label="Personeller">${userOptions}</optgroup>
                    </select>
                </div>` : 
                `<input type="hidden" id="inl_assigneeDropdown" value="${AppState.loggedInUser.name}">`;

            const formHtml = `
            <div style="background:#fff; border-radius:12px; padding:15px 20px; box-shadow:0 4px 15px rgba(0,0,0,0.05); height:100%; display:flex; flex-direction:column;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
                    <h3 style="margin:0; color:var(--primary-color); font-size:15px;">${assignTitle}</h3>
                    <button class="premium-icon-btn close-btn" style="width:28px; height:28px; background:#f1f5f9; color:#64748b; border:none;" onclick="BusinessController.restoreRightPanel('${biz.id}')" title="İptal">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                
                <div class="compact-form-scroll" style="flex:1; overflow-y:auto; padding-right:5px;">
                    ${assigneeGroup}
                    
                    <div style="margin-bottom:10px; padding:10px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px;">
                        <label style="display:flex; align-items:flex-start; gap:8px; font-size:12px; font-weight:bold; cursor:pointer; margin:0; color:var(--secondary-color);">
                            <input type="checkbox" id="inl_assignUseExistingContact" checked onchange="document.getElementById('inl_assignNewContactFields').style.display = this.checked ? 'none' : 'block';" style="width:14px; height:14px; margin-top:1px; flex-shrink:0; cursor:pointer;">
                            Mevcut iletişim bilgileri geçerli
                        </label>
                        <div id="inl_assignNewContactFields" style="display:none; margin-top:10px; padding-top:10px; border-top:1px dashed #cbd5e1;">
                            <div class="form-grid compact-grid">
                                <div class="form-group"><label>Yeni İsim</label><input type="text" id="inl_assignNewContactName" placeholder="Opsiyonel"></div>
                                <div class="form-group"><label>Yeni Telefon</label><input type="tel" id="inl_assignNewContactPhone" placeholder="Opsiyonel"></div>
                                <div class="form-group full-width"><label>Yeni E-Posta</label><input type="email" id="inl_assignNewContactEmail" placeholder="Opsiyonel"></div>
                            </div>
                        </div>
                    </div>
                    
                    <div style="background:#f4f8f5; padding:10px; border-radius:8px; border:1px solid #cfe2c9; margin-bottom:10px;">
                        <strong style="font-size:12px; color:var(--primary-color); display:block; margin-bottom:8px;">Kategorileri Kontrol Edin:</strong>
                        <div class="form-grid compact-grid">
                            <div class="form-group"><label>Task Kategori</label><select id="inl_assignTaskCat">${taskCatOptions}</select></div>
                            <div class="form-group"><label>Kaynak</label><select id="inl_assignSourceType" onchange="syncCampaignUrlVisibility('inl_assignSourceType', 'inl_assignCampaignUrlGroup', 'inl_assignCampaignUrl')">${sourceOptions}</select></div>
                            <div class="form-group"><label>Ana Kategori</label><select id="inl_assignMainCat" onchange="const el = document.getElementById('inl_assignSubCat'); el.innerHTML=''; (AppState.dynamicCategories[this.value]||[]).forEach(s=>el.add(new Option(s,s)));">${mainCatOptions}</select></div>
                            <div class="form-group"><label>Alt Kategori</label><select id="inl_assignSubCat">${subCatOptions}</select></div>
                            <div class="form-group full-width" id="inl_assignCampaignUrlGroup" style="display:none;"><label>Kampanya Linki</label><input type="text" id="inl_assignCampaignUrl" placeholder="https://..."></div>
                        </div>
                    </div>
                    
                    <div class="form-group compact-group"><label>Yönerge / Not</label><textarea id="inl_assignTaskDetails" rows="2" placeholder="Personele not..."></textarea></div>
                </div>
                <button onclick="saveInlineAssignedTask('${biz.id}')" style="margin-top: 10px; padding:10px; background:var(--primary-color); flex-shrink:0;">Görevi Başlat</button>
            </div>
            `;
            panel.innerHTML = formHtml;
            if (typeof syncCampaignUrlVisibility === 'function') syncCampaignUrlVisibility('inl_assignSourceType', 'inl_assignCampaignUrlGroup', 'inl_assignCampaignUrl');
        }
    },

    async saveNewAssignedTask(fallbackBizId) {
        const inlineBtn = typeof fallbackBizId === 'string' && fallbackBizId
            ? document.querySelector(`button[onclick="saveInlineAssignedTask('${fallbackBizId}')"]`)
            : null;
        const btn = inlineBtn || document.querySelector('button[onclick="saveNewAssignedTask()"]');
        if (btn) { btn.disabled = true; btn.innerText = "⏳ Kaydediliyor..."; }

        const getValue = id => { const el = document.getElementById(id); return el ? el.value : ''; };
        const isInlineMode = Boolean(inlineBtn || document.getElementById('inl_assigneeDropdown'));
        const readField = (baseId, inlineId = `inl_${baseId}`) => {
            if (isInlineMode) return getValue(inlineId);
            return getValue(baseId);
        };

        const bizId = readField('assignBusinessId') || fallbackBizId || '';
        const assigneeValue = readField('assigneeDropdown');
        const taskDetails = esc(readField('assignTaskDetails').trim());
        const taskCat = readField('assignTaskCat');
        const mainCat = readField('assignMainCat');
        const subCat = readField('assignSubCat');
        const taskSourceType = readField('assignSourceType');
        const campaignUrl = readField('assignCampaignUrl').trim();

        if (!bizId) {
            if (btn) { btn.disabled = false; btn.innerText = "Görevi Başlat"; }
            return showToast("İşletme kaydı bulunamadı. Detayı yeniden açıp tekrar deneyin.", "error");
        }

        if (!assigneeValue) { if (btn) { btn.disabled = false; btn.innerText = "Görevi Başlat"; } return showToast("Lütfen personel veya hedef liste seçin!", "error"); }

        let targetProjectId = null, actualAssignee = assigneeValue;
        if (assigneeValue.startsWith('TARGET_POOL_')) { targetProjectId = assigneeValue.replace('TARGET_POOL_', ''); actualAssignee = 'TARGET_POOL'; }

        let newContactObj = undefined;
        const useExistingContact = isInlineMode
            ? document.getElementById('inl_assignUseExistingContact')?.checked
            : document.getElementById('assignUseExistingContact')?.checked;
        if (!useExistingContact) {
            const newName = esc(readField('assignNewContactName').trim());
            const newPhone = esc(readField('assignNewContactPhone').trim());
            const newEmail = esc(readField('assignNewContactEmail').trim());
            if (newPhone && !isValidPhone(newPhone)) { if (btn) { btn.disabled = false; btn.innerText = "Görevi Başlat"; } return showToast("Yeni iletişim telefonu geçersiz!", "error"); }
            if (newEmail && !isValidEmail(newEmail)) { if (btn) { btn.disabled = false; btn.innerText = "Görevi Başlat"; } return showToast("Yeni iletişim e-postası geçersiz!", "error"); }
            if (newName || newPhone || newEmail) {
                newContactObj = { name: newName || 'Yeni İletişim', phone: newPhone, email: newEmail };
            }
        }

        const isManagerOrTL = ['Yönetici', 'Takım Lideri'].includes(String(AppState.loggedInUser?.role || ''));
        let ownerId = null;
        if (isManagerOrTL) {
            ownerId = await this._resolveAssignableOwnerId(actualAssignee);
            if (!ownerId && actualAssignee && !actualAssignee.startsWith('TARGET_POOL') && actualAssignee !== 'UNASSIGNED') {
                if (btn) { btn.disabled = false; btn.innerText = "Görevi Başlat"; }
                return showToast("Seçilen personel bulunamadı. Kullanıcı listesini yenileyip tekrar deneyin.", "error");
            }
        }

        const projectNote = targetProjectId ? ` (Proje: ${targetProjectId})` : '';
        const payload = {
            accountId: bizId,
            category: 'ISTANBUL_CORE',
            type: targetProjectId ? 'PROJECT' : 'GENERAL',
            priority: 'MEDIUM',
            accountType: 'KEY',
            source: 'FRESH', 
            mainCategory: mainCat || 'Belirtilmemiş',
            subCategory: subCat || 'Belirtilmemiş',
            details: `${taskDetails || ''}${projectNote}`,
            ownerId: ownerId,
        };
        
        // Enum mapping for standard values based on frontend dropdowns
        if (taskCat === 'Anadolu Core') payload.category = 'ANADOLU_CORE';
        if (taskCat === 'Travel') payload.category = 'TRAVEL';

        const normalizedSource = this._normalizeSourceKey(taskSourceType || 'FRESH');
        if (normalizedSource) payload.source = normalizedSource;

        if (newContactObj) payload.newContact = newContactObj;
        if (isCampaignUrlRequiredSource(taskSourceType)) payload.campaignUrl = campaignUrl || undefined;

        if (!isManagerOrTL) {
            delete payload.ownerId;
        }

        try {
            const createdTask = await DataService.apiRequest('/tasks', { method: 'POST', body: JSON.stringify(payload) });
            const refreshedTask = createdTask?.id ? await DataService.readPath(`tasks/${createdTask.id}`, { force: true }).catch(() => null) : null;
            if (refreshedTask) {
                const nextTasks = Array.isArray(AppState.tasks) ? [...AppState.tasks] : [];
                const existingIndex = nextTasks.findIndex((item) => item.id === refreshedTask.id);
                if (existingIndex >= 0) nextTasks[existingIndex] = refreshedTask;
                else nextTasks.unshift(refreshedTask);
                AppState.tasks = nextTasks;
                if (typeof AppState.setTaskDetail === 'function') AppState.setTaskDetail(refreshedTask.id, refreshedTask);
            }
            if (btn) { btn.disabled = false; btn.innerText = "Görevi Başlat"; }
            addSystemLog(`Mevcut işletmeye görev atandı: ${bizId} -> Sorumlu: ${ownerId || 'Havuza At (Atanmasın)'}`);
            showToast("Görev başarıyla atandı!", "success");
            if (typeof window.renderMyTasks === 'function') {
                setTimeout(() => window.renderMyTasks(), 0);
            }
            if (typeof window.renderAllTasks === 'function') {
                setTimeout(() => window.renderAllTasks(), 0);
            }
            
            BusinessController.restoreRightPanel(bizId);
            // State anında güncellendiği için manuel unshift yapmıyoruz.
            try {
                const historyRows = await BusinessController._fetchBusinessTaskHistory(bizId);
                window._currentBizTasks = BusinessController._mapBusinessTaskRows(historyRows);
            } catch (error) {
                console.warn('Business task history refresh failed:', error);
                window._currentBizTasks = [];
            }
            window.renderBizTaskHistoryPage(1);
        } catch (err) {
            console.error(err);
            const message = String(err?.message || '');
            if (message.includes('Account not found for task creation')) {
                showToast("İşletme kaydı bulunamadı. Listeyi yenileyip işletmeyi yeniden seçin.", "error");
            } else if (message.includes('already has an OPEN General task')) {
                showToast("Bu işletmede zaten açık bir genel görev var. Mevcut görevi kullanın ya da önce onu kapatın.", "error");
            } else {
                showToast(message || "Görev atanamadı.", "error");
            }
            if (btn) { btn.disabled = false; btn.innerText = "Görevi Başlat"; }
        }
    },


    // ---- CSV İçe Aktarım ----

    async importCSV() {
        const btn = document.querySelector('button[onclick="importCSV()"]');
        if (btn) { btn.disabled = true; btn.innerText = "⏳ Hazırlanıyor..."; }

        const fi = document.getElementById('csvFileInput');
        if (!fi || !fi.files[0]) {
            if (btn) { btn.disabled = false; btn.innerText = "Verileri İçeri Aktar 🚀"; }
            return typeof showToast === 'function' ? showToast("Lütfen bir CSV dosyası seçin!", "error") : alert("Lütfen bir CSV dosyası seçin!");
        }

        const file = fi.files[0];
        const selAsg = document.getElementById('csvAssigneeSelect');
        const defaultAssigneeId = selAsg ? selAsg.value : null;
        const loader = document.getElementById('global-loader');

        const setImportLoader = (title, detail, meta = '') => {
            const percentMatch = String(title || '').match(/%(\d{1,3})/);
            const percent = percentMatch ? Number(percentMatch[1]) : undefined;
            const loaderIsVisible = loader && loader.style.display !== 'none';

            if (typeof showProgressOverlay === 'function' && percent === undefined) {
                showProgressOverlay(title, detail, { meta });
                return;
            }
            if (typeof updateProgressOverlay === 'function' && typeof showProgressOverlay === 'function' && percent !== undefined && !loaderIsVisible) {
                showProgressOverlay(title, detail, { meta, percent });
                return;
            }
            if (typeof updateProgressOverlay === 'function' && percent !== undefined) {
                updateProgressOverlay(detail, { title, percent, meta });
                return;
            }
            if (typeof showProgressOverlay === 'function') {
                showProgressOverlay(title, detail, { meta, percent: 10 });
                return;
            }
            if (loader) {
                loader.style.display = 'flex';
                loader.style.opacity = '1';
                loader.innerHTML = `
                    <h2 id="csvImportTitle" style="margin:0; font-size:20px;">${title}</h2>
                    <p id="csvImportDetail" style="font-size:14px; margin-top:10px; color:#a7f3d0; font-weight:bold;">${detail}</p>
                    <p id="csvImportMeta" style="font-size:11px; color:rgba(255,255,255,0.72); margin-top:5px;">${meta}</p>
                `;
            }
        };

        const parsedRows = [];
        let parsedDataRowCount = 0;

        Papa.parse(file, {
            header: false,
            skipEmptyLines: true,
            worker: true,
            step: (results) => {
                parsedRows.push(results.data);
                if (parsedRows.length > 1) parsedDataRowCount += 1;
            },
            complete: async () => {
                const rows = parsedRows;
                if (rows.length < 2) {
                    if (btn) { btn.disabled = false; btn.innerText = "Verileri İçeri Aktar 🚀"; }
                    if (typeof hideProgressOverlay === 'function') hideProgressOverlay();
                    else if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 500); }
                    return showToast("Dosya boş veya geçersiz format!", "error");
                }

                const map = window.CsvImportUtils?.detectCsvColumnMap
                    ? window.CsvImportUtils.detectCsvColumnMap(rows[0])
                    : this._detectCsvColumnMap(rows[0]);
                if (map.durum === -1) {
                    map.durum = this._inferCsvStatusColumnIndex(rows, map);
                }

                if (map.companyName === -1) {
                    if (btn) { btn.disabled = false; btn.innerText = "Verileri İçeri Aktar 🚀"; }
                    if (typeof hideProgressOverlay === 'function') hideProgressOverlay();
                    else if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 500); }
                    return showToast("Hata: 'İşletme Adı' sütunu bulunamadı!", "error");
                }

                const payloadRows = window.CsvImportUtils?.buildCsvImportRows
                    ? window.CsvImportUtils.buildCsvImportRows(rows, map)
                    : this._buildCsvImportRows(rows, map);

                if (typeof hideProgressOverlay === 'function') hideProgressOverlay();
                else if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 500); }

                askConfirm(`✅ Dosya başarıyla okundu! Toplam ${payloadRows.length} satır işlenecek.\n\nAktarımı onaylıyor musunuz?`, async (res) => {
                    if (!res) {
                        if (btn) { btn.disabled = false; btn.innerText = "Verileri İçeri Aktar 🚀"; }
                        if (typeof hideProgressOverlay === 'function') hideProgressOverlay();
                        else if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 500); }
                        showToast("Aktarım iptal edildi.", "info");
                        fi.value = "";
                        return;
                    }

                    const CHUNK_SIZE = window.CsvImportUtils?.resolveCsvImportChunkSize
                        ? window.CsvImportUtils.resolveCsvImportChunkSize(payloadRows.length)
                        : this._resolveCsvImportChunkSize(payloadRows.length);
                        let totalAddedBiz = 0;
                        let totalAddedTasks = 0;
                        let totalProcessedRows = 0;
                        let totalFailedRows = 0;
                        let totalWarnings = 0;
                        const importErrors = [];
                        const importWarnings = [];
                    const totalChunks = Math.ceil(payloadRows.length / CHUNK_SIZE);

                    setImportLoader(
                        "Aktarım başlatılıyor...",
                        `${payloadRows.length} satır işleme kuyruğuna alındı`,
                        `CSV okuma tamamlandı • ${parsedDataRowCount} satır çözümlendi`
                    );
                    setImportLoader(
                        "Veriler aktarılıyor: %0",
                        `0 / ${payloadRows.length} satır işlendi`,
                        `Parça 0 / ${totalChunks} hazırlanıyor • CSV'de ${parsedDataRowCount} satır çözümlendi`
                    );

                    try {
                        for (let i = 0; i < payloadRows.length; i += CHUNK_SIZE) {
                            const chunk = payloadRows.slice(i, i + CHUNK_SIZE);
                            const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1;
                            
                            setImportLoader(
                                `Veriler aktarılıyor: %${Math.round((i / payloadRows.length) * 100)}`,
                                `${Math.min(i, payloadRows.length)} / ${payloadRows.length} satır işlendi`,
                                `Parça ${chunkIndex} / ${totalChunks} gönderiliyor${totalFailedRows ? ` • ${totalFailedRows} satır hata verdi` : ''}`
                            );

                            const result = await DataService.apiRequest('/accounts/import', {
                                method: 'POST',
                                body: JSON.stringify({ rows: chunk, defaultAssigneeId })
                            });

                            totalAddedBiz += Number(result.addedBizCount || 0);
                            totalAddedTasks += Number(result.addedTaskCount || 0);
                            totalProcessedRows += Number(result.processedRowCount || 0);
                            totalFailedRows += Number(result.failedRowCount || 0);
                            totalWarnings += Number(result.warningCount || 0);
                            if (Array.isArray(result.errors) && result.errors.length > 0) {
                                importErrors.push(...result.errors);
                                console.groupCollapsed(`CSV import chunk ${chunkIndex} row errors`);
                                console.table(result.errors);
                                console.groupEnd();
                            }
                            if (Array.isArray(result.warnings) && result.warnings.length > 0) {
                                importWarnings.push(...result.warnings);
                                console.groupCollapsed(`CSV import chunk ${chunkIndex} warnings`);
                                console.table(result.warnings);
                                console.groupEnd();
                            }

                            setImportLoader(
                                `Veriler aktarılıyor: %${Math.round((Math.min(i + chunk.length, payloadRows.length) / payloadRows.length) * 100)}`,
                                `${Math.min(i + chunk.length, payloadRows.length)} / ${payloadRows.length} satır işlendi`,
                                `Parça ${chunkIndex} / ${totalChunks} tamamlandı • Başarılı: ${totalProcessedRows} • Uyarı: ${totalWarnings} • Hatalı: ${totalFailedRows}`
                            );
                        }

                        if (totalFailedRows > 0) {
                            console.groupCollapsed('CSV import row errors summary');
                            console.table(importErrors.slice(0, 100));
                            console.groupEnd();
                        }
                        if (totalWarnings > 0) {
                            console.groupCollapsed('CSV import warnings summary');
                            console.table(importWarnings.slice(0, 100));
                            console.groupEnd();
                        }

                        const summaryParts = [`${totalAddedBiz} yeni işletme`, `${totalAddedTasks} görev eklendi`];
                        if (totalWarnings > 0) summaryParts.push(`${totalWarnings} tarih alanı 01.01.2000'a alındı`);
                        if (totalFailedRows > 0) summaryParts.push(`${totalFailedRows} satır hata verdi`);
                        const summaryText = totalFailedRows > 0 || totalWarnings > 0
                            ? `İçe aktarma tamamlandı. ${summaryParts.join(', ')}.`
                            : `Kayıtlar başarıyla aktarıldı! (${totalAddedBiz} Yeni İşletme, ${totalAddedTasks} Görev eklendi)`;

                        showToast(summaryText, totalFailedRows > 0 || totalWarnings > 0 ? "info" : "success");
                        if (typeof addSystemLog === 'function') {
                            addSystemLog(`CSV IMPORT: ${totalAddedBiz} işletme, ${totalAddedTasks} görev eklendi.${totalWarnings ? ` ${totalWarnings} tarih alanı 01.01.2000'a alındı.` : ''}${totalFailedRows ? ` ${totalFailedRows} satır hatalı geçti.` : ''}`);
                        }
                        
                        if (typeof BusinessController !== 'undefined' && AppState.isBizSearched) { 
                            BusinessController.search(false); 
                        }
                    } catch (err) {
                        console.error("Import hatası:", err);
                        const errorMessage = String(err?.message || 'Sunucu hatası');
                        const formattedMessage = errorMessage.startsWith('Parça ')
                            ? errorMessage
                            : `Aktarım sırasında bir hata oluştu: ${errorMessage}`;
                        showToast(formattedMessage, "error");
                    } finally {
                        fi.value = "";
                        if (btn) { btn.disabled = false; btn.innerText = "Verileri İçeri Aktar 🚀"; }
                        if (typeof hideProgressOverlay === 'function') hideProgressOverlay();
                        else if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 500); }
                    }
                });
            },
            error: (err) => {
                if (btn) { btn.disabled = false; btn.innerText = "Verileri İçeri Aktar 🚀"; }
                if (typeof hideProgressOverlay === 'function') hideProgressOverlay();
                else if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 500); }
                showToast("CSV okunurken hata oluştu.", "error");
            }
        });
    },
};

// ---- Global Window Exports ----
// HTML onclick attribute'larından doğrudan çağrılabilmesi için
window.searchBusinesses        = (e) => BusinessController.search(e);
window.triggerBizLiveFilter    = ()  => BusinessController.triggerBizLiveFilter();
window.clearBizFilters         = ()  => BusinessController.clearFilters();
window.toggleOpenTaskFilter    = ()  => BusinessController.toggleOpenTaskFilter();
window.openBusinessDetailModal = (id) => BusinessController.openDetailModal(id);
window.showUpdateBusinessForm  = (id) => BusinessController.showUpdateForm(id);
window.submitBusinessUpdate    = (id) => BusinessController.submitUpdate(id);
window.restoreRightPanel       = (id) => BusinessController.restoreRightPanel(id);
window.deleteBusinessAction    = (id) => BusinessController.deleteBusinessAction(id);
window.checkAndAssignTask      = (id) => BusinessController.checkAndAssignTask(id);
window.saveInlineAssignedTask  = (id) => BusinessController.saveNewAssignedTask(id);
window.saveNewAssignedTask     = ()  => BusinessController.saveNewAssignedTask();
window.renderBizTaskHistoryPage= (p)  => BusinessController.renderBizTaskHistoryPage(p);
window.toggleCampaignUrl       = ()  => BusinessController.toggleCampaignUrl();
window.addDynamicContactRow    = ()  => BusinessController.addDynamicContactRow();
window.updateUpdDistricts      = ()  => BusinessController.updateUpdDistricts();
