import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { TaskModel } from '../db/models';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

type Resolution = TaskModel['resolution'];
type LayoutMode = TaskModel['layout_mode'];

@Injectable()
export class TaskBillingService {
  private readonly logger = new Logger(TaskBillingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async hasEnoughCreditsForAmount(userId: string, amount: number) {
    const required = this.normalizeAmount(amount);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });
    if (!user) return { enough: false, required, balance: 0 };
    const balance = user?.credits ?? 0;
    return { enough: balance >= required, required, balance };
  }

  private normalizeAmount(amount: number): number {
    return Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  }

  resolutionMultiplier(resolution: Resolution | undefined): number {
    // 定价口径：1K=1 积分/张；2K=2 积分/张；4K=4 积分/张
    if (resolution === '4K') return 4;
    if (resolution === '2K') return 2;
    return 1;
  }

  estimateLegacyTaskCredits(opts: {
    shotCount: number;
    layoutMode: LayoutMode | undefined;
    resolution: Resolution | undefined;
  }): number {
    const shotCount = Number.isFinite(opts.shotCount)
      ? Math.max(0, Math.floor(opts.shotCount))
      : 0;
    const layoutMode = opts.layoutMode || 'Individual';

    const baseUnits = layoutMode === 'Grid' ? 2 : shotCount;
    return baseUnits * this.resolutionMultiplier(opts.resolution);
  }

  creditsForSuccessfulLegacyIndividualRender(opts: {
    successfulImages: number;
    resolution: Resolution | undefined;
  }): number {
    const count = Number.isFinite(opts.successfulImages)
      ? Math.max(0, Math.floor(opts.successfulImages))
      : 0;
    return count * this.resolutionMultiplier(opts.resolution);
  }

  creditsForSuccessfulLegacyGridRender(opts: {
    resolution: Resolution | undefined;
  }): number {
    return 2 * this.resolutionMultiplier(opts.resolution);
  }

  creditsForSuccessfulHeroImage(opts: {
    resolution: Resolution | undefined;
  }): number {
    return 1 * this.resolutionMultiplier(opts.resolution);
  }

  creditsForSuccessfulHeroGrid(opts: {
    resolution: Resolution | undefined;
  }): number {
    return 2 * this.resolutionMultiplier(opts.resolution);
  }

  /**
   * 预扣（冻结/预占）：先扣最大额度，后续按实际成功张数结算，多退少补。
   */
  async reserveOnce(opts: {
    taskId: string;
    userId: string;
    amount: number;
    reason: string;
    eventKey: string;
  }): Promise<{ reserved: boolean; skipped: boolean }> {
    const amount = this.normalizeAmount(opts.amount);
    if (amount <= 0) return { reserved: false, skipped: true };

    try {
      await this.prisma.$transaction(async (tx) => {
        const taskRow = await tx.task.findUnique({
          where: { id: opts.taskId },
          select: { data: true },
        });
        if (!taskRow) throw new Error(`Task ${opts.taskId} not found`);
        const task = taskRow.data as unknown as TaskModel;
        if (!task.userId || task.userId !== opts.userId) {
          throw new Error('任务未绑定用户或用户不匹配，无法扣费');
        }

        await tx.billingEvent.create({
          data: {
            id: crypto.randomUUID(),
            taskId: opts.taskId,
            userId: opts.userId,
            kind: 'RESERVE',
            eventKey: opts.eventKey,
            amount,
            reason: opts.reason,
            meta: Prisma.JsonNull,
            createdAt: new Date(),
          },
        });

        const updated = await tx.user.updateMany({
          where: { id: opts.userId, credits: { gte: amount } },
          data: { credits: { decrement: amount } },
        });
        if (updated.count !== 1) {
          throw new Error(`积分不足（需要 ${amount}）`);
        }

        const u = await tx.user.findUnique({
          where: { id: opts.userId },
          select: { credits: true },
        });
        const balance = u?.credits ?? 0;

        await tx.creditTransaction.create({
          data: {
            id: crypto.randomUUID(),
            userId: opts.userId,
            type: 'SPEND',
            amount,
            balance,
            reason: opts.reason,
            relatedTaskId: opts.taskId,
            adminId: null,
            createdAt: new Date(),
          },
        });

        const createdAt = Date.now();
        const existing = Array.isArray(task.billingEvents)
          ? task.billingEvents
          : [];
        const nextEvents = [
          ...existing,
          {
            key: opts.eventKey,
            kind: 'RESERVE' as const,
            amount,
            reason: opts.reason,
            createdAt,
          },
        ];

        const nextTask: TaskModel = {
          ...task,
          creditsSpent: (task.creditsSpent ?? 0) + amount,
          billingEvents: nextEvents,
          billingError: undefined,
        };

        await tx.task.update({
          where: { id: opts.taskId },
          data: {
            creditsSpent: nextTask.creditsSpent ?? null,
            data: nextTask as unknown as Prisma.InputJsonValue,
          },
        });
      });
    } catch (err) {
      // 幂等：唯一键冲突 => 已预扣过
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return { reserved: false, skipped: true };
      }
      throw err;
    }

    this.logger.log(
      `💳 Task ${opts.taskId} 预扣成功：${amount}（event=${opts.eventKey}）`,
    );
    return { reserved: true, skipped: false };
  }

  /**
   * 结算：按实际成功扣费，多退少补（幂等）。
   * - actualAmount < reserved：退款差额
   * - actualAmount = reserved：不变
   * - actualAmount > reserved：补扣差额（理论上不应发生，但做防御）
   */
  async settleOnce(opts: {
    taskId: string;
    userId: string;
    reserveEventKey: string;
    settleEventKey: string;
    actualAmount: number;
    reason: string;
  }): Promise<{
    settled: boolean;
    skipped: boolean;
    refunded: number;
    extraSpent: number;
  }> {
    const actualAmount = this.normalizeAmount(opts.actualAmount);

    let refunded = 0;
    let extraSpent = 0;
    let didSettle = false;

    try {
      await this.prisma.$transaction(async (tx) => {
        const taskRow = await tx.task.findUnique({
          where: { id: opts.taskId },
          select: { data: true },
        });
        if (!taskRow) throw new Error(`Task ${opts.taskId} not found`);
        const task = taskRow.data as unknown as TaskModel;
        if (!task.userId || task.userId !== opts.userId) {
          throw new Error('任务未绑定用户或用户不匹配，无法结算');
        }

        const reserveEvent = await tx.billingEvent.findUnique({
          where: {
            taskId_eventKey: {
              taskId: opts.taskId,
              eventKey: opts.reserveEventKey,
            },
          },
        });
        if (!reserveEvent || reserveEvent.kind !== 'RESERVE') {
          return;
        }

        // 先写 SETTLE 事件：保证“只结算一次”（后续步骤在同一事务里，要么都成功要么都回滚）
        await tx.billingEvent.create({
          data: {
            id: crypto.randomUUID(),
            taskId: opts.taskId,
            userId: opts.userId,
            kind: 'SETTLE',
            eventKey: opts.settleEventKey,
            amount: actualAmount,
            reason: opts.reason,
            meta: Prisma.JsonNull,
            createdAt: new Date(),
          },
        });
        didSettle = true;

        const reserved = this.normalizeAmount(reserveEvent.amount);

        if (actualAmount < reserved) {
          refunded = reserved - actualAmount;
          await tx.user.update({
            where: { id: opts.userId },
            data: { credits: { increment: refunded } },
          });
          const u = await tx.user.findUnique({
            where: { id: opts.userId },
            select: { credits: true },
          });
          const balance = u?.credits ?? 0;
          await tx.creditTransaction.create({
            data: {
              id: crypto.randomUUID(),
              userId: opts.userId,
              type: 'EARN',
              amount: refunded,
              balance,
              reason: `退款: ${opts.reason}`,
              relatedTaskId: opts.taskId,
              adminId: null,
              createdAt: new Date(),
            },
          });
        } else if (actualAmount > reserved) {
          extraSpent = actualAmount - reserved;
          const updated = await tx.user.updateMany({
            where: { id: opts.userId, credits: { gte: extraSpent } },
            data: { credits: { decrement: extraSpent } },
          });
          if (updated.count !== 1)
            throw new Error(`积分不足（需要补扣 ${extraSpent}）`);
          const u = await tx.user.findUnique({
            where: { id: opts.userId },
            select: { credits: true },
          });
          const balance = u?.credits ?? 0;
          await tx.creditTransaction.create({
            data: {
              id: crypto.randomUUID(),
              userId: opts.userId,
              type: 'SPEND',
              amount: extraSpent,
              balance,
              reason: opts.reason,
              relatedTaskId: opts.taskId,
              adminId: null,
              createdAt: new Date(),
            },
          });
        }

        const existing = Array.isArray(task.billingEvents)
          ? task.billingEvents
          : [];
        const nextEvents = [
          ...existing,
          {
            key: opts.settleEventKey,
            kind: 'SETTLE' as const,
            amount: actualAmount,
            reason: opts.reason,
            createdAt: Date.now(),
            meta: { reserved, refunded, extraSpent },
          },
        ];

        const nextTask: TaskModel = {
          ...task,
          creditsSpent: Math.max(
            0,
            (task.creditsSpent ?? 0) - refunded + extraSpent,
          ),
          billingEvents: nextEvents,
          billingError: undefined,
        };

        await tx.task.update({
          where: { id: opts.taskId },
          data: {
            creditsSpent: nextTask.creditsSpent ?? null,
            data: nextTask as unknown as Prisma.InputJsonValue,
          },
        });
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return { settled: false, skipped: true, refunded: 0, extraSpent: 0 };
      }
      throw err;
    }

    if (!didSettle) {
      return { settled: false, skipped: true, refunded: 0, extraSpent: 0 };
    }

    this.logger.log(
      `💳 Task ${opts.taskId} 结算完成：actual=${actualAmount} refunded=${refunded} extra=${extraSpent}`,
    );
    return { settled: true, skipped: false, refunded, extraSpent };
  }

  /**
   * 扣费失败不应影响“已经出图”的结果返回；这里统一打标到 task，便于排查/补扣。
   */
  async markBillingError(taskId: string, message: string) {
    const taskRow = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { data: true },
    });
    if (!taskRow) return;
    const task = taskRow.data as unknown as TaskModel;
    const nextTask: TaskModel = { ...task, billingError: message };
    await this.prisma.task.update({
      where: { id: taskId },
      data: { data: nextTask as unknown as Prisma.InputJsonValue },
    });
  }
}
