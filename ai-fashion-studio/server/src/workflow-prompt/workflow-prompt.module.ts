import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';
import { WorkflowPromptController } from './workflow-prompt.controller';
import { WorkflowPromptService } from './workflow-prompt.service';

@Module({
  imports: [AuthModule, DbModule],
  controllers: [WorkflowPromptController],
  providers: [WorkflowPromptService],
  exports: [WorkflowPromptService],
})
export class WorkflowPromptModule {}
