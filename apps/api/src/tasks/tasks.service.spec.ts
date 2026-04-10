import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { TasksService } from './tasks.service'

describe('TasksService.create', () => {
  const baseDto = {
    taskListId: 'list_1',
    accountId: 'acc_1',
    category: 'ISTANBUL_CORE',
    type: 'GENERAL',
    priority: 'MEDIUM',
    accountType: 'KEY',
    source: 'FRESH',
    mainCategory: 'Main',
    subCategory: 'Sub',
    details: 'details',
  } as any

  function buildService(overrides: Record<string, any> = {}) {
    const prisma = {
      $transaction: jest.fn().mockImplementation((cb) => cb(prisma)),
      taskList: { findUnique: jest.fn(), findFirst: jest.fn() },
      account: { findUnique: jest.fn() },
      task: { findFirst: jest.fn(), create: jest.fn() },
      activityHistory: { create: jest.fn() },
      accountContact: { create: jest.fn() },
      activityLog: { create: jest.fn() },
      user: { findUnique: jest.fn() },
      ...overrides,
    } as any
    const service = new TasksService(prisma)
    return { service, prisma }
  }

  it('throws NotFoundException when task list does not exist', async () => {
    const { service, prisma } = buildService()
    prisma.taskList.findUnique.mockResolvedValue(null)

    await expect(service.create({ id: 'u1', role: 'ADMIN' }, baseDto)).rejects.toBeInstanceOf(NotFoundException)
    expect(prisma.account.findUnique).not.toHaveBeenCalled()
  })

  it('throws BadRequestException when account does not exist', async () => {
    const { service, prisma } = buildService()
    prisma.taskList.findUnique.mockResolvedValue({ id: 'list_1', tag: 'GENERAL' })
    prisma.account.findUnique.mockResolvedValue(null)

    await expect(service.create({ id: 'u1', role: 'ADMIN' }, baseDto)).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it('creates task and history when task list and account are valid', async () => {
    const { service, prisma } = buildService()
    prisma.taskList.findUnique.mockResolvedValue({ id: 'list_1', tag: 'GENERAL' })
    prisma.account.findUnique.mockResolvedValue({ id: 'acc_1' })
    prisma.task.findFirst.mockResolvedValue(null)
    prisma.task.create.mockResolvedValue({ id: 'task_1', ownerId: null, dueDate: null })
    prisma.activityHistory.create.mockResolvedValue({ id: 'hist_1' })

    const result = await service.create({ id: 'u1', role: 'ADMIN' }, baseDto)

    expect(result.id).toBe('task_1')
    expect(prisma.task.create).toHaveBeenCalledTimes(1)
    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          taskListId: 'list_1',
          accountId: 'acc_1',
          createdById: 'u1',
          type: 'GENERAL',
        }),
      }),
    )
    expect(prisma.activityHistory.create).toHaveBeenCalledTimes(1)
  })

  it('rejects non-sales owners on task creation', async () => {
    const { service, prisma } = buildService()
    prisma.taskList.findUnique.mockResolvedValue({ id: 'list_1', tag: 'GENERAL' })
    prisma.account.findUnique.mockResolvedValue({ id: 'acc_1' })
    prisma.user.findUnique.mockResolvedValue({ id: 'lead_1', role: 'TEAM_LEADER' })

    await expect(
      service.create({ id: 'u1', role: 'ADMIN' }, { ...baseDto, ownerId: 'lead_1' } as any),
    ).rejects.toBeInstanceOf(BadRequestException)

    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it('persists projectId on project task creation without abusing taskListId', async () => {
    const { service, prisma } = buildService({
      project: { findUnique: jest.fn() },
    })
    prisma.taskList.findUnique.mockResolvedValue({ id: 'list_project', tag: 'PROJECT' })
    prisma.account.findUnique.mockResolvedValue({ id: 'acc_1' })
    prisma.project.findUnique.mockResolvedValue({ id: 'proj_1' })
    prisma.task.findFirst.mockResolvedValue(null)
    prisma.task.create.mockResolvedValue({ id: 'task_project_1', ownerId: null, dueDate: null, projectId: 'proj_1' })
    prisma.activityHistory.create.mockResolvedValue({ id: 'hist_project_1' })

    await service.create(
      { id: 'u1', role: 'ADMIN' },
      {
        ...baseDto,
        taskListId: 'list_project',
        type: 'PROJECT',
        projectId: 'proj_1',
      } as any,
    )

    expect(prisma.project.findUnique).toHaveBeenCalledWith({ where: { id: 'proj_1' }, select: { id: true } })
    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          taskListId: 'list_project',
          projectId: 'proj_1',
        }),
      }),
    )
  })

  it('writes a dedicated system log when create payload includes systemLogText', async () => {
    const { service, prisma } = buildService()
    prisma.taskList.findUnique.mockResolvedValue({ id: 'list_1', tag: 'GENERAL' })
    prisma.account.findUnique.mockResolvedValue({ id: 'acc_1' })
    prisma.task.findFirst.mockResolvedValue(null)
    prisma.task.create.mockResolvedValue({ id: 'task_1', ownerId: null, dueDate: null })
    prisma.activityHistory.create.mockResolvedValue({ id: 'hist_1' })

    await service.create(
      { id: 'u1', role: 'ADMIN' },
      {
        ...baseDto,
        systemLogText: '<span class="manager-note">[Sistem]</span> Yeni kayıt oluşturuldu ve satışçı görevi başlattı.',
      },
    )

    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskId: 'task_1',
        authorId: 'u1',
        reason: 'TEKRAR_ARANACAK',
        text: '<span class="manager-note">[Sistem]</span> Yeni kayıt oluşturuldu ve satışçı görevi başlattı.',
      }),
    })
    expect(prisma.activityLog.create).not.toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskId: 'task_1',
        text: expect.stringContaining('Görev atandı: Hedef ->'),
      }),
    })
  })

  it('does not write a duplicate task note for request-flow placeholder text when system log exists', async () => {
    const { service, prisma } = buildService()
    prisma.taskList.findUnique.mockResolvedValue({ id: 'list_1', tag: 'GENERAL' })
    prisma.account.findUnique.mockResolvedValue({ id: 'acc_1' })
    prisma.task.findFirst.mockResolvedValue(null)
    prisma.task.create.mockResolvedValue({ id: 'task_1', ownerId: null, dueDate: null })
    prisma.activityHistory.create.mockResolvedValue({ id: 'hist_1' })

    await service.create(
      { id: 'u1', role: 'ADMIN' },
      {
        ...baseDto,
        details: 'Yeni kayıt oluşturuldu ve satışçı görevi başlattı',
        systemLogText: '<span class="manager-note">[Sistem]</span> Yeni kayıt oluşturuldu ve satışçı görevi başlattı.',
      },
    )

    expect(prisma.activityLog.create).toHaveBeenCalledTimes(1)
    expect(prisma.activityLog.create).not.toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskId: 'task_1',
        text: expect.stringContaining('[Görev Notu]'),
      }),
    })
  })

  it('keeps a real task note when system log exists but note is user-provided', async () => {
    const { service, prisma } = buildService()
    prisma.taskList.findUnique.mockResolvedValue({ id: 'list_1', tag: 'GENERAL' })
    prisma.account.findUnique.mockResolvedValue({ id: 'acc_1' })
    prisma.task.findFirst.mockResolvedValue(null)
    prisma.task.create.mockResolvedValue({ id: 'task_1', ownerId: null, dueDate: null })
    prisma.activityHistory.create.mockResolvedValue({ id: 'hist_1' })

    await service.create(
      { id: 'u1', role: 'ADMIN' },
      {
        ...baseDto,
        details: 'Müşteriyle konuşuldu, yarın tekrar aranacak',
        systemLogText: '<span class="manager-note">[Sistem]</span> Yeni kayıt oluşturuldu ve görev başlatıldı.',
      },
    )

    expect(prisma.activityLog.create).toHaveBeenCalledTimes(2)
    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskId: 'task_1',
        text: expect.stringContaining('[Görev Notu]'),
      }),
    })
  })

  it('formats deal duration once when duration already includes Ay', async () => {
    const { service, prisma } = buildService({
      task: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      offer: { create: jest.fn() },
    })
    prisma.task.findUnique.mockResolvedValue({ id: 'task_1', ownerId: 'u1', accountId: 'acc_1', status: 'NEW' })
    prisma.task.update.mockResolvedValue({ id: 'task_1', ownerId: 'u1', accountId: 'acc_1', status: 'DEAL' })
    prisma.activityLog.findFirst = jest.fn().mockResolvedValue(null)
    prisma.activityLog.create.mockResolvedValue({ id: 'log_1' })
    prisma.offer.create.mockResolvedValue({ id: 'offer_1' })

    await service.update(
      { id: 'u1', role: 'ADMIN' },
      'task_1',
      { status: 'deal', dealDetails: { commission: '1', duration: '1 Ay', fee: 'Yok', joker: 'Yok', campCount: '1' } } as any,
    )

    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        text: expect.stringContaining('Süre: 1 Ay |'),
      }),
    })
  })
})

describe('TasksService.detail', () => {
  function buildService(overrides: Record<string, any> = {}) {
    const prisma = {
      task: { findUnique: jest.fn() },
      ...overrides,
    } as any
    const service = new TasksService(prisma)
    return { service, prisma }
  }

  it('returns nextCallDate from the latest follow-up log and requests offers in descending order', async () => {
    const { service, prisma } = buildService()
    const followUpDate = new Date('2026-04-06T09:30:00.000Z')
    prisma.task.findUnique.mockResolvedValue({
      id: 'task_1',
      owner: { id: 'owner_1', name: 'Ayse', email: 'ayse@example.com' },
      logs: [{ id: 'log_1', followUpDate }],
      offers: [{ id: 'offer_2' }, { id: 'offer_1' }],
    })

    const result: any = await service.detail('task_1')

    expect(prisma.task.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'task_1' },
        include: expect.objectContaining({
          owner: { select: { id: true, name: true, email: true } },
          offers: { orderBy: { createdAt: 'desc' } },
        }),
      }),
    )
    expect(result.nextCallDate).toBe(followUpDate)
    expect(result.owner?.name).toBe('Ayse')
    expect(result.offers).toHaveLength(2)
  })

  it('throws NotFoundException when task does not exist', async () => {
    const { service, prisma } = buildService()
    prisma.task.findUnique.mockResolvedValue(null)

    await expect(service.detail('missing')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('falls back to the account primary contact when legacy tasks have no task contact', async () => {
    const { service, prisma } = buildService()
    prisma.task.findUnique.mockResolvedValue({
      id: 'task_legacy',
      account: {
        id: 'acc_1',
        accountName: 'Legacy Isletme',
        contacts: [
          {
            id: 'contact_1',
            name: 'Fatma Demir',
            phone: '05005556677',
            email: 'fatma@example.com',
            isPrimary: true,
          },
        ],
      },
      owner: { id: 'owner_1', name: 'Ayse', email: 'ayse@example.com' },
      logs: [],
      offers: [],
      taskContacts: [],
    })

    const result: any = await service.detail('task_legacy')

    expect(result.specificContactName).toBe('Fatma Demir')
    expect(result.specificContactPhone).toBe('05005556677')
    expect(result.specificContactEmail).toBe('fatma@example.com')
  })
})

describe('TasksService.upsertFocusContact', () => {
  function buildService(overrides: Record<string, any> = {}) {
    const prisma = {
      $transaction: jest.fn().mockImplementation((cb) => cb(prisma)),
      task: { findUnique: jest.fn() },
      accountContact: {
        update: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      taskContact: {
        updateMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      activityLog: { create: jest.fn() },
      ...overrides,
    } as any
    const service = new TasksService(prisma)
    jest.spyOn(service, 'detail').mockResolvedValue({ id: 'task_1', specificContactName: 'stub' } as any)
    return { service, prisma }
  }

  it('merges phone into the current primary contact when name is omitted', async () => {
    const { service, prisma } = buildService()
    prisma.task.findUnique.mockResolvedValue({
      id: 'task_1',
      accountId: 'acc_1',
      ownerId: 'sales_1',
      account: {
        contacts: [
          {
            id: 'contact_primary',
            name: 'Ayse Yilmaz',
            phone: '05321234567',
            email: 'ayse@example.com',
            isPrimary: true,
          },
        ],
      },
      taskContacts: [],
    })
    prisma.accountContact.update.mockResolvedValue({ id: 'contact_primary' })
    prisma.taskContact.findFirst.mockResolvedValue(null)

    await service.upsertFocusContact(
      { id: 'sales_1', role: 'SALESPERSON' },
      'task_1',
      { phone: '05443332211' } as any,
    )

    expect(prisma.accountContact.updateMany).not.toHaveBeenCalled()
    expect(prisma.accountContact.update).toHaveBeenCalledWith({
      where: { id: 'contact_primary' },
      data: expect.objectContaining({
        name: 'Ayse Yilmaz',
        phone: '05321234567, 05443332211',
        email: 'ayse@example.com',
        isPrimary: true,
      }),
    })
    expect(prisma.taskContact.create).toHaveBeenCalledWith({
      data: { taskId: 'task_1', contactId: 'contact_primary', isPrimary: true },
    })
    expect(prisma.activityLog.create).toHaveBeenCalledTimes(1)
  })

  it('promotes a matching extra contact to primary and reuses the existing task contact row', async () => {
    const { service, prisma } = buildService()
    prisma.task.findUnique.mockResolvedValue({
      id: 'task_1',
      accountId: 'acc_1',
      ownerId: 'manager_1',
      account: {
        contacts: [
          {
            id: 'contact_primary',
            name: 'Ayse Yilmaz',
            phone: '05321234567',
            email: 'ayse@example.com',
            isPrimary: true,
          },
          {
            id: 'contact_extra',
            name: 'Mehmet Kaya',
            phone: '05001112233',
            email: 'mehmet@old.example.com',
            isPrimary: false,
          },
        ],
      },
      taskContacts: [{ id: 'task_contact_old', contactId: 'contact_extra', isPrimary: false }],
    })
    prisma.accountContact.update.mockResolvedValue({ id: 'contact_extra' })
    prisma.taskContact.findFirst.mockResolvedValue({ id: 'task_contact_old' })

    await service.upsertFocusContact(
      { id: 'manager_1', role: 'MANAGER' },
      'task_1',
      { name: 'mehmet kaya', email: 'mehmet@new.example.com' } as any,
    )

    expect(prisma.accountContact.updateMany).toHaveBeenCalledWith({
      where: { accountId: 'acc_1', type: 'PERSON' },
      data: { isPrimary: false },
    })
    expect(prisma.accountContact.update).toHaveBeenCalledWith({
      where: { id: 'contact_extra' },
      data: expect.objectContaining({
        name: 'Mehmet Kaya',
        phone: '05001112233',
        email: 'mehmet@old.example.com, mehmet@new.example.com',
        isPrimary: true,
      }),
    })
    expect(prisma.taskContact.update).toHaveBeenCalledWith({
      where: { id: 'task_contact_old' },
      data: { isPrimary: true },
    })
    expect(prisma.taskContact.create).not.toHaveBeenCalled()
  })

  it('creates a new primary contact when the name does not match any existing contact', async () => {
    const { service, prisma } = buildService()
    prisma.task.findUnique.mockResolvedValue({
      id: 'task_1',
      accountId: 'acc_1',
      ownerId: 'manager_1',
      account: {
        contacts: [
          {
            id: 'contact_primary',
            name: 'Ayse Yilmaz',
            phone: '05321234567',
            email: 'ayse@example.com',
            isPrimary: true,
          },
        ],
      },
      taskContacts: [],
    })
    prisma.accountContact.create.mockResolvedValue({ id: 'contact_new' })
    prisma.taskContact.findFirst.mockResolvedValue(null)

    await service.upsertFocusContact(
      { id: 'manager_1', role: 'MANAGER' },
      'task_1',
      { name: 'Fatma Demir', phone: '05005556677', email: 'fatma@example.com' } as any,
    )

    expect(prisma.accountContact.updateMany).toHaveBeenCalledWith({
      where: { accountId: 'acc_1', type: 'PERSON' },
      data: { isPrimary: false },
    })
    expect(prisma.accountContact.create).toHaveBeenCalledWith({
      data: {
        accountId: 'acc_1',
        type: 'PERSON',
        name: 'Fatma Demir',
        phone: '05005556677',
        email: 'fatma@example.com',
        isPrimary: true,
      },
    })
    expect(prisma.taskContact.create).toHaveBeenCalledWith({
      data: { taskId: 'task_1', contactId: 'contact_new', isPrimary: true },
    })
  })
})

describe('TasksService.update', () => {
  function buildService(overrides: Record<string, any> = {}) {
    const prisma = {
      $transaction: jest.fn().mockImplementation((cb) => cb(prisma)),
      task: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      taskList: { findUnique: jest.fn() },
      activityLog: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
      offer: { create: jest.fn(), updateMany: jest.fn() },
      account: { update: jest.fn() },
      activityHistory: { create: jest.fn() },
      ...overrides,
    } as any
    const service = new TasksService(prisma)
    return { service, prisma }
  }

  it('applies status and activity in a single update request', async () => {
    const { service, prisma } = buildService()
    prisma.task.findUnique.mockResolvedValue({
      id: 'task_1',
      accountId: 'acc_1',
      ownerId: 'sales_1',
      createdById: 'manager_1',
      taskListId: 'list_1',
      generalStatus: 'OPEN',
    })
    prisma.taskList.findUnique.mockResolvedValue({ id: 'list_1', tag: 'GENERAL' })
    prisma.task.update.mockResolvedValue({ id: 'task_1', status: 'FOLLOWUP' })
    prisma.activityLog.create.mockResolvedValue({ id: 'log_1' })

    await service.update(
      { id: 'sales_1', role: 'SALESPERSON' },
      'task_1',
      {
        status: 'followup',
        nextCallDate: '2026-04-07T10:30:00.000Z',
        activity: {
          reason: 'TEKRAR_ARANACAK',
          text: '[Tekrar Aranacak] (Tarih: 07.04.2026 13:30) Müşteri daha sonra aranacak',
          followUpDate: '2026-04-07T10:30:00.000Z',
        },
      },
    )

    expect(prisma.task.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'task_1' },
        data: expect.objectContaining({
          status: 'FOLLOWUP',
          generalStatus: 'OPEN',
        }),
      }),
    )
    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskId: 'task_1',
        authorId: 'sales_1',
        reason: 'TEKRAR_ARANACAK',
        text: '[Tekrar Aranacak] (Tarih: 07.04.2026 13:30) Müşteri daha sonra aranacak',
        followUpDate: new Date('2026-04-07T10:30:00.000Z'),
      }),
    })
    expect(prisma.activityLog.findFirst).not.toHaveBeenCalled()
  })

  it('normalizes ui status aliases like NOTHOT during update', async () => {
    const { service, prisma } = buildService()
    prisma.task.findUnique.mockResolvedValue({
      id: 'task_1',
      accountId: 'acc_1',
      ownerId: 'sales_1',
      createdById: 'manager_1',
      taskListId: 'list_1',
      generalStatus: 'OPEN',
    })
    prisma.taskList.findUnique.mockResolvedValue({ id: 'list_1', tag: 'GENERAL' })
    prisma.task.update.mockResolvedValue({ id: 'task_1', status: 'NOT_HOT', generalStatus: 'OPEN' })

    await service.update(
      { id: 'sales_1', role: 'SALESPERSON' },
      'task_1',
      {
        status: 'NOTHOT',
      },
    )

    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: 'task_1' },
      data: {
        status: 'NOT_HOT',
        generalStatus: 'OPEN',
        closedAt: null,
        closedReason: null,
      },
    })
  })

  it('marks the account passive when closure activity is sent through update', async () => {
    const { service, prisma } = buildService()
    prisma.task.findUnique.mockResolvedValue({
      id: 'task_1',
      accountId: 'acc_1',
      ownerId: 'manager_1',
      createdById: 'manager_1',
      taskListId: 'list_1',
      generalStatus: 'OPEN',
    })
    prisma.taskList.findUnique.mockResolvedValue({ id: 'list_1', tag: 'GENERAL' })
    prisma.task.update.mockResolvedValue({ id: 'task_1', status: 'COLD', generalStatus: 'CLOSED' })
    prisma.activityLog.create.mockResolvedValue({ id: 'log_close' })

    await service.update(
      { id: 'manager_1', role: 'MANAGER' },
      'task_1',
      {
        activity: {
          reason: 'ISLETME_KAPANMIS',
          text: '[İşletme Kapanmış] Kalıcı kapanış teyit edildi',
        },
      },
    )

    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'acc_1' },
      data: { status: 'PASSIVE' },
    })
    expect(prisma.activityHistory.create).toHaveBeenCalledWith({
      data: {
        accountId: 'acc_1',
        type: 'PROFILE_UPDATE',
        summary: 'Account marked PASSIVE because task task_1 logged ISLETME_KAPANMIS',
      },
    })
  })
})

describe('TasksService.list', () => {
  function buildService(overrides: Record<string, any> = {}) {
    const prisma = {
      task: { findMany: jest.fn(), count: jest.fn() },
      user: { findUnique: jest.fn(), count: jest.fn() },
      $transaction: jest.fn(),
      ...overrides,
    } as any
    const service = new TasksService(prisma)
    return { service, prisma }
  }

  it('uses the account primary contact as fallback in the non-paginated list', async () => {
    const { service, prisma } = buildService()
    prisma.task.findMany.mockResolvedValue([
      {
        id: 'task_legacy',
        accountId: 'acc_1',
        campaignUrl: null,
        account: {
          accountName: 'Legacy Isletme',
          contacts: [
            {
              id: 'contact_1',
              name: 'Fatma Demir',
              phone: '05005556677',
              email: 'fatma@example.com',
              isPrimary: true,
            },
          ],
        },
        owner: null,
        logs: [],
        taskContacts: [],
      },
    ])

    const result: any = await service.list({}, { id: 'admin_1', role: 'ADMIN' })

    expect(result).toHaveLength(1)
    expect(result[0].specificContactName).toBe('Fatma Demir')
    expect(result[0].specificContactPhone).toBe('05005556677')
    expect(result[0].specificContactEmail).toBe('fatma@example.com')
  })

  it('prefers task contact over account primary contact in the paginated list', async () => {
    const { service, prisma } = buildService()
    prisma.$transaction.mockResolvedValue([
      [
        {
          id: 'task_1',
          accountId: 'acc_1',
          campaignUrl: null,
          account: {
            accountName: 'Isletme',
            contacts: [
              {
                id: 'contact_account',
                name: 'Account Primary',
                phone: '05001112233',
                email: 'account@example.com',
                isPrimary: true,
              },
            ],
          },
          owner: null,
          logs: [],
          taskContacts: [
            {
              contact: {
                id: 'contact_task',
                name: 'Task Focus',
                phone: '05321234567',
                email: 'task@example.com',
              },
            },
          ],
        },
      ],
      1,
    ])

    const result: any = await service.list({ page: 1, limit: 10 }, { id: 'admin_1', role: 'ADMIN' })

    expect(result.items).toHaveLength(1)
    expect(result.items[0].specificContactName).toBe('Task Focus')
    expect(result.items[0].specificContactPhone).toBe('05321234567')
    expect(result.items[0].specificContactEmail).toBe('task@example.com')
  })

  it('keeps historical assignee tasks visible in manager-scoped lists for filters and reports', async () => {
    const { service, prisma } = buildService()
    prisma.user.count.mockResolvedValue(2)
    prisma.task.findMany.mockResolvedValue([])

    await service.list({}, { id: 'manager_1', role: 'MANAGER' })

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { owner: { is: { managerId: 'manager_1', role: 'SALESPERSON' } } },
            { historicalAssignee: { not: null } },
          ],
        }),
      }),
    )
  })

  it('falls back to all sales-owned tasks for managers when no direct manager links exist', async () => {
    const { service, prisma } = buildService()
    prisma.user.count.mockResolvedValue(0)
    prisma.task.findMany.mockResolvedValue([])

    await service.list({}, { id: 'manager_1', role: 'MANAGER' })

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { owner: { is: { role: 'SALESPERSON' } } },
            { historicalAssignee: { not: null } },
          ],
        }),
      }),
    )
  })

  it('keeps historical assignee tasks visible in team-lead-scoped lists and scopes owned tasks to the team sales reps', async () => {
    const { service, prisma } = buildService()
    prisma.user.findUnique.mockResolvedValue({ id: 'lead_1', team: 'Team 1' })
    prisma.task.findMany.mockResolvedValue([])

    await service.list({}, { id: 'lead_1', role: 'TEAM_LEADER' })

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { owner: { is: { team: 'Team 1', role: 'SALESPERSON' } } },
            { ownerId: null, poolTeam: 'TEAM_1' },
            { historicalAssignee: { not: null } },
          ],
        }),
      }),
    )
  })

  it('does not narrow salesperson-scoped list queries so business and archive history stay complete', async () => {
    const { service, prisma } = buildService()
    prisma.task.findMany.mockResolvedValue([])

    await service.list({}, { id: 'sales_1', role: 'SALESPERSON' })

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      }),
    )
  })
})

describe('TasksService.assign', () => {
  function buildService(overrides: Record<string, any> = {}) {
    const prisma = {
      $transaction: jest.fn().mockImplementation((cb) => cb(prisma)),
      task: { findUnique: jest.fn(), update: jest.fn() },
      user: { findUnique: jest.fn() },
      activityLog: { create: jest.fn() },
      activityHistory: { create: jest.fn() },
      ...overrides,
    } as any
    const notifications = {
      createAndPublish: jest.fn().mockResolvedValue({ id: 'notif_1' }),
    } as any
    const audit = {
      log: jest.fn().mockResolvedValue(undefined),
    } as any
    const service = new TasksService(prisma, notifications, audit)
    return { service, prisma, notifications, audit }
  }

  it('prevents team leaders from reassigning tasks outside their own team', async () => {
    const { service, prisma } = buildService()
    prisma.task.findUnique.mockResolvedValue({
      id: 'task_1',
      accountId: 'acc_1',
      ownerId: 'sales_1',
      durationDays: 7,
      status: 'HOT',
      generalStatus: 'OPEN',
    })
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'lead_1', role: 'TEAM_LEADER', team: 'Team 1', isActive: true, name: 'Lider' })
      .mockResolvedValueOnce({ id: 'sales_2', role: 'SALESPERSON', team: 'Team 2', isActive: true, name: 'Mehmet' })

    await expect(
      service.assign({ id: 'lead_1', role: 'TEAM_LEADER' }, 'task_1', { ownerId: 'sales_2', durationDays: 5 } as any),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('reassigns an open task, writes a transfer log and preserves duration when omitted', async () => {
    const { service, prisma, notifications, audit } = buildService()
    prisma.task.findUnique.mockResolvedValue({
      id: 'task_1',
      accountId: 'acc_1',
      ownerId: null,
      durationDays: 5,
      status: 'HOT',
      generalStatus: 'OPEN',
      historicalAssignee: null,
    })
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'manager_1', role: 'MANAGER', team: '-', isActive: true, name: 'Yonetici' })
      .mockResolvedValueOnce({ id: 'sales_3', role: 'SALESPERSON', team: 'Team 1', isActive: true, name: 'Ayse' })
    prisma.task.update.mockResolvedValue({
      id: 'task_1',
      ownerId: 'sales_3',
      durationDays: 5,
      dueDate: new Date('2026-04-14T00:00:00.000Z'),
    })
    prisma.activityLog.create.mockResolvedValue({ id: 'log_1' })
    prisma.activityHistory.create.mockResolvedValue({ id: 'hist_1' })

    const result = await service.assign(
      { id: 'manager_1', role: 'MANAGER' },
      'task_1',
      { ownerId: 'sales_3', note: 'Musteri daha once kendisiyle gorusmus' } as any,
    )

    expect(result.ownerId).toBe('sales_3')
    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: 'task_1' },
      data: expect.objectContaining({
        ownerId: 'sales_3',
        durationDays: 5,
        poolTeam: 'GENERAL',
      }),
    })
    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskId: 'task_1',
        authorId: 'manager_1',
        text: expect.stringContaining('[Devir]'),
      }),
    })
    expect(prisma.activityHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'acc_1',
        summary: expect.stringContaining('reassigned from Havuz to Ayse'),
      }),
    })
    expect(notifications.createAndPublish).toHaveBeenCalledWith({
      taskId: 'task_1',
      toUserId: 'sales_3',
      message: expect.stringContaining('Musteri daha once kendisiyle gorusmus'),
    })
    expect(audit.log).toHaveBeenCalled()
  })

  it('rejects non-sales targets on reassignment', async () => {
    const { service, prisma } = buildService()
    prisma.task.findUnique.mockResolvedValue({
      id: 'task_1',
      accountId: 'acc_1',
      ownerId: null,
      durationDays: 5,
      status: 'HOT',
      generalStatus: 'OPEN',
      historicalAssignee: null,
    })
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'manager_1', role: 'MANAGER', team: '-', isActive: true, name: 'Yonetici' })
      .mockResolvedValueOnce({ id: 'lead_1', role: 'TEAM_LEADER', team: 'Team 1', isActive: true, name: 'Lider' })

    await expect(
      service.assign({ id: 'manager_1', role: 'MANAGER' }, 'task_1', { ownerId: 'lead_1' } as any),
    ).rejects.toBeInstanceOf(BadRequestException)

    expect(prisma.task.update).not.toHaveBeenCalled()
  })
})
