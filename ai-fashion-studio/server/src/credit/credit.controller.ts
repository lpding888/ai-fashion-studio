import { Controller, Get, Post, Body, Query, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { CreditService } from './credit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

const AdminOverviewQuerySchema = z.object({
    topN: z.coerce.number().int().min(1).max(100).optional(),
    recentN: z.coerce.number().int().min(1).max(500).optional(),
});

const AdminRechargeBodySchema = z.object({
    userId: z.string().uuid(),
    amount: z.coerce.number().int().positive(),
    reason: z.string().trim().min(1).max(200).optional(),
});

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
        @Body(new ZodValidationPipe(AdminRechargeBodySchema)) body: z.infer<typeof AdminRechargeBodySchema>
    ) {
        if (admin.role !== 'ADMIN') {
            throw new ForbiddenException('需要管理员权限');
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
    async getAdminOverview(
        @CurrentUser() admin: UserModel,
        @Query(new ZodValidationPipe(AdminOverviewQuerySchema)) query: z.infer<typeof AdminOverviewQuerySchema>,
    ) {
        if (admin.role !== 'ADMIN') {
            throw new ForbiddenException('需要管理员权限');
        }

        const overview = await this.creditService.getAdminOverview({
            topN: query.topN,
            recentN: query.recentN,
        });

        return { success: true, ...overview };
    }
}
