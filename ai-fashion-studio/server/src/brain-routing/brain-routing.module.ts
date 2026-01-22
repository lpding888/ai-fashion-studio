import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ModelProfileModule } from '../model-profile/model-profile.module';
import { BrainRoutingController } from './brain-routing.controller';
import { BrainRoutingService } from './brain-routing.service';

@Module({
  imports: [AuthModule, ModelProfileModule],
  controllers: [BrainRoutingController],
  providers: [BrainRoutingService],
  exports: [BrainRoutingService],
})
export class BrainRoutingModule {}
