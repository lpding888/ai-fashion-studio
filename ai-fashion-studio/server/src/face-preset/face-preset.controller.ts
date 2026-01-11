
import { Controller, Post, Get, Patch, Delete, Param, Body, UploadedFile, UseInterceptors, BadRequestException, Logger } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DbService } from '../db/db.service';
import { CosService } from '../cos/cos.service';
import { FacePresetMigrationService } from './face-preset-migration.service';
import { FacePreset } from '../db/models';
import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import { memoryStorage } from 'multer';

const FACE_PRESETS_DIR = './uploads/face-presets';

@Controller('face-presets')
export class FacePresetController {
    private logger = new Logger(FacePresetController.name);

    constructor(
        private db: DbService,
        private cosService: CosService,
        private migrationService: FacePresetMigrationService
    ) {
        // Ensure upload directory exists (for fallback)
        fs.ensureDirSync(FACE_PRESETS_DIR);
    }

    /**
     * Create new face preset
     */
    @Post()
    @UseInterceptors(FileInterceptor('image', {
        storage: memoryStorage(),  // 使用内存存储
        limits: { fileSize: 10 * 1024 * 1024 }  // 10MB limit
    }))
    async create(
        @UploadedFile() file: Express.Multer.File,
        @Body() body: {
            name: string;
            gender?: 'female' | 'male' | 'other';
            height?: string;
            weight?: string;
            measurements?: string;
            description?: string;
        }
    ) {
        if (!file) {
            throw new BadRequestException('Image file is required');
        }

        const { name, gender, measurements, description } = body;

        if (!name || name.trim() === '') {
            throw new BadRequestException('Preset name is required');
        }

        // 辅助函数：安全转换数字（空字符串返回 undefined）
        const parseNumber = (value?: string): number | undefined => {
            if (!value || value.trim() === '') return undefined;
            const num = Number(value);
            return isNaN(num) ? undefined : num;
        };

        // 决定存储位置：COS 或 本地
        let imagePath: string;
        const ext = path.extname(file.originalname);
        const imageId = crypto.randomUUID();

        if (this.cosService.isEnabled()) {
            // 上传到 COS
            try {
                const key = `face-presets/${imageId}${ext}`;
                const tempPath = path.join(FACE_PRESETS_DIR, `${imageId}${ext}`);

                // 写入临时文件
                await fs.writeFile(tempPath, file.buffer);

                // 上传到 COS
                await this.cosService.uploadFile(key, tempPath);

                // 获取 COS URL
                imagePath = this.cosService.getImageUrl(key);

                // 删除临时文件
                await fs.remove(tempPath);

                this.logger.log(`✅ Uploaded to COS: ${key} -> ${imagePath}`);
            } catch (error) {
                this.logger.error('COS upload failed, falling back to local storage', error);
                // 降级到本地存储
                const filename = `${Date.now()}_${imageId}${ext}`;
                imagePath = path.join(FACE_PRESETS_DIR, filename);
                await fs.writeFile(imagePath, file.buffer);
            }
        } else {
            // 本地存储（开发环境或 COS 未配置）
            const filename = `${Date.now()}_${imageId}${ext}`;
            imagePath = path.join(FACE_PRESETS_DIR, filename);
            await fs.writeFile(imagePath, file.buffer);
            this.logger.log(`💾 Saved locally: ${imagePath}`);
        }

        const preset: FacePreset = {
            id: imageId,
            name: name.trim(),
            imagePath,
            gender,
            height: parseNumber(body.height),
            weight: parseNumber(body.weight),
            measurements: measurements?.trim() || undefined,
            description: description?.trim() || undefined,
            createdAt: Date.now()
        };

        this.logger.log(`Creating face preset: ${preset.name} (${preset.id})`);

        await this.db.saveFacePreset(preset);
        return preset;
    }

    /**
     * Get all face presets
     */
    @Get()
    async list() {
        return this.db.getAllFacePresets();
    }

    /**
     * Get single face preset
     */
    @Get(':id')
    async getOne(@Param('id') id: string) {
        const preset = await this.db.getFacePreset(id);
        if (!preset) {
            throw new BadRequestException('Preset not found');
        }
        return preset;
    }

    /**
     * Update face preset (rename)
     */
    @Patch(':id')
    async update(
        @Param('id') id: string,
        @Body() body: Partial<{
            name: string;
            gender: 'female' | 'male' | 'other';
            height: string | number;
            weight: string | number;
            measurements: string;
            description: string;
        }>
    ) {
        const updates: Partial<FacePreset> = {};

        // 辅助函数：安全转换数字
        const parseNumber = (value?: string | number): number | undefined => {
            if (value === undefined || value === null) return undefined;
            if (typeof value === 'number') return value;
            if (typeof value === 'string' && value.trim() === '') return undefined;
            const num = Number(value);
            return isNaN(num) ? undefined : num;
        };

        if (body.name !== undefined) {
            const trimmedName = body.name.trim();
            if (trimmedName === '') {
                throw new BadRequestException('Preset name cannot be empty');
            }
            updates.name = trimmedName;
        }
        if (body.gender !== undefined) updates.gender = body.gender;
        if (body.height !== undefined) updates.height = parseNumber(body.height);
        if (body.weight !== undefined) updates.weight = parseNumber(body.weight);
        if (body.measurements !== undefined) updates.measurements = body.measurements.trim() || undefined;
        if (body.description !== undefined) updates.description = body.description.trim() || undefined;

        this.logger.log(`Updating face preset ${id}: ${JSON.stringify(updates)}`);

        const preset = await this.db.updateFacePreset(id, updates);
        if (!preset) {
            throw new BadRequestException('Preset not found');
        }

        this.logger.log(`Face preset updated: ${id}`);
        return preset;
    }

    /**
     * Delete face preset
     */
    @Delete(':id')
    async delete(@Param('id') id: string) {
        const preset = await this.db.getFacePreset(id);
        if (!preset) {
            throw new BadRequestException('Preset not found');
        }

        // Delete file from disk
        if (await fs.pathExists(preset.imagePath)) {
            await fs.remove(preset.imagePath);
            this.logger.log(`Deleted file: ${preset.imagePath}`);
        }

        // Delete from database
        await this.db.deleteFacePreset(id);
        this.logger.log(`Face preset deleted: ${id}`);

        return { success: true, id };
    }

    /**
     * 查看迁移状态
     * GET /face-presets/migration/status
     */
    @Get('migration/status')
    async getMigrationStatus() {
        return this.migrationService.getMigrationStatus();
    }

    /**
     * 执行批量迁移到COS
     * POST /face-presets/migration/execute
     */
    @Post('migration/execute')
    async executeMigration() {
        return this.migrationService.migrateToCoS();
    }
}
