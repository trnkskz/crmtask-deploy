import { AccountsService } from './accounts.service'

describe('AccountsService.importBulkData', () => {
  function buildService(overrides: Record<string, any> = {}) {
    const prisma = {
      $transaction: jest.fn().mockImplementation((cb) => cb(prisma)),
      account: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: { findMany: jest.fn() },
      taskList: { findFirst: jest.fn(), create: jest.fn() },
      accountContact: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      task: { create: jest.fn() },
      taskContact: { create: jest.fn() },
      activityLog: { create: jest.fn() },
      ...overrides,
    } as any
    const service = new AccountsService(prisma)
    jest.spyOn(service as any, 'generateAccountPublicId').mockResolvedValue('ACC001')
    return { service, prisma }
  }

  it('creates a task focus-contact and keeps the imported campaign URL on the task', async () => {
    const { service, prisma } = buildService()
    prisma.account.findMany.mockResolvedValue([])
    prisma.user.findMany.mockResolvedValue([{ id: 'user_1', name: 'Ayse' }])
    prisma.taskList.findFirst
      .mockResolvedValueOnce({ id: 'list_active', isActive: true })
      .mockResolvedValueOnce({ id: 'list_archive', name: 'Geçmiş Kayıtlar (CSV Arşivi)' })
    prisma.account.create.mockResolvedValue({ id: 'acc_1' })
    prisma.accountContact.findMany.mockResolvedValue([])
    prisma.accountContact.create.mockResolvedValue({
      id: 'contact_1',
      accountId: 'acc_1',
      name: 'Ayse Demir',
      phone: '05321234567',
      email: 'ayse@example.com',
      isPrimary: true,
    })
    prisma.task.create.mockResolvedValue({ id: 'task_1' })

    await service.importBulkData(
      [
        {
          companyName: 'Lotus Thai Spa',
          contactName: 'Ayşe Demir',
          contactPhone: '532 123 45 67',
          contactEmail: 'ayse@example.com',
          campaignUrl: 'https://example.com/campaign',
          loglama: 'CSV notu',
        },
      ],
      'admin_1',
      'UNASSIGNED',
    )

    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          campaignUrl: 'https://example.com/campaign',
          contact: 'Ayşe Demir / 05321234567',
        }),
      }),
    )
    expect(prisma.taskContact.create).toHaveBeenCalledWith({
      data: {
        taskId: 'task_1',
        contactId: 'contact_1',
        isPrimary: true,
      },
    })
  })

  it('maps imported categories with the richer reference-style normalization', async () => {
    const { service, prisma } = buildService()
    prisma.account.findMany.mockResolvedValue([])
    prisma.user.findMany.mockResolvedValue([])
    prisma.taskList.findFirst
      .mockResolvedValueOnce({ id: 'list_active', isActive: true })
      .mockResolvedValueOnce({ id: 'list_archive', name: 'Geçmiş Kayıtlar (CSV Arşivi)' })
    prisma.account.create.mockResolvedValue({ id: 'acc_2' })
    prisma.accountContact.findMany.mockResolvedValue([])
    prisma.accountContact.create.mockResolvedValue({
      id: 'contact_2',
      accountId: 'acc_2',
      name: 'Yetkili',
      phone: null,
      email: null,
      isPrimary: true,
    })
    prisma.task.create.mockResolvedValue({ id: 'task_2' })

    await service.importBulkData(
      [
        {
          companyName: 'Bella Vita Güzellik Merkezi',
          mainCategory: '',
          subCategory: '',
          loglama: 'Kategori testi',
        },
      ],
      'admin_1',
      'UNASSIGNED',
    )

    expect(prisma.account.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mainCategory: 'Güzellik (Core)',
          subCategory: 'Cilt Bakımı',
        }),
      }),
    )
    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mainCategory: 'Güzellik (Core)',
          subCategory: 'Cilt Bakımı',
        }),
      }),
    )
  })

  it('extracts a likely person name from noisy imported contact text', async () => {
    const { service, prisma } = buildService()
    prisma.account.findMany.mockResolvedValue([])
    prisma.user.findMany.mockResolvedValue([{ id: 'user_1', name: 'Ayse' }])
    prisma.taskList.findFirst
      .mockResolvedValueOnce({ id: 'list_active', isActive: true })
      .mockResolvedValueOnce({ id: 'list_archive', name: 'Geçmiş Kayıtlar (CSV Arşivi)' })
    prisma.account.create.mockResolvedValue({ id: 'acc_3' })
    prisma.accountContact.findMany.mockResolvedValue([])
    prisma.accountContact.create.mockResolvedValue({
      id: 'contact_3',
      accountId: 'acc_3',
      name: 'Selçuk Bey',
      phone: null,
      email: null,
      isPrimary: true,
    })
    prisma.task.create.mockResolvedValue({ id: 'task_3' })

    await service.importBulkData(
      [
        {
          companyName: 'Merkez Hastanesi',
          contactName: 'Hastaneymiş Selçuk Bey İletecek Bana',
          loglama: 'İsim temizleme testi',
        },
      ],
      'admin_1',
      'UNASSIGNED',
    )

    expect(prisma.account.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactPerson: 'Selçuk Bey',
        }),
      }),
    )
    expect(prisma.accountContact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Selçuk Bey',
        }),
      }),
    )
  })

  it('does not treat action phrases like "Kişiye Ulaşmaya" as a contact name', async () => {
    const { service, prisma } = buildService()
    prisma.account.findMany.mockResolvedValue([])
    prisma.user.findMany.mockResolvedValue([])
    prisma.taskList.findFirst
      .mockResolvedValueOnce({ id: 'list_active', isActive: true })
      .mockResolvedValueOnce({ id: 'list_archive', name: 'Geçmiş Kayıtlar (CSV Arşivi)' })
    prisma.account.create.mockResolvedValue({ id: 'acc_phrase' })
    prisma.accountContact.findMany.mockResolvedValue([])
    prisma.task.create.mockResolvedValue({ id: 'task_phrase' })

    await service.importBulkData(
      [
        {
          companyName: 'Phrase Test Ltd',
          contactName: 'Kişiye Ulaşmaya',
          loglama: 'ad testi',
        },
      ],
      'admin_1',
      'UNASSIGNED',
    )

    expect(prisma.account.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactPerson: null,
        }),
      }),
    )
    expect(prisma.accountContact.create).not.toHaveBeenCalled()
  })

  it('does not treat phrases like "Yerine Yok" or "Olumlu Olursa" as contact names', async () => {
    const { service, prisma } = buildService()
    prisma.account.findMany.mockResolvedValue([])
    prisma.user.findMany.mockResolvedValue([])
    prisma.taskList.findFirst
      .mockResolvedValueOnce({ id: 'list_active', isActive: true })
      .mockResolvedValueOnce({ id: 'list_archive', name: 'Geçmiş Kayıtlar (CSV Arşivi)' })
    prisma.account.create
      .mockResolvedValueOnce({ id: 'acc_phrase_1' })
      .mockResolvedValueOnce({ id: 'acc_phrase_2' })
    prisma.accountContact.findMany.mockResolvedValue([])
    prisma.task.create
      .mockResolvedValueOnce({ id: 'task_phrase_1' })
      .mockResolvedValueOnce({ id: 'task_phrase_2' })

    await service.importBulkData(
      [
        { companyName: 'Phrase Test 1', contactName: 'Yerine Yok', loglama: 'ad testi 1' },
        { companyName: 'Phrase Test 2', contactName: 'Olumlu Olursa', loglama: 'ad testi 2' },
      ],
      'admin_1',
      'UNASSIGNED',
    )

    expect(prisma.account.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          contactPerson: null,
        }),
      }),
    )
    expect(prisma.account.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          contactPerson: null,
        }),
      }),
    )
    expect(prisma.accountContact.create).not.toHaveBeenCalled()
  })

  it('filters generic operational notes from contact names instead of memorizing only exact phrases', async () => {
    const { service, prisma } = buildService()
    prisma.account.findMany.mockResolvedValue([])
    prisma.user.findMany.mockResolvedValue([])
    prisma.taskList.findFirst
      .mockResolvedValueOnce({ id: 'list_active', isActive: true })
      .mockResolvedValueOnce({ id: 'list_archive', name: 'Geçmiş Kayıtlar (CSV Arşivi)' })
    prisma.account.create
      .mockResolvedValueOnce({ id: 'acc_note_1' })
      .mockResolvedValueOnce({ id: 'acc_note_2' })
    prisma.accountContact.findMany.mockResolvedValue([])
    prisma.task.create
      .mockResolvedValueOnce({ id: 'task_note_1' })
      .mockResolvedValueOnce({ id: 'task_note_2' })

    await service.importBulkData(
      [
        { companyName: 'Generic Note 1', contactName: 'Müsait olursa yarın arayın', loglama: 'note 1' },
        { companyName: 'Generic Note 2', contactName: 'Sekretere iletilecek bilgi', loglama: 'note 2' },
      ],
      'admin_1',
      'UNASSIGNED',
    )

    expect(prisma.account.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          contactPerson: null,
        }),
      }),
    )
    expect(prisma.account.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          contactPerson: null,
        }),
      }),
    )
    expect(prisma.accountContact.create).not.toHaveBeenCalled()
  })

  it('merges imported business name variants like hotel and restaurant into the same account', async () => {
    const { service, prisma } = buildService()
    prisma.account.findMany.mockResolvedValue([{ id: 'acc_adess', accountName: 'Adess Otel' }])
    prisma.user.findMany.mockResolvedValue([])
    prisma.taskList.findFirst
      .mockResolvedValueOnce({ id: 'list_active', isActive: true })
      .mockResolvedValueOnce({ id: 'list_archive', name: 'Geçmiş Kayıtlar (CSV Arşivi)' })
    prisma.account.findUnique.mockResolvedValue({
      website: null,
      instagram: null,
      campaignUrl: null,
    })
    prisma.accountContact.findMany.mockResolvedValue([])
    prisma.task.create
      .mockResolvedValueOnce({ id: 'task_adess_1' })
      .mockResolvedValueOnce({ id: 'task_adess_2' })
    prisma.accountContact.create.mockResolvedValue({
      id: 'contact_adess',
      accountId: 'acc_adess',
      name: 'Yetkili',
      phone: null,
      email: null,
      isPrimary: true,
    })

    await service.importBulkData(
      [
        { companyName: 'Adess Hotel', loglama: 'otel varyasyonu' },
        { companyName: 'Adess Restaurant & Hotel', loglama: 'restaurant hotel varyasyonu' },
      ],
      'admin_1',
      'UNASSIGNED',
    )

    expect(prisma.account.create).not.toHaveBeenCalled()
    expect(prisma.task.create).toHaveBeenCalledTimes(2)
  })

  it('merges broader business descriptor variants into the same normalized brand core', async () => {
    const { service, prisma } = buildService()
    prisma.account.findMany.mockResolvedValue([{ id: 'acc_nova', accountName: 'Nova Suites' }])
    prisma.user.findMany.mockResolvedValue([])
    prisma.taskList.findFirst
      .mockResolvedValueOnce({ id: 'list_active', isActive: true })
      .mockResolvedValueOnce({ id: 'list_archive', name: 'Geçmiş Kayıtlar (CSV Arşivi)' })
    prisma.account.findUnique.mockResolvedValue({
      website: null,
      instagram: null,
      campaignUrl: null,
    })
    prisma.accountContact.findMany.mockResolvedValue([])
    prisma.task.create
      .mockResolvedValueOnce({ id: 'task_nova_1' })
      .mockResolvedValueOnce({ id: 'task_nova_2' })

    await service.importBulkData(
      [
        { companyName: 'Nova Boutique Hotel & Spa', loglama: 'descriptor varyasyonu 1' },
        { companyName: 'Nova Residence', loglama: 'descriptor varyasyonu 2' },
      ],
      'admin_1',
      'UNASSIGNED',
    )

    expect(prisma.account.create).not.toHaveBeenCalled()
    expect(prisma.task.create).toHaveBeenCalledTimes(2)
  })

  it('does not try to update an existing account with an empty patch during import', async () => {
    const { service, prisma } = buildService()
    prisma.account.findMany.mockResolvedValue([{ id: 'acc_existing', accountName: 'Lotus Thai Spa' }])
    prisma.user.findMany.mockResolvedValue([{ id: 'user_1', name: 'Ayse' }])
    prisma.taskList.findFirst
      .mockResolvedValueOnce({ id: 'list_active', isActive: true })
      .mockResolvedValueOnce({ id: 'list_archive', name: 'Geçmiş Kayıtlar (CSV Arşivi)' })
    prisma.account.findUnique.mockResolvedValue({
      website: 'https://lotus.example.com',
      instagram: '@lotusspa',
      campaignUrl: 'https://example.com/campaign',
    })
    prisma.accountContact.findMany.mockResolvedValue([])
    prisma.accountContact.create.mockResolvedValue({
      id: 'contact_4',
      accountId: 'acc_existing',
      name: 'Ayşe Demir',
      phone: null,
      email: null,
      isPrimary: true,
    })
    prisma.task.create.mockResolvedValue({ id: 'task_4' })

    await service.importBulkData(
      [
        {
          companyName: 'Lotus Thai Spa',
          contactName: 'Ayşe Demir',
          website: 'https://lotus.example.com',
          instagram: '@lotusspa',
          campaignUrl: 'https://example.com/campaign',
          loglama: 'Tekrar import',
        },
      ],
      'admin_1',
      'UNASSIGNED',
    )

    expect(prisma.account.update).not.toHaveBeenCalled()
    expect(prisma.task.create).toHaveBeenCalled()
  })

  it('keeps importing other rows when one row fails', async () => {
    const { service, prisma } = buildService()
    prisma.account.findMany.mockResolvedValue([])
    prisma.user.findMany.mockResolvedValue([])
    prisma.taskList.findFirst
      .mockResolvedValueOnce({ id: 'list_active', isActive: true })
      .mockResolvedValueOnce({ id: 'list_archive', name: 'Geçmiş Kayıtlar (CSV Arşivi)' })
    prisma.account.create
      .mockResolvedValueOnce({ id: 'acc_5' })
      .mockResolvedValueOnce({ id: 'acc_6' })
    prisma.accountContact.findMany.mockResolvedValue([])
    prisma.accountContact.create
      .mockResolvedValueOnce({
        id: 'contact_5',
        accountId: 'acc_5',
        name: 'Yetkili',
        phone: null,
        email: null,
        isPrimary: true,
      })
      .mockResolvedValueOnce({
        id: 'contact_6',
        accountId: 'acc_6',
        name: 'Yetkili',
        phone: null,
        email: null,
        isPrimary: true,
      })
    prisma.task.create
      .mockRejectedValueOnce(new Error('task create failed'))
      .mockResolvedValueOnce({ id: 'task_6' })

    const result = await service.importBulkData(
      [
        { rowNumber: 2, companyName: 'Bozuk Satir Ltd', loglama: 'ilk satir bozulacak' },
        { rowNumber: 3, companyName: 'Saglam Satir Ltd', loglama: 'ikinci satir devam etmeli' },
      ],
      'admin_1',
      'UNASSIGNED',
    )

    expect(result).toEqual(
      expect.objectContaining({
        addedBizCount: 1,
        addedTaskCount: 1,
        processedRowCount: 1,
        failedRowCount: 1,
        errors: [
          expect.objectContaining({
            rowNumber: 2,
            companyName: 'Bozuk Satir Ltd',
            message: 'task create failed',
          }),
        ],
      }),
    )
    expect(prisma.task.create).toHaveBeenCalledTimes(2)
  })

  it('parses excel serial and slash-formatted imported dates safely', async () => {
    const { service, prisma } = buildService()
    prisma.account.findMany.mockResolvedValue([])
    prisma.user.findMany.mockResolvedValue([])
    prisma.taskList.findFirst
      .mockResolvedValueOnce({ id: 'list_active', isActive: true })
      .mockResolvedValueOnce({ id: 'list_archive', name: 'Geçmiş Kayıtlar (CSV Arşivi)' })
    prisma.account.create
      .mockResolvedValueOnce({ id: 'acc_7' })
      .mockResolvedValueOnce({ id: 'acc_8' })
    prisma.accountContact.findMany.mockResolvedValue([])
    prisma.accountContact.create
      .mockResolvedValue({
        id: 'contact_x',
        accountId: 'acc_x',
        name: 'Yetkili',
        phone: null,
        email: null,
        isPrimary: true,
      })
    prisma.task.create
      .mockResolvedValueOnce({ id: 'task_7' })
      .mockResolvedValueOnce({ id: 'task_8' })

    await service.importBulkData(
      [
        { companyName: 'Excel Tarih Ltd', taskTarihi: '44658', aranacakTarih: '44927', loglama: 'excel date' },
        { companyName: 'Slash Tarih Ltd', taskTarihi: '31/12/24', aranacakTarih: '01/01/25', loglama: 'slash date' },
      ],
      'admin_1',
      'UNASSIGNED',
    )

    expect(prisma.task.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          creationDate: new Date('2022-04-07T12:00:00.000Z'),
          dueDate: new Date('2023-01-01T12:00:00.000Z'),
        }),
      }),
    )

    expect(prisma.task.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          creationDate: new Date('2024-12-31T12:00:00.000Z'),
          dueDate: new Date('2025-01-01T12:00:00.000Z'),
        }),
      }),
    )
  })

  it('keeps rows with impossible imported dates by storing them on the sentinel fallback date', async () => {
    const { service, prisma } = buildService()
    prisma.account.findMany.mockResolvedValue([])
    prisma.user.findMany.mockResolvedValue([])
    prisma.taskList.findFirst
      .mockResolvedValueOnce({ id: 'list_active', isActive: true })
      .mockResolvedValueOnce({ id: 'list_archive', name: 'Geçmiş Kayıtlar (CSV Arşivi)' })
    prisma.account.create.mockResolvedValue({ id: 'acc_9' })
    prisma.accountContact.findMany.mockResolvedValue([])
    prisma.accountContact.create.mockResolvedValue({
      id: 'contact_9',
      accountId: 'acc_9',
      name: 'Yetkili',
      phone: null,
      email: null,
      isPrimary: true,
    })
    prisma.task.create.mockResolvedValue({ id: 'task_9' })

    const result = await service.importBulkData(
      [
        { rowNumber: 2, companyName: 'Bozuk Tarih Ltd', taskTarihi: '25.06.3202', loglama: 'gecersiz tarih' },
        { rowNumber: 3, companyName: 'Gecerli Tarih Ltd', taskTarihi: '25.06.2026', loglama: 'gecerli tarih' },
      ],
      'admin_1',
      'UNASSIGNED',
    )

    expect(result).toEqual(
      expect.objectContaining({
        processedRowCount: 2,
        failedRowCount: 0,
        warningCount: 1,
        warnings: [
          expect.objectContaining({
            rowNumber: 2,
            companyName: 'Bozuk Tarih Ltd',
            field: 'taskTarihi',
            originalValue: '25.06.3202',
            fallbackValue: '2000-01-01T12:00:00.000Z',
            message: 'Geçersiz görev tarihi 01.01.2000 olarak kaydedildi: 25.06.3202',
          }),
        ],
      }),
    )
    expect(prisma.task.create).toHaveBeenCalledTimes(2)
    expect(prisma.task.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          creationDate: new Date('2000-01-01T12:00:00.000Z'),
        }),
      }),
    )
    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          creationDate: new Date('2026-06-25T12:00:00.000Z'),
        }),
      }),
    )
  })

  it('stores blank imported task dates on the sentinel fallback date even for new businesses', async () => {
    const { service, prisma } = buildService()
    prisma.account.findMany.mockResolvedValue([])
    prisma.user.findMany.mockResolvedValue([])
    prisma.taskList.findFirst
      .mockResolvedValueOnce({ id: 'list_active', isActive: true })
      .mockResolvedValueOnce({ id: 'list_archive', name: 'Geçmiş Kayıtlar (CSV Arşivi)' })
    prisma.account.create.mockResolvedValue({ id: 'acc_blank_date' })
    prisma.accountContact.findMany.mockResolvedValue([])
    prisma.accountContact.create.mockResolvedValue({
      id: 'contact_blank_date',
      accountId: 'acc_blank_date',
      name: 'Yetkili',
      phone: null,
      email: null,
      isPrimary: true,
    })
    prisma.task.create.mockResolvedValue({ id: 'task_blank_date' })

    await service.importBulkData(
      [
        { rowNumber: 2, companyName: 'Tarihsiz Yeni Isletme', taskTarihi: '', loglama: 'bos tarih' },
      ],
      'admin_1',
      'UNASSIGNED',
    )

    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          creationDate: new Date('2000-01-01T12:00:00.000Z'),
        }),
      }),
    )
  })

  it('rejects malformed shifted csv rows before they become sentinel-dated tasks', async () => {
    const { service, prisma } = buildService()
    prisma.account.findMany.mockResolvedValue([])
    prisma.user.findMany.mockResolvedValue([])
    prisma.taskList.findFirst
      .mockResolvedValueOnce({ id: 'list_active', isActive: true })
      .mockResolvedValueOnce({ id: 'list_archive', name: 'Geçmiş Kayıtlar (CSV Arşivi)' })
    prisma.account.create.mockResolvedValue({ id: 'acc_shifted' })
    prisma.accountContact.findMany.mockResolvedValue([])
    prisma.task.create.mockResolvedValue({ id: 'task_shifted' })

    const result = await service.importBulkData(
      [
        {
          rowNumber: 3684,
          companyName: 'Ottoman Sports (istanbul\nQuery\n\nDaha önce de query gelmişti ancak ....\n\nhttps://www.instagram.com/ottomansports/?hl=en)',
          taskTarihi: 'İSTANBUL\nQUERY\n\nDaha önce de query gelmişti ancak ….\n\nhttps://www.instagram.com/ottomansports/?hl=en',
          loglama: 'kaymis satir',
        },
      ],
      'admin_1',
      'UNASSIGNED',
    )

    expect(result).toEqual(
      expect.objectContaining({
        processedRowCount: 0,
        failedRowCount: 1,
        errors: [
          expect.objectContaining({
            rowNumber: 3684,
            companyName: expect.stringContaining('Ottoman Sports'),
            message: expect.stringContaining('Satır kaymış görünüyor'),
          }),
        ],
      }),
    )
    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it('keeps csv sonSatisci as historical assignee when default assignee is UNASSIGNED', async () => {
    const { service, prisma } = buildService()
    prisma.account.findMany.mockResolvedValue([])
    prisma.user.findMany.mockResolvedValue([{ id: 'user_1', name: 'Ayse Demir' }])
    prisma.taskList.findFirst
      .mockResolvedValueOnce({ id: 'list_active', isActive: true })
      .mockResolvedValueOnce({ id: 'list_archive', name: 'Geçmiş Kayıtlar (CSV Arşivi)' })
    prisma.account.create.mockResolvedValue({ id: 'acc_9' })
    prisma.accountContact.findMany.mockResolvedValue([])
    prisma.accountContact.create.mockResolvedValue({
      id: 'contact_9',
      accountId: 'acc_9',
      name: 'Yetkili',
      phone: null,
      email: null,
      isPrimary: true,
    })
    prisma.task.create.mockResolvedValue({ id: 'task_9' })

    await service.importBulkData(
      [
        {
          companyName: 'Legacy Salesperson Ltd',
          sonSatisci: 'Eski Calisan',
          loglama: 'assignee parity testi',
        },
      ],
      'admin_1',
      'UNASSIGNED',
    )

    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: null,
          historicalAssignee: 'Eski Calisan',
        }),
      }),
    )
  })

  it('uses explicit default assignee override only when a real user is selected', async () => {
    const { service, prisma } = buildService()
    prisma.account.findMany.mockResolvedValue([])
    prisma.user.findMany.mockResolvedValue([{ id: 'user_1', name: 'Ayse Demir' }])
    prisma.taskList.findFirst
      .mockResolvedValueOnce({ id: 'list_active', isActive: true })
      .mockResolvedValueOnce({ id: 'list_archive', name: 'Geçmiş Kayıtlar (CSV Arşivi)' })
    prisma.account.create.mockResolvedValue({ id: 'acc_10' })
    prisma.accountContact.findMany.mockResolvedValue([])
    prisma.accountContact.create.mockResolvedValue({
      id: 'contact_10',
      accountId: 'acc_10',
      name: 'Yetkili',
      phone: null,
      email: null,
      isPrimary: true,
    })
    prisma.task.create.mockResolvedValue({ id: 'task_10' })

    await service.importBulkData(
      [
        {
          companyName: 'Override Salesperson Ltd',
          sonSatisci: 'Eski Calisan',
          loglama: 'assignee override testi',
        },
      ],
      'admin_1',
      'Ayse Demir',
    )

    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: 'user_1',
          historicalAssignee: null,
        }),
      }),
    )
  })

  it('falls back to deal when durum is empty but log indicates agreement', async () => {
    const { service, prisma } = buildService()
    prisma.account.findMany.mockResolvedValue([])
    prisma.user.findMany.mockResolvedValue([])
    prisma.taskList.findFirst
      .mockResolvedValueOnce({ id: 'list_active', isActive: true })
      .mockResolvedValueOnce({ id: 'list_archive', name: 'Geçmiş Kayıtlar (CSV Arşivi)' })
    prisma.account.create.mockResolvedValue({ id: 'acc_11' })
    prisma.accountContact.findMany.mockResolvedValue([])
    prisma.taskContact.create.mockResolvedValue({ id: 'task_contact_11' })
    prisma.task.create.mockResolvedValue({ id: 'task_11' })

    await service.importBulkData(
      [
        {
          companyName: 'Durum Bos Deal Ltd',
          durum: '',
          loglama: 'Müşteri ile anlaşıldı, ödeme alındı.',
        },
      ],
      'admin_1',
      'UNASSIGNED',
    )

    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DEAL',
          generalStatus: 'CLOSED',
        }),
      }),
    )
  })

  it('falls back to cold when durum is empty and log has no deal signal', async () => {
    const { service, prisma } = buildService()
    prisma.account.findMany.mockResolvedValue([])
    prisma.user.findMany.mockResolvedValue([])
    prisma.taskList.findFirst
      .mockResolvedValueOnce({ id: 'list_active', isActive: true })
      .mockResolvedValueOnce({ id: 'list_archive', name: 'Geçmiş Kayıtlar (CSV Arşivi)' })
    prisma.account.create.mockResolvedValue({ id: 'acc_12' })
    prisma.accountContact.findMany.mockResolvedValue([])
    prisma.task.create.mockResolvedValue({ id: 'task_12' })

    await service.importBulkData(
      [
        {
          companyName: 'Durum Bos Cold Ltd',
          durum: '',
          loglama: 'Görüşüldü, dönüş beklenmedi.',
        },
      ],
      'admin_1',
      'UNASSIGNED',
    )

    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COLD',
          generalStatus: 'CLOSED',
        }),
      }),
    )
  })
})

describe('AccountsService.update', () => {
  function buildUpdateService(overrides: Record<string, any> = {}) {
    const prisma = {
      account: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      accountContact: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      taskContact: {
        updateMany: jest.fn(),
      },
      activityHistory: {
        create: jest.fn(),
      },
      ...overrides,
    } as any
    const service = new AccountsService(prisma)
    return { service, prisma }
  }

  it('re-links task contacts before removing merged duplicate extra contacts', async () => {
    const { service, prisma } = buildUpdateService()
    prisma.account.update.mockResolvedValue({
      id: 'acc_1',
      businessName: 'Demo Biz',
      address: null,
    })
    prisma.account.findUnique.mockResolvedValue({
      id: 'acc_1',
      mainCategory: 'Demo Main',
      subCategory: 'Demo Sub',
      source: 'FRESH',
      type: 'KEY',
      status: 'ACTIVE',
      businessName: 'Demo Biz',
      accountName: 'Demo Biz',
      city: null,
      district: null,
      address: null,
      businessContact: null,
      contactPerson: null,
      notes: null,
      website: null,
      instagram: null,
      campaignUrl: null,
    })
    prisma.accountContact.findFirst.mockResolvedValue({
      id: 'primary_1',
      accountId: 'acc_1',
      name: 'Ana Kişi',
      phone: '05321234567',
      email: 'ana@example.com',
      address: null,
      isPrimary: true,
    })
    prisma.accountContact.findMany.mockResolvedValue([
      {
        id: 'extra_keep',
        accountId: 'acc_1',
        name: 'Ayşe',
        phone: '05321111111',
        email: 'ayse@example.com',
        isPrimary: false,
        taskLinks: [{ id: 'tc_1' }],
      },
      {
        id: 'extra_dup',
        accountId: 'acc_1',
        name: 'Ayşe',
        phone: '05321111111',
        email: 'ayse@example.com',
        isPrimary: false,
        taskLinks: [{ id: 'tc_2' }],
      },
    ])

    await service.update('acc_1', {
      extraContacts: [{ name: 'Ayşe', phone: '05321111111', email: 'ayse@example.com' }],
    } as any)

    expect(prisma.accountContact.delete).not.toHaveBeenCalled()
  })
})
