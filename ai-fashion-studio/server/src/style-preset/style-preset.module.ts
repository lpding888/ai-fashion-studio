import { Module } from '@nestjs/common';
import { StylePresetController } from './style-preset.controller';
import { StylePresetMigrationService } from './style-preset-migration.service';
import { DbModule } from '../db/db.module';
import { BrainModule } from '../brain/brain.module';
import { CosModule } from '../cos/cos.module';
import { BrainRoutingModule } from '../brain-routing/brain-routing.module';

@Module({
  imports: [DbModule, BrainModule, BrainRoutingModule, CosModule],
  controllers: [StylePresetController],
  providers: [StylePresetMigrationService],
})
export class StylePresetModule {}
