import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ModelProfileController } from './model-profile.controller';
import { ModelConfigResolverService } from './model-config-resolver.service';
import { ModelProfileService } from './model-profile.service';

@Module({
  imports: [AuthModule],
  controllers: [ModelProfileController],
  providers: [ModelProfileService, ModelConfigResolverService],
  exports: [ModelProfileService, ModelConfigResolverService],
})
export class ModelProfileModule {}
