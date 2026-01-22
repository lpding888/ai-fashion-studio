import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';
import { PromptOptimizerService } from './prompt-optimizer.service';

const PresetItemSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    description: z.string().trim().optional(),
    tags: z.array(z.string().trim().min(1).max(24)).optional(),
    styleHint: z.string().trim().optional(),
  })
  .strict();

const OptimizePromptBodySchema = z
  .object({
    prompt: z.string().trim().min(1).max(2000),
    settings: z
      .object({
        layoutMode: z.enum(['Individual', 'Grid']),
        shotCount: z.number().int().min(1).max(6),
        resolution: z.enum(['1K', '2K', '4K']),
        aspectRatio: z.enum(['1:1', '3:4', '4:3', '9:16', '16:9', '21:9']),
      })
      .strict(),
    presets: z
      .object({
        styles: z.array(PresetItemSchema).max(3).optional(),
        poses: z.array(PresetItemSchema).max(4).optional(),
        faces: z.array(PresetItemSchema).max(3).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

@Controller('prompt-optimizer')
export class PromptOptimizerController {
  constructor(private readonly optimizer: PromptOptimizerService) {}

  @Post('optimize')
  async optimize(
    @CurrentUser() user: UserModel,
    @Body(new ZodValidationPipe(OptimizePromptBodySchema))
    body: z.infer<typeof OptimizePromptBodySchema>,
  ) {
    const result = await this.optimizer.optimize(user, body);
    return { success: true, ...result };
  }
}
