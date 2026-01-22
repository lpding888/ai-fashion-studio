import { Injectable, Logger } from '@nestjs/common';
import { BrainService } from '../brain/brain.service';
import { PromptOptimizerPromptService } from './prompt-optimizer-prompt.service';
import type { UserModel } from '../db/models';
import { BrainRoutingService } from '../brain-routing/brain-routing.service';

export type PromptOptimizerPreset = {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  styleHint?: string;
};

export type PromptOptimizerInput = {
  prompt: string;
  settings: {
    layoutMode: 'Individual' | 'Grid';
    shotCount: number;
    resolution: '1K' | '2K' | '4K';
    aspectRatio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9' | '21:9';
  };
  presets?: {
    styles?: PromptOptimizerPreset[];
    poses?: PromptOptimizerPreset[];
    faces?: PromptOptimizerPreset[];
  };
};

@Injectable()
export class PromptOptimizerService {
  private logger = new Logger(PromptOptimizerService.name);

  constructor(
    private readonly brain: BrainService,
    private readonly promptStore: PromptOptimizerPromptService,
    private readonly brainRouting: BrainRoutingService,
  ) {}

  private buildUserMessage(input: PromptOptimizerInput): string {
    const payload = {
      prompt: input.prompt,
      settings: input.settings,
      presets: input.presets ?? {},
    };

    return `INPUT_JSON:\n${JSON.stringify(payload, null, 2)}`;
  }

  async optimize(user: UserModel, input: PromptOptimizerInput): Promise<{
    optimizedPrompt: string;
    promptVersionId?: string;
    promptSha256?: string;
  }> {
    const normalizedPrompt = String(input.prompt || '').trim();
    if (!normalizedPrompt) {
      return { optimizedPrompt: '' };
    }

    const active = await this.promptStore.getActive();
    const systemPrompt =
      (await this.promptStore.getActivePromptText()) ||
      'You are a helpful assistant.';

    const routing = await this.brainRouting.resolveForTask('PROMPT_OPTIMIZE');
    const userMessage = this.buildUserMessage({
      ...input,
      prompt: normalizedPrompt,
    });

    const optimizedPrompt = await this.brain.optimizePromptText({
      systemPrompt,
      userMessage,
      fallbackPrompt: normalizedPrompt,
      config: routing.primary,
      fallbackConfig: routing.fallback,
      logLabel: `prompt_optimizer:${user?.id || 'anonymous'}`,
    });

    const trimmed = String(optimizedPrompt || '').trim();
    if (!trimmed) {
      this.logger.warn('Optimizer returned empty prompt; fallback to original');
      return {
        optimizedPrompt: normalizedPrompt,
        promptVersionId: active.version?.versionId,
        promptSha256: active.version?.sha256,
      };
    }

    return {
      optimizedPrompt: trimmed,
      promptVersionId: active.version?.versionId,
      promptSha256: active.version?.sha256,
    };
  }
}
