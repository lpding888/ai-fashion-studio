import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { PresetMetaController } from './preset-meta.controller';
import { PresetMetaService } from './preset-meta.service';

@Module({
  imports: [DbModule],
  controllers: [PresetMetaController],
  providers: [PresetMetaService],
  exports: [PresetMetaService],
})
export class PresetMetaModule {}
