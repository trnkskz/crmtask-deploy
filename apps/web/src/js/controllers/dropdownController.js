// ============================================================
// controllers/dropdownController.js
// Atanan kişi seçicileri ve proje dropdown'larını yönetir
// ============================================================

const DropdownController = (() => {
    function buildDerivedActiveUsers(baseUsers) {
        const normalizedActive = new Map();
        const isOperationalUserLike = (userLike) => {
            if (!userLike) return false;
            if (String(userLike.status || '') === 'Pasif') return false;
            const rawRole = String(userLike.role || '').trim().toUpperCase();
            return rawRole !== 'TEAM_LEADER'
                && rawRole !== 'TAKIM LIDERI'
                && rawRole !== 'MANAGER'
                && rawRole !== 'YÖNETICI'
                && rawRole !== 'YONETICI'
                && rawRole !== 'YÖNETİCİ';
        };
        const addUser = (userLike) => {
            const name = String(userLike?.name || '').trim();
            if (!name) return;
            if (!isOperationalUserLike(userLike)) return;
            const key = normalizeForComparison(name);
            if (!key) return;
            if (!normalizedActive.has(key)) {
                normalizedActive.set(key, {
                    name,
                    role: userLike?.role || 'Satış Temsilcisi',
                    status: userLike?.status || 'Aktif',
                    team: userLike?.team || '-',
                });
            }
        };

        (baseUsers || []).forEach(addUser);

        AppState.tasks.forEach((task) => {
            const assignee = String(task?.assignee || '').trim();
            if (!assignee || assignee.startsWith('TARGET_POOL_')) return;
            const normalized = normalizeForComparison(assignee);
            if (!normalized || ['unassigned', 'team1', 'team2', 'targetpool'].includes(normalized)) return;
            if (typeof isActiveTask === 'function' && !isActiveTask(task.status)) return;
            const matchedUser = (AppState.users || []).find((user) => normalizeForComparison(user?.name) === normalized);
            if (matchedUser && !isOperationalUserLike(matchedUser)) return;
            addUser({ name: assignee, role: 'Satış Temsilcisi', status: 'Aktif' });
        });

        return Array.from(normalizedActive.values());
    }

    /**
     * Tüm atanan kişi/takım dropdown'larını günceller.
     */
    function updateAssigneeDropdowns() {
        const currentUser = AppState.loggedInUser;
        const isTeamLeader = currentUser.role === 'Takım Lideri';
        const teamPoolValue = isTeamLeader && currentUser.team === 'Team 1'
            ? 'Team 1'
            : (isTeamLeader && currentUser.team === 'Team 2' ? 'Team 2' : 'UNASSIGNED');
        const teamPoolLabel = isTeamLeader && currentUser.team && currentUser.team !== '-'
            ? `-- ${currentUser.team} Havuzuna Ata --`
            : '-- Havuza At (Atanmasın) --';
        const projectTaskMap = typeof AppState.getProjectTaskMap === 'function' ? AppState.getProjectTaskMap() : {};
        
        // Atanabilir kullanıcılar SADECE Satış Temsilcileri olmalıdır (Takım Liderleri ve Yöneticiler hariç)
        let assignableUsers = AppState.users.filter(u =>
            u.role === 'Satış Temsilcisi' && u.status !== 'Pasif'
        );
        assignableUsers = buildDerivedActiveUsers(assignableUsers);

        // Eğer giriş yapan kişi Takım Lideri ise sadece SADECE KENDİ TAKIMI görünür
        if (isTeamLeader && currentUser.team && currentUser.team !== '-') {
            assignableUsers = assignableUsers.filter(u => u.team === currentUser.team);
        }

        const activeProjects = AppState.projects.filter(p => {
            const pTasks = projectTaskMap?.[p.id] || [];
            if (pTasks.length === 0) return true;
            return pTasks.some(t => t.assignee === 'TARGET_POOL' || (typeof isVisibleTaskListProjectTask === 'function' ? isVisibleTaskListProjectTask(t) : ['new', 'hot', 'nothot', 'followup'].includes(t.status)));
        });

        // Standart dropdown'lar — sadece personel listesi
        const standardIds = ['assigneeDropdown', 'newBizAssignee', 'existAssigneeSelect'];
        standardIds.forEach(id => _populateAssignee(id, assignableUsers, activeProjects, {
            defaultOption: `<option value="${teamPoolValue}">${teamPoolLabel}</option>`,
            includeTeams: false,
            includeProjects: true,
        }));

        // Ekip Task Takip dropdown'ı — takım var, proje YOK, ARŞİV (Eski Personel) VAR
        _populateAssignee('filterAllTasksAssignee', assignableUsers, [], {
            defaultOption: '<option value="">Tümü</option>',
            includeTeams: true,
            includeProjects: false,
            includeArchived: false
        });

        // Diğer Filtre dropdown'ları (Raporlar, Arşiv, İşletmeler) — takım var, ARŞİV VAR
        const filterIds = ['repFilterAssignee', 'passiveFilterAssignee', 'filterBizAssignee'];
        filterIds.forEach(id => _populateAssignee(id, assignableUsers, [], {
            defaultOption: '<option value="">Tümü</option>',
            includeTeams: true,
            includeProjects: false,
            includeArchived: true
        }));

        // CSV import
        const csvSel = document.getElementById('csvAssigneeSelect');
        if (csvSel) {
            csvSel.innerHTML = `<option value="${teamPoolValue}">${isTeamLeader ? `${currentUser.team} Havuzuna Ata` : 'Genel Havuza At (Atanmasın)'}</option>`;
            assignableUsers.forEach(u => csvSel.add(new Option(u.name, u.name)));
        }

        // Görev devir seçici
        const trSel = document.getElementById('transferAssigneeSelect');
        if (trSel) {
            trSel.innerHTML = '<option value="UNASSIGNED">Genel Havuza At</option>';
            assignableUsers.forEach(u => trSel.add(new Option(u.name, u.name)));
        }
    }

    function _populateAssignee(elId, users, projects, opts) {
        const el = document.getElementById(elId);
        if (!el) return;
        el.innerHTML = opts.defaultOption;

        if (opts.includeTeams) {
            const currentUser = AppState.loggedInUser;
            const isTeamLeader = currentUser && currentUser.role === 'Takım Lideri';
            
            const grpT = document.createElement('optgroup');
            grpT.label = 'Takımlar';
            
            if (isTeamLeader && currentUser.team && currentUser.team !== '-') {
                // Takım Lideriyse sadece kendi takımı sekmesi
                grpT.appendChild(new Option(`${currentUser.team} (Tümü)`, currentUser.team));
            } else {
                // Yöneticiyse tüm takımlar
                grpT.appendChild(new Option('Team 1 (Tümü)', 'Team 1'));
                grpT.appendChild(new Option('Team 2 (Tümü)', 'Team 2'));
            }
            
            el.appendChild(grpT);
        }

        const grpU = document.createElement('optgroup');
        grpU.label = 'Personeller';
        users.forEach(u => grpU.appendChild(new Option(u.name, u.name)));
        el.appendChild(grpU);

        if (opts.includeArchived) {
            const activeUserNamesNorm = new Set(users.map(u => normalizeForComparison(u.name)));
            const excludeSetNorm = new Set(['unassigned', 'team1', 'team2', 'targetpool']);
            
            const archivedUsersMap = new Map();
            AppState.tasks.forEach(t => {
                let name = t.assignee ? t.assignee.trim() : '';
                if (!name || name.startsWith('TARGET_POOL_')) return;
                
                const normName = normalizeForComparison(name);
                
                if (normName && !activeUserNamesNorm.has(normName) && !excludeSetNorm.has(normName)) {
                    if (!archivedUsersMap.has(normName)) {
                        const displayName = name.toLocaleLowerCase('tr-TR').replace(/(?:^|\s)\S/g, a => a.toLocaleUpperCase('tr-TR'));
                        archivedUsersMap.set(normName, displayName);
                    }
                }
            });

            if (archivedUsersMap.size > 0) {
                const grpArchived = document.createElement('optgroup');
                grpArchived.label = 'Arşiv / Eski Personeller';
                const uniqueDisplayNames = Array.from(new Set(archivedUsersMap.values())).sort();
                uniqueDisplayNames.forEach(name => grpArchived.appendChild(new Option(name, name)));
                el.appendChild(grpArchived);
            }
        }

        if (opts.includeProjects && projects.length > 0) {
            const optGroup = document.createElement('optgroup');
            optGroup.label = '🎯 Hedef Proje Listesine Ekle';
            projects.forEach(p => optGroup.appendChild(
                new Option(`Proje: ${p.name}`, `TARGET_POOL_${p.id}`)
            ));
            el.appendChild(optGroup);
        }
    }

    /**
     * Proje seçici dropdown'larını günceller.
     */
    function populateProjectDropdowns() {
        const elAll = document.getElementById('filterAllTasksProject');
        const projectTaskMap = typeof AppState.getProjectTaskMap === 'function' ? AppState.getProjectTaskMap() : {};
        if (elAll) {
            elAll.innerHTML = '<option value="">Tüm Projeler</option>';
            const visibleProjectsForFilter = AppState.projects.filter((p) =>
                (projectTaskMap?.[p.id] || []).some((t) =>
                    (typeof isVisibleTaskListProjectTask === 'function'
                        ? isVisibleTaskListProjectTask(t)
                        : ['new', 'hot', 'nothot', 'followup'].includes(t.status))
                )
            );
            visibleProjectsForFilter.forEach(p => elAll.add(new Option(p.name, p.id)));
        }

        ['repFilterProject', 'passiveFilterProject'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.innerHTML = '<option value="">Tüm Projeler</option>';
            AppState.projects.forEach(p => el.add(new Option(p.name, p.id)));
        });
    }

    /**
     * Kategori → alt kategori bağımlı dropdown güncellemesi.
     */
    function updateSubCategories(mainCatElId, subCatElId) {
        const mainEl = document.getElementById(mainCatElId);
        const subEl = document.getElementById(subCatElId);
        if (!mainEl || !subEl) return;

        const selectedMain = mainEl.value;
        const subs = AppState.dynamicCategories[selectedMain] || [];
        subEl.innerHTML = '<option value="">Alt Kategori Seç</option>';
        subs.forEach(s => subEl.add(new Option(s, s)));
    }

    /**
     * Filtre için tüm alt kategorileri gösterir (işletme filtresi).
     */
    function populateAllSubCategoriesForFilter() {
        const el = document.getElementById('filterBizSubCategory');
        if (!el) return;
        el.innerHTML = '<option value="">Tümü</option>';
        const allSubs = new Set();
        Object.values(AppState.dynamicCategories).flat().forEach(s => allSubs.add(s));
        [...allSubs].sort().forEach(s => el.add(new Option(s, s)));
    }

    /**
     * İşletme filtresinde ana kategori seçildiğinde alt kategorileri günceller.
     */
    function updateBizFilterSubCategories() {
        const mainCat = (document.getElementById('filterBizCategory') || {}).value || '';
        const el = document.getElementById('filterBizSubCategory');
        if (!el) return;
        if (!mainCat) {
            populateAllSubCategoriesForFilter();
        } else {
            el.innerHTML = '<option value="">Tümü</option>';
            const subs = AppState.dynamicCategories[mainCat] || [];
            [...subs].sort().forEach(s => el.add(new Option(s, s)));
        }
    }

    /**
     * Rapor filtresinde ana kategori değiştiğinde alt kategorileri günceller.
     */
    function updateRepFilterSubCategories() {
        const mainCat = (document.getElementById('repFilterCategory') || {}).value || '';
        const el = document.getElementById('repFilterSubCategory');
        if (!el) return;
        el.innerHTML = '<option value="">Tümü</option>';
        const cats = AppState.dynamicCategories;
        if (mainCat && cats[mainCat]) {
            cats[mainCat].forEach(s => el.add(new Option(s, s)));
        } else {
            const allSubs = new Set();
            Object.values(cats).flat().forEach(s => allSubs.add(s));
            [...allSubs].sort().forEach(s => el.add(new Option(s, s)));
        }
    }

    /**
     * Arşiv (pasif görevler) filtresinde alt kategorileri günceller.
     */
    function updateArcFilterSubCategories() {
        const mainCat = (document.getElementById('passiveFilterCategory') || {}).value || '';
        const el = document.getElementById('passiveFilterSubCategory');
        if (!el) return;
        el.innerHTML = '<option value="">Tümü</option>';
        const subs = AppState.dynamicCategories[mainCat] || [];
        subs.forEach(s => el.add(new Option(s, s)));
    }

    /**
     * Yeni işletme formunda ana kategori seçildiğinde alt kategorileri günceller.
     */
    function updateCreateTaskSubCategories() {
        const mainCat = (document.getElementById('mainCategory') || {}).value || '';
        const el = document.getElementById('subCategory');
        if (!el) return;
        el.innerHTML = '';
        const subs = AppState.dynamicCategories[mainCat] || [];
        subs.forEach(s => el.add(new Option(s, s)));
    }

    /**
     * Görev atama modalındaki ana kategori seçildiğinde alt kategorileri günceller.
     */
    function updateAssignSubCategories() {
        const mainCat = (document.getElementById('assignMainCat') || {}).value || '';
        const el = document.getElementById('assignSubCat');
        if (!el) return;
        el.innerHTML = '';
        const subs = AppState.dynamicCategories[mainCat] || [];
        subs.forEach(s => el.add(new Option(s, s)));
    }

    function populateTargetDateFilters() {
        const taskMap = AppState.getTaskMap();
        const years = new Set();
        const months = new Set();
        
        Object.values(taskMap).forEach(tasks => {
            tasks.forEach(t => {
                const createdAt = t.createdAt;
                if(createdAt) {
                    const dateObj = new Date(createdAt);
                    if(!isNaN(dateObj.getTime())) {
                        years.add(dateObj.getFullYear().toString());
                        const trMonths = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
                        months.add(trMonths[dateObj.getMonth()]);
                    }
                }
            });
        });

        if(years.size === 0) years.add(new Date().getFullYear().toString());

        const targetYear = document.getElementById('targetYear');
        if (targetYear) {
            const currentVals = Array.from(targetYear.selectedOptions).map(o => o.value);
            targetYear.innerHTML = '';
            Array.from(years).sort().reverse().forEach(y => targetYear.add(new Option(y, y)));
            currentVals.forEach(v => {
                const opt = Array.from(targetYear.options).find(o => o.value === v);
                if(opt) opt.selected = true;
            });
            _syncCustomSelect('targetYear');
        }

        const targetMonth = document.getElementById('targetMonth');
        if (targetMonth) {
            const currentVals = Array.from(targetMonth.selectedOptions).map(o => o.value);
            targetMonth.innerHTML = '';
            const allMonths = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
            allMonths.forEach(m => {
                if(months.has(m)) targetMonth.add(new Option(m, m));
            });
            if(targetMonth.options.length === 0) {
                allMonths.forEach(m => targetMonth.add(new Option(m, m)));
            }
            currentVals.forEach(v => {
                const opt = Array.from(targetMonth.options).find(o => o.value === v);
                if(opt) opt.selected = true;
            });
            _syncCustomSelect('targetMonth');
        }
    }

    /**
     * Hedef listesi oluşturma formundaki alt kategorileri günceller.
     */
    function updateTargetSubCategories() {
        const targetMainCatSelect = document.getElementById('targetMainCat');
        if (!targetMainCatSelect) return;
        const mainCats = Array.from(targetMainCatSelect.selectedOptions).map(opt => opt.value).filter(val => val);
        const el = document.getElementById('targetSubCat');
        if (!el) return;
        const currentVals = Array.from(el.selectedOptions).map(o => o.value);
        el.innerHTML = '';
        
        const allSubs = new Set();
        if(mainCats.length === 0) {
            Object.values(AppState.dynamicCategories).flat().forEach(s => allSubs.add(s));
        } else {
            mainCats.forEach(mc => {
                const subs = AppState.dynamicCategories[mc] || [];
                subs.forEach(s => allSubs.add(s));
            });
        }
        
        Array.from(allSubs).sort().forEach(s => el.add(new Option(s, s)));
        currentVals.forEach(v => {
            const opt = Array.from(el.options).find(o => o.value === v);
            if(opt) opt.selected = true;
        });
        
        _syncCustomSelect('targetSubCat');
        // Hedef liste canlı sayısını güncelle
        if (window.updateTargetLiveCount) window.updateTargetLiveCount();
    }

    /**
     * Var olan işletmeye görev ata formundaki alt kategorileri günceller.
     */
    function updateExistAssignSubCat() {
        const mainCat = (document.getElementById('existAssignMainCat') || {}).value || '';
        const el = document.getElementById('existAssignSubCat');
        if (!el) return;
        el.innerHTML = '';
        const subs = AppState.dynamicCategories[mainCat] || [];
        subs.forEach(s => el.add(new Option(s, s)));
    }

    /**
     * İl değiştiğinde ilçe dropdown'ını günceller.
     */
    function updateDistricts() {
        const city = (document.getElementById('city') || {}).value || '';
        const el = document.getElementById('district');
        if (!el) return;
        el.innerHTML = '<option value="">Seçilmedi</option>';
        if (!city) return;
        const dists = DISTRICT_DATA[city] || ['Merkez', 'Diğer'];
        dists.forEach(d => el.add(new Option(d, d)));
    }

    function populateDistrictFilterDropdown(selectId, city = '', keepValue = '') {
        const el = document.getElementById(selectId);
        if (!el) return;
        const currentVal = keepValue || el.value;
        const districtList = city
            ? (DISTRICT_DATA[city] || [])
            : Array.from(new Set(Object.values(DISTRICT_DATA).flat())).sort((a, b) => String(a || '').localeCompare(String(b || ''), 'tr'));
        el.innerHTML = '<option value="">Tümü</option>';
        districtList.forEach((district) => el.add(new Option(district, district)));
        if (currentVal && districtList.includes(currentVal)) {
            el.value = currentVal;
        }
    }

    function updateBizDistrictFilterOptions() {
        const city = document.getElementById('filterBizCity')?.value || '';
        populateDistrictFilterDropdown('filterBizDistrict', city);
    }

    function updateArchiveDistrictFilterOptions() {
        populateDistrictFilterDropdown('passiveFilterDistrict');
    }

    function updateReportDistrictFilterOptions() {
        const city = document.getElementById('repFilterCity')?.value || '';
        populateDistrictFilterDropdown('repFilterDistrict', city);
    }

    /**
     * Şehir filtre dropdown'larını günceller.
     */
    function populateCityDropdowns() {
        const cityFilter = document.getElementById('filterBizCity');
        const archiveDistrictFilter = document.getElementById('passiveFilterDistrict');
        const targetCity = document.getElementById('targetCity');
        const targetDistrict = document.getElementById('targetDistrict');
        
        if (cityFilter) {
            const currentVal = cityFilter.value;
            cityFilter.innerHTML = '<option value="">Tümü</option>';
            cities.forEach(c => cityFilter.add(new Option(c, c)));
            if (currentVal) cityFilter.value = currentVal;
            updateBizDistrictFilterOptions();
        }

        if (archiveDistrictFilter) {
            updateArchiveDistrictFilterOptions();
        }

        const reportCity = document.getElementById('repFilterCity');
        if (reportCity) {
            const currentVal = reportCity.value;
            reportCity.innerHTML = '<option value="">Tümü</option>';
            cities.forEach(c => reportCity.add(new Option(c, c)));
            if (currentVal) reportCity.value = currentVal;
            updateReportDistrictFilterOptions();
        }
        
        if (targetCity) {
            const currentVals = Array.from(targetCity.selectedOptions).map(o => o.value);
            targetCity.innerHTML = '';
            cities.forEach(c => targetCity.add(new Option(c, c)));
            currentVals.forEach(v => {
                const opt = Array.from(targetCity.options).find(o => o.value === v);
                if(opt) opt.selected = true;
            });
            _syncCustomSelect('targetCity');
        }
        
        if (targetDistrict) {
            const currentVals = Array.from(targetDistrict.selectedOptions).map(o => o.value);
            targetDistrict.innerHTML = '';
            const allDistricts = new Set();
            Object.values(DISTRICT_DATA).flat().forEach(d => allDistricts.add(d));
            Array.from(allDistricts).sort().forEach(d => targetDistrict.add(new Option(d, d)));
            currentVals.forEach(v => {
                const opt = Array.from(targetDistrict.options).find(o => o.value === v);
                if(opt) opt.selected = true;
            });
            _syncCustomSelect('targetDistrict');
        }
    }

    /**
     * Tüm Ana Kategori dropdown'larını günceller.
     */
    function populateMainCategoryDropdowns() {
        const categories = Object.keys(AppState.dynamicCategories);

        // 1. Filtre amaçlı dropdown'lar (En üstte "Tümü" seçeneği barındırır)
        const filterIds = ['filterBizCategory', 'repFilterCategory', 'passiveFilterCategory', 'targetMainCat'];
        filterIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const currentVal = el.value;
                el.innerHTML = '<option value="">Tümü</option>';
                categories.forEach(c => el.add(new Option(c, c)));
                if (categories.includes(currentVal)) el.value = currentVal;
            }
        });

        // 2. Form amaçlı dropdown'lar (Doğrudan kategori isimleriyle başlar)
        const formIds = ['mainCategory', 'existAssignMainCat'];
        formIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const currentVal = el.value;
                el.innerHTML = '';
                categories.forEach(c => el.add(new Option(c, c)));
                if (categories.includes(currentVal)) {
                    el.value = currentVal;
                } else if (categories.length > 0) {
                    el.value = categories[0];
                }
            }
        });
        
        // Hedef Kitle Custom Select'ler için Özel Güncelleme (Ana Kategori)
        const targetMainCat = document.getElementById('targetMainCat');
        if (targetMainCat) {
            const currentVals = Array.from(targetMainCat.selectedOptions).map(o => o.value);
            targetMainCat.innerHTML = '';
            categories.forEach(c => targetMainCat.add(new Option(c, c)));
            currentVals.forEach(v => {
                const opt = Array.from(targetMainCat.options).find(o => o.value === v);
                if(opt) opt.selected = true;
            });
            _syncCustomSelect('targetMainCat');
        }
        
        // Alt kategorileri de mevcut duruma göre senkronize et
        updateBizFilterSubCategories();
        updateRepFilterSubCategories();
        updateArcFilterSubCategories();
        populateTargetDateFilters();
        updateTargetSubCategories();
        if(window.updateCreateTaskSubCategories) window.updateCreateTaskSubCategories();
        updateExistAssignSubCat();
    }

    /**
     * DOM'daki gizli select'in option'larına bakarak özel menüyü baştan çizer
     */
    function _syncCustomSelect(selectId) {
        const wrapId = 'wrap_' + selectId;
        const optsContainer = document.getElementById('opts_' + selectId);
        const realSelect = document.getElementById(selectId);
        if (!optsContainer || !realSelect) return;
        
        optsContainer.innerHTML = '';
        Array.from(realSelect.options).forEach((opt, idx) => {
            const div = document.createElement('div');
            div.className = 'option-item';
            
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = opt.value;
            cb.id = `cb_${selectId}_${idx}`;
            cb.checked = opt.selected;
            cb.onchange = function() { 
                if(window.updateCustomSelect) window.updateCustomSelect(wrapId, this); 
                if(selectId === 'targetMainCat') updateTargetSubCategories();
                else if (window.updateTargetLiveCount) window.updateTargetLiveCount();
            };
            
            const lbl = document.createElement('label');
            lbl.setAttribute('for', cb.id);
            lbl.innerText = opt.text;
            
            div.appendChild(cb);
            div.appendChild(lbl);
            optsContainer.appendChild(div);
        });
        
        // Tümü Seçili Checkbox'ını güncelle
        const wrap = document.getElementById(wrapId);
        if(wrap) {
            const allChecked = Array.from(realSelect.options).every(opt => opt.selected);
            const allCb = wrap.querySelector(`[id^="all_"]`);
            if (allCb && realSelect.options.length > 0) allCb.checked = allChecked;
            
            // Texti güncelle
            if (window._updateCustomSelectText) window._updateCustomSelectText(wrapId);
        }
    }

    return {
        populateTargetDateFilters,
        updateAssigneeDropdowns,
        populateProjectDropdowns,
        populateMainCategoryDropdowns,
        updateCreateTaskSubCategories,
        populateAllSubCategoriesForFilter,
        updateBizFilterSubCategories,
        updateRepFilterSubCategories,
        updateArcFilterSubCategories,
        updateAssignSubCategories,
        updateTargetSubCategories,
        updateExistAssignSubCat,
        updateDistricts,
        updateBizDistrictFilterOptions,
        updateArchiveDistrictFilterOptions,
        updateReportDistrictFilterOptions,
        populateCityDropdowns,
    };
})();

// Global erişim
window.updateAssigneeDropdowns = DropdownController.updateAssigneeDropdowns.bind(DropdownController);
window.populateProjectDropdowns = DropdownController.populateProjectDropdowns.bind(DropdownController);
window.updateCreateTaskSubCategories = DropdownController.updateCreateTaskSubCategories.bind(DropdownController);
window.updateSubCategories       = DropdownController.updateCreateTaskSubCategories.bind(DropdownController);
window.updateBizFilterSubCategories  = DropdownController.updateBizFilterSubCategories.bind(DropdownController);
window.updateRepFilterSubCategories  = DropdownController.updateRepFilterSubCategories.bind(DropdownController);
window.updateArcFilterSubCategories  = DropdownController.updateArcFilterSubCategories.bind(DropdownController);
window.updateAssignSubCategories     = DropdownController.updateAssignSubCategories.bind(DropdownController);
window.populateTargetDateFilters     = DropdownController.populateTargetDateFilters.bind(DropdownController);
window.updateTargetSubCategories     = DropdownController.updateTargetSubCategories.bind(DropdownController);
window.updateExistAssignSubCat       = DropdownController.updateExistAssignSubCat.bind(DropdownController);
window.updateDistricts               = DropdownController.updateDistricts.bind(DropdownController);
window.updateBizDistrictFilterOptions = DropdownController.updateBizDistrictFilterOptions.bind(DropdownController);
window.updateArchiveDistrictFilterOptions = DropdownController.updateArchiveDistrictFilterOptions.bind(DropdownController);
window.updateReportDistrictFilterOptions = DropdownController.updateReportDistrictFilterOptions.bind(DropdownController);
window.populateMainCategoryDropdowns = DropdownController.populateMainCategoryDropdowns.bind(DropdownController);
window.populateCityDropdowns = DropdownController.populateCityDropdowns.bind(DropdownController);
