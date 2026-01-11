import { Module } from '@nestjs/common';
import { PainterService } from './painter.service';
import { CosModule } from '../cos/cos.module';


@Module({
  imports: [CosModule],
  providers: [PainterService],
  exports: [PainterService]
})
export class PainterModule { }
