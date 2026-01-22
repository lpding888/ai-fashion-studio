import { BadRequestException, Injectable } from '@nestjs/common';
import { ModelConfig } from '../common/model-config';
import { TaskModel, UserModel } from '../db/models';
import { ModelConfigResolverService } from '../model-profile/model-config-resolver.service';

@Injectable()
export class TaskCommonService {
  constructor(
    private readonly modelConfigResolver: ModelConfigResolverService,
  ) {}

  stripSecretsFromConfig(config: ModelConfig | undefined): ModelConfig {
    if (!config) return {};
    const rest: ModelConfig = { ...config };
    delete rest.apiKey;
    delete rest.brainKey;
    delete rest.painterKey;
    delete rest.brainKeys;
    delete rest.painterKeys;
    return rest;
  }

  async resolveBrainRuntime(task: TaskModel, config?: ModelConfig) {
    const maybeKey = config?.brainKey || config?.apiKey;
    if (config?.brainModel && maybeKey) return config;
    return this.modelConfigResolver.resolveBrainRuntimeFromSnapshot(
      task.config,
    );
  }

  async resolvePainterRuntime(task: TaskModel, config?: ModelConfig) {
    const maybeKey = config?.painterKey || config?.apiKey;
    if (config?.painterModel && maybeKey) return config;
    return this.modelConfigResolver.resolvePainterRuntimeFromSnapshot(
      task.config,
    );
  }

  requireOwnerOrAdminForPreset(
    preset: unknown,
    user: UserModel,
    kindLabel: string,
  ) {
    if (!preset) throw new BadRequestException('Preset not found');

    // 兼容旧数据：未标记 userId 的预设只允许管理员访问，避免“历史数据全员可见”
    const record =
      typeof preset === 'object' && preset !== null
        ? (preset as Record<string, unknown>)
        : {};
    const ownerId =
      typeof record.userId === 'string' ? record.userId.trim() : '';
    if (!ownerId) {
      if (!user || user.role !== 'ADMIN') {
        throw new BadRequestException(
          `该${kindLabel}预设为历史数据，仅管理员可用`,
        );
      }
      return;
    }

    if (user.role === 'ADMIN') return;
    if (ownerId !== user.id) {
      throw new BadRequestException(`无权访问该${kindLabel}预设`);
    }
  }

  isAllowedCosImageUrl(raw: string): boolean {
    const input = String(raw || '').trim();
    if (!input) return false;
    try {
      const u = new URL(input);
      const host = (u.hostname || '').toLowerCase();
      const cdnDomain = String(process.env.COS_CDN_DOMAIN || '')
        .trim()
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '')
        .toLowerCase();
      if (cdnDomain && host === cdnDomain) {
        return u.protocol === 'https:';
      }
      // 最小约束：只接受腾讯云 COS 域名（与前端直传 COS 的 URL 形态一致）
      return (
        u.protocol === 'https:' &&
        host.includes('.cos.') &&
        host.endsWith('.myqcloud.com')
      );
    } catch {
      return false;
    }
  }
}
