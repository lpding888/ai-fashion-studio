import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { BrainModule } from '../brain/brain.module';
import { ModelProfileModule } from '../model-profile/model-profile.module';
import { CosModule } from '../cos/cos.module';
import { PosePresetController } from './pose-preset.controller';

@Module({
  imports: [DbModule, BrainModule, ModelProfileModule, CosModule],
  controllers: [PosePresetController],
})
export class PosePresetModule {}

