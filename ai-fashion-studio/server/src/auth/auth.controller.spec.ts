import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserDbService } from '../db/user-db.service';
import { CreditService } from '../credit/credit.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthController (admin update-user)', () => {
  let controller: AuthController;

  const authServiceMock = {
    sanitizeUser: jest.fn((u: any) => u),
  };

  const userDbMock = {
    updateUser: jest.fn(async () => ({})),
    getUserById: jest.fn(async () => null),
  };

  const creditServiceMock = {
    setCreditsByAdmin: jest.fn(async () => ({ previousBalance: 0, newBalance: 0, delta: 0 })),
  };

  const prismaMock = {} as Partial<PrismaService>;

  const adminUser = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    username: 'admin',
    role: 'ADMIN',
    status: 'ACTIVE',
    credits: 0,
    totalTasks: 0,
    createdAt: Date.now(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: UserDbService, useValue: userDbMock },
        { provide: CreditService, useValue: creditServiceMock },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();

    jest.spyOn(controller as any, 'verifyAdmin').mockResolvedValue(adminUser);
  });

  it('should route credits change via CreditService.setCreditsByAdmin', async () => {
    userDbMock.getUserById.mockResolvedValueOnce({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      username: 'u1',
      role: 'USER',
      status: 'ACTIVE',
      credits: 20,
      totalTasks: 0,
      createdAt: Date.now(),
    });

    const res = await controller.updateUser(
      'Bearer x',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      { credits: 20 } as any,
    );

    expect(creditServiceMock.setCreditsByAdmin).toHaveBeenCalledWith(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      20,
      '管理员更新用户资料：设置积分为 20',
      adminUser.id,
    );
    expect(userDbMock.updateUser).not.toHaveBeenCalled();
    expect(res.success).toBe(true);
  });

  it('should update non-credit fields and then set credits', async () => {
    userDbMock.updateUser.mockResolvedValueOnce({});
    userDbMock.getUserById.mockResolvedValueOnce({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      username: 'u1',
      nickname: 'n',
      role: 'USER',
      status: 'ACTIVE',
      credits: 5,
      totalTasks: 0,
      createdAt: Date.now(),
    });

    await controller.updateUser(
      'Bearer x',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      { nickname: 'n', credits: 5 } as any,
    );

    expect(userDbMock.updateUser).toHaveBeenCalledWith(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      expect.objectContaining({ nickname: 'n' }),
    );
    expect(creditServiceMock.setCreditsByAdmin).toHaveBeenCalledWith(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      5,
      '管理员更新用户资料：设置积分为 5',
      adminUser.id,
    );
  });

  it('should reject non-integer credits', async () => {
    await expect(
      controller.updateUser(
        'Bearer x',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        { credits: 1.5 } as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(creditServiceMock.setCreditsByAdmin).not.toHaveBeenCalled();
  });
});
