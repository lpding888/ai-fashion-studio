import { Module } from '@nestjs/common';
import { PromptSnippetController } from './prompt-snippet.controller';
import { PromptSnippetService } from './prompt-snippet.service';

@Module({
  controllers: [PromptSnippetController],
  providers: [PromptSnippetService],
})
export class PromptSnippetModule {}
