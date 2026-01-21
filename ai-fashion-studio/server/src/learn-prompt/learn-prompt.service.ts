import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';

export type LearnPromptPack = {
  styleLearnPrompt: string;
  poseLearnPrompt: string;
};

export type LearnPromptVersionMeta = {
  versionId: string;
  sha256: string;
  createdAt: number;
  createdBy: { id: string; username: string };
  note?: string;
};

export type LearnPromptVersion = LearnPromptVersionMeta & {
  pack: LearnPromptPack;
};

type ActivePromptRef = {
  versionId: string;
  updatedAt: number;
  updatedBy: { id: string; username: string };
};

@Injectable()
export class LearnPromptService implements OnModuleInit {
  private logger = new Logger(LearnPromptService.name);

  private rootDir = path.join(process.cwd(), 'data', 'learn-prompts');
  private versionsDir = path.join(this.rootDir, 'versions');
  private activeJsonPath = path.join(this.rootDir, 'active.json');

  private seedPackCache: LearnPromptPack | null = null;

  async onModuleInit() {
    await this.ensureInitialized();
    try {
      this.seedPackCache = await this.readSeedPackFromDocs();
    } catch {
      this.logger.warn('Failed to load learn prompt seed from docs');
      this.seedPackCache = null;
    }
  }

  private sha256(content: string) {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  private versionPath(versionId: string) {
    return path.join(this.versionsDir, `${versionId}.json`);
  }

  private async readSeedPackFromDocs(): Promise<LearnPromptPack | null> {
    const candidates = [
      path.join(process.cwd(), 'docs', 'learn-prompts'),
      path.join(process.cwd(), '..', 'docs', 'learn-prompts'),
      path.resolve(__dirname, '../../../docs/learn-prompts'),
      path.resolve(__dirname, '../../docs/learn-prompts'),
    ];

    for (const dir of candidates) {
      const stylePath = path.join(dir, 'style_learn.md');
      const posePath = path.join(dir, 'pose_learn.md');
      if (!(await fs.pathExists(stylePath)) || !(await fs.pathExists(posePath)))
        continue;
      const styleLearnPrompt = (await fs.readFile(stylePath, 'utf8')).trim();
      const poseLearnPrompt = (await fs.readFile(posePath, 'utf8')).trim();
      if (styleLearnPrompt && poseLearnPrompt) {
        return { styleLearnPrompt, poseLearnPrompt };
      }
    }

    return null;
  }

  private normalizePack(pack: any | null | undefined): LearnPromptPack | null {
    const input: any = pack ?? {};
    const seed = this.seedPackCache;
    const styleLearnPrompt = (
      input.styleLearnPrompt ??
      seed?.styleLearnPrompt ??
      ''
    ).trim();
    const poseLearnPrompt = (
      input.poseLearnPrompt ??
      seed?.poseLearnPrompt ??
      ''
    ).trim();
    if (!styleLearnPrompt || !poseLearnPrompt) return null;
    return { styleLearnPrompt, poseLearnPrompt };
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
      this.logger.warn('No learn prompt seed found; initialized empty store');
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
      `Seeded learn prompt store with version ${seeded.versionId}`,
    );
  }

  async getActiveRef(): Promise<ActivePromptRef | null> {
    if (!(await fs.pathExists(this.activeJsonPath))) return null;
    return fs.readJson(this.activeJsonPath);
  }

  async getActive(): Promise<{
    ref: ActivePromptRef | null;
    version: LearnPromptVersion | null;
  }> {
    const ref = await this.getActiveRef();
    if (!ref) return { ref: null, version: null };
    const version = await this.getVersion(ref.versionId);
    return { ref, version };
  }

  async getVersion(versionId: string): Promise<LearnPromptVersion | null> {
    const filePath = this.versionPath(versionId);
    if (!(await fs.pathExists(filePath))) return null;
    const raw = await fs.readJson(filePath);
    const normalized = this.normalizePack(raw?.pack);
    if (!raw || !normalized) return null;
    return { ...(raw as LearnPromptVersion), pack: normalized };
  }

  async listVersions(): Promise<LearnPromptVersionMeta[]> {
    await fs.ensureDir(this.versionsDir);
    const files = (await fs.readdir(this.versionsDir)).filter((f) =>
      f.endsWith('.json'),
    );

    const metas: LearnPromptVersionMeta[] = [];
    for (const file of files) {
      const full = path.join(this.versionsDir, file);
      try {
        const v = (await fs.readJson(full)) as LearnPromptVersion;
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
    pack: LearnPromptPack,
    createdBy: { id: string; username: string },
    note?: string,
    publish?: boolean,
  ): Promise<LearnPromptVersionMeta> {
    const styleLearnPrompt = (pack?.styleLearnPrompt ?? '').trim();
    const poseLearnPrompt = (pack?.poseLearnPrompt ?? '').trim();
    if (!styleLearnPrompt) throw new Error('styleLearnPrompt 不能为空');
    if (!poseLearnPrompt) throw new Error('poseLearnPrompt 不能为空');

    const versionId = crypto.randomUUID();
    const createdAt = Date.now();

    const normalizedPack: LearnPromptPack = {
      styleLearnPrompt,
      poseLearnPrompt,
    };
    const sha256 = this.sha256(JSON.stringify(normalizedPack));

    const version: LearnPromptVersion = {
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
  ): Promise<{ ref: ActivePromptRef; version: LearnPromptVersion }> {
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

  async getActiveStyleLearnPromptText(): Promise<string> {
    const active = await this.getActive();
    const v = active.version?.pack?.styleLearnPrompt?.trim();
    if (v) return v;
    const seed = this.seedPackCache?.styleLearnPrompt?.trim();
    return seed || '';
  }

  async getActivePoseLearnPromptText(): Promise<string> {
    const active = await this.getActive();
    const v = active.version?.pack?.poseLearnPrompt?.trim();
    if (v) return v;
    const seed = this.seedPackCache?.poseLearnPrompt?.trim();
    return seed || '';
  }
}
