import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { DbService } from '../db/db.service';
import { CosService } from '../cos/cos.service';
import { FacePresetMigrationService } from './face-preset-migration.service';
import { FacePreset } from '../db/models';
import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { z } from 'zod';
import {
  CreateFacePresetBodySchema,
  UpdateFacePresetBodySchema,
} from '../contracts/api.schemas';

const FACE_PRESETS_DIR = './uploads/face-presets';

@ApiTags('FacePresets')
@ApiBearerAuth()
@Controller('face-presets')
export class FacePresetController {
  private logger = new Logger(FacePresetController.name);

  constructor(
    private db: DbService,
    private cosService: CosService,
    private migrationService: FacePresetMigrationService,
  ) {
    // Ensure upload directory exists (for fallback)
    fs.ensureDirSync(FACE_PRESETS_DIR);
  }

  private requireAdmin(user: UserModel) {
    if (!user || user.role !== 'ADMIN') {
      throw new ForbiddenException('需要管理员权限');
    }
  }

  private requireOwnerOrAdmin(preset: FacePreset, user: UserModel, allowSystem = false) {
    if (!preset) throw new BadRequestException('Preset not found');

    if (!preset.userId) {
      if (allowSystem) return;
      this.requireAdmin(user);
      return;
    }

    if (user.role === 'ADMIN') return;
    if (preset.userId !== user.id) {
      throw new ForbiddenException('无权访问该模特预设');
    }
  }

  /**
   * Create new face preset
   */
  @Post()
  @ApiOperation({ summary: '创建模特预设' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: { type: 'string', format: 'binary' },
        name: { type: 'string' },
        gender: { type: 'string', enum: ['female', 'male', 'other'] },
        height: { type: 'string' },
        weight: { type: 'string' },
        measurements: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['image', 'name'],
    },
  })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(), // 使用内存存储
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    }),
  )
  async create(
    @CurrentUser() user: UserModel,
    @UploadedFile() file: Express.Multer.File,
    @Body(new ZodValidationPipe(CreateFacePresetBodySchema))
    body: z.infer<typeof CreateFacePresetBodySchema>,
  ) {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }

    const { name, gender, measurements, description } = body;

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
        this.logger.error(
          'COS upload failed, falling back to local storage',
          error,
        );
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
      userId: user.id,
      name: name.trim(),
      imagePath,
      gender,
      height: parseNumber(body.height),
      weight: parseNumber(body.weight),
      measurements: measurements?.trim() || undefined,
      description: description?.trim() || undefined,
      createdAt: Date.now(),
    };

    this.logger.log(`Creating face preset: ${preset.name} (${preset.id})`);

    await this.db.saveFacePreset(preset);
    return preset;
  }

  /**
   * Get all face presets
   */
  @Get()
  @ApiOperation({ summary: '获取模特预设列表' })
  async list(@CurrentUser() user: UserModel) {
    const presets = await this.db.getAllFacePresets();
    if (user.role === 'ADMIN') return presets;
    // 允许查看自己和系统的模特
    return presets.filter((p) => !p.userId || p.userId === user.id);
  }

  /**
   * Get single face preset
   */
  @Get(':id')
  @ApiOperation({ summary: '获取模特预设详情' })
  @ApiParam({ name: 'id', type: String })
  async getOne(@CurrentUser() user: UserModel, @Param('id') id: string) {
    const preset = await this.db.getFacePreset(id);
    if (!preset) {
      throw new BadRequestException('Preset not found');
    }
    this.requireOwnerOrAdmin(preset, user, true); // Allow system
    return preset;
  }

  /**
   * Update face preset (rename)
   */
  @Patch(':id')
  @ApiOperation({ summary: '更新模特预设' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        gender: { type: 'string', enum: ['female', 'male', 'other'] },
        height: { type: 'string' },
        weight: { type: 'string' },
        measurements: { type: 'string' },
        description: { type: 'string' },
      },
    },
  })
  async update(
    @CurrentUser() user: UserModel,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateFacePresetBodySchema))
    body: z.infer<typeof UpdateFacePresetBodySchema>,
  ) {
    const existing = await this.db.getFacePreset(id);
    if (!existing) throw new BadRequestException('Preset not found');
    this.requireOwnerOrAdmin(existing, user);

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
    if (body.measurements !== undefined)
      updates.measurements = body.measurements.trim() || undefined;
    if (body.description !== undefined)
      updates.description = body.description.trim() || undefined;

    this.logger.log(`Updating face preset ${id}: ${JSON.stringify(updates)}`);

    const preset = await this.db.updateFacePreset(id, updates);
    if (!preset) throw new BadRequestException('Preset not found');

    this.logger.log(`Face preset updated: ${id}`);
    return preset;
  }

  /**
   * Delete face preset
   */
  @Delete(':id')
  @ApiOperation({ summary: '删除模特预设' })
  @ApiParam({ name: 'id', type: String })
  async delete(@CurrentUser() user: UserModel, @Param('id') id: string) {
    const preset = await this.db.getFacePreset(id);
    if (!preset) {
      throw new BadRequestException('Preset not found');
    }
    this.requireOwnerOrAdmin(preset, user);

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
  @ApiOperation({ summary: '获取迁移状态' })
  async getMigrationStatus(@CurrentUser() user: UserModel) {
    this.requireAdmin(user);
    return this.migrationService.getMigrationStatus();
  }

  /**
   * 执行批量迁移到COS
   * POST /face-presets/migration/execute
   */
  @Post('migration/execute')
  @ApiOperation({ summary: '执行迁移到 COS' })
  async executeMigration(@CurrentUser() user: UserModel) {
    this.requireAdmin(user);
    return this.migrationService.migrateToCoS();
  }
}
