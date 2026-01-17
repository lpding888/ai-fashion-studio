import { Injectable } from '@nestjs/common';
import { ModelConfig } from '../common/model-config';
import {
  ModelProfileRuntime,
  ModelProfileService,
} from './model-profile.service';

@Injectable()
export class ModelConfigResolverService {
  constructor(private readonly profiles: ModelProfileService) {}

  private rr: Record<ModelProfileRuntime['kind'], number> = {
    BRAIN: 0,
    PAINTER: 0,
  };

  private normalizePoolIds(poolIds?: string[], fallbackId?: string): string[] {
    const ids = Array.isArray(poolIds) ? poolIds.map((v) => String(v).trim()).filter(Boolean) : [];
    if (ids.length > 0) return ids;
    const single = String(fallbackId || '').trim();
    return single ? [single] : [];
  }

  private async resolvePoolKeys(
    kind: ModelProfileRuntime['kind'],
    poolIds?: string[],
    fallbackId?: string,
  ): Promise<{ ids: string[]; keys: string[] }> {
    const ids = this.normalizePoolIds(poolIds, fallbackId);
    const resolved: ModelProfileRuntime[] = [];
    for (const id of ids) {
      try {
        const runtime = await this.profiles.getRuntimeById(id);
        if (runtime.kind !== kind) continue;
        resolved.push(runtime);
      } catch {
        // ignore missing/disabled
      }
    }
    return { ids: resolved.map((r) => r.id), keys: resolved.map((r) => r.apiKey) };
  }

  async buildSnapshotFromActive(): Promise<ModelConfig> {
    const brainPool = await this.profiles.getActiveRuntimePool('BRAIN');
    const painterPool = await this.profiles.getActiveRuntimePool('PAINTER');

    const brain = brainPool[0];
    const painter = painterPool[0];

    // Guard: pool must be consistent (same gateway+model) for predictable behavior.
    const mismatchBrain = brainPool.some((p) => p.gateway !== brain.gateway || p.model !== brain.model);
    if (mismatchBrain) {
      throw new Error('BRAIN Key 池的 gateway/model 不一致，请确保同一网关/模型下仅更换 apiKey');
    }
    const mismatchPainter = painterPool.some((p) => p.gateway !== painter.gateway || p.model !== painter.model);
    if (mismatchPainter) {
      throw new Error('PAINTER Key 池的 gateway/model 不一致，请确保同一网关/模型下仅更换 apiKey');
    }

    return {
      brainProfileId: brain.id,
      brainProfileIds: brainPool.map((p) => p.id),
      brainGateway: brain.gateway,
      brainModel: brain.model,

      painterProfileId: painter.id,
      painterProfileIds: painterPool.map((p) => p.id),
      painterGateway: painter.gateway,
      painterModel: painter.model,
    };
  }

  async resolveRuntimeFromSnapshot(
    snapshot?: ModelConfig,
  ): Promise<ModelConfig> {
    const brainRuntime = await this.resolveRuntime(
      'BRAIN',
      snapshot?.brainProfileId,
      snapshot?.brainProfileIds,
    );
    const painterRuntime = await this.resolveRuntime(
      'PAINTER',
      snapshot?.painterProfileId,
      snapshot?.painterProfileIds,
    );

    const brainPool = await this.resolvePoolKeys('BRAIN', snapshot?.brainProfileIds, snapshot?.brainProfileId);
    const painterPool = await this.resolvePoolKeys('PAINTER', snapshot?.painterProfileIds, snapshot?.painterProfileId);

    return {
      ...snapshot,

      brainProfileId: brainRuntime.id,
      brainProfileIds: snapshot?.brainProfileIds,
      brainGateway: brainRuntime.gateway,
      brainModel: brainRuntime.model,
      brainKey: brainRuntime.apiKey,
      brainKeys: brainPool.keys.length > 0 ? brainPool.keys : undefined,

      painterProfileId: painterRuntime.id,
      painterProfileIds: snapshot?.painterProfileIds,
      painterGateway: painterRuntime.gateway,
      painterModel: painterRuntime.model,
      painterKey: painterRuntime.apiKey,
      painterKeys: painterPool.keys.length > 0 ? painterPool.keys : undefined,
    };
  }

  async resolveBrainRuntimeFromSnapshot(
    snapshot?: ModelConfig,
  ): Promise<ModelConfig> {
    const brainRuntime = await this.resolveRuntime(
      'BRAIN',
      snapshot?.brainProfileId,
      snapshot?.brainProfileIds,
    );
    const pool = await this.resolvePoolKeys('BRAIN', snapshot?.brainProfileIds, snapshot?.brainProfileId);
    return {
      ...snapshot,
      brainProfileId: brainRuntime.id,
      brainProfileIds: snapshot?.brainProfileIds,
      brainGateway: brainRuntime.gateway,
      brainModel: brainRuntime.model,
      brainKey: brainRuntime.apiKey,
      brainKeys: pool.keys.length > 0 ? pool.keys : undefined,
    };
  }

  async resolvePainterRuntimeFromSnapshot(
    snapshot?: ModelConfig,
  ): Promise<ModelConfig> {
    const painterRuntime = await this.resolveRuntime(
      'PAINTER',
      snapshot?.painterProfileId,
      snapshot?.painterProfileIds,
    );
    const pool = await this.resolvePoolKeys('PAINTER', snapshot?.painterProfileIds, snapshot?.painterProfileId);
    return {
      ...snapshot,
      painterProfileId: painterRuntime.id,
      painterProfileIds: snapshot?.painterProfileIds,
      painterGateway: painterRuntime.gateway,
      painterModel: painterRuntime.model,
      painterKey: painterRuntime.apiKey,
      painterKeys: pool.keys.length > 0 ? pool.keys : undefined,
    };
  }

  private async resolveRuntime(
    kind: ModelProfileRuntime['kind'],
    id?: string,
    poolIds?: string[],
  ): Promise<ModelProfileRuntime> {
    if (id) {
      const runtime = await this.profiles.getRuntimeById(id);
      if (runtime.kind !== kind) {
        throw new Error(`${kind} profileId 与类型不匹配`);
      }
      return runtime;
    }

    const ids = Array.isArray(poolIds) ? poolIds.map((v) => String(v).trim()).filter(Boolean) : [];
    if (ids.length > 0) {
      const start = this.rr[kind] % ids.length;
      this.rr[kind] = (this.rr[kind] + 1) % ids.length;

      for (let offset = 0; offset < ids.length; offset++) {
        const idx = (start + offset) % ids.length;
        try {
          const runtime = await this.profiles.getRuntimeById(ids[idx]);
          if (runtime.kind !== kind) continue;
          return runtime;
        } catch {
          // try next id
        }
      }
    }

    return this.profiles.getActiveRuntime(kind);
  }
}
