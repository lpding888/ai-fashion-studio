import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ModelConfig } from '../common/model-config';
import {
  ModelProfileRuntime,
  ModelProfileService,
} from '../model-profile/model-profile.service';

export type BrainRoutingConfig = {
  defaultBrainProfileId?: string;
  styleLearnProfileId?: string;
  poseLearnProfileId?: string;
  promptOptimizeProfileId?: string;
};

export type BrainRoutingPatch = {
  defaultBrainProfileId?: string | null;
  styleLearnProfileId?: string | null;
  poseLearnProfileId?: string | null;
  promptOptimizeProfileId?: string | null;
};

export type BrainRoutingTask =
  | 'STYLE_LEARN'
  | 'POSE_LEARN'
  | 'PROMPT_OPTIMIZE';

type StoreFileV1 = {
  version: 1;
  defaultBrainProfileId?: string;
  styleLearnProfileId?: string;
  poseLearnProfileId?: string;
  promptOptimizeProfileId?: string;
  updatedAt?: number;
  updatedBy?: { id: string; username: string };
};

@Injectable()
export class BrainRoutingService {
  private logger = new Logger(BrainRoutingService.name);
  private secretsDir = path.join(process.cwd(), 'data', 'secrets');
  private storePath = path.join(this.secretsDir, 'brain-routing.json');

  constructor(private readonly profiles: ModelProfileService) {}

  private normalizeId(value: unknown): string | undefined {
    const v = String(value || '').trim();
    return v ? v : undefined;
  }

  private async readStore(): Promise<StoreFileV1> {
    await fs.ensureDir(this.secretsDir);
    if (!(await fs.pathExists(this.storePath))) {
      const empty: StoreFileV1 = { version: 1 };
      await fs.writeJson(this.storePath, empty, { spaces: 2 });
      return empty;
    }

    const raw = await fs.readJson(this.storePath);
    if (!raw || raw.version !== 1) {
      throw new Error('brain-routing.json 格式无效');
    }
    return raw as StoreFileV1;
  }

  private async writeStore(next: StoreFileV1) {
    await fs.ensureDir(this.secretsDir);
    await fs.writeJson(this.storePath, next, { spaces: 2 });
  }

  async getRouting(): Promise<BrainRoutingConfig> {
    const store = await this.readStore();
    return {
      defaultBrainProfileId: store.defaultBrainProfileId,
      styleLearnProfileId: store.styleLearnProfileId,
      poseLearnProfileId: store.poseLearnProfileId,
      promptOptimizeProfileId: store.promptOptimizeProfileId,
    };
  }

  async updateRouting(
    patch: BrainRoutingPatch,
    admin: { id: string; username: string },
  ): Promise<BrainRoutingConfig> {
    const store = await this.readStore();
    const pickId = (key: keyof BrainRoutingPatch, fallback?: string) => {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) return fallback;
      return this.normalizeId(patch[key]);
    };
    const next: StoreFileV1 = {
      ...store,
      defaultBrainProfileId: pickId(
        'defaultBrainProfileId',
        store.defaultBrainProfileId,
      ),
      styleLearnProfileId: pickId(
        'styleLearnProfileId',
        store.styleLearnProfileId,
      ),
      poseLearnProfileId: pickId(
        'poseLearnProfileId',
        store.poseLearnProfileId,
      ),
      promptOptimizeProfileId: pickId(
        'promptOptimizeProfileId',
        store.promptOptimizeProfileId,
      ),
      updatedAt: Date.now(),
      updatedBy: admin,
    };

    await this.ensureBrainProfile(next.defaultBrainProfileId);
    await this.ensureBrainProfile(next.styleLearnProfileId);
    await this.ensureBrainProfile(next.poseLearnProfileId);
    await this.ensureBrainProfile(next.promptOptimizeProfileId);

    await this.writeStore(next);

    return {
      defaultBrainProfileId: next.defaultBrainProfileId,
      styleLearnProfileId: next.styleLearnProfileId,
      poseLearnProfileId: next.poseLearnProfileId,
      promptOptimizeProfileId: next.promptOptimizeProfileId,
    };
  }

  private async ensureBrainProfile(profileId?: string) {
    if (!profileId) return;
    const runtime = await this.profiles.getRuntimeById(profileId);
    if (runtime.kind !== 'BRAIN') {
      throw new Error('仅支持选择 BRAIN 类型的模型');
    }
  }

  private buildBrainConfig(runtime: ModelProfileRuntime): ModelConfig {
    return {
      brainProfileId: runtime.id,
      brainGateway: runtime.gateway,
      brainModel: runtime.model,
      brainProvider: runtime.provider,
      brainKey: runtime.apiKey,
      gatewayUrl: runtime.gateway,
      apiKey: runtime.apiKey,
    };
  }

  private async resolveRuntimeById(
    profileId?: string,
  ): Promise<ModelProfileRuntime | undefined> {
    if (!profileId) return undefined;
    try {
      const runtime = await this.profiles.getRuntimeById(profileId);
      if (runtime.kind !== 'BRAIN') {
        this.logger.warn(`Routing profile ${profileId} 不是 BRAIN 类型`);
        return undefined;
      }
      return runtime;
    } catch (e: any) {
      this.logger.warn(
        `Routing profile ${profileId} 不可用：${e?.message || e}`,
      );
      return undefined;
    }
  }

  async resolveForTask(task: BrainRoutingTask): Promise<{
    primary: ModelConfig;
    fallback?: ModelConfig;
  }> {
    const routing = await this.getRouting();
    const taskId =
      task === 'STYLE_LEARN'
        ? routing.styleLearnProfileId
        : task === 'POSE_LEARN'
          ? routing.poseLearnProfileId
          : routing.promptOptimizeProfileId;

    const defaultRuntime =
      (await this.resolveRuntimeById(routing.defaultBrainProfileId)) ||
      (await this.profiles.getActiveRuntime('BRAIN'));

    const taskRuntime =
      (await this.resolveRuntimeById(taskId)) || defaultRuntime;

    const primary = this.buildBrainConfig(taskRuntime);

    if (taskRuntime.id === defaultRuntime.id) {
      return { primary };
    }

    return { primary, fallback: this.buildBrainConfig(defaultRuntime) };
  }
}
