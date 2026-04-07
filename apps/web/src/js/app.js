// ============================================================
// app.js
// Uygulama giriş noktası — tüm modüller yüklendikten sonra
// sistem başlatılır. Ayrıca orijinal script.js'den taşınmayan
// fonksiyon referanslarını bridge eder.
// ============================================================

// --- Flatpickr Entegrasyonu ---

window.initFlatpickr = function() {
    const input = document.getElementById('flatpickrInput');
    if (!input) return;
    if (window.fpInstance) { window.fpInstance.destroy(); window.fpInstance = null; }
    window.fpInstance = flatpickr(input, {
        locale: 'tr',
        enableTime: true,
        dateFormat: 'Y-m-d H:i',
        minDate: 'today',
        time_24hr: true,
        onChange: function(selectedDates, dateStr) {
            const dtContainer = document.getElementById('dateTimePickerContainer');
            if (dtContainer && dateStr) dtContainer.querySelector('span').style.color = 'var(--success-color)';
            if (typeof window.refreshFollowupSummary === 'function') {
                window.refreshFollowupSummary(dateStr || selectedDates?.[0] || '');
            }
        }
    });
    if (typeof window.refreshFollowupSummary === 'function') {
        window.refreshFollowupSummary(input.value || '');
    }
};

// --- AppController renderDashboard bağlantısı ---
// DashboardController, dashboardController.js ile yüklenir.
// AppController.refreshCurrentView() çağrıldığında doğru render fonksiyonu çalışır.
// ProjectController ve BusinessController da kendi dosyalarından yüklenir.

// --- Sistem Başlatma ---
async function bootstrapApplication() {
    // Global tıklama dinleyicisi
    AppController.bindGlobalListeners();

    // Giriş formu
    AuthController.bindLoginForm();

    // Auth netlestikten sonra full snapshot bootstrap kosar.
    try {
        await AuthController.onSystemReady();
    } catch (err) {
        console.warn('Ilk bootstrap tamamlanamadi:', err);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapApplication, { once: true });
} else {
    bootstrapApplication();
}

// Havuz (Pool) sekme geçişlerindeki aktif radar butonunu günceller
window.updatePrtActive = function(clickedElement) {
    if (!clickedElement) return;
    
    // Tüm sekmelerden 'active' sınıfını temizle (Yeni Header Tab mantığına geçirildi)
    document.querySelectorAll('.header-tab-card').forEach(card => {
        card.classList.remove('active');
    });
    
    // Sadece tıklanan sekmeye 'active' sınıfını ekle
    clickedElement.classList.add('active');
};

// Sekmeler arası geçişlerde "Active" sınıfını günceller
window.updateGtActive = function(clickedElement) {
    if (!clickedElement) return;
    document.querySelectorAll('.gt-card').forEach(card => card.classList.remove('active'));
    clickedElement.classList.add('active');
};

// Sihirbazın (Slide-in Wizard) adım mantığı ve kaydırma animasyonu
window.nextNewBizStep = function(step) {
    // Üstteki başlık adımlarının renklerini güncelle
    document.querySelectorAll('.wz-step').forEach((el, index) => {
        if(index + 1 === step) el.classList.add('active');
        else el.classList.remove('active');
    });
    
    // Yeşil ilerleme çubuğunu (Progress Bar) uzat
    const progressBar = document.getElementById('newBizProgressBar');
    if(progressBar) progressBar.style.width = (step * 33.33) + '%';
    
    // Paneli sola doğru kaydır (TranslateX)
    const slider = document.getElementById('newBizWizardSlider');
    if(slider) {
        slider.style.transform = 'translateX(-' + ((step - 1) * 33.333) + '%)';
    }
};
