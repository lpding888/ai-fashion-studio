
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BrainService } from '../brain/brain.service';
import { PainterService } from '../painter/painter.service';
import { DbService } from '../db/db.service';
import { TaskModel, UserModel } from '../db/models';
import { ModelConfig } from '../common/model-config';
import { CreateTaskDto } from './dto/create-task.dto';
import { CreditService } from '../credit/credit.service';
import { ModelConfigResolverService } from '../model-profile/model-config-resolver.service';
import * as crypto from 'crypto';

// 积分配置：每张图消费10积分
const CREDITS_PER_IMAGE = 10;

@Injectable()
export class TaskService {
  private logger = new Logger(TaskService.name);
  private readonly maxPainterGarmentRefs = 5;
  private readonly maxPainterFaceRefs = 2;

  constructor(
    private db: DbService,
    private brain: BrainService,
    private painter: PainterService,
    private readonly creditService: CreditService,
    private readonly modelConfigResolver: ModelConfigResolverService,
  ) { }

  private stripSecretsFromConfig(config: ModelConfig | undefined): ModelConfig {
    if (!config) return {};
    const { apiKey: _apiKey, brainKey: _brainKey, painterKey: _painterKey, ...rest } = config;
    return rest;
  }

  private async resolveBrainRuntime(task: TaskModel, config?: ModelConfig) {
    const maybeKey = config?.brainKey || config?.apiKey;
    if (config?.brainModel && maybeKey) return config;
    return this.modelConfigResolver.resolveBrainRuntimeFromSnapshot(task.config);
  }

  private async resolvePainterRuntime(task: TaskModel, config?: ModelConfig) {
    const maybeKey = config?.painterKey || config?.apiKey;
    if (config?.painterModel && maybeKey) return config;
    return this.modelConfigResolver.resolvePainterRuntimeFromSnapshot(task.config);
  }

  private limitPainterReferenceImages(garmentPaths: string[], facePaths: string[]) {
    const limitedGarments = garmentPaths.slice(0, this.maxPainterGarmentRefs);
    const limitedFaces = facePaths.slice(0, this.maxPainterFaceRefs);

    return {
      garment: limitedGarments,
      face: limitedFaces,
      all: [...limitedGarments, ...limitedFaces]
    };
  }

  async createTask(dto: CreateTaskDto, config?: ModelConfig) {
    const taskId = crypto.randomUUID();
    const isDraft = !dto.userId;
    const claimToken = isDraft ? crypto.randomBytes(24).toString('base64url') : undefined;
    const claimTokenHash = claimToken
      ? crypto.createHash('sha256').update(claimToken).digest('hex')
      : undefined;

    const needsBrainConfig = process.env.MOCK_BRAIN !== 'true';
    const needsPainterConfig = process.env.MOCK_PAINTER !== 'true';

    // Snapshot config（不落库密钥）
    let configSnapshot = this.stripSecretsFromConfig(config);
    if (!configSnapshot || Object.keys(configSnapshot).length === 0) {
      const canProceedWithoutSnapshot =
        isDraft || (!needsBrainConfig && !needsPainterConfig);

      if (canProceedWithoutSnapshot) {
        try {
          configSnapshot = await this.modelConfigResolver.buildSnapshotFromActive();
        } catch {
          configSnapshot = {};
        }
      } else {
        configSnapshot = await this.modelConfigResolver.buildSnapshotFromActive();
      }
    }

    // 非草稿：先校验模型配置可用，避免“先扣积分再失败”
    if (!isDraft) {
      if (needsBrainConfig) {
        await this.modelConfigResolver.resolveBrainRuntimeFromSnapshot(configSnapshot);
      }
      if (needsPainterConfig) {
        await this.modelConfigResolver.resolvePainterRuntimeFromSnapshot(configSnapshot);
      }
    }

    // 积分处理：如果提供了userId，检查并扣费
    const userId = dto.userId;
    const creditsRequired = dto.shot_count * CREDITS_PER_IMAGE;
    let creditsSpent = 0;

    if (userId && !isDraft) {
      try {
        // 检查积分是否足够
        const creditCheck = await this.creditService.hasEnoughCredits(userId, dto.shot_count);
        if (!creditCheck.enough) {
          throw new Error(`积分不足。需要 ${creditCheck.required} 积分，当前余额 ${creditCheck.balance} 积分`);
        }

        // 扣除积分
        await this.creditService.spendCredits(
          userId,
          creditsRequired,
          `创建生图任务 (${dto.shot_count} 张)`,
          taskId
        );
        creditsSpent = creditsRequired;
        this.logger.log(`💳 用户 ${userId} 扣除 ${creditsRequired} 积分`);
      } catch (error) {
        this.logger.error(`积分处理失败: ${error.message}`);
        throw error;
      }
    }

    // Get file paths
    // Get file paths
    const normalizePath = (p: string) => p.replace(/\\/g, '/');
    const imagePaths = dto.file_urls?.length
      ? dto.file_urls.map(normalizePath)
      : dto.files.map(f => normalizePath(f.path));
    let faceRefPaths = dto.face_ref_urls?.length
      ? dto.face_ref_urls.map(normalizePath)
      : (dto.face_refs?.map(f => normalizePath(f.path)) || []);
    const styleRefPaths = dto.style_ref_urls?.length
      ? dto.style_ref_urls.map(normalizePath)
      : (dto.style_refs?.map(f => normalizePath(f.path)) || []);

    // Process face preset IDs if provided
    if (dto.facePresetIds) {
      const presetIds = dto.facePresetIds.split(',').map(id => id.trim()).filter(Boolean);
      this.logger.log(`Processing ${presetIds.length} face preset(s): ${presetIds.join(', ')}`);

      for (const presetId of presetIds) {
        const preset = await this.db.getFacePreset(presetId);
        if (preset) {
          faceRefPaths.push(preset.imagePath);
          this.logger.log(`✅ Loaded face preset: ${preset.name} (${presetId}) -> ${preset.imagePath}`);
        } else {
          this.logger.warn(`❌ Face preset not found: ${presetId}`);
        }
      }

      this.logger.log(`📂 Final face ref paths (${faceRefPaths.length}):`, faceRefPaths);
    }

    const newTask: TaskModel = {
      id: taskId,
      userId: userId,                    // 创建任务的用户ID
      creditsSpent: creditsSpent,        // 消费的积分数量
      createdAt: Date.now(),
      claimTokenHash,
      requirements: dto.requirements,
      shotCount: dto.shot_count,
      layoutMode: dto.layout_mode,
      layout_mode: (dto.layout_mode as 'Individual' | 'Grid') || 'Individual',  // 新增：默认 Individual
      scene: dto.scene,
      resolution: dto.resolution || '2K',
      garmentImagePaths: imagePaths,  // ⭐ 保存服装图片路径
      faceRefPaths: faceRefPaths,
      styleRefPaths: styleRefPaths,                // 新增
      location: dto.location,                      // 新增
      styleDirection: dto.styleDirection,          // 新增
      garmentFocus: dto.garmentFocus,              // 新增：焦点单品
      aspectRatio: dto.aspectRatio,               // 新增：画面比例
      status: isDraft ? 'DRAFT' : 'PLANNING',
      resultImages: [],
      config: configSnapshot,
      autoApprove: dto.autoApprove || false
    };

    await this.db.saveTask(newTask);
    this.logger.log(`Task ${taskId} created. AutoApprove: ${newTask.autoApprove}`);

    if (!isDraft) {
      // Start Brain analysis phase (async)
      this.processBrainAnalysis(newTask, imagePaths, faceRefPaths).catch(err => {
        this.logger.error(`Brain analysis failed for task ${taskId}`, err);
        this.db.updateTask(taskId, { status: 'FAILED', error: err.message });
      });
    }

    return { task: newTask, claimToken };
  }

  async getTask(id: string) {
    return this.db.getTask(id);
  }

  /**
   * Get all tasks with pagination
   */
  async getAllTasks(viewer: UserModel, page: number = 1, limit: number = 20) {
    const allTasks = await this.db.getAllTasks();
    const tasks = viewer.role === 'ADMIN'
      ? allTasks
      : allTasks.filter(t => t.userId === viewer.id);

    // Sort by creation time (newest first)
    const sortedTasks = tasks.sort((a, b) => b.createdAt - a.createdAt);

    // Pagination
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedTasks = sortedTasks.slice(start, end);

    return {
      tasks: paginatedTasks,
      total: tasks.length,
      page,
      limit,
      totalPages: Math.ceil(tasks.length / limit)
    };
  }

  async claimTask(taskId: string, user: UserModel, claimToken: string) {
    const task = await this.db.getTask(taskId);
    if (!task) {
      throw new NotFoundException('任务不存在');
    }

    if (task.userId) {
      if (task.userId === user.id || user.role === 'ADMIN') {
        return task;
      }
      throw new NotFoundException('任务不存在');
    }

    if (!task.claimTokenHash) {
      throw new BadRequestException('该任务无法认领');
    }

    const hash = crypto.createHash('sha256').update(claimToken).digest('hex');
    if (hash !== task.claimTokenHash) {
      throw new BadRequestException('认领凭证无效');
    }

    const updated = await this.db.updateTask(taskId, {
      userId: user.id,
      claimTokenHash: undefined,
    });

    if (!updated) {
      throw new NotFoundException('任务不存在');
    }

    return updated;
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

    let configSnapshot = this.stripSecretsFromConfig(task.config);
    if (
      (needsBrainConfig || needsPainterConfig)
      && (!configSnapshot || Object.keys(configSnapshot).length === 0)
    ) {
      configSnapshot = await this.modelConfigResolver.buildSnapshotFromActive();
    }

    if (needsBrainConfig) {
      await this.modelConfigResolver.resolveBrainRuntimeFromSnapshot(configSnapshot);
    }
    if (needsPainterConfig) {
      await this.modelConfigResolver.resolvePainterRuntimeFromSnapshot(configSnapshot);
    }

    const userId = task.userId || user.id;
    const creditsRequired = task.shotCount * CREDITS_PER_IMAGE;

    // 草稿任务：开始生成时才扣费
    const creditCheck = await this.creditService.hasEnoughCredits(userId, task.shotCount);
    if (!creditCheck.enough) {
      throw new BadRequestException(`积分不足。需要 ${creditCheck.required} 积分，当前余额 ${creditCheck.balance} 积分`);
    }

    await this.creditService.spendCredits(
      userId,
      creditsRequired,
      `开始生图任务 (${task.shotCount} 张)`,
      taskId
    );

    await this.db.updateTask(taskId, {
      status: 'PLANNING',
      creditsSpent: creditsRequired,
      config: configSnapshot,
    });

    const imagePaths = task.garmentImagePaths || [];
    const faceRefPaths = task.faceRefPaths || [];

    this.processBrainAnalysis(
      { ...task, status: 'PLANNING', creditsSpent: creditsRequired, userId, config: configSnapshot } as TaskModel,
      imagePaths,
      faceRefPaths
    ).catch(err => {
      this.logger.error(`Brain analysis failed for task ${taskId}`, err);
      this.db.updateTask(taskId, { status: 'FAILED', error: err.message });
    });

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
    config?: ModelConfig
  ) {
    try {
      this.logger.log(`Starting Brain analysis for ${task.id}...`);

      const needsBrainConfig = process.env.MOCK_BRAIN !== 'true';
      const brainRuntime = needsBrainConfig
        ? await this.resolveBrainRuntime(task, config)
        : config;

      const activeKey = brainRuntime?.brainKey || brainRuntime?.apiKey;
      if (needsBrainConfig && !activeKey) {
        throw new Error('Brain API Key 未配置（请在“模型配置”中设置并设为 Active）');
      }

      const brainResult = await this.brain.planTask(
        imagePaths,
        task.requirements,
        {
          shot_count: task.shotCount,
          layout_mode: task.layoutMode,
          location: task.location,                    // 新增
          style_direction: task.styleDirection,        // 新增
          style_ref_paths: task.styleRefPaths,        // 新增
          face_ref_paths: faceRefPaths                // 传递人脸参考
        },
        brainRuntime
      );

      // Extract plan and thinking process
      const plan = brainResult.plan;
      const thinkingProcess = brainResult.thinkingProcess;

      // Log thinking process if available
      if (thinkingProcess) {
        this.logger.log(`=== Thinking Process for ${task.id} ===`);
        this.logger.log(thinkingProcess);
      }

      // Decide next status based on autoApprove setting
      const nextStatus = task.autoApprove ? 'RENDERING' : 'AWAITING_APPROVAL';

      await this.db.updateTask(task.id, {
        status: nextStatus,
        brainPlan: {
          ...plan,
          thinkingProcess: thinkingProcess
        } as any
      });

      this.logger.log(`Brain analysis complete for ${task.id}. Status: ${nextStatus}`);

      // If auto-approve, proceed to rendering immediately
      if (task.autoApprove) {
        await this.startRendering(task.id, imagePaths, faceRefPaths);
      }
      // Otherwise, wait for user approval via /tasks/:id/approve endpoint

    } catch (e: any) {
      this.logger.error(`Brain analysis failed for task ${task.id}`, e);
      throw e;
    }
  }

  /**
   * Approve task and start rendering
   * Called by POST /tasks/:id/approve endpoint
   */
  async approveAndRender(taskId: string, editedPrompts?: any) {
    const task = await this.db.getTask(taskId);

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.status !== 'AWAITING_APPROVAL') {
      throw new Error(`Task is not awaiting approval. Current status: ${task.status}`);
    }

    this.logger.log(`Task ${taskId} approved. Starting rendering...`);

    // Save edited prompts if provided
    if (editedPrompts && Object.keys(editedPrompts).length > 0) {
      await this.db.updateTask(taskId, { editedPrompts });
      this.logger.log(`Saved ${Object.keys(editedPrompts).length} edited prompts`);
    }

    // Get image paths from task
    const imagePaths = task.garmentImagePaths || [];  // ⭐ 从任务中读取服装图片路径
    const faceRefPaths = task.faceRefPaths || [];

    this.logger.log(`📸 Rendering with ${imagePaths.length} garment images + ${faceRefPaths.length} face refs`);

    // Start rendering phase (async)
    this.startRendering(taskId, imagePaths, faceRefPaths, task.config).catch(err => {
      this.logger.error(`Rendering failed for task ${taskId}`, err);
      this.db.updateTask(taskId, { status: 'FAILED', error: err.message });
    });

    // Return immediately, rendering continues in background
    return { status: 'ok', message: 'Rendering started' };
  }

  /**
   * Phase 2: Painter Rendering
   * Generates images for all shots using approved/edited prompts
   */
  private async startRendering(
    taskId: string,
    imagePaths: string[],
    faceRefPaths: string[],
    config?: ModelConfig
  ) {
    try {
      const task = await this.db.getTask(taskId);

      if (!task || !task.brainPlan) {
        throw new Error('Task or brain plan not found');
      }

      const needsPainterConfig = process.env.MOCK_PAINTER !== 'true';
      const painterRuntime = needsPainterConfig
        ? await this.resolvePainterRuntime(task, config)
        : config;

      const activeKey = painterRuntime?.painterKey || painterRuntime?.apiKey;
      if (needsPainterConfig && !activeKey) {
        throw new Error('Painter API Key 未配置（请在“模型配置”中设置并设为 Active）');
      }

      await this.db.updateTask(taskId, {
        status: 'RENDERING',
        approvedAt: Date.now()
      });

      this.logger.log(`Starting Painter for ${taskId}...`);

      const plan = task.brainPlan;
      const limitedRefs = this.limitPainterReferenceImages(imagePaths, faceRefPaths);
      const allRefImages = limitedRefs.all;

      this.logger.log(`🖼️ Reference Images Breakdown:`);
      this.logger.log(`  - Garment images (${limitedRefs.garment.length}/${imagePaths.length}):`, limitedRefs.garment);
      this.logger.log(`  - Face refs (${limitedRefs.face.length}/${faceRefPaths.length}):`, limitedRefs.face);
      this.logger.log(`  - Total ref images: ${allRefImages.length}`);
      if (imagePaths.length > limitedRefs.garment.length || faceRefPaths.length > limitedRefs.face.length) {
        this.logger.warn(
          `⚠️ Reference images limited for Painter to reduce timeout/payload: garments<=${this.maxPainterGarmentRefs}, faces<=${this.maxPainterFaceRefs}`
        );
      }

      // Determine rendering mode
      const layoutMode = task.layout_mode || 'Individual';
      this.logger.log(`Rendering mode: ${layoutMode}`);

      if (layoutMode === 'Grid') {
        await this.renderGridMode(task, plan, allRefImages, limitedRefs.garment.length, limitedRefs.face.length, painterRuntime);
      } else {
        await this.renderIndividualMode(task, plan, allRefImages, limitedRefs.garment.length, limitedRefs.face.length, painterRuntime);
      }

    } catch (e: any) {
      this.logger.error(`Rendering failed for task ${taskId}`, e);
      await this.db.updateTask(taskId, {
        status: 'FAILED',
        error: e.message || 'Rendering failed'
      });
      throw e;
    }
  }

  /**
   * Convert resolution string to pixel dimensions
   */
  private convertResolution(resolution: string): string {
    const resolutionMap: Record<string, string> = {
      '1K': '1024x1024',
      '2K': '2048x2048',
      '4K': '4096x4096'
    };
    return resolutionMap[resolution] || '2048x2048';
  }

  /**
   * Helper: Determine grid layout based on shot count
   */
  private getGridLayout(count: number): string {
    if (count <= 1) return '1x1';
    if (count === 2) return '1x2';
    if (count === 3) return '1x3';
    if (count === 4) return '2x2';
    if (count <= 6) return '2x3';
    if (count <= 9) return '3x3';
    return '4x3';
  }

  /**
   * Build enhanced reference image instruction using Brain's image analysis
   */
  private buildReferenceImageInstruction(plan: any, garmentImageCount: number, faceRefCount: number): string {
    let instruction = `⚠️ CRITICAL: EXACTLY MATCH THE UPLOADED GARMENT

`;

    // Add image analysis breakdown if available from Brain
    if (plan.image_analysis && plan.image_analysis.length > 0) {
      instruction += `📸 Reference Images Breakdown:\n`;

      for (const img of plan.image_analysis) {
        const viewTypeLabel = {
          'front': '正面视图',
          'back': '背面视图',
          'side': '侧面视图',
          'detail': '细节特写',
          'full_outfit': '全身造型',
          'angle': '斜角视图',
          'texture': '材质纹理',
          'other': '其他角度'
        }[img.view_type] || img.view_type;

        instruction += `  - Image ${img.index + 1} [${viewTypeLabel}]: ${img.description}`;
        if (img.focus_area) {
          instruction += ` (Focus: ${img.focus_area})`;
        }
        instruction += `\n`;
      }

      instruction += `\n⚠️ CRITICAL: All these images show THE SAME GARMENT from different angles.\n`;
      instruction += `You MUST study ALL views to understand the complete design.\n\n`;
    } else {
      // Fallback when Brain doesn't provide image_analysis
      instruction += `📸 Reference Images:\n`;
      instruction += `  - Images 1-${garmentImageCount}: Multiple views of THE SAME garment you MUST replicate\n`;
      instruction += `    * Study ALL angles to understand complete design, materials, and details\n`;
      instruction += `    * They show ONE garment from different perspectives (front, back, details)\n`;
      if (faceRefCount > 0) {
        instruction += `  - Image ${garmentImageCount + 1}: Face/model reference\n`;
      }
      instruction += `\n`;
    }

    // Keep original strong consistency instruction (upgraded, not replaced)
    instruction += `ABSOLUTE REQUIREMENTS:\n`;
    instruction += `1. Based on the uploaded reference images, silently analyze and maintain 100% consistency\n`;
    instruction += `2. Exact wardrobe: materials, colors, textures, stitching, accessories must be IDENTICAL\n`;
    instruction += `3. Model's facial features, hair, body proportions must remain IDENTICAL (if face ref provided)\n`;
    instruction += `4. Do NOT add or remove anything. Do NOT reinterpret materials or colors\n`;
    instruction += `5. Do NOT invent new design elements not shown in the reference images\n\n`;

    return instruction;
  }

  /**
   * Grid Mode: Generate one contact sheet with all shots
   */
  private async renderGridMode(
    task: TaskModel,
    plan: any,
    allRefImages: string[],
    garmentRefCount: number,
    faceRefCount: number,
    config?: ModelConfig
  ) {
    const shotCount = plan.shots.length;
    const gridLayout = this.getGridLayout(shotCount);

    this.logger.log(`📐 Grid Mode: Generating ${gridLayout} contact sheet with ${shotCount} frames`);

    // Build enhanced reference instruction (upgraded from static text)
    const referenceInstruction = this.buildReferenceImageInstruction(plan, garmentRefCount, faceRefCount);

    const gridInstruction = `${referenceInstruction}Your visible output must be:
One ${gridLayout} contact sheet image (${shotCount} frames).

Each frame must represent a resting point after a dramatic camera move - only describe the final camera position and what the subject is doing, never the motion itself.

Required ${shotCount}-Frame Shot List:
`;

    let shotDescriptions = '';
    for (let i = 0; i < plan.shots.length; i++) {
      const shot = plan.shots[i];
      const shotNum = i + 1;
      shotDescriptions += `${shotNum}. ${shot.type || 'Shot ' + shotNum}\n`;
      shotDescriptions += `${shot.prompt_en || shot.prompt}\n\n`;
    }

    const continuityRequirements = `
Continuity & Technical Requirements:
- Maintain perfect wardrobe fidelity in every frame: exact garment type, silhouette, material, color, texture, stitching, accessories, closures, jewelry, shoes, hair, and makeup
- Environment, textures, and lighting must remain consistent
- Depth of field shifts naturally with focal length (deep for distant shots, shallow for close/detail shots)
- Photoreal textures and physically plausible light behavior required
- Frames must feel like different camera placements within the same scene, not different scenes`;

    const fullPrompt = gridInstruction + shotDescriptions + continuityRequirements;

    try {
      const imagePath = await this.painter.generateImage(
        fullPrompt,
        allRefImages,
        {
          aspectRatio: task.aspectRatio,
          imageSize: this.convertResolution(task.resolution)
        },
        config
      );

      await this.db.updateTask(task.id, {
        status: 'COMPLETED',
        resultImages: [imagePath],
        shots: plan.shots.map((shot: any, idx: number) => ({
          id: crypto.randomUUID(),
          shotCode: shot.shot_id || shot.id || `${idx + 1}`,
          type: shot.type,
          promptEn: shot.prompt_en || shot.prompt,
          status: 'RENDERED',
          imagePath: imagePath
        })) as any
      });

      this.logger.log(`✅ Grid contact sheet generated for task ${task.id}`);

    } catch (err: any) {
      this.logger.error(`Grid mode rendering failed for task ${task.id}`, err);
      await this.db.updateTask(task.id, {
        status: 'FAILED',
        error: err.message
      });
      throw err;
    }
  }

  /**
   * Individual Mode: Generate separate image for each shot
   */
  private async renderIndividualMode(
    task: TaskModel,
    plan: any,
    allRefImages: string[],
    garmentRefCount: number,
    faceRefCount: number,
    config?: ModelConfig
  ) {
    this.logger.log(`🎬 Individual Mode: Generating ${plan.shots.length} separate images`);

    const generatedShots = [];

    const referenceInstruction = this.buildReferenceImageInstruction(plan, garmentRefCount, faceRefCount);

    for (let i = 0; i < plan.shots.length; i++) {
      const shot = plan.shots[i];
      const shotId = shot.shot_id || shot.id || `${i + 1}`;

      this.logger.log(`Painting Shot ${shotId}...`);

      try {
        // Check for user-edited prompt first
        let prompt = task.editedPrompts?.[shotId]
          || shot.prompt_en
          || shot.prompt;

        if (!prompt) {
          throw new Error(`No prompt found for shot ${shotId}`);
        }

        // Add enhanced consistency instruction to each individual shot (upgraded from static text)
        prompt = referenceInstruction + prompt;

        const imagePath = await this.painter.generateImage(
          prompt,
          allRefImages,
          {
            aspectRatio: task.aspectRatio,
            imageSize: this.convertResolution(task.resolution)
          },
          config
        );

        generatedShots.push({
          id: crypto.randomUUID(),
          shotCode: shotId,
          type: shot.type,
          promptEn: shot.prompt_en || shot.prompt,
          status: 'RENDERED',
          imagePath: imagePath
        });

        this.logger.log(`✅ Shot ${shotId} rendered successfully`);

      } catch (err: any) {
        this.logger.error(`Failed to paint shot ${shotId}`, err);
        generatedShots.push({
          id: crypto.randomUUID(),
          shotCode: shotId,
          type: shot.type,
          promptEn: shot.prompt_en || shot.prompt,
          status: 'FAILED',
          error: err.message
        });
      }
    }

    // Collect successful images
    const successfulImages = generatedShots
      .filter(s => s.status === 'RENDERED' && s.imagePath)
      .map(s => s.imagePath as string);

    await this.db.updateTask(task.id, {
      status: successfulImages.length > 0 ? 'COMPLETED' : 'FAILED',
      resultImages: successfulImages,
      shots: generatedShots as any
    });

    this.logger.log(`Task ${task.id} Completed with ${successfulImages.length} images.`);
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
    const shot = plan.shots.find((s: any) =>
      (s.id === shotId || s.shot_id === shotId)
    );

    if (!shot) {
      throw new Error(`Shot ${shotId} not found`);
    }

    // Update the prompt_en field (which is used for rendering)
    shot.prompt_en = newPrompt;
    shot.prompt = newPrompt;

    // Save editedPrompts for this shot
    if (!task.editedPrompts) {
      task.editedPrompts = {};
    }
    task.editedPrompts[shotId] = newPrompt;

    //Update task in DB
    await this.db.updateTask(taskId, {
      brainPlan: plan,
      editedPrompts: task.editedPrompts
    });

    this.logger.log(`✅ Updated prompt for shot ${shotId} in task ${taskId}`);

    return { success: true, message: `Shot ${shotId} prompt updated` };
  }

  /**
   * Edit a shot using mask-based editing
   */
  async editShot(
    taskId: string,
    shotId: string,
    editData: {
      maskImage: string;
      referenceImage?: string;
      prompt: string;
      editMode?: string;
    }
  ) {
    const task = await this.db.getTask(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const painterRuntime = process.env.MOCK_PAINTER === 'true'
      ? undefined
      : await this.resolvePainterRuntime(task);

    const plan = task.brainPlan;
    if (!plan || !plan.shots) {
      throw new Error('No plan found');
    }

    // Find the shot
    const shot = plan.shots.find((s: any) =>
      (s.id === shotId || s.shot_id === shotId)
    );

    if (!shot || !shot.imagePath) {
      throw new Error(`Shot ${shotId} not found or has no image`);
    }

    this.logger.log(`✏️ Editing shot ${shotId} with mask-based editing`);

    try {
      // Prepare images for editing
      const fs = await import('fs-extra');

      // Decode and save mask image
      const maskBuffer = Buffer.from(editData.maskImage.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      const maskPath = `./uploads/masks/${Date.now()}_mask.png`;
      await fs.ensureDir('./uploads/masks');
      await fs.writeFile(maskPath, maskBuffer);

      const refImages = [shot.imagePath, maskPath];

      // If reference image is provided, save it
      if (editData.referenceImage) {
        const refBuffer = Buffer.from(editData.referenceImage.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        const refPath = `./uploads/refs/${Date.now()}_ref.jpg`;
        await fs.ensureDir('./uploads/refs');
        await fs.writeFile(refPath, refBuffer);
        refImages.push(refPath);
      }

      // Call Painter with edit mode
      const editedImagePath = await this.painter.generateImage(
        editData.prompt,
        refImages,
        {
          aspectRatio: task.aspectRatio,
          imageSize: this.convertResolution(task.resolution),  // Will be converted to quality
          editMode: editData.editMode || 'EDIT_MODE_INPAINT'
        },
        painterRuntime
      );

      // Update shot with edited image
      const originalImagePath = shot.imagePath;
      shot.imagePath = editedImagePath;

      // Store edit history
      if (!shot.editHistory) {
        shot.editHistory = [];
      }
      shot.editHistory.push({
        timestamp: Date.now(),
        originalImage: originalImagePath,
        editedImage: editedImagePath,
        prompt: editData.prompt,
        editMode: editData.editMode
      });

      // Save updated task
      await this.db.updateTask(taskId, {
        brainPlan: plan
      });

      this.logger.log(`✅ Shot ${shotId} edited successfully`);

      // Clean up temporary files
      try {
        await fs.remove(maskPath);
        if (editData.referenceImage) {
          const refPath = refImages[refImages.length - 1];
          await fs.remove(refPath);
        }
      } catch (cleanupErr) {
        this.logger.warn('Failed to clean up temporary files:', cleanupErr);
      }

      return {
        success: true,
        message: `Shot ${shotId} edited successfully`,
        imagePath: editedImagePath
      };

    } catch (err: any) {
      this.logger.error(`Failed to edit shot ${shotId}:`, err);
      throw new Error(`Image editing failed: ${err.message}`);
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

    const painterRuntime = process.env.MOCK_PAINTER === 'true'
      ? undefined
      : await this.resolvePainterRuntime(task);

    if (!task.brainPlan || !task.shots) {
      throw new Error('Task does not have brain plan or shots');
    }

    // Find failed shots
    let failedShots = task.shots.filter(s => s.status === 'FAILED');

    // Filter by targetShotId if provided (match by shotCode OR id)
    if (targetShotId) {
      failedShots = failedShots.filter(s =>
        s.shotCode === targetShotId ||
        (s as any).shot_id === targetShotId ||
        (s as any).id === targetShotId
      );
      if (failedShots.length === 0) {
        const shotExists = task.shots.find(s =>
          s.shotCode === targetShotId ||
          (s as any).shot_id === targetShotId ||
          (s as any).id === targetShotId
        );
        if (!shotExists) {
          this.logger.warn(`Shot ${targetShotId} not found in task. Available shots:`,
            task.shots.map(s => ({ shotCode: s.shotCode, id: (s as any).id, shot_id: (s as any).shot_id }))
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

    this.logger.log(`Retrying ${failedShots.length} shot(s) for task ${taskId}`);

    // Rebuild ref image paths from original task data
    const garmentPaths = task.garmentImagePaths || [];
    const faceRefPaths = task.faceRefPaths || [];
    const limitedRefs = this.limitPainterReferenceImages(garmentPaths, faceRefPaths);
    const allRefImages = limitedRefs.all;

    this.logger.log(
      `🔄 Retry with garments ${limitedRefs.garment.length}/${garmentPaths.length} + faces ${limitedRefs.face.length}/${faceRefPaths.length}`
    );

    const updatedShots = [...task.shots];

    for (const failedShot of failedShots) {
      const shotIndex = updatedShots.findIndex(s => s.shotCode === failedShot.shotCode);
      if (shotIndex === -1) continue;

      const planShot = task.brainPlan.shots.find((s: any) =>
        (s.shot_id || s.id || `${task.brainPlan?.shots.indexOf(s) + 1}`) === failedShot.shotCode
      );

      if (!planShot) continue;

      try {
        const prompt = task.editedPrompts?.[failedShot.shotCode]
          || planShot.prompt_en
          || planShot.prompt;

        if (!prompt) {
          throw new Error(`No prompt found for shot ${failedShot.shotCode}`);
        }

        this.logger.log(`Retrying shot ${failedShot.shotCode}...`);

        const imagePath = await this.painter.generateImage(
          prompt,
          allRefImages,
          {
            aspectRatio: task.aspectRatio,
            imageSize: this.convertResolution(task.resolution)
          },
          painterRuntime
        );

        updatedShots[shotIndex] = {
          ...failedShot,
          status: 'RENDERED',
          imagePath: imagePath,
          error: undefined
        };

        this.logger.log(`✅ Successfully regenerated shot ${failedShot.shotCode}`);

      } catch (err: any) {
        this.logger.error(`Failed to retry shot ${failedShot.shotCode}`, err);
        updatedShots[shotIndex] = {
          ...failedShot,
          error: err.message
        };
      }
    }

    // Update task with new shot results
    const successfulImages = updatedShots
      .filter(s => s.status === 'RENDERED' && s.imagePath)
      .map(s => s.imagePath as string);

    await this.db.updateTask(taskId, {
      shots: updatedShots as any,
      resultImages: successfulImages,
      status: successfulImages.length > 0 ? 'COMPLETED' : 'FAILED'
    });

    this.logger.log(`Retry complete for task ${taskId}. ${successfulImages.length} total successful shots.`);

    return this.db.getTask(taskId);
  }

  /**
   * 删除任务及其相关文件
   */
  async deleteTask(taskId: string): Promise<boolean> {
    const task = await this.db.getTask(taskId);
    if (!task) {
      this.logger.warn(`任务不存在: ${taskId}`);
      return false;
    }

    this.logger.log(`🗑️ 开始删除任务 ${taskId}...`);

    // 删除数据库记录
    const deleted = await this.db.deleteTask(taskId);

    if (deleted) {
      this.logger.log(`✅ 任务 ${taskId} 已删除`);

      // 如果有积分消费记录，可以考虑退款（可选）
      if (task.userId && task.creditsSpent && task.creditsSpent > 0) {
        try {
          await this.creditService.refundCredits(
            task.userId,
            task.creditsSpent,
            `任务删除退款`,
            taskId
          );
          this.logger.log(`💰 用户 ${task.userId} 退款 ${task.creditsSpent} 积分`);
        } catch (error) {
          this.logger.warn(`退款失败: ${error.message}`);
        }
      }
    }

    return deleted;
  }
}
