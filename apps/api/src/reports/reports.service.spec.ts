import { ReportsService } from './reports.service'

describe('ReportsService.tasksCsv', () => {
  function buildService() {
    const prisma = {
      task: {
        findMany: jest.fn(),
      },
      user: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
      },
    } as any
    return { service: new ReportsService(prisma), prisma }
  }

  it('filters by historical assignee and exports the visible assignee text', async () => {
    const { service, prisma } = buildService()
    prisma.task.findMany.mockResolvedValue([
      {
        id: 'task_1',
        accountId: 'acc_1',
        account: { accountName: 'Legacy Biz' },
        owner: null,
        ownerId: null,
        historicalAssignee: 'Eski Calisan',
        status: 'NEW',
        generalStatus: 'OPEN',
        priority: 'MEDIUM',
        logs: [],
        creationDate: new Date('2025-01-02T12:00:00.000Z'),
        assignmentDate: null,
        dueDate: null,
        closedAt: null,
        closedReason: null,
      },
    ])

    const csv = await service.tasksCsv({ historicalAssignee: 'Eski Calisan' }, { id: 'admin_1', role: 'ADMIN' })

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          historicalAssignee: { contains: 'Eski Calisan', mode: 'insensitive' },
        }),
      }),
    )
    expect(csv).toContain('assignee')
    expect(csv).toContain('historicalAssignee')
    expect(csv).toContain('Eski Calisan')
  })

  it('filters csv rows by canonical category so legacy iftar tasks are included', async () => {
    const { service, prisma } = buildService()
    prisma.task.findMany.mockResolvedValue([
      {
        id: 'task_iftar',
        accountId: 'acc_1',
        account: { accountName: 'Ramazan Sofrasi' },
        owner: { email: 'ayse@example.com', name: 'Ayse', firstName: 'Ayse', lastName: 'Yilmaz' },
        ownerId: 'user_1',
        historicalAssignee: null,
        status: 'DEAL',
        generalStatus: 'CLOSED',
        source: 'OLD',
        mainCategory: 'Yeme & Icme',
        subCategory: 'Iftar Menusu',
        priority: 'MEDIUM',
        logs: [],
        creationDate: new Date('2025-03-10T12:00:00.000Z'),
        assignmentDate: null,
        dueDate: null,
        closedAt: null,
        closedReason: null,
      },
      {
        id: 'task_other',
        accountId: 'acc_2',
        account: { accountName: 'Burger House' },
        owner: { email: 'mehmet@example.com', name: 'Mehmet', firstName: 'Mehmet', lastName: 'Kaya' },
        ownerId: 'user_2',
        historicalAssignee: null,
        status: 'NEW',
        generalStatus: 'OPEN',
        source: 'FRESH',
        mainCategory: 'Yemek (Core)',
        subCategory: 'Akşam Yemeği',
        priority: 'MEDIUM',
        logs: [],
        creationDate: new Date('2025-03-11T12:00:00.000Z'),
        assignmentDate: null,
        dueDate: null,
        closedAt: null,
        closedReason: null,
      },
    ])

    const csv = await service.tasksCsv(
      { source: 'OLD', mainCategory: 'İftar (Core)', subCategory: 'Restoranda İftar' },
      { id: 'admin_1', role: 'ADMIN' },
    )

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          source: 'OLD',
        }),
      }),
    )
    expect(csv).toContain('task_iftar')
    expect(csv).toContain('mainCategory')
    expect(csv).not.toContain('task_other')
  })

  it('scopes team lead task exports to sales reps in the same team', async () => {
    const { service, prisma } = buildService()
    prisma.user.findUnique.mockResolvedValue({ id: 'lead_1', team: 'Team 1' })
    prisma.task.findMany.mockResolvedValue([])

    await service.tasksCsv({}, { id: 'lead_1', role: 'TEAM_LEADER' })

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          owner: { team: 'Team 1', role: 'SALESPERSON' },
        }),
      }),
    )
  })

  it('does not let sales reps widen open reports task scope with ownerId filters', async () => {
    const { service, prisma } = buildService()
    prisma.task.findMany.mockResolvedValue([])

    await service.tasksReport(
      { ownerId: 'sales_2', status: 'hot' },
      { id: 'sales_1', role: 'SALESPERSON' },
    )

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerId: 'sales_1',
          status: 'HOT',
        }),
      }),
    )
  })

  it('lets sales reps view closed archive reports without owner scope', async () => {
    const { service, prisma } = buildService()
    prisma.task.findMany.mockResolvedValue([])

    await service.tasksReport(
      { generalStatus: 'CLOSED' },
      { id: 'sales_1', role: 'SALESPERSON' },
    )

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({
          ownerId: 'sales_1',
        }),
      }),
    )
  })

  it('lets sales reps view deal archive reports without owner scope', async () => {
    const { service, prisma } = buildService()
    prisma.task.findMany.mockResolvedValue([])

    await service.tasksReport(
      { status: 'deal' },
      { id: 'sales_1', role: 'SALESPERSON' },
    )

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'DEAL',
        }),
      }),
    )
    expect(prisma.task.findMany.mock.calls[0][0].where.ownerId).toBeUndefined()
  })

  it('filters closed deal reports by closedAt instead of creationDate', async () => {
    const { service, prisma } = buildService()
    prisma.task.findMany.mockResolvedValue([])

    await service.tasksReport(
      {
        status: 'deal',
        from: '2026-04-01T00:00:00.000Z',
        to: '2026-04-30T23:59:59.999Z',
      },
      { id: 'manager_1', role: 'MANAGER' },
    )

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'DEAL',
          closedAt: expect.objectContaining({
            gte: new Date('2026-04-01T00:00:00.000Z'),
            lte: expect.any(Date),
          }),
        }),
      }),
    )
    expect(prisma.task.findMany.mock.calls[0][0].where.creationDate).toBeUndefined()
  })

  it('returns paged task report payload with aggregate stats when page and limit are provided', async () => {
    const { service, prisma } = buildService()
    prisma.task.findMany.mockResolvedValue([
      {
        id: 'task_1',
        accountId: 'acc_1',
        account: { accountName: 'Birinci Isletme', businessName: 'Birinci Isletme', city: 'Istanbul', district: 'Kadikoy', source: 'OLD', mainCategory: 'Yemek', subCategory: 'Kahvalti' },
        owner: { id: 'user_1', email: 'ayse@example.com', name: 'Ayse', team: 'Team 1' },
        creator: { id: 'creator_1', email: 'yonetici@example.com', name: 'Yonetici' },
        ownerId: 'user_1',
        createdById: 'creator_1',
        projectId: '',
        creationChannel: 'REQUEST_FLOW',
        status: 'HOT',
        source: 'OLD',
        mainCategory: 'Yemek',
        subCategory: 'Kahvalti',
        logs: [{ text: '[Gorusme] Arandi', createdAt: new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)), reason: 'GORUSME', followUpDate: null }],
        _count: { logs: 1 },
        creationDate: new Date('2026-04-01T10:00:00.000Z'),
      },
      {
        id: 'task_2',
        accountId: 'acc_2',
        account: { accountName: 'Ikinci Isletme', businessName: 'Ikinci Isletme', city: 'Istanbul', district: 'Besiktas', source: 'FRESH', mainCategory: 'Guzellik', subCategory: 'Cilt' },
        owner: { id: 'user_2', email: 'fatma@example.com', name: 'Fatma', team: 'Team 2' },
        creator: { id: 'creator_1', email: 'yonetici@example.com', name: 'Yonetici' },
        ownerId: 'user_2',
        createdById: 'creator_1',
        projectId: '',
        creationChannel: 'MANUAL_TASK_CREATE',
        status: 'DEAL',
        source: 'FRESH',
        mainCategory: 'Guzellik',
        subCategory: 'Cilt',
        logs: [{ text: '[Deal] Kapandi', createdAt: new Date('2026-04-10T10:00:00.000Z'), reason: 'GORUSME', followUpDate: null }],
        _count: { logs: 1 },
        creationDate: new Date('2026-04-02T10:00:00.000Z'),
      },
    ])

    const result = await service.tasksReport(
      { page: '1', limit: '1' },
      { id: 'manager_1', role: 'MANAGER' },
    )

    expect(result).toEqual(
      expect.objectContaining({
        total: 2,
        page: 1,
        limit: 1,
        items: expect.any(Array),
        stats: expect.objectContaining({
          total: 2,
          open: 1,
          closed: 1,
          deal: 1,
          cold: 0,
          idle: 1,
        }),
      }),
    )
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toEqual(expect.objectContaining({
      sourceKey: 'OLD',
      sourceLabel: 'Old Account',
    }))
  })
})

describe('ReportsService ratios', () => {
  function buildRatioService() {
    const prisma = {
      task: {
        findMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      activityLog: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    } as any
    return { service: new ReportsService(prisma), prisma }
  }

  it('calculates manager dashboard deal ratio against open plus closed outcomes', async () => {
    const { service } = buildRatioService()
    jest.spyOn(service as any, 'taskStatus').mockResolvedValue({
      total: 100,
      byGeneralStatus: [{ generalStatus: 'CLOSED', _count: { generalStatus: 1 } }],
      byStatus: [{ status: 'NEW', _count: { status: 99 } }],
    })
    jest.spyOn(service as any, 'performance').mockResolvedValue({ users: [] })
    jest.spyOn(service as any, 'scopedSalesUsers').mockResolvedValue([])
    jest.spyOn(service as any, 'buildMonthlyContactedOutcomeSummary').mockResolvedValue({ deal: 1, cold: 0 })

    const snapshot = await service.dashboardSnapshot({ id: 'mgr_1', role: 'MANAGER' })

    expect(snapshot.manager).toBeDefined()
    expect(snapshot.manager!.totalOpen).toBe(99)
    expect(snapshot.manager!.monthlyDeal).toBe(1)
    expect(snapshot.manager!.dealRatio).toBe(1)
  })

  it('calculates team pulse deal ratio against open plus closed outcomes', async () => {
    const { service, prisma } = buildRatioService()
    jest.spyOn(service as any, 'scopedSalesUsers').mockResolvedValue([
      { id: 'sales_1', name: 'Ayse', team: 'Team 1' },
    ])
    jest.spyOn(service as any, 'getIstanbulRangeStarts').mockReturnValue({
      daily: Date.UTC(2026, 3, 10),
      weekly: Date.UTC(2026, 3, 7),
      monthly: Date.UTC(2026, 3, 1),
    })
    prisma.$transaction.mockResolvedValue([
      [
        {
          id: 'task_open',
          accountId: 'acc_1',
          ownerId: 'sales_1',
          createdById: 'mgr_1',
          status: 'NEW',
          creationDate: new Date('2026-04-10T10:00:00.000Z'),
          logs: [],
          account: { accountName: 'Open Biz', businessName: 'Open Biz', city: 'Istanbul' },
        },
        {
          id: 'task_deal',
          accountId: 'acc_2',
          ownerId: 'sales_1',
          createdById: 'mgr_1',
          status: 'DEAL',
          creationDate: new Date('2026-04-08T10:00:00.000Z'),
          logs: [],
          account: { accountName: 'Deal Biz', businessName: 'Deal Biz', city: 'Istanbul' },
        },
      ],
      [
        {
          authorId: 'sales_1',
          createdAt: new Date('2026-04-10T12:00:00.000Z'),
          text: 'Gorusme yapildi',
          task: {
            id: 'task_deal',
            accountId: 'acc_2',
            status: 'DEAL',
            account: { accountName: 'Deal Biz', businessName: 'Deal Biz', city: 'Istanbul' },
          },
        },
      ],
    ])

    const payload = await service.teamPulse({ id: 'mgr_1', role: 'MANAGER' })

    expect(payload.records).toHaveLength(1)
    expect(payload.records[0].dealRatio).toBe(50)
  })
})
