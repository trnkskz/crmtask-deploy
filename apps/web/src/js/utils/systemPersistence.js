(function(globalScope) {
    function appendSystemLog(current, action, userName, now = new Date(), randomSuffix = 'random') {
        const next = { ...(current || {}) };
        const isoDate = now.toISOString();
        const id = `${now.getTime()}_${randomSuffix}`;
        next[id] = {
            id,
            user: userName || 'Sistem',
            action: action || '',
            date: now.toLocaleString('tr-TR'),
            timestamp: isoDate,
            createdAt: isoDate,
        };
        return next;
    }

    const api = { appendSystemLog };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    globalScope.SystemPersistence = api;
})(typeof window !== 'undefined' ? window : globalThis);
