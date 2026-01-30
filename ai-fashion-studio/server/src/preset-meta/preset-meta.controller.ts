import { Body, Controller, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';
import { PresetMetaService } from './preset-meta.service';
import { PresetMetaBatchBodySchema } from '../contracts/api.schemas';

@ApiTags('PresetMeta')
@ApiBearerAuth()
@Controller('preset-meta')
export class PresetMetaController {
  constructor(private readonly presets: PresetMetaService) {}

  @Patch('batch')
  @ApiOperation({ summary: '批量更新预设元数据' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['STYLE', 'POSE', 'FACE'] },
        ids: { type: 'array', items: { type: 'string' } },
        action: {
          type: 'string',
          enum: [
            'favorite',
            'unfavorite',
            'add-tags',
            'remove-tags',
            'set-tags',
            'add-collections',
            'remove-collections',
            'set-collections',
          ],
        },
        payload: {
          type: 'object',
          properties: {
            tags: { type: 'array', items: { type: 'string' } },
            collectionIds: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      required: ['kind', 'ids', 'action'],
    },
  })
  async batchUpdate(
    @CurrentUser() user: UserModel,
    @Body(new ZodValidationPipe(PresetMetaBatchBodySchema))
    body: z.infer<typeof PresetMetaBatchBodySchema>,
  ) {
    const items = await this.presets.applyBatch(user, body);
    return { items };
  }
}
