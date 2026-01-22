import { Body, Controller, Patch } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';
import { PresetMetaService } from './preset-meta.service';

const PresetKindSchema = z.enum(['STYLE', 'POSE', 'FACE']);
const BatchActionSchema = z.enum([
  'favorite',
  'unfavorite',
  'add-tags',
  'remove-tags',
  'set-tags',
  'add-collections',
  'remove-collections',
  'set-collections',
]);

const BatchMetaBodySchema = z
  .object({
    kind: PresetKindSchema,
    ids: z.array(z.string().trim().min(1)).min(1).max(50),
    action: BatchActionSchema,
    payload: z
      .object({
        tags: z.array(z.string().trim().min(1).max(24)).optional(),
        collectionIds: z.array(z.string().trim().min(1)).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const payload = value.payload;
    const action = value.action;
    const needsTags = ['add-tags', 'remove-tags', 'set-tags'].includes(action);
    const needsCollections = [
      'add-collections',
      'remove-collections',
      'set-collections',
    ].includes(action);

    if (needsTags) {
      if (!payload || !('tags' in payload)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '标签不能为空',
          path: ['payload', 'tags'],
        });
      } else if (
        (action === 'add-tags' || action === 'remove-tags') &&
        (payload.tags || []).length === 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '标签不能为空',
          path: ['payload', 'tags'],
        });
      }
    }

    if (needsCollections) {
      if (!payload || !('collectionIds' in payload)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '收藏夹不能为空',
          path: ['payload', 'collectionIds'],
        });
      } else if (
        (action === 'add-collections' || action === 'remove-collections') &&
        (payload.collectionIds || []).length === 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '收藏夹不能为空',
          path: ['payload', 'collectionIds'],
        });
      }
    }
  });

@Controller('preset-meta')
export class PresetMetaController {
  constructor(private readonly presets: PresetMetaService) {}

  @Patch('batch')
  async batchUpdate(
    @CurrentUser() user: UserModel,
    @Body(new ZodValidationPipe(BatchMetaBodySchema))
    body: z.infer<typeof BatchMetaBodySchema>,
  ) {
    const items = await this.presets.applyBatch(user, body);
    return { items };
  }
}
