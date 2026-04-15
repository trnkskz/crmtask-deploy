// ============================================================
// controllers/authController.js
// API tabanli oturum acma, kapatma ve kullanici dogrulama islemleri
// ============================================================

const AuthController = (() => {
    const LOGIN_SHOWCASE_MESSAGES = [
        {
            title: 'Bugün ilk 30 dakikada sıcak fırsatları ayırın, günü daha kontrollü açın.',
            copy: 'Önce hızlı kapanma ihtimali yüksek işletmeleri filtreleyin, ardından takip tarihi yaklaşan görevleri tek akışta temizleyin.',
            tip: 'Kararsız müşteride ürün anlatmadan önce ihtiyaç cümlesini netleştirmek dönüşüm oranını yükseltir.',
            pills: ['İlk arama: sıcak liste', 'İkinci odak: takipler', 'Son kontrol: not disiplini'],
        },
        {
            title: 'Yeni kayıtta hız kazanmak için ilk görüşmede eksik veri değil, net sonraki adım bırakın.',
            copy: 'Telefon, karar verici ve sonraki arama nedeni netse ekip devri de raporlama da çok daha sorunsuz ilerler.',
            tip: 'Bir görüşmeyi başarılı yapan şey her zaman uzun konuşma değil, net sonraki aksiyondur.',
            pills: ['Kısa ve net not', 'Yetkiliyi sabitle', 'Sonraki tarihi kilitle'],
        },
        {
            title: 'Takip listesi düzenli temizlendikçe ekip ritmi ve kapanış kalitesi birlikte yükselir.',
            copy: 'Takipte bekleyenleri gün içinde iki kez tarayıp gecikenleri öne almak, açık görev baskısını gözle görülür şekilde azaltır.',
            tip: 'Takip tarihi geçen her kayıt, yeni sıcak fırsattan daha pahalı bir kayıp yaratabilir.',
            pills: ['Gecikenleri öne çek', 'Boşta kayıt bırakma', 'Takvimi gün içinde iki kez tara'],
        },
        {
            title: 'Güçlü satışçı sadece arama yapmaz, pipeline görünürlüğünü de düzenli tutar.',
            copy: 'Hot, Not Hot ve Takip akışları net ayrıldığında yönetici ekibi daha rahat destekler ve dağıtım daha adil ilerler.',
            tip: 'Statü doğruysa ekip yardımı hızlanır; belirsiz statü operasyonu yavaşlatır.',
            pills: ['Hot’u net işle', 'Not Hot’u geciktirme', 'Durumu aynı gün kapat'],
        },
    ];
    let loginShowcaseInterval = null;

    function getApiBase() {
        return window.__API_BASE_URL__ || 'http://localhost:3001/api';
    }

    function mapRole(role) {
        switch ((role || '').toUpperCase()) {
            case 'ADMIN':
            case 'MANAGER':
                return USER_ROLES.MANAGER;
            case 'TEAM_LEADER':
                return USER_ROLES.TEAM_LEAD;
            case 'SALESPERSON':
            default:
                return USER_ROLES.SALES_REP;
        }
    }

    function normalizeUser(apiUser) {
        const name = apiUser?.name || apiUser?.email || 'Kullanıcı';
        const apiRole = apiUser?.role || null;
        const team = (String(apiRole || '').toUpperCase() === 'ADMIN' || String(apiRole || '').toUpperCase() === 'MANAGER')
            ? '-'
            : (apiUser?.team || '-');
        return {
            id: apiUser?.id || '',
            name,
            email: apiUser?.email || '',
            role: mapRole(apiUser?.role),
            status: 'Aktif',
            team,
            phone: apiUser?.phone || '',
            settings: (apiUser?.settings && typeof apiUser.settings === 'object') ? apiUser.settings : undefined,
            _apiRole: apiRole,
        };
    }

    async function apiRequest(path, init = {}) {
        const token = localStorage.getItem('accessToken');
        const headers = {
            'Content-Type': 'application/json',
            ...(init.headers || {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };

        const response = await fetch(`${getApiBase()}${path}`, {
            ...init,
            headers,
            credentials: 'include',
        });

        let payload = null;
        const text = await response.text();
        if (text) {
            try {
                payload = JSON.parse(text);
            } catch {
                payload = { message: text };
            }
        }

        if (!response.ok) {
            const message =
                payload?.message ||
                payload?.error?.message ||
                payload?.error?.details?.message ||
                (typeof payload?.error === 'string' ? payload.error : null) ||
                `HTTP ${response.status}`;
            throw new Error(message);
        }

        return payload;
    }

    function getFriendlyLoginErrorMessage(err) {
        const raw = String(err?.message || '').trim();
        const normalized = raw.toLowerCase();
        if (!raw) return 'Giriş sırasında bir hata oluştu.';
        if (normalized.includes('invalid credentials')) return 'E-posta veya şifre hatalı.';
        if (normalized.includes('unauthorized')) return 'E-posta veya şifre hatalı.';
        return raw;
    }

    function hideLoader() {
        ['global-loader', 'loadingScreen'].forEach((loaderId) => {
            const loader = document.getElementById(loaderId);
            if (!loader) return;
            loader.style.opacity = '0';
            setTimeout(() => {
                loader.style.display = 'none';
            }, 500);
        });
    }

    async function restoreSession() {
        const accessToken = localStorage.getItem('accessToken');

        if (accessToken) {
            try {
                const me = await apiRequest('/auth/me', { method: 'GET' });
                if (me?.user) {
                    const normalized = normalizeUser(me.user);
                    AppState.loggedInUser = normalized;
                    return normalized;
                }
            } catch (e) {
                console.warn("Otomatik oturum açma başarısız, token temizleniyor:", e);
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
            }
        }
        AppState.loggedInUser = null;
        return null;
    }

    function showLogin() {
        const wrap = document.getElementById('login-wrapper');
        if (wrap) wrap.style.display = 'flex';
        startLoginShowcaseRotation();
    }

    function renderLoginShowcaseMessage(item) {
        if (!item) return;
        const titleEl = document.getElementById('loginShowcaseTitle');
        const copyEl = document.getElementById('loginShowcaseCopy');
        const tipEl = document.getElementById('loginShowcaseTip');
        const pillOneEl = document.getElementById('loginShowcasePillOne');
        const pillTwoEl = document.getElementById('loginShowcasePillTwo');
        const pillThreeEl = document.getElementById('loginShowcasePillThree');

        if (titleEl) titleEl.textContent = item.title;
        if (copyEl) copyEl.textContent = item.copy;
        if (tipEl) tipEl.textContent = item.tip;
        if (pillOneEl) pillOneEl.textContent = item.pills?.[0] || '';
        if (pillTwoEl) pillTwoEl.textContent = item.pills?.[1] || '';
        if (pillThreeEl) pillThreeEl.textContent = item.pills?.[2] || '';
    }

    function startLoginShowcaseRotation() {
        if (loginShowcaseInterval) {
            clearInterval(loginShowcaseInterval);
            loginShowcaseInterval = null;
        }

        if (!LOGIN_SHOWCASE_MESSAGES.length) return;
        if (!document.getElementById('loginShowcaseTitle')) return;

        let activeIndex = 0;
        renderLoginShowcaseMessage(LOGIN_SHOWCASE_MESSAGES[activeIndex]);
        loginShowcaseInterval = setInterval(() => {
            activeIndex = (activeIndex + 1) % LOGIN_SHOWCASE_MESSAGES.length;
            renderLoginShowcaseMessage(LOGIN_SHOWCASE_MESSAGES[activeIndex]);
        }, 9800);
    }

    async function onSystemReady() {
        const user = await restoreSession();
        if (user) {
            const shellRestored = typeof SyncService !== 'undefined' && typeof SyncService.restoreCachedShell === 'function'
                ? await SyncService.restoreCachedShell()
                : false;
            if (shellRestored) {
                hideLoader();
                AppController.init();
            }
            if (typeof SyncService !== 'undefined' && typeof SyncService.bootstrapFullSync === 'function') {
                if (shellRestored) {
                    SyncService.bootstrapFullSync().catch((err) => console.warn('Deferred bootstrap sync failed:', err));
                } else {
                    await SyncService.bootstrapFullSync();
                }
            }
            if (!shellRestored) {
                hideLoader();
                AppController.init();
            }
            return user;
        }
        hideLoader();
        showLogin();
        return null;
    }

    function bindLoginForm() {
        const form = document.getElementById('loginForm');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button[type="submit"]');
            const originalBtnText = btn ? btn.innerText : 'Giriş Yap';
            
            const emailInput = document.getElementById('loginEmail');
            const passwordInput = document.getElementById('loginPassword');
            const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
            const password = passwordInput ? passwordInput.value : '';

            // UI'ı kilitle (Loading state)
            if (btn) {
                btn.disabled = true;
                btn.innerText = 'Giriş Yapılıyor...';
            }

            try {
                // apiRequest yardımcı fonksiyonumuz /auth/login'e POST atıyor
                const result = await apiRequest('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({ email, password }),
                });

                if (result?.requiresTwoFactor) {
                    if(btn) { btn.disabled = false; btn.innerText = originalBtnText; }
                    return showToast('2FA etkin kullanıcı için doğrulama adımı gerekiyor.', 'info');
                }

                if (!result?.accessToken) {
                    throw new Error('Geçersiz sunucu yanıtı: accessToken bulunamadı.');
                }

                // API Başarılı: Token kaydetme
                localStorage.setItem('accessToken', result.accessToken);
                if (result.refreshToken) localStorage.setItem('refreshToken', result.refreshToken);

                // Kullanıcı objesini locale kaydet ve sistemi başlat
                const normalized = normalizeUser(result.user);
                AppState.loggedInUser = normalized;
                const shellRestored = typeof SyncService !== 'undefined' && typeof SyncService.restoreCachedShell === 'function'
                    ? await SyncService.restoreCachedShell()
                    : false;
                if (shellRestored) {
                    hideLoader();
                    AppController.init();
                }
                if (typeof SyncService !== 'undefined' && typeof SyncService.bootstrapFullSync === 'function') {
                    if (shellRestored) {
                        SyncService.bootstrapFullSync().catch((err) => console.warn('Deferred bootstrap sync failed:', err));
                    } else {
                        await SyncService.bootstrapFullSync();
                    }
                }

                if (!shellRestored) {
                    hideLoader();
                    AppController.init();
                }
            } catch (err) {
                const friendlyMessage = getFriendlyLoginErrorMessage(err);
                const isExpectedAuthError = friendlyMessage === 'E-posta veya şifre hatalı.';
                if (!isExpectedAuthError) {
                    console.error("Giriş hatası:", err);
                }
                showToast(`Giriş başarısız: ${friendlyMessage}`, 'error');
                if (btn) {
                    btn.disabled = false;
                    btn.innerText = originalBtnText;
                }
            }
        });
    }

    async function logout() {
        const refreshToken = localStorage.getItem('refreshToken');
        try {
            // İsteğe bağlı backend logout bildirimi (best-effort)
            await apiRequest('/auth/logout', {
                method: 'POST',
                body: JSON.stringify({ refreshToken: refreshToken || undefined }),
            });
        } catch (e) {
            console.warn("Backend logout failed, ignoring...", e);
        }

        // Lokal verileri kesin kez temizle
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        AppState.resetSession();

        const appSec = document.getElementById('app-section');
        if (appSec) appSec.style.display = 'none';

        const loader = document.getElementById('loadingScreen');
        if (loader) {
            loader.style.display = 'flex';
            loader.style.opacity = '1';
        }

        // Çıkış yapıldığında sayfayı yeniden yükle
        location.reload();
    }

    function logoutAndForget() {
        localStorage.removeItem('saved_email');
        return logout();
    }

    return {
        restoreSession,
        onSystemReady,
        bindLoginForm,
        logout,
        logoutAndForget,
    };
})();

window.logout = AuthController.logout.bind(AuthController);
window.logoutAndForget = AuthController.logoutAndForget.bind(AuthController);
