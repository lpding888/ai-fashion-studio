import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CreditService } from './credit.service';
import { DbService } from '../db/db.service';
import { UserDbService } from '../db/user-db.service';

describe('CreditService', () => {
  let service: CreditService;

  const dbMock = {
    getCreditTransactions: jest.fn(async () => []),
    saveCreditTransaction: jest.fn(async () => ({})),
  };

  const userDbMock = {
    getUserById: jest.fn(async () => null),
    updateUser: jest.fn(async () => ({})),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditService,
        { provide: DbService, useValue: dbMock },
        { provide: UserDbService, useValue: userDbMock },
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
});

