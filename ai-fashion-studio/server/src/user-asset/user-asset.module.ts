import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UserAssetController } from './user-asset.controller';
import { UserAssetService } from './user-asset.service';

@Module({
  imports: [PrismaModule],
  controllers: [UserAssetController],
  providers: [UserAssetService],
})
export class UserAssetModule {}
