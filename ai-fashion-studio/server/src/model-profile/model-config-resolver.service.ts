import { Injectable } from '@nestjs/common';
import { ModelConfig } from '../common/model-config';
import {
  ModelProfileRuntime,
  ModelProfileService,
} from './model-profile.service';

@Injectable()
export class ModelConfigResolverService {
  constructor(private readonly profiles: ModelProfileService) {}

  async buildSnapshotFromActive(): Promise<ModelConfig> {
    const brain = await this.profiles.getActiveRuntime('BRAIN');
    const painter = await this.profiles.getActiveRuntime('PAINTER');

    return {
      brainProfileId: brain.id,
      brainGateway: brain.gateway,
      brainModel: brain.model,

      painterProfileId: painter.id,
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
    );
    const painterRuntime = await this.resolveRuntime(
      'PAINTER',
      snapshot?.painterProfileId,
    );

    return {
      ...snapshot,

      brainProfileId: brainRuntime.id,
      brainGateway: brainRuntime.gateway,
      brainModel: brainRuntime.model,
      brainKey: brainRuntime.apiKey,

      painterProfileId: painterRuntime.id,
      painterGateway: painterRuntime.gateway,
      painterModel: painterRuntime.model,
      painterKey: painterRuntime.apiKey,
    };
  }

  async resolveBrainRuntimeFromSnapshot(
    snapshot?: ModelConfig,
  ): Promise<ModelConfig> {
    const brainRuntime = await this.resolveRuntime(
      'BRAIN',
      snapshot?.brainProfileId,
    );
    return {
      ...snapshot,
      brainProfileId: brainRuntime.id,
      brainGateway: brainRuntime.gateway,
      brainModel: brainRuntime.model,
      brainKey: brainRuntime.apiKey,
    };
  }

  async resolvePainterRuntimeFromSnapshot(
    snapshot?: ModelConfig,
  ): Promise<ModelConfig> {
    const painterRuntime = await this.resolveRuntime(
      'PAINTER',
      snapshot?.painterProfileId,
    );
    return {
      ...snapshot,
      painterProfileId: painterRuntime.id,
      painterGateway: painterRuntime.gateway,
      painterModel: painterRuntime.model,
      painterKey: painterRuntime.apiKey,
    };
  }

  private async resolveRuntime(
    kind: ModelProfileRuntime['kind'],
    id?: string,
  ): Promise<ModelProfileRuntime> {
    if (id) {
      const runtime = await this.profiles.getRuntimeById(id);
      if (runtime.kind !== kind) {
        throw new Error(`${kind} profileId 与类型不匹配`);
      }
      return runtime;
    }

    return this.profiles.getActiveRuntime(kind);
  }
}
