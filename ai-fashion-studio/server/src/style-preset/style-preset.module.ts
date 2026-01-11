import { Module } from '@nestjs/common';
import { StylePresetController } from './style-preset.controller';
import { StylePresetMigrationService } from './style-preset-migration.service';
import { DbModule } from '../db/db.module';
import { BrainModule } from '../brain/brain.module';
import { ModelProfileModule } from '../model-profile/model-profile.module';
import { CosModule } from '../cos/cos.module';

@Module({
  imports: [DbModule, BrainModule, ModelProfileModule, CosModule],
  controllers: [StylePresetController],
  providers: [StylePresetMigrationService],
})
export class StylePresetModule { }
