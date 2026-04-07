// ============================================================
// utils/ui.js
// Genel UI yardımcıları: toast, confirm, prompt, modal
// ============================================================

/**
 * Köşe bildirimi (toast) gösterir.
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} type
 */
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const iconMap = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };
    const colorMap = {
        info: 'var(--info-color)',
        success: 'var(--success-color)',
        warning: 'var(--warning-color)',
        error: 'var(--danger-color)'
    };

    const toast = document.createElement('div');
    toast.className = `modern-toast ${type}`;
    toast.style.borderLeftColor = colorMap[type];
    toast.innerHTML = `<span style="font-size:18px;">${iconMap[type]}</span>
                       <div style="flex:1;">${message}</div>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOutDown 0.4s ease forwards';
        setTimeout(() => { if (toast.parentElement) toast.remove(); }, 400);
    }, 3500);
}

/**
 * Onay diyaloğu gösterir.
 * @param {string} message
 * @param {function(boolean)} callback
 */
function askConfirm(message, callback) {
    const overlay = _createModalOverlay('10005');
    const box = _createDialogBox('warning');
    box.innerHTML = `
        <div style="font-size:40px; margin-bottom:15px;">❓</div>
        <h3 style="margin:0 0 10px 0; color:var(--secondary-color); font-size:18px;">Onayınız Gerekiyor</h3>
        <p style="color:var(--text-muted); font-size:14px; margin-bottom:25px; line-height:1.5;">${message}</p>
        <div style="display:flex; gap:10px; justify-content:center;">
            <button id="btnConfirmYes" style="background:var(--success-color); box-shadow:none; flex:1;">Evet, Onaylıyorum</button>
            <button id="btnConfirmNo" style="background:var(--border-color); color:var(--secondary-color); box-shadow:none; flex:1;">İptal</button>
        </div>`;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    document.getElementById('btnConfirmYes').onclick = () => { overlay.remove(); callback(true); };
    document.getElementById('btnConfirmNo').onclick = () => { overlay.remove(); callback(false); };
}

/**
 * Metin girişi diyaloğu gösterir.
 * @param {string} message
 * @param {string} placeholder
 * @param {function(string|null)} callback  — iptal edilirse null döner
 */
function askPrompt(message, placeholder, callback) {
    const overlay = _createModalOverlay('10005');
    const box = _createDialogBox('info');
    box.innerHTML = `
        <div style="font-size:40px; margin-bottom:15px;">💬</div>
        <h3 style="margin:0 0 10px 0; color:var(--secondary-color); font-size:18px;">Açıklama Bekleniyor</h3>
        <p style="color:var(--text-muted); font-size:14px; margin-bottom:15px; line-height:1.5;">${message}</p>
        <input type="text" id="promptInput" placeholder="${placeholder}"
               style="width:100%; padding:10px; border:2px solid var(--border-light); border-radius:6px;
                      margin-bottom:20px; font-size:14px; box-sizing:border-box; outline:none;">
        <div style="display:flex; gap:10px; justify-content:center;">
            <button id="btnPromptSubmit" style="background:var(--primary-color); box-shadow:none; flex:1;">Tamam</button>
            <button id="btnPromptCancel" style="background:var(--border-color); color:var(--secondary-color); box-shadow:none; flex:1;">İptal</button>
        </div>`;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    document.getElementById('promptInput').focus();

    document.getElementById('btnPromptSubmit').onclick = () => {
        const raw = document.getElementById('promptInput').value.trim();
        const val = raw ? esc(raw) : null;
        overlay.remove();
        callback(val);
    };
    document.getElementById('btnPromptCancel').onclick = () => { overlay.remove(); callback(null); };
}

/**
 * Modal'ı gizler ve gerekirse Flatpickr instance'ını temizler.
 */
function closeModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.style.display = 'none';
    }

    if (id === 'taskModal' && window.fpInstance) {
        window.fpInstance.destroy();
        window.fpInstance = null;
    }
}

/**
 * Modal overlay'e tıklandığında modal'ı kapatır.
 */
function closeModalOnOutsideClick(e) {
    if (e.target.classList.contains('modal-overlay')) {
        closeModal(e.target.id);
    }
}

// --- Özel yardımcılar ---

function _createModalOverlay(zIndex = '10000') {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = zIndex;
    return overlay;
}

function _createDialogBox(borderColor = 'warning') {
    const colorVarMap = {
        warning: 'var(--warning-color)',
        info: 'var(--info-color)',
        danger: 'var(--danger-color)',
        success: 'var(--success-color)',
    };
    const box = document.createElement('div');
    box.style.cssText = `
        background:#fff; padding:25px; border-radius:12px;
        box-shadow:var(--shadow-md); max-width:400px; width:90%;
        text-align:center; border-top:5px solid ${colorVarMap[borderColor] || colorVarMap.info};`;
    return box;
}

function _ensureGlobalLoader() {
    let loader = document.getElementById('global-loader');
    if (loader) return loader;

    loader = document.createElement('div');
    loader.id = 'global-loader';
    loader.style.cssText = `
        display:none;
        position:fixed;
        inset:0;
        z-index:10020;
        background:rgba(15, 23, 42, 0.58);
        backdrop-filter:blur(6px);
        align-items:center;
        justify-content:center;
        padding:24px;
        box-sizing:border-box;
    `;
    document.body.appendChild(loader);
    return loader;
}

function showProgressOverlay(title, detail = '', options = {}) {
    const loader = _ensureGlobalLoader();
    const percent = Number.isFinite(Number(options.percent)) ? Math.max(0, Math.min(100, Number(options.percent))) : null;
    const meta = options.meta ? `<div id="global-loader-meta" style="font-size:12px; color:#64748b; margin-top:10px;">${options.meta}</div>` : '<div id="global-loader-meta" style="display:none;"></div>';
    const barHtml = `
        <div style="margin-top:18px;">
            <div style="height:10px; border-radius:999px; background:#e2e8f0; overflow:hidden;">
                <div id="global-loader-bar" style="height:100%; width:${percent != null ? percent : 12}%; border-radius:999px; background:linear-gradient(90deg, #0f766e 0%, #14b8a6 100%); transition:width .25s ease;"></div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
                <span id="global-loader-detail" style="font-size:13px; color:#475569;">${detail || ''}</span>
                <span id="global-loader-percent" style="font-size:13px; font-weight:700; color:#0f172a;">${percent != null ? `${Math.round(percent)}%` : ''}</span>
            </div>
            ${meta}
        </div>
    `;

    loader.innerHTML = `
        <div style="width:min(520px, 100%); background:#fff; border-radius:20px; box-shadow:0 24px 80px rgba(15, 23, 42, 0.28); padding:24px 24px 20px;">
            <div style="display:flex; align-items:center; gap:14px;">
                <div style="width:44px; height:44px; border-radius:14px; background:linear-gradient(135deg, #0f766e 0%, #14b8a6 100%); color:#fff; display:flex; align-items:center; justify-content:center; font-size:22px;">⏳</div>
                <div>
                    <h2 id="global-loader-title" style="margin:0; font-size:22px; color:#0f172a;">${title}</h2>
                    <p style="margin:4px 0 0 0; font-size:13px; color:#64748b;">İşlem devam ediyor. Bu pencere otomatik kapanacak.</p>
                </div>
            </div>
            ${barHtml}
        </div>
    `;
    loader.style.display = 'flex';
    loader.style.opacity = '1';
    return loader;
}

function updateProgressOverlay(detail = '', options = {}) {
    const loader = _ensureGlobalLoader();
    if (loader.style.display === 'none') return;

    const titleEl = document.getElementById('global-loader-title');
    const detailEl = document.getElementById('global-loader-detail');
    const percentEl = document.getElementById('global-loader-percent');
    const barEl = document.getElementById('global-loader-bar');
    const metaEl = document.getElementById('global-loader-meta');

    if (options.title && titleEl) titleEl.innerText = options.title;
    if (detailEl) detailEl.innerText = detail || '';

    if (metaEl) {
        if (options.meta) {
            metaEl.style.display = 'block';
            metaEl.innerText = options.meta;
        } else {
            metaEl.style.display = 'none';
            metaEl.innerText = '';
        }
    }

    if (barEl && Number.isFinite(Number(options.percent))) {
        const percent = Math.max(0, Math.min(100, Number(options.percent)));
        barEl.style.width = `${percent}%`;
        if (percentEl) percentEl.innerText = `${Math.round(percent)}%`;
    }
}

function hideProgressOverlay() {
    const loader = document.getElementById('global-loader');
    if (!loader) return;
    loader.style.opacity = '0';
    setTimeout(() => {
        loader.style.display = 'none';
        loader.innerHTML = '';
    }, 180);
}

/**
 * Sayfalama düğmelerini oluşturur ve bir container'a ekler (İleri/Geri kompakt versiyon).
 * @param {HTMLElement} container
 * @param {number} totalItems
 * @param {number} currentPage
 * @param {number} itemsPerPage
 * @param {function(number)} onPageChange
 */
function renderPagination(container, totalItems, currentPage, itemsPerPage, onPageChange, options = {}) {
    container.innerHTML = '';
    container.classList.remove('inline-pagination-toolbar', 'compact-pagination-toolbar', 'sticky-toolbar');
    container.classList.add('pagination-toolbar');
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages <= 1) {
        container.style.display = 'none';
        return;
    }

    const isInlineToolbar = Boolean(container.closest('.list-toolbar-right'));
    const isCompactToolbar = options.compact === true;
    if (isInlineToolbar) {
        container.classList.add('inline-pagination-toolbar');
    } else if (isCompactToolbar) {
        container.classList.add('compact-pagination-toolbar');
    } else {
        container.classList.add('sticky-toolbar');
    }

    container.style.display = 'flex';
    container.style.justifyContent = (isInlineToolbar || isCompactToolbar) ? 'flex-end' : 'space-between';
    container.style.alignItems = 'center';
    container.style.gap = '10px';
    container.style.padding = (isInlineToolbar || isCompactToolbar) ? '0' : '10px 14px';
    container.style.margin = '0';
    const resultLabel = options.resultLabel || 'kayıt';

    const controls = document.createElement('div');
    controls.className = 'pagination-controls';

    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = '‹ Önce';
    prevBtn.style.cssText = 'min-width:88px; height:34px; padding:0 12px; border-radius:999px; border:1px solid #dbe3ee; background:#fff; color:#475569; display:flex; align-items:center; justify-content:center; cursor:pointer; font-weight:700; font-size:12px; transition:all 0.2s ease; box-shadow:0 3px 8px rgba(15,23,42,0.04);';
    prevBtn.onmouseover = () => { if(!prevBtn.disabled) { prevBtn.style.borderColor = '#0f766e'; prevBtn.style.color = '#0f766e'; prevBtn.style.transform = 'translateY(-1px)'; } };
    prevBtn.onmouseout = () => { if(!prevBtn.disabled) { prevBtn.style.borderColor = '#dbe3ee'; prevBtn.style.color = '#475569'; prevBtn.style.transform = 'translateY(0)'; } };

    if (currentPage <= 1) {
        prevBtn.disabled = true;
        prevBtn.style.opacity = '0.45';
        prevBtn.style.cursor = 'not-allowed';
    } else {
        prevBtn.onclick = () => onPageChange(currentPage - 1);
    }

    const infoSpan = document.createElement('div');
    infoSpan.style.cssText = 'background:linear-gradient(180deg,#f8fafc,#eef4fb); padding:8px 14px; border-radius:999px; font-size:12px; font-weight:800; color:#334155; user-select:none; border:1px solid #dbe3ee; box-shadow:inset 0 1px 1px rgba(255,255,255,0.7); white-space:nowrap;';
    if (isInlineToolbar || isCompactToolbar) {
        infoSpan.innerHTML = `<strong style="color:#0f172a; font-size:12px; margin-right:6px;">${totalItems}</strong> ${resultLabel} <span style="color:#94a3b8; margin:0 6px;">•</span> <span style="color:#0f766e; font-size:13px; margin:0 2px;">${currentPage}</span> / <span style="margin:0 2px;">${totalPages}</span>`;
    } else {
        infoSpan.innerHTML = `<span style="color:#0f766e; font-size:13px; margin:0 2px;">${currentPage}</span> / <span style="margin:0 2px;">${totalPages}</span>`;
    }

    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = 'Sonra ›';
    nextBtn.style.cssText = 'min-width:88px; height:34px; padding:0 12px; border-radius:999px; border:1px solid #dbe3ee; background:#fff; color:#475569; display:flex; align-items:center; justify-content:center; cursor:pointer; font-weight:700; font-size:12px; transition:all 0.2s ease; box-shadow:0 3px 8px rgba(15,23,42,0.04);';
    nextBtn.onmouseover = () => { if(!nextBtn.disabled) { nextBtn.style.borderColor = '#0f766e'; nextBtn.style.color = '#0f766e'; nextBtn.style.transform = 'translateY(-1px)'; } };
    nextBtn.onmouseout = () => { if(!nextBtn.disabled) { nextBtn.style.borderColor = '#dbe3ee'; nextBtn.style.color = '#475569'; nextBtn.style.transform = 'translateY(0)'; } };

    if (currentPage >= totalPages) {
        nextBtn.disabled = true;
        nextBtn.style.opacity = '0.45';
        nextBtn.style.cursor = 'not-allowed';
    } else {
        nextBtn.onclick = () => onPageChange(currentPage + 1);
    }

    controls.appendChild(prevBtn);
    controls.appendChild(infoSpan);
    controls.appendChild(nextBtn);
    if (!isInlineToolbar && !isCompactToolbar) {
        const summaryBlock = document.createElement('div');
        summaryBlock.className = 'pagination-summary';
        summaryBlock.innerHTML = `<strong>${totalItems}</strong> ${resultLabel} <span>•</span> Sayfa <strong>${currentPage}</strong> / ${totalPages}`;
        container.appendChild(summaryBlock);
    }
    container.appendChild(controls);
}

/**
 * Pagination container'ını ID'ye göre bulur veya oluşturur.
 */
function getOrCreatePaginationContainer(id, anchorEl, position = 'after') {
    let el = document.getElementById(id);
    if (!el) {
        el = document.createElement('div');
        el.id = id;
        el.className = 'pagination-container';
        if (anchorEl && anchorEl.parentNode) {
            if (position === 'before') {
                anchorEl.parentNode.insertBefore(el, anchorEl);
            } else {
                anchorEl.parentNode.insertBefore(el, anchorEl.nextSibling);
            }
        }
    } else if (anchorEl && anchorEl.parentNode && !el.parentNode) {
        if (position === 'before') {
            anchorEl.parentNode.insertBefore(el, anchorEl);
        } else {
            anchorEl.parentNode.insertBefore(el, anchorEl.nextSibling);
        }
    }
    return el;
}

/**
 * Custom Multi-Select Dropdown işlemleri
 */
function toggleCustomSelect(wrapId) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    const opts = wrap.querySelector('.custom-select-options');
    if (opts) opts.classList.toggle('open');
}

function updateCustomSelect(wrapId, checkboxEl) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    const optsWrapper = wrap.querySelector('.dynamic-opts');
    const checkboxes = optsWrapper.querySelectorAll('input[type="checkbox"]');
    
    // Asıl <select multiple> elementini bul ve güncelle
    const selectId = wrapId.replace('wrap_', '');
    const realSelect = document.getElementById(selectId);
    if (realSelect) {
        Array.from(realSelect.options).forEach(opt => {
            if (opt.value === checkboxEl.value) {
                opt.selected = checkboxEl.checked;
            }
        });
    }

    // Tümü seçili mi kontrolü
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    const allCb = wrap.querySelector('[id^="all_"]');
    if (allCb) allCb.checked = allChecked;

    _updateCustomSelectText(wrapId);
}

function toggleAllCustomSelect(wrapId, allCb) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    const optsWrapper = wrap.querySelector('.dynamic-opts');
    const checkboxes = optsWrapper.querySelectorAll('input[type="checkbox"]');
    
    const selectId = wrapId.replace('wrap_', '');
    const realSelect = document.getElementById(selectId);

    checkboxes.forEach(cb => {
        cb.checked = allCb.checked;
        if (realSelect) {
            Array.from(realSelect.options).forEach(opt => {
                if (opt.value === cb.value) opt.selected = allCb.checked;
            });
        }
    });

    _updateCustomSelectText(wrapId);
    if (window.updateTargetLiveCount) window.updateTargetLiveCount();
}

function _updateCustomSelectText(wrapId) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    const optsWrapper = wrap.querySelector('.dynamic-opts');
    const checkboxes = optsWrapper.querySelectorAll('input[type="checkbox"]');
    const selected = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
    
    const headerText = wrap.querySelector('.selected-text');
    if (!headerText) return;

    if (selected.length === 0) {
        headerText.innerText = 'Seçiniz';
    } else if (selected.length === checkboxes.length && checkboxes.length > 0) {
        headerText.innerText = 'Tümü Seçili';
    } else if (selected.length <= 2) {
        headerText.innerText = selected.join(', ');
    } else {
        headerText.innerText = `${selected.length} Kategori Seçili`;
    }
}

// Custom Select kapatma olayı (Dışarı tıklayınca)
document.addEventListener('click', (e) => {
    const selects = document.querySelectorAll('.custom-select-wrapper');
    selects.forEach(wrap => {
        if (!wrap.contains(e.target)) {
            const opts = wrap.querySelector('.custom-select-options');
            if (opts) opts.classList.remove('open');
        }
    });
});

// Global erişim — modal yardımcıları HTML'den doğrudan çağrılır
window.closeModal = closeModal;
window.closeModalOnOutsideClick = closeModalOnOutsideClick;
window.toggleCustomSelect = toggleCustomSelect;
window.updateCustomSelect = updateCustomSelect;
window.toggleAllCustomSelect = toggleAllCustomSelect;
