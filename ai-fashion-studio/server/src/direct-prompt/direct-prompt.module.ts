import { Module } from '@nestjs/common';
import { DirectPromptController } from './direct-prompt.controller';
import { DirectPromptService } from './direct-prompt.service';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../db/db.module';

@Module({
  imports: [AuthModule, DbModule],
  controllers: [DirectPromptController],
  providers: [DirectPromptService],
  exports: [DirectPromptService],
})
export class DirectPromptModule {}

