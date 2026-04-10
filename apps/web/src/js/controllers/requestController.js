const RequestController = (() => {
    const WORKSPACE_STORAGE_KEY = 'request_workspace_state_v1';
    let workspaceState = loadWorkspaceState();

    function mapUiSourceToApi(value) {
        const raw = String(value || '').trim().toLowerCase();
        if (raw.includes('old account rakip')) return 'OLD_RAKIP';
        if (raw.includes('old account query') || raw === 'query') return 'QUERY';
        if (raw.includes('rakip')) return 'RAKIP';
        if (raw.includes('referans')) return 'REFERANS';
        if (raw.includes('old account')) return 'OLD';
        if (raw.includes('lead')) return 'FRESH';
        return 'FRESH';
    }

    function mapUiTaskCategoryToApi(value) {
        const raw = String(value || '').trim().toLowerCase();
        if (raw.includes('anadolu')) return 'ANADOLU_CORE';
        if (raw.includes('travel') || raw.includes('seyahat')) return 'TRAVEL';
        return 'ISTANBUL_CORE';
    }

    function loadWorkspaceState() {
        try {
            const parsed = JSON.parse(sessionStorage.getItem(WORKSPACE_STORAGE_KEY) || '{}');
            return {
                mode: parsed.mode || 'search',
                lastSearchLabel: parsed.lastSearchLabel || 'Henüz seçim yapılmadı',
                lastHint: parsed.lastHint || 'Henüz işlem yapılmadı.',
                recentSearches: Array.isArray(parsed.recentSearches) ? parsed.recentSearches.slice(0, 4) : [],
            };
        } catch {
            return {
                mode: 'search',
                lastSearchLabel: 'Henüz seçim yapılmadı',
                lastHint: 'Henüz işlem yapılmadı.',
                recentSearches: [],
            };
        }
    }

    function persistWorkspaceState() {
        try {
            sessionStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspaceState));
        } catch {}
    }

    function isTodayDate(rawDate) {
        const d = new Date(rawDate || 0);
        if (Number.isNaN(d.getTime())) return false;
        const today = new Date();
        return d.getFullYear() === today.getFullYear()
            && d.getMonth() === today.getMonth()
            && d.getDate() === today.getDate();
    }

    function buildRecentSearchesHtml() {
        if (!workspaceState.recentSearches.length) return 'Henüz arama geçmişi yok.';
        return workspaceState.recentSearches
            .map((item) => `<button type="button" class="req-recent-chip" onclick="RequestController.useRecentSearch('${String(item || '').replace(/'/g, "\\'")}')">${item}</button>`)
            .join('');
    }

    function renderWorkspaceRail() {
        const subtitleEl = document.getElementById('reqHeroSubtitle');
        if (subtitleEl) {
            subtitleEl.innerText = workspaceState.mode === 'search'
                ? 'Arama yapın, benzer kayıtları görün ve tek ekranda doğru akışı başlatın.'
                : 'Sağ panelde aynı veri giriş mantığıyla işlemi tamamlayın.';
        }
    }

    function updateWorkspaceState(patch = {}) {
        workspaceState = { ...workspaceState, ...patch };
        persistWorkspaceState();
        renderWorkspaceRail();
    }

    function pushRecentSearch(label) {
        const value = String(label || '').trim();
        if (!value) return;
        const deduped = [value, ...workspaceState.recentSearches.filter((item) => item !== value)].slice(0, 4);
        updateWorkspaceState({ recentSearches: deduped, lastSearchLabel: value });
    }

    function shrinkHero() {
        const page = document.getElementById('page-rep-request');
        const hero = document.getElementById('reqDashboardHero');
        const searchArea = document.getElementById('reqHeroSearchArea');
        const title = document.getElementById('reqHeroTitle');
        const shrinkText = document.getElementById('reqHeroShrinkText');
        if(page && hero && searchArea && title && shrinkText) {
            page.classList.remove('compact', 'split-active');
            hero.classList.remove('req-hero-shrinked');
            hero.style.display = 'none';
            hero.style.maxWidth = '100%';
            hero.style.padding = '25px 30px';
            hero.style.cursor = 'default';
            hero.title = '';
            searchArea.style.opacity = '1';
            searchArea.style.visibility = 'visible';
            searchArea.style.width = 'auto';
            searchArea.style.flex = '1';
            searchArea.style.pointerEvents = 'auto';
            title.style.fontSize = '22px';
            shrinkText.style.display = 'none';
        }
        renderWorkspaceRail();
    }

    function expandHero() {
        const page = document.getElementById('page-rep-request');
        const hero = document.getElementById('reqDashboardHero');
        const searchArea = document.getElementById('reqHeroSearchArea');
        const title = document.getElementById('reqHeroTitle');
        const shrinkText = document.getElementById('reqHeroShrinkText');
        if(page && hero && searchArea && title && shrinkText) {
            page.classList.remove('compact', 'split-active');
            hero.classList.remove('req-hero-shrinked');
            hero.style.display = 'flex';
            hero.style.maxWidth = '100%';
            hero.style.padding = '25px 30px';
            hero.style.cursor = 'default';
            hero.title = '';
            searchArea.style.opacity = '1';
            searchArea.style.visibility = 'visible';
            searchArea.style.width = 'auto';
            searchArea.style.flex = '1';
            searchArea.style.pointerEvents = 'auto';
            title.style.fontSize = '22px';
            shrinkText.style.display = 'none';
        }
        const split = document.getElementById('reqExistingBizSplit');
        if (split) split.classList.remove('split-active');
        updateWorkspaceState({ mode: 'search' });
    }

    function initWizard() {
        expandHero();
        document.getElementById('reqStep1Name').style.display = 'block';
        document.getElementById('reqExistingBizSplit').style.display = 'none';
        document.getElementById('reqStep2Phone').style.display = 'none';
        document.getElementById('reqStep3Form').style.display = 'none';
        
        document.getElementById('reqSearchName').value = '';
        document.getElementById('reqSearchPhone').value = '';
        document.getElementById('reqNameResults').innerHTML = '';
        document.getElementById('reqPhoneResults').innerHTML = '';
        
        document.getElementById('reqNewBizForm').reset();
        
        populateReqDropdowns();
        renderWorkspaceRail();
    }

    function populateReqDropdowns() {
        const cityEl = document.getElementById('reqCity');
        if(cityEl && cityEl.options.length === 0) {
            cityEl.add(new Option('Seçilmedi', ''));
            cities.forEach(c => cityEl.add(new Option(c,c)));
            cityEl.value = '';
            updateReqDistricts();
        }
        
        const mainCatEl = document.getElementById('reqMainCat');
        if(mainCatEl && mainCatEl.options.length === 0) {
            Object.keys(AppState.dynamicCategories).forEach(cat => mainCatEl.add(new Option(cat, cat)));
            updateReqSubCats();
        }

        const existMainCatEl = document.getElementById('reqExistMainCat');
        if(existMainCatEl && existMainCatEl.options.length === 0) {
            Object.keys(AppState.dynamicCategories).forEach(cat => existMainCatEl.add(new Option(cat, cat)));
            updateReqExistSubCats();
        }
    }

    function updateReqDistricts() {
        const city = document.getElementById('reqCity').value || '';
        const el = document.getElementById('reqDistrict');
        if(!el) return;
        el.innerHTML = '<option value="">Seçilmedi</option>';
        if (!city) return;
        const dists = districtData[city] || ['Merkez', 'Diğer'];
        dists.forEach(d => el.add(new Option(d, d)));
    }

    function updateReqSubCats() {
        const mainCat = document.getElementById('reqMainCat').value || '';
        const el = document.getElementById('reqSubCat');
        if(!el) return;
        el.innerHTML = '';
        const subs = AppState.dynamicCategories[mainCat] || [];
        subs.forEach(s => el.add(new Option(s, s)));
    }

    function updateReqExistSubCats() {
        const mainCat = document.getElementById('reqExistMainCat').value || '';
        const el = document.getElementById('reqExistSubCat');
        if(!el) return;
        el.innerHTML = '';
        const subs = AppState.dynamicCategories[mainCat] || [];
        subs.forEach(s => el.add(new Option(s, s)));
    }

    function searchName() {
        const val = document.getElementById('reqSearchName').value.trim();
        const resEl = document.getElementById('reqNameResults');
        if (val.length < 3) {
            resEl.innerHTML = '';
            updateWorkspaceState({ mode: 'search', lastHint: 'En az 3 karakterle arama başlatabilirsiniz.' });
            return;
        }

        updateWorkspaceState({
            mode: 'search',
            lastSearchLabel: val,
            lastHint: `"${val}" için benzer kayıtlar taranıyor.`,
        });
        pushRecentSearch(val);

        const matches = AppState.businesses.filter((b) => (
            typeof businessMatchesSearch === 'function'
                ? businessMatchesSearch(b, val)
                : normalizeText(b.companyName).includes(normalizeText(val))
        ));

        if (matches.length > 0) {
            let html = `<div style="margin-bottom:10px; font-size:13px; color:var(--secondary-color);">Sistemde benzer <b>${matches.length}</b> kayıt bulundu:</div><div style="display:flex; flex-direction:column; gap:10px;">`;
            
            matches.slice(0, 10).forEach(m => {
                const bizTasks = AppState.getTaskMap()[m.id] || [];
                bizTasks.sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0));
                const latestTask = bizTasks[0];

                let isBlocked = false;
                let blockReason = "";
                let btnHtml = "";

                if (latestTask) {
                    const isAssignedToSomeone = latestTask.assignee !== 'UNASSIGNED' && !latestTask.assignee.startsWith('TARGET_POOL');
                    const isActive = isActiveTask(latestTask.status);
                    
                    if (isActive && isAssignedToSomeone) {
                        isBlocked = true;
                        blockReason = `❌ ${latestTask.assignee} Üzerinde Aktif`;
                    }
                }

                if (isBlocked) {
                    btnHtml = `<span style="font-size:11px; font-weight:bold; color:var(--danger-color); background:#fef2f2; padding:6px 12px; border-radius:6px; border:1px solid #fca5a5; white-space:nowrap;">${blockReason}</span>`;
                } else if (latestTask && latestTask.status === 'deal') {
                    btnHtml = `<div style="display:flex; flex-direction:column; gap:5px; align-items:flex-end;">
                                 <span style="font-size:10px; color:#d97706; font-weight:bold;">⚠️ Aktif kampanya olabilir kontrol et</span>
                                 <button type="button" class="btn-action" style="background:var(--success-color); color:#fff; white-space:nowrap;" onclick="RequestController.openExistingBizForm('${m.id}')">✅ Görev Yarat</button>
                               </div>`;
                } else {
                    btnHtml = `<button type="button" class="btn-action" style="background:var(--success-color); color:#fff; white-space:nowrap;" onclick="RequestController.openExistingBizForm('${m.id}')">✅ Görev Yarat</button>`;
                }

                html += `<div style="background:#fff; border:1px solid var(--border-light); padding:12px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <div style="flex:1; min-width:150px;">
                        <strong style="color:var(--secondary-color); font-size:14px; display:block;">${m.companyName}</strong>
                        <span style="font-size:11px; color:#888;">📍 ${m.city || '-'} | Son Durum: ${latestTask ? (TASK_STATUS_LABELS[latestTask.status] || latestTask.status) : 'Boşta'}</span>
                    </div>
                    <div style="flex-shrink:0;">${btnHtml}</div>
                </div>`;
            });
            
            html += `</div><div style="margin-top:20px; text-align:center;"><button type="button" class="btn-ghost" onclick="RequestController.showFormStep()">Aradığım İşletme Bu Listede Yok ➔</button></div>`;
            resEl.innerHTML = html;
            updateWorkspaceState({ lastHint: `${matches.length} benzer kayıt bulundu. Uygun işletmeyi seçebilir veya yeni kayıt açabilirsiniz.` });
        } else {
            resEl.innerHTML = `<div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:15px; border-radius:8px; text-align:center;">
                <span style="font-size:24px; display:block; margin-bottom:10px;">✅</span>
                <strong style="color:var(--success-color); font-size:14px;">İsim temiz görünüyor!</strong>
                <p style="font-size:12px; color:#166534; margin-top:5px;">Bu işletme sistemde bulunamadı. Yeni kayıt formunu doldurarak göreve başlayabilirsiniz.</p>
                <button type="button" class="btn-action" style="margin-top:10px; background:var(--success-color);" onclick="RequestController.showFormStep()">Yeni İşletme Formuna Geç ➔</button>
            </div>`;
            updateWorkspaceState({ lastHint: 'Eşleşme bulunmadı. Yeni kayıt formu hazır.' });
        }
    }

    function openExistingBizForm(bizId) {
        shrinkHero();
        const biz = AppState.businesses.find(b => b.id === bizId);
        if (!biz) return;
        const detailBtn = document.getElementById('reqViewBizDetailsModal');
        if (detailBtn) {
            detailBtn.onclick = () => openBusinessDetailModal(biz.id);
        }
        pushRecentSearch(biz.companyName || '');
        updateWorkspaceState({
            mode: 'existing',
            lastSearchLabel: biz.companyName || 'Mevcut işletme',
            lastHint: 'Mevcut işletmede görev başlatma formu sağ panelde açıldı.',
        });

        document.getElementById('reqStep1Name').style.display = 'none';
        document.getElementById('reqExistingBizSplit').style.display = 'flex';
        document.getElementById('reqExistingBizSplit').classList.add('split-active');
        
        // 1. SOL PANELİ (ÖZET KARTINI) ZENGİN VERİLER VE GEÇMİŞ LOGLARLA DOLDUR
        const summaryContainer = document.getElementById('reqExistSummaryContent');
        if (summaryContainer) {
            let lastLogHtml = '<span style="color:#64748b; font-size:12px; font-style:italic;">Geçmiş işlem bulunamadı.</span>';
            const allBizTasks = AppState.tasks.filter(t => t.businessId === biz.id);
            let allLogs = [];
            allBizTasks.forEach(t => { if (t.logs) allLogs = allLogs.concat(t.logs); });
            
            // Tarihe göre sırala
            allLogs.sort((a, b) => {
                const dateA = parseLogDate(a.date) || 0;
                const dateB = parseLogDate(b.date) || 0;
                return dateB - dateA;
            });

            if (allLogs.length > 0) {
                const ll = allLogs[0];
                lastLogHtml = `<div style="background:#f1f5f9; border:1px solid #e2e8f0; padding:12px; border-radius:8px; font-size:12px;">
                    <strong style="color:var(--primary-color);">👤 ${ll.user}</strong> <span style="color:#64748b;">(${ll.date.split(' ')[0]})</span><br>
                    <div style="margin-top:6px; color:#334155; line-height:1.5;">${ll.text}</div>
                </div>`;
            }

            summaryContainer.innerHTML = `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:20px; font-size:13px;">
                <div><strong style="color:#64748b; display:block; font-size:11px; text-transform:uppercase;">İşletme Adı</strong><span style="color:#0f172a; font-weight:700;">${biz.companyName || '-'}</span></div>
                <div><strong style="color:#64748b; display:block; font-size:11px; text-transform:uppercase;">Konum</strong><span style="color:#0f172a; font-weight:600;">📍 ${biz.city || '-'} ${biz.district ? '/ ' + biz.district : ''}</span></div>
                <div><strong style="color:#64748b; display:block; font-size:11px; text-transform:uppercase;">Yetkili</strong><span style="color:#0f172a; font-weight:600;">👤 ${biz.contactName || '-'}</span></div>
                <div><strong style="color:#64748b; display:block; font-size:11px; text-transform:uppercase;">İletişim</strong><span style="color:#0f172a; font-weight:600;">📞 ${biz.contactPhone || '-'}</span></div>
            </div>
            <div>
                <strong style="color:#64748b; display:block; font-size:11px; text-transform:uppercase; margin-bottom:8px;">📝 Son İşlem Önizlemesi</strong>
                ${lastLogHtml}
            </div>`;
        }

        // 2. SAĞ PANEL FORM ATAMALARI
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        
        setVal('reqExistBizId', bizId);
        const cb = document.getElementById('reqExistUseExistingContact');
        if(cb) cb.checked = true;
        
        const contactFields = document.getElementById('reqExistNewContactFields');
        if(contactFields) contactFields.style.display = 'none';
        
        setVal('reqExistNewContactName', '');
        setVal('reqExistNewContactPhone', '');
        setVal('reqExistNewContactEmail', '');
        setVal('reqExistNote', '');

        setVal('reqExistSource', biz.sourceType || 'Fresh Account');
        if (typeof syncCampaignUrlVisibility === 'function') {
            syncCampaignUrlVisibility('reqExistSource', 'reqExistCampaignUrlGroup', 'reqExistCampaignUrl');
        }
        setVal('reqExistTaskCat', 'İstanbul Core');

        // Güvenli Kategori Ataması
        try {
            const mainCatEl = document.getElementById('reqExistMainCat');
            if (mainCatEl) {
                if (biz.mainCategory && AppState.dynamicCategories[biz.mainCategory]) {
                    mainCatEl.value = biz.mainCategory;
                } else if (Object.keys(AppState.dynamicCategories).length > 0) {
                    mainCatEl.value = Object.keys(AppState.dynamicCategories)[0];
                }
                updateReqExistSubCats();
                setTimeout(() => { setVal('reqExistSubCat', biz.subCategory || ''); }, 50);
            }
        } catch (e) {
            console.error("Kategori atama hatası:", e);
        }
    }

    function submitExistingBizTask() {
        const btn = document.getElementById('btnSubmitExistReq');
        if (btn) { btn.disabled = true; btn.innerText = "⏳ Kaydediliyor..."; }

        const bizId = document.getElementById('reqExistBizId').value;
        const biz = AppState.businesses.find(b => b.id === bizId);
        if (!biz) return;

        const useExisting = document.getElementById('reqExistUseExistingContact').checked;
        const newName = esc(document.getElementById('reqExistNewContactName').value.trim());
        const newPhone = esc(document.getElementById('reqExistNewContactPhone').value.trim());
        const newEmail = esc(document.getElementById('reqExistNewContactEmail').value.trim().toLowerCase());
        const note = esc(document.getElementById('reqExistNote').value.trim());
        const source = document.getElementById('reqExistSource').value;
        const campaignUrl = document.getElementById('reqExistCampaignUrl')?.value.trim() || '';
        const taskCat = document.getElementById('reqExistTaskCat').value;
        const mainCat = document.getElementById('reqExistMainCat').value;
        const subCat = document.getElementById('reqExistSubCat').value;
        const user = AppState.loggedInUser?.name || 'Kullanıcı';
        const ownerId = AppState.loggedInUser?.id || null;
        const sourceEnum = mapUiSourceToApi(source);
        const categoryEnum = mapUiTaskCategoryToApi(taskCat);

        const taskPayload = {
            accountId: bizId,
            category: categoryEnum,
            type: 'GENERAL',
            priority: 'MEDIUM',
            accountType: 'KEY',
            ownerId,
            creationChannel: 'REQUEST_FLOW',
            source: sourceEnum,
            mainCategory: mainCat,
            subCategory: subCat,
            systemLogText: '<span class="manager-note">[Sistem]</span> Satış temsilcisi bu işletmeyi havuzdan kendi üzerine aldı ve görevi başlattı.',
        };
        if (note) taskPayload.details = note;
        if (isCampaignUrlRequiredSource(source)) {
            taskPayload.campaignUrl = campaignUrl || undefined;
        }
        if (!useExisting && (newName || newPhone || newEmail)) {
            taskPayload.newContact = {
                name: newName || 'Yeni Yetkili',
                phone: newPhone || undefined,
                email: newEmail || undefined,
            };
        }

        DataService.apiRequest('/tasks', {
            method: 'POST',
            body: JSON.stringify(taskPayload)
        }).then(() => {
            if (btn) { btn.disabled = false; btn.innerText = "🚀 Görevi Başlat"; }
            addSystemLog(`${user}, ${biz.companyName} firmasını üzerine aldı ve görev başlattı.`);
            updateWorkspaceState({ lastHint: `${biz.companyName} için görev başarıyla başlatıldı.` });
            showToast('Görev başarıyla başlatıldı!', 'success');
            switchPage('page-my-tasks');
        }).catch(err => {
            if (btn) { btn.disabled = false; btn.innerText = "🚀 Görevi Başlat"; }
            showToast('Hata oluştu: ' + err.message, 'error');
            console.error(err);
        });
    }

    function showPhoneStep() {
        shrinkHero();
        updateWorkspaceState({ mode: 'verify', lastHint: 'Telefon numarasıyla çakışma kontrolü yapılıyor.' });
        document.getElementById('reqStep1Name').style.display = 'none';
        document.getElementById('reqExistingBizSplit').style.display = 'none';
        document.getElementById('reqStep2Phone').style.display = 'block';
        document.getElementById('reqSearchPhone').focus();
    }

    function searchPhone() {
        const val = document.getElementById('reqSearchPhone').value.replace(/\D/g, '');
        const resEl = document.getElementById('reqPhoneResults');

        if (val.length < 10) {
            resEl.innerHTML = '';
            return;
        }

        const matches = AppState.businesses.filter(b => {
            const p1 = (b.contactPhone || '').replace(/\D/g, '');
            if (p1.includes(val)) return true;
            if (b.extraContacts) {
                return b.extraContacts.some(ec => (ec.phone || '').replace(/\D/g, '').includes(val));
            }
            return false;
        });

        if (matches.length > 0) {
            resEl.innerHTML = `<div style="background:#fef2f2; border:1px solid #fca5a5; padding:15px; border-radius:8px; text-align:center;">
                <span style="font-size:24px; display:block; margin-bottom:10px;">🚨</span>
                <strong style="color:var(--danger-color); font-size:14px;">DUR! Bu numara sistemde kayıtlı.</strong>
                <p style="font-size:12px; color:#b91c1c; margin-top:5px;">Bu numara <b>${matches[0].companyName}</b> firmasına ait. Lütfen geri dönüp firma adından aratarak üzerinize alın.</p>
                <button type="button" class="btn-ghost" style="margin-top:10px;" onclick="RequestController.initWizard()">Geri Dön ve İsimle Ara</button>
            </div>`;
        } else {
            resEl.innerHTML = `<div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:15px; border-radius:8px; text-align:center;">
                <span style="font-size:24px; display:block; margin-bottom:10px;">✅</span>
                <strong style="color:var(--success-color); font-size:14px;">Telefon numarası da temiz!</strong>
                <p style="font-size:12px; color:#166534; margin-top:5px;">Bu işletme sistemde kesinlikle yok. Yeni kayıt formunu doldurarak göreve başlayabilirsiniz.</p>
                <button type="button" class="btn-action" style="margin-top:10px; background:var(--success-color);" onclick="RequestController.showFormStep()">Yeni İşletme Formuna Geç ➔</button>
            </div>`;
        }
    }

    function showFormStep() {
        shrinkHero();
        updateWorkspaceState({ mode: 'new', lastHint: 'Yeni kayıt formu açıldı. İşletme ve yetkili bilgilerini tamamlayın.' });
        document.getElementById('reqStep1Name').style.display = 'none';
        document.getElementById('reqExistingBizSplit').style.display = 'none';
        document.getElementById('reqStep2Phone').style.display = 'none';
        document.getElementById('reqStep3Form').style.display = 'block';
        
        const searchedName = document.getElementById('reqSearchName').value.trim();
        if(searchedName) document.getElementById('reqBizName').value = toTitleCase(searchedName);
        const sourceEl = document.getElementById('reqSourceType');
        if (sourceEl) {
            sourceEl.value = 'Fresh Account';
            if (typeof syncCampaignUrlVisibility === 'function') {
                syncCampaignUrlVisibility('reqSourceType', 'reqCampaignUrlGroup', 'reqCampaignUrl');
            }
        }
    }

    function submitNewBusiness() {
        const btn = document.getElementById('btnSubmitNewBizReq');
        if (btn) { btn.disabled = true; btn.innerText = "⏳ Kaydediliyor..."; }

        const getValue = id => esc(document.getElementById(id)?.value.trim() || '');
        const compName = getValue('reqBizName');
        const phone = getValue('reqContactPhone');

        if (!compName || !phone) {
            if (btn) { btn.disabled = false; btn.innerText = "🚀 Kaydet ve Görevi Başlat"; }
            return showToast("İşletme Adı ve Telefon zorunludur!", "error");
        }
        if (!isValidName(compName)) { if (btn) { btn.disabled = false; btn.innerText = "🚀 Kaydet ve Görevi Başlat"; } return showToast("Geçersiz işletme adı!", "error"); }
        if (!isValidPhone(phone)) { if (btn) { btn.disabled = false; btn.innerText = "🚀 Kaydet ve Görevi Başlat"; } return showToast("Geçersiz telefon numarası!", "error"); }
        const email = getValue('reqContactEmail').toLowerCase();
        if (email && !isValidEmail(email)) { if (btn) { btn.disabled = false; btn.innerText = "🚀 Kaydet ve Görevi Başlat"; } return showToast("Geçersiz e-posta adresi!", "error"); }

        const user = AppState.loggedInUser.name;
        const titleName = toTitleCase(compName);
        const sourceType = getValue('reqSourceType') || 'Fresh Account';
        const sourceEnum = mapUiSourceToApi(sourceType);
        const categoryEnum = mapUiTaskCategoryToApi(getValue('reqTaskCat') || 'İstanbul Core');
        const campaignUrl = isCampaignUrlRequiredSource(sourceType) ? getValue('reqCampaignUrl').trim() : '';
        const taskNote = getValue('reqNewTaskNote').trim();
        const ownerId = AppState.loggedInUser?.id || null;

        // 1. Account oluştur
        const accountPayload = {
            companyName: titleName,
            sourceType: sourceEnum,
            accountType: 'KEY',
            city: getValue('reqCity') || undefined,
            district: getValue('reqDistrict') || undefined,
            address: getValue('reqAddress') || undefined,
            contactPerson: toTitleCase(getValue('reqContactName')) || undefined,
            contactPhone: phone,
            email: email || undefined,
            website: getValue('reqWebsite') || undefined,
            instagram: getValue('reqInstagram') || undefined,
            campaignUrl: campaignUrl || undefined,
            businessStatus: 'ACTIVE',
            mainCategory: getValue('reqMainCat') || undefined,
            subCategory: getValue('reqSubCat') || undefined,
        };

        DataService.apiRequest('/accounts', {
            method: 'POST',
            body: JSON.stringify(accountPayload)
        }).then(account => {
            const mappedAccount = typeof DataService.mapBusiness === 'function' ? DataService.mapBusiness(account) : account;
            const nextBusinesses = Array.isArray(AppState.businesses) ? [...AppState.businesses] : [];
            const existingIndex = nextBusinesses.findIndex((b) => b.id === mappedAccount.id);
            if (existingIndex >= 0) nextBusinesses[existingIndex] = mappedAccount;
            else nextBusinesses.unshift(mappedAccount);
            AppState.businesses = nextBusinesses;
            if (typeof AppState.setBusinessDetail === 'function') AppState.setBusinessDetail(mappedAccount.id, mappedAccount);
            // 2. Task oluştur
            const taskPayload = {
                accountId: account.id,
                category: categoryEnum,
                type: 'GENERAL',
                priority: 'MEDIUM',
                accountType: 'KEY',
                ownerId,
                creationChannel: 'REQUEST_FLOW',
                source: sourceEnum,
                mainCategory: getValue('reqMainCat'),
                subCategory: getValue('reqSubCat'),
                systemLogText: '<span class="manager-note">[Sistem]</span> Yeni kayıt oluşturuldu ve satışçı görevi başlattı.',
            };
            if (taskNote) taskPayload.details = taskNote;
            if (campaignUrl) {
                taskPayload.campaignUrl = campaignUrl;
            }
            return DataService.apiRequest('/tasks', {
                method: 'POST',
                body: JSON.stringify(taskPayload)
            });
        }).then(async (task) => {
            const refreshedTask = task?.id ? await DataService.readPath(`tasks/${task.id}`, { force: true }).catch(() => null) : null;
            if (refreshedTask) {
                const nextTasks = Array.isArray(AppState.tasks) ? [...AppState.tasks] : [];
                const existingIndex = nextTasks.findIndex((item) => item.id === refreshedTask.id);
                if (existingIndex >= 0) nextTasks[existingIndex] = refreshedTask;
                else nextTasks.unshift(refreshedTask);
                AppState.tasks = nextTasks;
                if (typeof AppState.setTaskDetail === 'function') AppState.setTaskDetail(refreshedTask.id, refreshedTask);
            }
            if (btn) { btn.disabled = false; btn.innerText = "🚀 Kaydet ve Görevi Başlat"; }
            addSystemLog(`${user}, ${titleName} için yeni kayıt oluşturdu ve görevi aldı.`);
            pushRecentSearch(titleName);
            updateWorkspaceState({ lastSearchLabel: titleName, lastHint: `${titleName} için yeni kayıt ve görev oluşturuldu.` });
            showToast("Yeni işletme eklendi ve görev başlatıldı!", "success");
            if (typeof DataService.invalidateCollectionCache === 'function') {
                DataService.invalidateCollectionCache('tasks');
                DataService.invalidateCollectionCache('businesses');
            }
            if (typeof SyncService !== 'undefined' && typeof SyncService.requestSync === 'function') {
                SyncService.requestSync(['tasks', 'businesses']);
            }
            switchPage('page-my-tasks');
            if (typeof window.renderMyTasks === 'function') {
                setTimeout(() => window.renderMyTasks(), 0);
            }
        }).catch(err => {
            if (btn) { btn.disabled = false; btn.innerText = "🚀 Kaydet ve Görevi Başlat"; }
            showToast("Kaydedilirken bir hata oluştu: " + err.message, "error");
            console.error(err);
        });
    }

    function useRecentSearch(label) {
        const searchInput = document.getElementById('reqSearchName');
        if (!searchInput) return;
        expandHero();
        searchInput.value = label;
        searchName();
        searchInput.focus();
    }

    function quickAction(type) {
        if (type === 'new') return showFormStep();
        if (type === 'existing') {
            expandHero();
            const input = document.getElementById('reqSearchName');
            if (input) input.focus();
            updateWorkspaceState({ mode: 'search', lastHint: 'İşletme adıyla arama yapıp mevcut kayıt üzerinden ilerleyin.' });
            return;
        }
        if (type === 'recent') {
            const latest = workspaceState.recentSearches[0];
            if (latest) return useRecentSearch(latest);
            return showToast('Henüz tekrar kullanılacak arama yok.', 'info');
        }
        if (type === 'rules') {
            updateWorkspaceState({ lastHint: 'Kural: aktif görev başka kullanıcıdaysa blokaj koy, telefon çakışmasını kontrol et ve notla başlat.' });
            showToast('Kısa kural özeti sol panelde güncellendi.', 'info');
        }
    }

    return {
        initWizard,
        updateReqDistricts,
        updateReqSubCats,
        updateReqExistSubCats,
        searchName,
        showPhoneStep,
        searchPhone,
        showFormStep,
        openExistingBizForm,
        submitExistingBizTask,
        submitNewBusiness,
        quickAction,
        useRecentSearch
    };
})();

window.RequestController = RequestController;
