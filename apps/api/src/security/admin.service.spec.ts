import { AdminService } from './admin.service'

describe('AdminService maintenance operations', () => {
  function buildService(overrides: Record<string, any> = {}) {
    const prisma = {
      task: { findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      account: { findMany: jest.fn(), update: jest.fn() },
      activityLog: { update: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
      offer: { findMany: jest.fn(), deleteMany: jest.fn() },
      user: { findMany: jest.fn() },
      categoryMain: { create: jest.fn(), updateMany: jest.fn() },
      categorySub: { createMany: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn().mockImplementation((ops) => Promise.all(ops)),
      ...overrides,
    } as any
    const service = new AdminService(prisma)
    return { service, prisma }
  }

  it('fixes imported past record dates by updating task creationDate and archive log createdAt', async () => {
    const { service, prisma } = buildService()
    prisma.task.findMany.mockResolvedValue([
      {
        id: 'task_1',
        creationDate: new Date('2026-04-06T12:00:00.000Z'),
        logs: [
          {
            id: 'log_1',
            text: '<span>[Geçmiş Kayıt]</span> 14.02.2024 görüşme notu',
            createdAt: new Date('2026-04-06T12:00:00.000Z'),
          },
        ],
      },
    ])
    prisma.task.update.mockResolvedValue({ id: 'task_1' })
    prisma.activityLog.update.mockResolvedValue({ id: 'log_1' })

    const result = await service.fixPastRecordDates()

    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: 'task_1' },
      data: { creationDate: new Date('2024-02-14T12:00:00.000Z') },
    })
    expect(prisma.activityLog.update).toHaveBeenCalledWith({
      where: { id: 'log_1' },
      data: { createdAt: new Date('2024-02-14T12:00:00.000Z') },
    })
    expect(result.updatedCount).toBe(1)
  })

  it('downgrades invalid future years found in archive log text to sentinel archive date', async () => {
    const { service, prisma } = buildService()
    prisma.task.findMany.mockResolvedValue([
      {
        id: 'task_3023',
        creationDate: new Date('3023-03-06T12:00:00.000Z'),
        logs: [
          {
            id: 'log_3023',
            text: '<span>[Geçmiş Kayıt]</span> 06.03.3023 hatalı tarihli not',
            createdAt: new Date('3023-03-06T12:00:00.000Z'),
          },
        ],
      },
    ])
    prisma.task.update.mockResolvedValue({ id: 'task_3023' })
    prisma.activityLog.update.mockResolvedValue({ id: 'log_3023' })

    const result = await service.fixPastRecordDates()

    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: 'task_3023' },
      data: { creationDate: new Date('2000-01-01T12:00:00.000Z') },
    })
    expect(prisma.activityLog.update).toHaveBeenCalledWith({
      where: { id: 'log_3023' },
      data: { createdAt: new Date('2000-01-01T12:00:00.000Z') },
    })
    expect(result.updatedCount).toBe(1)
  })

  it('standardizes archive assignee names against active users', async () => {
    const { service, prisma } = buildService()
    prisma.user.findMany.mockResolvedValue([{ name: 'Esra Çalı' }])
    prisma.task.findMany.mockResolvedValue([{ id: 'task_1', historicalAssignee: 'esra cali' }])
    prisma.task.update.mockResolvedValue({ id: 'task_1' })

    const result = await service.cleanArchiveAssignees()

    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: 'task_1' },
      data: { historicalAssignee: 'Esra Çalı' },
    })
    expect(result.updatedCount).toBe(1)
  })

  it('removes admin-authored logs and resets impacted task statuses', async () => {
    const { service, prisma } = buildService()
    prisma.user.findMany.mockResolvedValue([{ id: 'admin_1' }])
    prisma.activityLog.findMany.mockResolvedValue([{ id: 'log_1', taskId: 'task_1' }])
    prisma.offer.findMany.mockResolvedValue([{ id: 'offer_1', taskId: 'task_1', activityLogId: 'log_1' }])
    prisma.task.findMany.mockResolvedValue([{ id: 'task_1' }])
    prisma.activityLog.deleteMany.mockResolvedValue({ count: 1 })
    prisma.offer.deleteMany.mockResolvedValue({ count: 1 })
    prisma.task.updateMany.mockResolvedValue({ count: 1 })

    const result = await service.deleteAdminTestData()

    expect(prisma.offer.deleteMany).toHaveBeenCalledWith({ where: { activityLogId: { in: ['log_1'] } } })
    expect(prisma.activityLog.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['log_1'] } } })
    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['task_1'] },
        status: { in: ['DEAL', 'HOT', 'COLD'] },
      },
      data: {
        status: 'NOT_HOT',
        generalStatus: 'OPEN',
        closedAt: null,
        closedReason: null,
      },
    })
    expect(result.updatedTaskCount).toBe(1)
  })

  it('does not target archived past-record imports while cleaning admin test data', async () => {
    const { service, prisma } = buildService()
    prisma.user.findMany.mockResolvedValue([{ id: 'admin_1' }])
    prisma.activityLog.findMany.mockResolvedValue([])
    prisma.offer.findMany.mockResolvedValue([])
    prisma.task.findMany.mockResolvedValue([])

    const result = await service.deleteAdminTestData()

    expect(prisma.activityLog.findMany).toHaveBeenCalledWith({
      where: {
        authorId: { in: ['admin_1'] },
        NOT: { text: { contains: '[Geçmiş Kayıt]' } },
        task: {
          taskList: {
            isActive: true,
          },
        },
      },
      select: { id: true, taskId: true },
    })
    expect(prisma.offer.findMany).toHaveBeenCalledWith({
      where: {
        createdById: { in: ['admin_1'] },
        task: {
          taskList: {
            isActive: true,
          },
        },
      },
      select: { id: true, taskId: true, activityLogId: true },
    })
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where: {
        ownerId: { in: ['admin_1'] },
        taskList: {
          isActive: true,
        },
      },
      select: { id: true },
    })
    expect(result.updatedTaskCount).toBe(0)
  })

  it('migrates Grupanya categories on the server without per-browser batching', async () => {
    const { service, prisma } = buildService()
    prisma.categoryMain.updateMany.mockResolvedValue({ count: 2 })
    prisma.categorySub.updateMany.mockResolvedValue({ count: 4 })
    prisma.categoryMain.create.mockResolvedValue({ id: 'main-1' })
    prisma.categorySub.createMany.mockResolvedValue({ count: 2 })
    prisma.task.findMany.mockResolvedValue([
      {
        id: 'task_1',
        businessId: 'biz_1',
        mainCategory: 'Iftar Menusu',
        subCategory: 'Ramazan',
        createdAt: new Date('2026-04-01T10:00:00.000Z'),
        account: { businessName: 'Acme Iftar' },
      },
    ])
    prisma.account.findMany.mockResolvedValue([
      {
        id: 'biz_1',
        businessName: 'Acme Iftar',
        mainCategory: 'Iftar Menusu',
        subCategory: 'Ramazan',
        createdAt: new Date('2026-04-01T10:00:00.000Z'),
      },
    ])
    prisma.task.update.mockResolvedValue({ id: 'task_1' })
    prisma.account.update.mockResolvedValue({ id: 'biz_1' })

    const result = await service.migrateGrupanyaCategories()

    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: 'task_1' },
      data: { mainCategory: 'İftar (Core)', subCategory: 'Restoranda İftar' },
    })
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'biz_1' },
      data: {
        mainCategory: 'İftar (Core)',
        subCategory: 'Restoranda İftar',
        category: 'İftar (Core) / Restoranda İftar',
      },
    })
    expect(result.updatedTaskCount).toBe(1)
    expect(result.updatedBusinessCount).toBe(1)
  })
})
