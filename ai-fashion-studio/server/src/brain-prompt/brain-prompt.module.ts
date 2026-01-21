import { Module } from '@nestjs/common';
import { BrainPromptController } from './brain-prompt.controller';
import { BrainPromptService } from './brain-prompt.service';
import { AuthModule } from '../auth/auth.module';
import { BrainModule } from '../brain/brain.module';

@Module({
  imports: [AuthModule, BrainModule],
  controllers: [BrainPromptController],
  providers: [BrainPromptService],
  exports: [BrainPromptService],
})
export class BrainPromptModule {}
