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
import { DbService } from '../db/db.service';
import { StylePreset } from '../db/models';
import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import { diskStorage } from 'multer';

import { BrainService } from '../brain/brain.service';
import { ModelConfigResolverService } from '../model-profile/model-config-resolver.service';
import { StylePresetMigrationService } from './style-preset-migration.service';
import { CosService } from '../cos/cos.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { z } from 'zod';

const STYLE_PRESETS_DIR = './uploads/style-presets';
const MAX_FILES = 3; // 单个预设最多 3 张图

const UpdateStylePresetBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().optional(),
    tags: z.string().trim().optional(), // JSON 字符串
    styleHint: z.string().trim().optional(),
  })
  .strict();

const RelearnBodySchema = z.object({}).strict();

@Controller('style-presets')
export class StylePresetController {
  private logger = new Logger(StylePresetController.name);

  constructor(
    private db: DbService,
    private brainService: BrainService,
    private readonly modelConfigResolver: ModelConfigResolverService,
    private readonly migrationService: StylePresetMigrationService,
    private readonly cosService: CosService,
  ) {
    // 确保上传目录存在
    fs.ensureDirSync(STYLE_PRESETS_DIR);
  }

  private requireOwnerOrAdmin(preset: StylePreset, user: UserModel) {
    if (!preset) throw new BadRequestException('Preset not found');

    // 兼容旧数据：未标记 userId 的预设只允许管理员访问，避免“历史数据全员可见”
    if (!(preset as any).userId) {
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
          this.logger.error(`Failed to upload to COS: ${file.originalname}`, error);
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
  async list(@CurrentUser() user: UserModel) {
    const presets = await this.db.getAllStylePresets();
    const styles = presets.filter((p: any) => (p as any)?.kind !== 'POSE');
    if (user.role === 'ADMIN') return styles;
    // 兼容旧数据：不带 userId 的默认不返回给普通用户
    return styles.filter((p: any) => (p as any)?.userId === user.id);
  }

  /**
   * 获取单个风格预设
   */
  @Get(':id')
  async getOne(@CurrentUser() user: UserModel, @Param('id') id: string) {
    const preset = await this.db.getStylePreset(id);
    if (!preset) {
      throw new BadRequestException('Preset not found');
    }
    // 只允许访问 STYLE（历史数据未标注 kind 的默认按 STYLE 处理）
    if ((preset as any).kind === 'POSE') {
      throw new BadRequestException('Preset not found');
    }
    this.requireOwnerOrAdmin(preset, user);
    return preset;
  }

  /**
   * 更新风格预设（仅元数据，不包括图片）
   */
  @Patch(':id')
  async update(
    @CurrentUser() user: UserModel,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateStylePresetBodySchema))
    body: z.infer<typeof UpdateStylePresetBodySchema>,
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
        if (String(imgPath || '').startsWith('http://') || String(imgPath || '').startsWith('https://')) {
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
   * 风格反推 (Style Ingestion)
   * 上传一张图片，返回 AI 分析的 6 维风格参数
   */

  /**
   * AI 风格学习：上传图片，AI 分析并自动入库
   */
  @Post('learn')
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
          this.logger.error(`Failed to upload to COS: ${file.originalname}`, error);
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
      const config =
        await this.modelConfigResolver.resolveBrainRuntimeFromSnapshot();
      const analysis = await this.brainService.analyzeStyleImage(
        filePaths,
        config,
        { traceId: presetId },
      );

      // 2. Construct Style Hint
      const pickSummary = (v: any) => {
        if (!v) return '';
        if (typeof v === 'string') return v.trim();
        if (typeof v === 'object') {
          const s = String((v as any).summary || '').trim();
          if (s) return s;
          // best-effort: surface a few important fields for quick scanning
          const key = (v as any).key_light ? JSON.stringify((v as any).key_light) : '';
          return key ? `key_light=${key}` : '';
        }
        return '';
      };
      const lightingHint = pickSummary(analysis?.lighting);
      const sceneHint = pickSummary(analysis?.scene);
      const gradingHint = pickSummary(analysis?.color_grading ?? analysis?.grading);
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
  async relearn(
    @CurrentUser() user: UserModel,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RelearnBodySchema)) _body: z.infer<typeof RelearnBodySchema>,
  ) {
    const existing = await this.db.getStylePreset(id);
    if (!existing || (existing as any).kind === 'POSE') {
      throw new BadRequestException('Preset not found');
    }
    this.requireOwnerOrAdmin(existing, user);

    const filePaths = Array.isArray((existing as any).imagePaths) ? (existing as any).imagePaths : [];
    if (filePaths.length === 0) {
      throw new BadRequestException('Preset has no images to relearn');
    }

    this.logger.log(`🧠 Relearning Style preset ${id} from ${filePaths.length} images...`);

    const config = await this.modelConfigResolver.resolveBrainRuntimeFromSnapshot();
    const analysis = await this.brainService.analyzeStyleImage(
      filePaths,
      config,
      { traceId: `${id}:relearn:${Date.now()}` },
    );

    const pickSummary = (v: any) => {
      if (!v) return '';
      if (typeof v === 'string') return v.trim();
      if (typeof v === 'object') {
        const s = String((v as any).summary || '').trim();
        if (s) return s;
        const key = (v as any).key_light ? JSON.stringify((v as any).key_light) : '';
        return key ? `key_light=${key}` : '';
      }
      return '';
    };
    const lightingHint = pickSummary(analysis?.lighting);
    const sceneHint = pickSummary(analysis?.scene);
    const gradingHint = pickSummary(analysis?.color_grading ?? analysis?.grading);
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
      name: analysis?.name ? String(analysis.name).trim() : (existing as any).name,
      description: analysis?.description ? String(analysis.description).trim() : (existing as any).description,
      styleHint: styleHint || (existing as any).styleHint,
      promptBlock,
      analysis,
      // 保护：thumbnail 仍沿用原第一张图
      thumbnailPath: (existing as any).thumbnailPath || filePaths[0],
    };

    const next = await this.db.updateStylePreset(id, updates);
    if (!next) throw new BadRequestException('Preset not found');

    this.logger.log(`✅ Relearned & Updated style: "${(next as any).name || id}"`);
    return { success: true, preset: next };
  }

  /**
   * 获取迁移状态
   */
  @Get('migration/status')
  async getMigrationStatus() {
    return this.migrationService.getMigrationStatus();
  }

  /**
   * 执行批量迁移到COS
   */
  @Post('migration/execute')
  async executeMigration() {
    return this.migrationService.migrateToCoS();
  }
}
