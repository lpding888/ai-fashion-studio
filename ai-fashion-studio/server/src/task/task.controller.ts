import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFiles,
  Body,
  Get,
  Param,
  BadRequestException,
  Query,
  Patch,
  Delete,
  Logger,
  Req,
} from '@nestjs/common';
import { AnyFilesInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { TaskService } from './task.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as crypto from 'crypto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { UserModel } from '../db/models';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { z } from 'zod';
import { TaskAccessService } from './task-access.service';

const MAX_TOTAL_IMAGES = 14;

const ClaimTaskBodySchema = z.object({
  claimToken: z.string().trim().min(1, 'claimToken 不能为空'),
});

const GetTasksQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    // ADMIN only: all | mine；非管理员忽略该字段
    scope: z.enum(['all', 'mine']).optional(),
    // ADMIN only: filter tasks by owner userId
    userId: z.string().uuid().optional(),
    // Optional search keyword (id/requirements). ADMIN-only semantics are handled in service.
    q: z.string().trim().max(200).optional(),
    // Optional status filter. (Keep explicit enum to avoid typos silently failing.)
    status: z.enum([
      'DRAFT',
      'PENDING',
      'QUEUED',
      'PLANNING',
      'AWAITING_APPROVAL',
      'RENDERING',
      'COMPLETED',
      'FAILED',
      'HERO_RENDERING',
      'AWAITING_HERO_APPROVAL',
      'STORYBOARD_PLANNING',
      'STORYBOARD_READY',
      'SHOTS_RENDERING',
    ]).optional(),
  })
  .passthrough();

const EditShotBodySchema = z
  .object({
    maskImage: z.string().trim().min(1, 'maskImage 不能为空'),
    referenceImage: z.string().trim().min(1).optional(),
    referenceImages: z.array(z.string().trim().min(1)).max(12).optional(),
    prompt: z.string().trim().min(1, 'prompt 不能为空'),
    editMode: z.string().trim().min(1).optional(),
  })
  .strict();

const CreateDirectTaskBodySchema = z
  .object({
    prompt: z.string().trim().min(1, 'prompt 不能为空'),
    resolution: z.enum(['1K', '2K', '4K']).optional(),
    aspectRatio: z.enum(['1:1', '4:3', '3:4', '16:9', '9:16', '21:9']).optional(),
    style_preset_ids: z.string().trim().optional(), // comma-separated
    pose_preset_ids: z.string().trim().optional(), // comma-separated
    face_preset_ids: z.string().trim().optional(), // comma-separated
    includeThoughts: z
      .preprocess((v) => {
        if (v === undefined || v === null || v === '') return undefined;
        if (typeof v === 'boolean') return v;
        const s = String(v).trim().toLowerCase();
        if (s === 'true' || s === '1' || s === 'yes') return true;
        if (s === 'false' || s === '0' || s === 'no') return false;
        return undefined;
      }, z.boolean().optional()),
    seed: z.preprocess((v) => {
      if (v === undefined || v === null || v === '') return undefined;
      return Number(v);
    }, z.number().int().optional()),
    temperature: z.preprocess((v) => {
      if (v === undefined || v === null || v === '') return undefined;
      return Number(v);
    }, z.number().min(0).max(2).optional()),
  })
  .strict();

const CreateDirectUrlsTaskBodySchema = z
  .object({
    prompt: z.string().trim().min(1, 'prompt 不能为空'),
    garmentUrls: z.array(z.string().trim().min(1)).min(1, '至少需要 1 张衣服图片').max(14),
    resolution: z.enum(['1K', '2K', '4K']).optional(),
    aspectRatio: z.enum(['1:1', '4:3', '3:4', '16:9', '9:16', '21:9']).optional(),
    stylePresetIds: z.array(z.string().trim().min(1)).max(1).optional(),
    posePresetIds: z.array(z.string().trim().min(1)).max(4).optional(),
    facePresetIds: z.array(z.string().trim().min(1)).max(3).optional(),
    includeThoughts: z
      .preprocess((v) => {
        if (v === undefined || v === null || v === '') return undefined;
        if (typeof v === 'boolean') return v;
        const s = String(v).trim().toLowerCase();
        if (s === 'true' || s === '1' || s === 'yes') return true;
        if (s === 'false' || s === '0' || s === 'no') return false;
        return undefined;
      }, z.boolean().optional()),
    seed: z.preprocess((v) => {
      if (v === undefined || v === null || v === '') return undefined;
      return Number(v);
    }, z.number().int().optional()),
    temperature: z.preprocess((v) => {
      if (v === undefined || v === null || v === '') return undefined;
      return Number(v);
    }, z.number().min(0).max(2).optional()),
  })
  .strict();

const DirectRegenerateBodySchema = z
  .object({
    prompt: z.string().trim().min(1).optional(),
  })
  .strict();

const DirectMessageBodySchema = z
  .object({
    message: z.string().trim().min(1, 'message 不能为空'),
  })
  .strict();

@Controller('tasks')
export class TaskController {
  private readonly logger = new Logger(TaskController.name);

  constructor(
    private readonly taskService: TaskService,
    private readonly taskAccess: TaskAccessService,
  ) { }

  @Post()
  @Public()
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const randomName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async create(
    @UploadedFiles() uploadedFiles: Array<Express.Multer.File>,
    @Body() body: any,
    @Req() req: any,
    @CurrentUser() user?: UserModel,
  ) {
    // Separate files by fieldname (handle undefined uploadedFiles for JSON requests)
    const safeFiles = uploadedFiles || [];
    const files = safeFiles.filter((f) => f.fieldname === 'files');
    const faceRefs = safeFiles.filter((f) => f.fieldname === 'face_refs');
    const styleRefs = safeFiles.filter((f) => f.fieldname === 'style_refs'); // 新增

    if (
      (!files || files.length === 0) &&
      (!body.file_urls || body.file_urls.length === 0)
    ) {
      this.logger.warn('CreateTask rejected: missing reference images', {
        contentType: req?.headers?.['content-type'],
        userId: user?.id,
        hasFiles: !!files?.length,
        fileUrlsType: typeof body?.file_urls,
        fileUrlsLength: Array.isArray(body?.file_urls) ? body.file_urls.length : undefined,
        bodyKeys: body ? Object.keys(body) : [],
      });
      throw new BadRequestException(
        'At least one reference image is required (files or file_urls).',
      );
    }

    // Validate total image count (including style refs)
    const urlCount =
      (body.file_urls?.length || 0) +
      (body.face_ref_urls?.length || 0) +
      (body.style_ref_urls?.length || 0);
    const fileCount = files.length + faceRefs.length + styleRefs.length;
    const totalImages = fileCount + urlCount;

    if (totalImages > MAX_TOTAL_IMAGES) {
      this.logger.warn('CreateTask rejected: too many images', {
        contentType: req?.headers?.['content-type'],
        userId: user?.id,
        fileCount,
        urlCount,
        totalImages,
        bodyKeys: body ? Object.keys(body) : [],
      });
      throw new BadRequestException(
        `Total image count (${totalImages}) exceeds maximum allowed (${MAX_TOTAL_IMAGES}).`,
      );
    }

    // Build DTO
    const dto: CreateTaskDto = {
      files,
      face_refs: faceRefs.length > 0 ? faceRefs : undefined,
      style_refs: styleRefs.length > 0 ? styleRefs : undefined,

      // Map URL fields
      file_urls: body.file_urls,
      face_ref_urls: body.face_ref_urls,
      style_ref_urls: body.style_ref_urls,

      requirements: body.requirements || '',
      shot_count: parseInt(body.shot_count) || 4,
      layout_mode: body.layout_mode || 'Individual',
      scene: body.scene || 'Auto',
      resolution: body.resolution || '2K',
      autoApprove: body.autoApprove === 'true' || body.autoApprove === true,
      workflow: body.workflow === 'hero_storyboard' ? 'hero_storyboard' : 'legacy',
      autoApproveHero: body.autoApproveHero === 'true' || body.autoApproveHero === true,
      location: body.location, // 拍摄地址
      styleDirection: body.style_direction, // 风格描述
      garmentFocus: body.garment_focus, // 焦点单品（新增）
      aspectRatio: body.aspect_ratio, // 画面比例（新增）
      facePresetIds: body.face_preset_ids, // 预设ID
      stylePresetIds: body.style_preset_ids, // 风格预设ID
      userId: user?.id,
    };

    try {
      const { task, claimToken } = await this.taskService.createTask(dto);
      const safeTask = this.sanitizeTask(task);
      return claimToken ? { ...safeTask, claimToken } : safeTask;
    } catch (e: any) {
      this.logger.warn('CreateTask failed', {
        message: e?.message,
        contentType: req?.headers?.['content-type'],
        userId: user?.id,
        files: files?.length || 0,
        faceRefs: faceRefs?.length || 0,
        styleRefs: styleRefs?.length || 0,
        fileUrls: Array.isArray(body?.file_urls) ? body.file_urls.length : 0,
        faceRefUrls: Array.isArray(body?.face_ref_urls) ? body.face_ref_urls.length : 0,
        styleRefUrls: Array.isArray(body?.style_ref_urls) ? body.style_ref_urls.length : 0,
        facePresetIds: body?.face_preset_ids,
        stylePresetIds: body?.style_preset_ids,
      });
      throw new BadRequestException(e.message || '创建任务失败');
    }
  }

  /**
   * 直出图：跳过 Brain 规划，直接把用户提示词 + 知识库 prompt blocks + 参考图发给 Painter。
   * - 仅登录用户可用（会写入 Task 以便队列/相册/重绘）
   */
  @Post('direct')
  @UseInterceptors(
    FilesInterceptor('garment_images', 6, {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const randomName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new BadRequestException('Only image files are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async createDirect(
    @CurrentUser() user: UserModel,
    @UploadedFiles() garmentFiles: Array<Express.Multer.File>,
    @Body(new ZodValidationPipe(CreateDirectTaskBodySchema))
    body: z.infer<typeof CreateDirectTaskBodySchema>,
  ) {
    if (!user) throw new BadRequestException('需要登录');
    if (!garmentFiles || garmentFiles.length === 0) {
      throw new BadRequestException('至少需要上传 1 张衣服图片');
    }

    const toIdList = (raw?: string) =>
      String(raw || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    const task = await this.taskService.createDirectTask({
      user,
      garmentFiles,
      prompt: body.prompt,
      resolution: body.resolution,
      aspectRatio: body.aspectRatio,
      includeThoughts: body.includeThoughts,
      seed: body.seed,
      temperature: body.temperature,
      stylePresetIds: toIdList(body.style_preset_ids),
      posePresetIds: toIdList(body.pose_preset_ids),
      facePresetIds: toIdList(body.face_preset_ids),
    });

    return this.sanitizeTask(task);
  }

  /**
   * 直出图（URL 版）：前端先把衣服图直传 COS，后端仅接收 COS URL 列表。
   * - 仅登录用户可用
   * - 返回 taskId 后后台异步出图（前端轮询 /tasks/:id）
   */
  @Post('direct-urls')
  async createDirectUrls(
    @CurrentUser() user: UserModel,
    @Body(new ZodValidationPipe(CreateDirectUrlsTaskBodySchema))
    body: z.infer<typeof CreateDirectUrlsTaskBodySchema>,
  ) {
    if (!user) throw new BadRequestException('需要登录');
    if (!body.garmentUrls || body.garmentUrls.length === 0) {
      throw new BadRequestException('至少需要 1 张衣服图片');
    }

    const task = await this.taskService.createDirectTaskFromUrls({
      user,
      garmentUrls: body.garmentUrls,
      prompt: body.prompt,
      resolution: body.resolution,
      aspectRatio: body.aspectRatio,
      includeThoughts: body.includeThoughts,
      seed: body.seed,
      temperature: body.temperature,
      stylePresetIds: body.stylePresetIds,
      posePresetIds: body.posePresetIds,
      facePresetIds: body.facePresetIds,
    });

    return this.sanitizeTask(task);
  }

  /**
   * Get all tasks (with pagination)
   */
  @Get()
  async findAll(
    @CurrentUser() user: UserModel,
    @Query(new ZodValidationPipe(GetTasksQuerySchema))
    query?: z.infer<typeof GetTasksQuerySchema>,
  ) {
    const pageNum = query?.page ?? 1;
    const limitNum = query?.limit ?? 20;
    const scope = query?.scope;
    const result = await this.taskService.getAllTasks(user, pageNum, limitNum, scope, {
      userId: query?.userId,
      q: query?.q,
      status: query?.status,
    });
    return {
      ...result,
      tasks: result.tasks.map((t) => this.sanitizeTask(t)),
    };
  }

  @Get(':id')
  async findOne(@CurrentUser() user: UserModel, @Param('id') id: string) {
    const task = await this.taskAccess.requireReadableTask(id, user);
    return this.sanitizeTask(task);
  }

  @Post(':id/approve')
  async approveTask(
    @CurrentUser() user: UserModel,
    @Param('id') id: string,
    @Body() body: { editedPrompts?: any },
  ) {
    await this.taskAccess.requireWritableTask(id, user);
    return this.taskService.approveAndRender(id, body.editedPrompts);
  }

  @Post(':id/claim')
  async claimTask(
    @CurrentUser() user: UserModel,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ClaimTaskBodySchema)) body: z.infer<typeof ClaimTaskBodySchema>,
  ) {
    const task = await this.taskService.claimTask(id, user, body.claimToken);
    return this.sanitizeTask(task);
  }

  @Post(':id/start')
  async startTask(
    @CurrentUser() user: UserModel,
    @Param('id') id: string,
  ) {
    await this.taskAccess.requireWritableTask(id, user);
    const task = await this.taskService.startTask(id, user);
    return this.sanitizeTask(task);
  }

  /**
   * Update prompt for a specific shot
   */
  @Patch(':id/shots/:shotId/prompt')
  async updateShotPrompt(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
    @Param('shotId') shotId: string,
    @Body() body: { prompt: string },
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    return this.taskService.updateShotPrompt(taskId, shotId, body.prompt);
  }

  /**
   * Edit a specific shot with mask-based editing
   */
  @Post(':id/shots/:shotId/edit')
  async editShot(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
    @Param('shotId') shotId: string,
    @Body(new ZodValidationPipe(EditShotBodySchema)) body: z.infer<typeof EditShotBodySchema>,
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    return this.taskService.editShot(taskId, shotId, body);
  }

  /**
   * 直出图：重绘（追加版本相册）
   */
  @Post(':id/direct-regenerate')
  async directRegenerate(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
    @Body(new ZodValidationPipe(DirectRegenerateBodySchema)) body: z.infer<typeof DirectRegenerateBodySchema>,
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    if (body.prompt && String(body.prompt).trim()) {
      throw new BadRequestException('直出图“重绘”不支持修改提示词；请使用 /tasks/:id/direct-message 走对话流程');
    }
    const task = await this.taskService.regenerateDirectTask(taskId, user);
    return this.sanitizeTask(task);
  }

  /**
   * 直出图：对话追加（在同一任务上追加指令进行迭代生成）
   */
  @Post(':id/direct-message')
  async directMessage(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
    @Body(new ZodValidationPipe(DirectMessageBodySchema)) body: z.infer<typeof DirectMessageBodySchema>,
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    const task = await this.taskService.directMessage(taskId, user, body.message);
    return this.sanitizeTask(task);
  }

  /**
   * Retry failed shots
   * If shotId is provided via query, only retry that shot
   */
  @Post(':id/retry')
  async retryFailedShots(
    @CurrentUser() user: UserModel,
    @Param('id') id: string,
    @Query('shotId') shotId?: string,
  ) {
    await this.taskAccess.requireWritableTask(id, user);
    return this.taskService.retryFailedShots(id, shotId);
  }

  /**
   * Retry Brain planning (legacy)
   */
  @Post(':id/retry-brain')
  async retryBrain(
    @CurrentUser() user: UserModel,
    @Param('id') id: string,
  ) {
    await this.taskAccess.requireWritableTask(id, user);
    const task = await this.taskService.retryBrain(id);
    return this.sanitizeTask(task);
  }

  /**
   * Retry Painter rendering (legacy)
   */
  @Post(':id/retry-render')
  async retryRender(
    @CurrentUser() user: UserModel,
    @Param('id') id: string,
  ) {
    await this.taskAccess.requireWritableTask(id, user);
    const task = await this.taskService.retryRender(id);
    return this.sanitizeTask(task);
  }

  /**
   * Delete a task and all associated files
   */
  @Delete(':id')
  async deleteTask(@CurrentUser() user: UserModel, @Param('id') id: string) {
    await this.taskAccess.requireWritableTask(id, user);
    return this.taskService.deleteTask(id);
  }

  private sanitizeTask(task: any) {
    const { claimTokenHash: _claimTokenHash, ...rest } = task || {};
    return rest;
  }
}
