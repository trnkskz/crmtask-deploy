(function(globalScope) {
    function buildTaskSavePayload({ newStatus = '', logType = '', logText = '', nextCallDate = '', dealDetails = null } = {}) {
        const trimmedLogText = String(logText || '').trim();
        const trimmedNextCallDate = String(nextCallDate || '').trim();

        let finalLogStr = '';
        if (newStatus === 'deal' && dealDetails) {
            if (trimmedLogText) finalLogStr = `[Deal Notu] ${trimmedLogText}`;
        } else {
            if (logType) {
                finalLogStr += `[${logType}] `;
                if (logType === 'Tekrar Aranacak') {
                    if (!trimmedNextCallDate) {
                        return { error: 'Lütfen planlanan arama tarihini seçin!' };
                    }
                    finalLogStr += `(Tarih: ${trimmedNextCallDate}) `;
                }
            }
            if (trimmedLogText) finalLogStr += trimmedLogText;
        }

        const patchPayload = {};
        if (newStatus === 'deal' && dealDetails) patchPayload.dealDetails = dealDetails;

        if (logType === 'Tekrar Aranacak' && trimmedNextCallDate) {
            patchPayload.nextCallDate = trimmedNextCallDate;
            if (!newStatus) patchPayload.status = 'followup';
        }

        if (newStatus) patchPayload.status = newStatus;

        const reasonMap = {
            'İşletmeye Ulaşılamadı': 'ISLETMEYE_ULASILAMADI',
            'Yetkiliye Ulaşılamadı': 'YETKILIYE_ULASILAMADI',
            'Yetkiliye Ulaşıldı': 'YETKILIYE_ULASILDI',
            'İşletme Çalışmak İstemiyor': 'ISLETME_CALISMAK_ISTEMIYOR',
            'İşletme Kapanmış': 'ISLETME_KAPANMIS',
            'Tekrar Aranacak': 'TEKRAR_ARANACAK'
        };
        const mappedReason = reasonMap[logType] || 'GORUSME';

        if (finalLogStr) {
            patchPayload.activity = {
                text: finalLogStr,
                reason: mappedReason,
                followUpDate: trimmedNextCallDate || undefined
            };
        }

        return { patchPayload, finalLogStr, nextCallDateVal: trimmedNextCallDate };
    }

    const api = { buildTaskSavePayload };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    globalScope.TaskSavePayload = api;
})(typeof window !== 'undefined' ? window : globalThis);
