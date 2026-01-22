import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { BrainModule } from '../brain/brain.module';
import { CosModule } from '../cos/cos.module';
import { PosePresetController } from './pose-preset.controller';
import { BrainRoutingModule } from '../brain-routing/brain-routing.module';

@Module({
  imports: [DbModule, BrainModule, BrainRoutingModule, CosModule],
  controllers: [PosePresetController],
})
export class PosePresetModule {}
