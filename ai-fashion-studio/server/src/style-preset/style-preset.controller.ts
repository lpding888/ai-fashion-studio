import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { DbService } from '../db/db.service';
import { StylePreset } from '../db/models';
import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import { diskStorage } from 'multer';

import { BrainService } from '../brain/brain.service';
import { StylePresetMigrationService } from './style-preset-migration.service';
import { CosService } from '../cos/cos.service';
import { BrainRoutingService } from '../brain-routing/brain-routing.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { z } from 'zod';
import {
  StylePresetRelearnBodySchema,
  StylePresetUpdateBodySchema,
} from '../contracts/api.schemas';

const STYLE_PRESETS_DIR = './uploads/style-presets';
const MAX_FILES = 3; // 单个预设最多 3 张图

@ApiTags('StylePresets')
@ApiBearerAuth()
@Controller('style-presets')
export class StylePresetController {
  private logger = new Logger(StylePresetController.name);

  constructor(
    private db: DbService,
    private brainService: BrainService,
    private readonly brainRouting: BrainRoutingService,
    private readonly migrationService: StylePresetMigrationService,
    private readonly cosService: CosService,
  ) {
    // 确保上传目录存在
    fs.ensureDirSync(STYLE_PRESETS_DIR);
  }

  private isEmptyAnalysis(analysis: any): boolean {
    const hasMeaningfulValue = (value: any): boolean => {
      if (value === null || value === undefined) return false;
      if (typeof value === 'string') return value.trim().length > 0;
      if (typeof value === 'number' || typeof value === 'boolean') return true;
      if (Array.isArray(value))
        return value.some((item) => hasMeaningfulValue(item));
      if (typeof value === 'object') {
        return Object.values(value).some((item) => hasMeaningfulValue(item));
      }
      return false;
    };
    return !hasMeaningfulValue(analysis);
  }

  private requireOwnerOrAdmin(preset: StylePreset, user: UserModel, allowSystem = false) {
    if (!preset) throw new BadRequestException('Preset not found');

    // 兼容旧数据：未标记 userId 的预设只允许管理员访问，避免“历史数据全员可见”
    if (!(preset as any).userId) {
      if (allowSystem) return;
      if (!user || user.role !== 'ADMIN') {
        throw new ForbiddenException('需要管理员权限');
      }
      return;
    }

    if (user.role === 'ADMIN') return;
    if ((preset as any).userId !== user.id) {
      throw new ForbiddenException('无权访问该风格预设');
    }
  }

  /**
   * 创建新的风格预设（支持多图上传）
   */
  @Post()
  @ApiOperation({ summary: '创建风格预设' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        images: { type: 'array', items: { type: 'string', format: 'binary' } },
        name: { type: 'string' },
        description: { type: 'string' },
        tags: { type: 'string', description: 'JSON 数组字符串' },
        styleHint: { type: 'string' },
        analysis: { type: 'string', description: 'JSON 字符串' },
      },
      required: ['images', 'name'],
    },
  })
  @UseInterceptors(
    FilesInterceptor('images', MAX_FILES, {
      storage: diskStorage({
        destination: STYLE_PRESETS_DIR,
        filename: (req, file, cb) => {
          const ext = path.extname(file.originalname);
          const filename = `${Date.now()}_${crypto.randomUUID()}${ext}`;
          cb(null, filename);
        },
      }),
      fileFilter: (req, file, cb) => {
        // 只允许图片
        if (!file.mimetype.startsWith('image/')) {
          return cb(
            new BadRequestException('Only image files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async create(
    @CurrentUser() user: UserModel,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('name') name: string,
    @Body('description') description?: string,
    @Body('tags') tagsStr?: string, // JSON 字符串
    @Body('styleHint') styleHint?: string,
    @Body('analysis') analysisStr?: string, // JSON string of the analysis
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one image is required');
    }
    if (files.length > MAX_FILES) {
      // 清理已上传的文件
      for (const file of files) {
        await fs.remove(file.path);
      }
      throw new BadRequestException(
        `Maximum ${MAX_FILES} images allowed per preset`,
      );
    }
    if (!name || name.trim() === '') {
      // 清理已上传的文件
      for (const file of files) {
        await fs.remove(file.path);
      }
      throw new BadRequestException('Preset name is required');
    }

    // 解析 tags（如果提供）
    let tags: string[] | undefined;
    if (tagsStr) {
      try {
        tags = JSON.parse(tagsStr);
        // 验证是否为数组
        if (!Array.isArray(tags)) {
          throw new Error('Tags must be an array');
        }
      } catch (e) {
        this.logger.warn(`Failed to parse tags: ${tagsStr}`, e);
        // 清理已上传的文件
        for (const file of files) {
          await fs.remove(file.path).catch(() => { });
        }
        throw new BadRequestException(
          'Invalid tags format (must be JSON array)',
        );
      }
    }

    // ✅ 直接上传到 COS（如果启用）
    const imagePaths: string[] = [];
    const presetId = crypto.randomUUID();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (this.cosService.isEnabled()) {
        try {
          const ext = path.extname(file.originalname);
          const cosKey = `style-presets/${presetId}_${i}${ext}`;

          // 上传到 COS
          await this.cosService.uploadFile(cosKey, file.path);

          // 获取 COS URL
          const cosUrl = this.cosService.getImageUrl(cosKey);
          imagePaths.push(cosUrl);

          this.logger.log(`✅ Uploaded to COS: ${cosKey} -> ${cosUrl}`);

          // 删除本地临时文件
          await fs.remove(file.path).catch(() => { });
        } catch (error) {
          this.logger.error(
            `Failed to upload to COS: ${file.originalname}`,
            error,
          );
          // 失败时保留本地路径
          imagePaths.push(file.path.replace(/^\./, ''));
        }
      } else {
        // COS 未启用，使用本地路径（规范化）
        imagePaths.push(file.path.replace(/^\./, ''));
      }
    }

    // Parse analysis if provided
    let analysis: any | undefined;
    if (analysisStr) {
      try {
        analysis = JSON.parse(analysisStr);
      } catch (e) {
        this.logger.warn(`Failed to parse analysis: ${analysisStr}`, e);
        // Proceed without analysis or throw error? proceed.
      }
    }

    const preset: StylePreset = {
      id: presetId,
      userId: user?.id,
      kind: 'STYLE',
      name: name.trim(),
      description: description?.trim(),
      imagePaths,
      thumbnailPath: imagePaths[0], // 封面使用第一张
      tags,
      styleHint: styleHint?.trim(),
      promptBlock: styleHint?.trim() || undefined,
      analysis, // Add analysis to the DB object
      createdAt: Date.now(),
    };

    this.logger.log(
      `Creating style preset: ${preset.name} (${preset.id}) with ${imagePaths.length} image(s)`,
    );

    await this.db.saveStylePreset(preset);
    return preset;
  }

  /**
   * 获取所有风格预设
   */
  @Get()
  @ApiOperation({ summary: '获取风格预设列表' })
  async list(@CurrentUser() user: UserModel) {
    const presets = await this.db.getAllStylePresets();
    const styles = presets.filter((p: any) => p?.kind !== 'POSE');
    if (user.role === 'ADMIN') return styles;
    // 允许查看自己和系统的风格
    return styles.filter((p: any) => !p?.userId || p?.userId === user.id);
  }

  /**
   * 获取单个风格预设
   */
  @Get(':id')
  @ApiOperation({ summary: '获取风格预设详情' })
  @ApiParam({ name: 'id', type: String })
  async getOne(@CurrentUser() user: UserModel, @Param('id') id: string) {
    const preset = await this.db.getStylePreset(id);
    if (!preset) {
      throw new BadRequestException('Preset not found');
    }
    // 只允许访问 STYLE（历史数据未标注 kind 的默认按 STYLE 处理）
    if ((preset as any).kind === 'POSE') {
      throw new BadRequestException('Preset not found');
    }
    this.requireOwnerOrAdmin(preset, user, true); // Allow system presets for viewing
    return preset;
  }

  /**
   * 更新风格预设（仅元数据，不包括图片）
   */
  @Patch(':id')
  @ApiOperation({ summary: '更新风格预设' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        tags: { type: 'string', description: 'JSON 数组字符串' },
        styleHint: { type: 'string' },
      },
    },
  })
  async update(
    @CurrentUser() user: UserModel,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(StylePresetUpdateBodySchema))
    body: z.infer<typeof StylePresetUpdateBodySchema>,
  ) {
    const existing = await this.db.getStylePreset(id);
    if (!existing || (existing as any).kind === 'POSE') {
      throw new BadRequestException('Preset not found');
    }
    this.requireOwnerOrAdmin(existing, user);

    const updates: Partial<StylePreset> = {};

    const name = body?.name;
    const description = body?.description;
    const tagsStr = body?.tags;
    const styleHint = body?.styleHint;

    if (name !== undefined) {
      if (name.trim() === '') {
        throw new BadRequestException('Name cannot be empty');
      }
      updates.name = name.trim();
    }
    if (description !== undefined) {
      updates.description = description.trim();
    }
    if (tagsStr !== undefined) {
      try {
        updates.tags = JSON.parse(tagsStr);
      } catch (e) {
        throw new BadRequestException(
          'Invalid tags format (must be JSON array)',
        );
      }
    }
    if (styleHint !== undefined) {
      updates.styleHint = styleHint.trim();
      updates.promptBlock = updates.styleHint || undefined;
    }

    const preset = await this.db.updateStylePreset(id, updates);
    if (!preset) {
      throw new BadRequestException('Preset not found');
    }

    this.logger.log(`Style preset updated: ${id}`);
    return preset;
  }

  /**
   * 删除风格预设
   */
  @Delete(':id')
  @ApiOperation({ summary: '删除风格预设' })
  @ApiParam({ name: 'id', type: String })
  async delete(@CurrentUser() user: UserModel, @Param('id') id: string) {
    const preset = await this.db.getStylePreset(id);
    if (!preset) {
      throw new BadRequestException('Preset not found');
    }
    if ((preset as any).kind === 'POSE') {
      throw new BadRequestException('Preset not found');
    }
    this.requireOwnerOrAdmin(preset, user);

    // 删除所有关联的图片文件
    for (const imgPath of preset.imagePaths) {
      try {
        if (
          String(imgPath || '').startsWith('http://') ||
          String(imgPath || '').startsWith('https://')
        ) {
          continue;
        }
        if (await fs.pathExists(imgPath)) {
          await fs.remove(imgPath);
          this.logger.log(`✅ Deleted file: ${imgPath}`);
        } else {
          this.logger.warn(`⚠️ File not found (already deleted?): ${imgPath}`);
        }
      } catch (err) {
        this.logger.error(`❌ Failed to delete file: ${imgPath}`, err);
        // 继续删除其他文件，不中断流程
      }
    }

    // 从数据库删除
    await this.db.deleteStylePreset(id);
    this.logger.log(`Style preset deleted: ${id}`);

    return { success: true, id };
  }

  /**
   * AI 风格学习：上传图片，AI 分析并自动入库
   */
  @Post('learn')
  @ApiOperation({ summary: '风格学习（上传图片）' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        images: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
      required: ['images'],
    },
  })
  @UseInterceptors(
    FilesInterceptor('images', 5, {
      // Allow up to 5 images
      storage: diskStorage({
        destination: STYLE_PRESETS_DIR,
        filename: (req, file, cb) => {
          const ext = path.extname(file.originalname);
          const filename = `${Date.now()}_${crypto.randomUUID()}${ext}`; // Persist files immediately
          cb(null, filename);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(
            new BadRequestException('Only image files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async learnStyle(
    @CurrentUser() user: UserModel,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one image is required');
    }

    const presetId = crypto.randomUUID();
    const filePaths: string[] = [];

    // ✅ 直接上传到 COS
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (this.cosService.isEnabled()) {
        try {
          const ext = path.extname(file.originalname);
          const cosKey = `style-presets/${presetId}_learned_${i}${ext}`;

          // 上传到 COS
          await this.cosService.uploadFile(cosKey, file.path);

          // 获取 COS URL
          const cosUrl = this.cosService.getImageUrl(cosKey);
          filePaths.push(cosUrl);

          this.logger.log(`✅ Uploaded learned style image to COS: ${cosKey}`);

          // 删除本地临时文件
          await fs.remove(file.path).catch(() => { });
        } catch (error) {
          this.logger.error(
            `Failed to upload to COS: ${file.originalname}`,
            error,
          );
          // 失败时保留本地路径
          filePaths.push(file.path.replace(/^\./, ''));
        }
      } else {
        // COS 未启用，使用本地路径（规范化）
        filePaths.push(file.path.replace(/^\./, ''));
      }
    }

    try {
      this.logger.log(`🧠 AI Learning Style from ${files.length} images...`);

      // 1. AI Analysis
      const routing = await this.brainRouting.resolveForTask('STYLE_LEARN');
      const analysis = await this.brainService.analyzeStyleImage(
        filePaths,
        routing.primary,
        routing.fallback,
        { traceId: presetId },
      );
      if (this.isEmptyAnalysis(analysis)) {
        const preset: StylePreset = {
          id: presetId,
          userId: user?.id,
          kind: 'STYLE',
          name: '风格学习失败',
          description: '模型返回为空，请点击重新学习',
          imagePaths: filePaths,
          thumbnailPath: filePaths[0],
          tags: ['AI Learned', 'Failed'],
          createdAt: Date.now(),
          learnStatus: 'FAILED',
          learnError: '模型返回为空',
        };
        await this.db.saveStylePreset(preset);
        this.logger.warn(
          `⚠️ Style learning returned empty analysis: ${presetId}`,
        );
        return { success: false, preset, reason: 'EMPTY_ANALYSIS' };
      }

      // 2. Construct Style Hint
      const pickSummary = (v: any) => {
        if (!v) return '';
        if (typeof v === 'string') return v.trim();
        if (typeof v === 'object') {
          const s = String(v.summary || '').trim();
          if (s) return s;
          // best-effort: surface a few important fields for quick scanning
          const key = v.key_light ? JSON.stringify(v.key_light) : '';
          return key ? `key_light=${key}` : '';
        }
        return '';
      };
      const lightingHint = pickSummary(analysis?.lighting);
      const sceneHint = pickSummary(analysis?.scene);
      const gradingHint = pickSummary(
        analysis?.color_grading ?? analysis?.grading,
      );
      const cameraHint = pickSummary(analysis?.camera);
      const styleHint = [
        lightingHint ? `Lighting: ${lightingHint}` : '',
        sceneHint ? `Scene: ${sceneHint}` : '',
        gradingHint ? `Grading: ${gradingHint}` : '',
        cameraHint ? `Camera: ${cameraHint}` : '',
      ]
        .filter(Boolean)
        .join(', ');
      // 直出图阶段只发送文本，不发送风格参考图：用 JSON 作为可复用提示词块（英文 value 更稳定）
      const promptBlock = JSON.stringify(analysis, null, 2);

      // 3. Auto-Save to Database
      const preset: StylePreset = {
        id: presetId,
        userId: user?.id,
        kind: 'STYLE',
        name:
          analysis.name ||
          `Auto-Learned Style ${new Date().toLocaleDateString()}`,
        description: analysis.description || undefined,
        imagePaths: filePaths, // Keep the uploaded files
        thumbnailPath: filePaths[0],
        tags: ['AI Learned'],
        styleHint: styleHint,
        promptBlock,
        analysis: analysis,
        learnStatus: 'SUCCESS',
        createdAt: Date.now(),
      };

      await this.db.saveStylePreset(preset);
      this.logger.log(`✅ Learned & Saved new style: "${preset.name}"`);

      return { success: true, preset };
    } catch (error) {
      // Cleanup on failure
      for (const p of filePaths) {
        const v = String(p || '').trim();
        if (!v) continue;
        if (v.startsWith('http://') || v.startsWith('https://')) continue;
        await fs.remove(v).catch(() => { });
      }
      this.logger.error('Style Learning failed', error);
      throw new BadRequestException(
        'Failed to learn style: ' + (error.message || error),
      );
    }
  }

  /**
   * 风格学习重试：复用已保存的图片（imagePaths），重新调用 AI 分析并覆盖写回 preset。
   * 说明：用于“场景学习不够强/想换更强提示词后重跑”等场景。
   */
  @Post(':id/relearn')
  @ApiOperation({ summary: '风格学习重试' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ schema: { type: 'object' } })
  async relearn(
    @CurrentUser() user: UserModel,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(StylePresetRelearnBodySchema))
    _body: z.infer<typeof StylePresetRelearnBodySchema>,
  ) {
    const existing = await this.db.getStylePreset(id);
    if (!existing || (existing as any).kind === 'POSE') {
      throw new BadRequestException('Preset not found');
    }
    this.requireOwnerOrAdmin(existing, user);

    const filePaths = Array.isArray((existing as any).imagePaths)
      ? (existing as any).imagePaths
      : [];
    if (filePaths.length === 0) {
      throw new BadRequestException('Preset has no images to relearn');
    }

    this.logger.log(
      `🧠 Relearning Style preset ${id} from ${filePaths.length} images...`,
    );

    const routing = await this.brainRouting.resolveForTask('STYLE_LEARN');
    const analysis = await this.brainService.analyzeStyleImage(
      filePaths,
      routing.primary,
      routing.fallback,
      { traceId: `${id}:relearn:${Date.now()}` },
    );
    if (this.isEmptyAnalysis(analysis)) {
      const next = await this.db.updateStylePreset(id, {
        learnStatus: 'FAILED',
        learnError: '模型返回为空',
      });
      if (!next) throw new BadRequestException('Preset not found');
      return { success: false, preset: next, reason: 'EMPTY_ANALYSIS' };
    }

    const pickSummary = (v: any) => {
      if (!v) return '';
      if (typeof v === 'string') return v.trim();
      if (typeof v === 'object') {
        const s = String(v.summary || '').trim();
        if (s) return s;
        const key = v.key_light ? JSON.stringify(v.key_light) : '';
        return key ? `key_light=${key}` : '';
      }
      return '';
    };
    const lightingHint = pickSummary(analysis?.lighting);
    const sceneHint = pickSummary(analysis?.scene);
    const gradingHint = pickSummary(
      analysis?.color_grading ?? analysis?.grading,
    );
    const cameraHint = pickSummary(analysis?.camera);
    const styleHint = [
      lightingHint ? `Lighting: ${lightingHint}` : '',
      sceneHint ? `Scene: ${sceneHint}` : '',
      gradingHint ? `Grading: ${gradingHint}` : '',
      cameraHint ? `Camera: ${cameraHint}` : '',
    ]
      .filter(Boolean)
      .join(', ');

    const promptBlock = JSON.stringify(analysis, null, 2);

    const updates: Partial<StylePreset> = {
      name: analysis?.name
        ? String(analysis.name).trim()
        : (existing as any).name,
      description: analysis?.description
        ? String(analysis.description).trim()
        : (existing as any).description,
      styleHint: styleHint || (existing as any).styleHint,
      promptBlock,
      analysis,
      learnStatus: 'SUCCESS',
      learnError: undefined,
      // 保护：thumbnail 仍沿用原第一张图
      thumbnailPath: (existing as any).thumbnailPath || filePaths[0],
    };

    const next = await this.db.updateStylePreset(id, updates);
    if (!next) throw new BadRequestException('Preset not found');

    this.logger.log(
      `✅ Relearned & Updated style: "${(next as any).name || id}"`,
    );
    return { success: true, preset: next };
  }

  /**
   * 获取迁移状态
   */
  @Get('migration/status')
  @ApiOperation({ summary: '获取迁移状态' })
  async getMigrationStatus() {
    return this.migrationService.getMigrationStatus();
  }

  /**
   * 执行批量迁移到COS
   */
  @Post('migration/execute')
  @ApiOperation({ summary: '执行迁移到 COS' })
  async executeMigration() {
    return this.migrationService.migrateToCoS();
  }
}
