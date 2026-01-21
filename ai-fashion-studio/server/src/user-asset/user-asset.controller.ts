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
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';
import { UserAssetService } from './user-asset.service';

const CreateUserAssetItemSchema = z
  .object({
    url: z.string().trim().min(1),
    sha256: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{64}$/i, 'sha256 无效'),
    cosKey: z.string().trim().optional(),
    fileName: z.string().trim().optional(),
    mimeType: z.string().trim().optional(),
    size: z.coerce.number().int().positive().optional(),
    width: z.coerce.number().int().positive().optional(),
    height: z.coerce.number().int().positive().optional(),
  })
  .strict();

const CreateUserAssetBodySchema = z
  .object({
    items: z.array(CreateUserAssetItemSchema).min(1),
  })
  .strict();

const ListUserAssetQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(48),
  })
  .strict();

@Controller('assets')
export class UserAssetController {
  constructor(private readonly assets: UserAssetService) {}

  @Get()
  async list(
    @CurrentUser() user: UserModel,
    @Query(new ZodValidationPipe(ListUserAssetQuerySchema))
    query: z.infer<typeof ListUserAssetQuerySchema>,
  ) {
    return this.assets.listByUser(user.id, query.page, query.limit);
  }

  @Post('batch')
  async createBatch(
    @CurrentUser() user: UserModel,
    @Body(new ZodValidationPipe(CreateUserAssetBodySchema))
    body: z.infer<typeof CreateUserAssetBodySchema>,
  ) {
    const items = await this.assets.createMany(user.id, body.items);
    return { items };
  }

  @Delete(':id')
  async remove(@CurrentUser() user: UserModel, @Param('id') id: string) {
    const assetId = String(id || '').trim();
    if (!assetId) throw new BadRequestException('素材不存在');
    const ok = await this.assets.remove(user.id, assetId);
    if (!ok) throw new BadRequestException('素材不存在');
    return { success: true, id: assetId };
  }
}
