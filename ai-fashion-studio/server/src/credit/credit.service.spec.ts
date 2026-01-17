import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CreditService } from './credit.service';
import { DbService } from '../db/db.service';
import { UserDbService } from '../db/user-db.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CreditService', () => {
  let service: CreditService;

  const dbMock = {
    getCreditTransactions: jest.fn(async () => []),
    getAllCreditTransactions: jest.fn(async () => []),
  };

  const userDbMock = {
    getUserById: jest.fn(async () => null),
    updateUser: jest.fn(async () => ({})),
  };

  const txUserUpdateMany = jest.fn(async () => ({ count: 1 }));
  const txUserUpdate = jest.fn(async () => ({}));
  const txUserFindUnique = jest.fn(async () => ({ credits: 0 }));
  const txCreditCreate = jest.fn(async () => ({}));

  const prismaMock = {
    $transaction: jest.fn(async (fn: any) => fn({
      user: {
        updateMany: txUserUpdateMany,
        update: txUserUpdate,
        findUnique: txUserFindUnique,
      },
      creditTransaction: {
        create: txCreditCreate,
      },
    })),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditService,
        { provide: DbService, useValue: dbMock },
        { provide: UserDbService, useValue: userDbMock },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<CreditService>(CreditService);
    jest.clearAllMocks();
  });

  it('should throw NotFoundException when user missing', async () => {
    await expect(service.getUserCredits('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should return credits when user exists', async () => {
    userDbMock.getUserById.mockResolvedValueOnce({
      id: 'u1',
      username: 'test',
      password: 'x',
      status: 'ACTIVE',
      role: 'USER',
      credits: 123,
      totalTasks: 0,
      createdAt: Date.now(),
    });
    dbMock.getCreditTransactions.mockResolvedValueOnce([
      { type: 'EARN', amount: 50 },
      { type: 'SPEND', amount: 10 },
    ]);

    const res = await service.getUserCredits('u1');
    expect(res.balance).toBe(123);
    expect(res.totalEarned).toBe(50);
    expect(res.totalSpent).toBe(10);
  });

  it('setCreditsByAdmin should update balance and create EARN tx', async () => {
    txUserFindUnique.mockResolvedValueOnce({ credits: 10 });

    const res = await service.setCreditsByAdmin('u1', 15, 'r', 'a1');

    expect(res).toEqual({ previousBalance: 10, newBalance: 15, delta: 5 });
    expect(txUserUpdate).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { credits: 15 },
    });
    expect(txCreditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        type: 'EARN',
        amount: 5,
        balance: 15,
        adminId: 'a1',
        relatedTaskId: null,
      }),
    });
  });

  it('setCreditsByAdmin should no-op when target equals current', async () => {
    txUserFindUnique.mockResolvedValueOnce({ credits: 20 });

    const res = await service.setCreditsByAdmin('u1', 20, 'r', 'a1');

    expect(res).toEqual({ previousBalance: 20, newBalance: 20, delta: 0 });
    expect(txUserUpdate).not.toHaveBeenCalled();
    expect(txCreditCreate).not.toHaveBeenCalled();
  });
});

