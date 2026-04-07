(function(globalScope) {
    function isPlaceholderContactName(name) {
        const normalized = String(name || '').trim().toLocaleLowerCase('tr-TR');
        return !normalized ||
            normalized === 'isimsiz / genel' ||
            normalized === 'yok' ||
            normalized === '-' ||
            normalized === 'belirtilmemiş' ||
            normalized === 'belirtilmemis';
    }

    function extractPhones(rawStr) {
        if (!rawStr) return [];
        return rawStr.split(/[\/\-,|\\]/).map((part) => {
            let cleaned = String(part || '').replace(/[^\d]/g, '');
            if (cleaned.startsWith('90') && cleaned.length > 10) cleaned = cleaned.substring(2);
            if (cleaned.length === 10 && !cleaned.startsWith('0')) cleaned = '0' + cleaned;
            return cleaned;
        }).filter((phone) => phone.length >= 10);
    }

    function extractEmails(rawStr) {
        if (!rawStr) return [];
        return String(rawStr)
            .split(/[\n,;\/|\\]+/)
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean);
    }

    function buildBusinessContactSnapshot(biz, bizTasks) {
        const safeBiz = biz || {};
        const safeTasks = Array.isArray(bizTasks) ? bizTasks : [];
        const contactMap = new Map();

        const addContact = (name, phoneStr, email) => {
            let resolvedName = name ? String(name).trim() : '';
            if (isPlaceholderContactName(resolvedName)) resolvedName = 'İsimsiz / Genel';

            let matchedKey = null;
            for (const existingName of contactMap.keys()) {
                const normalizedExisting = existingName.toLowerCase();
                const normalizedNext = resolvedName.toLowerCase();
                if (normalizedExisting === 'isimsiz / genel' || normalizedNext === 'isimsiz / genel') continue;
                if (normalizedExisting.includes(normalizedNext)) {
                    matchedKey = existingName;
                    break;
                }
                if (normalizedNext.includes(normalizedExisting)) {
                    const oldData = contactMap.get(existingName);
                    contactMap.delete(existingName);
                    const mergedEmails = oldData.emails || new Set();
                    extractEmails(email).forEach((item) => mergedEmails.add(item));
                    contactMap.set(resolvedName, {
                        name: resolvedName,
                        phones: oldData.phones,
                        emails: mergedEmails,
                    });
                    matchedKey = resolvedName;
                    break;
                }
            }

            const key = matchedKey || resolvedName;
            if (!contactMap.has(key)) {
                contactMap.set(key, { name: key, phones: new Set(), emails: new Set() });
            }

            const person = contactMap.get(key);
            extractEmails(email).forEach((item) => person.emails.add(item));
            extractPhones(phoneStr).forEach((item) => person.phones.add(item));
            return key;
        };

        addContact(safeBiz.contactName, safeBiz.contactPhone, safeBiz.contactEmail);
        if (Array.isArray(safeBiz.extraContacts)) {
            safeBiz.extraContacts.forEach((contact) => addContact(contact.name, contact.phone, contact.email));
        }

        let primaryName = '';
        safeTasks.forEach((task) => {
            if (task.specificContactName || task.specificContactPhone || task.specificContactEmail) {
                const resolvedKey = addContact(task.specificContactName, task.specificContactPhone, task.specificContactEmail);
                const hasMeaningfulName = task.specificContactName && String(task.specificContactName).trim();
                if (!primaryName && hasMeaningfulName && resolvedKey) primaryName = resolvedKey;
            }
        });

        if (!primaryName) primaryName = isPlaceholderContactName(safeBiz.contactName) ? 'İsimsiz / Genel' : safeBiz.contactName;

        if (isPlaceholderContactName(primaryName)) {
            const firstNamedContact = Array.from(contactMap.values()).find((contact) => (
                !isPlaceholderContactName(contact.name)
            ));
            if (firstNamedContact) primaryName = firstNamedContact.name;
        }

        for (const key of contactMap.keys()) {
            if (
                !isPlaceholderContactName(primaryName) &&
                key.toLowerCase().includes(primaryName.toLowerCase())
            ) {
                primaryName = key;
                break;
            }
        }

        const primaryContact = contactMap.get(primaryName) || {
            name: primaryName,
            phones: new Set(),
            emails: new Set(),
        };

        contactMap.delete(primaryName);

        const otherContacts = Array.from(contactMap.values()).filter((contact) => (
            contact.name !== 'İsimsiz / Genel' || contact.phones.size > 0 || contact.emails.size > 0
        ));

        return {
            primaryContact: {
                name: primaryContact.name,
                phones: Array.from(primaryContact.phones),
                emails: Array.from(primaryContact.emails),
            },
            otherContacts: otherContacts.map((contact) => ({
                name: contact.name,
                phones: Array.from(contact.phones),
                emails: Array.from(contact.emails),
            })),
        };
    }

    function resolveTaskContactDisplay(biz, task) {
        const snapshot = buildBusinessContactSnapshot(biz, task ? [task] : []);
        const primaryContact = snapshot.primaryContact || {};
        const primaryPhones = Array.isArray(primaryContact.phones) ? primaryContact.phones : [];
        const primaryEmails = Array.isArray(primaryContact.emails) ? primaryContact.emails : [];

        return {
            name: task?.specificContactName || primaryContact.name || biz?.contactName || 'İsimsiz / Genel',
            phone: task?.specificContactPhone || primaryPhones[0] || biz?.contactPhone || '',
            email: task?.specificContactEmail || primaryEmails[0] || biz?.contactEmail || '',
        };
    }

    const api = {
        buildBusinessContactSnapshot,
        resolveTaskContactDisplay,
        extractEmails,
        extractPhones,
        isPlaceholderContactName,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    globalScope.ContactParity = api;
})(typeof window !== 'undefined' ? window : globalThis);
