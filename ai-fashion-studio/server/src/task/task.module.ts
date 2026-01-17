import { Module } from '@nestjs/common';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';
import { FixController } from './fix.controller';
import { FixService } from './fix.service';
import { ExportController } from './export.controller';
import { DbModule } from '../db/db.module';
import { BrainModule } from '../brain/brain.module';
import { PainterModule } from '../painter/painter.module';
import { ModelProfileModule } from '../model-profile/model-profile.module';
import { CosModule } from '../cos/cos.module';
import { CreditModule } from '../credit/credit.module';
import { WorkflowPromptModule } from '../workflow-prompt/workflow-prompt.module';
import { DirectPromptModule } from '../direct-prompt/direct-prompt.module';
import { HeroStoryboardController } from './hero-storyboard.controller';
import { HeroStoryboardService } from './hero-storyboard.service';
import { TaskAccessService } from './task-access.service';
import { TaskBillingService } from './task-billing.service';

@Module({
  imports: [DbModule, BrainModule, PainterModule, ModelProfileModule, CosModule, CreditModule, WorkflowPromptModule, DirectPromptModule],
  controllers: [TaskController, FixController, ExportController, HeroStoryboardController],
  providers: [TaskService, FixService, HeroStoryboardService, TaskAccessService, TaskBillingService],
})
export class TaskModule { }
