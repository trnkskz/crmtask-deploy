const { buildCsvImportRows } = require('./csvImport');

describe('buildCsvImportRows', () => {
    it('keeps row numbers and parity fields needed by import smoke checks', () => {
        const result = buildCsvImportRows([
            ['İşletme Adı', 'Kampanya Linki', 'Aranacak Tarih', 'Yetkili', 'Telefon'],
            ['Alpha Cafe', 'https://example.com/campaign', '01/01/25', 'Ayse', '0532 111 22 33'],
        ]);

        expect(result.payloadRows).toEqual([
            {
                rowNumber: 2,
                companyName: 'Alpha Cafe',
                taskCategory: '',
                sourceType: '',
                city: '',
                district: '',
                address: '',
                mainCategory: '',
                subCategory: '',
                campaignUrl: 'https://example.com/campaign',
                contactName: 'Ayse',
                contactPhone: '0532 111 22 33',
                contactEmail: '',
                website: '',
                instagram: '',
                loglama: '',
                durum: '',
                taskTarihi: '',
                aranacakTarih: '01/01/25',
                sonSatisci: '',
            },
        ]);
    });
});
