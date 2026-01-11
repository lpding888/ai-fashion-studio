import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { CosService } from '../cos/cos.service';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface MigrationStatus {
    total: number;
    migrated: number;
    pending: number;
    pendingPresets: Array<{ id: string; name: string; paths: string[] }>;
}

export interface MigrationResult {
    success: boolean;
    migratedCount: number;
    failedCount: number;
    errors: Array<{ id: string; name: string; error: string }>;
}

@Injectable()
export class StylePresetMigrationService {
    private logger = new Logger(StylePresetMigrationService.name);

    constructor(
        private db: DbService,
        private cosService: CosService
    ) { }

    /**
     * 检查迁移状态：统计有多少风格预设图还在本地
     */
    async getMigrationStatus(): Promise<MigrationStatus> {
        const allPresets = await this.db.getAllStylePresets();

        // 过滤出本地路径（未迁移到COS的）
        const pendingPresets = allPresets.filter(preset =>
            preset.imagePaths && preset.imagePaths.some(p => !p.startsWith('http'))
        );

        const status: MigrationStatus = {
            total: allPresets.length,
            migrated: allPresets.length - pendingPresets.length,
            pending: pendingPresets.length,
            pendingPresets: pendingPresets.map(p => ({
                id: p.id,
                name: p.name,
                paths: p.imagePaths.filter(path => !path.startsWith('http'))
            }))
        };

        this.logger.log(`Migration Status: ${status.migrated}/${status.total} migrated, ${status.pending} pending`);
        return status;
    }

    /**
     * 执行批量迁移：将本地风格预设图上传到COS
     */
    async migrateToCoS(): Promise<MigrationResult> {
        if (!this.cosService.isEnabled()) {
            throw new Error('COS未配置，无法执行迁移。请在.env.local中设置TENCENT_SECRET_ID和TENCENT_SECRET_KEY');
        }

        const allPresets = await this.db.getAllStylePresets();
        const localPresets = allPresets.filter(preset =>
            preset.imagePaths && preset.imagePaths.some(p => !p.startsWith('http'))
        );

        if (localPresets.length === 0) {
            this.logger.log('All presets already migrated to COS');
            return {
                success: true,
                migratedCount: 0,
                failedCount: 0,
                errors: []
            };
        }

        this.logger.log(`Starting migration for ${localPresets.length} style presets...`);

        let migratedCount = 0;
        const errors: Array<{ id: string; name: string; error: string }> = [];

        for (const preset of localPresets) {
            try {
                const newImagePaths: string[] = [];

                // 迁移每张图片
                for (let i = 0; i < preset.imagePaths.length; i++) {
                    const imgPath = preset.imagePaths[i];

                    // 如果已经是COS URL，保持不变
                    if (imgPath.startsWith('http')) {
                        newImagePaths.push(imgPath);
                        continue;
                    }

                    // 规范化本地路径（移除 ./ 前缀）
                    const normalizedPath = imgPath.replace(/^\.\//, '');

                    // 检查本地文件是否存在
                    if (!await fs.pathExists(normalizedPath)) {
                        this.logger.warn(`Local file not found: ${normalizedPath}, skipping`);
                        continue;
                    }

                    // 提取文件扩展名
                    const ext = path.extname(normalizedPath);
                    const cosKey = `style-presets/${preset.id}_${i}${ext}`;

                    this.logger.log(`Uploading ${preset.name} image ${i + 1}/${preset.imagePaths.length} to COS...`);

                    // 上传到COS
                    await this.cosService.uploadFile(cosKey, normalizedPath);

                    // 获取COS URL
                    const cosUrl = this.cosService.getImageUrl(cosKey);
                    newImagePaths.push(cosUrl);

                    this.logger.log(`✅ Uploaded: ${cosKey} -> ${cosUrl}`);
                }

                // 更新数据库中的路径
                if (newImagePaths.length > 0) {
                    await this.db.updateStylePreset(preset.id, {
                        imagePaths: newImagePaths,
                        thumbnailPath: newImagePaths[0] // 更新缩略图为第一张
                    });

                    this.logger.log(`✅ Migrated preset: ${preset.name} (${newImagePaths.length} images)`);
                    migratedCount++;
                }

            } catch (error) {
                this.logger.error(`Failed to migrate ${preset.name} (${preset.id}):`, error.message);
                errors.push({
                    id: preset.id,
                    name: preset.name,
                    error: error.message
                });
            }
        }

        const result: MigrationResult = {
            success: errors.length === 0,
            migratedCount,
            failedCount: errors.length,
            errors
        };

        this.logger.log(`Migration completed: ${migratedCount} succeeded, ${errors.length} failed`);
        return result;
    }
}
