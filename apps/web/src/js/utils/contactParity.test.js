const { buildBusinessContactSnapshot, resolveTaskContactDisplay } = require('./contactParity');

describe('buildBusinessContactSnapshot', () => {
    it('keeps the account primary contact when focus contact has no name but account already has one', () => {
        const snapshot = buildBusinessContactSnapshot(
            {
                contactName: 'Merkez Santral',
                contactPhone: '0212 555 00 00',
                contactEmail: 'info@example.com',
                extraContacts: [],
            },
            [
                {
                    specificContactPhone: '5321234567',
                    specificContactEmail: 'focus@example.com',
                },
            ],
        );

        expect(snapshot.primaryContact.name).toBe('Merkez Santral');
        expect(snapshot.primaryContact.phones).toEqual(['02125550000']);
        expect(snapshot.primaryContact.emails).toEqual(['info@example.com']);
        expect(snapshot.otherContacts).toEqual([
            {
                name: 'İsimsiz / Genel',
                phones: ['05321234567'],
                emails: ['focus@example.com'],
            },
        ]);
    });

    it('merges task focus contact into the matching business contact and keeps it primary', () => {
        const snapshot = buildBusinessContactSnapshot(
            {
                contactName: 'Ayse',
                contactPhone: '0212 444 00 00',
                contactEmail: 'ayse@company.com',
                extraContacts: [
                    { name: 'Mehmet', phone: '0533 000 11 22', email: 'mehmet@company.com' },
                ],
            },
            [
                {
                    specificContactName: 'Ayse Hanim',
                    specificContactPhone: '0532 111 22 33',
                },
            ],
        );

        expect(snapshot.primaryContact.name).toBe('Ayse Hanim');
        expect(snapshot.primaryContact.phones).toEqual(['02124440000', '05321112233']);
        expect(snapshot.primaryContact.emails).toEqual(['ayse@company.com']);
        expect(snapshot.otherContacts).toEqual([
            {
                name: 'Mehmet',
                phones: ['05330001122'],
                emails: ['mehmet@company.com'],
            },
        ]);
    });

    it('prefers a named business contact over an unnamed phone-only focus contact', () => {
        const snapshot = buildBusinessContactSnapshot(
            {
                contactName: '',
                contactPhone: '',
                contactEmail: '',
                extraContacts: [
                    { name: 'Berna Hanim', phone: '0532 000 11 22', email: '' },
                ],
            },
            [
                {
                    specificContactPhone: '05329998877',
                    specificContactEmail: '',
                },
            ],
        );

        expect(snapshot.primaryContact.name).toBe('Berna Hanim');
        expect(snapshot.primaryContact.phones).toEqual(['05320001122']);
        expect(snapshot.otherContacts).toEqual([
            {
                name: 'İsimsiz / Genel',
                phones: ['05329998877'],
                emails: [],
            },
        ]);
    });

    it('treats placeholder names like Yok as unnamed and promotes a real extra contact', () => {
        const snapshot = buildBusinessContactSnapshot(
            {
                contactName: 'Yok',
                contactPhone: '',
                contactEmail: '',
                extraContacts: [
                    { name: 'Berna Hanim', phone: '0544 204 67 86', email: '' },
                ],
            },
            [],
        );

        expect(snapshot.primaryContact.name).toBe('Berna Hanim');
        expect(snapshot.primaryContact.phones).toEqual(['05442046786']);
        expect(snapshot.otherContacts).toEqual([]);
    });

    it('uses the resolved primary name in task-level fallback while keeping the task-specific phone', () => {
        const resolved = resolveTaskContactDisplay(
            {
                contactName: 'Yok',
                contactPhone: '',
                contactEmail: '',
                extraContacts: [
                    { name: 'Berna Hanim', phone: '0544 204 67 86', email: 'berna@example.com' },
                ],
            },
            {
                specificContactPhone: '0532 999 88 77',
                specificContactEmail: '',
            },
        );

        expect(resolved).toEqual({
            name: 'Berna Hanim',
            phone: '0532 999 88 77',
            email: 'berna@example.com',
        });
    });
});
