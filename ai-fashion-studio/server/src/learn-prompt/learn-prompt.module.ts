import { Module } from '@nestjs/common';
import { LearnPromptController } from './learn-prompt.controller';
import { LearnPromptService } from './learn-prompt.service';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';

@Module({
  imports: [AuthModule, DbModule],
  controllers: [LearnPromptController],
  providers: [LearnPromptService],
  exports: [LearnPromptService],
})
export class LearnPromptModule {}
