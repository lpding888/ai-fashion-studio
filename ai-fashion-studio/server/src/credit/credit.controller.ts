import { Controller, Get, Post, Body, Query, Param, BadRequestException, Logger } from '@nestjs/common';
import { CreditService } from './credit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';

@Controller('credits')
export class CreditController {
    private logger = new Logger(CreditController.name);

    constructor(private readonly creditService: CreditService) { }

    /**
     * 获取当前用户积分余额
     * GET /api/credits?userId=xxx
     */
    @Get()
    async getUserCredits(@CurrentUser() user: UserModel, @Query('userId') userId?: string) {
        const effectiveUserId = user.role === 'ADMIN' && userId ? userId : user.id;
        return this.creditService.getUserCredits(effectiveUserId);
    }

    /**
     * 获取用户积分流水
     * GET /api/credits/transactions?userId=xxx&page=1&limit=20
     */
    @Get('transactions')
    async getTransactions(
        @CurrentUser() user: UserModel,
        @Query('userId') userId: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string
    ) {
        const effectiveUserId = user.role === 'ADMIN' && userId ? userId : user.id;
        const pageNum = parseInt(page || '1');
        const limitNum = parseInt(limit || '20');

        return this.creditService.getTransactions(effectiveUserId, pageNum, limitNum);
    }

    /**
     * 检查积分是否足够
     * GET /api/credits/check?userId=xxx&shotCount=4
     */
    @Get('check')
    async checkCredits(
        @CurrentUser() user: UserModel,
        @Query('userId') userId: string,
        @Query('shotCount') shotCount: string
    ) {
        const effectiveUserId = user.role === 'ADMIN' && userId ? userId : user.id;
        const count = parseInt(shotCount || '4');
        return this.creditService.hasEnoughCredits(effectiveUserId, count);
    }

    /**
     * 管理员充值积分
     * POST /api/credits/admin/recharge
     */
    @Post('admin/recharge')
    async adminRecharge(
        @CurrentUser() admin: UserModel,
        @Body() body: {
            userId: string;
            amount: number;
            reason?: string;
        }
    ) {
        if (!body.userId || !body.amount) {
            throw new BadRequestException('缺少必要参数: userId, amount');
        }

        if (body.amount <= 0) {
            throw new BadRequestException('充值金额必须大于0');
        }

        const reason = body.reason || '管理员手动充值';

        await this.creditService.addCredits(
            body.userId,
            body.amount,
            reason,
            admin.id
        );

        this.logger.log(`✅ 管理员为用户 ${body.userId} 充值 ${body.amount} 积分`);

        return {
            success: true,
            message: `成功为用户充值 ${body.amount} 积分`,
            userId: body.userId,
            amount: body.amount
        };
    }

    /**
     * 获取所有用户的积分概览（管理员）
     * GET /api/credits/admin/overview
     */
    @Get('admin/overview')
    async getAdminOverview() {
        // TODO: 实现用户积分概览
        return {
            message: '功能开发中',
        };
    }
}
