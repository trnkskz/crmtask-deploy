// ============================================================
// utils/helpers.js
// Saf yardımcı fonksiyonlar — yan etkisiz, test edilebilir
// ============================================================

/**
 * XSS önleyici: string içindeki tehlikeli HTML karakterlerini kaçar.
 */
function esc(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Tarayıcı WebCrypto API ile SHA-256, yoksa btoa fallback.
 */
async function hashPassword(password) {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
        const msgBuffer = new TextEncoder().encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return btoa(password).split('').reverse().join('');
}

/**
 * Türkçe locale ile "GG.AA.YYYY SS:DD" formatında tarih döndürür.
 */
function getCurrentDateStr() {
    return new Date().toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    }).replace(',', '');
}

/**
 * Timestamp'i göreli zamana (relative time) çevirir.
 */
function timeAgo(timeMs) {
    if (!timeMs) return '';
    const diff = Date.now() - timeMs;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Az önce';
    if (minutes < 60) return `${minutes} dakika önce`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} saat önce`;
    const days = Math.floor(hours / 24);
    return `${days} gün önce`;
}

/**
 * Görev durumunun "aktif" (açık) olup olmadığını kontrol eder.
 */
function isActiveTask(status) {
    return ACTIVE_STATUSES.includes(status);
}

/**
 * Log tarih stringini UNIX timestamp'e çevirir.
 * "GG.AA.YYYY SS:DD" ve ISO 8601 formatlarını destekler.
 */
function parseLogDate(dateStr) {
    if (!dateStr) return 0;
    try {
        if (dateStr.includes('T')) return new Date(dateStr).getTime();
        const parts = dateStr.split(' ');
        if (parts.length >= 1) {
            const d = parts[0].replace(/\//g, '.').split('.');
            if (d.length === 3) {
                const t = parts[1] ? parts[1].split(':') : [0, 0];
                return new Date(d[2], d[1] - 1, d[0], t[0] || 0, t[1] || 0).getTime();
            }
        }
        return new Date(dateStr).getTime() || 0;
    } catch (e) {
        return 0;
    }
}

/**
 * Verilen tarih stringinin bugüne ait olup olmadığını kontrol eder.
 */
function isToday(dateStr) {
    if (!dateStr) return false;
    const logTime = parseLogDate(dateStr);
    if (logTime === 0) return false;
    const d = new Date(logTime);
    const today = new Date();
    return d.getDate() === today.getDate()
        && d.getMonth() === today.getMonth()
        && d.getFullYear() === today.getFullYear();
}

/**
 * Çeşitli tarih formatlarını "GG.AA.YYYY SS:DD" şeklinde gösterir.
 */
function formatDate(dateString) {
    if (!dateString) return '-';

    // "YYYY-MM-DD HH:mm" → "DD.MM.YYYY HH:mm"
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(dateString)) {
        const [datePart, timePart] = dateString.split(' ');
        const [y, m, d] = datePart.split('-');
        return `${d}.${m}.${y} ${timePart}`;
    }

    // "YYYY-MM-DD" → "DD.MM.YYYY"
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        const [y, m, d] = dateString.split('-');
        return `${d}.${m}.${y}`;
    }

    const d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString);
    return d.toLocaleDateString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    }).replace(',', '');
}

/**
 * Her kelimenin ilk harfini büyük yapar.
 */
function toTitleCase(str) {
    return str.replace(/\w\S*/g, txt =>
        txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
}

/**
 * Süper akıllı metin normalize edici: Türkçe karakterleri İngilizce karşılıklarına çevirir.
 * ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u ve tüm alfanümerik olmayan karakterleri kaldırır.
 * Fuzzy arama için optimize edilmiştir.
 */
function normalizeText(str) {
    if (!str) return '';
    let s = str.toLocaleLowerCase('tr-TR');
    const map = { 'ç':'c', 'ğ':'g', 'ı':'i', 'i':'i', 'ö':'o', 'ş':'s', 'ü':'u' };
    s = s.replace(/[çğıiöşü]/g, m => map[m]);
    return s.replace(/[^a-z0-9]/g, '');
}

const PROJECT_MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function normalizeProjectMonth(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const normalized = normalizeText(raw);
    const match = PROJECT_MONTH_NAMES.find((monthName) => normalizeText(monthName) === normalized);
    return match || '';
}

function normalizeProjectYear(value) {
    const raw = String(value ?? '').trim();
    if (!/^\d{4}$/.test(raw)) return '';

    const year = Number(raw);
    return year >= 2000 && year <= 2100 ? raw : '';
}

function extractProjectPeriod(projectOrDescription) {
    const project = typeof projectOrDescription === 'string'
        ? { description: projectOrDescription }
        : (projectOrDescription || {});

    let month = normalizeProjectMonth(project.month || project.projectMonth);
    let year = normalizeProjectYear(project.year || project.projectYear);

    const description = String(project.description || '').trim();
    if (description && (!month || !year)) {
        if (!month) {
            month = PROJECT_MONTH_NAMES.find((monthName) =>
                new RegExp(`(^|[^a-zA-ZçğıöşüÇĞIİÖŞÜ])${monthName}([^a-zA-ZçğıöşüÇĞIİÖŞÜ]|$)`, 'i').test(description)
            ) || '';
        }

        if (!year) {
            const yearMatches = description.match(/\b\d{4}\b/g) || [];
            year = yearMatches.map(normalizeProjectYear).find(Boolean) || '';
        }
    }

    return {
        month,
        year,
        display: [month, year].filter(Boolean).join(' ').trim(),
    };
}

function formatProjectPeriod(projectOrDescription) {
    const period = extractProjectPeriod(projectOrDescription);
    return period.display || '-';
}

function isVisibleTaskListProjectTask(task) {
    if (!task) return false;
    if (typeof PASSIVE_STATUSES !== 'undefined' && PASSIVE_STATUSES.includes(task.status)) return false;
    if (task.status === 'pending_approval') return false;
    if (task.assignee === 'TARGET_POOL') return false;
    return Boolean(task.projectId);
}

function isCampaignUrlRequiredSource(sourceValue) {
    const raw = String(sourceValue || '').trim().toLocaleLowerCase('tr-TR');
    return raw === 'old account' || raw === 'old account query' || raw === 'rakip';
}

function syncCampaignUrlVisibility(sourceSelectId, groupId, inputId) {
    const sourceEl = document.getElementById(sourceSelectId);
    const groupEl = document.getElementById(groupId);
    const inputEl = document.getElementById(inputId);
    if (!sourceEl || !groupEl) return false;

    const shouldShow = isCampaignUrlRequiredSource(sourceEl.value);
    groupEl.style.display = shouldShow ? 'block' : 'none';
    if (!shouldShow && inputEl) inputEl.value = '';
    return shouldShow;
}

function resolveCanonicalCategory(mainCategory, subCategory, companyName = '') {
    const rawMain = String(mainCategory || '').trim();
    const rawSub = String(subCategory || '').trim();
    const textForMatch = `${rawMain} ${rawSub} ${companyName}`.toLocaleLowerCase('tr-TR');
    const fuzzyMatch = textForMatch
        .replace(/[ç]/g, 'c')
        .replace(/[ğ]/g, 'g')
        .replace(/[ı]/g, 'i')
        .replace(/[ö]/g, 'o')
        .replace(/[ş]/g, 's')
        .replace(/[ü]/g, 'u');

    let resolvedMain = rawMain || 'Diğer';
    let resolvedSub = rawSub || 'Belirtilmemiş';
    let matched = false;

    if (/masaj|spa|hamam|kese|wellness|refleksoloji|shiatsu/i.test(textForMatch)) {
        resolvedMain = 'Masaj - Spa (Core)';
        if (/bali/i.test(textForMatch)) resolvedSub = 'Bali Masajı';
        else if (/thai/i.test(textForMatch)) resolvedSub = 'Thai Masajı';
        else if (/isveç|isvec/i.test(fuzzyMatch)) resolvedSub = 'İsveç Masajı';
        else if (/köpük|kopuk|hamam/i.test(fuzzyMatch)) resolvedSub = 'Hamam';
        else if (/çift|cift/i.test(fuzzyMatch)) resolvedSub = 'Çift Masajı';
        else if (/otel/i.test(textForMatch)) resolvedSub = 'Otel Spa';
        else if (/aroma/i.test(textForMatch)) resolvedSub = 'Aromaterapi Masajı';
        else if (/bebek/i.test(textForMatch)) resolvedSub = 'Bebek Spa';
        else resolvedSub = 'Masaj';
        matched = true;
    } else if (/kahvaltı|brunch|kahvalti/i.test(fuzzyMatch)) {
        resolvedMain = 'Kahvaltı (Core)';
        if (/serpme/i.test(textForMatch)) resolvedSub = 'Serpme Kahvaltı';
        else if (/açık büfe|acik bufe/i.test(fuzzyMatch)) resolvedSub = 'Açık Büfe Kahvaltı';
        else if (/köy|koy/i.test(fuzzyMatch)) resolvedSub = 'Köy Kahvaltısı';
        else if (/boğaz|bogaz/i.test(fuzzyMatch)) resolvedSub = 'Boğazda Kahvaltı';
        else if (/tekne/i.test(textForMatch)) resolvedSub = 'Teknede Kahvaltı';
        else if (/otel/i.test(textForMatch)) resolvedSub = 'Otelde Kahvaltı';
        else if (/brunch/i.test(textForMatch)) resolvedSub = 'Brunch';
        else resolvedSub = 'Kahvaltı Tabağı';
        matched = true;
    } else if (/(iftar|ramazan)/i.test(textForMatch) && !/bayram/i.test(textForMatch)) {
        resolvedMain = 'İftar (Core)';
        if (/avrupa/i.test(textForMatch)) resolvedSub = 'Avrupa Yakası İftar';
        else if (/anadolu/i.test(textForMatch)) resolvedSub = 'Anadolu Yakası İftar';
        else if (/açık büfe|acik bufe/i.test(fuzzyMatch)) resolvedSub = 'Açık Büfe İftar';
        else if (/tekne/i.test(textForMatch)) resolvedSub = 'Teknede İftar';
        else if (/otel/i.test(textForMatch)) resolvedSub = 'Otelde İftar';
        else resolvedSub = 'Restoranda İftar';
        matched = true;
    } else if (/güzellik|guzellik|epilasyon|lazer|cilt|saç|sac|makyaj|botoks|zayıflama|zayiflama|incelme|pedikür|manikür|oje|nail|protez|biorezonans|solaryum/i.test(fuzzyMatch)) {
        resolvedMain = 'Güzellik (Core)';
        if (/epilasyon|lazer|ağda|agda/i.test(fuzzyMatch)) resolvedSub = 'Epilasyon - Ağda';
        else if (/cilt|yüz/i.test(textForMatch)) resolvedSub = 'Cilt Bakımı';
        else if (/saç|sac|makyaj/i.test(fuzzyMatch)) resolvedSub = 'Saç - Makyaj';
        else if (/zayıflama|zayiflama|incelme/i.test(fuzzyMatch)) resolvedSub = 'Zayıflama';
        else if (/manikür|pedikür|tırnak|oje|nail|protez/i.test(fuzzyMatch)) resolvedSub = 'Manikür - Pedikür';
        else if (/biorezonans/i.test(textForMatch)) resolvedSub = 'Biorezonans';
        else if (/botoks|dolgu/i.test(textForMatch)) resolvedSub = 'Botoks - Dolgu';
        else if (/solaryum/i.test(textForMatch)) resolvedSub = 'Solaryum';
        else resolvedSub = 'Cilt Bakımı';
        matched = true;
    } else if (/spor|fitness|gym|yoga|pilates|yüzme|yuzme|kurs|eğitim|egitim|dans|gelişim|gelisim|atölye|atolye/i.test(fuzzyMatch)) {
        resolvedMain = 'Spor - Eğitim - Kurs (Core)';
        if (/yoga|nefes/i.test(textForMatch)) resolvedSub = 'Yoga - Nefes Terapisi';
        else if (/pilates/i.test(textForMatch)) resolvedSub = 'Pilates';
        else if (/fitness|gym/i.test(textForMatch)) resolvedSub = 'Fitness - Gym';
        else if (/dans|müzik|muzik/i.test(fuzzyMatch)) resolvedSub = 'Dans - Müzik';
        else if (/dil/i.test(textForMatch)) resolvedSub = 'Dil Eğitimi';
        else if (/yüzme|yuzme/i.test(fuzzyMatch)) resolvedSub = 'Yüzme Kursu';
        else if (/anaokulu|çocuk|cocuk/i.test(fuzzyMatch)) resolvedSub = 'Anaokulu - Çocuk';
        else if (/online/i.test(textForMatch)) resolvedSub = 'Online Kurslar';
        else resolvedSub = 'Atölye';
        matched = true;
    } else if (/bilet|tiyatro|konser|sinema|sergi|müze|muze|akvaryum/i.test(fuzzyMatch)) {
        resolvedMain = 'Bilet - Etkinlik (Core)';
        if (/çocuk|cocuk/i.test(fuzzyMatch) && /tiyatro|oyun/i.test(textForMatch)) resolvedSub = 'Çocuk Tiyatro';
        else if (/tiyatro/i.test(textForMatch)) resolvedSub = 'Tiyatro';
        else if (/konser/i.test(textForMatch)) resolvedSub = 'Konser';
        else if (/sinema/i.test(textForMatch)) resolvedSub = 'Sinema';
        else if (/akvaryum|tema park/i.test(textForMatch)) resolvedSub = 'Akvaryum - Tema Park';
        else if (/sergi|müze|muze/i.test(fuzzyMatch)) resolvedSub = 'Sergi - Müze';
        else if (/parti|festival/i.test(textForMatch)) resolvedSub = 'Parti - Festival';
        else resolvedSub = 'Gösteri - Müzikal';
        matched = true;
    } else if (/aktivite|eğlence|eglence|paintball|kaçış|kacis|havuz|su sporları|rafting|yamaç|yamac|binicilik|poligon/i.test(fuzzyMatch)) {
        resolvedMain = 'Aktivite - Eğlence (Core)';
        if (/paintball|poligon/i.test(textForMatch)) resolvedSub = 'Poligon - Paintball';
        else if (/kaçış|kacis|sanal|vr/i.test(fuzzyMatch)) resolvedSub = 'Sanal Gerçeklik - Kaçış';
        else if (/havuz|plaj/i.test(textForMatch)) resolvedSub = 'Havuz - Plaj';
        else if (/su sporları|su sporlari/i.test(fuzzyMatch)) resolvedSub = 'Su Sporları';
        else if (/rafting|yamaç|yamac/i.test(fuzzyMatch)) resolvedSub = 'Rafting - Yamaç Paraşütü';
        else if (/binicilik|at |parkur/i.test(textForMatch)) resolvedSub = 'Binicilik - Parkur';
        else resolvedSub = 'Eğlence Merkezi';
        matched = true;
    } else if (/hizmet|oto|araç|arac|temizleme|yıkama|yikama|kuru temizleme|sigorta|nakliye|fotoğraf|fotograf|vize/i.test(fuzzyMatch)) {
        resolvedMain = 'Hizmet (Core)';
        if (/araç|arac|kiralama|vize/i.test(fuzzyMatch)) resolvedSub = 'Araç Kiralama - Vize';
        else if (/ev hizmetleri/i.test(textForMatch)) resolvedSub = 'Ev Hizmetleri';
        else if (/hayvan|evcil|veteriner/i.test(textForMatch)) resolvedSub = 'Evcil Hayvan Hizmetleri';
        else if (/fotoğraf|fotograf/i.test(fuzzyMatch)) resolvedSub = 'Fotoğrafçılık - Baskı';
        else if (/kuru temizleme/i.test(textForMatch)) resolvedSub = 'Kuru Temizleme';
        else if (/sigorta/i.test(textForMatch)) resolvedSub = 'Sigorta';
        else if (/transfer|nakliye/i.test(textForMatch)) resolvedSub = 'Transfer - Nakliye';
        else resolvedSub = 'Oto Bakım';
        matched = true;
    } else if (/yılbaşı|yilbasi|yeniyıl|yeni yil/i.test(fuzzyMatch)) {
        resolvedMain = 'Yılbaşı (Core)';
        if (/tatil|otel|konaklama/i.test(textForMatch)) resolvedSub = 'Yılbaşı Tatili';
        else if (/tur/i.test(textForMatch)) resolvedSub = 'Yılbaşı Turları';
        else resolvedSub = 'Yılbaşı Eğlencesi';
        matched = true;
    } else if (/sevgililer günü|sevgililer gunu|14 şubat|14 subat/i.test(fuzzyMatch)) {
        resolvedMain = 'Sevgililer Günü (Core)';
        if (/konaklama|otel/i.test(textForMatch)) resolvedSub = 'Sevgililer Günü Konaklama';
        else if (/spa|masaj/i.test(textForMatch)) resolvedSub = 'Sevgililer Günü Spa';
        else if (/tur/i.test(textForMatch)) resolvedSub = 'Sevgililer Günü Tur';
        else if (/yemek|restoran/i.test(textForMatch)) resolvedSub = 'Sevgililer Günü Yemek';
        else if (/hediye/i.test(textForMatch)) resolvedSub = 'Sevgililer Günü Hediye';
        else resolvedSub = 'Sevgililer Günü Etkinlik';
        matched = true;
    } else if (/bayram/i.test(textForMatch) && /tur|tatil/i.test(textForMatch)) {
        resolvedMain = 'Bayram Turları (Travel)';
        if (/kurban/i.test(textForMatch)) resolvedSub = 'Kurban Bayramı Turları';
        else resolvedSub = 'Ramazan Bayramı Turları';
        matched = true;
    } else if (/özel günler|ozel gunler|anneler günü|anneler gunu|kadınlar günü|kadinlar gunu|bayram|cuma/i.test(fuzzyMatch) && !/tur/i.test(textForMatch)) {
        resolvedMain = 'Özel Günler (Core)';
        if (/anneler/i.test(textForMatch)) resolvedSub = 'Anneler Günü';
        else if (/kadınlar|kadinlar/i.test(fuzzyMatch)) resolvedSub = 'Kadınlar Günü';
        else if (/bayram/i.test(textForMatch)) resolvedSub = 'Bayram';
        else if (/cuma/i.test(textForMatch)) resolvedSub = 'Harika Cuma';
        else resolvedSub = 'Özel Günler (Core)';
        matched = true;
    } else if (/tatil otelleri|akdeniz|ege|marmara|karadeniz|iç anadolu|ic anadolu/i.test(fuzzyMatch)) {
        resolvedMain = 'Tatil Otelleri (Travel)';
        if (/akdeniz/i.test(textForMatch)) resolvedSub = 'Akdeniz Bölgesi';
        else if (/ege/i.test(textForMatch)) resolvedSub = 'Ege Bölgesi';
        else if (/karadeniz/i.test(textForMatch)) resolvedSub = 'Karadeniz Bölgesi';
        else if (/marmara/i.test(textForMatch)) resolvedSub = 'Marmara Bölgesi';
        else resolvedSub = 'İç Anadolu Bölgesi';
        matched = true;
    } else if (/yurt\s?içi otel|yurt\s?ici otel|otel|konaklama/i.test(fuzzyMatch) && !/yurt\s?dışı|yurt\s?disi|kıbrıs|kibris/i.test(fuzzyMatch)) {
        resolvedMain = 'Yurtiçi Otel (Travel)';
        if (/istanbul/i.test(textForMatch)) resolvedSub = 'İstanbul Otelleri';
        else if (/ankara/i.test(textForMatch)) resolvedSub = 'Ankara Otelleri';
        else if (/antalya/i.test(textForMatch)) resolvedSub = 'Antalya Otelleri';
        else if (/bursa/i.test(textForMatch)) resolvedSub = 'Bursa Otelleri';
        else if (/izmir/i.test(textForMatch)) resolvedSub = 'İzmir Otelleri';
        else if (/termal/i.test(textForMatch)) resolvedSub = 'Yurtiçi Termal Otel';
        else resolvedSub = 'Diğer Kentler';
        matched = true;
    } else if (/yurt\s?içi tur|yurt\s?ici tur|tur/i.test(fuzzyMatch) && !/yurt\s?dışı|yurt\s?disi|kıbrıs|kibris|bayram|yılbaşı|yilbasi/i.test(fuzzyMatch)) {
        resolvedMain = 'Yurtiçi Turlar (Travel)';
        if (/günübirlik|gunubirlik/i.test(fuzzyMatch)) resolvedSub = 'Günübirlik Turlar';
        else if (/hafta\s?sonu/i.test(textForMatch)) resolvedSub = 'Haftasonu Turları';
        else if (/kapadokya/i.test(textForMatch)) resolvedSub = 'Kapadokya Turları';
        else if (/karadeniz/i.test(textForMatch)) resolvedSub = 'Karadeniz Turları';
        else if (/kayak|kış|kis/i.test(fuzzyMatch)) resolvedSub = 'Kayak Turları';
        else if (/kültür|kultur/i.test(fuzzyMatch)) resolvedSub = 'Kültür Turları';
        else if (/mavi yolculuk/i.test(textForMatch)) resolvedSub = 'Mavi Yolculuk';
        else resolvedSub = 'Yurtiçi Paket Tur';
        matched = true;
    } else if (/yurt\s?dışı|yurt\s?disi|kıbrıs|kibris|vizesiz|afrika|amerika|asya|avrupa|balkanlar|uzak\s?doğu|uzak\s?dogu|italya|fransa|ispanya|paris|roma|mısır|dubai|yunanistan/i.test(fuzzyMatch)) {
        resolvedMain = 'Yurtdışı Turlar (Travel)';
        if (/kıbrıs|kibris/i.test(fuzzyMatch)) resolvedSub = 'Kıbrıs Otel';
        else if (/vizesiz avrupa/i.test(textForMatch)) resolvedSub = 'Vizesiz Avrupa';
        else if (/vizesiz balkan/i.test(textForMatch)) resolvedSub = 'Vizesiz Balkanlar';
        else if (/avrupa|italya|fransa|ispanya|paris|roma|yunanistan/i.test(textForMatch)) resolvedSub = 'Avrupa';
        else if (/balkanlar/i.test(textForMatch)) resolvedSub = 'Balkanlar ve Yunanistan';
        else if (/afrika|mısır|misir/i.test(fuzzyMatch)) resolvedSub = 'Afrika';
        else if (/amerika/i.test(textForMatch)) resolvedSub = 'Amerika';
        else if (/asya|dubai/i.test(textForMatch)) resolvedSub = 'Asya';
        else if (/uzak\s?doğu|uzak\s?dogu/i.test(fuzzyMatch)) resolvedSub = 'Uzakdoğu';
        else if (/otel/i.test(textForMatch)) resolvedSub = 'Yurtdışı Otel';
        else resolvedSub = 'Avrupa';
        matched = true;
    } else if (/yemek|restoran|pizza|pide|burger|kebap|et |steak|meyhane|suşi|sushi|fast food|tatlı|tatli|kahve|cafe|kafe/i.test(fuzzyMatch)) {
        resolvedMain = 'Yemek (Core)';
        if (/fast|burger|pizza|pide/i.test(textForMatch)) resolvedSub = 'Fast Food';
        else if (/mangal|steak|et /i.test(textForMatch)) resolvedSub = 'Mangal - Steakhouse';
        else if (/meyhane|fasıl|fasil/i.test(fuzzyMatch)) resolvedSub = 'Meyhane - Fasıl';
        else if (/tatlı|tatli|kahve|fırın|firin|cafe|kafe/i.test(fuzzyMatch)) resolvedSub = 'Kahve - Fırın - Tatlı';
        else if (/dünya mutfağı|dunya mutfagi|sushi|suşi/i.test(fuzzyMatch)) resolvedSub = 'Dünya Mutfağı';
        else if (/türk mutfağı|turk mutfagi/i.test(fuzzyMatch)) resolvedSub = 'Türk Mutfağı';
        else if (/tekne/i.test(textForMatch)) resolvedSub = 'Tekne';
        else resolvedSub = 'Akşam Yemeği';
        matched = true;
    }

    return { mainCategory: resolvedMain, subCategory: resolvedSub, matched };
}

function matchesCategoryFilter(taskLike, mainFilter, subFilter, companyName = '') {
    if (!mainFilter && !subFilter) return true;
    const resolved = resolveCanonicalCategory(taskLike?.mainCategory, taskLike?.subCategory, companyName);
    if (mainFilter && resolved.mainCategory !== mainFilter) return false;
    if (subFilter && resolved.subCategory !== subFilter) return false;
    return true;
}

function normalizeTaskSourceKey(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) return '';
    if (raw.includes('OLD ACCOUNT RAKIP') || raw.includes('OLD_RAKIP')) return 'OLD_RAKIP';
    if (raw.includes('OLD ACCOUNT QUERY') || raw.includes('OLD_QUERY')) return 'OLD_QUERY';
    if (raw === 'QUERY' || raw.startsWith('QUERY ') || raw.includes(' QUERY') || raw.includes('QUERY/')) return 'QUERY';
    if (raw.includes('LEAD')) return 'LEAD';
    if (raw.includes('RAKIP')) return 'RAKIP';
    if (raw.includes('REFERANS')) return 'REFERANS';
    if (raw.includes('OLD')) return 'OLD';
    if (raw.includes('FRESH')) return 'FRESH';
    return raw;
}

function getTaskSourceLabel(value) {
    const raw = normalizeTaskSourceKey(value);
    if (!raw) return '-';
    if (raw === 'OLD_RAKIP') return 'Old Account Rakip';
    if (raw === 'OLD_QUERY') return 'Old Account Query';
    if (raw === 'QUERY') return 'Query';
    if (raw === 'LEAD') return 'Lead';
    if (raw === 'RAKIP') return 'Rakip';
    if (raw === 'REFERANS') return 'Referans';
    if (raw === 'OLD') return 'Old Account';
    if (raw === 'FRESH') return 'Fresh Account';
    return String(value || '-');
}

function normalizeTaskStatusKey(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) return '';
    if (raw === 'NOT_HOT' || raw === 'NOTHOT') return 'nothot';
    if (raw === 'FOLLOWUP' || raw === 'FOLLOW_UP') return 'followup';
    return raw.toLowerCase();
}

function getTaskStatusLabel(value) {
    const key = normalizeTaskStatusKey(value);
    return TASK_STATUS_LABELS[key] || String(value || '-');
}

function matchesTaskHistoryCategoryFilter(taskList, mainFilters, subFilters, companyName = '') {
    const mainList = Array.isArray(mainFilters)
        ? mainFilters.filter(Boolean)
        : [mainFilters].filter(Boolean);
    const subList = Array.isArray(subFilters)
        ? subFilters.filter(Boolean)
        : [subFilters].filter(Boolean);

    if (mainList.length === 0 && subList.length === 0) return true;
    const tasks = Array.isArray(taskList) ? taskList : [];

    return tasks.some((task) => {
        const mainMatched = mainList.length === 0
            ? true
            : mainList.some((mainFilter) => matchesCategoryFilter(task, mainFilter, '', companyName));
        if (!mainMatched) return false;

        const subMatched = subList.length === 0
            ? true
            : subList.some((subFilter) => matchesCategoryFilter(task, '', subFilter, companyName));
        return subMatched;
    });
}

function getTaskEffectiveTimestamp(task) {
    const latestLogDate = Array.isArray(task?.logs)
        ? task.logs
            .map((log) => parseLogDate(log?.date))
            .find((time) => Number.isFinite(time) && time > 0)
        : 0;
    if (latestLogDate) return latestLogDate;
    const createdAt = new Date(task?.createdAt || 0).getTime();
    return Number.isFinite(createdAt) ? createdAt : 0;
}

function getTaskUrgencyRank(task) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextCallDate = task?.nextCallDate ? new Date(task.nextCallDate) : null;
    const isOverdueFollowup = task?.status === 'followup' && nextCallDate && nextCallDate <= today;
    if (isOverdueFollowup) return 0;
    return 1;
}

function compareTasksByMode(a, b, mode = 'newest') {
    const urgencyA = getTaskUrgencyRank(a);
    const urgencyB = getTaskUrgencyRank(b);
    if (urgencyA !== urgencyB) return urgencyA - urgencyB;

    const timeA = getTaskEffectiveTimestamp(a);
    const timeB = getTaskEffectiveTimestamp(b);
    if (timeA !== timeB) {
        return mode === 'oldest' ? timeA - timeB : timeB - timeA;
    }

    const statusPriority = { new: 1, hot: 2, nothot: 3, followup: 4 };
    const statusA = statusPriority[a?.status] || 99;
    const statusB = statusPriority[b?.status] || 99;
    if (statusA !== statusB) return statusA - statusB;

    const nextCallA = a?.nextCallDate ? new Date(a.nextCallDate).getTime() : Number.MAX_SAFE_INTEGER;
    const nextCallB = b?.nextCallDate ? new Date(b.nextCallDate).getTime() : Number.MAX_SAFE_INTEGER;
    if (nextCallA !== nextCallB) return nextCallA - nextCallB;

    return String(a?.id || '').localeCompare(String(b?.id || ''), 'tr');
}

/**
 * Görevleri aciliyet + son işlem tarihine göre sıralar.
 * Sıra: vadesi geçmiş takip → yeni/eski işlem tarihi → durum önceliği
 */
function sortTasksByUrgency(a, b) {
    return compareTasksByMode(a, b, 'newest');
}

function sortTasksByUrgencyOldest(a, b) {
    return compareTasksByMode(a, b, 'oldest');
}

/**
 * Belirli gecikmeyle (ms) tetiklenen debounce fonksiyonu üretir.
 * Her çağrıda bağımsız timer — global çakışma yok.
 */
function createDebounce(func, delay = 400) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), delay);
    };
}

/**
 * Benzersiz ID üretir: timestamp + rastgele suffix.
 */
function generateId(prefix = '') {
    const rand = Math.random().toString(36).substring(2, 9);
    return `${prefix}${Date.now()}_${rand}`;
}

/**
 * Takım filtresi uygular: bireysel kullanıcı veya takım seçimi.
 */
function matchesAssigneeFilter(task, filter, users) {
    if (!filter) return true;
    const normalizeAssignee = (value) => String(value || '').trim().toLocaleLowerCase('tr-TR');
    const taskAssignees = [task?.assignee, task?.historicalAssignee].filter(Boolean);
    const usersList = Array.isArray(users) ? users : [];
    const isTeamLeadUser = (user) => {
        const normalizedRole = String(user?.role || '').trim().toLocaleUpperCase('tr-TR');
        return normalizedRole === 'TAKIM LIDERI' || normalizedRole === 'TEAM_LEADER';
    };

    if (filter === 'Team 1' || filter === 'Team 2') {
        const matchedUser = taskAssignees
            .map((assignee) => usersList.find((user) =>
                normalizeAssignee(user?.name) === normalizeAssignee(assignee)
                || normalizeAssignee(user?.id) === normalizeAssignee(assignee)
                || normalizeAssignee(user?.email) === normalizeAssignee(assignee)
            ))
            .find(Boolean);
        return matchedUser?.team === filter;
    }

    const normalizedFilter = normalizeAssignee(filter);
    if (taskAssignees.some((assignee) => normalizeAssignee(assignee) === normalizedFilter)) return true;

    const selectedUser = usersList.find((user) =>
        normalizeAssignee(user?.id) === normalizedFilter
        || normalizeAssignee(user?.name) === normalizedFilter
        || normalizeAssignee(user?.email) === normalizedFilter
    );
    if (!selectedUser) return false;
    if (isTeamLeadUser(selectedUser)) return false;

    return taskAssignees.some((assignee) => {
        const normalizedAssignee = normalizeAssignee(assignee);
        return normalizedAssignee === normalizeAssignee(selectedUser.id)
            || normalizedAssignee === normalizeAssignee(selectedUser.name)
            || normalizedAssignee === normalizeAssignee(selectedUser.email);
    });
}

/**
 * İki metin arasındaki Levenshtein benzerlik oranını hesaplar (0.0 - 1.0)
 */
function calculateSimilarity(s1, s2) {
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 1;
    const len1 = s1.length, len2 = s2.length;
    const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));
    for (let i = 0; i <= len1; i++) matrix[0][i] = i;
    for (let j = 0; j <= len2; j++) matrix[j][0] = j;
    for (let j = 1; j <= len2; j++) {
        for (let i = 1; i <= len1; i++) {
            const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,
                matrix[j - 1][i] + 1,
                matrix[j - 1][i - 1] + indicator
            );
        }
    }
    const distance = matrix[len2][len1];
    const maxLen = Math.max(len1, len2);
    return (maxLen - distance) / maxLen;
}

/**
 * Metni karşılaştırma ve sözlük araması için standartlaştırır (boşluksuz, küçük harf, ingilizce karakter)
 */
function normalizeForComparison(str) {
    if (!str) return '';
    let s = str.toLocaleLowerCase('tr-TR');
    const map = { 'ç':'c', 'ğ':'g', 'ı':'i', 'i':'i', 'ö':'o', 'ş':'s', 'ü':'u' };
    s = s.replace(/[çğıiöşü]/g, m => map[m]);
    s = s.replace(/[^a-z0-9]/g, ''); // Tüm boşluk ve özel karakterleri sil ("Spa - Masaj" -> "spamasaj")
    return s;
}

function splitMultiContactValues(value, normalize = null) {
    if (!value) return [];
    const items = String(value)
        .split(/[\n,;\/|\\]+/)
        .map(v => String(v || '').trim())
        .filter(Boolean)
        .map(v => normalize ? normalize(v) : v)
        .filter(Boolean);
    return Array.from(new Set(items));
}

function getBusinessSearchTokens(biz) {
    if (!biz) return [];
    const tokens = new Set();
    const pushValue = (value) => {
        const normalized = normalizeText(value);
        if (normalized) tokens.add(normalized);
    };
    const pushMulti = (value) => {
        splitMultiContactValues(value).forEach(pushValue);
    };

    pushValue(biz.companyName);
    pushValue(biz.contactName);
    pushMulti(biz.contactName);
    pushValue(biz.contactPhone);
    pushMulti(biz.contactPhone);
    pushValue(biz.contactEmail);
    pushMulti(biz.contactEmail);

    if (Array.isArray(biz.extraContacts)) {
        biz.extraContacts.forEach((contact) => {
            pushValue(contact?.name);
            pushMulti(contact?.name);
            pushValue(contact?.phone);
            pushMulti(contact?.phone);
            pushValue(contact?.email);
            pushMulti(contact?.email);
        });
    }

    return Array.from(tokens);
}

function businessMatchesSearch(biz, query) {
    const needle = normalizeText(query);
    if (!needle) return true;
    return getBusinessSearchTokens(biz).some((token) => token.includes(needle));
}

function isValidPhone(phone) {
    if (!phone) return false;
    const parts = splitMultiContactValues(phone);
    if (parts.length === 0) return false;
    return parts.every(part => {
        const cleaned = part.replace(/\D/g, '');
        if (cleaned.length !== 10 && cleaned.length !== 11) return false;
        if (cleaned.length === 10 && !/^[2-58]\d{9}$/.test(cleaned)) return false;
        if (cleaned.length === 11 && !/^0[2-58]\d{9}$/.test(cleaned)) return false;
        if (/(\d)\1{5,}/.test(cleaned)) return false;
        return true;
    });
}

function isValidEmail(email) {
    if (!email) return false;
    const parts = splitMultiContactValues(email, v => v.toLowerCase());
    if (parts.length === 0) return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return parts.every(part => re.test(part));
}

function isValidName(name) {
    if (!name || name.trim().length < 3) return false;
    if (/(.)\1{4,}/i.test(name)) return false; // Aynı harf 5 kere tekrar edemez (Örn: asdaaaaaa)
    return true;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        compareTasksByMode,
        extractProjectPeriod,
        formatProjectPeriod,
        getTaskEffectiveTimestamp,
        getTaskUrgencyRank,
        getTaskSourceLabel,
        getTaskStatusLabel,
        isVisibleTaskListProjectTask,
        normalizeTaskSourceKey,
        normalizeTaskStatusKey,
        businessMatchesSearch,
        getBusinessSearchTokens,
        splitMultiContactValues,
        sortTasksByUrgency,
        sortTasksByUrgencyOldest,
        isValidPhone,
        isValidEmail,
        isValidName,
    };
}
