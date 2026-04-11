import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../infrastructure/prisma/prisma.service'

const GROUPANYA_CATEGORY_TREE: Record<string, string[]> = {
  'Aktivite - Eğlence (Core)': ['Binicilik - Parkur', 'Eğlence Merkezi', 'Havuz - Plaj', 'Poligon - Paintball', 'Rafting - Yamaç Paraşütü', 'Sanal Gerçeklik - Kaçış', 'Su Sporları'],
  'Bilet - Etkinlik (Core)': ['Akvaryum - Tema Park', 'Çocuk Tiyatro', 'Gösteri - Müzikal', 'Konser', 'Parti - Festival', 'Sergi - Müze', 'Sinema', 'Tiyatro'],
  'Güzellik (Core)': ['Biorezonans', 'Botoks - Dolgu', 'Cilt Bakımı', 'Epilasyon - Ağda', 'Kalıcı Makyaj', 'Kaş - Kirpik', 'Manikür - Pedikür', 'Saç - Makyaj', 'Solaryum', 'Zayıflama'],
  'Hizmet (Core)': ['Araç Kiralama - Vize', 'Ev Hizmetleri', 'Evcil Hayvan Hizmetleri', 'Fotoğrafçılık - Baskı', 'İndirim Çekleri', 'Kuru Temizleme', 'Oto Bakım', 'Sigorta', 'Transfer - Nakliye'],
  'İftar (Core)': ['Açık Büfe İftar', 'Anadolu Yakası İftar', 'Avrupa Yakası İftar', 'Otelde İftar', 'Restoranda İftar', 'Teknede İftar'],
  'Kahvaltı (Core)': ['Açık Büfe Kahvaltı', 'Açık Havada Kahvaltı', 'Boğazda Kahvaltı', 'Brunch', 'Cafede Kahvaltı', 'Deniz Kenarında Kahvaltı', 'Doğada Kahvaltı', 'Hafta İçi Kahvaltı', 'Hafta Sonu Kahvaltı', 'Kahvaltı Tabağı', 'Köy Kahvaltısı', 'Otelde Kahvaltı', 'Serpme Kahvaltı', 'Teknede Kahvaltı'],
  'Masaj - Spa (Core)': ['Anti Stress Masajı', 'Aromaterapi Masajı', 'Bali Masajı', 'Baş-Boyun ve Omuz Masajı', 'Bebek Spa', 'Çift Masajı', 'Hamam', 'İsveç Masajı', 'Klasik Masaj', 'Köpük Masajı', 'Lenf Drenaj Masajı', 'Masaj', 'Otel Spa', 'Refleksoloji Masajı', 'Shiatsu Masajı', 'Sıcak Taş Masajı', 'Sporcu Masajı', 'Thai Masajı', 'Yüz Masajı'],
  'Özel Günler (Core)': ['Anneler Günü', 'Bayram', 'Harika Cuma', 'Kadınlar Günü'],
  'Sevgililer Günü (Core)': ['Sevgililer Günü Etkinlik', 'Sevgililer Günü Hediye', 'Sevgililer Günü Konaklama', 'Sevgililer Günü Spa', 'Sevgililer Günü Tur', 'Sevgililer Günü Yemek'],
  'Spor - Eğitim - Kurs (Core)': ['Anaokulu - Çocuk', 'Atölye', 'Dans - Müzik', 'Dil Eğitimi', 'Fitness - Gym', 'Mesleki Eğitim', 'Online Kurslar', 'Pilates', 'Yoga - Nefes Terapisi', 'Yüzme Kursu'],
  'Yemek (Core)': ['Akşam Yemeği', 'Dünya Mutfağı', 'Fast Food', 'Kahve - Fırın - Tatlı', 'Mangal - Steakhouse', 'Meyhane - Fasıl', 'Tekne', 'Türk Mutfağı'],
  'Yılbaşı (Core)': ['Yılbaşı Eğlencesi', 'Yılbaşı Tatili', 'Yılbaşı Turları'],
  'Bayram Turları (Travel)': ['Kurban Bayramı Turları', 'Ramazan Bayramı Turları'],
  'Özel Günler (Travel)': ['Bayram', 'Harika Cuma'],
  'Tatil Otelleri (Travel)': ['Akdeniz Bölgesi', 'Ege Bölgesi', 'İç Anadolu Bölgesi', 'Karadeniz Bölgesi', 'Marmara Bölgesi'],
  'Tatil Teması (Travel)': ['Her Şey Dahil'],
  'Turistik Aktiviteler (Travel)': ['Havuz Girişi', 'Kış Sporları', 'Plaj Girişi', 'Ulaşım - Diğer', 'Ulaşım - Uçak', 'Yaz Sporları'],
  'Yurtdışı Turlar (Travel)': ['Afrika', 'Amerika', 'Asya', 'Avrupa', 'Balkanlar ve Yunanistan', 'Kıbrıs Otel', 'Uzakdoğu', 'Vizesiz Avrupa', 'Vizesiz Balkanlar', 'Yurtdışı Otel'],
  'Yurtiçi Otel (Travel)': ['Ankara Otelleri', 'Antalya Otelleri', 'Bursa Otelleri', 'Diğer Kentler', 'İstanbul Otelleri', 'İzmir Otelleri', 'Yurtiçi Termal Otel'],
  'Yurtiçi Turlar (Travel)': ['Günübirlik Turlar', 'Haftasonu Turları', 'Kapadokya Turları', 'Karadeniz Turları', 'Kayak Turları', 'Kültür Turları', 'Mavi Yolculuk', 'Yurtiçi Paket Tur'],
  'Eski Kategoriler': [],
}

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  private buildCategoryMatchWhere(type: 'main'|'sub', oldMain: string, oldSub?: string | null) {
    return type === 'main'
      ? { mainCategory: oldMain }
      : { mainCategory: oldMain, subCategory: oldSub || '' }
  }

  private resolveCanonicalCategory(mainCategory: string, subCategory: string, companyName = '') {
    const rawMain = String(mainCategory || '').trim()
    const rawSub = String(subCategory || '').trim()
    const textForMatch = `${rawMain} ${rawSub} ${companyName}`.toLocaleLowerCase('tr-TR')
    const fuzzyMatch = textForMatch
      .replace(/[ç]/g, 'c')
      .replace(/[ğ]/g, 'g')
      .replace(/[ı]/g, 'i')
      .replace(/[ö]/g, 'o')
      .replace(/[ş]/g, 's')
      .replace(/[ü]/g, 'u')

    let resolvedMain = rawMain || 'Diğer'
    let resolvedSub = rawSub || 'Belirtilmemiş'
    let matched = false

    if (/masaj|spa|hamam|kese|wellness|refleksoloji|shiatsu/i.test(textForMatch)) {
      resolvedMain = 'Masaj - Spa (Core)'
      if (/bali/i.test(textForMatch)) resolvedSub = 'Bali Masajı'
      else if (/thai/i.test(textForMatch)) resolvedSub = 'Thai Masajı'
      else if (/isveç|isvec/i.test(fuzzyMatch)) resolvedSub = 'İsveç Masajı'
      else if (/köpük|kopuk|hamam/i.test(fuzzyMatch)) resolvedSub = 'Hamam'
      else if (/çift|cift/i.test(fuzzyMatch)) resolvedSub = 'Çift Masajı'
      else if (/otel/i.test(textForMatch)) resolvedSub = 'Otel Spa'
      else if (/aroma/i.test(textForMatch)) resolvedSub = 'Aromaterapi Masajı'
      else if (/bebek/i.test(textForMatch)) resolvedSub = 'Bebek Spa'
      else resolvedSub = 'Masaj'
      matched = true
    } else if (/kahvaltı|brunch|kahvalti/i.test(fuzzyMatch)) {
      resolvedMain = 'Kahvaltı (Core)'
      if (/serpme/i.test(textForMatch)) resolvedSub = 'Serpme Kahvaltı'
      else if (/açık büfe|acik bufe/i.test(fuzzyMatch)) resolvedSub = 'Açık Büfe Kahvaltı'
      else if (/köy|koy/i.test(fuzzyMatch)) resolvedSub = 'Köy Kahvaltısı'
      else if (/boğaz|bogaz/i.test(fuzzyMatch)) resolvedSub = 'Boğazda Kahvaltı'
      else if (/tekne/i.test(textForMatch)) resolvedSub = 'Teknede Kahvaltı'
      else if (/otel/i.test(textForMatch)) resolvedSub = 'Otelde Kahvaltı'
      else if (/brunch/i.test(textForMatch)) resolvedSub = 'Brunch'
      else resolvedSub = 'Kahvaltı Tabağı'
      matched = true
    } else if (/(iftar|ramazan)/i.test(textForMatch) && !/bayram/i.test(textForMatch)) {
      resolvedMain = 'İftar (Core)'
      if (/avrupa/i.test(textForMatch)) resolvedSub = 'Avrupa Yakası İftar'
      else if (/anadolu/i.test(textForMatch)) resolvedSub = 'Anadolu Yakası İftar'
      else if (/açık büfe|acik bufe/i.test(fuzzyMatch)) resolvedSub = 'Açık Büfe İftar'
      else if (/tekne/i.test(textForMatch)) resolvedSub = 'Teknede İftar'
      else if (/otel/i.test(textForMatch)) resolvedSub = 'Otelde İftar'
      else resolvedSub = 'Restoranda İftar'
      matched = true
    } else if (/güzellik|guzellik|epilasyon|lazer|cilt|saç|sac|makyaj|botoks|zayıflama|zayiflama|incelme|pedikür|manikür|oje|nail|protez|biorezonans|solaryum/i.test(fuzzyMatch)) {
      resolvedMain = 'Güzellik (Core)'
      if (/epilasyon|lazer|ağda|agda/i.test(fuzzyMatch)) resolvedSub = 'Epilasyon - Ağda'
      else if (/cilt|yüz/i.test(textForMatch)) resolvedSub = 'Cilt Bakımı'
      else if (/saç|sac|makyaj/i.test(fuzzyMatch)) resolvedSub = 'Saç - Makyaj'
      else if (/zayıflama|zayiflama|incelme/i.test(fuzzyMatch)) resolvedSub = 'Zayıflama'
      else if (/manikür|pedikür|tırnak|oje|nail|protez/i.test(fuzzyMatch)) resolvedSub = 'Manikür - Pedikür'
      else if (/biorezonans/i.test(textForMatch)) resolvedSub = 'Biorezonans'
      else if (/botoks|dolgu/i.test(textForMatch)) resolvedSub = 'Botoks - Dolgu'
      else if (/solaryum/i.test(textForMatch)) resolvedSub = 'Solaryum'
      else resolvedSub = 'Cilt Bakımı'
      matched = true
    } else if (/spor|fitness|gym|yoga|pilates|yüzme|yuzme|kurs|eğitim|egitim|dans|gelişim|gelisim|atölye|atolye/i.test(fuzzyMatch)) {
      resolvedMain = 'Spor - Eğitim - Kurs (Core)'
      if (/yoga|nefes/i.test(textForMatch)) resolvedSub = 'Yoga - Nefes Terapisi'
      else if (/pilates/i.test(textForMatch)) resolvedSub = 'Pilates'
      else if (/fitness|gym/i.test(textForMatch)) resolvedSub = 'Fitness - Gym'
      else if (/dans|müzik|muzik/i.test(fuzzyMatch)) resolvedSub = 'Dans - Müzik'
      else if (/dil/i.test(textForMatch)) resolvedSub = 'Dil Eğitimi'
      else if (/yüzme|yuzme/i.test(fuzzyMatch)) resolvedSub = 'Yüzme Kursu'
      else if (/anaokulu|çocuk|cocuk/i.test(fuzzyMatch)) resolvedSub = 'Anaokulu - Çocuk'
      else if (/online/i.test(textForMatch)) resolvedSub = 'Online Kurslar'
      else resolvedSub = 'Atölye'
      matched = true
    } else if (/bilet|tiyatro|konser|sinema|sergi|müze|muze|akvaryum/i.test(fuzzyMatch)) {
      resolvedMain = 'Bilet - Etkinlik (Core)'
      if (/çocuk|cocuk/i.test(fuzzyMatch) && /tiyatro|oyun/i.test(textForMatch)) resolvedSub = 'Çocuk Tiyatro'
      else if (/tiyatro/i.test(textForMatch)) resolvedSub = 'Tiyatro'
      else if (/konser/i.test(textForMatch)) resolvedSub = 'Konser'
      else if (/sinema/i.test(textForMatch)) resolvedSub = 'Sinema'
      else if (/akvaryum|tema park/i.test(textForMatch)) resolvedSub = 'Akvaryum - Tema Park'
      else if (/sergi|müze|muze/i.test(fuzzyMatch)) resolvedSub = 'Sergi - Müze'
      else if (/parti|festival/i.test(textForMatch)) resolvedSub = 'Parti - Festival'
      else resolvedSub = 'Gösteri - Müzikal'
      matched = true
    } else if (/aktivite|eğlence|eglence|paintball|kaçış|kacis|havuz|su sporları|rafting|yamaç|yamac|binicilik|poligon/i.test(fuzzyMatch)) {
      resolvedMain = 'Aktivite - Eğlence (Core)'
      if (/paintball|poligon/i.test(textForMatch)) resolvedSub = 'Poligon - Paintball'
      else if (/kaçış|kacis|sanal|vr/i.test(fuzzyMatch)) resolvedSub = 'Sanal Gerçeklik - Kaçış'
      else if (/havuz|plaj/i.test(textForMatch)) resolvedSub = 'Havuz - Plaj'
      else if (/su sporları|su sporlari/i.test(fuzzyMatch)) resolvedSub = 'Su Sporları'
      else if (/rafting|yamaç|yamac/i.test(fuzzyMatch)) resolvedSub = 'Rafting - Yamaç Paraşütü'
      else if (/binicilik|at |parkur/i.test(textForMatch)) resolvedSub = 'Binicilik - Parkur'
      else resolvedSub = 'Eğlence Merkezi'
      matched = true
    } else if (/hizmet|oto|araç|arac|temizleme|yıkama|yikama|kuru temizleme|sigorta|nakliye|fotoğraf|fotograf|vize/i.test(fuzzyMatch)) {
      resolvedMain = 'Hizmet (Core)'
      if (/araç|arac|kiralama|vize/i.test(fuzzyMatch)) resolvedSub = 'Araç Kiralama - Vize'
      else if (/ev hizmetleri/i.test(textForMatch)) resolvedSub = 'Ev Hizmetleri'
      else if (/hayvan|evcil|veteriner/i.test(textForMatch)) resolvedSub = 'Evcil Hayvan Hizmetleri'
      else if (/fotoğraf|fotograf/i.test(fuzzyMatch)) resolvedSub = 'Fotoğrafçılık - Baskı'
      else if (/kuru temizleme/i.test(textForMatch)) resolvedSub = 'Kuru Temizleme'
      else if (/sigorta/i.test(textForMatch)) resolvedSub = 'Sigorta'
      else if (/transfer|nakliye/i.test(textForMatch)) resolvedSub = 'Transfer - Nakliye'
      else resolvedSub = 'Oto Bakım'
      matched = true
    } else if (/yılbaşı|yilbasi|yeniyıl|yeni yil/i.test(fuzzyMatch)) {
      resolvedMain = 'Yılbaşı (Core)'
      if (/tatil|otel|konaklama/i.test(textForMatch)) resolvedSub = 'Yılbaşı Tatili'
      else if (/tur/i.test(textForMatch)) resolvedSub = 'Yılbaşı Turları'
      else resolvedSub = 'Yılbaşı Eğlencesi'
      matched = true
    } else if (/sevgililer günü|sevgililer gunu|14 şubat|14 subat/i.test(fuzzyMatch)) {
      resolvedMain = 'Sevgililer Günü (Core)'
      if (/konaklama|otel/i.test(textForMatch)) resolvedSub = 'Sevgililer Günü Konaklama'
      else if (/spa|masaj/i.test(textForMatch)) resolvedSub = 'Sevgililer Günü Spa'
      else if (/tur/i.test(textForMatch)) resolvedSub = 'Sevgililer Günü Tur'
      else if (/yemek|restoran/i.test(textForMatch)) resolvedSub = 'Sevgililer Günü Yemek'
      else if (/hediye/i.test(textForMatch)) resolvedSub = 'Sevgililer Günü Hediye'
      else resolvedSub = 'Sevgililer Günü Etkinlik'
      matched = true
    } else if (/bayram/i.test(textForMatch) && /tur|tatil/i.test(textForMatch)) {
      resolvedMain = 'Bayram Turları (Travel)'
      if (/kurban/i.test(textForMatch)) resolvedSub = 'Kurban Bayramı Turları'
      else resolvedSub = 'Ramazan Bayramı Turları'
      matched = true
    } else if (/özel günler|ozel gunler|anneler günü|anneler gunu|kadınlar günü|kadinlar gunu|bayram|cuma/i.test(fuzzyMatch) && !/tur/i.test(textForMatch)) {
      resolvedMain = 'Özel Günler (Core)'
      if (/anneler/i.test(textForMatch)) resolvedSub = 'Anneler Günü'
      else if (/kadınlar|kadinlar/i.test(fuzzyMatch)) resolvedSub = 'Kadınlar Günü'
      else if (/bayram/i.test(textForMatch)) resolvedSub = 'Bayram'
      else if (/cuma/i.test(textForMatch)) resolvedSub = 'Harika Cuma'
      else resolvedSub = 'Özel Günler (Core)'
      matched = true
    } else if (/tatil otelleri|akdeniz|ege|marmara|karadeniz|iç anadolu|ic anadolu/i.test(fuzzyMatch)) {
      resolvedMain = 'Tatil Otelleri (Travel)'
      if (/akdeniz/i.test(textForMatch)) resolvedSub = 'Akdeniz Bölgesi'
      else if (/ege/i.test(textForMatch)) resolvedSub = 'Ege Bölgesi'
      else if (/karadeniz/i.test(textForMatch)) resolvedSub = 'Karadeniz Bölgesi'
      else if (/marmara/i.test(textForMatch)) resolvedSub = 'Marmara Bölgesi'
      else resolvedSub = 'İç Anadolu Bölgesi'
      matched = true
    } else if (/yurt\s?içi otel|yurt\s?ici otel|otel|konaklama/i.test(fuzzyMatch) && !/yurt\s?dışı|yurt\s?disi|kıbrıs|kibris/i.test(fuzzyMatch)) {
      resolvedMain = 'Yurtiçi Otel (Travel)'
      if (/istanbul/i.test(textForMatch)) resolvedSub = 'İstanbul Otelleri'
      else if (/ankara/i.test(textForMatch)) resolvedSub = 'Ankara Otelleri'
      else if (/antalya/i.test(textForMatch)) resolvedSub = 'Antalya Otelleri'
      else if (/bursa/i.test(textForMatch)) resolvedSub = 'Bursa Otelleri'
      else if (/izmir/i.test(textForMatch)) resolvedSub = 'İzmir Otelleri'
      else if (/termal/i.test(textForMatch)) resolvedSub = 'Yurtiçi Termal Otel'
      else resolvedSub = 'Diğer Kentler'
      matched = true
    } else if (/yurt\s?içi tur|yurt\s?ici tur|tur/i.test(fuzzyMatch) && !/yurt\s?dışı|yurt\s?disi|kıbrıs|kibris|bayram|yılbaşı|yilbasi/i.test(fuzzyMatch)) {
      resolvedMain = 'Yurtiçi Turlar (Travel)'
      if (/günübirlik|gunubirlik/i.test(fuzzyMatch)) resolvedSub = 'Günübirlik Turlar'
      else if (/hafta\s?sonu/i.test(textForMatch)) resolvedSub = 'Haftasonu Turları'
      else if (/kapadokya/i.test(textForMatch)) resolvedSub = 'Kapadokya Turları'
      else if (/karadeniz/i.test(textForMatch)) resolvedSub = 'Karadeniz Turları'
      else if (/kayak|kış|kis/i.test(fuzzyMatch)) resolvedSub = 'Kayak Turları'
      else if (/kültür|kultur/i.test(fuzzyMatch)) resolvedSub = 'Kültür Turları'
      else if (/mavi yolculuk/i.test(textForMatch)) resolvedSub = 'Mavi Yolculuk'
      else resolvedSub = 'Yurtiçi Paket Tur'
      matched = true
    } else if (/yurt\s?dışı|yurt\s?disi|kıbrıs|kibris|vizesiz|afrika|amerika|asya|avrupa|balkanlar|uzak\s?doğu|uzak\s?dogu|italya|fransa|ispanya|paris|roma|mısır|dubai|yunanistan/i.test(fuzzyMatch)) {
      resolvedMain = 'Yurtdışı Turlar (Travel)'
      if (/kıbrıs|kibris/i.test(fuzzyMatch)) resolvedSub = 'Kıbrıs Otel'
      else if (/vizesiz avrupa/i.test(textForMatch)) resolvedSub = 'Vizesiz Avrupa'
      else if (/vizesiz balkan/i.test(textForMatch)) resolvedSub = 'Vizesiz Balkanlar'
      else if (/avrupa|italya|fransa|ispanya|paris|roma|yunanistan/i.test(textForMatch)) resolvedSub = 'Avrupa'
      else if (/balkanlar/i.test(textForMatch)) resolvedSub = 'Balkanlar ve Yunanistan'
      else if (/afrika|mısır|misir/i.test(fuzzyMatch)) resolvedSub = 'Afrika'
      else if (/amerika/i.test(textForMatch)) resolvedSub = 'Amerika'
      else if (/asya|dubai/i.test(textForMatch)) resolvedSub = 'Asya'
      else if (/uzak\s?doğu|uzak\s?dogu/i.test(fuzzyMatch)) resolvedSub = 'Uzakdoğu'
      else if (/otel/i.test(textForMatch)) resolvedSub = 'Yurtdışı Otel'
      else resolvedSub = 'Avrupa'
      matched = true
    } else if (/yemek|restoran|pizza|pide|burger|kebap|et |steak|meyhane|suşi|sushi|fast food|tatlı|tatli|kahve|cafe|kafe/i.test(fuzzyMatch)) {
      resolvedMain = 'Yemek (Core)'
      if (/fast|burger|pizza|pide/i.test(textForMatch)) resolvedSub = 'Fast Food'
      else if (/mangal|steak|et /i.test(textForMatch)) resolvedSub = 'Mangal - Steakhouse'
      else if (/meyhane|fasıl|fasil/i.test(fuzzyMatch)) resolvedSub = 'Meyhane - Fasıl'
      else if (/tatlı|tatli|kahve|fırın|firin|cafe|kafe/i.test(fuzzyMatch)) resolvedSub = 'Kahve - Fırın - Tatlı'
      else if (/dünya mutfağı|dunya mutfagi|sushi|suşi/i.test(fuzzyMatch)) resolvedSub = 'Dünya Mutfağı'
      else if (/türk mutfağı|turk mutfagi/i.test(fuzzyMatch)) resolvedSub = 'Türk Mutfağı'
      else if (/tekne/i.test(textForMatch)) resolvedSub = 'Tekne'
      else resolvedSub = 'Akşam Yemeği'
      matched = true
    }

    return { mainCategory: resolvedMain, subCategory: resolvedSub, matched }
  }

  private async runChunked<T>(items: T[], chunkSize: number, handler: (item: T) => any) {
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize)
      await this.prisma.$transaction(chunk.map((item) => handler(item)))
    }
  }

  private async replaceGrupanyaCategoryTree() {
    await this.prisma.$transaction([
      this.prisma.categorySub.updateMany({ where: { active: true }, data: { active: false } }),
      this.prisma.categoryMain.updateMany({ where: { active: true }, data: { active: false } }),
    ])

    for (const [label, subs] of Object.entries(GROUPANYA_CATEGORY_TREE)) {
      const main = await this.prisma.categoryMain.create({
        data: { label, active: true, order: 0 },
      })
      if (!subs.length) continue
      await this.prisma.categorySub.createMany({
        data: subs.map((subLabel) => ({
          categoryMainId: main.id,
          label: subLabel,
          active: true,
          order: 0,
        })),
      })
    }
  }

  private normalizeArchiveAssignee(name: string, activeUsers: string[]) {
    if (!name) return 'Sistem (Arşiv)'
    let clean = name.trim()
    clean = clean.toLocaleLowerCase('tr-TR').replace(/(?:^|\s)\S/g, (a) => a.toLocaleUpperCase('tr-TR'))

    const exact = activeUsers.find((u) => u.toLocaleLowerCase('tr-TR') === clean.toLocaleLowerCase('tr-TR'))
    if (exact) return exact

    const mapTr: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u' }
    const noTr = (s: string) =>
      s
        .toLocaleLowerCase('tr-TR')
        .replace(/[çğıiöşü]/g, (m) => mapTr[m] || m)
        .replace(/[^a-z0-9]/g, '')

    const targetNoTr = noTr(clean)
    for (const activeUser of activeUsers) {
      if (noTr(activeUser) === targetNoTr) return activeUser
    }

    const dictionary: Record<string, string> = {
      'esra cali': 'Esra Çalı',
      'fatos madendere': 'Fatoş Madendere',
      'fatma balci': 'Fatma Balcı',
    }
    return dictionary[clean.toLocaleLowerCase('tr-TR')] || clean
  }

  async wipeData() {
    await this.prisma.activityLog.deleteMany();
    await this.prisma.offer.deleteMany();
    await this.prisma.taskContact.deleteMany();
    await this.prisma.task.deleteMany();
    await this.prisma.project.deleteMany();
    await this.prisma.accountNote.deleteMany();
    await this.prisma.accountContact.deleteMany();
    await this.prisma.account.deleteMany();
    return { success: true, message: 'İşletme, Görev ve Proje verileri sıfırlandı.' };
  }

  async factoryReset() {
    await this.wipeData();
    await this.prisma.notification.deleteMany();
    await this.prisma.activityHistory.deleteMany();
    await this.prisma.dealHistory.deleteMany();
    await this.prisma.deal.deleteMany();
    await this.prisma.lead.deleteMany();
    await this.prisma.auditLog.deleteMany();
    await this.prisma.taskList.deleteMany();
    
    // Non-admin kullanıcıları temizle
    await this.prisma.user.deleteMany({
      where: { role: { not: 'ADMIN' } }
    });
    
    return { success: true, message: 'Sistem fabrika ayarlarına döndürüldü.' };
  }

  async fixPastRecordDates() {
    const tasks = await this.prisma.task.findMany({
      include: {
        logs: {
          where: { text: { contains: '[Geçmiş Kayıt]' } },
          orderBy: { createdAt: 'asc' },
          select: { id: true, text: true, createdAt: true },
        },
      },
    })

    const currentYear = new Date().getFullYear()
    let updatedCount = 0

    for (const task of tasks) {
      const archiveLog = task.logs[0]
      if (!archiveLog) continue

      const dateMatch = String(archiveLog.text || '').match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
      let parsedDate: Date | null = null
      if (dateMatch) {
        const d = dateMatch[1].padStart(2, '0')
        const m = dateMatch[2].padStart(2, '0')
        const y = dateMatch[3].length === 2 ? `20${dateMatch[3]}` : (dateMatch[3].length === 4 ? dateMatch[3] : '2024')
        const year = Number(y)
        const month = Number(m)
        const day = Number(d)

        if (year >= 2000 && year <= currentYear && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          const candidate = new Date(`${y}-${m}-${d}T12:00:00.000Z`)
          if (
            !Number.isNaN(candidate.getTime()) &&
            candidate.getUTCFullYear() === year &&
            candidate.getUTCMonth() === month - 1 &&
            candidate.getUTCDate() === day
          ) {
            parsedDate = candidate
          }
        } else {
          parsedDate = new Date('2000-01-01T12:00:00.000Z')
        }
      } else if (task.creationDate.getUTCFullYear() >= currentYear) {
        parsedDate = new Date('2000-01-01T12:00:00.000Z')
      }

      if (!parsedDate || Number.isNaN(parsedDate.getTime())) continue
      if (task.creationDate.getTime() === parsedDate.getTime() && archiveLog.createdAt.getTime() === parsedDate.getTime()) continue

      await this.prisma.$transaction([
        this.prisma.task.update({
          where: { id: task.id },
          data: { creationDate: parsedDate },
        }),
        this.prisma.activityLog.update({
          where: { id: archiveLog.id },
          data: { createdAt: parsedDate },
        }),
      ])
      updatedCount += 1
    }

    return { success: true, updatedCount }
  }

  async cleanArchiveAssignees() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { name: true },
    })
    const activeUsers = users.map((u) => String(u.name || '').trim()).filter(Boolean)
    const tasks = await this.prisma.task.findMany({
      where: { historicalAssignee: { not: null } },
      select: { id: true, historicalAssignee: true },
    })

    let updatedCount = 0
    for (const task of tasks) {
      const current = String(task.historicalAssignee || '').trim()
      if (!current) continue
      const normalized = this.normalizeArchiveAssignee(current, activeUsers)
      if (normalized === current) continue
      await this.prisma.task.update({
        where: { id: task.id },
        data: { historicalAssignee: normalized },
      })
      updatedCount += 1
    }

    return { success: true, updatedCount }
  }

  async deleteAdminTestData() {
    const adminUsers = await this.prisma.user.findMany({
      where: {
        OR: [
          { role: 'ADMIN' as any },
          { email: { contains: 'admin', mode: 'insensitive' } },
          { name: { contains: 'admin', mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    })
    const adminIds = adminUsers.map((u) => u.id)
    if (adminIds.length === 0) return { success: true, updatedTaskCount: 0, deletedLogCount: 0, deletedOfferCount: 0 }

    const [adminLogs, adminOffers, assignedTasks] = await this.prisma.$transaction([
      this.prisma.activityLog.findMany({
        where: {
          authorId: { in: adminIds },
          NOT: { text: { contains: '[Geçmiş Kayıt]' } },
          task: {
            taskList: {
              isActive: true,
            },
          },
        },
        select: { id: true, taskId: true },
      }),
      this.prisma.offer.findMany({
        where: {
          createdById: { in: adminIds },
          task: {
            taskList: {
              isActive: true,
            },
          },
        },
        select: { id: true, taskId: true, activityLogId: true },
      }),
      this.prisma.task.findMany({
        where: {
          ownerId: { in: adminIds },
          taskList: {
            isActive: true,
          },
        },
        select: { id: true },
      }),
    ])

    const impactedTaskIds = Array.from(new Set([
      ...adminLogs.map((log) => log.taskId),
      ...adminOffers.map((offer) => offer.taskId),
      ...assignedTasks.map((task) => task.id),
    ]))

    if (adminLogs.length > 0) {
      await this.prisma.offer.deleteMany({ where: { activityLogId: { in: adminLogs.map((log) => log.id) } } })
      await this.prisma.activityLog.deleteMany({ where: { id: { in: adminLogs.map((log) => log.id) } } })
    }

    const orphanOfferIds = adminOffers
      .filter((offer) => !offer.activityLogId)
      .map((offer) => offer.id)
    if (orphanOfferIds.length > 0) {
      await this.prisma.offer.deleteMany({ where: { id: { in: orphanOfferIds } } })
    }

    if (assignedTasks.length > 0) {
      await this.prisma.task.updateMany({
        where: { id: { in: assignedTasks.map((task) => task.id) } },
        data: {
          ownerId: null,
          durationDays: null,
          assignmentDate: null,
          dueDate: null,
          poolTeam: 'GENERAL' as any,
        },
      })
    }

    if (impactedTaskIds.length > 0) {
      await this.prisma.task.updateMany({
        where: {
          id: { in: impactedTaskIds },
          status: { in: ['DEAL', 'HOT', 'COLD'] as any },
        },
        data: {
          status: 'NOT_HOT' as any,
          generalStatus: 'OPEN' as any,
          closedAt: null,
          closedReason: null,
        },
      })
    }

    return {
      success: true,
      updatedTaskCount: impactedTaskIds.length,
      deletedLogCount: adminLogs.length,
      deletedOfferCount: adminOffers.length,
    }
  }

  async migrateGrupanyaCategories() {
    await this.replaceGrupanyaCategoryTree()

    const tasks = await this.prisma.task.findMany({
      select: {
        id: true,
        accountId: true,
        mainCategory: true,
        subCategory: true,
        createdAt: true,
        account: { select: { businessName: true } },
      },
    })

    const businesses = await this.prisma.account.findMany({
      select: {
        id: true,
        businessName: true,
        mainCategory: true,
        subCategory: true,
        createdAt: true,
      },
    })

    let quarantineCount = 0
    const businessCategoryUpdates = new Map<string, { createdAt: number; mainCategory: string; subCategory: string }>()
    const taskUpdates = tasks.map((task) => {
      const resolved = this.resolveCanonicalCategory(task.mainCategory || '', task.subCategory || '', task.account?.businessName || '')
      const nextMain = resolved.matched ? resolved.mainCategory : 'Eski Kategoriler'
      const nextSub = resolved.matched ? resolved.subCategory : (task.subCategory || '')
      if (!resolved.matched) quarantineCount += 1

      const previous = businessCategoryUpdates.get(task.accountId)
      const taskCreatedAt = new Date(task.createdAt || 0).getTime() || 0
      if (!previous || taskCreatedAt >= previous.createdAt) {
        businessCategoryUpdates.set(task.accountId, {
          createdAt: taskCreatedAt,
          mainCategory: nextMain,
          subCategory: nextSub,
        })
      }

      return {
        id: task.id,
        mainCategory: nextMain,
        subCategory: nextSub,
      }
    })

    for (const biz of businesses) {
      if (businessCategoryUpdates.has(biz.id)) continue
      const resolved = this.resolveCanonicalCategory(biz.mainCategory || '', biz.subCategory || '', biz.businessName || '')
      const nextMain = resolved.matched ? resolved.mainCategory : 'Eski Kategoriler'
      const nextSub = resolved.matched ? resolved.subCategory : (biz.subCategory || '')
      if (!resolved.matched) quarantineCount += 1
      businessCategoryUpdates.set(biz.id, {
        createdAt: new Date(biz.createdAt || 0).getTime() || 0,
        mainCategory: nextMain,
        subCategory: nextSub,
      })
    }

    await this.runChunked(taskUpdates, 250, (task) => this.prisma.task.update({
      where: { id: task.id },
      data: { mainCategory: task.mainCategory, subCategory: task.subCategory },
    }))

    const businessUpdates = Array.from(businessCategoryUpdates.entries()).map(([id, value]) => ({
      id,
      mainCategory: value.mainCategory,
      subCategory: value.subCategory,
    }))

    await this.runChunked(businessUpdates, 250, (biz) => this.prisma.account.update({
      where: { id: biz.id },
      data: { mainCategory: biz.mainCategory, subCategory: biz.subCategory, category: [biz.mainCategory, biz.subCategory].filter(Boolean).join(' / ') || 'Uncategorized' },
    }))

    return {
      success: true,
      updatedTaskCount: taskUpdates.length,
      updatedBusinessCount: businessUpdates.length,
      quarantineCount,
    }
  }

  async categoryUsage(body: { type: 'main'|'sub'; oldMain: string; oldSub?: string | null }) {
    const type = body?.type === 'sub' ? 'sub' : 'main'
    const oldMain = String(body?.oldMain || '').trim()
    const oldSub = String(body?.oldSub || '').trim()
    if (!oldMain) throw new BadRequestException('oldMain required')

    const taskWhere = this.buildCategoryMatchWhere(type, oldMain, oldSub)
    const bizWhere = this.buildCategoryMatchWhere(type, oldMain, oldSub)

    const [tasks, businesses] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where: taskWhere as any,
        select: { id: true, accountId: true },
      }),
      this.prisma.account.findMany({
        where: bizWhere as any,
        select: { id: true },
      }),
    ])

    const matchedBusinessIds = new Set<string>()
    tasks.forEach((task) => {
      const accountId = String(task?.accountId || '').trim()
      if (accountId) matchedBusinessIds.add(accountId)
    })
    businesses.forEach((biz) => {
      const id = String(biz?.id || '').trim()
      if (id) matchedBusinessIds.add(id)
    })

    return {
      taskIds: tasks.map((task) => task.id),
      businessIds: Array.from(matchedBusinessIds),
      taskCount: tasks.length,
      businessCount: matchedBusinessIds.size,
      hasLinkedRecords: tasks.length > 0 || matchedBusinessIds.size > 0,
    }
  }

  async transferCategory(body: { type: 'main'|'sub'; oldMain: string; oldSub?: string | null; newMain: string; newSub?: string | null; index?: number | null; categories?: Record<string, string[]> }) {
    const type = body?.type === 'sub' ? 'sub' : 'main'
    const oldMain = String(body?.oldMain || '').trim()
    const oldSub = String(body?.oldSub || '').trim()
    const newMain = String(body?.newMain || '').trim()
    const newSub = String(body?.newSub || '').trim()
    if (!oldMain || !newMain) throw new BadRequestException('oldMain and newMain required')

    const usage = await this.categoryUsage({ type, oldMain, oldSub })
    const taskIds = Array.isArray(usage.taskIds) ? usage.taskIds : []
    const businessIds = Array.isArray(usage.businessIds) ? usage.businessIds : []

    if (taskIds.length) {
      await this.prisma.task.updateMany({
        where: { id: { in: taskIds } },
        data: { mainCategory: newMain, subCategory: newSub },
      })
    }

    if (businessIds.length) {
      await this.prisma.account.updateMany({
        where: { id: { in: businessIds } },
        data: {
          mainCategory: newMain,
          subCategory: newSub,
          category: [newMain, newSub].filter(Boolean).join(' / ') || 'Uncategorized',
        },
      })
    }

    return {
      success: true,
      taskIds,
      businessIds,
      taskCount: taskIds.length,
      businessCount: businessIds.length,
      newMain,
      newSub,
    }
  }

  // Roles
  listRoles() { return this.prisma.appRole.findMany({ include: { permissions: { include: { permission: true } } } }) }
  async createRole(name: string) { if (!name) throw new BadRequestException('name required'); return this.prisma.appRole.create({ data: { name } }) }

  // Permissions
  listPermissions() { return this.prisma.permission.findMany() }
  async createPermission(body: { name: string; module: string; description?: string }) {
    if (!body?.name) throw new BadRequestException('name required')
    return this.prisma.permission.create({ data: { name: body.name, module: body.module, description: body.description || null } })
  }

  async attachPermission(roleId: string, permissionId: string) {
    const role = await this.prisma.appRole.findUnique({ where: { id: roleId } })
    if (!role) throw new NotFoundException('role not found')
    const perm = await this.prisma.permission.findUnique({ where: { id: permissionId } })
    if (!perm) throw new NotFoundException('permission not found')
    return this.prisma.rolePermission.create({ data: { roleId, permissionId } })
  }

  // Assign role to user
  async assignRoleToUser(userId: string, roleId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('user not found')
    const role = await this.prisma.appRole.findUnique({ where: { id: roleId } })
    if (!role) throw new NotFoundException('role not found')
    return this.prisma.user.update({ where: { id: userId }, data: { appRoleId: roleId } })
  }
}
