import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';

export type DirectPromptPack = {
  directSystemPrompt: string;
};

export type DirectPromptVersionMeta = {
  versionId: string;
  sha256: string;
  createdAt: number;
  createdBy: { id: string; username: string };
  note?: string;
};

export type DirectPromptVersion = DirectPromptVersionMeta & {
  pack: DirectPromptPack;
};

type ActivePromptRef = {
  versionId: string;
  updatedAt: number;
  updatedBy: { id: string; username: string };
};

@Injectable()
export class DirectPromptService implements OnModuleInit {
  private logger = new Logger(DirectPromptService.name);

  private rootDir = path.join(process.cwd(), 'data', 'direct-prompts');
  private versionsDir = path.join(this.rootDir, 'versions');
  private activeJsonPath = path.join(this.rootDir, 'active.json');

  private seedPackCache: DirectPromptPack | null = null;

  async onModuleInit() {
    await this.ensureInitialized();
    try {
      this.seedPackCache = await this.readSeedPackFromDocs();
    } catch {
      this.logger.warn('Failed to load direct prompt seed from docs');
      this.seedPackCache = null;
    }
  }

  private sha256(content: string) {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  private versionPath(versionId: string) {
    return path.join(this.versionsDir, `${versionId}.json`);
  }

  private async readSeedPackFromDocs(): Promise<DirectPromptPack | null> {
    const candidates = [
      // start from repo root (when process.cwd() is repo root)
      path.join(process.cwd(), 'docs', 'direct-prompts'),
      // start from server/ (when process.cwd() is server/)
      path.join(process.cwd(), '..', 'docs', 'direct-prompts'),
      // robust relative to compiled output folder
      path.resolve(__dirname, '../../../docs/direct-prompts'),
      path.resolve(__dirname, '../../docs/direct-prompts'),
    ];

    for (const dir of candidates) {
      const sysPath = path.join(dir, 'direct_system.md');
      if (await fs.pathExists(sysPath)) {
        const directSystemPrompt = (await fs.readFile(sysPath, 'utf8')).trim();
        if (directSystemPrompt) return { directSystemPrompt };
      }
    }

    return null;
  }

  private normalizePack(pack: any | null | undefined): DirectPromptPack | null {
    const input: any = pack ?? {};
    const seed = this.seedPackCache;
    const directSystemPrompt = (input.directSystemPrompt ?? seed?.directSystemPrompt ?? '').trim();
    if (!directSystemPrompt) return null;
    return { directSystemPrompt };
  }

  async ensureInitialized() {
    await fs.ensureDir(this.versionsDir);

    const hasActive = await fs.pathExists(this.activeJsonPath);
    const existingVersions = (await fs.pathExists(this.versionsDir))
      ? (await fs.readdir(this.versionsDir)).filter((f) => f.endsWith('.json'))
      : [];

    if (hasActive || existingVersions.length > 0) return;

    const seed = await this.readSeedPackFromDocs();
    if (!seed) {
      this.logger.warn('No direct prompt seed found; initialized empty store');
      return;
    }

    const createdBy = { id: 'system', username: 'system' };
    const seeded = await this.createVersion(seed, createdBy, 'Seed from docs', true);
    this.logger.log(`Seeded direct prompt store with version ${seeded.versionId}`);
  }

  async getActiveRef(): Promise<ActivePromptRef | null> {
    if (!(await fs.pathExists(this.activeJsonPath))) return null;
    return fs.readJson(this.activeJsonPath);
  }

  async getActive(): Promise<{
    ref: ActivePromptRef | null;
    version: DirectPromptVersion | null;
  }> {
    const ref = await this.getActiveRef();
    if (!ref) return { ref: null, version: null };
    const version = await this.getVersion(ref.versionId);
    return { ref, version };
  }

  async getVersion(versionId: string): Promise<DirectPromptVersion | null> {
    const filePath = this.versionPath(versionId);
    if (!(await fs.pathExists(filePath))) return null;
    const raw = (await fs.readJson(filePath)) as any;
    const normalized = this.normalizePack(raw?.pack);
    if (!raw || !normalized) return null;
    return { ...(raw as DirectPromptVersion), pack: normalized };
  }

  async listVersions(): Promise<DirectPromptVersionMeta[]> {
    await fs.ensureDir(this.versionsDir);
    const files = (await fs.readdir(this.versionsDir)).filter((f) => f.endsWith('.json'));

    const metas: DirectPromptVersionMeta[] = [];
    for (const file of files) {
      const full = path.join(this.versionsDir, file);
      try {
        const v = (await fs.readJson(full)) as DirectPromptVersion;
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
    pack: DirectPromptPack,
    createdBy: { id: string; username: string },
    note?: string,
    publish?: boolean,
  ): Promise<DirectPromptVersionMeta> {
    const directSystemPrompt = (pack?.directSystemPrompt ?? '').trim();
    if (!directSystemPrompt) throw new Error('directSystemPrompt 不能为空');

    const versionId = crypto.randomUUID();
    const createdAt = Date.now();

    const normalizedPack: DirectPromptPack = { directSystemPrompt };
    const sha256 = this.sha256(JSON.stringify(normalizedPack));

    const version: DirectPromptVersion = {
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
  ): Promise<{ ref: ActivePromptRef; version: DirectPromptVersion }> {
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

  /**
   * 直出图 Painter systemInstruction 的统一入口：
   * - 优先用 active 版本
   * - 否则回退到 docs seed
   */
  async getActiveSystemPromptText(): Promise<string> {
    const active = await this.getActive();
    const v = active.version?.pack?.directSystemPrompt?.trim();
    if (v) return v;
    const seed = this.seedPackCache?.directSystemPrompt?.trim();
    return seed || '';
  }
}
