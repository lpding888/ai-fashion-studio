import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { CreditController } from './credit.controller';
import { CreditService } from './credit.service';

describe('CreditController', () => {
  let controller: CreditController;
  const creditServiceMock = {
    addCredits: jest.fn(async () => undefined),
    getAdminOverview: jest.fn(async () => ({ totalUsers: 0, totalCredits: 0, topUsers: [], recentTransactions: [] })),
    getUserCredits: jest.fn(async () => ({ userId: 'u1', balance: 0, totalEarned: 0, totalSpent: 0 })),
    getTransactions: jest.fn(async () => ({ transactions: [], total: 0, page: 1 })),
    hasEnoughCredits: jest.fn(async () => ({ enough: true, required: 0, balance: 0 })),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CreditController],
      providers: [{ provide: CreditService, useValue: creditServiceMock }],
    }).compile();

    controller = module.get<CreditController>(CreditController);
    jest.clearAllMocks();
  });

  it('adminRecharge should reject non-admin', async () => {
    await expect(
      controller.adminRecharge(
        { id: 'u1', role: 'USER' } as any,
        { userId: '11111111-1111-1111-1111-111111111111', amount: 10, reason: 'x' } as any,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(creditServiceMock.addCredits).not.toHaveBeenCalled();
  });

  it('adminRecharge should allow admin', async () => {
    await controller.adminRecharge(
      { id: 'a1', role: 'ADMIN' } as any,
      { userId: '11111111-1111-1111-1111-111111111111', amount: 10, reason: 'x' } as any,
    );
    expect(creditServiceMock.addCredits).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      10,
      'x',
      'a1',
    );
  });
});

