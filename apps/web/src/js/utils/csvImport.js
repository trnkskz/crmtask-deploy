(function(globalScope) {
    function normalizeCsvHeader(value) {
        return value
            ? String(value).trim().toLocaleLowerCase('tr-TR').replace(/\u0307/g, '')
            : '';
    }

    function buildCsvColumnMap(headers) {
        return {
            companyName: headers.findIndex((h) => h.includes('işletme') || h.includes('firma') || h.includes('şube')),
            taskCategory: headers.findIndex((h) => h.includes('task kategorisi') || h.includes('task kategori')),
            sourceType: headers.findIndex((h) => h.includes('kaynak')),
            city: headers.findIndex((h) => h === 'il' || h === 'şehir'),
            district: headers.findIndex((h) => h.includes('ilçe')),
            address: headers.findIndex((h) => h.includes('adres')),
            mainCategory: headers.findIndex((h) => h.includes('ana kategori')),
            subCategory: headers.findIndex((h) => h.includes('alt kategori')),
            campaignUrl: headers.findIndex((h) => h.includes('kampanya') || h.includes('link')),
            contactName: headers.findIndex((h) => h.includes('yetkili') || h.includes('isim')),
            contactPhone: headers.findIndex((h) => h.includes('telefon') || h.includes('iletişim')),
            contactEmail: headers.findIndex((h) => h.includes('e-posta') || h.includes('email') || h.includes('mail')),
            website: headers.findIndex((h) => h.includes('web')),
            instagram: headers.findIndex((h) => h.includes('instagram') || h.includes('ınstagram')),
            loglama: headers.findIndex((h) => h.includes('loglama') || h.includes('görüşme') || h.includes('log')),
            durum: headers.findIndex((h) => h === 'durum' || h === 'status' || h === 'öncelik'),
            taskTarihi: headers.findIndex((h) => (
                (h.includes('tarih') || h.includes('task yaratma')) &&
                !h.includes('aranacak') &&
                !h.includes('tekrar ara') &&
                !h.includes('next call') &&
                !h.includes('nextcall') &&
                !h.includes('follow up')
            )),
            aranacakTarih: headers.findIndex((h) => h.includes('aranacak') || h.includes('tekrar ara') || h.includes('next call') || h.includes('nextcall') || h.includes('follow up')),
            sonSatisci: headers.findIndex((h) => h.includes('satışçı') || h.includes('satisci') || h.includes('sorumlu') || h.includes('satışcı'))
        };
    }

    function detectCsvColumnMap(headerRow) {
        return buildCsvColumnMap((headerRow || []).map(normalizeCsvHeader));
    }

    function resolveCsvImportChunkSize(length) {
        return Number(length) >= 10000 ? 50 : 100;
    }

    function buildCsvImportRows(rows, providedMap) {
        const normalizedHeaders = (rows?.[0] || []).map(normalizeCsvHeader);
        const map = providedMap || buildCsvColumnMap(normalizedHeaders);
        const payloadRows = [];

        for (let j = 1; j < (rows || []).length; j += 1) {
            const rowData = rows[j] || [];
            const getCol = (key) => map[key] !== -1 && rowData[map[key]] ? String(rowData[map[key]]).trim() : '';

            payloadRows.push({
                rowNumber: j + 1,
                companyName: getCol('companyName'),
                taskCategory: getCol('taskCategory'),
                sourceType: getCol('sourceType'),
                city: getCol('city'),
                district: getCol('district'),
                address: getCol('address'),
                mainCategory: getCol('mainCategory'),
                subCategory: getCol('subCategory'),
                campaignUrl: getCol('campaignUrl'),
                contactName: getCol('contactName'),
                contactPhone: getCol('contactPhone'),
                contactEmail: getCol('contactEmail'),
                website: getCol('website'),
                instagram: getCol('instagram'),
                loglama: getCol('loglama'),
                durum: getCol('durum'),
                taskTarihi: getCol('taskTarihi'),
                aranacakTarih: getCol('aranacakTarih'),
                sonSatisci: getCol('sonSatisci')
            });
        }

        return providedMap ? payloadRows : { headers: normalizedHeaders, map, payloadRows };
    }

    const api = {
        normalizeCsvHeader,
        buildCsvColumnMap,
        detectCsvColumnMap,
        resolveCsvImportChunkSize,
        buildCsvImportRows,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    globalScope.CsvImportUtils = api;
})(typeof window !== 'undefined' ? window : globalThis);
