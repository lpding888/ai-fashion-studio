import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DbService } from '../db/db.service';
import { CreditTransaction } from '../db/models';
import * as crypto from 'crypto';
import { UserDbService } from '../db/user-db.service';
import { PrismaService } from '../prisma/prisma.service';

// 积分消费配置（口径：1 张图 = 1 积分；4K = 4x；拼图（Grid）= 2 张）
const CREDITS_PER_IMAGE = 1;

export interface UserCredits {
  userId: string;
  balance: number;
  totalEarned: number;
  totalSpent: number;
}

@Injectable()
export class CreditService {
  private logger = new Logger(CreditService.name);

  constructor(
    private readonly db: DbService,
    private readonly userDb: UserDbService,
    private readonly prisma: PrismaService,
  ) {}

  private normalizeAmount(amount: number): number {
    return Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  }

  private normalizeReason(
    reason: string | undefined,
    fallback: string,
  ): string {
    const normalized = (reason ?? '').trim();
    if (!normalized) return fallback;
    return normalized.length > 200 ? normalized.slice(0, 200) : normalized;
  }

  /**
   * 获取用户积分余额
   */
  async getUserCredits(userId: string): Promise<UserCredits> {
    const user = await this.userDb.getUserById(userId);
    if (!user) {
      throw new NotFoundException(`用户不存在: ${userId}`);
    }

    // 统计流水
    const transactions = await this.db.getCreditTransactions(userId);
    const totalEarned = transactions
      .filter((t) => t.type === 'EARN')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalSpent = transactions
      .filter((t) => t.type === 'SPEND')
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      userId,
      balance: user.credits || 0,
      totalEarned,
      totalSpent,
    };
  }

  /**
   * 检查用户是否有足够积分
   */
  async hasEnoughCredits(
    userId: string,
    shotCount: number,
  ): Promise<{ enough: boolean; required: number; balance: number }> {
    const required = Math.max(0, Math.floor(shotCount)) * CREDITS_PER_IMAGE;
    const userCredits = await this.getUserCredits(userId);

    return {
      enough: userCredits.balance >= required,
      required,
      balance: userCredits.balance,
    };
  }

  /**
   * 按“金额”检查积分（用于：成功出图后扣费，但生成前仍需要先校验余额）
   */
  async hasEnoughCreditsForAmount(
    userId: string,
    amount: number,
  ): Promise<{ enough: boolean; required: number; balance: number }> {
    const required = Number.isFinite(amount)
      ? Math.max(0, Math.floor(amount))
      : 0;
    const userCredits = await this.getUserCredits(userId);
    return {
      enough: userCredits.balance >= required,
      required,
      balance: userCredits.balance,
    };
  }

  /**
   * 消费积分（生图时调用）
   */
  async spendCredits(
    userId: string,
    amount: number,
    reason: string,
    taskId?: string,
  ): Promise<boolean> {
    const normalized = this.normalizeAmount(amount);
    if (normalized <= 0) return true;

    const { newBalance } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: userId, credits: { gte: normalized } },
        data: { credits: { decrement: normalized } },
      });
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { credits: true },
      });
      if (!user) throw new NotFoundException(`用户不存在: ${userId}`);

      if (updated.count !== 1) {
        throw new BadRequestException(
          `积分不足。需要 ${normalized} 积分，当前余额 ${user.credits ?? 0} 积分`,
        );
      }

      const newBalance = user.credits ?? 0;

      await tx.creditTransaction.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          type: 'SPEND',
          amount: normalized,
          balance: newBalance,
          reason,
          relatedTaskId: taskId ?? null,
          adminId: null,
          createdAt: new Date(),
        },
      });

      return { newBalance };
    });

    this.logger.log(
      `💳 用户 ${userId} 消费 ${normalized} 积分: ${reason}。余额: ${newBalance}`,
    );
    return true;
  }

  /**
   * 充值积分（管理员操作）
   */
  async addCredits(
    userId: string,
    amount: number,
    reason: string,
    adminId?: string,
  ): Promise<void> {
    const normalized = this.normalizeAmount(amount);
    if (normalized <= 0) return;

    const { newBalance } = await this.prisma.$transaction(async (tx) => {
      try {
        await tx.user.update({
          where: { id: userId },
          data: { credits: { increment: normalized } },
        });
      } catch (e: any) {
        if (e?.code === 'P2025')
          throw new NotFoundException(`用户不存在: ${userId}`);
        throw e;
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { credits: true },
      });
      if (!user) throw new NotFoundException(`用户不存在: ${userId}`);
      const newBalance = user.credits ?? 0;

      await tx.creditTransaction.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          type: 'EARN',
          amount: normalized,
          balance: newBalance,
          reason,
          relatedTaskId: null,
          adminId: adminId ?? null,
          createdAt: new Date(),
        },
      });

      return { newBalance };
    });

    this.logger.log(
      `💰 用户 ${userId} 充值 ${normalized} 积分: ${reason}。余额: ${newBalance}`,
    );
  }

  /**
   * 管理员：设置用户积分为指定余额（会生成流水，保证余额/流水一致）
   *
   * - 若 targetCredits 与当前余额相同：不写流水，直接返回
   * - 仅允许非负整数（会自动向下取整）
   */
  async setCreditsByAdmin(
    userId: string,
    targetCredits: number,
    reason: string,
    adminId: string,
  ): Promise<{ previousBalance: number; newBalance: number; delta: number }> {
    const target = this.normalizeAmount(targetCredits);
    const normalizedReason = this.normalizeReason(reason, '管理员调整积分');

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { credits: true },
      });
      if (!user) throw new NotFoundException(`用户不存在: ${userId}`);

      const previousBalance = user.credits ?? 0;
      const newBalance = target;
      const delta = newBalance - previousBalance;

      if (delta === 0) {
        return { previousBalance, newBalance, delta };
      }

      await tx.user.update({
        where: { id: userId },
        data: { credits: newBalance },
      });

      await tx.creditTransaction.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          type: delta > 0 ? 'EARN' : 'SPEND',
          amount: Math.abs(delta),
          balance: newBalance,
          reason: normalizedReason,
          relatedTaskId: null,
          adminId: adminId ?? null,
          createdAt: new Date(),
        },
      });

      return { previousBalance, newBalance, delta };
    });

    const action = result.delta > 0 ? '增加' : '扣减';
    this.logger.log(
      `🛠️ 管理员 ${adminId} 设置用户 ${userId} 积分：${result.previousBalance} -> ${result.newBalance}（${action} ${Math.abs(result.delta)}）`,
    );
    return result;
  }

  /**
   * 退款（任务失败时）
   */
  async refundCredits(
    userId: string,
    amount: number,
    reason: string,
    taskId?: string,
  ): Promise<void> {
    await this.addCredits(userId, amount, `退款: ${reason}`, undefined);
    this.logger.log(`↩️ 用户 ${userId} 退款 ${amount} 积分: ${reason}`);
  }

  /**
   * 获取积分流水
   */
  async getTransactions(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    transactions: CreditTransaction[];
    total: number;
    page: number;
  }> {
    const allTransactions = await this.db.getCreditTransactions(userId);
    const sorted = allTransactions.sort((a, b) => b.createdAt - a.createdAt);

    const start = (page - 1) * limit;
    const transactions = sorted.slice(start, start + limit);

    return {
      transactions,
      total: allTransactions.length,
      page,
    };
  }

  /**
   * 计算生图所需积分
   */
  calculateRequiredCredits(shotCount: number): number {
    return Math.max(0, Math.floor(shotCount)) * CREDITS_PER_IMAGE;
  }

  /**
   * 管理员：积分概览（用于后台快速定位）
   */
  async getAdminOverview(options?: { topN?: number; recentN?: number }) {
    const topN = Math.max(1, Math.min(options?.topN ?? 10, 100));
    const recentN = Math.max(1, Math.min(options?.recentN ?? 50, 500));

    const users = await this.userDb.getAllUsers();
    const totalUsers = users.length;
    const totalCredits = users.reduce((sum, u) => sum + (u.credits || 0), 0);

    const topUsers = [...users]
      .sort((a, b) => (b.credits || 0) - (a.credits || 0))
      .slice(0, topN)
      .map((u) => ({
        id: u.id,
        username: u.username,
        nickname: u.nickname,
        credits: u.credits || 0,
        status: u.status,
        role: u.role,
      }));

    const allTx = await this.db.getAllCreditTransactions();
    const recentTransactions = allTx
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, recentN);

    return {
      totalUsers,
      totalCredits,
      topUsers,
      recentTransactions,
    };
  }
}
