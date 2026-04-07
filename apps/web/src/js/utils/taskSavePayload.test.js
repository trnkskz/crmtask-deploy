const { buildTaskSavePayload } = require('./taskSavePayload');

describe('buildTaskSavePayload', () => {
    it('keeps deal details and prefixes manual note in a single payload', () => {
        const result = buildTaskSavePayload({
            newStatus: 'deal',
            logText: 'Musteriyle son detaylar netlesti',
            dealDetails: {
                commission: '15',
                duration: '3',
                fee: 'Yok',
                joker: '0',
                campCount: '2',
            },
        });

        expect(result.patchPayload).toEqual({
            status: 'deal',
            dealDetails: {
                commission: '15',
                duration: '3',
                fee: 'Yok',
                joker: '0',
                campCount: '2',
            },
            activity: {
                text: '[Deal Notu] Musteriyle son detaylar netlesti',
                reason: 'GORUSME',
                followUpDate: undefined,
            },
        });
    });

    it('forces date selection for followup logs', () => {
        expect(buildTaskSavePayload({
            logType: 'Tekrar Aranacak',
            logText: 'Hafta basi donulecek',
        })).toEqual({
            error: 'Lütfen planlanan arama tarihini seçin!',
        });
    });
});
