// ============================================================
// controllers/poolController.js
// Görev havuzu yönetimi: Genel, Team1, Team2, Target
// ============================================================

const PoolController = (() => {
    async function _fetchPoolTasks(tab) {
        const selectedSources = Array.from(document.querySelectorAll('.pool-source-filter:checked'))
            .map(cb => normalizeSourceKey(cb.value))
            .filter(Boolean);

        const pageKey = tab === 'team1' ? 'poolTeam1' : tab === 'team2' ? 'poolTeam2' : 'poolGen';
        const page = AppState.pagination?.[pageKey] || 1;
        const query = {
            view: 'summary',
            page,
            limit: ITEMS_PER_PAGE,
            generalStatus: 'OPEN',
        };

        if (tab === 'general') {
            query.pool = 'GENERAL';
            query.poolTeam = 'GENERAL';
        } else if (tab === 'team1') {
            query.pool = 'GENERAL';
            query.poolTeam = 'TEAM_1';
        } else if (tab === 'team2') {
            query.pool = 'GENERAL';
            query.poolTeam = 'TEAM_2';
        }

        if (selectedSources.length > 0) {
            query.source = selectedSources.join(',');
        }

        const payload = await DataService.fetchTaskPage(query);
        const items = Array.isArray(payload?.items) ? payload.items : [];
        return {
            items,
            total: Number(payload?.total || items.length || 0),
            page: Number(payload?.page || page),
        };
    }

    function normalizeSourceKey(value) {
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
    }

    function switchTab(tab, options = {}) {
        const preserveState = Boolean(options?.preserveState);
        AppState.currentPoolTab = tab;

        document.querySelectorAll('#page-task-list .header-tab-card').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById('tabBtn-' + tab);
        if (activeBtn) activeBtn.classList.add('active');

        const sections = ['poolGeneralContainer', 'poolTeam1Container', 'poolTeam2Container', 'poolTargetContainer', 'poolReportsContainer'];
        sections.forEach(sec => {
            const el = document.getElementById(sec);
            if (el) el.style.display = 'none';
        });

        const stdControls = document.getElementById('poolStandardControls');
        if (stdControls) stdControls.style.display = (tab === 'target' || tab === 'reports') ? 'none' : 'flex';

        _updateBulkAssignDropdown(tab);

        if (tab === 'general') { document.getElementById('poolGeneralContainer').style.display = 'block'; renderPoolTasks(); }
        else if (tab === 'team1') { document.getElementById('poolTeam1Container').style.display = 'block'; renderPoolTasks(); }
        else if (tab === 'team2') { document.getElementById('poolTeam2Container').style.display = 'block'; renderPoolTasks(); }
        else if (tab === 'target') { document.getElementById('poolTargetContainer').style.display = 'block'; renderTargetProjects(); }
        else if (tab === 'reports') {
            document.getElementById('poolReportsContainer').style.display = 'block';
            if (typeof TaskController !== 'undefined') {
                if (!preserveState && typeof TaskController.resetTaskReportView === 'function') {
                    TaskController.resetTaskReportView();
                }
                if (typeof TaskController.prepareTaskReportView === 'function') {
                    TaskController.prepareTaskReportView();
                }
            }
        }
        /* requests kaldırıldı */
    }

    function _updateBulkAssignDropdown(tab) {
        const bulkSel = document.getElementById('poolBulkAssignSelect');
        if (!bulkSel) return;
        bulkSel.innerHTML = '';

        const assignable = typeof AppState.getAssignableUsers === 'function'
            ? AppState.getAssignableUsers()
            : AppState.users.filter(u => u.role !== USER_ROLES.MANAGER && u.status !== 'Pasif');

        if (tab === 'general') {
            bulkSel.innerHTML = '<option value="">Atanacak Kişi/Takım Seç...</option>';
            const grpTeams = document.createElement('optgroup');
            grpTeams.label = 'Takımlar';
            grpTeams.appendChild(new Option('Team 1 Havuzuna', 'Team 1'));
            grpTeams.appendChild(new Option('Team 2 Havuzuna', 'Team 2'));
            bulkSel.appendChild(grpTeams);

            const grpUsers = document.createElement('optgroup');
            grpUsers.label = 'Personeller';
            assignable.forEach(u => grpUsers.appendChild(new Option(u.name, u.name)));
            bulkSel.appendChild(grpUsers);
        } else if (tab === 'team1' || tab === 'team2') {
            const teamName = tab === 'team1' ? 'Team 1' : 'Team 2';
            bulkSel.innerHTML = `<option value="">Atanacak Kişi Seç...</option>
                <option value="UNASSIGNED" style="font-weight:bold; color:var(--danger-color);">🌍 Genel Havuza Geri Gönder</option>`;
            const grp = document.createElement('optgroup');
            grp.label = `${teamName} Personelleri`;
            assignable.filter(u => u.team === teamName).forEach(u => grp.appendChild(new Option(u.name, u.name)));
            bulkSel.appendChild(grp);
        }
    }

    async function renderPoolTasks() {
        const genList = document.getElementById('poolGeneralList');
        const t1List = document.getElementById('poolTeam1List');
        const t2List = document.getElementById('poolTeam2List');
        const tab = AppState.currentPoolTab;
        try {
            if (tab === 'general') {
                const payload = await _fetchPoolTasks('general');
                _renderPoolTab(payload.items, payload.total, genList, payload.page, (v) => AppState.setPage('poolGen', v));
                _setPoolDot('dot-general', payload.total);
            }
            if (tab === 'team1') {
                const payload = await _fetchPoolTasks('team1');
                _renderPoolTab(payload.items, payload.total, t1List, payload.page, (v) => AppState.setPage('poolTeam1', v));
                _setPoolDot('dot-team1', payload.total);
            }
            if (tab === 'team2') {
                const payload = await _fetchPoolTasks('team2');
                _renderPoolTab(payload.items, payload.total, t2List, payload.page, (v) => AppState.setPage('poolTeam2', v));
                _setPoolDot('dot-team2', payload.total);
            }
        } catch (err) {
            console.error('Pool tasks load failed:', err);
            const activeList = tab === 'team1' ? t1List : tab === 'team2' ? t2List : genList;
            if (activeList) {
                activeList.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--danger-color);">Havuz verileri yüklenemedi.</td></tr>`;
            }
        }

        // Tüm seçim kutularını sıfırla
        ['selectAllGen', 'selectAllT1', 'selectAllT2'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = false;
        });

        _updatePoolActionBar();
        
    }

    function _setPoolDot(dotId, count) {
        const dot = document.getElementById(dotId);
        if (!dot) return;
        if (count > 0) dot.classList.add('active');
        else dot.classList.remove('active');
    }

    function _renderPoolTab(taskList, totalCount, listEl, currentPage, setPageVar) {
        if (!listEl) return;

        if (!Array.isArray(taskList) || totalCount === 0) {
            listEl.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px;">
                <div style="font-size:40px; margin-bottom:10px;">🏆</div>
                <strong style="color:var(--primary-color); display:block; font-size:16px;">Harika!</strong>
                <span style="color:#888; font-size:13px;">Bu havuzda görev yok.</span>
            </td></tr>`;
            _renderPoolPagination(listEl, totalCount, 1, setPageVar);
            return;
        }

        const bizMap = AppState.getBizMap();
        const rows = taskList.map(t => {
            const biz = bizMap.get(t.businessId) || {};
            const isChecked = AppState.selectedPoolIds.has(t.id) ? 'checked' : '';
            return `<tr onclick="togglePoolRowCheckbox(event, '${t.id}')" style="cursor:pointer;">
                <td><input type="checkbox" class="pool-cb" value="${t.id}" ${isChecked}
                    onchange="togglePoolCheckbox('${t.id}', this.checked); event.stopPropagation();"
                    onclick="event.stopPropagation();"></td>
                <td><strong style="color:var(--secondary-color); font-size:13px;">${biz.companyName || '-'}</strong></td>
                <td style="color:#666;">📍 ${biz.city || '-'}</td>
                <td><span class="badge badge-source">${t.sourceType || '-'}</span></td>
                <td style="text-align:right;"><button class="btn-action" style="padding:4px 10px; font-size:11px;" onclick="openTaskModal('${t.id}')">Göz At</button></td>
            </tr>`;
        }).join('');

        listEl.innerHTML = rows;
        _renderPoolPagination(listEl, totalCount, currentPage, setPageVar);
    }

    function _renderPoolPagination(listEl, totalCount, currentPage, setPageVar) {
        const pagContainerId = listEl.id + 'Pagination';
        let pagContainer = document.getElementById(pagContainerId);
        if (!pagContainer) {
            pagContainer = document.createElement('div');
            pagContainer.id = pagContainerId;
            pagContainer.className = 'pagination-container';
            const tableResp = listEl.closest('.table-responsive');
            if (tableResp?.parentNode) {
                tableResp.parentNode.insertBefore(pagContainer, tableResp.nextSibling);
            }
        }

        renderPagination(pagContainer, totalCount, currentPage, ITEMS_PER_PAGE, (i) => {
            setPageVar(i);
            renderPoolTasks();
        }, { compact: true, resultLabel: 'kayıt' });
    }

    function _updatePoolActionBar() {
        const count = AppState.selectedPoolIds.size;
        const bar = document.getElementById('poolActionBar');
        if (bar) {
            bar.style.display = count > 0 ? 'flex' : 'none';
            bar.classList.toggle('disabled', count === 0);
            const countEl = document.getElementById('poolSelectedCount');
            if (countEl) countEl.innerText = count;
        }
    }

    function togglePoolCheckbox(id, isChecked) {
        if (isChecked) AppState.selectedPoolIds.add(id);
        else AppState.selectedPoolIds.delete(id);
        _updatePoolActionBar();
    }

    function toggleSelectAllPool(tbodyId, isChecked) {
        document.querySelectorAll(`#${tbodyId} .pool-cb`).forEach(cb => {
            cb.checked = isChecked;
            togglePoolCheckbox(cb.value, isChecked);
        });
    }

    function togglePoolRowCheckbox(e, tId) {
        if (e.target.tagName.toLowerCase() === 'button' ||
            e.target.closest('button') ||
            e.target.classList.contains('pool-cb')) return;
        const cb = document.querySelector(`.pool-cb[value="${tId}"]`);
        if (cb) {
            cb.checked = !cb.checked;
            togglePoolCheckbox(tId, cb.checked);
        }
    }

    function executeBulkAssign() {
        if (typeof hasPermission === 'function' && !hasPermission('bulkAssign')) {
            showToast('Toplu aktarim yetkiniz bulunmuyor.', 'warning');
            return;
        }
        if (AppState.selectedPoolIds.size === 0) {
            showToast('Önce en az bir görev seçin.', 'warning');
            return;
        }
        const targetEl = document.getElementById('poolBulkAssignSelect');
        if (!targetEl) return;
        const target = targetEl.value;
        if (!target) {
            showToast('Lütfen atanacak kişiyi seçin.', 'warning');
            return;
        }

        const taskIds = Array.from(AppState.selectedPoolIds);
        const promises = taskIds.map(tId => {
            if (target === 'UNASSIGNED' || target === 'Team 1' || target === 'Team 2') {
                const poolParam = target === 'UNASSIGNED' ? 'GENERAL' : (target === 'Team 1' ? 'TEAM_1' : 'TEAM_2');
                return DataService.apiRequest(`/tasks/${tId}/pool`, {
                    method: 'POST',
                    body: JSON.stringify({ poolTeam: poolParam })
                }).catch(err => {
                    console.warn(`Task ${tId} pool movement failed:`, err);
                    return null;
                });
            } else {
                const fuzzyUser = AppState.users.find(u => u.name && u.name.toLowerCase() === target.toLowerCase());
                if (!fuzzyUser) {
                    console.warn(`User ${target} not found.`);
                    return null;
                }
                return DataService.apiRequest(`/tasks/${tId}/assign`, {
                    method: 'POST',
                    body: JSON.stringify({ ownerId: fuzzyUser.id, durationDays: 7 })
                }).catch(err => {
                    console.warn(`Task ${tId} assign failed:`, err);
                    return null;
                });
            }
        });

        Promise.all(promises).then(() => {
            // Optimistic local state update
            const dateStr = getCurrentDateStr();
            taskIds.forEach((tId) => {
                const idx = AppState.tasks.findIndex((x) => x.id === tId);
                if (idx === -1) return;
                AppState.tasks[idx] = {
                    ...AppState.tasks[idx],
                    assignee: target,
                    status: 'new',
                    logs: [{ date: dateStr, user: AppState.loggedInUser.name, text: target === 'UNASSIGNED'
                        ? `<span class="manager-note">[Sistem]</span> Görev Genel Havuza iade edildi.`
                        : `<span class="manager-note">[Sistem]</span> Havuzdan '${target}' üzerine atandı.` }, ...(AppState.tasks[idx].logs || [])],
                };
            });
            AppState.invalidateTaskMapCache();
            showToast(`${taskIds.length} görev başarıyla aktarıldı!`, 'success');
            AppState.selectedPoolIds.clear();
            renderPoolTasks();
        }).catch((err) => {
            console.error('Pool bulk assign failed:', err);
            showToast(err?.message || 'Aktarım sırasında hata oluştu.', 'error');
        });
    }

    function renderTargetProjects() {
        if (typeof ProjectController !== 'undefined' && typeof ProjectController.renderActiveProjects === 'function') {
            ProjectController.renderActiveProjects();
        }
    }

    return {
        switchTab,
        renderPoolTasks,
        togglePoolCheckbox,
        toggleSelectAllPool,
        togglePoolRowCheckbox,
        executeBulkAssign,
        renderTargetProjects,
    };
})();

// Global erişim
window.switchPoolTab = PoolController.switchTab.bind(PoolController);
window.renderPoolTasks = PoolController.renderPoolTasks.bind(PoolController);
window.togglePoolCheckbox = PoolController.togglePoolCheckbox.bind(PoolController);
window.toggleSelectAllPool = PoolController.toggleSelectAllPool.bind(PoolController);
window.togglePoolRowCheckbox = PoolController.togglePoolRowCheckbox.bind(PoolController);
window.executeBulkAssign = PoolController.executeBulkAssign.bind(PoolController);
