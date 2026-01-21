import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';

export type WorkflowPromptPack = {
  plannerSystemPrompt: string;
  painterSystemPrompt: string;
};

export type WorkflowPromptVersionMeta = {
  versionId: string;
  sha256: string;
  createdAt: number;
  createdBy: { id: string; username: string };
  note?: string;
};

export type WorkflowPromptVersion = WorkflowPromptVersionMeta & {
  pack: WorkflowPromptPack;
};

type ActivePromptRef = {
  versionId: string;
  updatedAt: number;
  updatedBy: { id: string; username: string };
};

@Injectable()
export class WorkflowPromptService implements OnModuleInit {
  private logger = new Logger(WorkflowPromptService.name);

  private rootDir = path.join(process.cwd(), 'data', 'workflow-prompts');
  private versionsDir = path.join(this.rootDir, 'versions');
  private activeJsonPath = path.join(this.rootDir, 'active.json');
  private seedPackCache: WorkflowPromptPack | null = null;

  async onModuleInit() {
    await this.ensureInitialized();
    try {
      this.seedPackCache = await this.readSeedPackFromDocs();
    } catch (e) {
      this.logger.warn('Failed to load workflow seed prompts from docs');
      this.seedPackCache = null;
    }
  }

  private sha256(content: string) {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  private versionPath(versionId: string) {
    return path.join(this.versionsDir, `${versionId}.json`);
  }

  private async readSeedPackFromDocs(): Promise<WorkflowPromptPack | null> {
    const candidates = [
      path.join(process.cwd(), 'docs', 'workflow-prompts'),
      path.join(process.cwd(), '..', 'docs', 'workflow-prompts'),
      path.join(__dirname, '../../docs/workflow-prompts'),
      path.resolve(__dirname, '../../../docs/workflow-prompts'),
    ];

    for (const dir of candidates) {
      const plannerPath = path.join(dir, 'planner_system.md');
      const painterPath = path.join(dir, 'painter_system.md');
      if (
        (await fs.pathExists(plannerPath)) &&
        (await fs.pathExists(painterPath))
      ) {
        const [plannerSystemPrompt, painterSystemPrompt] = await Promise.all([
          fs.readFile(plannerPath, 'utf8'),
          fs.readFile(painterPath, 'utf8'),
        ]);
        return {
          plannerSystemPrompt: plannerSystemPrompt.trim(),
          painterSystemPrompt: painterSystemPrompt.trim(),
        };
      }
    }

    return null;
  }

  private normalizePack(
    pack: any | null | undefined,
  ): WorkflowPromptPack | null {
    const input: any = pack ?? {};
    const seed = this.seedPackCache;

    // Backward compatible with older pack shapes (hero/storyboard/shot/grid)
    const plannerSystemPrompt = (
      input.plannerSystemPrompt ??
      input.storyboardBrainSystemPrompt ??
      seed?.plannerSystemPrompt ??
      (seed as any)?.storyboardBrainSystemPrompt ??
      ''
    ).trim();

    const painterSystemPrompt = (
      input.painterSystemPrompt ??
      input.heroPainterPrompt ??
      input.shotPainterPrompt ??
      input.gridPainterPrompt ??
      seed?.painterSystemPrompt ??
      (seed as any)?.heroPainterPrompt ??
      (seed as any)?.shotPainterPrompt ??
      (seed as any)?.gridPainterPrompt ??
      ''
    ).trim();

    if (!plannerSystemPrompt || !painterSystemPrompt) {
      return null;
    }

    return {
      plannerSystemPrompt,
      painterSystemPrompt,
    };
  }

  async ensureInitialized() {
    await fs.ensureDir(this.versionsDir);

    const hasActive = await fs.pathExists(this.activeJsonPath);
    const existingVersions = (await fs.pathExists(this.versionsDir))
      ? (await fs.readdir(this.versionsDir)).filter((f) => f.endsWith('.json'))
      : [];

    if (hasActive || existingVersions.length > 0) {
      return;
    }

    const seed = await this.readSeedPackFromDocs();
    if (!seed) {
      this.logger.warn(
        'No workflow seed prompts found; initialized empty store',
      );
      return;
    }

    const createdBy = { id: 'system', username: 'system' };
    const seeded = await this.createVersion(
      seed,
      createdBy,
      'Seed from docs',
      true,
    );
    this.logger.log(
      `Seeded workflow prompt store with version ${seeded.versionId}`,
    );
  }

  async getActiveRef(): Promise<ActivePromptRef | null> {
    if (!(await fs.pathExists(this.activeJsonPath))) return null;
    return fs.readJson(this.activeJsonPath);
  }

  async getActive(): Promise<{
    ref: ActivePromptRef | null;
    version: WorkflowPromptVersion | null;
  }> {
    const ref = await this.getActiveRef();
    if (!ref) return { ref: null, version: null };
    const version = await this.getVersion(ref.versionId);
    return { ref, version };
  }

  async getVersion(versionId: string): Promise<WorkflowPromptVersion | null> {
    const filePath = this.versionPath(versionId);
    if (!(await fs.pathExists(filePath))) return null;
    const raw = await fs.readJson(filePath);
    const normalized = this.normalizePack(raw?.pack);
    if (!raw || !normalized) return null;
    return { ...(raw as WorkflowPromptVersion), pack: normalized };
  }

  async listVersions(): Promise<WorkflowPromptVersionMeta[]> {
    await fs.ensureDir(this.versionsDir);
    const files = (await fs.readdir(this.versionsDir)).filter((f) =>
      f.endsWith('.json'),
    );

    const metas: WorkflowPromptVersionMeta[] = [];
    for (const file of files) {
      const full = path.join(this.versionsDir, file);
      try {
        const v = (await fs.readJson(full)) as WorkflowPromptVersion;
        metas.push({
          versionId: v.versionId,
          sha256: v.sha256,
          createdAt: v.createdAt,
          createdBy: v.createdBy,
          note: v.note,
        });
      } catch {
        this.logger.warn(`Failed to read version file: ${full}`);
      }
    }

    metas.sort((a, b) => b.createdAt - a.createdAt);
    return metas;
  }

  async createVersion(
    pack: WorkflowPromptPack,
    createdBy: { id: string; username: string },
    note?: string,
    publish?: boolean,
  ): Promise<WorkflowPromptVersionMeta> {
    const plannerSystemPrompt = (pack?.plannerSystemPrompt ?? '').trim();
    const painterSystemPrompt = (pack?.painterSystemPrompt ?? '').trim();

    if (!plannerSystemPrompt) throw new Error('plannerSystemPrompt 不能为空');
    if (!painterSystemPrompt) throw new Error('painterSystemPrompt 不能为空');

    const versionId = crypto.randomUUID();
    const createdAt = Date.now();

    const normalizedPack: WorkflowPromptPack = {
      plannerSystemPrompt,
      painterSystemPrompt,
    };
    const sha256 = this.sha256(JSON.stringify(normalizedPack));

    const version: WorkflowPromptVersion = {
      versionId,
      createdAt,
      createdBy,
      sha256,
      note,
      pack: normalizedPack,
    };

    await fs.ensureDir(this.versionsDir);
    await fs.writeJson(this.versionPath(versionId), version, { spaces: 2 });

    if (publish) {
      await this.publishVersion(versionId, createdBy);
    }

    return { versionId, sha256, createdAt, createdBy, note };
  }

  async publishVersion(
    versionId: string,
    updatedBy: { id: string; username: string },
  ): Promise<{ ref: ActivePromptRef; version: WorkflowPromptVersion }> {
    const version = await this.getVersion(versionId);
    if (!version) throw new Error('版本不存在');

    const ref: ActivePromptRef = {
      versionId,
      updatedAt: Date.now(),
      updatedBy,
    };

    await fs.ensureDir(this.rootDir);
    await fs.writeJson(this.activeJsonPath, ref, { spaces: 2 });

    return { ref, version };
  }
}
