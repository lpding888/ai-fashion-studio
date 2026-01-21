import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';

export type BrainPromptVersionMeta = {
  versionId: string;
  sha256: string;
  createdAt: number;
  createdBy: { id: string; username: string };
  note?: string;
};

export type BrainPromptVersion = BrainPromptVersionMeta & {
  content: string;
};

type ActivePromptRef = {
  versionId: string;
  updatedAt: number;
  updatedBy: { id: string; username: string };
};

@Injectable()
export class BrainPromptService implements OnModuleInit {
  private logger = new Logger(BrainPromptService.name);

  private rootDir = path.join(process.cwd(), 'data', 'brain-prompts');
  private versionsDir = path.join(this.rootDir, 'versions');
  private activeJsonPath = path.join(this.rootDir, 'active.json');
  private activeMdPath = path.join(this.rootDir, 'active.md');

  async onModuleInit() {
    await this.ensureInitialized();
  }

  private sha256(content: string) {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  private versionPath(versionId: string) {
    return path.join(this.versionsDir, `${versionId}.json`);
  }

  private async readSeedPromptFromDocs(): Promise<string | null> {
    const possiblePaths = [
      path.join(process.cwd(), 'docs', 'System_Prompt_Brain_v2.0.md'),
      path.join(__dirname, '../../docs/System_Prompt_Brain_v2.0.md'),
    ];

    for (const promptPath of possiblePaths) {
      if (await fs.pathExists(promptPath)) {
        return fs.readFile(promptPath, 'utf8');
      }
    }

    return null;
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

    const seed = await this.readSeedPromptFromDocs();
    if (!seed) {
      this.logger.warn(
        'No seed system prompt found; initialized empty prompt store',
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
      `Seeded brain prompt store with version ${seeded.versionId}`,
    );
  }

  async getActiveRef(): Promise<ActivePromptRef | null> {
    if (!(await fs.pathExists(this.activeJsonPath))) return null;
    return fs.readJson(this.activeJsonPath);
  }

  async getActive(): Promise<{
    ref: ActivePromptRef | null;
    version: BrainPromptVersion | null;
  }> {
    const ref = await this.getActiveRef();
    if (!ref) return { ref: null, version: null };
    const version = await this.getVersion(ref.versionId);
    return { ref, version };
  }

  async getVersion(versionId: string): Promise<BrainPromptVersion | null> {
    const filePath = this.versionPath(versionId);
    if (!(await fs.pathExists(filePath))) return null;
    return fs.readJson(filePath);
  }

  async listVersions(): Promise<BrainPromptVersionMeta[]> {
    await fs.ensureDir(this.versionsDir);
    const files = (await fs.readdir(this.versionsDir)).filter((f) =>
      f.endsWith('.json'),
    );

    const metas: BrainPromptVersionMeta[] = [];
    for (const file of files) {
      const full = path.join(this.versionsDir, file);
      try {
        const v = (await fs.readJson(full)) as BrainPromptVersion;
        metas.push({
          versionId: v.versionId,
          sha256: v.sha256,
          createdAt: v.createdAt,
          createdBy: v.createdBy,
          note: v.note,
        });
      } catch (e) {
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
  ): Promise<BrainPromptVersionMeta> {
    const trimmed = (content ?? '').trim();
    if (!trimmed) {
      throw new Error('提示词内容不能为空');
    }

    const versionId = crypto.randomUUID();
    const createdAt = Date.now();
    const sha256 = this.sha256(trimmed);

    const version: BrainPromptVersion = {
      versionId,
      content: trimmed,
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

    return {
      versionId,
      sha256,
      createdAt,
      createdBy,
      note,
    };
  }

  async publishVersion(
    versionId: string,
    updatedBy: { id: string; username: string },
  ): Promise<{ ref: ActivePromptRef; version: BrainPromptVersion }> {
    const version = await this.getVersion(versionId);
    if (!version) {
      throw new Error('版本不存在');
    }

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
}
