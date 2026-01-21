import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { McpModule } from '../mcp/mcp.module';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAnalyticsService } from './admin-analytics.service';

@Module({
  imports: [PrismaModule, McpModule],
  controllers: [AdminAnalyticsController],
  providers: [AdminAnalyticsService],
})
export class AdminAnalyticsModule {}
