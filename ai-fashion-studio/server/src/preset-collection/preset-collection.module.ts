import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { PresetCollectionController } from './preset-collection.controller';
import { PresetCollectionService } from './preset-collection.service';

@Module({
  imports: [DbModule],
  controllers: [PresetCollectionController],
  providers: [PresetCollectionService],
  exports: [PresetCollectionService],
})
export class PresetCollectionModule {}
