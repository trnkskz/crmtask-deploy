// ==========================================
// PROJECT CONTROLLER
// (Hedef Liste / Proje Yönetimi)
// ==========================================
const ProjectController = {
    _deletingProjectIds: new Set(),

    _resolveAssigneeTarget(assigneeValue) {
        const raw = String(assigneeValue || '').trim();
        if (!raw) return { actualAssignee: 'UNASSIGNED', targetProjectId: null, poolTeam: 'GENERAL', ownerId: null };

        let actualAssignee = raw;
        let targetProjectId = null;
        if (raw.startsWith('TARGET_POOL_')) {
            targetProjectId = raw.replace('TARGET_POOL_', '');
            actualAssignee = 'TARGET_POOL';
        }

        let poolTeam = 'GENERAL';
        let ownerId = null;
        if (actualAssignee === 'Team 1') poolTeam = 'TEAM_1';
        else if (actualAssignee === 'Team 2') poolTeam = 'TEAM_2';
        else if (actualAssignee && actualAssignee !== 'TARGET_POOL' && actualAssignee !== 'UNASSIGNED') {
            const mapUser = AppState.users.find((u) => u.name === actualAssignee);
            if (mapUser) ownerId = mapUser.id;
        }

        return { actualAssignee, targetProjectId, poolTeam, ownerId };
    },

    async _applyPostCreatePool(taskId, poolTeam) {
        if (!taskId || !poolTeam || poolTeam === 'GENERAL') return;
        await DataService.apiRequest(`/tasks/${taskId}/pool`, {
            method: 'POST',
            body: JSON.stringify({ poolTeam }),
        });
    },

    _mapUiSourceToApi(value) {
        const raw = String(value || '').trim().toLowerCase();
        if (raw.includes('old account rakip')) return 'OLD_RAKIP';
        if (raw.includes('old account query') || raw === 'query') return 'QUERY';
        if (raw.includes('rakip')) return 'RAKIP';
        if (raw.includes('referans')) return 'REFERANS';
        if (raw.includes('old account')) return 'OLD';
        if (raw.includes('lead')) return 'FRESH';
        return 'FRESH';
    },

    _mapUiTaskCategoryToApi(value) {
        const raw = String(value || '').trim().toLowerCase();
        if (raw.includes('anadolu')) return 'ANADOLU_CORE';
        if (raw.includes('travel') || raw.includes('seyahat')) return 'TRAVEL';
        return 'ISTANBUL_CORE';
    },

    _normalizeSourceKey(value) {
        const raw = String(value || '').trim().toUpperCase();
        if (!raw) return '';
        if (raw.includes('OLD ACCOUNT RAKIP') || raw.includes('OLD_RAKIP')) return 'OLD_RAKIP';
        if (raw.includes('RAKIP')) return 'RAKIP';
        if (raw.includes('REFERANS')) return 'REFERANS';
        if (raw.includes('OLD ACCOUNT QUERY') || raw === 'QUERY' || raw.includes('LEAD')) return 'QUERY';
        if (raw.includes('OLD')) return 'OLD';
        if (raw.includes('FRESH')) return 'FRESH';
        return raw;
    },

    _matchesTargetAudienceSourceFilter(biz, bizTasks, selectedSources) {
        const normalizedSelected = (selectedSources || []).map((value) => this._normalizeSourceKey(value)).filter(Boolean);
        if (normalizedSelected.length === 0) return true;

        const sourceCandidates = new Set();
        [biz?.sourceType, biz?.source].forEach((value) => {
            const normalized = this._normalizeSourceKey(value);
            if (normalized) sourceCandidates.add(normalized);
        });
        (bizTasks || []).forEach((task) => {
            [task?.sourceType, task?.source].forEach((value) => {
                const normalized = this._normalizeSourceKey(value);
                if (normalized) sourceCandidates.add(normalized);
            });
        });

        return normalizedSelected.some((value) => sourceCandidates.has(value));
    },

    _matchesTargetAudienceCategoryFilter(biz, bizTasks, selectedMainCategories, selectedSubCategories) {
        const hasCategoryFilter = (selectedMainCategories || []).length > 0 || (selectedSubCategories || []).length > 0;
        if (!hasCategoryFilter) return true;

        const historyMatch = typeof matchesTaskHistoryCategoryFilter === 'function'
            ? matchesTaskHistoryCategoryFilter(bizTasks || [], selectedMainCategories, selectedSubCategories, biz?.companyName || biz?.businessName || '')
            : false;
        if (historyMatch) return true;

        const rawMain = biz?.mainCategory || '';
        const rawSub = biz?.subCategory || '';
        if (!rawMain && !rawSub) return false;

        const resolved = typeof resolveCanonicalCategory === 'function'
            ? resolveCanonicalCategory(rawMain, rawSub, biz?.companyName || biz?.businessName || '')
            : { mainCategory: rawMain, subCategory: rawSub };

        const mainCandidates = [rawMain, resolved.mainCategory].filter(Boolean);
        const subCandidates = [rawSub, resolved.subCategory].filter(Boolean);
        const mainMatches = (selectedMainCategories || []).length === 0 || selectedMainCategories.some((value) => mainCandidates.includes(value));
        const subMatches = (selectedSubCategories || []).length === 0 || selectedSubCategories.some((value) => subCandidates.includes(value));
        return mainMatches && subMatches;
    },

    _matchesTargetAudienceDateFilter(biz, bizTasks, selectedYears, selectedMonths) {
        const hasDateFilter = (selectedYears || []).length > 0 || (selectedMonths || []).length > 0;
        if (!hasDateFilter) return true;

        const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
        const dateCandidates = [];

        (bizTasks || []).forEach((task) => {
            if (!task?.createdAt) return;
            const parsed = new Date(task.createdAt);
            if (!isNaN(parsed.getTime())) dateCandidates.push(parsed);
        });

        if (biz?.createdAt) {
            const parsedBizDate = new Date(biz.createdAt);
            if (!isNaN(parsedBizDate.getTime())) dateCandidates.push(parsedBizDate);
        }

        if (dateCandidates.length === 0) return false;

        return dateCandidates.some((dateObj) => {
            if ((selectedYears || []).length > 0 && !selectedYears.includes(dateObj.getFullYear().toString())) return false;
            if ((selectedMonths || []).length > 0) {
                const monthName = monthNames[dateObj.getMonth()];
                if (!selectedMonths.includes(monthName)) return false;
            }
            return true;
        });
    },

    _matchesTargetAudienceFilters(biz, filters, taskMap) {
        if ((biz.businessStatus || 'Aktif') === 'Pasif') return false;
        const bizTasks = (taskMap && taskMap[biz.id]) || [];

        if (!filters.includeActive && bizTasks.some((task) => isActiveTask(task.status))) return false;
        if ((filters.cities || []).length > 0 && !filters.cities.includes(biz.city)) return false;
        if ((filters.districts || []).length > 0 && !filters.districts.includes(biz.district)) return false;
        if (!this._matchesTargetAudienceSourceFilter(biz, bizTasks, filters.sources)) return false;
        if (!this._matchesTargetAudienceCategoryFilter(biz, bizTasks, filters.mainCategories, filters.subCategories)) return false;
        if (!this._matchesTargetAudienceDateFilter(biz, bizTasks, filters.years, filters.months)) return false;
        return true;
    },


    // ---- Görev Oluşturma Sekmeleri ----

    switchTaskCreateTab(tab) {
        ['existing', 'new', 'target'].forEach(t => {
            const btn = document.getElementById(`tabCreateTask-${t}`);
            if (btn) btn.classList.toggle('active', tab === t);
        });
        
        const secExist = document.getElementById('taskCreateExistingSection');
        const secNew = document.getElementById('businessForm');
        const secTarget = document.getElementById('taskCreateTargetSection');
        
        if (secExist) {
            secExist.style.display = tab === 'existing' ? 'flex' : 'none';
            secExist.classList.remove('split-active'); // Yeni aramada split'i sıfırla
        }
        if (secNew) secNew.style.display = tab === 'new' ? 'block' : 'none';
        if (secTarget) secTarget.style.display = tab === 'target' ? 'block' : 'none';

        const summaryCard = document.getElementById('existingBizSummaryCard'); if (summaryCard) summaryCard.style.display = 'none';
        const assignPanel = document.getElementById('existingBizAssignPanel'); if (assignPanel) assignPanel.style.display = 'none';

        const formBiz = document.getElementById('businessForm'); if (formBiz) formBiz.reset();
        const sBizId = document.getElementById('selectedBizId'); if (sBizId) sBizId.value = '';
        const warnEl = document.getElementById('newBizDuplicateWarning'); if (warnEl) warnEl.style.display = 'none';

        if (tab === 'new') {
            const citySelect = document.getElementById('city');
            if (citySelect && citySelect.options.length === 0) {
                citySelect.add(new Option('Seçilmedi', ''));
                cities.forEach(c => citySelect.add(new Option(c, c)));
            }
            if (citySelect) citySelect.value = '';
            updateDistricts();
        }
        if (tab === 'target') {
            const tProj = document.getElementById('targetProjectName'); if (tProj) tProj.value = '';
            const tPull = document.getElementById('targetPullExisting'); if (tPull) tPull.checked = false;
            const baseNote = document.getElementById('targetBaseNote'); if (baseNote) baseNote.value = '';
            const bulkNote = document.getElementById('targetBulkNote'); if (bulkNote) bulkNote.value = '';
            this.toggleTargetFilters();
        }
    },

    checkDuplicateBiz(val) {
        const warnEl = document.getElementById('newBizDuplicateWarning'); if (!warnEl) return;
        if (!val || val.length < 3) { warnEl.style.display = 'none'; return; }
        const rawVal = val.toLowerCase().replace(/\s+/g, '');
        const exists = AppState.businesses.some(b => (b.companyName || '').toLowerCase().replace(/\s+/g, '').includes(rawVal));
        if (exists) {
            warnEl.style.display = 'block';
            warnEl.innerHTML = `⚠️ Sistemde benzer bir kayıt bulundu. Lütfen 'Var Olan Account' sekmesini kontrol edin!`;
        } else {
            warnEl.style.display = 'none';
        }
    },

    searchExistingBizForTask(val) {
        const dropdown = document.getElementById('existingBizDropdown'); if (!dropdown) return;
        dropdown.innerHTML = '';
        if (!val || val.length < 2) { dropdown.style.display = 'none'; return; }
        const matches = AppState.businesses.filter((b) => (
            typeof businessMatchesSearch === 'function'
                ? businessMatchesSearch(b, val)
                : normalizeText(b.companyName).includes(normalizeText(val))
        )).slice(0, 10);

        if (matches.length > 0) {
            matches.forEach(b => {
                const div = document.createElement('div');
                div.innerHTML = `<strong>${b.companyName}</strong><br><small>${b.city} • ${b.mainCategory || ''}</small>`;
                div.onclick = () => this.selectExistingBizForTask(b.id);
                dropdown.appendChild(div);
            });
            dropdown.style.display = 'block';
        } else {
            dropdown.style.display = 'none';
        }
    },

    selectExistingBizForTask(bizId) {
        const dropdown = document.getElementById('existingBizDropdown'); if (dropdown) dropdown.style.display = 'none';
        const srch = document.getElementById('taskSearchExistingBiz'); if (srch) srch.value = '';
        const biz = AppState.businesses.find(b => b.id === bizId); if (!biz) return;

        // Fikir 1-B: Animasyonlu Sola Kayma ve Sağ Panelin Açılması
        const secExist = document.getElementById('taskCreateExistingSection');
        if (secExist) secExist.classList.add('split-active');

        const summaryContainer = document.getElementById('existingBizSummaryContent');
        if (summaryContainer) {
            const activeTask = AppState.tasks.find(t => t.businessId === biz.id && isActiveTask(t.status));
            let warningHtml = '';
            if (activeTask) {
                const statusLabels = { 'new': 'Yeni', 'hot': 'Hot', 'nothot': 'Not Hot', 'followup': 'Takip' };
                warningHtml = `<div style="background:#fffbeb; border:1px solid #fde68a; color:#b45309; padding:12px; border-radius:8px; margin-bottom:15px; font-size:13px; font-weight:600; line-height:1.5; display:block; white-space:normal;">⚠️ Dikkat: Bu işletme şu an <b>${activeTask.assignee}</b> üzerinde <b>${statusLabels[activeTask.status] || activeTask.status}</b> durumunda!</div>`;
            }

            let lastLogHtml = '<span style="color:#888; font-size:12px; font-style:italic;">Geçmiş işlem bulunamadı.</span>';
            const allBizTasks = AppState.tasks.filter(t => t.businessId === biz.id);
            let allLogs = [];
            allBizTasks.forEach(t => { if (t.logs) allLogs = allLogs.concat(t.logs); });
            allLogs.sort((a, b) => parseLogDate(b.date) - parseLogDate(a.date));
            if (allLogs.length > 0) {
                const ll = allLogs[0];
                lastLogHtml = `<div style="background:#f8f9fa; border:1px solid #e2e8f0; padding:12px; border-radius:8px; font-size:12px;"><strong style="color:var(--primary-color);">👤 ${ll.user}</strong> <span style="color:#888;">(${ll.date.split(' ')[0]})</span><br><div style="margin-top:6px; color:var(--secondary-color); line-height:1.5;">${ll.text}</div></div>`;
            }

            summaryContainer.innerHTML = `${warningHtml}<div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:20px; font-size:13px;"><div><strong style="color:#64748b; display:block; font-size:11px; text-transform:uppercase;">İşletme Adı</strong><span style="color:var(--secondary-color); font-weight:600;">${biz.companyName}</span></div><div><strong style="color:#64748b; display:block; font-size:11px; text-transform:uppercase;">Konum</strong><span>📍 ${biz.city || '-'} ${biz.district ? '/ ' + biz.district : ''}</span></div><div><strong style="color:#64748b; display:block; font-size:11px; text-transform:uppercase;">Yetkili</strong><span>👤 ${biz.contactName || '-'}</span></div><div><strong style="color:#64748b; display:block; font-size:11px; text-transform:uppercase;">İletişim</strong><span>📞 ${biz.contactPhone || '-'}</span></div></div><div><strong style="color:#64748b; display:block; font-size:11px; text-transform:uppercase; margin-bottom:8px;">📝 Son İşlem Önizlemesi</strong>${lastLogHtml}</div>`;
        }

        const btnDetails = document.getElementById('btnViewBizDetailsModal');
        if (btnDetails) btnDetails.onclick = () => openBusinessDetailModal(biz.id);
        const summaryCard = document.getElementById('existingBizSummaryCard'); if (summaryCard) summaryCard.style.display = 'block';
        const assignPanel = document.getElementById('existingBizAssignPanel');
        if (assignPanel) {
            assignPanel.style.display = 'block';
            document.getElementById('existAssignBizId').value = biz.id;
            document.getElementById('existAssignTaskCat').value = 'İstanbul Core';
            document.getElementById('existAssignSourceType').value = biz.sourceType || 'Fresh Account';
            if (typeof syncCampaignUrlVisibility === 'function') {
                syncCampaignUrlVisibility('existAssignSourceType', 'existAssignCampaignUrlGroup', 'existAssignCampaignUrl');
            }
            const defaultMainCategory = biz.mainCategory && AppState.dynamicCategories[biz.mainCategory]
                ? biz.mainCategory
                : (Object.keys(AppState.dynamicCategories)[0] || '');
            document.getElementById('existAssignMainCat').value = defaultMainCategory;
            updateExistAssignSubCat();
            document.getElementById('existAssignSubCat').value = biz.subCategory || '';
            document.getElementById('existAssignCampaignUrl').value = biz.campaignUrl || '';
            document.getElementById('existAssignNote').value = '';
            const existCb = document.getElementById('existUseExistingContact');
            if (existCb) { existCb.checked = true; document.getElementById('existNewContactFields').style.display = 'none'; }
            document.getElementById('existNewContactName').value = '';
            document.getElementById('existNewContactPhone').value = '';
            document.getElementById('existNewContactEmail').value = '';
        }
    },

    async submitExistingTaskAssign() {
        const btn = document.querySelector('button[onclick="submitExistTaskAssign()"]');
        if (btn) { btn.disabled = true; btn.innerText = "⏳ Kaydediliyor..."; }

        try {
            const getValue = id => { const el = document.getElementById(id); return el ? el.value : ''; };
            const bizId = getValue('existAssignBizId');
            const assigneeValue = getValue('existAssigneeSelect');
            const taskCat = getValue('existAssignTaskCat');
            const mainCat = getValue('existAssignMainCat');
            const subCat = getValue('existAssignSubCat');
            const note = esc(getValue('existAssignNote').trim());
            const sourceValue = getValue('existAssignSourceType');
            const campaignUrl = getValue('existAssignCampaignUrl').trim();

            if (!bizId) throw new Error("Önce soldan bir işletme seçin!");
            if (!assigneeValue) throw new Error("Sorumlu seçimi zorunludur!");

            const { actualAssignee, targetProjectId, poolTeam, ownerId: resolvedOwnerId } = this._resolveAssigneeTarget(assigneeValue);

            const existingOpenTask = AppState.tasks.find((t) =>
                t.businessId === bizId &&
                isActiveTask(t.status) &&
                (!targetProjectId || t.type !== 'PROJECT')
            );
            if (existingOpenTask && !targetProjectId) {
                throw new Error("Bu işletmede zaten açık bir genel görev var. Mevcut görevi kullanın ya da önce kapatın.");
            }

            const taskCatEnum = this._mapUiTaskCategoryToApi(taskCat);
            const srcEnum = this._mapUiSourceToApi(sourceValue);

            const projectNote = targetProjectId ? ` (Proje: ${targetProjectId})` : '';
            const taskPayload = {
                accountId: bizId,
                category: taskCatEnum,
                type: targetProjectId ? 'PROJECT' : 'GENERAL',
                priority: 'MEDIUM',
                accountType: 'KEY',
                creationChannel: 'MANUAL_TASK_CREATE',
                source: srcEnum,
                mainCategory: mainCat || 'Belirtilmemiş',
                subCategory: subCat || 'Belirtilmemiş',
                details: `${note || 'Mevcut işletmeye görev atandı'}${projectNote}`,
                ownerId: resolvedOwnerId,
            };
            if (isCampaignUrlRequiredSource(sourceValue)) {
                taskPayload.campaignUrl = campaignUrl || undefined;
            }
            if (targetProjectId) {
                taskPayload.historicalAssignee = 'TARGET_POOL';
            }

            const useExistingContact = document.getElementById('existUseExistingContact')?.checked;
            if (!useExistingContact) {
                const newName = esc(getValue('existNewContactName').trim());
                const newPhone = esc(getValue('existNewContactPhone').trim());
                const newEmail = esc(getValue('existNewContactEmail').trim());
                if (newName || newPhone || newEmail) {
                    taskPayload.newContact = {
                        name: newName || 'Yetkili',
                        phone: newPhone || undefined,
                        email: newEmail || undefined
                    };
                }
            }

            const task = await DataService.apiRequest('/tasks', {
                method: 'POST',
                body: JSON.stringify(taskPayload)
            });
            await this._applyPostCreatePool(task?.id, poolTeam);
            if (typeof DataService !== 'undefined' && typeof DataService.invalidateCollectionCache === 'function') {
                DataService.invalidateCollectionCache('tasks');
                DataService.invalidateCollectionCache('businesses');
                DataService.invalidateCollectionCache('projects');
            }
            if (typeof SyncService !== 'undefined' && typeof SyncService.requestSync === 'function') {
                SyncService.requestSync(['tasks', 'businesses', 'projects']);
            }

            if (typeof addSystemLog === 'function') addSystemLog(`Mevcut işletmeye görev atandı: ${bizId} -> Sorumlu: ${actualAssignee}`);
            showToast("Görev başarıyla atandı!", "success");
            
            const sCard = document.getElementById('existingBizSummaryCard'); if (sCard) sCard.style.display = 'none';
            const aPanel = document.getElementById('existingBizAssignPanel'); if (aPanel) aPanel.style.display = 'none';

        } catch (err) {
            console.error('Görev atama hatası:', err);
            const message = String(err?.message || '');
            if (message.includes('already has an OPEN General task')) {
                showToast("Bu işletmede zaten açık bir genel görev var. Mevcut görevi kullanın ya da önce kapatın.", "error");
            } else {
                showToast(message || "Görev atanamadı!", "error");
            }
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = "Görevi Başlat"; }
        }
    },

    submitCreateNewTask() {
        const btn = document.querySelector('button[onclick="submitCreateTask()"]');
        if (btn) { btn.disabled = true; btn.innerText = "⏳ Kaydediliyor..."; }

        const compNameEl = document.getElementById('companyName');
        if (!compNameEl) { if (btn) { btn.disabled = false; btn.innerText = "🚀 Taskı Oluştur ve Atama Yap"; } return; }
        const compName = esc(compNameEl.value.trim());
        if (!compName) { if (btn) { btn.disabled = false; btn.innerText = "🚀 Taskı Oluştur ve Atama Yap"; } return showToast('İşletme Adı zorunludur!', "error"); }
        if (!isValidName(compName)) { if (btn) { btn.disabled = false; btn.innerText = "🚀 Taskı Oluştur ve Atama Yap"; } return showToast('Geçersiz işletme adı!', "error"); }

        const getValue = id => { const el = document.getElementById(id); return el ? esc(el.value) : ''; };
        const phone = getValue('contactPhone');
        if (phone && !isValidPhone(phone)) { if (btn) { btn.disabled = false; btn.innerText = "🚀 Taskı Oluştur ve Atama Yap"; } return showToast("Geçersiz telefon numarası!", "error"); }
        const email = getValue('contactEmail').toLowerCase();
        if (email && !isValidEmail(email)) { if (btn) { btn.disabled = false; btn.innerText = "🚀 Taskı Oluştur ve Atama Yap"; } return showToast("Geçersiz e-posta adresi!", "error"); }
        const srcType = getValue('sourceType');
            const campUrl = isCampaignUrlRequiredSource(srcType) ? getValue('campaignUrl').trim() : "";

        const assigneeValue = getValue('newBizAssignee') || 'UNASSIGNED';
        const { actualAssignee, targetProjectId, poolTeam, ownerId } = this._resolveAssigneeTarget(assigneeValue);

        const note = getValue('newTaskNote').trim();

        // 1. Önce Account oluştur
        const accountPayload = {
            companyName: compName,
            contactName: getValue('contactName') || undefined,
            contactPhone: phone || undefined,
            contactEmail: email || undefined,
            category: getValue('mainCategory') || 'Diğer',
            sourceType: this._mapUiSourceToApi(srcType),
            city: getValue('city') || undefined,
            district: getValue('district') || undefined,
            address: getValue('address'),
            website: getValue('website') || undefined,
            instagram: getValue('instagram') || undefined,
            campaignUrl: campUrl || undefined,
        };

        DataService.apiRequest('/accounts', {
            method: 'POST',
            body: JSON.stringify(accountPayload)
        }).then(account => {
            const srcMap = this._mapUiSourceToApi(srcType);
            const taskCatRaw = this._mapUiTaskCategoryToApi(getValue('taskCategory'));

            // 2. Sonra Task oluştur
            const taskPayload = {
                accountId: account.id,
                category: taskCatRaw,
                type: targetProjectId ? 'PROJECT' : 'GENERAL',
                priority: 'MEDIUM',
                accountType: 'KEY',
                creationChannel: 'MANUAL_TASK_CREATE',
                source: srcMap,
                mainCategory: getValue('mainCategory') || 'Diğer',
                subCategory: getValue('subCategory') || 'Diğer',
                systemLogText: '<span class="manager-note">[Sistem]</span> Yeni işletme oluşturuldu ve görev başlatıldı.',
                campaignUrl: campUrl || undefined,
            };
            if (note) {
                taskPayload.details = note;
            }
            if (targetProjectId) {
                taskPayload.projectId = targetProjectId;
                taskPayload.historicalAssignee = 'TARGET_POOL';
            }

            if (ownerId) taskPayload.ownerId = ownerId;

            if (getValue('contactName') || phone || email) {
                taskPayload.newContact = {
                    name: getValue('contactName') || 'Yetkili',
                    phone: phone || undefined,
                    email: email || undefined,
                };
            }

            return DataService.apiRequest('/tasks', {
                method: 'POST',
                body: JSON.stringify(taskPayload)
            });
        }).then(async (task) => {
            await this._applyPostCreatePool(task?.id, poolTeam);
            if (typeof DataService !== 'undefined' && typeof DataService.invalidateCollectionCache === 'function') {
                DataService.invalidateCollectionCache('tasks');
                DataService.invalidateCollectionCache('businesses');
                DataService.invalidateCollectionCache('projects');
            }
            if (typeof SyncService !== 'undefined' && typeof SyncService.requestSync === 'function') {
                SyncService.requestSync(['tasks', 'businesses', 'projects']);
            }
            if (btn) { btn.disabled = false; btn.innerText = "🚀 Taskı Oluştur ve Atama Yap"; }
            addSystemLog(`"${compName}" için yeni task: '${actualAssignee}'`);
            showToast("Yeni İşletme ve Task oluşturuldu!", "success");
            const form = document.getElementById('businessForm'); if (form) form.reset();
            const warn = document.getElementById('newBizDuplicateWarning'); if (warn) warn.style.display = 'none';
        }).catch(err => {
            console.error('Görev oluşturma hatası:', err);
            showToast("Oluşturma hatası: " + err.message, "error");
            if (btn) { btn.disabled = false; btn.innerText = "🚀 Taskı Oluştur ve Atama Yap"; }
        });
    },

    // ---- Hedef Liste / Filtreler ----

    toggleTargetFilters() {
        const tf = document.getElementById('targetFilters');
        const tp = document.getElementById('targetPullExisting');
        const splitContainer = document.getElementById('targetSplitContainer');
        const floatingStrip = document.getElementById('targetFloatingStrip');
        const baseActions = document.getElementById('targetBaseActions');
        const createButton = document.getElementById('targetCreateButton');
        const countLabel = document.getElementById('targetLiveCountLabel');

        if (tf && tp && splitContainer) {
            if (tp.checked) {
                // Önce display:block yapıp görünür kılıyoruz
                tf.style.display = 'block';
                // CSS animasyonunun çalışması için milisaniyelik bir gecikmeyle class ekliyoruz
                setTimeout(() => {
                    splitContainer.classList.add('split-active');
                }, 10);
                
                if(floatingStrip) floatingStrip.style.display = 'flex';
            } else {
                // Önce class'ı kaldırıp kapanma animasyonunu tetikliyoruz
                splitContainer.classList.remove('split-active');
                if(floatingStrip) floatingStrip.style.display = 'flex';
                
                // Animasyon bittikten sonra tamamen gizliyoruz (0.3sn = 300ms)
                setTimeout(() => {
                    if (!tp.checked) tf.style.display = 'none';
                }, 300);
            }
        }

        if (baseActions) baseActions.style.display = 'none';
        if (createButton) createButton.innerText = tp?.checked ? 'Havuza Gönder 🚀' : 'Projeyi Oluştur 🚀';
        if (countLabel) countLabel.innerText = tp?.checked ? 'Hedeflenen İşletme' : 'Proje Modu';
        
        this.updateTargetLiveCount();
    },

    updateTargetLiveCount() {
        const tp = document.getElementById('targetPullExisting');
        const countEl = document.getElementById('targetLiveCountDisplay');
        if (!tp || !countEl) return;
        if (!tp.checked) {
            countEl.style.display = 'block';
            countEl.innerHTML = 'Taslak';
            const tagsContainer = document.getElementById('targetFilterTags');
            if (tagsContainer) tagsContainer.innerHTML = `<span class="tcb-tag empty">Manuel proje modu aktif</span>`;
            return;
        }

        const getSelectedValues = id => {
            const el = document.getElementById(id);
            if (!el) return [];
            return Array.from(el.selectedOptions).map(opt => opt.value).filter(val => val);
        };

        const fCats = getSelectedValues('targetMainCat');
        const fSubCats = getSelectedValues('targetSubCat');
        const fCities = getSelectedValues('targetCity');
        const fDistricts = getSelectedValues('targetDistrict');
        const fSources = getSelectedValues('targetSource');
        const fYears = getSelectedValues('targetYear');
        const fMonths = getSelectedValues('targetMonth');

        const incEl = document.getElementById('targetIncludeActive');
        const includeActive = incEl ? incEl.checked : false;
        const taskMap = AppState.getTaskMap();

        const filters = {
            mainCategories: fCats,
            subCategories: fSubCats,
            cities: fCities,
            districts: fDistricts,
            sources: fSources,
            years: fYears,
            months: fMonths,
            includeActive,
        };

        const filtered = AppState.businesses.filter((biz) => this._matchesTargetAudienceFilters(biz, filters, taskMap));
        countEl.style.display = 'block';
        countEl.innerHTML = filtered.length;

        const tagsContainer = document.getElementById('targetFilterTags');
        if (tagsContainer) {
            let tagsHtml = '';
            if (fCats.length > 0) tagsHtml += `<span class="tcb-tag">Ana Kat: ${fCats.join(', ')}</span>`;
            if (fSubCats.length > 0) tagsHtml += `<span class="tcb-tag">Alt Kat: ${fSubCats.join(', ')}</span>`;
            if (fCities.length > 0) tagsHtml += `<span class="tcb-tag">İl: ${fCities.join(', ')}</span>`;
            if (fDistricts.length > 0) tagsHtml += `<span class="tcb-tag">İlçe: ${fDistricts.join(', ')}</span>`;
            if (fSources.length > 0) tagsHtml += `<span class="tcb-tag">Kaynak: ${fSources.join(', ')}</span>`;
            if (fYears.length > 0) tagsHtml += `<span class="tcb-tag">Yıl: ${fYears.join(', ')}</span>`;
            if (fMonths.length > 0) tagsHtml += `<span class="tcb-tag">Ay: ${fMonths.join(', ')}</span>`;
            if (includeActive) tagsHtml += `<span class="tcb-tag warning">Aktif Görevler Dahil</span>`;
            
            if (tagsHtml === '') tagsHtml = `<span class="tcb-tag empty">Sadece Sistemdeki Tüm Boş Kayıtlar</span>`;
            tagsContainer.innerHTML = tagsHtml;
        }
    },

    generateStrategicList() {
        if (typeof hasPermission === 'function' && !hasPermission('manageProjects')) {
            showToast('Proje yonetimi yetkiniz bulunmuyor.', 'warning');
            return;
        }
        const pNameEl = document.getElementById('targetProjectName'); if (!pNameEl) return;
        const pName = esc(pNameEl.value.trim()); if (!pName) return showToast("Lütfen Proje adını girin!", "warning");
        
        const getSelectedValues = id => {
            const el = document.getElementById(id);
            if (!el) return [];
            return Array.from(el.selectedOptions).map(opt => opt.value).filter(val => val);
        };

        const pYear = getSelectedValues('targetYear').join(', ');
        const pMonth = getSelectedValues('targetMonth').join(', ');
        const bulkNote = esc((document.getElementById('targetBulkNote')?.value || '').trim());
        const baseNote = esc((document.getElementById('targetBaseNote')?.value || '').trim());
        const projectNote = bulkNote || baseNote;
        let targetBizIds = [];

        const tp = document.getElementById('targetPullExisting');
        if (tp && tp.checked) {
            const fCats = getSelectedValues('targetMainCat');
            const fSubCats = getSelectedValues('targetSubCat');
            const fCities = getSelectedValues('targetCity');
            const fDistricts = getSelectedValues('targetDistrict');
            const fSources = getSelectedValues('targetSource');
            const fYears = getSelectedValues('targetYear');
            const fMonths = getSelectedValues('targetMonth');

            const incEl = document.getElementById('targetIncludeActive');
            const includeActive = incEl ? incEl.checked : false;
            const taskMap = AppState.getTaskMap();

            const filters = {
                mainCategories: fCats,
                subCategories: fSubCats,
                cities: fCities,
                districts: fDistricts,
                sources: fSources,
                years: fYears,
                months: fMonths,
                includeActive,
            };

            targetBizIds = AppState.businesses
                .filter((biz) => this._matchesTargetAudienceFilters(biz, filters, taskMap))
                .map((b) => b.id);
        }

        const shouldPullExisting = Boolean(tp && tp.checked);
        if (shouldPullExisting && targetBizIds.length === 0) return showToast("Filtrelere uyan işletme bulunamadı!", "warning");
        if (!shouldPullExisting && typeof hasPermission === 'function' && !hasPermission('createManualProject')) {
            showToast('Bos veya taslak proje olusturma yetkiniz bulunmuyor.', 'warning');
            return;
        }

        // 1. Proje oluştur
        const pObj = {
            name: pName,
            description: [pMonth, pYear, projectNote].filter(Boolean).join(' • ') || undefined,
            mode: shouldPullExisting ? 'DATA_DRIVEN' : 'MANUAL',
        };

        DataService.apiRequest('/projects', {
            method: 'POST',
            body: JSON.stringify(pObj)
        }).then(project => {
            this._upsertProjectInState(project, pMonth, pYear);
            const newProjectId = project.id;
            const actorName = AppState.loggedInUser?.name || 'Sistem';

            if (!shouldPullExisting) {
                addSystemLog(`"${pName}" için boş proje oluşturuldu.`);
                showToast(`"${pName}" taslak proje olarak oluşturuldu.`, "success");
                this.renderActiveProjects();
                if (typeof DropdownController !== 'undefined') DropdownController.updateAssigneeDropdowns();
                return [];
            }

            // 2. Her işletme için görev oluştur
            const taskPromises = targetBizIds.map((bId) => {
                const bizObj = AppState.businesses.find(x => x.id === bId) || {};
                const bizTask = (AppState.getTaskMap()[bId] || [])[0];
                const rawSrc = bizTask ? (bizTask.sourceType || bizTask.source || 'OLD') : (bizObj.sourceType || bizObj.source || 'OLD');
                const srcEnum = ({'Fresh Account':'FRESH','Old Account':'OLD','Old Account Rakip':'OLD_RAKIP','Old Account Query':'QUERY','Query':'QUERY','Lead':'FRESH','Rakip':'RAKIP','Referans':'REFERANS'}[rawSrc]) || (['QUERY','FRESH','RAKIP','OLD_RAKIP','REFERANS','OLD'].includes(rawSrc) ? rawSrc : 'OLD');
                const taskPayload = {
                    projectId: newProjectId,
                    accountId: bId,
                    category: 'ISTANBUL_CORE',
                    type: 'PROJECT',
                    priority: 'MEDIUM',
                    accountType: 'KEY',
                    creationChannel: 'PROJECT_GENERATED',
                    source: srcEnum,
                    details: projectNote || 'Hedef listesine eklendi.',
                    mainCategory: bizTask ? (bizTask.mainCategory || 'Belirtilmemiş') : (bizObj.mainCategory || 'Belirtilmemiş'),
                    subCategory: bizTask ? (bizTask.subCategory || 'Belirtilmemiş') : (bizObj.subCategory || 'Belirtilmemiş'),
                    historicalAssignee: 'TARGET_POOL',
                    systemLogText: `<span class="manager-note">[Sistem]</span> ${actorName}, "${pName}" hedef projesi kapsaminda bu kaydi Hedef Havuzuna ekledi.`,
                };
                return DataService.apiRequest('/tasks', {
                    method: 'POST',
                    body: JSON.stringify(taskPayload)
                }).then(() => ({ ok: true })).catch(err => {
                    console.warn('Task create failed:', err);
                    return { ok: false };
                });
            });

            return Promise.all(taskPromises);
        }).then((results) => {
            if (!shouldPullExisting) return;
            const successCount = results.filter((item) => item?.ok).length;
            const failedCount = results.length - successCount;
            addSystemLog(`"${pName}" hedef listesi oluşturuldu. (${targetBizIds.length} İşletme)`);
            if (failedCount > 0) {
                showToast(`"${pName}" oluşturuldu. ${successCount} görev eklendi, ${failedCount} görev eklenemedi.`, "warning");
            } else {
                showToast(`${successCount} işletme ile "${pName}" listesi oluşturuldu!`, "success");
            }
            this.renderActiveProjects();
            if (typeof DropdownController !== 'undefined') DropdownController.updateAssigneeDropdowns();
        }).catch(err => {
            console.error('Strategic list error:', err);
            showToast('Liste oluşturulurken hata: ' + err.message, 'error');
        });
    },

    // ---- Aktif Projeler ----

    _buildProjectStateRecord(project, fallbackMonth = '', fallbackYear = '') {
        const period = typeof extractProjectPeriod === 'function'
            ? extractProjectPeriod({
                ...project,
                month: project?.month || fallbackMonth,
                year: project?.year || fallbackYear,
                description: project?.description || [fallbackMonth, fallbackYear].filter(Boolean).join(' '),
            })
            : {
                month: fallbackMonth || project?.month || '',
                year: fallbackYear || project?.year || '',
                display: [fallbackMonth || project?.month || '', fallbackYear || project?.year || ''].filter(Boolean).join(' ').trim(),
            };

        return {
            ...project,
            description: project?.description || period.display || '',
            month: period.month,
            year: period.year,
            displayPeriod: period.display,
        };
    },

    _upsertProjectInState(project, fallbackMonth = '', fallbackYear = '') {
        if (!project || !project.id || !Array.isArray(AppState.projects)) return;
        const normalizedProject = this._buildProjectStateRecord(project, fallbackMonth, fallbackYear);
        const index = AppState.projects.findIndex((item) => item.id === normalizedProject.id);
        if (index >= 0) AppState.projects[index] = { ...AppState.projects[index], ...normalizedProject };
        else AppState.projects.unshift(normalizedProject);
    },

    _getProjectPeriodText(project) {
        if (typeof formatProjectPeriod === 'function') return formatProjectPeriod(project);
        return project?.displayPeriod || [project?.month, project?.year].filter(Boolean).join(' ') || '-';
    },

    _getProjectTasks(projectId) {
        const projectTaskMap = typeof AppState.getProjectTaskMap === 'function' ? AppState.getProjectTaskMap() : null;
        return projectTaskMap?.[projectId] ? [...projectTaskMap[projectId]] : [];
    },

    _getProjectPoolTasks(projectId) {
        return this._getProjectTasks(projectId).filter((task) => task.assignee === 'TARGET_POOL');
    },

    _getProjectVisibleActiveTasks(projectId) {
        return this._getProjectTasks(projectId).filter((task) => {
            if (task.assignee === 'TARGET_POOL') return false;
            if (typeof isVisibleTaskListProjectTask === 'function') return isVisibleTaskListProjectTask(task);
            return Boolean(task.projectId) && typeof isActiveTask === 'function' ? isActiveTask(task.status) : !['deal', 'cold', 'pending_approval'].includes(task.status);
        });
    },

    _summarizeProject(project) {
        const allTasks = this._getProjectTasks(project.id);
        const poolTasks = allTasks.filter((task) => task.assignee === 'TARGET_POOL');
        const activeTasks = this._getProjectVisibleActiveTasks(project.id);
        const total = allTasks.length;
        const dealCount = allTasks.filter((task) => task.status === 'deal').length;
        const coldCount = allTasks.filter((task) => task.status === 'cold').length;
        const openCount = activeTasks.length;
        const isUndistributed = poolTasks.length > 0 || total === 0;
        const isActiveDistributed = poolTasks.length === 0 && openCount > 0;
        const isArchived = total > 0 && poolTasks.length === 0 && openCount === 0;

        return {
            project,
            allTasks,
            poolTasks,
            activeTasks,
            total,
            dealCount,
            coldCount,
            openCount,
            isUndistributed,
            isActiveDistributed,
            isArchived,
        };
    },

    _renderProjectSummaryCard(summary) {
        const p = summary.project;
        const canManageProjects = typeof hasPermission === 'function' ? hasPermission('manageProjects') : true;
        const poolHtml = summary.poolTasks.length > 0
            ? `<span class="metric-capsule info" onclick="event.stopPropagation(); openProjectDetailsModal('${p.id}', 'pool')">Havuz: <b>${summary.poolTasks.length}</b></span>`
            : '';
        const statusBadgeHtml = summary.total === 0
            ? `<span class="ppc-status-badge" style="background:#eff6ff; color:#1d4ed8;">Taslak Proje</span>`
            : summary.openCount > 0
            ? `<span class="ppc-status-badge" style="background:#dcfce7; color:#166534;">Aktif Takipte</span>`
            : `<span class="ppc-status-badge">✓ Tamamlandı</span>`;

        return `<div class="premium-project-card" onclick="openProjectDetailsModal('${p.id}', 'active')" style="cursor:pointer;">
            <div class="ppc-header">
                <div>
                    <strong style="font-size:15px; color:#0f172a;">${p.name}</strong>
                    <div style="font-size:12px; color:#94a3b8; margin-top:2px;">${this._getProjectPeriodText(p)}</div>
                </div>
                ${statusBadgeHtml}
            </div>
            <div class="ppc-footer">
                <div class="ppc-metrics">
                    <span class="metric-capsule">Top: <b>${summary.total}</b></span>
                    <span class="metric-capsule warning" onclick="event.stopPropagation(); openProjectDetailsModal('${p.id}', 'active')">Açık: <b>${summary.openCount}</b></span>
                    ${poolHtml}
                    <span class="metric-capsule success">Deal: <b>${summary.dealCount}</b></span>
                    <span class="metric-capsule danger">Cold: <b>${summary.coldCount}</b></span>
                </div>
                <div class="ppc-actions" style="display:${canManageProjects ? 'flex' : 'none'};">
                    <button class="ghost-action-btn" onclick="event.stopPropagation(); openCloneProjectModal('${p.id}')">Klonla</button>
                    <button class="ghost-action-btn danger" onclick="event.stopPropagation(); deleteProject('${p.id}')">Sil</button>
                </div>
            </div>
        </div>`;
    },

    _buildProjectTaskTableRows(tasks, projectId, options = {}) {
        const showRemoveButton = options.showRemoveButton === true;
        const emptyMessage = options.emptyMessage || 'Kayıt bulunamadı.';
        if (!tasks || tasks.length === 0) {
            return `<div style="text-align:center; padding:30px; color:#888;">${emptyMessage}</div>`;
        }

        let html = `<div style="background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; overflow:hidden;"><table class="history-table" style="width:100%; margin:0; border:none;"><thead><tr><th style="background:#fff; border-bottom:1px solid #e2e8f0;">İşletme Adı</th><th style="background:#fff; border-bottom:1px solid #e2e8f0;">Görev</th><th style="background:#fff; border-bottom:1px solid #e2e8f0;">Kaynak</th><th style="background:#fff; border-bottom:1px solid #e2e8f0;">Kategori</th><th style="text-align:right; background:#fff; border-bottom:1px solid #e2e8f0;">İşlem</th></tr></thead><tbody>`;
        tasks.forEach(t => {
            const biz = AppState.businesses.find(b => b.id === t.businessId) || {};
            const rCountHtml = `<span style="font-size:11px; color:#888; margin-top:3px; display:block;"><b>${(AppState.getTaskMap()[biz.id] || []).length} İşlem</b> geçmişi</span>`;
            const taskLabel = (typeof TASK_STATUS_LABELS !== 'undefined' ? TASK_STATUS_LABELS[t.status] : null) || t.status || '-';
            const assigneeLabel = t.assignee || '-';
            const actionButton = showRemoveButton
                ? `<button class="btn-danger" style="padding:4px 10px; font-size:11px; border-radius:6px; box-shadow:none;" onclick="ProjectController.removeTaskFromProject('${t.id}', '${projectId}')">Listeden Çıkar</button>`
                : `<button class="btn-action" style="padding:4px 10px; font-size:11px;" onclick="document.getElementById('customProjectDetailModal').style.display='none'; openTaskModal('${t.id}')">Görevi Aç</button>`;
            html += `<tr><td><strong style="color:var(--primary-color); cursor:pointer; text-decoration:underline;" onclick="openBusinessDetailModal('${biz.id}')">${biz.companyName || 'Bilinmiyor'}</strong>${rCountHtml}</td><td><span style="font-size:12px; font-weight:700; color:#0f172a;">${taskLabel}</span><br><span style="font-size:11px; color:#64748b;">👤 ${assigneeLabel}</span></td><td><span class="badge badge-source">${t.sourceType || '-'}</span></td><td><span style="font-size:12px; font-weight:600; color:#475569;">${t.mainCategory || '-'}</span><br><span style="font-size:11px; color:#94a3b8;">${t.subCategory || '-'}</span></td><td style="text-align:right;">${actionButton}</td></tr>`;
        });
        html += `</tbody></table></div>`;
        return html;
    },

    renderActiveProjects() {
        const container = document.getElementById('targetActiveProjectsList'); if (!container) return;
        container.innerHTML = '';
        const canManageProjects = typeof hasPermission === 'function' ? hasPermission('manageProjects') : true;

        const summaries = AppState.projects.map((project) => this._summarizeProject(project));
        const undistributedProjects = summaries.filter((summary) => summary.isUndistributed);
        const activeDistributedProjects = summaries.filter((summary) => summary.isActiveDistributed);

        if (undistributedProjects.length === 0 && activeDistributedProjects.length === 0) {
            container.style.display = "block";
            container.innerHTML = `<div style="text-align:center; padding:30px; color:#888; background:#fff; border-radius:8px; border:1px solid var(--border-light);">Aktif proje bulunamadı.</div>`;
            return;
        }

        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.gap = "18px";

        let htmlStr = "";
        if (undistributedProjects.length > 0) {
            htmlStr += `<div>
                <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:16px; margin-bottom:10px;">
                    <div>
                        <h3 style="margin:0; color:#0f172a; font-size:16px;">Dağıtılmamış Projeler</h3>
                        <div style="font-size:12px; color:#64748b; margin-top:4px;">Henüz havuzda bekleyen ya da yeni oluşturulmuş proje listeleri.</div>
                    </div>
                    <div style="font-size:12px; color:#0f766e; font-weight:700;">${undistributedProjects.length} proje</div>
                </div>`;

            undistributedProjects.forEach((summary) => {
                const p = summary.project;
                htmlStr += `
            <div class="dark-emerald-project-card horizontal-strip">
                <button onclick="deleteProject('${p.id}')" class="depc-delete-btn" title="Projeyi Sil" style="display:${canManageProjects ? 'inline-flex' : 'none'};">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
                
                <div class="depc-left-info" onclick="openProjectDetailsModal('${p.id}')">
                    <h4 class="depc-title">🎯 ${p.name}</h4>
                    <div class="depc-meta">
                        <span>🗓️ ${this._getProjectPeriodText(p)}</span>
                        <span class="depc-badge">Havuz: <b id="pool_count_${p.id}">${summary.poolTasks.length}</b> İşletme</span>
                    </div>
                </div>
                
                <div class="depc-glass-capsule">
                    <div class="depc-controls">
                        <label class="depc-switch-label">
                            <input type="checkbox" id="dist_t1_${p.id}" checked class="depc-checkbox">
                            Team 1
                        </label>
                        <label class="depc-switch-label">
                            <input type="checkbox" id="dist_t2_${p.id}" checked class="depc-checkbox">
                            Team 2
                        </label>
                        <div class="depc-divider"></div>
                        <select id="dist_source_${p.id}" class="depc-select" onchange="ProjectController.updateProjectPoolCount('${p.id}')">
                            <option value="Tüm Kaynaklar">Tüm Kaynaklar</option>
                            <option value="Fresh Account">Fresh Account</option>
                            <option value="Old Account">Old Account</option>
                            <option value="Old Account Rakip">Old Account Rakip</option>
                            <option value="Old Account Query">Old Account Query</option>
                            <option value="Lead">Lead</option>
                            <option value="Query">Query</option>
                            <option value="Rakip">Rakip</option>
                        </select>
                    </div>
                    <button class="depc-action-btn" onclick="distributeProjectTasks('${p.id}')" style="display:${canManageProjects ? 'inline-flex' : 'none'};">🚀 Dağıt</button>
                </div>
            </div>`;
            });
            htmlStr += `</div>`;
        }

        if (activeDistributedProjects.length > 0) {
            htmlStr += `<div>
                <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:16px; margin-bottom:10px;">
                    <div>
                        <h3 style="margin:0; color:#0f172a; font-size:16px;">Aktif Projeler</h3>
                        <div style="font-size:12px; color:#64748b; margin-top:4px;">Dağıtımı tamamlanmış ama içinde hala açık görev bulunan proje kanalı.</div>
                    </div>
                    <div style="font-size:12px; color:#854d0e; font-weight:700;">${activeDistributedProjects.length} proje</div>
                </div>
                <div style="display:flex; flex-direction:column; gap:12px;">
                    ${activeDistributedProjects.map((summary) => this._renderProjectSummaryCard(summary)).join('')}
                </div>
            </div>`;
        }
        container.innerHTML = htmlStr;
    },

    updateProjectPoolCount(projectId) {
        const sourceSelect = document.getElementById('dist_source_' + projectId);
        const countEl = document.getElementById('pool_count_' + projectId);
        if (!sourceSelect || !countEl) return;

        const sourceFilter = sourceSelect.value;
        let pTasks = AppState.tasks.filter(t => t.projectId === projectId && t.assignee === 'TARGET_POOL');
        
        if (sourceFilter !== 'Tüm Kaynaklar') {
            const selectedSource = this._normalizeSourceKey(sourceFilter);
            pTasks = pTasks.filter(t => this._normalizeSourceKey(t.sourceType || t.source) === selectedSource);
        }
        
        countEl.innerText = pTasks.length;
    },

    openProjectDetailsModal(projectId, focus = 'pool') {
        let m = document.getElementById('customProjectDetailModal');
        if (!m) {
            m = document.createElement('div');
            m.id = 'customProjectDetailModal';
            m.className = 'modal-overlay';
            m.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100%; height:100%; z-index:9000; background:rgba(15, 23, 42, 0.7); align-items:center; justify-content:center; backdrop-filter:blur(4px);';
            m.innerHTML = `<div class="modal-content" style="background:#fff; border-radius:12px; max-width:900px; width:95%; max-height:90vh; overflow-y:auto; position:relative; padding:25px; box-shadow:0 10px 40px rgba(0,0,0,0.2);">
                               <button class="modal-close-btn" style="position:absolute; right:15px; top:15px; font-size:14px; font-weight:bold; border:1px solid #e2e8f0; background:#f8fafc; color:#64748b; padding:6px 12px; border-radius:8px; cursor:pointer;" onclick="document.getElementById('customProjectDetailModal').style.display='none'">X Kapat</button>
                               <div id="customProjectDetailArea"></div>
                           </div>`;
            document.body.appendChild(m);
            m.addEventListener('click', (e) => {
                if(e.target === m) m.style.display='none';
            });
        }

        const p = AppState.projects.find(x => x.id === projectId); if (!p) return;
        const summary = this._summarizeProject(p);
        const pTasks = summary.poolTasks;
        const activeTasks = summary.activeTasks;
        const showActiveFirst = focus === 'active';

        let html = `<div class="fresh-modal-header" style="margin-bottom:20px;"><h3 style="margin:0; color:var(--primary-color);">🎯 ${p.name} - Proje Detayı</h3><p style="margin:5px 0 0 0; color:#888; font-size:13px;">Projede bekleyen havuz kayıtlarını ve açık görevleri buradan inceleyebilirsiniz.</p></div>`;
        html += `<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px;">
            <button class="ghost-action-btn" onclick="openProjectDetailsModal('${projectId}', 'pool')" style="${!showActiveFirst ? 'border-color:#0f766e; color:#0f766e; background:#ecfdf5;' : ''}">Havuzdaki İşletmeler (${pTasks.length})</button>
            <button class="ghost-action-btn" onclick="openProjectDetailsModal('${projectId}', 'active')" style="${showActiveFirst ? 'border-color:#854d0e; color:#854d0e; background:#fffbeb;' : ''}">Açık Görevler (${activeTasks.length})</button>
        </div>`;

        html += showActiveFirst
            ? this._buildProjectTaskTableRows(activeTasks, projectId, {
                emptyMessage: 'Bu projede açık görev görünmüyor.',
                showRemoveButton: false,
            })
            : this._buildProjectTaskTableRows(pTasks, projectId, {
                emptyMessage: 'Bu projede atanmayı bekleyen işletme kalmadı.',
                showRemoveButton: true,
            });

        const area = document.getElementById('customProjectDetailArea'); if (area) area.innerHTML = html;
        m.style.display = 'flex';
    },

    removeTaskFromProject(taskId, projectId) {
        askConfirm("Bu işletmeyi proje havuzundan çıkarmak istediğinize emin misiniz?", res => {
            if (res) {
                const t = AppState.tasks.find(x => x.id === taskId);
                if (t) {
                    Promise.all([
                        DataService.apiRequest(`/tasks/${taskId}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ projectId: null })
                        }),
                        DataService.apiRequest(`/tasks/${taskId}/pool`, {
                            method: 'POST',
                            body: JSON.stringify({ poolTeam: 'GENERAL' })
                        }).catch(() => null)
                    ]).then(async () => {
                        const refreshedTask = await DataService.readPath(`tasks/${taskId}`).catch(() => null);
                        const taskIndex = AppState.tasks.findIndex(x => x.id === taskId);
                        if (taskIndex >= 0 && refreshedTask) {
                            AppState.tasks[taskIndex] = refreshedTask;
                        }
                        showToast("İşletme projeden çıkarıldı.", "success");
                        if (projectId) {
                            ProjectController.openProjectDetailsModal(projectId);
                        }
                        this.renderActiveProjects();
                    }).catch(err => {
                        console.error('Remove from project error:', err);
                        showToast('Hata: ' + err.message, 'error');
                    });
                }
            }
        });
    },

    distributeProjectTasks(projectId) {
        if (typeof hasPermission === 'function' && !hasPermission('manageProjects')) {
            showToast('Proje dagitim yetkiniz bulunmuyor.', 'warning');
            return;
        }
        const sourceSelect = document.getElementById('dist_source_' + projectId);
        const team1Cb = document.getElementById('dist_t1_' + projectId);
        const team2Cb = document.getElementById('dist_t2_' + projectId);
        if (!team1Cb.checked && !team2Cb.checked) return showToast("En az bir takım seçmelisiniz!", "warning");

        const p = AppState.projects.find(x => x.id === projectId);
        const pName = p ? p.name : 'Bilinmeyen Proje';

        let pTasks = AppState.tasks.filter(t => t.projectId === projectId && t.assignee === 'TARGET_POOL');
        if (pTasks.length === 0) return showToast("Dağıtılacak görev kalmadı.", "info");

        const sourceFilter = sourceSelect ? sourceSelect.value : 'Tüm Kaynaklar';
        if (sourceFilter !== 'Tüm Kaynaklar') {
            const selectedSource = this._normalizeSourceKey(sourceFilter);
            pTasks = pTasks.filter(t => this._normalizeSourceKey(t.sourceType || t.source) === selectedSource);
        }
        if (pTasks.length === 0) return showToast("Bu kaynağa ait dağıtılacak görev yok.", "warning");

        const teams = [];
        if (team1Cb.checked) teams.push("TEAM_1");
        if (team2Cb.checked) teams.push("TEAM_2");

        const promises = pTasks.map(async (t, index) => {
            const targetPool = teams[index % teams.length];
            await DataService.apiRequest(`/tasks/${t.id}/pool`, {
                method: 'POST',
                body: JSON.stringify({ poolTeam: targetPool })
            });
            const refreshedTask = await DataService.readPath(`tasks/${t.id}`).catch(() => null);
            if (refreshedTask) {
                const taskIndex = AppState.tasks.findIndex(x => x.id === t.id);
                if (taskIndex >= 0) AppState.tasks[taskIndex] = refreshedTask;
            }
            return { ok: true, taskId: t.id };
        });

        Promise.allSettled(promises).then(results => {
            const successCount = results.filter(r => r.status === 'fulfilled').length;
            const failCount = results.length - successCount;
            addSystemLog(`Proje (${projectId}) takımlara dağıtıldı.`);
            this.renderActiveProjects();
            if (projectId) {
                ProjectController.openProjectDetailsModal(projectId);
            }
            if (failCount > 0) {
                results
                    .filter(r => r.status === 'rejected')
                    .forEach(r => console.warn('Project distribution failed:', r.reason));
                showToast(`${successCount} görev dağıtıldı, ${failCount} görev başarısız oldu.`, "warning");
                return;
            }
            showToast(`${successCount} görev takımlara başarıyla dağıtıldı!`, "success");
        });
    },

    deleteProject(projectId) {
        if (typeof hasPermission === 'function' && !hasPermission('manageProjects')) {
            showToast('Proje silme yetkiniz bulunmuyor.', 'warning');
            return;
        }
        if (!projectId || this._deletingProjectIds.has(projectId)) return;
        askConfirm("Bu projeyi silmek istediğinize emin misiniz? Projeye ait oluşturulan görevler de kalıcı olarak silinecektir! (İşletme ana verileri güvende kalır)", res => {
            if (res) {
                this._deletingProjectIds.add(projectId);

                const prevProjects = Array.isArray(AppState.projects) ? [...AppState.projects] : [];
                const prevTasks = Array.isArray(AppState.tasks) ? [...AppState.tasks] : [];
                const taskIds = prevTasks.filter(t => t.projectId === projectId).map(t => t.id);

                // Optimistic UI: proje ve bagli gorevleri ekrandan hemen dusur.
                AppState.projects = prevProjects.filter((p) => p.id !== projectId);
                AppState.tasks = prevTasks.filter((t) => t.projectId !== projectId);

                const toggle = document.getElementById('targetToggle');
                if (toggle && toggle.checked) this.renderPastProjects(false);
                else this.renderActiveProjects();

                const deletePromises = taskIds.map((tId) =>
                    DataService.apiRequest(`/tasks/${tId}`, { method: 'DELETE' }).catch((err) => {
                        if (err?.status !== 404) throw err;
                        return null;
                    })
                );
                deletePromises.push(
                    DataService.apiRequest(`/projects/${projectId}`, { method: 'DELETE' }).catch((err) => {
                        if (err?.status !== 404) throw err;
                        return null;
                    })
                );

                Promise.all(deletePromises).then(() => {
                    addSystemLog(`PROJE SİLİNDİ: ID ${projectId} ve bağlı görevleri.`);
                    showToast("Proje ve bağlı görevler silindi.", "success");
                }).catch((err) => {
                    console.error('Project delete failed:', err);
                    AppState.projects = prevProjects;
                    AppState.tasks = prevTasks;
                    const toggle = document.getElementById('targetToggle');
                    if (toggle && toggle.checked) this.renderPastProjects(false);
                    else this.renderActiveProjects();
                    showToast(err?.message || "Proje silinemedi.", "error");
                }).finally(() => {
                    this._deletingProjectIds.delete(projectId);
                });
            }
        });
    },

    toggleTargetMode() {
        const toggle = document.getElementById('targetToggle');
        const isPast = toggle ? toggle.checked : false;
        const activeList = document.getElementById('targetActiveProjectsList');
        const pastList = document.getElementById('targetPastProjectsList');
        if (activeList) activeList.style.display = isPast ? 'none' : 'grid';
        if (pastList) pastList.style.display = isPast ? 'flex' : 'none';
        if (isPast) this.renderPastProjects(false);
        else this.renderActiveProjects();
    },

    // ---- Geçmiş Projeler ----

    renderPastProjects(isFiltered = false) {
        const container = document.getElementById('pastProjectResults'); if (!container) return;
        const canManageProjects = typeof hasPermission === 'function' ? hasPermission('manageProjects') : true;

        const searchInput = document.getElementById('pastProjectSearch');
        const monthFilter = document.getElementById('pastProjectMonth');
        const yearFilter = document.getElementById('pastProjectYear');
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const selMonth = monthFilter ? monthFilter.value : '';
        const selYear = yearFilter ? yearFilter.value : '';

        const clearBtn = document.getElementById('btnClearPastProjFilters');
        if (clearBtn) clearBtn.style.display = 'inline-block';

        let pastProjects = AppState.projects.filter(p => {
            const summary = this._summarizeProject(p);
            if (!summary.isArchived) return false;
            if (query && !(p.name || '').toLowerCase().includes(query)) return false;
            const period = typeof extractProjectPeriod === 'function'
                ? extractProjectPeriod(p)
                : { month: p.month || '', year: p.year || '' };
            if (selMonth && period.month !== selMonth) return false;
            if (selYear && String(period.year) !== String(selYear)) return false;
            return true;
        });
        pastProjects.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        const pagContainer = document.getElementById('pastProjPagination');
        if (!pagContainer) return;
        pagContainer.innerHTML = ''; container.innerHTML = '';

        if (pastProjects.length === 0) {
            container.style.display = "block";
            container.innerHTML = `<div style="text-align:center; padding:30px; color:#888; background:#fff; border-radius:8px; border:1px solid var(--border-light);">Seçili filtrelere uygun arşivlenmiş proje bulunamadı.</div>`;
            return;
        }

        container.style.display = "flex"; container.className = ""; container.style.flexDirection = "column"; container.style.gap = "0";

        const itemsPerPage = 10;
        const totalPages = Math.ceil(pastProjects.length / itemsPerPage);
        const curPage = window.pastProjCurrentPage || 1;
        if (curPage > totalPages) window.pastProjCurrentPage = totalPages || 1;
        const startIndex = ((window.pastProjCurrentPage || 1) - 1) * itemsPerPage;
        const paginatedData = pastProjects.slice(startIndex, startIndex + itemsPerPage);

        let htmlStr = "";
        paginatedData.forEach(p => {
            const summary = this._summarizeProject(p);
            const total = summary.total;
            const dealCount = summary.dealCount;
            const coldCount = summary.coldCount;
            const openCount = summary.openCount;
            const statusBadgeHtml = openCount === 0
                ? `<span class="ppc-status-badge">✓ Tamamlandı</span>`
                : `<span class="ppc-status-badge" style="background:#fef9c3; color:#854d0e;">⟳ Dağıtıldı</span>`;
            htmlStr += `<div class="premium-project-card"><div class="ppc-header"><div><strong style="font-size:15px; color:#0f172a;">${p.name}</strong><div style="font-size:12px; color:#94a3b8; margin-top:2px;">${this._getProjectPeriodText(p)}</div></div>${statusBadgeHtml}</div><div class="ppc-footer"><div class="ppc-metrics"><span class="metric-capsule">Top: <b>${total}</b></span><span class="metric-capsule warning">Açık: <b>${openCount}</b></span><span class="metric-capsule success">Deal: <b>${dealCount}</b></span><span class="metric-capsule danger">Cold: <b>${coldCount}</b></span></div><div class="ppc-actions" style="display:${canManageProjects ? 'flex' : 'none'};"><button class="ghost-action-btn" onclick="openCloneProjectModal('${p.id}')">Klonla</button><button class="ghost-action-btn danger" onclick="deleteProject('${p.id}')">Sil</button></div></div></div>`;
        });
        container.innerHTML = htmlStr;

        renderPagination(pagContainer, pastProjects.length, window.pastProjCurrentPage || 1, itemsPerPage, (i) => {
            window.pastProjCurrentPage = i;
            this.renderPastProjects(true);
        });
    },

    clearPastProjFilters() {
        ['pastProjectSearch', 'pastProjectMonth', 'pastProjectYear'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        window.pastProjCurrentPage = 1;
        const clearBtn = document.getElementById('btnClearPastProjFilters'); if (clearBtn) clearBtn.style.display = 'none';
        this.renderPastProjects();
    },

    // ---- Proje Klonlama ----

    openCloneProjectModal(projectId) {
        if (typeof hasPermission === 'function' && !hasPermission('manageProjects')) {
            showToast('Proje klonlama yetkiniz bulunmuyor.', 'warning');
            return;
        }
        const p = AppState.projects.find(x => x.id === projectId); if (!p) return;
        document.getElementById('cloneSourceProjectId').value = p.id;
        document.getElementById('cloneProjectName').value = p.name + " (Yeni Dönem)";
        const curYear = new Date().getFullYear().toString();
        const yearSelect = document.getElementById('cloneYear');
        if ([...yearSelect.options].some(o => o.value === curYear)) yearSelect.value = curYear;
        document.getElementById('cloneBulkNote').value = "";
        document.getElementById('cloneTargetAudience').value = "all";
        document.getElementById('cloneExcludeActive').checked = true;
        const modal = document.getElementById('cloneProjectModal'); if (modal) modal.style.display = 'flex';
    },

    executeProjectClone() {
        if (typeof hasPermission === 'function' && !hasPermission('manageProjects')) {
            showToast('Proje klonlama yetkiniz bulunmuyor.', 'warning');
            return;
        }
        const btn = document.querySelector('button[onclick="executeProjectClone()"]');
        if (btn) { btn.disabled = true; btn.innerText = "⏳ Klonlanıyor..."; }

        const sourceProjectId = document.getElementById('cloneSourceProjectId').value;
        const newProjectName = esc(document.getElementById('cloneProjectName').value.trim());
        const newYear = document.getElementById('cloneYear').value;
        const newMonth = document.getElementById('cloneMonth').value;
        const audience = document.getElementById('cloneTargetAudience').value;
        const excludeActive = document.getElementById('cloneExcludeActive').checked;
        const bulkNote = esc(document.getElementById('cloneBulkNote').value.trim());

        if (!newProjectName) { if (btn) { btn.disabled = false; btn.innerText = "🚀 Klonla ve Aktif Havuza Gönder"; } return showToast("Lütfen yeni proje adını girin!", "warning"); }

        let oldTasks = AppState.tasks.filter(t => t.projectId === sourceProjectId);
        if (audience === 'deal') oldTasks = oldTasks.filter(t => t.status === 'deal');
        else if (audience === 'cold') oldTasks = oldTasks.filter(t => t.status === 'cold');

        if (oldTasks.length === 0) { if (btn) { btn.disabled = false; btn.innerText = "🚀 Klonla ve Aktif Havuza Gönder"; } return showToast("Seçtiğiniz kritere uygun geçmiş kayıt bulunamadı!", "warning"); }

        let targetBizIds = [...new Set(oldTasks.map(t => t.businessId))];

        if (excludeActive) {
            const taskMap = AppState.getTaskMap();
            targetBizIds = targetBizIds.filter(bId => {
                const bizTasks = taskMap[bId] || [];
                return !bizTasks.some(t => isActiveTask(t.status));
            });
        }

        if (targetBizIds.length === 0) { if (btn) { btn.disabled = false; btn.innerText = "🚀 Klonla ve Aktif Havuza Gönder"; } return showToast("Filtrelere uygun işletme kalmadı (veya hepsi şu an aktif işlemde)!", "warning"); }

        // 1. Yeni proje oluştur
        const pObj = { name: newProjectName, description: [newMonth, newYear].filter(Boolean).join(' ') || undefined };

        DataService.apiRequest('/projects', {
            method: 'POST',
            body: JSON.stringify(pObj)
        }).then(project => {
            this._upsertProjectInState(project, newMonth, newYear);
            const newProjectId = project.id;
            const dateStr = getCurrentDateStr();

            // 2. Her işletme için klonlanmış görev oluştur
            const taskPromises = targetBizIds.map((bId) => {
                const bizObj = AppState.businesses.find(x => x.id === bId) || {};
                const bizTask = (AppState.getTaskMap()[bId] || [])[0];
                const rawSrc2 = bizTask ? (bizTask.sourceType || bizTask.source || 'OLD') : (bizObj.sourceType || bizObj.source || 'OLD');
                const srcEnum2 = ({'Fresh Account':'FRESH','Old Account':'OLD','Old Account Rakip':'OLD_RAKIP','Old Account Query':'QUERY','Query':'QUERY','Lead':'FRESH','Rakip':'RAKIP','Referans':'REFERANS'}[rawSrc2]) || (['QUERY','FRESH','RAKIP','OLD_RAKIP','REFERANS','OLD'].includes(rawSrc2) ? rawSrc2 : 'OLD');
                const actorName = AppState.loggedInUser?.name || 'Sistem';
                const taskPayload = {
                    projectId: newProjectId,
                    accountId: bId,
                    category: 'ISTANBUL_CORE',
                    type: 'PROJECT',
                    priority: 'MEDIUM',
                    accountType: 'KEY',
                    source: srcEnum2,
                    details: bulkNote || 'Önceki arşiv projesinden klonlanarak yeni doneme aktarildi.',
                    mainCategory: bizTask ? (bizTask.mainCategory || 'Belirtilmemiş') : (bizObj.mainCategory || 'Belirtilmemiş'),
                    subCategory: bizTask ? (bizTask.subCategory || 'Belirtilmemiş') : (bizObj.subCategory || 'Belirtilmemiş'),
                    historicalAssignee: 'TARGET_POOL',
                    systemLogText: `<span class="manager-note">[Sistem]</span> ${actorName}, "${newProjectName}" hedef projesi kapsaminda bu kaydi Hedef Havuzuna klonlayarak ekledi.`,
                };
                return DataService.apiRequest('/tasks', {
                    method: 'POST',
                    body: JSON.stringify(taskPayload)
                }).then(() => ({ ok: true })).catch(err => {
                    console.warn('Clone task create failed:', err);
                    return { ok: false };
                });
            });

            return Promise.all(taskPromises);
        }).then(results => {
            const successCount = results.filter((item) => item?.ok).length;
            const failedCount = results.length - successCount;
            if (btn) { btn.disabled = false; btn.innerText = "🚀 Klonla ve Aktif Havuza Gönder"; }
            addSystemLog(`"${newProjectName}" listesi arşivlendi projeden klonlandı. (${successCount} İşletme)`);
            if (failedCount > 0) {
                showToast(`${successCount} işletme klonlandı, ${failedCount} görev eklenemedi.`, "warning");
            } else {
                showToast(`${successCount} adet işletme klonlanarak yeni havuza aktarıldı!`, "success");
            }
            closeModal('cloneProjectModal');
            const toggle = document.getElementById('targetToggle');
            if (toggle) { toggle.checked = false; this.toggleTargetMode(); }
        }).catch(() => {
            if (btn) { btn.disabled = false; btn.innerText = "🚀 Klonla ve Aktif Havuza Gönder"; }
            showToast("Klonlama sırasında bir ağ hatası oluştu!", "error");
        });
    }
};

// window bindings
window.switchTaskCreateTab = ProjectController.switchTaskCreateTab.bind(ProjectController);
window.checkDuplicateBiz = ProjectController.checkDuplicateBiz.bind(ProjectController);
window.searchExistingBizForTask = ProjectController.searchExistingBizForTask.bind(ProjectController);
window.selectExistingBusinessForTask = ProjectController.selectExistingBizForTask.bind(ProjectController);
window.submitExistTaskAssign = ProjectController.submitExistingTaskAssign.bind(ProjectController);
window.submitCreateTask = ProjectController.submitCreateNewTask.bind(ProjectController);
window.toggleTargetFilters = ProjectController.toggleTargetFilters.bind(ProjectController);
window.updateTargetLiveCount = ProjectController.updateTargetLiveCount.bind(ProjectController);
window.generateStrategicList = ProjectController.generateStrategicList.bind(ProjectController);
window.renderTargetProjects = ProjectController.renderActiveProjects.bind(ProjectController);
window.updateProjectPoolCount = ProjectController.updateProjectPoolCount.bind(ProjectController);
window.openProjectDetailsModal = ProjectController.openProjectDetailsModal.bind(ProjectController);
window.removeTaskFromProject = ProjectController.removeTaskFromProject.bind(ProjectController);
window.distributeProjectTasks = ProjectController.distributeProjectTasks.bind(ProjectController);
window.deleteProject = ProjectController.deleteProject.bind(ProjectController);
window.toggleTargetMode = ProjectController.toggleTargetMode.bind(ProjectController);
window.renderPastProjects = ProjectController.renderPastProjects.bind(ProjectController);
window.clearPastProjFilters = ProjectController.clearPastProjFilters.bind(ProjectController);
window.openCloneProjectModal = ProjectController.openCloneProjectModal.bind(ProjectController);
window.executeProjectClone = ProjectController.executeProjectClone.bind(ProjectController);
window.createTargetList = ProjectController.generateStrategicList.bind(ProjectController);
