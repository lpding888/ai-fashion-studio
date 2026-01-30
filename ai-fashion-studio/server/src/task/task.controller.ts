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
import {
  AnyFilesInterceptor,
  FilesInterceptor,
} from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { TaskService } from './task.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as crypto from 'crypto';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { TaskModel, UserModel } from '../db/models';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { z } from 'zod';
import { TaskAccessService } from './task-access.service';
import {
  MAX_DIRECT_SHOTS,
  MAX_TOTAL_IMAGES,
  DIRECT_LAYOUT_MODES_ARRAY,
} from './task.constants';
import {
  ApproveTaskBodySchema,
  ClaimTaskBodySchema,
  CreateDirectTaskBodySchema,
  CreateDirectUrlsTaskBodySchema,
  DirectMessageBodySchema,
  DirectRegenerateBodySchema,
  EditShotBodySchema,
  GetTasksQuerySchema,
  TaskApproveResponseSchema,
  TaskCreateResponseSchema,
  TaskDeleteResponseSchema,
  TaskListResponseSchema,
  TaskModelSchema,
  TaskRetryResponseSchema,
  TaskUpdateShotPromptResponseSchema,
  EditShotResponseSchema,
  ToggleFavoriteBodySchema,
} from '../contracts/api.schemas';
import { assertResponse } from '../common/response-contract';
import { normalizeTaskResponse } from './task-response';

const CreateTaskSwaggerSchema = {
  type: 'object',
  properties: {
    files: {
      type: 'array',
      items: { type: 'string', format: 'binary' },
      description: '衣服参考图文件（multipart/form-data）',
    },
    face_refs: {
      type: 'array',
      items: { type: 'string', format: 'binary' },
      description: '人脸参考图文件（可选）',
    },
    style_refs: {
      type: 'array',
      items: { type: 'string', format: 'binary' },
      description: '风格参考图文件（可选）',
    },
    file_urls: {
      type: 'array',
      items: { type: 'string' },
      description: '衣服参考图 URL（可选）',
    },
    face_ref_urls: {
      type: 'array',
      items: { type: 'string' },
      description: '人脸参考图 URL（可选）',
    },
    style_ref_urls: {
      type: 'array',
      items: { type: 'string' },
      description: '风格参考图 URL（可选）',
    },
    requirements: { type: 'string', description: '任务需求描述' },
    shot_count: { type: 'number', minimum: 1 },
    shotCount: { type: 'number', minimum: 1 },
    layout_mode: { type: 'string', enum: DIRECT_LAYOUT_MODES_ARRAY },
    layoutMode: { type: 'string', enum: DIRECT_LAYOUT_MODES_ARRAY },
    scene: { type: 'string', description: '场景（Auto/Direct 等）' },
    resolution: { type: 'string', enum: ['1K', '2K', '4K'] },
    autoApprove: { type: 'boolean' },
    workflow: { type: 'string', enum: ['legacy', 'hero_storyboard'] },
    autoApproveHero: { type: 'boolean' },
    location: { type: 'string' },
    style_direction: { type: 'string' },
    garment_focus: {
      type: 'string',
      enum: ['top', 'bottom', 'footwear', 'accessories', 'full_outfit'],
    },
    aspect_ratio: {
      type: 'string',
      enum: ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9'],
    },
    aspectRatio: {
      type: 'string',
      enum: ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9'],
    },
    face_preset_ids: {
      type: 'string',
      description: '人脸预设 ID（逗号分隔）',
    },
    style_preset_ids: {
      type: 'string',
      description: '风格预设 ID（逗号分隔）',
    },
  },
};

const CreateDirectTaskSwaggerSchema = {
  type: 'object',
  properties: {
    garment_images: {
      type: 'array',
      items: { type: 'string', format: 'binary' },
      description: '衣服图片（最多 6 张）',
    },
    prompt: { type: 'string' },
    resolution: { type: 'string', enum: ['1K', '2K', '4K'] },
    aspect_ratio: {
      type: 'string',
      enum: ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9'],
    },
    aspectRatio: {
      type: 'string',
      enum: ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9'],
    },
    style_preset_ids: {
      type: 'string',
      description: '风格预设 ID（逗号分隔，最多 1 个）',
    },
    pose_preset_ids: {
      type: 'string',
      description: '姿势预设 ID（逗号分隔，最多 4 个）',
    },
    face_preset_ids: {
      type: 'string',
      description: '人脸预设 ID（逗号分隔，最多 3 个）',
    },
    layout_mode: { type: 'string', enum: DIRECT_LAYOUT_MODES_ARRAY },
    layoutMode: { type: 'string', enum: DIRECT_LAYOUT_MODES_ARRAY },
    shot_count: {
      type: 'number',
      minimum: 1,
      maximum: MAX_DIRECT_SHOTS,
    },
    shotCount: {
      type: 'number',
      minimum: 1,
      maximum: MAX_DIRECT_SHOTS,
    },
    includeThoughts: { type: 'boolean' },
    seed: { type: 'number' },
    temperature: { type: 'number', minimum: 0, maximum: 2 },
  },
  required: ['prompt'],
};

const CreateDirectUrlsTaskSwaggerSchema = {
  type: 'object',
  properties: {
    garmentUrls: {
      type: 'array',
      items: { type: 'string' },
      description: '衣服图片 URL（至少 1 张）',
    },
    prompt: { type: 'string' },
    resolution: { type: 'string', enum: ['1K', '2K', '4K'] },
    aspect_ratio: {
      type: 'string',
      enum: ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9'],
    },
    aspectRatio: {
      type: 'string',
      enum: ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9'],
    },
    stylePresetIds: {
      type: 'array',
      items: { type: 'string' },
      description: '风格预设 ID（最多 1 个）',
    },
    posePresetIds: {
      type: 'array',
      items: { type: 'string' },
      description: '姿势预设 ID（最多 4 个）',
    },
    facePresetIds: {
      type: 'array',
      items: { type: 'string' },
      description: '人脸预设 ID（最多 3 个）',
    },
    layout_mode: { type: 'string', enum: DIRECT_LAYOUT_MODES_ARRAY },
    layoutMode: { type: 'string', enum: DIRECT_LAYOUT_MODES_ARRAY },
    shot_count: {
      type: 'number',
      minimum: 1,
      maximum: MAX_DIRECT_SHOTS,
    },
    shotCount: {
      type: 'number',
      minimum: 1,
      maximum: MAX_DIRECT_SHOTS,
    },
    includeThoughts: { type: 'boolean' },
    seed: { type: 'number' },
    temperature: { type: 'number', minimum: 0, maximum: 2 },
  },
  required: ['prompt', 'garmentUrls'],
};

const EditShotSwaggerSchema = {
  type: 'object',
  properties: {
    maskImage: { type: 'string', description: 'base64 mask' },
    referenceImage: { type: 'string', description: '单张参考图 base64' },
    referenceImages: {
      type: 'array',
      items: { type: 'string' },
      description: '多张参考图 base64',
    },
    prompt: { type: 'string' },
    editMode: { type: 'string' },
  },
  required: ['maskImage', 'prompt'],
};


@ApiTags('Tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TaskController {
  private readonly logger = new Logger(TaskController.name);

  constructor(
    private readonly taskService: TaskService,
    private readonly taskAccess: TaskAccessService,
  ) {}

  @Post()
  @Public()
  @ApiOperation({
    summary: '创建任务（Legacy/Storyboard，支持文件或 URL，公开）',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: CreateTaskSwaggerSchema,
    description: '同时支持 multipart/form-data 与 JSON（file_urls 等字段）',
  })
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
    @Body() body: unknown,
    @Req() req: Request,
    @CurrentUser() user?: UserModel,
  ) {
    const payload = this.toRecord(body);
    // Separate files by fieldname (handle undefined uploadedFiles for JSON requests)
    const safeFiles = uploadedFiles || [];
    const files = safeFiles.filter((f) => f.fieldname === 'files');
    const faceRefs = safeFiles.filter((f) => f.fieldname === 'face_refs');
    const styleRefs = safeFiles.filter((f) => f.fieldname === 'style_refs'); // 新增
    const fileUrls = this.normalizeStringArray(payload.file_urls);
    const faceRefUrls = this.normalizeStringArray(payload.face_ref_urls);
    const styleRefUrls = this.normalizeStringArray(payload.style_ref_urls);

    if (files.length === 0 && fileUrls.length === 0) {
      this.logger.warn('CreateTask rejected: missing reference images', {
        contentType: req.headers['content-type'],
        userId: user?.id,
        hasFiles: !!files?.length,
        fileUrlsType: typeof payload.file_urls,
        fileUrlsLength: fileUrls.length || undefined,
        bodyKeys: Object.keys(payload),
      });
      throw new BadRequestException(
        'At least one reference image is required (files or file_urls).',
      );
    }

    // Validate total image count (including style refs)
    const urlCount = fileUrls.length + faceRefUrls.length + styleRefUrls.length;
    const fileCount = files.length + faceRefs.length + styleRefs.length;
    const totalImages = fileCount + urlCount;

    if (totalImages > MAX_TOTAL_IMAGES) {
      this.logger.warn('CreateTask rejected: too many images', {
        contentType: req.headers['content-type'],
        userId: user?.id,
        fileCount,
        urlCount,
        totalImages,
        bodyKeys: Object.keys(payload),
      });
      throw new BadRequestException(
        `Total image count (${totalImages}) exceeds maximum allowed (${MAX_TOTAL_IMAGES}).`,
      );
    }

    const rawShotCount = payload.shot_count ?? payload.shotCount;
    const shotCount = this.toOptionalNumber(rawShotCount) ?? 4;
    const layoutMode =
      this.toOptionalString(payload.layout_mode) ??
      this.toOptionalString(payload.layoutMode) ??
      'Individual';
    const scene = this.toOptionalString(payload.scene) ?? 'Auto';
    const resolution =
      this.toEnumValue(payload.resolution, ['1K', '2K', '4K'] as const) ?? '2K';
    const autoApprove = this.toOptionalBoolean(payload.autoApprove) ?? false;
    const workflow =
      this.toOptionalString(payload.workflow) === 'hero_storyboard'
        ? 'hero_storyboard'
        : 'legacy';
    const autoApproveHero =
      this.toOptionalBoolean(payload.autoApproveHero) ?? false;
    const location = this.toOptionalString(payload.location);
    const styleDirection = this.toOptionalString(payload.style_direction);
    const garmentFocus = this.toEnumValue(payload.garment_focus, [
      'top',
      'bottom',
      'footwear',
      'accessories',
      'full_outfit',
    ] as const);
    const aspectRatio = this.toEnumValue(
      payload.aspect_ratio ?? payload.aspectRatio,
      ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9'] as const,
    );
    const facePresetIds = this.toOptionalString(payload.face_preset_ids);
    const stylePresetIds = this.toOptionalString(payload.style_preset_ids);
    const requirements = this.toOptionalString(payload.requirements) ?? '';

    // Build DTO
    const dto: CreateTaskDto = {
      files,
      face_refs: faceRefs.length > 0 ? faceRefs : undefined,
      style_refs: styleRefs.length > 0 ? styleRefs : undefined,

      // Map URL fields
      file_urls: fileUrls.length > 0 ? fileUrls : undefined,
      face_ref_urls: faceRefUrls.length > 0 ? faceRefUrls : undefined,
      style_ref_urls: styleRefUrls.length > 0 ? styleRefUrls : undefined,

      requirements,
      shot_count: shotCount,
      layout_mode: layoutMode,
      scene,
      resolution,
      autoApprove,
      workflow,
      autoApproveHero,
      location, // 拍摄地址
      styleDirection, // 风格描述
      garmentFocus, // 焦点单品（新增）
      aspectRatio, // 画面比例（新增）
      facePresetIds, // 预设ID
      stylePresetIds, // 风格预设ID
      userId: user?.id,
    };

    try {
      const { task, claimToken } = await this.taskService.createTask(dto);
      const safeTask = this.sanitizeTask(task);
      const response = claimToken ? { ...safeTask, claimToken } : safeTask;
      return assertResponse(
        TaskCreateResponseSchema,
        response,
        'TaskController.create',
      );
    } catch (e) {
      const errorMessage = this.resolveErrorMessage(e, '创建任务失败');
      this.logger.warn('CreateTask failed', {
        message: errorMessage,
        contentType: req.headers['content-type'],
        userId: user?.id,
        files: files?.length || 0,
        faceRefs: faceRefs?.length || 0,
        styleRefs: styleRefs?.length || 0,
        fileUrls: fileUrls.length,
        faceRefUrls: faceRefUrls.length,
        styleRefUrls: styleRefUrls.length,
        facePresetIds,
        stylePresetIds,
      });
      throw new BadRequestException(errorMessage);
    }
  }

  /**
   * 直出图：跳过 Brain 规划，直接把用户提示词 + 知识库 prompt blocks + 参考图发给 Painter。
   * - 仅登录用户可用（会写入 Task 以便队列/相册/重绘）
   */
  @Post('direct')
  @ApiOperation({ summary: '直出图（上传文件，需登录）' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: CreateDirectTaskSwaggerSchema })
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
          return cb(
            new BadRequestException('Only image files are allowed'),
            false,
          );
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
      aspectRatio: body.aspectRatio ?? body.aspect_ratio,
      shotCount: body.shot_count ?? body.shotCount,
      layoutMode: body.layout_mode ?? body.layoutMode,
      includeThoughts: body.includeThoughts,
      seed: body.seed,
      temperature: body.temperature,
      stylePresetIds: toIdList(body.style_preset_ids),
      posePresetIds: toIdList(body.pose_preset_ids),
      facePresetIds: toIdList(body.face_preset_ids),
    });

    return assertResponse(
      TaskModelSchema,
      this.sanitizeTask(task),
      'TaskController.createDirect',
    );
  }

  /**
   * 直出图（URL 版）：前端先把衣服图直传 COS，后端仅接收 COS URL 列表。
   * - 仅登录用户可用
   * - 返回 taskId 后后台异步出图（前端轮询 /tasks/:id）
   */
  @Post('direct-urls')
  @ApiOperation({ summary: '直出图（URL，需登录）' })
  @ApiBody({ schema: CreateDirectUrlsTaskSwaggerSchema })
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
      aspectRatio: body.aspectRatio ?? body.aspect_ratio,
      shotCount: body.shotCount ?? body.shot_count,
      layoutMode: body.layoutMode ?? body.layout_mode,
      includeThoughts: body.includeThoughts,
      seed: body.seed,
      temperature: body.temperature,
      stylePresetIds: body.stylePresetIds,
      posePresetIds: body.posePresetIds,
      facePresetIds: body.facePresetIds,
    });

    return assertResponse(
      TaskModelSchema,
      this.sanitizeTask(task),
      'TaskController.createDirectUrls',
    );
  }

  /**
   * Get all tasks (with pagination)
   */
  @Get()
  @ApiOperation({ summary: '获取任务列表（分页）' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'scope', required: false, enum: ['all', 'mine'] })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: [
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
    ],
  })
  @ApiQuery({
    name: 'directOnly',
    required: false,
    description: '可用 directOnly 或 direct_only',
  })
  @ApiQuery({
    name: 'favoriteOnly',
    required: false,
    description: '可用 favoriteOnly 或 favorite_only',
  })
  async findAll(
    @CurrentUser() user: UserModel,
    @Query(new ZodValidationPipe(GetTasksQuerySchema))
    query?: z.infer<typeof GetTasksQuerySchema>,
  ) {
    const pageNum = query?.page ?? 1;
    const limitNum = query?.limit ?? 20;
    const scope = query?.scope;
    const directOnly = query?.directOnly ?? query?.direct_only;
    const favoriteOnly = query?.favoriteOnly ?? query?.favorite_only;
    const result = await this.taskService.getAllTasks(
      user,
      pageNum,
      limitNum,
      scope,
      {
        userId: query?.userId,
        q: query?.q,
        status: query?.status,
        directOnly,
        favoriteOnly,
      },
    );
    const response = {
      ...result,
      tasks: result.tasks.map((t) => this.sanitizeTask(t)),
    };
    return assertResponse(
      TaskListResponseSchema,
      response,
      'TaskController.findAll',
    );
  }

  @Get(':id')
  @ApiOperation({ summary: '获取任务详情' })
  @ApiParam({ name: 'id', type: String })
  async findOne(@CurrentUser() user: UserModel, @Param('id') id: string) {
    const task = await this.taskAccess.requireReadableTask(id, user);
    return assertResponse(
      TaskModelSchema,
      this.sanitizeTask(task),
      'TaskController.findOne',
    );
  }

  @Post(':id/approve')
  @ApiOperation({ summary: '确认并开始渲染（Legacy）' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        editedPrompts: {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
      },
    },
  })
  async approveTask(
    @CurrentUser() user: UserModel,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ApproveTaskBodySchema))
    body: z.infer<typeof ApproveTaskBodySchema>,
  ) {
    await this.taskAccess.requireWritableTask(id, user);
    const result = await this.taskService.approveAndRender(
      id,
      body.editedPrompts,
    );
    return assertResponse(
      TaskApproveResponseSchema,
      result,
      'TaskController.approveTask',
    );
  }

  @Post(':id/claim')
  @ApiOperation({ summary: '认领任务（claimToken）' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { claimToken: { type: 'string' } },
      required: ['claimToken'],
    },
  })
  async claimTask(
    @CurrentUser() user: UserModel,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ClaimTaskBodySchema))
    body: z.infer<typeof ClaimTaskBodySchema>,
  ) {
    const task = await this.taskService.claimTask(id, user, body.claimToken);
    return assertResponse(
      TaskModelSchema,
      this.sanitizeTask(task),
      'TaskController.claimTask',
    );
  }

  @Post(':id/start')
  @ApiOperation({ summary: '开始任务（Legacy）' })
  @ApiParam({ name: 'id', type: String })
  async startTask(@CurrentUser() user: UserModel, @Param('id') id: string) {
    await this.taskAccess.requireWritableTask(id, user);
    const task = await this.taskService.startTask(id, user);
    return assertResponse(
      TaskModelSchema,
      this.sanitizeTask(task),
      'TaskController.startTask',
    );
  }

  /**
   * Update prompt for a specific shot
   */
  @Patch(':id/shots/:shotId/prompt')
  @ApiOperation({ summary: '更新分镜提示词' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'shotId', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { prompt: { type: 'string' } },
      required: ['prompt'],
    },
  })
  async updateShotPrompt(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
    @Param('shotId') shotId: string,
    @Body() body: { prompt: string },
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    const result = await this.taskService.updateShotPrompt(
      taskId,
      shotId,
      body.prompt,
    );
    return assertResponse(
      TaskUpdateShotPromptResponseSchema,
      result,
      'TaskController.updateShotPrompt',
    );
  }

  /**
   * Edit a specific shot with mask-based editing
   */
  @Post(':id/shots/:shotId/edit')
  @ApiOperation({ summary: '编辑分镜（遮罩编辑）' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'shotId', type: String })
  @ApiBody({ schema: EditShotSwaggerSchema })
  async editShot(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
    @Param('shotId') shotId: string,
    @Body(new ZodValidationPipe(EditShotBodySchema))
    body: z.infer<typeof EditShotBodySchema>,
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    const result = await this.taskService.editShot(taskId, shotId, body);
    return assertResponse(
      EditShotResponseSchema,
      result,
      'TaskController.editShot',
    );
  }

  /**
   * 直出图：重绘（追加版本相册）
   */
  @Post(':id/direct-regenerate')
  @ApiOperation({ summary: '直出图重绘（不支持修改 prompt）' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { prompt: { type: 'string' } },
    },
  })
  async directRegenerate(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
    @Body(new ZodValidationPipe(DirectRegenerateBodySchema))
    body: z.infer<typeof DirectRegenerateBodySchema>,
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    if (body.prompt && String(body.prompt).trim()) {
      throw new BadRequestException(
        '直出图“重绘”不支持修改提示词；请使用 /tasks/:id/direct-message 走对话流程',
      );
    }
    const task = await this.taskService.regenerateDirectTask(taskId, user);
    return assertResponse(
      TaskModelSchema,
      this.sanitizeTask(task),
      'TaskController.directRegenerate',
    );
  }

  /**
   * 直出图：对话追加（在同一任务上追加指令进行迭代生成）
   */
  @Post(':id/direct-message')
  @ApiOperation({ summary: '直出图对话追加' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
  })
  async directMessage(
    @CurrentUser() user: UserModel,
    @Param('id') taskId: string,
    @Body(new ZodValidationPipe(DirectMessageBodySchema))
    body: z.infer<typeof DirectMessageBodySchema>,
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    const task = await this.taskService.directMessage(
      taskId,
      user,
      body.message,
    );
    return assertResponse(
      TaskModelSchema,
      this.sanitizeTask(task),
      'TaskController.directMessage',
    );
  }

  /**
   * Retry failed shots
   * If shotId is provided via query, only retry that shot
   */
  @Post(':id/retry')
  @ApiOperation({ summary: '重试失败分镜（可选 shotId）' })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({ name: 'shotId', required: false, type: String })
  async retryFailedShots(
    @CurrentUser() user: UserModel,
    @Param('id') id: string,
    @Query('shotId') shotId?: string,
  ) {
    await this.taskAccess.requireWritableTask(id, user);
    const result = await this.taskService.retryFailedShots(id, shotId);
    return assertResponse(
      TaskRetryResponseSchema,
      this.isTaskModel(result) ? this.sanitizeTask(result) : result,
      'TaskController.retryFailedShots',
    );
  }

  /**
   * Retry Brain planning (legacy)
   */
  @Post(':id/retry-brain')
  @ApiOperation({ summary: '重试 Brain 规划（Legacy）' })
  @ApiParam({ name: 'id', type: String })
  async retryBrain(@CurrentUser() user: UserModel, @Param('id') id: string) {
    await this.taskAccess.requireWritableTask(id, user);
    const task = await this.taskService.retryBrain(id);
    return assertResponse(
      TaskModelSchema,
      this.sanitizeTask(task),
      'TaskController.retryBrain',
    );
  }

  /**
   * Retry Painter rendering (legacy)
   */
  @Post(':id/retry-render')
  @ApiOperation({ summary: '重试 Painter 渲染（Legacy）' })
  @ApiParam({ name: 'id', type: String })
  async retryRender(@CurrentUser() user: UserModel, @Param('id') id: string) {
    await this.taskAccess.requireWritableTask(id, user);
    const task = await this.taskService.retryRender(id);
    const response = this.isTaskModel(task) ? this.sanitizeTask(task) : task;
    return assertResponse(
      TaskRetryResponseSchema,
      response,
      'TaskController.retryRender',
    );
  }

  /**
   * Delete a task and all associated files
   */
  @Delete(':id')
  @ApiOperation({ summary: '删除任务' })
  @ApiParam({ name: 'id', type: String })
  async deleteTask(@CurrentUser() user: UserModel, @Param('id') id: string) {
    await this.taskAccess.requireWritableTask(id, user);
    const result = await this.taskService.deleteTask(id);
    return assertResponse(
      TaskDeleteResponseSchema,
      result,
      'TaskController.deleteTask',
    );
  }

  @Patch(':id/favorite')
  @ApiOperation({ summary: '收藏/取消收藏' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { favorite: { type: 'boolean' } },
      required: ['favorite'],
    },
  })
  async toggleFavorite(
    @CurrentUser() user: UserModel,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ToggleFavoriteBodySchema))
    body: z.infer<typeof ToggleFavoriteBodySchema>,
  ) {
    await this.taskAccess.requireWritableTask(id, user);
    const task = await this.taskService.setTaskFavorite(id, body.favorite);
    return assertResponse(
      TaskModelSchema,
      this.sanitizeTask(task),
      'TaskController.toggleFavorite',
    );
  }

  private toRecord(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== 'object') return {};
    return input as Record<string, unknown>;
  }

  private normalizeStringArray(input: unknown): string[] {
    if (Array.isArray(input)) {
      return input
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean);
    }
    if (typeof input === 'string') {
      const trimmed = input.trim();
      return trimmed ? [trimmed] : [];
    }
    return [];
  }

  private toOptionalString(input: unknown): string | undefined {
    if (typeof input !== 'string') return undefined;
    const trimmed = input.trim();
    return trimmed ? trimmed : undefined;
  }

  private toOptionalNumber(input: unknown): number | undefined {
    if (input === undefined || input === null || input === '') return undefined;
    const value = typeof input === 'number' ? input : Number(input);
    return Number.isFinite(value) ? value : undefined;
  }

  private toOptionalBoolean(input: unknown): boolean | undefined {
    if (typeof input === 'boolean') return input;
    if (typeof input !== 'string') return undefined;
    const normalized = input.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes')
      return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no')
      return false;
    return undefined;
  }

  private toEnumValue<T extends string>(
    input: unknown,
    allowed: readonly T[],
  ): T | undefined {
    if (typeof input !== 'string') return undefined;
    return (allowed as readonly string[]).includes(input)
      ? (input as T)
      : undefined;
  }

  private resolveErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === 'string') return err;
    return fallback;
  }

  private isTaskModel(input: unknown): input is TaskModel {
    const record = this.toRecord(input);
    return (
      typeof record.id === 'string' && typeof record.createdAt === 'number'
    );
  }

  private sanitizeTask(
    task: TaskModel | null | undefined,
  ): Omit<TaskModel, 'claimTokenHash'> | null | undefined {
    if (!task) return task;
    const { claimTokenHash, ...rest } = task;
    void claimTokenHash;
    return normalizeTaskResponse(rest as TaskModel) as
      | Omit<TaskModel, 'claimTokenHash'>
      | null
      | undefined;
  }
}
