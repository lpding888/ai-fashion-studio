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
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { TaskService } from './task.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { diskStorage } from 'multer';
import { extname } from 'path';
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

@Controller('tasks')
export class TaskController {
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
          const randomName = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async create(
    @UploadedFiles() uploadedFiles: Array<Express.Multer.File>,
    @Body() body: any,
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
      throw new BadRequestException(e.message || '创建任务失败');
    }
  }

  /**
   * Get all tasks (with pagination)
   */
  @Get()
  async findAll(
    @CurrentUser() user: UserModel,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = parseInt(page || '1');
    const limitNum = parseInt(limit || '20');
    const result = await this.taskService.getAllTasks(user, pageNum, limitNum);
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
    @Body()
    body: {
      maskImage: string; // Base64 encoded mask (white = edit region)
      referenceImage?: string; // Optional reference image
      prompt: string; // Editing instruction
      editMode?: string; // e.g., 'EDIT_MODE_INPAINT'
    },
  ) {
    await this.taskAccess.requireWritableTask(taskId, user);
    return this.taskService.editShot(taskId, shotId, body);
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
