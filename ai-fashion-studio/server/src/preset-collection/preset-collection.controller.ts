import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';
import { PresetCollectionService } from './preset-collection.service';

const CreatePresetCollectionBodySchema = z
  .object({
    name: z.string().trim().min(1).max(40),
  })
  .strict();

const RenamePresetCollectionBodySchema = z
  .object({
    name: z.string().trim().min(1).max(40),
  })
  .strict();

@Controller('preset-collections')
export class PresetCollectionController {
  constructor(private readonly collections: PresetCollectionService) {}

  @Get()
  async list(@CurrentUser() user: UserModel) {
    return { items: await this.collections.listByUser(user.id) };
  }

  @Post()
  async create(
    @CurrentUser() user: UserModel,
    @Body(new ZodValidationPipe(CreatePresetCollectionBodySchema))
    body: z.infer<typeof CreatePresetCollectionBodySchema>,
  ) {
    const item = await this.collections.create(user.id, body.name);
    return { item };
  }

  @Patch(':id')
  async rename(
    @CurrentUser() user: UserModel,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RenamePresetCollectionBodySchema))
    body: z.infer<typeof RenamePresetCollectionBodySchema>,
  ) {
    const collectionId = String(id || '').trim();
    if (!collectionId) throw new BadRequestException('收藏夹不存在');
    const item = await this.collections.rename(user.id, collectionId, body.name);
    if (!item) throw new BadRequestException('收藏夹不存在');
    return { item };
  }

  @Delete(':id')
  async remove(@CurrentUser() user: UserModel, @Param('id') id: string) {
    const collectionId = String(id || '').trim();
    if (!collectionId) throw new BadRequestException('收藏夹不存在');
    const ok = await this.collections.remove(user.id, collectionId);
    if (!ok) throw new BadRequestException('收藏夹不存在');
    return { success: true, id: collectionId };
  }
}
