let currentPricingTab = 'komisyon';

window.switchPricingTab = function(tab) {
    currentPricingTab = tab;
    renderPricingPage();
};

window.toggleOfferItem = function(itemJson) {
    try {
        const item = JSON.parse(decodeURIComponent(itemJson));
        const idx = AppState.offerCart.findIndex(i => i.name === item.name);
        if (idx > -1) {
            AppState.offerCart.splice(idx, 1);
        } else {
            AppState.offerCart.push(item);
        }
        renderPricingPage();
    } catch (e) {
        console.error("Sepete ekleme hatası:", e);
    }
};

window.clearOfferCart = function() {
    AppState.offerCart = [];
    renderPricingPage();
};

function renderPricingPage() {
    const container = document.getElementById('pricingItemsContainer');
    if (!container) return;

    let data = AppState.pricingData;
    if (!data || Object.keys(data).length === 0) data = DEFAULT_PRICING_DATA;

    const commissionItems = data.COMMISSION ? data.COMMISSION.items : [];
    const serviceItems = data.SERVICE ? data.SERVICE.items : [];
    const dopingItems = data.DOPING ? data.DOPING.items : [];
    const socialItems = data.SOCIAL_MEDIA ? data.SOCIAL_MEDIA.items : [];
    const pricingRules = data.RULES || (typeof PRICING_REFERENCE_RULES !== 'undefined' ? PRICING_REFERENCE_RULES : { codeBundles: [], discountCoupons: [] });

    const interactiveItemsByTab = {
        hizmetler: serviceItems,
        doping: dopingItems,
        sosyal: socialItems,
    };

    const activeInteractiveTab = currentPricingTab === 'komisyon' ? 'hizmetler' : currentPricingTab;
    const tabItems = interactiveItemsByTab[activeInteractiveTab] || [];

    const safeAverageCommission = _calculateAverageCommission(commissionItems);
    const totalServiceCount = serviceItems.length + dopingItems.length + socialItems.length;
    const cartMetrics = _calculateCartMetrics(AppState.offerCart);

    const renderCommissionCard = (item, index) => {
        if (!item || !item.name) return '';
        const tones = ['emerald', 'blue', 'amber', 'slate'];
        const tone = tones[index % tones.length];
        return `
        <div class="pricing-insight-card tone-${tone}">
            <div class="pricing-insight-rate">${item.val || '%0'}</div>
            <div class="pricing-insight-title">${item.name}</div>
        </div>`;
    };

    const renderTabWidget = (item) => {
        if (!item || !item.name) return '';
        const itemJson = encodeURIComponent(JSON.stringify(item));
        const isSelected = AppState.offerCart.some((i) => i.name === item.name);
        return `
        <div class="pricing-work-card ${isSelected ? 'is-selected' : ''}" onclick="toggleOfferItem('${itemJson}')">
            <div class="pricing-work-card-head">
                <span class="pricing-work-card-type">${_getTabLabel(activeInteractiveTab)}</span>
                <span class="pricing-work-card-price">${Number(item.priceInc || 0).toLocaleString('tr-TR')} ₺</span>
            </div>
            <div class="pricing-work-card-title">${item.name}</div>
            <div class="pricing-work-card-meta">
                <span>KDV Hariç: ${Number(item.priceEx || 0).toLocaleString('tr-TR')} ₺</span>
                <span>${isSelected ? 'Sepette' : 'Sepete ekle'}</span>
            </div>
        </div>`;
    };

    const managerLink = AppState.loggedInUser?.role === 'Yönetici'
        ? `<button type="button" class="pricing-admin-link" onclick="switchPage('page-admin'); setTimeout(() => switchAdminTab('pricing'), 0);">Fiyat Yönetimi'ne Git</button>`
        : '';

    const html = `
    <div class="pricing-dashboard-shell">
        <div class="pricing-dashboard-hero">
            <div class="pricing-hero-copy">
                <span class="pricing-hero-kicker">Ticari Kontrol Paneli</span>
                <h1>Komisyonu üstte görün, teklifi altta çalıştırın.</h1>
                <p>Komisyon oranları burada referans kartı olarak izlenir. Etkileşimli seçimler hizmet, doping ve sosyal medya sepetinde yapılır. Veriler doğrudan Fiyat Yönetimi kaynağıyla senkron kalır.</p>
                <div class="pricing-hero-actions">
                    <span class="pricing-source-pill">Canlı kaynak: Fiyat Yönetimi</span>
                    ${managerLink}
                </div>
            </div>
            <div class="pricing-overview-grid">
                <div class="pricing-overview-card">
                    <span class="pricing-overview-label">Ortalama Komisyon</span>
                    <strong>${safeAverageCommission}</strong>
                    <small>${commissionItems.length} kategori referansı</small>
                </div>
                <div class="pricing-overview-card">
                    <span class="pricing-overview-label">Aktif Servis Havuzu</span>
                    <strong>${totalServiceCount}</strong>
                    <small>Hizmet + Doping + Sosyal</small>
                </div>
                <div class="pricing-overview-card">
                    <span class="pricing-overview-label">Sepetteki Kalem</span>
                    <strong>${cartMetrics.count}</strong>
                    <small>${cartMetrics.totalInc.toLocaleString('tr-TR')} ₺ KDV dahil</small>
                </div>
                <div class="pricing-overview-card">
                    <span class="pricing-overview-label">Tahmini Net Gelir</span>
                    <strong>${cartMetrics.netRevenue.toLocaleString('tr-TR')} ₺</strong>
                    <small>KDV hariç sepet toplamı</small>
                </div>
            </div>
        </div>

        <div class="pricing-dashboard-section">
            <div class="pricing-section-head">
                <div>
                    <h3>Komisyon Bilgi Kartları</h3>
                    <p>Bu alan referans amaçlıdır; komisyon oranları seçilmez, ticari çerçeve burada görünür tutulur.</p>
                </div>
            </div>
            <div class="pricing-insight-grid">
                ${commissionItems.length > 0 ? commissionItems.map(renderCommissionCard).join('') : '<div class="pricing-reference-empty">Komisyon verisi bulunmuyor.</div>'}
            </div>
        </div>

        <div class="pricing-dashboard-section">
            <div class="pricing-section-head">
                <div>
                    <h3>Operasyon Kuralları</h3>
                    <p>Kod adet paketleri ve indirim çeki kurguları artık Fiyat Yönetimi kaynağından okunur. Bu alan sabit metin değil, yönetilebilir ticari referanstır.</p>
                </div>
            </div>
            <div class="pricing-rule-grid">
                <div class="pricing-rule-card">
                    <div class="pricing-rule-title">Kod Adet Paketleri</div>
                    <div class="pricing-rule-list">
                        ${(pricingRules.codeBundles || []).map((item) => `
                            <div class="pricing-rule-row">
                                <span>${item.name}</span>
                                <strong>${Number(item.priceInc || 0).toLocaleString('tr-TR')} TL</strong>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ${(pricingRules.discountCoupons || []).map((group) => `
                    <div class="pricing-rule-card">
                        <div class="pricing-rule-title">${group.title} İndirim Çeki Kuralları</div>
                        <div class="pricing-rule-stack">
                            ${(group.rules || []).map((rule) => `<div class="pricing-rule-chip">${rule}</div>`).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="pricing-dashboard-section">
            <div class="pricing-section-head">
                <div>
                    <h3>Sepet Workspace</h3>
                    <p>İnteraktif seçim sadece ek hizmetlerde yapılır. Seçimler canlı sepet ve alt toplam paneline anında yansır.</p>
                </div>
            </div>

            <div class="pricing-workspace">
                <div class="pricing-workspace-catalog">
                    <div class="pricing-workspace-tabs">
                        <button class="pricing-workspace-tab ${activeInteractiveTab === 'hizmetler' ? 'active' : ''}" onclick="switchPricingTab('hizmetler')">Hizmetler</button>
                        <button class="pricing-workspace-tab ${activeInteractiveTab === 'doping' ? 'active' : ''}" onclick="switchPricingTab('doping')">Doping Paketleri</button>
                        <button class="pricing-workspace-tab ${activeInteractiveTab === 'sosyal' ? 'active' : ''}" onclick="switchPricingTab('sosyal')">Sosyal Medya</button>
                    </div>
                    <div class="pricing-work-grid">
                        ${tabItems.length > 0 ? tabItems.map(renderTabWidget).join('') : '<div class="pricing-reference-empty">Bu kategori için fiyat verisi bulunmuyor.</div>'}
                    </div>
                </div>

                <div class="pricing-workspace-cart">
                    <div class="pricing-cart-box">
                        <div class="pricing-cart-head">
                            <div>
                                <h4>Canlı Sepet</h4>
                                <p>Seçtiğiniz hizmetler burada toplanır.</p>
                            </div>
                            <button type="button" class="pricing-cart-clear" onclick="clearOfferCart()">Temizle</button>
                        </div>
                        <div id="pricingWorkspaceCartItems" class="pricing-cart-items"></div>
                    </div>
                </div>
            </div>

            <div id="pricingSummaryPanel" class="pricing-summary-panel"></div>
        </div>
    </div>`;

    container.innerHTML = html;
    renderOfferCart();
}

function renderOfferCart() {
    const bar = document.getElementById('floatingCartBar');
    const listEl = document.getElementById('floatingCartItems');
    const totalEl = document.getElementById('floatingCartTotal');
    const workspaceItemsEl = document.getElementById('pricingWorkspaceCartItems');
    const summaryPanelEl = document.getElementById('pricingSummaryPanel');
    
    if (bar) bar.style.display = 'none';
    if (listEl) listEl.innerHTML = '';
    if (totalEl) totalEl.innerHTML = '';

    const metrics = _calculateCartMetrics(AppState.offerCart);

    const itemsHtml = AppState.offerCart.map((item) => {
        const itemJson = encodeURIComponent(JSON.stringify(item));
        return `<div class="pricing-cart-item">
            <div class="pricing-cart-item-copy">
                <strong>${item.name}</strong>
                <span>KDV Hariç ${Number(item.priceEx || 0).toLocaleString('tr-TR')} ₺</span>
            </div>
            <div class="pricing-cart-item-right">
                <span>${Number(item.priceInc || 0).toLocaleString('tr-TR')} ₺</span>
                <button class="cart-remove-icon" onclick="toggleOfferItem('${itemJson}')">×</button>
            </div>
        </div>`;
    }).join('');

    if (workspaceItemsEl) {
        workspaceItemsEl.innerHTML = itemsHtml || `<div class="pricing-cart-empty">Henüz hizmet eklenmedi. Soldaki kartlardan seçim yaparak sepeti oluşturun.</div>`;
    }

    if (summaryPanelEl) {
        summaryPanelEl.innerHTML = `
            <div class="pricing-summary-metrics">
                <div class="pricing-summary-metric">
                    <span>Ara Toplam</span>
                    <strong>${metrics.totalEx.toLocaleString('tr-TR')} ₺</strong>
                </div>
                <div class="pricing-summary-metric">
                    <span>KDV</span>
                    <strong>${metrics.tax.toLocaleString('tr-TR')} ₺</strong>
                </div>
                <div class="pricing-summary-metric">
                    <span>Genel Toplam</span>
                    <strong>${metrics.totalInc.toLocaleString('tr-TR')} ₺</strong>
                </div>
                <div class="pricing-summary-metric highlight">
                    <span>Tahmini Net Gelir</span>
                    <strong>${metrics.netRevenue.toLocaleString('tr-TR')} ₺</strong>
                </div>
            </div>
            <div class="pricing-summary-actions">
                <div class="pricing-summary-note">Sepet, Fiyat Yönetimi ekranındaki canlı verilerle hesaplanır.</div>
                <div class="pricing-summary-buttons">
                    <button type="button" class="cart-clear-btn" onclick="clearOfferCart()">Sepeti Temizle</button>
                </div>
            </div>
        `;
    }
}

function _getTabLabel(tab) {
    if (tab === 'hizmetler') return 'Hizmet';
    if (tab === 'doping') return 'Doping';
    if (tab === 'sosyal') return 'Sosyal';
    return 'Kalem';
}

function _calculateAverageCommission(items) {
    const values = (Array.isArray(items) ? items : [])
        .map((item) => {
            const matches = String(item?.val || '').match(/[\d.,]+/g) || [];
            const numbers = matches
                .map((part) => Number(String(part).replace(',', '.')))
                .filter((value) => !Number.isNaN(value));
            if (numbers.length === 0) return null;
            return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
        })
        .filter((value) => typeof value === 'number');

    if (values.length === 0) return '%0';
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    return `%${Math.round(average)}`;
}

function _calculateCartMetrics(cartItems) {
    const items = Array.isArray(cartItems) ? cartItems : [];
    const totalEx = items.reduce((sum, item) => sum + Number(item.priceEx || 0), 0);
    const totalInc = items.reduce((sum, item) => sum + Number(item.priceInc || 0), 0);
    const tax = Math.max(totalInc - totalEx, 0);
    return {
        count: items.length,
        totalEx,
        totalInc,
        tax,
        netRevenue: totalEx,
    };
}

// ==========================================
// ADMIN FİYAT VE ORAN YÖNETİMİ
// ==========================================
const PricingController = (() => {
    async function renderAdminPricing() {
        try {
            if (typeof DataService !== 'undefined' && typeof DataService.fetchOnce === 'function') {
                const freshPricing = await DataService.fetchOnce('pricingData');
                if (freshPricing && typeof freshPricing === 'object') {
                    AppState.pricingData = freshPricing;
                }
            }
            _renderRealLists();
        } catch (err) {
            console.error('Pricing data refresh failed:', err);
            _renderRealLists();
        }
    }

    function _renderRealLists() {
        const data = AppState.pricingData;
        if (!data) return;
        _renderList('draftKomisyonList', data.COMMISSION ? data.COMMISSION.items : [], true, 'COMMISSION');
        _renderList('draftHizmetlerList', data.SERVICE ? data.SERVICE.items : [], false, 'SERVICE');
        _renderList('draftDopinglerList', data.DOPING ? data.DOPING.items : [], false, 'DOPING');
        _renderList('draftSosyalList', data.SOCIAL_MEDIA ? data.SOCIAL_MEDIA.items : [], false, 'SOCIAL_MEDIA');
        _renderCodeBundleList('draftCodeBundleList', data.RULES?.codeBundles || []);
        _renderDiscountCouponList('draftDiscountCouponList', data.RULES?.discountCoupons || []);
    }

    function _renderList(containerId, items, isKomisyon = false, categoryKey = '') {
        const container = document.getElementById(containerId);
        if (!container) return;
        items = items || [];
        if (items.length === 0) {
            container.innerHTML = '<div style="font-size:12px; color:#888; font-style:italic;">Kayıt yok.</div>';
            return;
        }
        container.innerHTML = items.map((item) => {
            let valStr = isKomisyon
                ? item.val
                : `${Number(item.priceEx || 0).toLocaleString('tr-TR')}₺ (KDV Dahil: ${Number(item.priceInc || 0).toLocaleString('tr-TR')}₺)`;
            const encodedName = encodeURIComponent(item.name || '');
            const actionButtons = `
                <div style="display:flex; gap:6px; align-items:center;">
                    <button class="btn-action" style="padding:4px 8px; font-size:10px; border-radius:4px; margin:0; box-shadow:none; background:#0f766e;" onclick="editDraftPricingItem('${categoryKey}', '${encodedName}')">Düzenle</button>
                    <button class="btn-danger" style="padding:4px 8px; font-size:10px; border-radius:4px; margin:0; box-shadow:none;" onclick="removeDraftPricingItem('${categoryKey}', '${encodedName}')">Sil</button>
                </div>`;
            return `<div style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:8px 10px; border:1px solid #e2e8f0; border-radius:6px; font-size:12px;">
                <div><b style="color:var(--secondary-color);">${item.name}</b> <span style="color:#64748b; margin-left:5px;">${valStr}</span></div>
                ${actionButtons}
            </div>`;
        }).join('');
    }

    function _renderCodeBundleList(containerId, items) {
        const container = document.getElementById(containerId);
        if (!container) return;
        items = items || [];
        if (items.length === 0) {
            container.innerHTML = '<div style="font-size:12px; color:#888; font-style:italic;">Kayıt yok.</div>';
            return;
        }
        container.innerHTML = items.map((item) => {
            const encodedName = encodeURIComponent(item.name || '');
            return `<div style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:8px 10px; border:1px solid #e2e8f0; border-radius:6px; font-size:12px;">
                <div><b style="color:var(--secondary-color);">${item.name}</b> <span style="color:#64748b; margin-left:5px;">${Number(item.priceInc || 0).toLocaleString('tr-TR')}₺ KDV Dahil</span></div>
                <div style="display:flex; gap:6px; align-items:center;">
                    <button class="btn-action" style="padding:4px 8px; font-size:10px; border-radius:4px; margin:0; box-shadow:none; background:#0f766e;" onclick="editPricingRuleItem('CODE_BUNDLES', '${encodedName}')">Düzenle</button>
                    <button class="btn-danger" style="padding:4px 8px; font-size:10px; border-radius:4px; margin:0; box-shadow:none;" onclick="removePricingRuleItem('CODE_BUNDLES', '${encodedName}')">Sil</button>
                </div>
            </div>`;
        }).join('');
    }

    function _renderDiscountCouponList(containerId, groups) {
        const container = document.getElementById(containerId);
        if (!container) return;
        groups = groups || [];
        if (groups.length === 0) {
            container.innerHTML = '<div style="font-size:12px; color:#888; font-style:italic;">Kayıt yok.</div>';
            return;
        }
        container.innerHTML = groups.map((group) => {
            const encodedTitle = encodeURIComponent(group.title || '');
            return `<div style="display:flex; flex-direction:column; gap:10px; background:#fff; padding:12px; border:1px solid #e2e8f0; border-radius:10px; font-size:12px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                    <div>
                        <b style="color:var(--secondary-color); display:block;">${group.title}</b>
                        <span style="color:#64748b;">${(group.rules || []).length} kural</span>
                    </div>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <button class="btn-action" style="padding:4px 8px; font-size:10px; border-radius:4px; margin:0; box-shadow:none; background:#0f766e;" onclick="editPricingRuleItem('DISCOUNT_COUPONS', '${encodedTitle}')">Düzenle</button>
                        <button class="btn-danger" style="padding:4px 8px; font-size:10px; border-radius:4px; margin:0; box-shadow:none;" onclick="removePricingRuleItem('DISCOUNT_COUPONS', '${encodedTitle}')">Sil</button>
                    </div>
                </div>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    ${(group.rules || []).map((rule) => `<div style="padding:8px 10px; border-radius:8px; background:#f8fafc; color:#475569;">${rule}</div>`).join('')}
                </div>
            </div>`;
        }).join('');
    }

    function _toPersistedPricingPayload(pricingData) {
        const data = pricingData || {};
        return {
            komisyonlar: (data.COMMISSION?.items || []).map((item) => ({ name: item.name, val: item.val })),
            hizmetler: (data.SERVICE?.items || []).map((item) => ({ name: item.name, priceEx: item.priceEx, priceInc: item.priceInc })),
            dopingler: (data.DOPING?.items || []).map((item) => ({ name: item.name, priceEx: item.priceEx, priceInc: item.priceInc })),
            sosyalMedya: (data.SOCIAL_MEDIA?.items || []).map((item) => ({ name: item.name, priceEx: item.priceEx, priceInc: item.priceInc })),
            RULES: {
                codeBundles: (data.RULES?.codeBundles || []).map((item) => ({
                    name: item.name,
                    priceInc: Number(item.priceInc || 0),
                })),
                discountCoupons: (data.RULES?.discountCoupons || []).map((group) => ({
                    title: group.title,
                    rules: Array.isArray(group.rules) ? group.rules.filter(Boolean) : [],
                })),
            },
        };
    }

    function _resolveCategoryCollection(categoryKey) {
        if (categoryKey === 'COMMISSION') return 'COMMISSION';
        if (categoryKey === 'SERVICE') return 'SERVICE';
        if (categoryKey === 'DOPING') return 'DOPING';
        if (categoryKey === 'SOCIAL_MEDIA') return 'SOCIAL_MEDIA';
        return '';
    }

    async function addDraftItem(category, nameId, valId) {
        const nameEl = document.getElementById(nameId);
        const valEl = document.getElementById(valId);
        const name = nameEl ? nameEl.value.trim() : '';
        const val = valEl ? valEl.value.trim() : '';

        if (!name || !val) return showToast('Lütfen isim ve değer/fiyat alanlarını doldurun.', 'warning');

        // Enum çevirisi
        let apiCategory = 'COMMISSION';
        if (category === 'hizmetler') apiCategory = 'SERVICE';
        else if (category === 'dopingler') apiCategory = 'DOPING';
        else if (category === 'sosyalMedya') apiCategory = 'SOCIAL_MEDIA';

        const payload = {
            name: name,
            category: apiCategory,
            unitPrice: 0,
            status: 'ACTIVE'
        };

        if (apiCategory === 'COMMISSION') {
            const rawRate = val.replace('%', '');
            payload.commissionRate = parseFloat(rawRate) || 0;
        } else {
            const priceEx = parseFloat(val.replace(',', '.'));
            if (isNaN(priceEx)) return showToast('Lütfen KDV Hariç geçerli bir rakam girin.', 'error');
            payload.unitPrice = priceEx;
            // priceInc değeri veritabanında tutulmayıp front-end'de %20 KDV ile gösterilecek
        }

        try {
            await DataService.apiRequest('/pricing', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (nameEl) nameEl.value = '';
            if (valEl) valEl.value = '';

            showToast('Fiyat/Komisyon başarıyla eklendi.', 'success');
            await renderAdminPricing(); // Anında yeni verileri çek ve listele
            renderPricingPage(); // Sol menüyü (user preview) güncelle
        } catch (err) {
            console.error('Pricing add failed:', err);
            showToast(`Ekleme hatası: ${err.message}`, 'error');
        }
    }

    async function removeDraftItem(categoryKey, encodedName) {
        const name = decodeURIComponent(encodedName || '');
        const collectionKey = _resolveCategoryCollection(categoryKey);
        if (!collectionKey || !name) return;
        
        askConfirm("Bu öğeyi kalıcı olarak silmek istediğinize emin misiniz?", async (res) => {
            if (!res) return;
            try {
                const nextPricing = JSON.parse(JSON.stringify(AppState.pricingData || DEFAULT_PRICING_DATA));
                nextPricing[collectionKey].items = (nextPricing[collectionKey]?.items || []).filter((item) => item.name !== name);
                const persisted = await DataService.savePricing(_toPersistedPricingPayload(nextPricing));
                if (persisted) AppState.pricingData = persisted;
                showToast("Öğe başarıyla silindi.", "success");
                await renderAdminPricing();
                renderPricingPage();
            } catch (err) {
                console.error('Pricing delete failed:', err);
                showToast(`Silme hatası: ${err.message}`, 'error');
            }
        });
    }

    async function editDraftItem(categoryKey, encodedName) {
        const name = decodeURIComponent(encodedName || '');
        const collectionKey = _resolveCategoryCollection(categoryKey);
        if (!collectionKey || !name) return;

        const nextPricing = JSON.parse(JSON.stringify(AppState.pricingData || DEFAULT_PRICING_DATA));
        const items = nextPricing[collectionKey]?.items || [];
        const targetItem = items.find((item) => item.name === name);
        if (!targetItem) return;

        const nextName = window.prompt('Yeni ad', targetItem.name || '');
        if (!nextName || !nextName.trim()) return;

        if (collectionKey === 'COMMISSION') {
            const nextVal = window.prompt('Yeni komisyon oranı', targetItem.val || '');
            if (!nextVal || !nextVal.trim()) return;
            targetItem.name = nextName.trim();
            targetItem.val = nextVal.trim();
        } else {
            const nextPrice = window.prompt('Yeni KDV hariç fiyat', String(targetItem.priceEx ?? ''));
            if (!nextPrice || !nextPrice.trim()) return;
            const parsed = Number(String(nextPrice).replace(',', '.'));
            if (Number.isNaN(parsed)) {
                showToast('Geçerli bir fiyat girin.', 'warning');
                return;
            }
            targetItem.name = nextName.trim();
            targetItem.priceEx = parsed;
            targetItem.priceInc = Math.round(parsed * 1.2);
        }

        try {
            const persisted = await DataService.savePricing(_toPersistedPricingPayload(nextPricing));
            if (persisted) AppState.pricingData = persisted;
            showToast('Öğe başarıyla güncellendi.', 'success');
            await renderAdminPricing();
            renderPricingPage();
        } catch (err) {
            console.error('Pricing edit failed:', err);
            showToast(`Güncelleme hatası: ${err.message}`, 'error');
        }
    }

    function _clonePricingState() {
        return JSON.parse(JSON.stringify(AppState.pricingData || DEFAULT_PRICING_DATA));
    }

    function _ensureRuleState(pricingData) {
        if (!pricingData.RULES) {
            pricingData.RULES = { codeBundles: [], discountCoupons: [] };
        }
        if (!Array.isArray(pricingData.RULES.codeBundles)) pricingData.RULES.codeBundles = [];
        if (!Array.isArray(pricingData.RULES.discountCoupons)) pricingData.RULES.discountCoupons = [];
        return pricingData;
    }

    async function addRuleItem(ruleType, nameId, valueId) {
        const nameEl = document.getElementById(nameId);
        const valueEl = document.getElementById(valueId);
        const name = nameEl ? nameEl.value.trim() : '';
        const rawValue = valueEl ? valueEl.value.trim() : '';

        if (!name || !rawValue) {
            return showToast('Lütfen gerekli alanları doldurun.', 'warning');
        }

        const nextPricing = _ensureRuleState(_clonePricingState());

        if (ruleType === 'CODE_BUNDLES') {
            const priceInc = Number(String(rawValue).replace(',', '.'));
            if (Number.isNaN(priceInc)) {
                return showToast('Kod paket fiyatı için geçerli bir rakam girin.', 'warning');
            }
            nextPricing.RULES.codeBundles.push({ name, priceInc });
        } else if (ruleType === 'DISCOUNT_COUPONS') {
            const rules = rawValue.split('\n').map((line) => line.trim()).filter(Boolean);
            if (rules.length === 0) {
                return showToast('En az bir indirim kuralı girin.', 'warning');
            }
            nextPricing.RULES.discountCoupons.push({ title: name, rules });
        } else {
            return;
        }

        try {
            const persisted = await DataService.savePricing(_toPersistedPricingPayload(nextPricing));
            if (persisted) AppState.pricingData = persisted;
            if (nameEl) nameEl.value = '';
            if (valueEl) valueEl.value = '';
            showToast('Kural başarıyla kaydedildi.', 'success');
            await renderAdminPricing();
            renderPricingPage();
        } catch (err) {
            console.error('Pricing rule add failed:', err);
            showToast(`Kural ekleme hatası: ${err.message}`, 'error');
        }
    }

    async function removeRuleItem(ruleType, encodedKey) {
        const key = decodeURIComponent(encodedKey || '');
        if (!key) return;

        askConfirm('Bu kural kaydını kalıcı olarak silmek istediğinize emin misiniz?', async (res) => {
            if (!res) return;
            try {
                const nextPricing = _ensureRuleState(_clonePricingState());
                if (ruleType === 'CODE_BUNDLES') {
                    nextPricing.RULES.codeBundles = nextPricing.RULES.codeBundles.filter((item) => item.name !== key);
                } else if (ruleType === 'DISCOUNT_COUPONS') {
                    nextPricing.RULES.discountCoupons = nextPricing.RULES.discountCoupons.filter((group) => group.title !== key);
                }
                const persisted = await DataService.savePricing(_toPersistedPricingPayload(nextPricing));
                if (persisted) AppState.pricingData = persisted;
                showToast('Kural başarıyla silindi.', 'success');
                await renderAdminPricing();
                renderPricingPage();
            } catch (err) {
                console.error('Pricing rule delete failed:', err);
                showToast(`Kural silme hatası: ${err.message}`, 'error');
            }
        });
    }

    async function editRuleItem(ruleType, encodedKey) {
        const key = decodeURIComponent(encodedKey || '');
        if (!key) return;

        const nextPricing = _ensureRuleState(_clonePricingState());

        if (ruleType === 'CODE_BUNDLES') {
            const targetItem = nextPricing.RULES.codeBundles.find((item) => item.name === key);
            if (!targetItem) return;
            const nextName = window.prompt('Paket adı', targetItem.name || '');
            if (!nextName || !nextName.trim()) return;
            const nextPrice = window.prompt('KDV dahil fiyat', String(targetItem.priceInc ?? ''));
            if (!nextPrice || !nextPrice.trim()) return;
            const parsedPrice = Number(String(nextPrice).replace(',', '.'));
            if (Number.isNaN(parsedPrice)) {
                showToast('Geçerli bir fiyat girin.', 'warning');
                return;
            }
            targetItem.name = nextName.trim();
            targetItem.priceInc = parsedPrice;
        } else if (ruleType === 'DISCOUNT_COUPONS') {
            const targetGroup = nextPricing.RULES.discountCoupons.find((group) => group.title === key);
            if (!targetGroup) return;
            const nextTitle = window.prompt('Kural grubu adı', targetGroup.title || '');
            if (!nextTitle || !nextTitle.trim()) return;
            const nextRules = window.prompt('Kuralları satır satır girin', (targetGroup.rules || []).join('\n'));
            if (!nextRules || !nextRules.trim()) return;
            targetGroup.title = nextTitle.trim();
            targetGroup.rules = nextRules.split('\n').map((line) => line.trim()).filter(Boolean);
        } else {
            return;
        }

        try {
            const persisted = await DataService.savePricing(_toPersistedPricingPayload(nextPricing));
            if (persisted) AppState.pricingData = persisted;
            showToast('Kural başarıyla güncellendi.', 'success');
            await renderAdminPricing();
            renderPricingPage();
        } catch (err) {
            console.error('Pricing rule edit failed:', err);
            showToast(`Kural güncelleme hatası: ${err.message}`, 'error');
        }
    }

    // Eski Kaydet / İptal metodları artık toplu kaydetme olmadığından kullanılmayacak (geriye dönük hatayı engellemek için dummy metodlar bırakıyoruz)
    function saveAdminPricing() {
        showToast("Gerçek zamanlı kayıt aktif. Değişiklikler zaten kaydedildi.", "info");
    }

    function cancelAdminPricing() {
        showToast("Gerçek zamanlı mod kullanıldığından iptal işlemi geçersiz.", "info");
    }

    window.switchAdminPricingTab = function(tabId) {
        document.querySelectorAll('.av-menu-item').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.av-content-section').forEach(el => el.style.display = 'none');
        
        const btn = document.getElementById('avTab-' + tabId);
        const content = document.getElementById('avContent-' + tabId);
        
        if (btn) btn.classList.add('active');
        if (content) content.style.display = 'block';
    };

    return {
        renderAdminPricing,
        addDraftItem,
        removeDraftItem,
        addRuleItem,
        removeRuleItem,
        editRuleItem,
        saveAdminPricing,
        cancelAdminPricing
    };
})();

// Global Binding (HTML Eventleri için)
window.PricingController = PricingController;
window.addDraftPricingItem = PricingController.addDraftItem;
window.removeDraftPricingItem = PricingController.removeDraftItem;
window.editDraftPricingItem = PricingController.editDraftItem;
window.addPricingRuleItem = PricingController.addRuleItem;
window.removePricingRuleItem = PricingController.removeRuleItem;
window.editPricingRuleItem = PricingController.editRuleItem;
window.saveAdminPricing = PricingController.saveAdminPricing;
window.cancelAdminPricing = PricingController.cancelAdminPricing;
