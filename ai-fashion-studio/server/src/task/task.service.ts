import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ModelConfig } from '../common/model-config';
import { TaskModel, UserModel } from '../db/models';
import { CreateTaskDto } from './dto/create-task.dto';
import { DirectTaskService } from './direct-task.service';
import { LegacyTaskService } from './legacy-task.service';
import { TaskCrudService } from './task-crud.service';

@Injectable()
export class TaskService {
  private logger = new Logger(TaskService.name);

  constructor(
    private readonly crud: TaskCrudService,
    private readonly directService: DirectTaskService,
    private readonly legacyService: LegacyTaskService,
  ) {}

  private isDirectTask(task: TaskModel) {
    const shots = Array.isArray(task.shots)
      ? (task.shots as Array<{ type?: string }>)
      : [];
    return (
      !!task.directPrompt ||
      task.scene === 'Direct' ||
      shots.some((shot) => shot?.type === 'DirectPrompt')
    );
  }

  async createTask(dto: CreateTaskDto, config?: ModelConfig) {
    return this.legacyService.createTask(dto, config);
  }

  async createDirectTask(args: {
    user: UserModel;
    garmentFiles: Array<Express.Multer.File>;
    prompt: string;
    resolution?: TaskModel['resolution'];
    aspectRatio?: TaskModel['aspectRatio'];
    includeThoughts?: boolean;
    seed?: number;
    temperature?: number;
    stylePresetIds?: string[];
    posePresetIds?: string[];
    facePresetIds?: string[];
    shotCount?: number;
    layoutMode?: TaskModel['layout_mode'];
  }): Promise<TaskModel> {
    return this.directService.createDirectTask(args);
  }

  /**
   * 直出图（URL 版）：衣服图片由前端直传 COS；后端仅接收 COS URL 列表。
   * - 注意：总参考图上限仍为 14（衣服+人脸）
   */
  async createDirectTaskFromUrls(args: {
    user: UserModel;
    garmentUrls: string[];
    prompt: string;
    resolution?: TaskModel['resolution'];
    aspectRatio?: TaskModel['aspectRatio'];
    includeThoughts?: boolean;
    seed?: number;
    temperature?: number;
    stylePresetIds?: string[];
    posePresetIds?: string[];
    facePresetIds?: string[];
    shotCount?: number;
    layoutMode?: TaskModel['layout_mode'];
  }): Promise<TaskModel> {
    return this.directService.createDirectTaskFromUrls(args);
  }

  async regenerateDirectTask(
    taskId: string,
    user: UserModel,
  ): Promise<TaskModel> {
    return this.directService.regenerateDirectTask(taskId, user);
  }

  async directMessage(
    taskId: string,
    user: UserModel,
    message: string,
  ): Promise<TaskModel> {
    return this.directService.directMessage(taskId, user, message);
  }

  async getTask(id: string) {
    return this.crud.getTask(id);
  }

  /**
   * Get all tasks with pagination
   */
  async getAllTasks(
    viewer: UserModel,
    page: number = 1,
    limit: number = 20,
    scope?: 'all' | 'mine',
    filters?: { userId?: string; q?: string; status?: string },
  ) {
    return this.crud.getAllTasks(viewer, page, limit, scope, filters);
  }

  async claimTask(taskId: string, user: UserModel, claimToken: string) {
    return this.crud.claimTask(taskId, user, claimToken);
  }

  async startTask(taskId: string, user: UserModel) {
    return this.legacyService.startTask(taskId, user);
  }

  async approveAndRender(
    taskId: string,
    editedPrompts?: Record<string, string>,
  ) {
    return this.legacyService.approveAndRender(taskId, editedPrompts);
  }

  async retryBrain(taskId: string) {
    return this.legacyService.retryBrain(taskId);
  }

  async retryRender(taskId: string) {
    return this.legacyService.retryRender(taskId);
  }

  async updateShotPrompt(taskId: string, shotId: string, newPrompt: string) {
    return this.legacyService.updateShotPrompt(taskId, shotId, newPrompt);
  }

  async editShot(
    taskId: string,
    shotId: string,
    editData: Parameters<LegacyTaskService['editShot']>[2],
  ) {
    return this.legacyService.editShot(taskId, shotId, editData);
  }

  async retryFailedShots(taskId: string, targetShotId?: string) {
    const task = await this.crud.getTask(taskId);
    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    if (this.isDirectTask(task)) {
      this.logger.log(
        `Retry request redirected to direct regenerate for task ${taskId}`,
      );
      return this.directService.retryDirectTask(taskId);
    }

    return this.legacyService.retryFailedShots(taskId, targetShotId);
  }

  /**
   * 删除任务及其相关文件
   */
  async deleteTask(taskId: string): Promise<boolean> {
    return this.crud.deleteTask(taskId);
  }
}
