const {
    extractProjectPeriod,
    formatProjectPeriod,
    isValidPhone,
    normalizeTaskSourceKey,
    sortTasksByUrgency,
    sortTasksByUrgencyOldest,
} = require('./helpers');

describe('isValidPhone', () => {
    it('accepts Turkish mobile, landline, and 0850 corporate numbers', () => {
        expect(isValidPhone('05321234567')).toBe(true);
        expect(isValidPhone('02123535565')).toBe(true);
        expect(isValidPhone('08501234567')).toBe(true);
        expect(isValidPhone('2123535565')).toBe(true);
        expect(isValidPhone('8501234567')).toBe(true);
    });

    it('rejects malformed or obviously fake numbers', () => {
        expect(isValidPhone('01123535565')).toBe(false);
        expect(isValidPhone('11111111111')).toBe(false);
        expect(isValidPhone('12345')).toBe(false);
    });
});

describe('project period helpers', () => {
    it('extracts valid month and year from project description', () => {
        expect(extractProjectPeriod({ description: 'Nisan 2026' })).toEqual({
            month: 'Nisan',
            year: '2026',
            display: 'Nisan 2026',
        });
    });

    it('ignores malformed far-future year noise in project description', () => {
        expect(extractProjectPeriod({ description: '3202, 3023, 2925' })).toEqual({
            month: '',
            year: '',
            display: '',
        });
        expect(formatProjectPeriod({ description: '3202, 3023, 2925' })).toBe('-');
    });
});

describe('task sorting helpers', () => {
    const overdueFollowup = {
        id: 'task-overdue',
        status: 'followup',
        nextCallDate: '2026-04-01',
        logs: [{ date: '01.04.2026 09:00' }],
        createdAt: '2026-04-01T09:00:00.000Z',
    };

    const newerHot = {
        id: 'task-newer',
        status: 'hot',
        logs: [{ date: '06.04.2026 12:00' }],
        createdAt: '2026-04-06T12:00:00.000Z',
    };

    const olderNew = {
        id: 'task-older',
        status: 'new',
        logs: [{ date: '03.04.2026 12:00' }],
        createdAt: '2026-04-03T12:00:00.000Z',
    };

    it('keeps overdue followups first, then sorts remaining tasks by latest activity for newest mode', () => {
        const ordered = [olderNew, newerHot, overdueFollowup].sort(sortTasksByUrgency);
        expect(ordered.map((task) => task.id)).toEqual(['task-overdue', 'task-newer', 'task-older']);
    });

    it('keeps overdue followups first, then sorts remaining tasks by oldest activity for oldest mode', () => {
        const ordered = [newerHot, overdueFollowup, olderNew].sort(sortTasksByUrgencyOldest);
        expect(ordered.map((task) => task.id)).toEqual(['task-overdue', 'task-older', 'task-newer']);
    });
});

describe('source normalization helpers', () => {
    it('normalizes Old Account Rakip distinctly from Rakip and Old Account', () => {
        expect(normalizeTaskSourceKey('Old Account Rakip')).toBe('OLD_RAKIP');
        expect(normalizeTaskSourceKey('OLD_RAKIP')).toBe('OLD_RAKIP');
        expect(normalizeTaskSourceKey('Rakip')).toBe('RAKIP');
        expect(normalizeTaskSourceKey('Old Account')).toBe('OLD');
    });
});
