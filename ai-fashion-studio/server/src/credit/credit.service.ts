import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { CreditTransaction } from '../db/models';
import * as crypto from 'crypto';
import { UserDbService } from '../db/user-db.service';

// 积分消费配置
const CREDITS_PER_IMAGE = 10;

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
    ) { }

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
            .filter(t => t.type === 'EARN')
            .reduce((sum, t) => sum + t.amount, 0);
        const totalSpent = transactions
            .filter(t => t.type === 'SPEND')
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
    async hasEnoughCredits(userId: string, shotCount: number): Promise<{ enough: boolean; required: number; balance: number }> {
        const required = shotCount * CREDITS_PER_IMAGE;
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
        taskId?: string
    ): Promise<boolean> {
        const user = await this.userDb.getUserById(userId);
        if (!user) {
            throw new NotFoundException(`用户不存在: ${userId}`);
        }

        const currentBalance = user.credits || 0;
        if (currentBalance < amount) {
            throw new BadRequestException(`积分不足。需要 ${amount} 积分，当前余额 ${currentBalance} 积分`);
        }

        const newBalance = currentBalance - amount;

        // 更新用户余额
        await this.userDb.updateUser(userId, { credits: newBalance });

        // 记录流水
        const transaction: CreditTransaction = {
            id: crypto.randomUUID(),
            userId,
            type: 'SPEND',
            amount,
            balance: newBalance,
            reason,
            relatedTaskId: taskId,
            createdAt: Date.now(),
        };
        await this.db.saveCreditTransaction(transaction);

        this.logger.log(`💳 用户 ${userId} 消费 ${amount} 积分: ${reason}。余额: ${newBalance}`);
        return true;
    }

    /**
     * 充值积分（管理员操作）
     */
    async addCredits(
        userId: string,
        amount: number,
        reason: string,
        adminId?: string
    ): Promise<void> {
        const user = await this.userDb.getUserById(userId);
        if (!user) {
            throw new NotFoundException(`用户不存在: ${userId}`);
        }

        const currentBalance = user.credits || 0;
        const newBalance = currentBalance + amount;

        // 更新用户余额
        await this.userDb.updateUser(userId, { credits: newBalance });

        // 记录流水
        const transaction: CreditTransaction = {
            id: crypto.randomUUID(),
            userId,
            type: 'EARN',
            amount,
            balance: newBalance,
            reason,
            adminId,
            createdAt: Date.now(),
        };
        await this.db.saveCreditTransaction(transaction);

        this.logger.log(`💰 用户 ${userId} 充值 ${amount} 积分: ${reason}。余额: ${newBalance}`);
    }

    /**
     * 退款（任务失败时）
     */
    async refundCredits(
        userId: string,
        amount: number,
        reason: string,
        taskId?: string
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
        limit: number = 20
    ): Promise<{ transactions: CreditTransaction[]; total: number; page: number }> {
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
        return shotCount * CREDITS_PER_IMAGE;
    }
}
