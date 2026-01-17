import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './common/env';
import { HealthController } from './common/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { BrainModule } from './brain/brain.module';
import { TaskModule } from './task/task.module';
import { DbModule } from './db/db.module';
import { PainterModule } from './painter/painter.module';
import { FacePresetModule } from './face-preset/face-preset.module';
import { CosModule } from './cos/cos.module';
import { StylePresetModule } from './style-preset/style-preset.module';
import { PosePresetModule } from './pose-preset/pose-preset.module';
import { AuthModule } from './auth/auth.module';
import { BrainPromptModule } from './brain-prompt/brain-prompt.module';
import { ModelProfileModule } from './model-profile/model-profile.module';
import { McpModule } from './mcp/mcp.module';
import { CreditModule } from './credit/credit.module';
import { WorkflowPromptModule } from './workflow-prompt/workflow-prompt.module';
import { AdminLogModule } from './admin-log/admin-log.module';
import { DirectPromptModule } from './direct-prompt/direct-prompt.module';
import { AdminAnalyticsModule } from './admin-analytics/admin-analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // 兼容从不同工作目录启动（例如在仓库根目录运行、或在 server/ 目录运行）
      // dev: __dirname=server/src -> resolve(.., ..)=server
      // prod: __dirname=server/dist/src -> resolve(.., ..)=server
      envFilePath: (() => {
        const serverRoot = resolve(__dirname, '..', '..');
        return [
          resolve(process.cwd(), '.env.local'),
          resolve(process.cwd(), '.env'),
          resolve(serverRoot, '.env.local'),
          resolve(serverRoot, '.env'),
        ];
      })(),
      validate: validateEnv,
    }),
    PrismaModule,
    BrainModule,
    TaskModule,
    DbModule,
    PainterModule,
    FacePresetModule,
    StylePresetModule,
    PosePresetModule,
    CosModule,
    AuthModule,
    BrainPromptModule,
    ModelProfileModule,
    McpModule,
    CreditModule,
    WorkflowPromptModule,
    DirectPromptModule,
    AdminLogModule,
    AdminAnalyticsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule { }
