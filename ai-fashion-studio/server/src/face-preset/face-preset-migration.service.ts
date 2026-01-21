import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { CosService } from '../cos/cos.service';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface MigrationStatus {
  total: number;
  migrated: number;
  pending: number;
  pendingPresets: Array<{ id: string; name: string; path: string }>;
}

export interface MigrationResult {
  success: boolean;
  migratedCount: number;
  failedCount: number;
  errors: Array<{ id: string; name: string; error: string }>;
}

@Injectable()
export class FacePresetMigrationService {
  private logger = new Logger(FacePresetMigrationService.name);

  constructor(
    private db: DbService,
    private cosService: CosService,
  ) {}

  /**
   * 检查迁移状态：统计有多少预设图还在本地
   */
  async getMigrationStatus(): Promise<MigrationStatus> {
    const allPresets = await this.db.getAllFacePresets();

    // 过滤出本地路径（未迁移到COS的）
    const pendingPresets = allPresets.filter(
      (preset) => !preset.imagePath.startsWith('http'),
    );

    const status: MigrationStatus = {
      total: allPresets.length,
      migrated: allPresets.length - pendingPresets.length,
      pending: pendingPresets.length,
      pendingPresets: pendingPresets.map((p) => ({
        id: p.id,
        name: p.name,
        path: p.imagePath,
      })),
    };

    this.logger.log(
      `Migration Status: ${status.migrated}/${status.total} migrated, ${status.pending} pending`,
    );
    return status;
  }

  /**
   * 执行批量迁移：将本地预设图上传到COS
   */
  async migrateToCoS(): Promise<MigrationResult> {
    if (!this.cosService.isEnabled()) {
      throw new Error(
        'COS未配置，无法执行迁移。请在.env.local中设置TENCENT_SECRET_ID和TENCENT_SECRET_KEY',
      );
    }

    const allPresets = await this.db.getAllFacePresets();
    const localPresets = allPresets.filter(
      (preset) => !preset.imagePath.startsWith('http'),
    );

    if (localPresets.length === 0) {
      this.logger.log('All presets already migrated to COS');
      return {
        success: true,
        migratedCount: 0,
        failedCount: 0,
        errors: [],
      };
    }

    this.logger.log(`Starting migration for ${localPresets.length} presets...`);

    let migratedCount = 0;
    const errors: Array<{ id: string; name: string; error: string }> = [];

    for (const preset of localPresets) {
      try {
        // 检查本地文件是否存在
        if (!(await fs.pathExists(preset.imagePath))) {
          throw new Error(`Local file not found: ${preset.imagePath}`);
        }

        // 提取文件扩展名
        const ext = path.extname(preset.imagePath);
        const cosKey = `face-presets/${preset.id}${ext}`;

        this.logger.log(`Uploading ${preset.name} (${preset.id}) to COS...`);

        // 上传到COS
        await this.cosService.uploadFile(cosKey, preset.imagePath);

        // 获取COS URL
        const cosUrl = this.cosService.getImageUrl(cosKey);

        // 更新数据库中的路径
        await this.db.updateFacePreset(preset.id, { imagePath: cosUrl });

        this.logger.log(`✅ Migrated: ${preset.name} -> ${cosUrl}`);
        migratedCount++;

        // 可选：删除本地文件以节省空间（谨慎操作）
        // await fs.remove(preset.imagePath);
      } catch (error) {
        this.logger.error(
          `Failed to migrate ${preset.name} (${preset.id}):`,
          error.message,
        );
        errors.push({
          id: preset.id,
          name: preset.name,
          error: error.message,
        });
      }
    }

    const result: MigrationResult = {
      success: errors.length === 0,
      migratedCount,
      failedCount: errors.length,
      errors,
    };

    this.logger.log(
      `Migration completed: ${migratedCount} succeeded, ${errors.length} failed`,
    );
    return result;
  }

  /**
   * 将单个预设图迁移到COS（用于新上传的图片）
   */
  async migrateSinglePreset(presetId: string): Promise<boolean> {
    if (!this.cosService.isEnabled()) {
      this.logger.warn('COS not enabled, skipping migration');
      return false;
    }

    const preset = await this.db.getFacePreset(presetId);
    if (!preset) {
      throw new Error(`Preset not found: ${presetId}`);
    }

    // 已经是COS URL，无需迁移
    if (preset.imagePath.startsWith('http')) {
      return true;
    }

    // 检查本地文件
    if (!(await fs.pathExists(preset.imagePath))) {
      throw new Error(`Local file not found: ${preset.imagePath}`);
    }

    const ext = path.extname(preset.imagePath);
    const cosKey = `face-presets/${preset.id}${ext}`;

    // 上传到COS
    await this.cosService.uploadFile(cosKey, preset.imagePath);
    const cosUrl = this.cosService.getImageUrl(cosKey);

    // 更新数据库
    await this.db.updateFacePreset(preset.id, { imagePath: cosUrl });

    this.logger.log(`Single preset migrated: ${preset.name} -> ${cosUrl}`);
    return true;
  }
}
