const { appendSystemLog } = require('./systemPersistence');

describe('systemPersistence', () => {
    it('persists system logs with stable admin-visible fields', () => {
        const now = new Date('2026-04-06T10:20:30.000Z');
        const result = appendSystemLog({}, 'API Anahtarı Güncellendi.', 'Yonetici', now, 'abc123');

        expect(result).toEqual({
            '1775470830000_abc123': {
                id: '1775470830000_abc123',
                user: 'Yonetici',
                action: 'API Anahtarı Güncellendi.',
                date: now.toLocaleString('tr-TR'),
                timestamp: '2026-04-06T10:20:30.000Z',
                createdAt: '2026-04-06T10:20:30.000Z',
            },
        });
    });
});
