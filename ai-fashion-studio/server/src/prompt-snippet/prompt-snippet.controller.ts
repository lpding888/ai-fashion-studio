import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';
import { PromptSnippetService } from './prompt-snippet.service';
import {
  PromptSnippetListResponseSchema,
  PromptSnippetCreateResponseSchema,
  PromptSnippetDeleteResponseSchema,
} from '../contracts/api.schemas';
import { assertResponse } from '../common/response-contract';

const CreatePromptSnippetBodySchema = z
  .object({
    name: z.string().trim().max(60).optional(),
    text: z.string().trim().min(1, '内容不能为空'),
  })
  .strict();

@ApiTags('PromptSnippets')
@ApiBearerAuth()
@Controller('prompt-snippets')
export class PromptSnippetController {
  constructor(private readonly promptSnippets: PromptSnippetService) {}

  @Get()
  @ApiOperation({ summary: '获取提示词片段列表' })
  async list(@CurrentUser() user: UserModel) {
    const result = await this.promptSnippets.listByUser(user.id);
    return assertResponse(
      PromptSnippetListResponseSchema,
      result,
      'PromptSnippetController.list',
    );
  }

  @Post()
  @ApiOperation({ summary: '创建提示词片段' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['text'],
    },
  })
  async create(
    @CurrentUser() user: UserModel,
    @Body(new ZodValidationPipe(CreatePromptSnippetBodySchema))
    body: z.infer<typeof CreatePromptSnippetBodySchema>,
  ) {
    const result = await this.promptSnippets.createSnippet(user.id, body);
    return assertResponse(
      PromptSnippetCreateResponseSchema,
      result,
      'PromptSnippetController.create',
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除提示词片段' })
  @ApiParam({ name: 'id', type: String })
  async remove(@CurrentUser() user: UserModel, @Param('id') id: string) {
    const snippetId = String(id || '').trim();
    if (!snippetId) throw new BadRequestException('提示词不存在');
    const ok = await this.promptSnippets.deleteSnippet(user.id, snippetId);
    if (!ok) throw new BadRequestException('提示词不存在');
    return assertResponse(
      PromptSnippetDeleteResponseSchema,
      { success: true, id: snippetId },
      'PromptSnippetController.remove',
    );
  }
}
