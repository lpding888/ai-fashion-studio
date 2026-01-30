import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';
import { PromptOptimizerService } from './prompt-optimizer.service';
import {
  PromptOptimizerBodySchema,
  PromptOptimizerResponseSchema,
} from '../contracts/api.schemas';
import { z } from 'zod';
import { assertResponse } from '../common/response-contract';

@ApiTags('PromptOptimizer')
@ApiBearerAuth()
@Controller('prompt-optimizer')
export class PromptOptimizerController {
  constructor(private readonly optimizer: PromptOptimizerService) {}

  @Post('optimize')
  @ApiOperation({ summary: '优化提示词' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        settings: {
          type: 'object',
          properties: {
            layoutMode: { type: 'string', enum: ['Individual', 'Grid'] },
            shotCount: { type: 'number' },
            resolution: { type: 'string', enum: ['1K', '2K', '4K'] },
            aspectRatio: {
              type: 'string',
              enum: ['1:1', '3:4', '4:3', '9:16', '16:9', '21:9'],
            },
          },
          required: ['layoutMode', 'shotCount', 'resolution', 'aspectRatio'],
        },
        presets: {
          type: 'object',
          properties: {
            styles: { type: 'array', items: { type: 'object' } },
            poses: { type: 'array', items: { type: 'object' } },
            faces: { type: 'array', items: { type: 'object' } },
          },
        },
      },
      required: ['prompt', 'settings'],
    },
  })
  async optimize(
    @CurrentUser() user: UserModel,
    @Body(new ZodValidationPipe(PromptOptimizerBodySchema))
    body: z.infer<typeof PromptOptimizerBodySchema>,
  ) {
    const result = await this.optimizer.optimize(user, body);
    return assertResponse(
      PromptOptimizerResponseSchema,
      { success: true, ...result },
      'PromptOptimizerController.optimize',
    );
  }
}
