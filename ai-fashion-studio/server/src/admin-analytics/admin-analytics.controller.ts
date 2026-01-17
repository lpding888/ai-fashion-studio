import { Controller, Get, ForbiddenException, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';
import { AdminAnalyticsService } from './admin-analytics.service';

const OverviewQuerySchema = z
  .object({
    days: z.coerce.number().int().min(1).max(90).default(7),
    topN: z.coerce.number().int().min(1).max(50).default(10),
    sampleN: z.coerce.number().int().min(10).max(500).default(200),
  })
  .strict();

@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  @Get('overview')
  async overview(
    @CurrentUser() user: UserModel,
    @Query(new ZodValidationPipe(OverviewQuerySchema)) query: z.infer<typeof OverviewQuerySchema>,
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

