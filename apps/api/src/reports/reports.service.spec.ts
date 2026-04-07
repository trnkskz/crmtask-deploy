import { ReportsService } from './reports.service'

describe('ReportsService.tasksCsv', () => {
  function buildService() {
    const prisma = {
      task: {
        findMany: jest.fn(),
      },
      user: {
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
})
