import { Module } from '@nestjs/common';
import { BrainService } from './brain.service';
import { TranslationService } from '../translation/translation.service';
import { CosModule } from '../cos/cos.module'; // ✅ 新增

@Module({
  imports: [CosModule], // ✅ 导入CosModule
  providers: [BrainService, TranslationService],
  exports: [BrainService], // Export so TaskModule can use it
})
export class BrainModule {}
