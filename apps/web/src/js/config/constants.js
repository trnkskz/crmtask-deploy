// ============================================================
// config/constants.js
// Uygulama genelinde kullanılan sabitler ve statik veriler
// ============================================================

const TASK_STATUS = {
    NEW: 'new',
    HOT: 'hot',
    NOT_HOT: 'nothot',
    FOLLOWUP: 'followup',
    DEAL: 'deal',
    COLD: 'cold',
};

const TASK_STATUS_LABELS = {
    new: 'Yeni',
    hot: 'Hot',
    nothot: 'Not Hot',
    followup: 'Takip',
    deal: 'Deal',
    cold: 'Cold',
};

const TASK_STATUS_CSS = {
    new: 'bg-new',
    hot: 'bg-hot',
    nothot: 'bg-nothot',
    followup: 'bg-followup',
    deal: 'bg-deal',
    cold: 'bg-cold',
};

const ACTIVE_STATUSES = ['new', 'hot', 'nothot', 'followup'];
const PASSIVE_STATUSES = ['deal', 'cold'];

const POOL_ASSIGNEES = ['UNASSIGNED', 'Team 1', 'Team 2', 'TARGET_POOL'];

const USER_ROLES = {
    MANAGER: 'Yönetici',
    TEAM_LEAD: 'Takım Lideri',
    SALES_REP: 'Satış Temsilcisi',
};

const ITEMS_PER_PAGE = 25;
const ITEMS_PER_PAGE_TASKS = 20;

const DEFAULT_ADMIN_EMAIL = 'turankusaksiz@gmail.com';

// Şehir listesi
const CITIES = [
    "İstanbul","Ankara","İzmir","Bursa","Antalya","Adana","Adıyaman","Afyonkarahisar",
    "Ağrı","Amasya","Artvin","Aydın","Balıkesir","Bilecik","Bingöl","Bitlis","Bolu",
    "Burdur","Çanakkale","Çankırı","Çorum","Denizli","Diyarbakır","Edirne","Elazığ",
    "Erzincan","Erzurum","Eskişehir","Gaziantep","Giresun","Gümüşhane","Hakkari","Hatay",
    "Isparta","Mersin","Kars","Kastamonu","Kayseri","Kırklareli","Kırşehir","Kocaeli",
    "Konya","Kütahya","Malatya","Manisa","Kahramanmaraş","Mardin","Muğla","Muş","Nevşehir",
    "Niğde","Ordu","Rize","Sakarya","Samsun","Siirt","Sinop","Sivas","Tekirdağ","Tokat",
    "Trabzon","Tunceli","Şanlıurfa","Uşak","Van","Yozgat","Zonguldak","Aksaray","Bayburt",
    "Karaman","Kırıkkale","Batman","Şırnak","Bartın","Ardahan","Iğdır","Yalova","Karabük",
    "Kilis","Osmaniye","Düzce"
];

const DISTRICT_DATA = {
    "İstanbul": ["Adalar","Arnavutköy","Ataşehir","Avcılar","Bağcılar","Bahçelievler","Bakırköy","Başakşehir","Bayrampaşa","Beşiktaş","Beykoz","Beylikdüzü","Beyoğlu","Büyükçekmece","Çatalca","Çekmeköy","Esenler","Esenyurt","Eyüpsultan","Fatih","Gaziosmanpaşa","Güngören","Kadıköy","Kağıthane","Kartal","Küçükçekmece","Maltepe","Pendik","Sancaktepe","Sarıyer","Silivri","Sultanbeyli","Sultangazi","Şile","Şişli","Tuzla","Ümraniye","Üsküdar","Zeytinburnu"],
    "Ankara": ["Akyurt","Altındağ","Ayaş","Bala","Beypazarı","Çamlıdere","Çankaya","Çubuk","Elmadağ","Etimesgut","Evren","Gölbaşı","Güdül","Haymana","Kahramankazan","Kalecik","Keçiören","Kızılcahamam","Mamak","Nallıhan","Polatlı","Pursaklar","Sincan","Şereflikoçhisar","Yenimahalle"],
    "İzmir": ["Aliağa","Balçova","Bayındır","Bayraklı","Bergama","Beydağ","Bornova","Buca","Çeşme","Çiğli","Dikili","Foça","Gaziemir","Güzelbahçe","Karabağlar","Karaburun","Karşıyaka","Kemalpaşa","Kınık","Kiraz","Konak","Menderes","Menemen","Narlıdere","Ödemiş","Seferihisar","Selçuk","Tire","Torbalı","Urla"],
    "Bursa": ["Büyükorhan","Gemlik","Gürsu","Harmancık","İnegöl","İznik","Karacabey","Keles","Kestel","Mudanya","Mustafakemalpaşa","Nilüfer","Orhaneli","Orhangazi","Osmangazi","Yenişehir","Yıldırım"],
    "Antalya": ["Akseki","Alanya","Demre","Döşemealtı","Elmalı","Finike","Gazipaşa","Gündoğmuş","İbradı","Kaş","Kemer","Kepez","Konyaaltı","Korkuteli","Kumluca","Manavgat","Muratpaşa","Serik"]
};

const districtData = DISTRICT_DATA;

const DEFAULT_PRICING_DATA = {
    COMMISSION: {
        title: "Komisyon Oranları",
        items: [
            { name: "Masaj - SPA", val: "%20" },
            { name: "Güzellik", val: "%22-23" },
            { name: "Aktivite - Eğlence", val: "%16" },
            { name: "İftar", val: "%15-16" },
            { name: "Kahvaltı", val: "%15-16" },
            { name: "Yemek", val: "%15-16" },
            { name: "Bilet - Etkinlik", val: "%16" },
            { name: "Hizmet", val: "%19-20" },
            { name: "Spor - Eğitim - Kurs", val: "%19-20" },
            { name: "Yılbaşı", val: "%15-16" },
        ],
    },
    SERVICE: {
        title: "Hizmet Bedelleri",
        items: [
            { name: "Kampanya Sayfası (Komisyonlu Model) - 1 Ay", priceEx: 2500, priceInc: 3000 },
            { name: "Kampanya Sayfası (Komisyonlu Model) - 3 Ay", priceEx: 5000, priceInc: 6000 },
            { name: "Tanıtım Sayfası (Komisyonsuz Model) - 1 Ay", priceEx: 4500, priceInc: 5400 },
            { name: "Tanıtım Sayfası (Komisyonsuz Model) - 3 Ay", priceEx: 10000, priceInc: 12000 },
        ],
    },
    DOPING: {
        title: "Doping Ücretleri",
        items: [
            { name: "Kategori Banner - 5 Gün", priceEx: 3000, priceInc: 3600 },
            { name: "Kategori Banner - 7 Gün", priceEx: 4166.7, priceInc: 5000 },
            { name: "Kategori Vitrini (Top 5) - 3 Gün", priceEx: 2083, priceInc: 2500 },
            { name: "Kategori Vitrini (Top 5) - 5 Gün", priceEx: 3333, priceInc: 4000 },
            { name: "Instagram", priceEx: 1500, priceInc: 1800 },
            { name: "Mailing Banner", priceEx: 3750, priceInc: 4500 },
            { name: "Segment Maili", priceEx: 7500, priceInc: 9000 },
            { name: "Anasayfa Günün Fırsatı Banner Alanı - Maks. 2 Gün", priceEx: 5000, priceInc: 6000 },
            { name: "Anasayfa Listeleme - 1 Ay", priceEx: 20833, priceInc: 25000 },
            { name: "Anasayfa Listeleme - 1 Hafta", priceEx: 6250, priceInc: 7500 },
        ],
    },
    SOCIAL_MEDIA: {
        title: "Sosyal Medya",
        items: [
            { name: "AI Reels", priceEx: 16666, priceInc: 20000 },
            { name: "Mikro Influencer Paylaşımı", priceEx: 20833, priceInc: 25000 },
            { name: "Anlatımlı Reels", priceEx: 20833, priceInc: 25000 },
            { name: "Sosyal Medya Paketleri 3'lü Paket", priceEx: 41666, priceInc: 50000 },
        ],
    },
};

const PRICING_REFERENCE_RULES = {
    codeBundles: [
        { name: "50 Kod", priceInc: 1000 },
        { name: "100 Kod", priceInc: 1800 },
        { name: "250 Kod", priceInc: 3750 },
    ],
    discountCoupons: [
        {
            title: "Cafe-Restoran",
            rules: [
                "Sabit Tutar: 400 TL ve üzeri -> 100 TL indirim",
                "Kademeli: 500 TL ve üzeri 800 TL ve üzeri -> 200 TL indirim",
                "Yüzdelik-Tavanlı: 500 TL ve üzeri -> %25 indirim max 200 TL",
            ],
        },
        {
            title: "Çiçek-Çikolata-Hediye",
            rules: [
                "Sabit Tutar: 1000 TL ve üzeri -> 250 TL indirim (%25)",
                "Kademeli: 800 TL ve üzeri 1.200 TL ve üzeri -> 350 TL indirim (%29)",
                "Yüzdelik-Tavanlı: 1000 TL ve üzeri -> %25 indirim max 300 TL",
            ],
        },
    ],
};

function getCategoryDataFallback() {
    return {
        "Yemek": ["Akşam Yemeği", "Mangal - Steakhouse", "Fast Food", "Türk Mutfağı", "Kahve - Fırın - Tatlı", "Brunch - Kahvaltı", "Kahvaltı"],
        "Aktivite - Eğlence": ["Eğlence Merkezi", "Extreme & Adventure", "Binicilik-Parkur"],
        "Güzellik": ["Güzellik - Bakım"],
        "Masaj - SPA": ["Otel Spa", "Hamam"],
        "İftar": ["İftar - Otel", "İftar - Restaurant", "İftar - Tekne"],
        "Bilet - Etkinlik": ["Tiyatro", "Konser", "Çocuk Tiyatro"],
        "Hizmet": ["Oto Bakım"],
        "Spor - Eğitim - Kurs": ["Atölye"],
        "Yurtiçi Turlar": ["Yurtiçi Paket Tur"],
        "Tatil Otelleri": ["Antalya Otelleri", "Marmara Bölgesi"],
        "Özel Günler": ["Core Sevgililer Günü", "Yılbaşı"]
    };
}

// Şehir listesi
const cities = ["İstanbul","Ankara","İzmir","Bursa","Antalya","Adana","Adıyaman","Afyonkarahisar","Ağrı","Amasya","Artvin","Aydın","Balıkesir","Bilecik","Bingöl","Bitlis","Bolu","Burdur","Çanakkale","Çankırı","Çorum","Denizli","Diyarbakır","Edirne","Elazığ","Erzincan","Erzurum","Eskişehir","Gaziantep","Giresun","Gümüşhane","Hakkari","Hatay","Isparta","Mersin","Kars","Kastamonu","Kayseri","Kırklareli","Kırşehir","Kocaeli","Konya","Kütahya","Malatya","Manisa","Kahramanmaraş","Mardin","Muğla","Muş","Nevşehir","Niğde","Ordu","Rize","Sakarya","Samsun","Siirt","Sinop","Sivas","Tekirdağ","Tokat","Trabzon","Tunceli","Şanlıurfa","Uşak","Van","Yozgat","Zonguldak","Aksaray","Bayburt","Karaman","Kırıkkale","Batman","Şırnak","Bartın","Ardahan","Iğdır","Yalova","Karabük","Kilis","Osmaniye","Düzce"];
