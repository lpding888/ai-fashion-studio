import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';
import { UserAssetService } from './user-asset.service';
import {
  UserAssetCreateBodySchema,
  UserAssetListQuerySchema,
} from '../contracts/api.schemas';
import { z } from 'zod';

@ApiTags('Assets')
@ApiBearerAuth()
@Controller('assets')
export class UserAssetController {
  constructor(private readonly assets: UserAssetService) {}

  @Get()
  @ApiOperation({ summary: '获取素材列表' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async list(
    @CurrentUser() user: UserModel,
    @Query(new ZodValidationPipe(UserAssetListQuerySchema))
    query: z.infer<typeof UserAssetListQuerySchema>,
  ) {
    return this.assets.listByUser(user.id, query.page, query.limit);
  }

  @Post('batch')
  @ApiOperation({ summary: '批量创建素材' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'object' } },
      },
      required: ['items'],
    },
  })
  async createBatch(
    @CurrentUser() user: UserModel,
    @Body(new ZodValidationPipe(UserAssetCreateBodySchema))
    body: z.infer<typeof UserAssetCreateBodySchema>,
  ) {
    const items = await this.assets.createMany(user.id, body.items);
    return { items };
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除素材' })
  @ApiParam({ name: 'id', type: String })
  async remove(@CurrentUser() user: UserModel, @Param('id') id: string) {
    const assetId = String(id || '').trim();
    if (!assetId) throw new BadRequestException('素材不存在');
    const ok = await this.assets.remove(user.id, assetId);
    if (!ok) throw new BadRequestException('素材不存在');
    return { success: true, id: assetId };
  }
}
