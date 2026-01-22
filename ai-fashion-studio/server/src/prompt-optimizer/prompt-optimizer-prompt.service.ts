import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';

export type PromptOptimizerPromptVersionMeta = {
  versionId: string;
  sha256: string;
  createdAt: number;
  createdBy: { id: string; username: string };
  note?: string;
};

export type PromptOptimizerPromptVersion = PromptOptimizerPromptVersionMeta & {
  content: string;
};

type ActivePromptRef = {
  versionId: string;
  updatedAt: number;
  updatedBy: { id: string; username: string };
};

@Injectable()
export class PromptOptimizerPromptService implements OnModuleInit {
  private logger = new Logger(PromptOptimizerPromptService.name);

  private rootDir = path.join(
    process.cwd(),
    'data',
    'prompt-optimizer-prompts',
  );
  private versionsDir = path.join(this.rootDir, 'versions');
  private activeJsonPath = path.join(this.rootDir, 'active.json');
  private activeMdPath = path.join(this.rootDir, 'active.md');

  private seedCache: string | null = null;

  async onModuleInit() {
    await this.ensureInitialized();
    try {
      this.seedCache = await this.readSeedPromptFromDocs();
    } catch {
      this.logger.warn('Failed to load prompt optimizer seed from docs');
      this.seedCache = null;
    }
  }

  private sha256(content: string) {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  private versionPath(versionId: string) {
    return path.join(this.versionsDir, `${versionId}.json`);
  }

  private async readSeedPromptFromDocs(): Promise<string | null> {
    const candidates = [
      path.join(process.cwd(), 'docs', 'prompt-optimizer', 'system.md'),
      path.join(process.cwd(), '..', 'docs', 'prompt-optimizer', 'system.md'),
      path.resolve(__dirname, '../../../docs/prompt-optimizer/system.md'),
      path.resolve(__dirname, '../../docs/prompt-optimizer/system.md'),
    ];

    for (const filePath of candidates) {
      if (await fs.pathExists(filePath)) {
        const content = (await fs.readFile(filePath, 'utf8')).trim();
        if (content) return content;
      }
    }

    return null;
  }

  private normalizeContent(input?: string | null): string | null {
    const trimmed = String(input ?? '').trim();
    if (trimmed) return trimmed;
    const seed = String(this.seedCache ?? '').trim();
    return seed || null;
  }

  async ensureInitialized() {
    await fs.ensureDir(this.versionsDir);

    const hasActive = await fs.pathExists(this.activeJsonPath);
    const existingVersions = (await fs.pathExists(this.versionsDir))
      ? (await fs.readdir(this.versionsDir)).filter((f) => f.endsWith('.json'))
      : [];

    if (hasActive || existingVersions.length > 0) return;

    const seed = await this.readSeedPromptFromDocs();
    if (!seed) {
      this.logger.warn(
        'No prompt optimizer seed found; initialized empty store',
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
      `Seeded prompt optimizer store with version ${seeded.versionId}`,
    );
  }

  async getActiveRef(): Promise<ActivePromptRef | null> {
    if (!(await fs.pathExists(this.activeJsonPath))) return null;
    return fs.readJson(this.activeJsonPath);
  }

  async getActive(): Promise<{
    ref: ActivePromptRef | null;
    version: PromptOptimizerPromptVersion | null;
  }> {
    const ref = await this.getActiveRef();
    if (!ref) return { ref: null, version: null };
    const version = await this.getVersion(ref.versionId);
    return { ref, version };
  }

  async getVersion(
    versionId: string,
  ): Promise<PromptOptimizerPromptVersion | null> {
    const filePath = this.versionPath(versionId);
    if (!(await fs.pathExists(filePath))) return null;
    const raw = await fs.readJson(filePath);
    const content = this.normalizeContent(raw?.content);
    if (!raw || !content) return null;
    return { ...(raw as PromptOptimizerPromptVersion), content };
  }

  async listVersions(): Promise<PromptOptimizerPromptVersionMeta[]> {
    await fs.ensureDir(this.versionsDir);
    const files = (await fs.readdir(this.versionsDir)).filter((f) =>
      f.endsWith('.json'),
    );

    const metas: PromptOptimizerPromptVersionMeta[] = [];
    for (const file of files) {
      const full = path.join(this.versionsDir, file);
      try {
        const v = (await fs.readJson(
          full,
        )) as PromptOptimizerPromptVersion;
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
    content: string,
    createdBy: { id: string; username: string },
    note?: string,
    publish?: boolean,
  ): Promise<PromptOptimizerPromptVersionMeta> {
    const normalized = this.normalizeContent(content);
    if (!normalized) {
      throw new Error('提示词内容不能为空');
    }

    const versionId = crypto.randomUUID();
    const createdAt = Date.now();
    const sha256 = this.sha256(normalized);

    const version: PromptOptimizerPromptVersion = {
      versionId,
      content: normalized,
      createdAt,
      createdBy,
      sha256,
      note,
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
  ): Promise<{ ref: ActivePromptRef; version: PromptOptimizerPromptVersion }> {
    const version = await this.getVersion(versionId);
    if (!version) throw new Error('版本不存在');

    const ref: ActivePromptRef = {
      versionId,
      updatedAt: Date.now(),
      updatedBy,
    };

    await fs.ensureDir(this.rootDir);
    await fs.writeJson(this.activeJsonPath, ref, { spaces: 2 });
    await fs.writeFile(this.activeMdPath, version.content, 'utf8');

    return { ref, version };
  }

  async getActivePromptText(): Promise<string> {
    const active = await this.getActive();
    const content = active.version?.content?.trim();
    if (content) return content;
    return this.normalizeContent(this.seedCache) || '';
  }
}
