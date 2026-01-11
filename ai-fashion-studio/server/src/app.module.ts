import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './common/env';
import { HealthController } from './common/health.controller';
import { BrainModule } from './brain/brain.module';
import { TaskModule } from './task/task.module';
import { DbModule } from './db/db.module';
import { PainterModule } from './painter/painter.module';
import { FacePresetModule } from './face-preset/face-preset.module';
import { CosModule } from './cos/cos.module';
import { UsersModule } from './users/users.module';
import { StylePresetModule } from './style-preset/style-preset.module';
import { AuthModule } from './auth/auth.module';
import { BrainPromptModule } from './brain-prompt/brain-prompt.module';
import { ModelProfileModule } from './model-profile/model-profile.module';
import { McpModule } from './mcp/mcp.module';
import { CreditModule } from './credit/credit.module';
import { WorkflowPromptModule } from './workflow-prompt/workflow-prompt.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnv,
    }),
    BrainModule,
    TaskModule,
    DbModule,
    PainterModule,
    FacePresetModule,
    StylePresetModule,
    CosModule,
    UsersModule,
    AuthModule,
    BrainPromptModule,
    ModelProfileModule,
    McpModule,
    CreditModule,
    WorkflowPromptModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule { }
