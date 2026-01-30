import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as path from 'path';
import { ModelConfig } from '../common/model-config';
import { DbService } from '../db/db.service';
import { TaskModel, UserModel } from '../db/models';
import { BrainService } from '../brain/brain.service';
import { PainterService } from '../painter/painter.service';
import { ModelConfigResolverService } from '../model-profile/model-config-resolver.service';
import { HeroStoryboardService } from './hero-storyboard.service';
import { TaskBillingService } from './task-billing.service';
import { CosService } from '../cos/cos.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskCommonService } from './task-common.service';
import { TaskRenderingOrchestratorService } from './task-rendering-orchestrator.service';
import { TaskCrudService } from './task-crud.service';
import { isScfResultSuccess, pickScfImageUrl } from './scf-utils';
import { MAX_TOTAL_IMAGES } from './task.constants';

type LegacyShotEditInput = {
  maskImage: string;
  referenceImages?: string[];
  referenceImage?: string;
  prompt: string;
  editMode?: string;
};

@Injectable()
export class LegacyTaskService {
  private logger = new Logger(LegacyTaskService.name);
  private readonly maxConcurrentLegacyPerUser = (() => {
    const raw = String(
      process.env.MAX_CONCURRENT_LEGACY_TASKS_PER_USER || '',
    ).trim();
    if (!raw) return Number.MAX_SAFE_INTEGER;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return Number.MAX_SAFE_INTEGER;
    return n;
  })();

  constructor(
    private readonly db: DbService,
    private readonly brain: BrainService,
    private readonly painter: PainterService,
    private readonly modelConfigResolver: ModelConfigResolverService,
    private readonly common: TaskCommonService,
    private readonly heroStoryboard: HeroStoryboardService,
    private readonly billing: TaskBillingService,
    private readonly prisma: PrismaService,
    private readonly cos: CosService,
    private readonly rendering: TaskRenderingOrchestratorService,
    private readonly crud: TaskCrudService,
  ) {}

  private toRecord(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== 'object') return {};
    return input as Record<string, unknown>;
  }

  private toTaskModel(input: unknown): TaskModel {
    return this.toRecord(input) as unknown as TaskModel;
  }

  private toOptionalString(input: unknown): string | undefined {
    if (typeof input !== 'string') return undefined;
    const trimmed = input.trim();
    return trimmed ? trimmed : undefined;
  }

  private normalizeStringArray(input: unknown): string[] {
    if (Array.isArray(input)) {
      return input
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean);
    }
    const single = this.toOptionalString(input);
    return single ? [single] : [];
  }

  private resolveErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === 'string') return err;
    return fallback;
  }

  private matchPlanShot(
    shot: Record<string, unknown>,
    shotId: string,
  ): boolean {
    const id = this.toOptionalString(shot.id);
    const legacyId = this.toOptionalString(shot.shot_id);
    return id === shotId || legacyId === shotId;
  }

  private getPlanShotPrompt(shot: Record<string, unknown>): string | undefined {
    return (
      this.toOptionalString(shot.prompt_en) ||
      this.toOptionalString(shot.prompt)
    );
  }

  private matchLegacyShot(
    shot: TaskModel['shots'][number],
    shotId: string,
  ): boolean {
    const record = this.toRecord(shot);
    const legacyId = this.toOptionalString(record.shot_id);
    return (
      shot.shotCode === shotId || shot.id === shotId || legacyId === shotId
    );
  }

  private normalizeLayoutMode(input: unknown): TaskModel['layout_mode'] {
    return input === 'Grid' ? 'Grid' : 'Individual';
  }

  private async countActiveLegacyTasksForUser(userId: string): Promise<number> {
    return this.crud.countActiveLegacyTasksForUser(userId);
  }

  private async tryStartQueuedTasksForUser(userId: string): Promise<void> {
    const active = await this.countActiveLegacyTasksForUser(userId);
    const capacity = this.maxConcurrentLegacyPerUser - active;
    if (capacity <= 0) return;

    const queued = await this.prisma.task.findMany({
      where: { userId, status: 'QUEUED' },
      orderBy: { createdAt: 'asc' },
      take: capacity,
    });

    for (const row of queued) {
      const task = this.toTaskModel(row.data);
      const garmentPaths = task.garmentImagePaths || [];
      const faceRefPaths = task.faceRefPaths || [];

      await this.db.updateTask(task.id, {
        status: 'PLANNING',
        error: undefined,
      });

      void this.processBrainAnalysis(
        { ...task, status: 'PLANNING' } as TaskModel,
        garmentPaths,
        faceRefPaths,
      ).catch((err) => {
        const errorMessage = this.resolveErrorMessage(
          err,
          'Brain analysis failed',
        );
        this.logger.error(
          `Brain analysis failed for queued task ${task.id}`,
          err,
        );
        void this.db
          .updateTask(task.id, {
            status: 'FAILED',
            error: errorMessage,
          })
          .finally(() => {
            if (task.userId) {
              void this.tryStartQueuedTasksForUser(task.userId).catch(
                () => undefined,
              );
            }
          });
      });
    }
  }

  async createTask(dto: CreateTaskDto, config?: ModelConfig) {
    const taskId = crypto.randomUUID();
    const isDraft = !dto.userId;
    const workflow =
      dto.workflow === 'hero_storyboard' ? 'hero_storyboard' : 'legacy';
    const claimToken = isDraft
      ? crypto.randomBytes(24).toString('base64url')
      : undefined;
    const claimTokenHash = claimToken
      ? crypto.createHash('sha256').update(claimToken).digest('hex')
      : undefined;

    const needsBrainConfig = process.env.MOCK_BRAIN !== 'true';
    const needsPainterConfig = process.env.MOCK_PAINTER !== 'true';
    const normalizedLayoutMode = this.normalizeLayoutMode(dto.layout_mode);

    // Snapshot config（不落库密钥）
    let configSnapshot = this.common.stripSecretsFromConfig(config);
    if (!configSnapshot || Object.keys(configSnapshot).length === 0) {
      const canProceedWithoutSnapshot =
        isDraft || (!needsBrainConfig && !needsPainterConfig);

      if (canProceedWithoutSnapshot) {
        try {
          configSnapshot =
            await this.modelConfigResolver.buildSnapshotFromActive();
        } catch {
          configSnapshot = {};
        }
      } else {
        configSnapshot =
          await this.modelConfigResolver.buildSnapshotFromActive();
      }
    }

    // 非草稿：先校验模型配置可用，避免“先扣积分再失败”
    if (!isDraft) {
      if (needsBrainConfig) {
        await this.modelConfigResolver.resolveBrainRuntimeFromSnapshot(
          configSnapshot,
        );
      }
      if (needsPainterConfig) {
        await this.modelConfigResolver.resolvePainterRuntimeFromSnapshot(
          configSnapshot,
        );
      }
    }

    // 积分：生成前先校验余额；真正扣费在“成功出图并产生图片链接”之后
    const userId = dto.userId;
    if (userId && !isDraft) {
      const estimatedInitialCost =
        workflow === 'hero_storyboard'
          ? this.billing.creditsForSuccessfulHeroImage({
              resolution: dto.resolution,
            })
          : this.billing.estimateLegacyTaskCredits({
              shotCount: dto.shot_count,
              layoutMode: normalizedLayoutMode,
              resolution: dto.resolution,
            });

      const creditCheck = await this.billing.hasEnoughCreditsForAmount(
        userId,
        estimatedInitialCost,
      );
      if (!creditCheck.enough) {
        throw new Error(
          `积分不足。需要 ${creditCheck.required} 积分，当前余额 ${creditCheck.balance} 积分`,
        );
      }
    }

    // Get file paths
    // Get file paths
    const normalizePath = (p: string) => p.replace(/\\/g, '/');
    const imagePaths = dto.file_urls?.length
      ? dto.file_urls.map(normalizePath)
      : dto.files.map((f) => normalizePath(f.path));
    const faceRefPaths = dto.face_ref_urls?.length
      ? dto.face_ref_urls.map(normalizePath)
      : dto.face_refs?.map((f) => normalizePath(f.path)) || [];
    const styleRefPaths = dto.style_ref_urls?.length
      ? dto.style_ref_urls.map(normalizePath)
      : dto.style_refs?.map((f) => normalizePath(f.path)) || [];

    const modelMetadata: TaskModel['modelMetadata'] = [];

    // Process face preset IDs if provided
    if (dto.facePresetIds) {
      const presetIds = dto.facePresetIds
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      this.logger.log(
        `Processing ${presetIds.length} face preset(s): ${presetIds.join(', ')}`,
      );

      for (const presetId of presetIds) {
        const preset = await this.db.getFacePreset(presetId);
        if (preset) {
          faceRefPaths.push(preset.imagePath);
          this.logger.log(
            `✅ Loaded face preset: ${preset.name} (${presetId}) -> ${preset.imagePath}`,
          );

          // Best-effort: attach model metadata for Brain planning (legacy flow)
          modelMetadata.push({
            name: preset.name,
            gender: preset.gender,
            height: preset.height,
            weight: preset.weight,
            measurements: preset.measurements,
            description: preset.description,
          });
        } else {
          this.logger.warn(`❌ Face preset not found: ${presetId}`);
        }
      }

      this.logger.log(
        `📂 Final face ref paths (${faceRefPaths.length}):`,
        faceRefPaths,
      );
    }

    // Process style preset IDs if provided (expand to style reference images)
    if (dto.stylePresetIds) {
      const presetIds = dto.stylePresetIds
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      this.logger.log(
        `Processing ${presetIds.length} style preset(s): ${presetIds.join(', ')}`,
      );

      for (const presetId of presetIds) {
        const preset = await this.db.getStylePreset(presetId);
        if (preset) {
          const paths = (preset.imagePaths || [])
            .map(normalizePath)
            .filter(Boolean);
          styleRefPaths.push(...paths);
          this.logger.log(
            `✅ Loaded style preset: ${preset.name} (${presetId}) -> ${paths.length} image(s)`,
          );
        } else {
          this.logger.warn(`❌ Style preset not found: ${presetId}`);
        }
      }

      this.logger.log(
        `📂 Final style ref paths (${styleRefPaths.length}):`,
        styleRefPaths,
      );
    }

    // Server-side guard: enforce maximum total image count after expanding presets
    const totalImages =
      imagePaths.length + faceRefPaths.length + styleRefPaths.length;
    if (totalImages > MAX_TOTAL_IMAGES) {
      throw new BadRequestException(
        `Total image count (${totalImages}) exceeds maximum allowed (${MAX_TOTAL_IMAGES}).`,
      );
    }

    const newTask: TaskModel = {
      id: taskId,
      userId: userId, // 创建任务的用户ID
      createdAt: Date.now(),
      claimTokenHash,
      requirements: dto.requirements,
      shotCount: dto.shot_count,
      layoutMode: normalizedLayoutMode,
      layout_mode: normalizedLayoutMode, // 新增：默认 Individual
      scene: dto.scene,
      resolution: dto.resolution || '2K',
      garmentImagePaths: imagePaths, // ⭐ 保存服装图片路径
      faceRefPaths: faceRefPaths,
      styleRefPaths: styleRefPaths, // 新增
      location: dto.location, // 新增
      styleDirection: dto.styleDirection, // 新增
      garmentFocus: dto.garmentFocus, // 新增：焦点单品
      aspectRatio: dto.aspectRatio, // 新增：画面比例
      modelMetadata: modelMetadata.length > 0 ? modelMetadata : undefined,
      workflow,
      autoApproveHero: dto.autoApproveHero || false,
      status: isDraft
        ? 'DRAFT'
        : workflow === 'hero_storyboard'
          ? 'HERO_RENDERING'
          : 'PLANNING',
      resultImages: [],
      config: configSnapshot,
      autoApprove: dto.autoApprove || false,
    };

    // legacy 并发兜底：同一用户在跑任务最多 N 个，其余排队（QUEUED）
    if (!isDraft && workflow === 'legacy' && newTask.userId) {
      const active = await this.countActiveLegacyTasksForUser(newTask.userId);
      if (active >= this.maxConcurrentLegacyPerUser) {
        newTask.status = 'QUEUED';
      }
    }

    await this.db.saveTask(newTask);
    this.logger.log(
      `Task ${taskId} created. AutoApprove: ${newTask.autoApprove}`,
    );

    if (!isDraft) {
      if (workflow === 'hero_storyboard') {
        // New workflow: start Hero rendering phase (async)
        void this.heroStoryboard.startHero(taskId).catch((err) => {
          const errorMessage = this.resolveErrorMessage(
            err,
            'Hero rendering failed',
          );
          this.logger.error(`Hero rendering failed for task ${taskId}`, err);
          void this.db.updateTask(taskId, {
            status: 'FAILED',
            error: errorMessage,
          });
        });
      } else {
        if (newTask.status === 'QUEUED') {
          this.logger.log(
            `Task ${taskId} queued (user ${newTask.userId}, active>=${this.maxConcurrentLegacyPerUser})`,
          );
        } else {
          // Legacy workflow: start Brain analysis phase (async)
          void this.processBrainAnalysis(
            newTask,
            imagePaths,
            faceRefPaths,
          ).catch((err) => {
            const errorMessage = this.resolveErrorMessage(
              err,
              'Brain analysis failed',
            );
            this.logger.error(`Brain analysis failed for task ${taskId}`, err);
            void this.db
              .updateTask(taskId, { status: 'FAILED', error: errorMessage })
              .finally(() => {
                if (newTask.userId) {
                  void this.tryStartQueuedTasksForUser(newTask.userId).catch(
                    () => undefined,
                  );
                }
              });
          });
        }
      }
    }

    if (newTask.userId) {
      void this.tryStartQueuedTasksForUser(newTask.userId).catch(
        () => undefined,
      );
    }

    return { task: newTask, claimToken };
  }

  async startTask(taskId: string, user: UserModel) {
    const task = await this.db.getTask(taskId);
    if (!task) {
      throw new NotFoundException('任务不存在');
    }

    if (user.role !== 'ADMIN') {
      if (!task.userId || task.userId !== user.id) {
        throw new NotFoundException('任务不存在');
      }
    }

    if (task.status !== 'DRAFT') {
      return task;
    }

    // 草稿任务：开始生成时补齐 snapshot config（不落库密钥），并提前校验模型配置，避免“先扣积分再失败”
    const needsBrainConfig = process.env.MOCK_BRAIN !== 'true';
    const needsPainterConfig = process.env.MOCK_PAINTER !== 'true';

    let configSnapshot = this.common.stripSecretsFromConfig(task.config);
    if (
      (needsBrainConfig || needsPainterConfig) &&
      (!configSnapshot || Object.keys(configSnapshot).length === 0)
    ) {
      configSnapshot = await this.modelConfigResolver.buildSnapshotFromActive();
    }

    if (needsBrainConfig) {
      await this.modelConfigResolver.resolveBrainRuntimeFromSnapshot(
        configSnapshot,
      );
    }
    if (needsPainterConfig) {
      await this.modelConfigResolver.resolvePainterRuntimeFromSnapshot(
        configSnapshot,
      );
    }

    const userId = task.userId || user.id;
    const normalizedLayoutMode = this.normalizeLayoutMode(
      task.layout_mode ?? task.layoutMode,
    );
    const estimatedInitialCost =
      (task.workflow || 'legacy') === 'hero_storyboard'
        ? this.billing.creditsForSuccessfulHeroImage({
            resolution: task.resolution,
          })
        : this.billing.estimateLegacyTaskCredits({
            shotCount: task.shotCount,
            layoutMode: normalizedLayoutMode,
            resolution: task.resolution,
          });

    const creditCheck = await this.billing.hasEnoughCreditsForAmount(
      userId,
      estimatedInitialCost,
    );
    if (!creditCheck.enough) {
      throw new BadRequestException(
        `积分不足。需要 ${creditCheck.required} 积分，当前余额 ${creditCheck.balance} 积分`,
      );
    }

    // legacy 并发兜底：草稿任务开始时也遵循同用户并发≤N
    if ((task.workflow || 'legacy') === 'legacy') {
      const active = await this.countActiveLegacyTasksForUser(userId);
      if (active >= this.maxConcurrentLegacyPerUser) {
        await this.db.updateTask(taskId, {
          status: 'QUEUED',
          config: configSnapshot,
        });
        return this.db.getTask(taskId);
      }
    }

    const updatedTask = await this.db.updateTask(taskId, {
      status:
        task.workflow === 'hero_storyboard' ? 'HERO_RENDERING' : 'PLANNING',
      config: configSnapshot,
    });

    if (!updatedTask) throw new NotFoundException('任务不存在');

    // 非草稿：异步启动流程
    if (task.workflow === 'hero_storyboard') {
      void this.heroStoryboard.startHero(taskId).catch((err) => {
        const errorMessage = this.resolveErrorMessage(
          err,
          'Hero rendering failed',
        );
        this.logger.error(`Hero rendering failed for task ${taskId}`, err);
        void this.db.updateTask(taskId, {
          status: 'FAILED',
          error: errorMessage,
        });
      });
    } else {
      const garmentPaths = updatedTask.garmentImagePaths || [];
      const faceRefPaths = updatedTask.faceRefPaths || [];
      void this.processBrainAnalysis(
        updatedTask,
        garmentPaths,
        faceRefPaths,
        configSnapshot,
      ).catch((err) => {
        const errorMessage = this.resolveErrorMessage(
          err,
          'Brain analysis failed',
        );
        this.logger.error(`Brain analysis failed for task ${taskId}`, err);
        void this.db
          .updateTask(taskId, { status: 'FAILED', error: errorMessage })
          .finally(() => {
            void this.tryStartQueuedTasksForUser(userId).catch(() => undefined);
          });
      });
    }

    const updated = await this.db.getTask(taskId);
    if (!updated) throw new NotFoundException('任务不存在');
    return updated;
  }

  /**
   * Phase 1: Brain Analysis
   * Analyzes images and generates prompts, then either:
   * - Auto-approve mode: proceeds to rendering
   * - Manual mode: waits for user approval
   */
  private async processBrainAnalysis(
    task: TaskModel,
    imagePaths: string[],
    faceRefPaths: string[],
    config?: ModelConfig,
  ) {
    try {
      this.logger.log(`Starting Brain analysis for ${task.id}...`);

      const needsBrainConfig = process.env.MOCK_BRAIN !== 'true';
      const brainRuntime = needsBrainConfig
        ? await this.common.resolveBrainRuntime(task, config)
        : config;

      const activeKey = brainRuntime?.brainKey || brainRuntime?.apiKey;
      if (needsBrainConfig && !activeKey) {
        throw new Error(
          'Brain API Key 未配置（请在“模型配置”中设置并设为 Active）',
        );
      }

      const brainResult = await this.brain.planTask(
        imagePaths,
        task.requirements,
        {
          shot_count: task.shotCount,
          layout_mode: task.layoutMode,
          location: task.location, // 新增
          style_direction: task.styleDirection, // 新增
          style_ref_paths: task.styleRefPaths, // 新增
          face_ref_paths: faceRefPaths, // 传递人脸参考
          garment_focus: task.garmentFocus,
          aspect_ratio: task.aspectRatio,
          quality: task.resolution,
          model_metadata: task.modelMetadata,
        },
        brainRuntime,
      );

      // Extract plan and thinking process
      const plan = brainResult.plan;
      const thinkingProcess = brainResult.thinkingProcess;
      const planRecord = this.toRecord(plan);
      const normalizedPlan = {
        visual_analysis: planRecord.visual_analysis ?? null,
        styling_plan: planRecord.styling_plan ?? null,
        shots: Array.isArray(planRecord.shots) ? planRecord.shots : [],
        ...planRecord,
      };

      // 日志脱敏：不要把完整“思考过程”打到 stdout（可能很长、且有概率包含不可读内容）
      if (thinkingProcess) {
        const trimmed = String(thinkingProcess).trim();
        const preview =
          trimmed.length > 400 ? `${trimmed.slice(0, 400)}…` : trimmed;
        this.logger.log(
          `ThinkingProcess for ${task.id}: len=${trimmed.length}, preview=${preview}`,
        );
      }

      // Decide next status based on autoApprove setting
      const nextStatus = task.autoApprove ? 'RENDERING' : 'AWAITING_APPROVAL';

      await this.db.updateTask(task.id, {
        status: nextStatus,
        brainPlan: {
          ...normalizedPlan,
          thinkingProcess,
        },
      });

      this.logger.log(
        `Brain analysis complete for ${task.id}. Status: ${nextStatus}`,
      );

      // If auto-approve, proceed to rendering immediately
      if (task.autoApprove) {
        await this.startRendering(task.id, imagePaths, faceRefPaths);
      }
      // Otherwise, wait for user approval via /tasks/:id/approve endpoint
    } catch (e) {
      this.logger.error(`Brain analysis failed for task ${task.id}`, e);
      throw e;
    }
  }

  /**
   * Approve task and start rendering
   * Called by POST /tasks/:id/approve endpoint
   */
  async approveAndRender(
    taskId: string,
    editedPrompts?: Record<string, string>,
  ) {
    const task = await this.db.getTask(taskId);

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.status !== 'AWAITING_APPROVAL') {
      throw new Error(
        `Task is not awaiting approval. Current status: ${task.status}`,
      );
    }

    this.logger.log(`Task ${taskId} approved. Starting rendering...`);

    // Save edited prompts if provided
    if (editedPrompts && Object.keys(editedPrompts).length > 0) {
      await this.db.updateTask(taskId, { editedPrompts });
      this.logger.log(
        `Saved ${Object.keys(editedPrompts).length} edited prompts`,
      );
    }

    // Get image paths from task
    const imagePaths = task.garmentImagePaths || []; // ⭐ 从任务中读取服装图片路径
    const faceRefPaths = task.faceRefPaths || [];

    this.logger.log(
      `📸 Rendering with ${imagePaths.length} garment images + ${faceRefPaths.length} face refs`,
    );

    // Start rendering phase (async)
    void this.startRendering(
      taskId,
      imagePaths,
      faceRefPaths,
      task.config,
    ).catch((err) => {
      const errorMessage = this.resolveErrorMessage(err, 'Rendering failed');
      this.logger.error(`Rendering failed for task ${taskId}`, err);
      void this.db.updateTask(taskId, {
        status: 'FAILED',
        error: errorMessage,
      });
    });

    // Return immediately, rendering continues in background
    return { status: 'ok', message: 'Rendering started' };
  }

  /**
   * legacy：重试 Brain（重新规划，并在 autoApprove=true 时自动进入 Painter）
   * - 仅用于：Brain 规划失败/任务无 brainPlan 的场景
   * - 并发兜底：若同用户在跑>=N，则置为 QUEUED
   */
  async retryBrain(taskId: string) {
    const task = await this.db.getTask(taskId);
    if (!task) throw new NotFoundException('任务不存在');
    if ((task.workflow || 'legacy') !== 'legacy')
      throw new BadRequestException('仅支持传统流程(legacy)重试');
    if (!task.userId) throw new BadRequestException('任务未绑定用户，无法重试');

    const active = await this.countActiveLegacyTasksForUser(task.userId);
    if (active >= this.maxConcurrentLegacyPerUser) {
      await this.db.updateTask(taskId, { status: 'QUEUED', error: undefined });
      return this.db.getTask(taskId);
    }

    const normalizedLayoutMode = this.normalizeLayoutMode(
      task.layout_mode ?? task.layoutMode,
    );
    const estimated = this.billing.estimateLegacyTaskCredits({
      shotCount: task.shotCount,
      layoutMode: normalizedLayoutMode,
      resolution: task.resolution,
    });
    const creditCheck = await this.billing.hasEnoughCreditsForAmount(
      task.userId,
      estimated,
    );
    if (!creditCheck.enough) {
      throw new BadRequestException(
        `积分不足。需要 ${creditCheck.required} 积分，当前余额 ${creditCheck.balance} 积分`,
      );
    }

    const garmentPaths = task.garmentImagePaths || [];
    const faceRefPaths = task.faceRefPaths || [];

    await this.db.updateTask(taskId, {
      status: 'PLANNING',
      error: undefined,
      brainPlan: undefined,
      shots: undefined,
      resultImages: [],
    });

    void this.processBrainAnalysis(
      { ...task, status: 'PLANNING' } as TaskModel,
      garmentPaths,
      faceRefPaths,
    ).catch((err) => {
      const errorMessage = this.resolveErrorMessage(err, 'Brain retry failed');
      this.logger.error(`Brain retry failed for task ${taskId}`, err);
      void this.db
        .updateTask(taskId, {
          status: 'FAILED',
          error: errorMessage,
        })
        .finally(() => {
          void this.tryStartQueuedTasksForUser(task.userId).catch(
            () => undefined,
          );
        });
    });

    return this.db.getTask(taskId);
  }

  /**
   * legacy：重试 Painter（尽量“哪里失败重试哪里”）
   * - 有 shots 且存在 FAILED：仅重试失败镜头（等价于 POST /tasks/:id/retry）
   * - Grid / 无 shots：重跑整个 Painter（使用新的 billing eventKey，避免与 initial settle 冲突）
   */
  async retryRender(taskId: string) {
    const task = await this.db.getTask(taskId);
    if (!task) throw new NotFoundException('任务不存在');
    if ((task.workflow || 'legacy') !== 'legacy')
      throw new BadRequestException('仅支持传统流程(legacy)重试');
    if (!task.userId) throw new BadRequestException('任务未绑定用户，无法重试');
    if (!task.brainPlan)
      throw new BadRequestException(
        '任务缺少分镜规划（brainPlan），请先重试 Brain',
      );

    const active = await this.countActiveLegacyTasksForUser(task.userId);
    if (active >= this.maxConcurrentLegacyPerUser) {
      await this.db.updateTask(taskId, { status: 'QUEUED', error: undefined });
      return this.db.getTask(taskId);
    }

    const layoutMode = this.normalizeLayoutMode(
      task.layout_mode ?? task.layoutMode,
    );

    // 只重试失败镜头：复用现有逻辑（内部自带 reserve/settle 的 retry eventKey）
    if (
      layoutMode !== 'Grid' &&
      Array.isArray(task.shots) &&
      task.shots.some((s) => s.status === 'FAILED')
    ) {
      return this.retryFailedShots(taskId);
    }

    const estimated = this.billing.estimateLegacyTaskCredits({
      shotCount: task.shotCount,
      layoutMode,
      resolution: task.resolution,
    });
    const creditCheck = await this.billing.hasEnoughCreditsForAmount(
      task.userId,
      estimated,
    );
    if (!creditCheck.enough) {
      throw new BadRequestException(
        `积分不足。需要 ${creditCheck.required} 积分，当前余额 ${creditCheck.balance} 积分`,
      );
    }

    const garmentPaths = task.garmentImagePaths || [];
    const faceRefPaths = task.faceRefPaths || [];
    const attemptId = crypto.randomUUID();

    await this.db.updateTask(taskId, { status: 'RENDERING', error: undefined });

    this.startRendering(taskId, garmentPaths, faceRefPaths, task.config, {
      billingBaseKey: `legacy:rerender:${taskId}:${attemptId}`,
      reserveReason: '预扣：重新生成图片',
    }).catch((err) => {
      this.logger.error(`Retry render failed for task ${taskId}`, err);
    });

    return this.db.getTask(taskId);
  }

  /**
   * Phase 2: Painter Rendering
   * Generates images for all shots using approved/edited prompts
   */
  private async startRendering(
    taskId: string,
    imagePaths: string[],
    faceRefPaths: string[],
    config?: ModelConfig,
    opts?: { billingBaseKey?: string; reserveReason?: string },
  ) {
    let reserveKey = `reserve:legacy:initial:${taskId}`;
    let settleKey = `settle:legacy:initial:${taskId}`;
    try {
      const task = await this.db.getTask(taskId);

      if (!task || !task.brainPlan) {
        throw new Error('Task or brain plan not found');
      }

      const billingBaseKey = opts?.billingBaseKey || `legacy:initial:${taskId}`;
      reserveKey = `reserve:${billingBaseKey}`;
      settleKey = `settle:${billingBaseKey}`;

      const needsPainterConfig = process.env.MOCK_PAINTER !== 'true';
      const painterRuntime = needsPainterConfig
        ? await this.common.resolvePainterRuntime(task, config)
        : config;

      const activeKey = painterRuntime?.painterKey || painterRuntime?.apiKey;
      if (needsPainterConfig && !activeKey) {
        throw new Error(
          'Painter API Key 未配置（请在“模型配置”中设置并设为 Active）',
        );
      }

      // 扣费策略（B）：Painter 开始前预扣最大额度，结束后按成功张数/固定2结算，多退少补
      const layoutMode = this.normalizeLayoutMode(task.layout_mode);
      const isLegacyAlreadyCharged =
        (task.creditsSpent ?? 0) > 0 &&
        (!task.billingEvents || task.billingEvents.length === 0);

      const shouldReserveInitial =
        !opts?.billingBaseKey && !isLegacyAlreadyCharged;
      const shouldReserve =
        !!task.userId && (opts?.billingBaseKey ? true : shouldReserveInitial);

      if (task.userId && shouldReserve) {
        const reserveAmount = this.billing.estimateLegacyTaskCredits({
          shotCount: task.shotCount,
          layoutMode,
          resolution: task.resolution,
        });

        await this.billing.reserveOnce({
          taskId,
          userId: task.userId,
          amount: reserveAmount,
          reason: opts?.reserveReason || '预扣：生成图片',
          eventKey: reserveKey,
        });
      }

      await this.db.updateTask(taskId, {
        status: 'RENDERING',
        approvedAt: Date.now(),
      });

      this.logger.log(`Starting Painter for ${taskId}...`);

      const plan = task.brainPlan;
      const limitedRefs = this.rendering.limitPainterReferenceImages(
        imagePaths,
        faceRefPaths,
      );
      const allRefImages = limitedRefs.all;

      this.logger.log(`🖼️ Reference Images Breakdown:`);
      this.logger.log(
        `  - Garment images (${limitedRefs.garment.length}/${imagePaths.length}):`,
        limitedRefs.garment,
      );
      this.logger.log(
        `  - Face refs (${limitedRefs.face.length}/${faceRefPaths.length}):`,
        limitedRefs.face,
      );
      this.logger.log(`  - Total ref images: ${allRefImages.length}`);
      if (
        imagePaths.length > limitedRefs.garment.length ||
        faceRefPaths.length > limitedRefs.face.length
      ) {
        this.logger.warn(
          `⚠️ Reference images limited for Painter to reduce timeout/payload: garments<=${this.rendering.maxPainterGarmentRefs}, faces<=${this.rendering.maxPainterFaceRefs}`,
        );
      }

      // Determine rendering mode
      this.logger.log(`Rendering mode: ${layoutMode}`);

      if (layoutMode === 'Grid') {
        await this.rendering.renderGridMode(
          task,
          plan,
          allRefImages,
          limitedRefs.garment.length,
          limitedRefs.face.length,
          painterRuntime,
          { reserveEventKey: reserveKey, settleEventKey: settleKey },
        );
      } else {
        await this.rendering.renderIndividualMode(
          task,
          plan,
          allRefImages,
          limitedRefs.garment.length,
          limitedRefs.face.length,
          painterRuntime,
          { reserveEventKey: reserveKey, settleEventKey: settleKey },
        );
      }
    } catch (e) {
      const errorMessage = this.resolveErrorMessage(e, 'Rendering failed');
      this.logger.error(`Rendering failed for task ${taskId}`, e);
      await this.db.updateTask(taskId, {
        status: 'FAILED',
        error: errorMessage,
      });

      // 失败结算：全额退款（如已预扣）
      try {
        const latest = await this.db.getTask(taskId);
        if (latest?.userId) {
          await this.billing.settleOnce({
            taskId,
            userId: latest.userId,
            reserveEventKey: reserveKey,
            settleEventKey: settleKey,
            actualAmount: 0,
            reason: '任务失败结算',
          });
        }
      } catch (err) {
        await this.billing.markBillingError(
          taskId,
          this.resolveErrorMessage(err, '结算失败'),
        );
      }

      throw e;
    } finally {
      const latest = await this.db.getTask(taskId);
      if (latest?.userId) {
        await this.tryStartQueuedTasksForUser(latest.userId).catch(
          () => undefined,
        );
      }
    }
  }

  /**
   * Update prompt for a specific shot
   */
  async updateShotPrompt(taskId: string, shotId: string, newPrompt: string) {
    const task = await this.db.getTask(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const plan = task.brainPlan;
    if (!plan || !plan.shots) {
      throw new Error('No plan found');
    }

    // Find and update the shot
    const planShots = Array.isArray(plan.shots) ? plan.shots : [];
    const shot = planShots
      .map((item) => this.toRecord(item))
      .find((item) => this.matchPlanShot(item, shotId));

    if (!shot) {
      throw new Error(`Shot ${shotId} not found`);
    }

    // Update the prompt_en field (which is used for rendering)
    shot.prompt_en = newPrompt;
    shot.prompt = newPrompt;

    // Save editedPrompts for this shot
    const editedPrompts = task.editedPrompts ? { ...task.editedPrompts } : {};
    editedPrompts[shotId] = newPrompt;

    await this.db.updateTask(taskId, {
      brainPlan: plan,
      editedPrompts,
    });

    return { status: 'ok', message: 'Prompt updated' };
  }

  /**
   * Edit a specific shot
   */
  async editShot(
    taskId: string,
    shotId: string,
    editData: LegacyShotEditInput,
  ) {
    try {
      const task = await this.db.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      if (!task.shots) {
        throw new Error('Task has no shots');
      }

      const shotIndex = task.shots.findIndex((shot) =>
        this.matchLegacyShot(shot, shotId),
      );

      if (shotIndex === -1) {
        throw new Error(`Shot ${shotId} not found`);
      }

      const shot = task.shots[shotIndex];
      if (!shot.imagePath) {
        throw new Error(`Shot ${shotId} has no image to edit`);
      }

      const painterRuntime =
        process.env.MOCK_PAINTER === 'true'
          ? undefined
          : await this.common.resolvePainterRuntime(task);

      const isHttpUrl = (value: string) =>
        value.startsWith('http://') || value.startsWith('https://');

      // Build ref images list: base image + mask + optional extra refs
      const baseImageRef = shot.imageUrl || shot.imagePath;
      if (!baseImageRef) {
        throw new Error(`Shot ${shotId} has no base image`);
      }

      const fs = await import('fs-extra');

      // Mask：允许 dataURL(base64) 或 URL（推荐：前端直传 COS URL）
      let maskRef = String(editData.maskImage || '').trim();
      if (!maskRef) {
        throw new Error('Mask image is required');
      }
      let maskPath: string | undefined;
      if (!isHttpUrl(maskRef)) {
        const maskBuffer = Buffer.from(
          maskRef.replace(/^data:image\/\w+;base64,/, ''),
          'base64',
        );
        maskPath = `./uploads/masks/${Date.now()}_mask.png`;
        await fs.ensureDir('./uploads/masks');
        await fs.writeFile(maskPath, maskBuffer);
        maskRef = maskPath;
      }

      const refImages = [baseImageRef, maskRef];

      // If reference image is provided, save it
      const tmpRefPaths: string[] = [];
      const extraRefs = [
        ...this.normalizeStringArray(editData.referenceImages).filter(Boolean),
        ...(editData.referenceImage ? [editData.referenceImage] : []),
      ]
        .map((value) => String(value).trim())
        .filter(Boolean)
        .slice(0, 12);

      if (extraRefs.length > 0) {
        // 兼容：仍允许传 base64，但会先落盘再交给 Painter（Painter 侧会上传 COS 并只用 URL）
        for (const raw of extraRefs) {
          if (isHttpUrl(raw)) {
            refImages.push(raw);
            continue;
          }

          const refBuffer = Buffer.from(
            raw.replace(/^data:image\/\w+;base64,/, ''),
            'base64',
          );
          const referencePath = `./uploads/refs/${Date.now()}_${crypto.randomUUID()}_ref.jpg`;
          await fs.ensureDir('./uploads/refs');
          await fs.writeFile(referencePath, refBuffer);
          tmpRefPaths.push(referencePath);
          refImages.push(referencePath);
        }
      }

      // Call Painter with edit mode
      const prompt = String(editData.prompt || '').trim();
      if (!prompt) {
        throw new Error('Edit prompt is required');
      }
      const editedImagePath = await this.painter.generateImage(
        prompt,
        refImages,
        {
          aspectRatio: task.aspectRatio,
          imageSize: this.rendering.convertResolution(task.resolution), // Will be converted to quality
          editMode: editData.editMode || 'EDIT_MODE_INPAINT',
        },
        painterRuntime,
      );

      // 可选：上传 COS（失败不阻塞流程）
      let editedImageUrl: string | undefined;
      if (isHttpUrl(editedImagePath)) {
        editedImageUrl = editedImagePath;
      } else if (this.cos.isEnabled()) {
        const ext = path.extname(editedImagePath) || '.jpg';
        const filename = path.basename(editedImagePath);
        const key = `uploads/tasks/${task.id}/legacy/edits/${shot.shotCode || shot.id}/${filename || `${Date.now()}${ext}`}`;
        try {
          await this.cos.uploadFile(key, editedImagePath);
          editedImageUrl = this.cos.getImageUrl(key);
        } catch (e) {
          this.logger.warn(
            `COS upload failed for edited shot ${shotId} (task ${task.id}): ${this.resolveErrorMessage(
              e,
              '上传失败',
            )}`,
          );
        }
      }

      // 版本历史：复用 FixService 的版本结构（不改变 shot.promptEn）
      const versions = Array.isArray(shot.versions) ? shot.versions : [];
      if (versions.length === 0 && shot.imagePath) {
        versions.push({
          versionId: 1,
          imagePath: shot.imagePath,
          prompt: shot.promptEn || '',
          createdAt: Date.now() - 1000,
        });
      }

      const newVersion = {
        versionId: versions.length + 1,
        imagePath: editedImagePath,
        prompt,
        createdAt: Date.now(),
      };
      versions.push(newVersion);

      task.shots[shotIndex] = {
        ...shot,
        imagePath: editedImagePath,
        imageUrl: editedImageUrl,
        versions,
        currentVersion: newVersion.versionId,
      };

      // Update result images (client uses this for download/summary)
      const resultImages = (task.shots || [])
        .filter((shot) => shot.status === 'RENDERED')
        .map((shot) => shot.imageUrl || shot.imagePath)
        .filter((value): value is string => Boolean(value));

      await this.db.updateTask(taskId, {
        shots: task.shots,
        resultImages,
      });

      this.logger.log(`✅ Shot ${shotId} edited successfully`);

      // Clean up temporary files
      try {
        if (maskPath) await fs.remove(maskPath);
        for (const p of tmpRefPaths) await fs.remove(p);
      } catch (cleanupErr) {
        this.logger.warn('Failed to clean up temporary files:', cleanupErr);
      }

      return {
        success: true,
        message: `Shot ${shotId} edited successfully`,
        imagePath: editedImagePath,
        imageUrl: editedImageUrl,
      };
    } catch (err) {
      this.logger.error(`Failed to edit shot ${shotId}:`, err);
      throw new Error(
        `Image editing failed: ${this.resolveErrorMessage(err, '编辑失败')}`,
      );
    }
  }

  /**
   * Retry failed shots for a task.
   * If targetShotId is provided, only retry that shot.
   */
  async retryFailedShots(taskId: string, targetShotId?: string) {
    const task = await this.db.getTask(taskId);

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const painterRuntime =
      process.env.MOCK_PAINTER === 'true'
        ? undefined
        : await this.common.resolvePainterRuntime(task);

    if (!task.brainPlan || !task.shots) {
      throw new Error('Task does not have brain plan or shots');
    }

    const planShots = Array.isArray(task.brainPlan.shots)
      ? task.brainPlan.shots.map((shot) => this.toRecord(shot))
      : [];
    const resolvePlanShotKey = (
      shot: Record<string, unknown>,
      index: number,
    ): string => {
      const legacyId = this.toOptionalString(shot.shot_id);
      const id = this.toOptionalString(shot.id);
      return legacyId || id || String(index + 1);
    };
    const findPlanShotById = (
      shotId: string,
    ): Record<string, unknown> | undefined =>
      planShots.find(
        (shot, index) => resolvePlanShotKey(shot, index) === shotId,
      );

    // Find failed shots
    let failedShots = task.shots.filter((s) => s.status === 'FAILED');

    // Filter by targetShotId if provided (match by shotCode OR id)
    if (targetShotId) {
      failedShots = failedShots.filter((shot) =>
        this.matchLegacyShot(shot, targetShotId),
      );
      if (failedShots.length === 0) {
        const shotExists = task.shots.find((shot) =>
          this.matchLegacyShot(shot, targetShotId),
        );
        if (!shotExists) {
          this.logger.warn(
            `Shot ${targetShotId} not found in task. Available shots:`,
            task.shots.map((shot) => {
              const record = this.toRecord(shot);
              return {
                shotCode: shot.shotCode,
                id: shot.id,
                shot_id: this.toOptionalString(record.shot_id),
              };
            }),
          );
          throw new Error(`Shot ${targetShotId} not found`);
        }
        if (shotExists.status !== 'FAILED') {
          this.logger.log(`Allowing retry of non-failed shot: ${targetShotId}`);
          failedShots = [shotExists]; // Allow retry of non-failed shots too
        }
      }
    }

    if (failedShots.length === 0) {
      return { message: 'No failed shots to retry' };
    }

    // UX：重绘是一个明确的渲染过程。提前把任务状态置为 RENDERING，方便前端轮询/展示“生成中”。
    // 注意：保留旧图（shots/resultImages）直到新图生成成功后覆盖回填。
    await this.db.updateTask(taskId, { status: 'RENDERING', error: undefined });

    // 生成前先校验余额：避免“先出图，后扣费失败”
    if (task.userId) {
      const estimatedCost =
        this.billing.creditsForSuccessfulLegacyIndividualRender({
          successfulImages: failedShots.length,
          resolution: task.resolution,
        });
      const creditCheck = await this.billing.hasEnoughCreditsForAmount(
        task.userId,
        estimatedCost,
      );
      if (!creditCheck.enough) {
        throw new BadRequestException(
          `积分不足。需要 ${creditCheck.required} 积分，当前余额 ${creditCheck.balance} 积分`,
        );
      }
    }

    this.logger.log(
      `Retrying ${failedShots.length} shot(s) for task ${taskId}`,
    );

    // Rebuild ref image paths from original task data
    const garmentPaths = task.garmentImagePaths || [];
    const faceRefPaths = task.faceRefPaths || [];
    const limitedRefs = this.rendering.limitPainterReferenceImages(
      garmentPaths,
      faceRefPaths,
    );
    const allRefImages = limitedRefs.all;

    this.logger.log(
      `🔄 Retry with garments ${limitedRefs.garment.length}/${garmentPaths.length} + faces ${limitedRefs.face.length}/${faceRefPaths.length}`,
    );

    const updatedShots = [...task.shots];
    const billingAttemptId = crypto.randomUUID();
    let successfulThisAttempt = 0;

    const billingBaseKey = `legacy:retry:${billingAttemptId}`;
    const reserveKey = `reserve:${billingBaseKey}`;
    const settleKey = `settle:${billingBaseKey}`;

    try {
      if (task.userId) {
        const reserveAmount =
          this.billing.creditsForSuccessfulLegacyIndividualRender({
            successfulImages: failedShots.length,
            resolution: task.resolution,
          });
        await this.billing.reserveOnce({
          taskId,
          userId: task.userId,
          amount: reserveAmount,
          reason: `预扣：重新生图（最多 ${failedShots.length} 张）`,
          eventKey: reserveKey,
        });
      }

      type ScfShot = {
        shotId: string;
        prompt: string;
        images: Array<{ url: string; label: string }>;
        painterParams: {
          aspectRatio?: string;
          imageSize: string;
        };
      };
      type ScfResult = {
        shotId?: string;
        success?: boolean;
        imageUrl?: string;
        error?: string;
      };

      const useScf = this.painter.isScfEnabled();
      if (useScf) {
        let scfCommitted = false;
        try {
          const scfShots: ScfShot[] = [];
          const preFailed = new Map<string, string>();
          const scfUpdatedShots = updatedShots.map((shot) => ({ ...shot }));
          let scfSuccessfulCount = 0;
          const normalizeScfResult = (input: unknown): ScfResult => {
            const record = this.toRecord(input);
            const imageUrl = pickScfImageUrl(record);
            return {
              shotId: this.toOptionalString(record.shotId ?? record.shot_id),
              success: isScfResultSuccess(record, imageUrl),
              imageUrl,
              error: this.toOptionalString(record.error),
            };
          };

          for (const failedShot of failedShots) {
            const planShot = findPlanShotById(failedShot.shotCode);
            if (!planShot) {
              preFailed.set(
                String(failedShot.shotCode),
                `No prompt found for shot ${failedShot.shotCode}`,
              );
              continue;
            }

            const prompt =
              task.editedPrompts?.[failedShot.shotCode] ||
              this.getPlanShotPrompt(planShot);
            if (!prompt) {
              preFailed.set(
                String(failedShot.shotCode),
                `No prompt found for shot ${failedShot.shotCode}`,
              );
              continue;
            }

            scfShots.push({
              shotId: failedShot.shotCode,
              prompt,
              images: allRefImages.map((url, idx) => ({
                url,
                label: `REF_${idx + 1}`,
              })),
              painterParams: {
                aspectRatio: task.aspectRatio,
                imageSize: this.rendering.convertResolution(task.resolution),
              },
            });
          }

          let results: ScfResult[] = [];
          if (scfShots.length > 0) {
            const rawResults = await this.painter.generateImagesViaScf({
              taskId,
              shots: scfShots,
              config: painterRuntime,
            });
            results = Array.isArray(rawResults)
              ? rawResults.map((item) => normalizeScfResult(item))
              : [];
          }

          const resultMap = new Map<string, ScfResult>();
          for (const r of results) {
            if (r.shotId) resultMap.set(r.shotId, r);
          }

          for (const failedShot of failedShots) {
            const shotIndex = scfUpdatedShots.findIndex(
              (s) => s.shotCode === failedShot.shotCode,
            );
            if (shotIndex === -1) continue;

            const preError = preFailed.get(String(failedShot.shotCode));
            if (preError) {
              scfUpdatedShots[shotIndex] = { ...failedShot, error: preError };
              continue;
            }

            const r =
              resultMap.get(String(failedShot.shotCode)) ||
              results.find((item) => item.shotId === failedShot.shotCode);
            const imageUrl = r?.success && r?.imageUrl ? r.imageUrl.trim() : '';
            if (imageUrl) {
              scfUpdatedShots[shotIndex] = {
                ...failedShot,
                status: 'RENDERED',
                imagePath: imageUrl,
                imageUrl,
                error: undefined,
              };
              scfSuccessfulCount += 1;
            } else {
              scfUpdatedShots[shotIndex] = {
                ...failedShot,
                error: r?.error || 'Shot retry failed',
              };
            }
          }

          const successfulImages = scfUpdatedShots
            .filter((shot) => shot.status === 'RENDERED')
            .map((shot) => shot.imageUrl || shot.imagePath)
            .filter((value): value is string => Boolean(value));

          await this.db.updateTask(taskId, {
            shots: scfUpdatedShots,
            resultImages: successfulImages,
            status: successfulImages.length > 0 ? 'COMPLETED' : 'FAILED',
          });
          scfCommitted = true;

          this.logger.log(
            `Retry complete for task ${taskId}. ${successfulImages.length} total successful shots.`,
          );

          if (task.userId) {
            const actual =
              this.billing.creditsForSuccessfulLegacyIndividualRender({
                successfulImages: scfSuccessfulCount,
                resolution: task.resolution,
              });
            try {
              await this.billing.settleOnce({
                taskId,
                userId: task.userId,
                reserveEventKey: reserveKey,
                settleEventKey: settleKey,
                actualAmount: actual,
                reason: `重新生图结算（成功 ${scfSuccessfulCount} 张）`,
              });
            } catch (err) {
              this.logger.error(
                `Billing failed for task ${taskId} (legacy retry settle)`,
                err,
              );
              await this.billing.markBillingError(
                taskId,
                this.resolveErrorMessage(err, '结算失败'),
              );
            }
          }

          return this.db.getTask(taskId);
        } catch (err) {
          this.logger.warn(
            `SCF retry failed for task ${taskId}, fallback to direct painter`,
            err,
          );
          if (scfCommitted) throw err;
        }
      }

      for (const failedShot of failedShots) {
        const shotIndex = updatedShots.findIndex(
          (s) => s.shotCode === failedShot.shotCode,
        );
        if (shotIndex === -1) continue;

        const planShot = findPlanShotById(failedShot.shotCode);

        if (!planShot) continue;

        try {
          const prompt =
            task.editedPrompts?.[failedShot.shotCode] ||
            this.getPlanShotPrompt(planShot);

          if (!prompt) {
            throw new Error(`No prompt found for shot ${failedShot.shotCode}`);
          }

          this.logger.log(`Retrying shot ${failedShot.shotCode}...`);

          const imagePath = await this.painter.generateImage(
            prompt,
            allRefImages,
            {
              aspectRatio: task.aspectRatio,
              imageSize: this.rendering.convertResolution(task.resolution),
            },
            painterRuntime,
          );

          let imageUrl: string | undefined;
          const isHttpUrl = (value: string) =>
            value.startsWith('http://') || value.startsWith('https://');
          if (isHttpUrl(imagePath)) {
            imageUrl = imagePath;
          } else if (this.cos.isEnabled()) {
            const ext = path.extname(imagePath) || '.jpg';
            const filename = path.basename(imagePath);
            const key = `uploads/tasks/${task.id}/legacy/retry/${billingAttemptId}/${failedShot.shotCode}/${filename || `${Date.now()}${ext}`}`;
            try {
              await this.cos.uploadFile(key, imagePath);
              imageUrl = this.cos.getImageUrl(key);
            } catch (err) {
              this.logger.warn(
                `COS upload failed for legacy retry shot ${failedShot.shotCode} (task ${task.id}): ${this.resolveErrorMessage(
                  err,
                  '上传失败',
                )}`,
              );
            }
          }

          updatedShots[shotIndex] = {
            ...failedShot,
            status: 'RENDERED',
            imagePath: imagePath,
            imageUrl,
            error: undefined,
          };

          successfulThisAttempt += 1;
          this.logger.log(
            `✅ Successfully regenerated shot ${failedShot.shotCode}`,
          );
        } catch (err) {
          const errorMessage = this.resolveErrorMessage(
            err,
            'Shot retry failed',
          );
          this.logger.error(`Failed to retry shot ${failedShot.shotCode}`, err);
          updatedShots[shotIndex] = {
            ...failedShot,
            error: errorMessage,
          };
        }
      }

      // Update task with new shot results
      const successfulImages = updatedShots
        .filter((shot) => shot.status === 'RENDERED')
        .map((shot) => shot.imageUrl || shot.imagePath)
        .filter((value): value is string => Boolean(value));

      await this.db.updateTask(taskId, {
        shots: updatedShots,
        resultImages: successfulImages,
        status: successfulImages.length > 0 ? 'COMPLETED' : 'FAILED',
      });

      this.logger.log(
        `Retry complete for task ${taskId}. ${successfulImages.length} total successful shots.`,
      );

      if (task.userId) {
        const actual = this.billing.creditsForSuccessfulLegacyIndividualRender({
          successfulImages: successfulThisAttempt,
          resolution: task.resolution,
        });
        try {
          await this.billing.settleOnce({
            taskId,
            userId: task.userId,
            reserveEventKey: reserveKey,
            settleEventKey: settleKey,
            actualAmount: actual,
            reason: `重新生图结算（成功 ${successfulThisAttempt} 张）`,
          });
        } catch (err) {
          this.logger.error(
            `Billing failed for task ${taskId} (legacy retry settle)`,
            err,
          );
          await this.billing.markBillingError(
            taskId,
            this.resolveErrorMessage(err, '结算失败'),
          );
        }
      }

      return this.db.getTask(taskId);
    } catch (err) {
      // 致命失败：把任务置回 FAILED，避免长期卡在 RENDERING
      await this.db.updateTask(taskId, {
        status: 'FAILED',
        error: this.resolveErrorMessage(err, '重绘失败'),
      });
      throw err;
    }
  }
}
