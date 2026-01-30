import { Controller, Get, ForbiddenException, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';
import { AdminAnalyticsService } from './admin-analytics.service';
import {
  AdminAnalyticsOverviewQuerySchema,
} from '../contracts/api.schemas';
import { z } from 'zod';

@ApiTags('AdminAnalytics')
@ApiBearerAuth()
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: '获取运营概览' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiQuery({ name: 'topN', required: false, type: Number })
  @ApiQuery({ name: 'sampleN', required: false, type: Number })
  async overview(
    @CurrentUser() user: UserModel,
    @Query(new ZodValidationPipe(AdminAnalyticsOverviewQuerySchema))
    query: z.infer<typeof AdminAnalyticsOverviewQuerySchema>,
  ) {
    if (!user || user.role !== 'ADMIN') {
      throw new ForbiddenException('需要管理员权限');
    }

    return this.analytics.getOverview({
      days: query.days,
      topN: query.topN,
      sampleN: query.sampleN,
    });
  }
}
