type PrismaLike = any

function hasMeaningfulContact(contact: any) {
  if (!contact) return false
  return Boolean(String(contact.name || '').trim() || String(contact.phone || '').trim() || String(contact.email || '').trim())
}

function pickFallbackPrimary(contacts: any[]) {
  const currentPrimary = contacts.find((contact) => contact.isPrimary)
  if (hasMeaningfulContact(currentPrimary)) return currentPrimary
  return contacts.find((contact) => hasMeaningfulContact(contact)) || currentPrimary || contacts[0] || null
}

export async function reconcileAccountPrimaryContact(prisma: PrismaLike, accountId: string) {
  if (!accountId) return null

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      businessName: true,
      contactPerson: true,
      businessContact: true,
      contacts: {
        where: { type: 'PERSON' },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          isPrimary: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      tasks: {
        where: {
          taskContacts: { some: { isPrimary: true } },
        },
        orderBy: [{ updatedAt: 'desc' }, { creationDate: 'desc' }],
        take: 25,
        select: {
          id: true,
          updatedAt: true,
          creationDate: true,
          taskContacts: {
            where: { isPrimary: true },
            take: 1,
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
            select: {
              updatedAt: true,
              createdAt: true,
              contact: {
                select: {
                  id: true,
                  accountId: true,
                  name: true,
                  phone: true,
                  email: true,
                  isPrimary: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!account) return null

  const contacts = Array.isArray(account.contacts) ? account.contacts : []
  let selected = null as any

  for (const task of Array.isArray(account.tasks) ? account.tasks : []) {
    const linkedContact = task?.taskContacts?.[0]?.contact
    if (!linkedContact || linkedContact.accountId !== accountId) continue
    if (!hasMeaningfulContact(linkedContact)) continue
    selected = contacts.find((contact: any) => contact.id === linkedContact.id) || linkedContact
    break
  }

  if (!selected) {
    selected = pickFallbackPrimary(contacts)
  }

  if (!selected?.id) {
    const nextName = String(account.contactPerson || '').trim() || null
    const nextPhone = String(account.businessContact || '').trim() || null
    if (nextName !== account.contactPerson || nextPhone !== account.businessContact) {
      await prisma.account.update({
        where: { id: accountId },
        data: {
          contactPerson: nextName,
          businessContact: nextPhone,
        },
      })
    }
    return null
  }

  await prisma.accountContact.updateMany({
    where: { accountId, type: 'PERSON' },
    data: { isPrimary: false },
  })

  await prisma.accountContact.update({
    where: { id: selected.id },
    data: { isPrimary: true },
  })

  const nextName = String(selected.name || '').trim() || account.businessName || null
  const nextPhone = String(selected.phone || '').trim() || null

  await prisma.account.update({
    where: { id: accountId },
    data: {
      contactPerson: nextName,
      businessContact: nextPhone,
    },
  })

  return selected.id as string
}
