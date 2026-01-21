import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';
import { PromptSnippetService } from './prompt-snippet.service';

const CreatePromptSnippetBodySchema = z
  .object({
    name: z.string().trim().max(60).optional(),
    text: z.string().trim().min(1, '内容不能为空'),
  })
  .strict();

@Controller('prompt-snippets')
export class PromptSnippetController {
  constructor(private readonly promptSnippets: PromptSnippetService) {}

  @Get()
  async list(@CurrentUser() user: UserModel) {
    return this.promptSnippets.listByUser(user.id);
  }

  @Post()
  async create(
    @CurrentUser() user: UserModel,
    @Body(new ZodValidationPipe(CreatePromptSnippetBodySchema))
    body: z.infer<typeof CreatePromptSnippetBodySchema>,
  ) {
    return this.promptSnippets.createSnippet(user.id, body);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: UserModel, @Param('id') id: string) {
    const snippetId = String(id || '').trim();
    if (!snippetId) throw new BadRequestException('提示词不存在');
    const ok = await this.promptSnippets.deleteSnippet(user.id, snippetId);
    if (!ok) throw new BadRequestException('提示词不存在');
    return { success: true, id: snippetId };
  }
}
