import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import type { InviteCodeModel, UserModel } from './models';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserDbService implements OnModuleInit {
  private readonly logger = new Logger(UserDbService.name);

  constructor(private readonly prisma: PrismaService) { }

  async onModuleInit() {
    await this.createDefaultAdmin();
  }

  private mapUser(row: {
    id: string;
    username: string;
    passwordHash: string;
    nickname: string | null;
    email: string | null;
    status: 'ACTIVE' | 'DISABLED' | 'PENDING';
    role: 'USER' | 'ADMIN';
    credits: number;
    totalTasks: number;
    createdAt: Date;
    lastLoginAt: Date | null;
    createdBy: string | null;
    notes: string | null;
  }): UserModel {
    return {
      id: row.id,
      username: row.username,
      password: row.passwordHash,
      nickname: row.nickname ?? undefined,
      email: row.email ?? undefined,
      status: row.status,
      role: row.role,
      credits: row.credits,
      totalTasks: row.totalTasks,
      createdAt: row.createdAt.getTime(),
      lastLoginAt: row.lastLoginAt?.getTime(),
      createdBy: row.createdBy ?? undefined,
      notes: row.notes ?? undefined,
    };
  }

  private mapInvite(row: {
    id: string;
    codeHash: string;
    createdAt: Date;
    createdByUserId: string | null;
    usedAt: Date | null;
    usedByUserId: string | null;
    revokedAt: Date | null;
    note: string | null;
  }): InviteCodeModel {
    return {
      id: row.id,
      codeHash: row.codeHash,
      createdAt: row.createdAt.getTime(),
      createdByUserId: row.createdByUserId ?? undefined,
      usedAt: row.usedAt?.getTime(),
      usedByUserId: row.usedByUserId ?? undefined,
      revokedAt: row.revokedAt?.getTime(),
      note: row.note ?? undefined,
    };
  }

  // 创建默认管理员
  private async createDefaultAdmin() {
    const adminCount = await this.prisma.user.count({
      where: { role: 'ADMIN' },
    });
    if (adminCount > 0) return;

    const isProd = process.env.NODE_ENV === 'production';
    const bootstrapUsername = (process.env.BOOTSTRAP_ADMIN_USERNAME || '').trim();
    const bootstrapPassword = (process.env.BOOTSTRAP_ADMIN_PASSWORD || '').trim();

    const username = isProd ? bootstrapUsername : 'admin';
    const password = isProd ? bootstrapPassword : 'admin123';

    if (isProd) {
      if (!username || !password) {
        throw new Error(
          '生产环境未检测到管理员账户，且未配置 BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD'
        );
      }
      if (password.length < 12) {
        throw new Error('BOOTSTRAP_ADMIN_PASSWORD 长度不足（至少 12 位）');
      }
    }

    const now = new Date();
    const row = await this.prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        username,
        passwordHash: await bcrypt.hash(password, 10),
        nickname: '管理员',
        status: 'ACTIVE',
        role: 'ADMIN',
        credits: 999999,
        totalTasks: 0,
        createdAt: now,
      },
    });

    this.logger.log(`Created bootstrap admin account (username: ${row.username})`);
    if (!isProd) {
      this.logger.warn('Please change the default admin password!');
    }
  }

  // 创建用户（管理员用）
  async createUser(data: {
    id?: string;
    username: string;
    password: string;
    nickname?: string;
    email?: string;
    role?: 'USER' | 'ADMIN';
    status?: 'ACTIVE' | 'DISABLED' | 'PENDING';
    credits?: number;
    createdBy?: string;
    notes?: string;
  }): Promise<UserModel> {
    const username = data.username.trim();
    if (!username) throw new Error('用户名不能为空');

    const exists = await this.prisma.user.findUnique({ where: { username } });
    if (exists) throw new Error('用户名已存在');

    const row = await this.prisma.user.create({
      data: {
        id: data.id || crypto.randomUUID(),
        username,
        passwordHash: await bcrypt.hash(data.password, 10),
        nickname: data.nickname || username,
        email: data.email ?? null,
        status: data.status || 'ACTIVE',
        role: data.role || 'USER',
        credits: data.credits ?? 100,
        totalTasks: 0,
        createdAt: new Date(),
        createdBy: data.createdBy ?? null,
        notes: data.notes ?? null,
      },
    });

    this.logger.log(`Created user: ${row.username} (${row.role})`);
    return this.mapUser(row as any);
  }

  async registerWithInvite(params: {
    username: string;
    password: string;
    nickname?: string;
    email?: string;
    inviteCode?: string;
    inviteRequired: boolean;
    initialCredits?: number;
  }): Promise<UserModel> {
    const username = params.username.trim();
    const inviteCode = (params.inviteCode || '').trim();
    const userId = crypto.randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { username } });
      if (existing) throw new Error('用户名已存在');

      if (params.inviteRequired) {
        if (!inviteCode) throw new Error('邀请码不能为空');

        const codeHash = crypto.createHash('sha256').update(inviteCode).digest('hex');
        const locked = await tx.inviteCode.updateMany({
          where: {
            codeHash,
            revokedAt: null,
            usedAt: null,
            usedByUserId: null,
          },
          data: {
            usedAt: new Date(),
            usedByUserId: userId,
          },
        });

        if (locked.count !== 1) {
          throw new Error('邀请码无效或已被使用');
        }
      }

      const row = await tx.user.create({
        data: {
          id: userId,
          username,
          passwordHash: await bcrypt.hash(params.password, 10),
          nickname: params.nickname || username,
          email: params.email ?? null,
          status: 'ACTIVE',
          role: 'USER',
          credits: params.initialCredits ?? 100,
          totalTasks: 0,
          createdAt: new Date(),
        },
      });

      return this.mapUser(row as any);
    });
  }

  // 根据用户名查找
  async getUserByUsername(username: string): Promise<UserModel | null> {
    const row = await this.prisma.user.findUnique({ where: { username } });
    if (!row) return null;
    return this.mapUser(row as any);
  }

  // 根据ID查找
  async getUserById(id: string): Promise<UserModel | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    if (!row) return null;
    return this.mapUser(row as any);
  }

  // 验证密码
  async verifyPassword(username: string, password: string): Promise<UserModel | null> {
    const row = await this.prisma.user.findUnique({ where: { username } });
    if (!row) return null;

    const valid = await bcrypt.compare(password, (row as any).passwordHash);
    if (!valid) return null;

    return this.mapUser(row as any);
  }

  // 更新用户
  async updateUser(id: string, updates: Partial<UserModel>): Promise<UserModel> {
    const current = await this.prisma.user.findUnique({ where: { id } });
    if (!current) throw new Error('用户不存在');

    if (updates.username && updates.username !== (current as any).username) {
      const exists = await this.prisma.user.findUnique({ where: { username: updates.username } });
      if (exists) throw new Error('用户名已存在');
    }

    const data: any = {};

    if (updates.username !== undefined) data.username = updates.username;
    if (updates.nickname !== undefined) data.nickname = updates.nickname ?? null;
    if (updates.email !== undefined) data.email = updates.email ?? null;
    if (updates.status !== undefined) data.status = updates.status;
    if (updates.role !== undefined) data.role = updates.role;
    if (updates.credits !== undefined) data.credits = updates.credits;
    if (updates.totalTasks !== undefined) data.totalTasks = updates.totalTasks;
    if (updates.lastLoginAt !== undefined) data.lastLoginAt = updates.lastLoginAt ? new Date(updates.lastLoginAt) : null;
    if (updates.createdBy !== undefined) data.createdBy = updates.createdBy ?? null;
    if (updates.notes !== undefined) data.notes = updates.notes ?? null;

    if (updates.password !== undefined) {
      data.passwordHash = await bcrypt.hash(updates.password, 10);
    }

    const row = await this.prisma.user.update({ where: { id }, data });
    return this.mapUser(row as any);
  }

  // 删除用户
  async deleteUser(id: string): Promise<void> {
    await this.prisma.user.delete({ where: { id } });
  }

  // 获取所有用户（管理员用）
  async getAllUsers(): Promise<UserModel[]> {
    const rows = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.mapUser(row as any));
  }

  async createInviteCode(params: { createdByUserId?: string; note?: string } = {}) {
    const code = crypto.randomBytes(9).toString('base64url'); // 12 chars
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    const row = await this.prisma.inviteCode.create({
      data: {
        id: crypto.randomUUID(),
        codeHash,
        createdAt: new Date(),
        createdByUserId: params.createdByUserId ?? null,
        note: params.note ?? null,
      },
    });

    return { code, invite: this.mapInvite(row as any) };
  }

  async listInviteCodes(): Promise<InviteCodeModel[]> {
    const rows = await this.prisma.inviteCode.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.mapInvite(row as any));
  }

  async revokeInviteCode(inviteId: string): Promise<InviteCodeModel> {
    const invite = await this.prisma.inviteCode.findUnique({ where: { id: inviteId } });
    if (!invite) throw new Error('邀请码不存在');
    if ((invite as any).usedAt || (invite as any).usedByUserId) {
      throw new Error('邀请码已被使用，不能撤销');
    }

    const row = await this.prisma.inviteCode.update({
      where: { id: inviteId },
      data: {
        revokedAt: (invite as any).revokedAt ? (invite as any).revokedAt : new Date(),
      },
    });

    return this.mapInvite(row as any);
  }

  // 增加积分
  async addCredits(userId: string, amount: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { credits: { increment: amount } },
    });
  }

  // 扣除积分
  async deductCredits(userId: string, amount: number): Promise<boolean> {
    const updated = await this.prisma.user.updateMany({
      where: { id: userId, credits: { gte: amount } },
      data: { credits: { decrement: amount } },
    });
    return updated.count === 1;
  }

  // 增加任务计数
  async incrementTaskCount(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { totalTasks: { increment: 1 } },
    });
  }
}

