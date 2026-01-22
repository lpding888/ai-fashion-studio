import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BrainModule } from '../brain/brain.module';
import { PromptOptimizerController } from './prompt-optimizer.controller';
import { PromptOptimizerAdminController } from './prompt-optimizer.admin.controller';
import { PromptOptimizerPromptService } from './prompt-optimizer-prompt.service';
import { PromptOptimizerService } from './prompt-optimizer.service';
import { BrainRoutingModule } from '../brain-routing/brain-routing.module';

@Module({
  imports: [AuthModule, BrainModule, BrainRoutingModule],
  controllers: [PromptOptimizerController, PromptOptimizerAdminController],
  providers: [PromptOptimizerService, PromptOptimizerPromptService],
})
export class PromptOptimizerModule {}
