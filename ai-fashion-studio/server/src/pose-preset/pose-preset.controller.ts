import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import { z } from 'zod';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { UserModel } from '../db/models';
import { DbService } from '../db/db.service';
import { BrainService } from '../brain/brain.service';
import { ModelConfigResolverService } from '../model-profile/model-config-resolver.service';
import { CosService } from '../cos/cos.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

const POSE_PRESETS_DIR = './uploads/pose-presets';

const UpdatePosePresetBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().optional(),
  })
  .strict();

const RelearnPoseBodySchema = z.object({}).strict();

@Controller('pose-presets')
export class PosePresetController {
  private readonly logger = new Logger(PosePresetController.name);

  constructor(
    private readonly db: DbService,
    private readonly brain: BrainService,
    private readonly modelConfigResolver: ModelConfigResolverService,
    private readonly cos: CosService,
  ) {
    fs.ensureDirSync(POSE_PRESETS_DIR);
  }

  private requireAdmin(user: UserModel) {
    if (!user || user.role !== 'ADMIN') {
      throw new ForbiddenException('需要管理员权限');
    }
  }

  private requireOwnerOrAdmin(preset: any, user: UserModel) {
    if (!preset) throw new BadRequestException('Preset not found');
    if (user.role === 'ADMIN') return;
    const ownerId = (preset as any).userId;
    if (!ownerId || ownerId !== user.id) {
      throw new ForbiddenException('无权访问该姿势预设');
    }
  }

  private formatPosePromptBlockAsJson(analysis: any): string {
    // 直出图阶段只发送文本，不发送姿势参考图：用 JSON 作为可复用提示词块（英文 value 更稳定）
    return JSON.stringify(analysis || {}, null, 2);
  }

  /**
   * AI 姿势学习：上传 1 张图片，AI 分析并自动入库（知识库卡片）
   */
  @Post('learn')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: POSE_PRESETS_DIR,
        filename: (req, file, cb) => {
          const ext = path.extname(file.originalname);
          cb(null, `${Date.now()}_${crypto.randomUUID()}${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new BadRequestException('Only image files are allowed'), false);
        }
        cb(null, true);
      },
      limits: { files: 1, fileSize: 10 * 1024 * 1024 },
    }),
  )
  async learn(
    @CurrentUser() user: UserModel,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Image file is required');

    const presetId = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    let imageUrlOrPath = file.path.replace(/^\./, '');

    if (this.cos.isEnabled()) {
      try {
        const key = `pose-presets/${presetId}${ext}`;
        await this.cos.uploadFile(key, file.path);
        imageUrlOrPath = this.cos.getImageUrl(key);
        await fs.remove(file.path).catch(() => { });
      } catch (e: any) {
        this.logger.warn(`COS upload failed for pose preset ${presetId}`, e?.message || e);
      }
    }

    const brainRuntime = await this.modelConfigResolver.resolveBrainRuntimeFromSnapshot();
    let analysis: any;
    try {
      analysis = await this.brain.analyzePoseImage(imageUrlOrPath, brainRuntime, { traceId: presetId });
    } catch (error: any) {
      this.logger.error('Pose learning failed', error?.response?.data || error?.message || error);
      throw new BadRequestException(
        'Failed to learn pose: ' + (error?.message || error),
      );
    }

    const name =
      String(analysis?.name || '').trim() ||
      `Auto Pose ${new Date().toLocaleDateString()}`;
    const description = String(analysis?.description || '').trim() || undefined;
    const promptBlock = this.formatPosePromptBlockAsJson(analysis);

    const preset = {
      id: presetId,
      userId: user?.id,
      kind: 'POSE' as const,
      name,
      description,
      imagePaths: [imageUrlOrPath],
      thumbnailPath: imageUrlOrPath,
      tags: ['AI Learned', 'Pose'],
      promptBlock,
      analysis,
      createdAt: Date.now(),
    };

    await this.db.saveStylePreset(preset as any);
    return { success: true, preset };
  }

  @Get()
  async list(@CurrentUser() user: UserModel) {
    const all = await this.db.getAllStylePresets();
    const pose = all.filter((p: any) => (p as any)?.kind === 'POSE');
    if (user.role === 'ADMIN') return pose;
    return pose.filter((p: any) => (p as any)?.userId === user.id);
  }

  @Get(':id')
  async getOne(@CurrentUser() user: UserModel, @Param('id') id: string) {
    const preset = await this.db.getStylePreset(id);
    if (!preset || (preset as any).kind !== 'POSE') {
      throw new BadRequestException('Preset not found');
    }
    this.requireOwnerOrAdmin(preset, user);
    return preset;
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: UserModel,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePosePresetBodySchema))
    body: z.infer<typeof UpdatePosePresetBodySchema>,
  ) {
    const preset = await this.db.getStylePreset(id);
    if (!preset || (preset as any).kind !== 'POSE') {
      throw new BadRequestException('Preset not found');
    }
    this.requireOwnerOrAdmin(preset, user);

    const updates: any = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;

    const updated = await this.db.updateStylePreset(id, updates);
    return updated;
  }

  /**
   * 姿势学习重试：复用已保存图片重新分析并覆盖写回 preset。
   */
  @Post(':id/relearn')
  async relearn(
    @CurrentUser() user: UserModel,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(RelearnPoseBodySchema)) _body: z.infer<typeof RelearnPoseBodySchema>,
  ) {
    const preset = await this.db.getStylePreset(id);
    if (!preset || (preset as any).kind !== 'POSE') {
      throw new BadRequestException('Preset not found');
    }
    this.requireOwnerOrAdmin(preset, user);

    const imagePaths = Array.isArray((preset as any).imagePaths) ? (preset as any).imagePaths : [];
    if (imagePaths.length === 0) {
      throw new BadRequestException('Preset has no images to relearn');
    }

    this.logger.log(`🧠 Relearning Pose preset ${id} from ${imagePaths.length} image(s)...`);

    const brainRuntime = await this.modelConfigResolver.resolveBrainRuntimeFromSnapshot();
    let analysis: any;
    try {
      analysis = await this.brain.analyzePoseImage(
        imagePaths[0],
        brainRuntime,
        { traceId: `${id}:relearn:${Date.now()}` },
      );
    } catch (error: any) {
      this.logger.error('Pose relearn failed', error?.response?.data || error?.message || error);
      throw new BadRequestException(
        'Failed to relearn pose: ' + (error?.message || error),
      );
    }

    const name =
      String(analysis?.name || '').trim()
      || String((preset as any).name || '').trim()
      || `Auto Pose ${new Date().toLocaleDateString()}`;
    const description = String(analysis?.description || '').trim() || (preset as any).description || undefined;
    const promptBlock = this.formatPosePromptBlockAsJson(analysis);

    const updates: any = {
      name,
      description,
      promptBlock,
      analysis,
      thumbnailPath: (preset as any).thumbnailPath || imagePaths[0],
    };

    const next = await this.db.updateStylePreset(id, updates);
    return { success: true, preset: next };
  }

  @Delete(':id')
  async remove(@CurrentUser() user: UserModel, @Param('id') id: string) {
    const preset = await this.db.getStylePreset(id);
    if (!preset || (preset as any).kind !== 'POSE') {
      throw new BadRequestException('Preset not found');
    }
    this.requireOwnerOrAdmin(preset, user);

    // 删除关联图片（仅本地路径；URL 由对象存储生命周期管理）
    for (const img of (preset as any).imagePaths || []) {
      const v = String(img || '').trim();
      if (!v) continue;
      if (v.startsWith('http://') || v.startsWith('https://')) continue;
      if (await fs.pathExists(v)) {
        await fs.remove(v).catch(() => { });
      }
    }

    await this.db.deleteStylePreset(id);
    return { success: true, id };
  }
}
