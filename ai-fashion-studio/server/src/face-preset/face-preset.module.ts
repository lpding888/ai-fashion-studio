import { Module } from '@nestjs/common';
import { FacePresetController } from './face-preset.controller';
import { FacePresetMigrationService } from './face-preset-migration.service';
import { DbModule } from '../db/db.module';
import { CosModule } from '../cos/cos.module';

@Module({
  imports: [DbModule, CosModule],
  controllers: [FacePresetController],
  providers: [FacePresetMigrationService],
})
export class FacePresetModule {}
