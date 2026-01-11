import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { BrainService } from '../brain/brain.service';
import { CosService } from '../cos/cos.service';
import { DbService } from '../db/db.service';
import { HeroShotOutput, TaskModel } from '../db/models';
import { ModelConfigResolverService } from '../model-profile/model-config-resolver.service';
import { PainterService } from '../painter/painter.service';
import { WorkflowPromptService } from '../workflow-prompt/workflow-prompt.service';

@Injectable()
export class HeroStoryboardService {
  private logger = new Logger(HeroStoryboardService.name);
  private readonly maxPainterGarmentRefs = 5;
  private readonly maxPainterFaceRefs = 1; // 约束：每次只传 1 张模特（四宫格/头像锚点）

  constructor(
    private readonly db: DbService,
    private readonly brain: BrainService,
    private readonly painter: PainterService,
    private readonly cos: CosService,
    private readonly modelConfigResolver: ModelConfigResolverService,
    private readonly workflowPrompts: WorkflowPromptService,
  ) {}

  private normalizeStringArray(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return input
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean);
  }

  private buildStoryboardCardsFromPlan(plan: any, shotCount: number) {
    const safeCount = Number.isFinite(shotCount) && shotCount > 0 ? Math.floor(shotCount) : 4;
    const shots = Array.isArray(plan?.shots) ? plan.shots.slice(0, safeCount) : [];

    return shots.map((s: any, idx: number) => {
      const cameraChoice = s?.camera_choice || s?.cameraChoice || {};
      const lightingPlan = s?.lighting_plan || s?.lightingPlan || {};
      const productLight = lightingPlan?.product_light || lightingPlan?.productLight || {};

      const camera = [
        cameraChoice?.system,
        cameraChoice?.model,
        cameraChoice?.f_stop,
      ].filter(Boolean).join(' ');

      const lighting = [
        lightingPlan?.scene_light ? `scene_light=${lightingPlan.scene_light}` : '',
        productLight?.key ? `key=${productLight.key}` : '',
        productLight?.rim ? `rim=${productLight.rim}` : '',
        productLight?.fill ? `fill=${productLight.fill}` : '',
      ].filter(Boolean).join(' | ');

      const occlusion = Array.isArray(s?.occlusion_guard || s?.occlusionGuard)
        ? (s?.occlusion_guard || s?.occlusionGuard).join(', ')
        : (s?.occlusion_guard || s?.occlusionGuard || '');

      return {
        index: idx + 1,
        action: String(s?.action_pose ?? s?.actionPose ?? ''),
        blocking: '',
        camera,
        framing: String(s?.shot_type ?? s?.shotType ?? ''),
        lighting,
        occlusionNoGo: String(occlusion || ''),
        continuity: String(s?.goal ?? s?.physical_logic ?? ''),
      };
    });
  }

  async startHero(taskId: string) {
    const task = await this.db.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if ((task.workflow || 'legacy') !== 'hero_storyboard') {
      throw new Error(`Task ${taskId} workflow is not hero_storyboard`);
    }

    const { version } = await this.workflowPrompts.getActive();
    const painterSystemPrompt = version?.pack?.painterSystemPrompt?.trim();
    if (!painterSystemPrompt) {
      throw new Error('workflow prompts 未发布：缺少 painterSystemPrompt');
    }

    const painterRuntime = await this.modelConfigResolver.resolvePainterRuntimeFromSnapshot(task.config);

    const refs = this.limitPainterRefs(task);
    const refImages: string[] = [...refs.all].filter(Boolean);

    const prompt = [
      painterSystemPrompt,
      '',
      '[Mode]',
      'mode=HERO',
      '',
      '[User Requirements]',
      (task.requirements || '').trim(),
      '',
      `[Params] aspectRatio=${task.aspectRatio || '3:4'} resolution=${task.resolution || '2K'} scene=${task.scene || 'Auto'}`,
      task.location ? `location=${task.location}` : '',
      task.styleDirection ? `styleDirection=${task.styleDirection}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    // 审计：先记录本次调用的提示词与参考图（即便失败也能复盘）
    const heroAttemptCreatedAt = Date.now();
    await this.db.updateTask(taskId, {
      heroHistory: [
        ...((task.heroHistory || []) as any[]),
        {
          createdAt: heroAttemptCreatedAt,
          model: painterRuntime?.painterModel,
          promptVersionId: version?.versionId,
          promptSha256: version?.sha256,
          promptText: prompt,
          refImages,
        },
      ],
    });

    let imagePath = '';
    let shootLogText = '';
    try {
      const r = await this.painter.generateImageWithLog(
        prompt,
        refImages,
        { aspectRatio: task.aspectRatio || '3:4', imageSize: task.resolution || '2K' },
        painterRuntime,
        { taskId, stage: 'hero' },
      );
      imagePath = r.imagePath;
      shootLogText = r.shootLogText;

      if (!this.cos.isEnabled()) {
        throw new Error('COS未配置：Hero 输出图必须上传 COS 才能进入后续流程');
      }

      const ext = path.extname(imagePath) || '.jpg';
      const key = `uploads/tasks/${taskId}/hero/${Date.now()}_${randomUUID()}${ext}`;
      await this.cos.uploadFile(key, imagePath);
      const heroUrl = this.cos.getImageUrl(key);

      await this.db.updateTask(taskId, {
        heroImageUrl: heroUrl,
        heroShootLog: (shootLogText ?? '').trim(),
        status: 'AWAITING_HERO_APPROVAL',
      });

      // 审计：补全本次 attempt 的产物
      const latest = await this.db.getTask(taskId);
      const heroHistory = (latest?.heroHistory || []).map((h) => {
        if (h.createdAt !== heroAttemptCreatedAt) return h;
        return {
          ...h,
          outputImageUrl: heroUrl,
          outputShootLog: (shootLogText ?? '').trim(),
        };
      });
      await this.db.updateTask(taskId, { heroHistory });
    } catch (e: any) {
      const latestFail = await this.db.getTask(taskId);
      const heroHistory = (latestFail?.heroHistory || []).map((h) => {
        if (h.createdAt !== heroAttemptCreatedAt) return h;
        return { ...h, error: e?.message || 'Hero rendering failed' };
      });
      await this.db.updateTask(taskId, { heroHistory });
      throw e;
    }

    this.logger.log(`✅ Hero ready for task ${taskId}`);

    const updated = await this.db.getTask(taskId);
    if (updated?.autoApproveHero) {
      this.logger.log(`⚡ autoApproveHero enabled, confirming Hero for task ${taskId}`);
      await this.confirmHero(taskId);
    }

    return this.db.getTask(taskId);
  }

  async regenerateHero(taskId: string) {
    const task = await this.db.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if ((task.workflow || 'legacy') !== 'hero_storyboard') {
      throw new Error(`Task ${taskId} workflow is not hero_storyboard`);
    }

    // 重置 Hero 及后续产物（避免新旧混用）
    await this.db.updateTask(taskId, {
      status: 'HERO_RENDERING',
      error: undefined,
      heroImageUrl: undefined,
      heroShootLog: undefined,
      heroApprovedAt: undefined,
      storyboardPlan: undefined,
      storyboardCards: undefined,
      storyboardPlannedAt: undefined,
      storyboardThinkingProcess: undefined,
      heroShots: [],
      gridImageUrl: undefined,
      gridShootLog: undefined,
      gridStatus: undefined,
    });

    // 后台异步跑，接口快速返回，前端靠轮询/状态展示
    this.startHero(taskId).catch(async (err) => {
      await this.db.updateTask(taskId, {
        status: 'FAILED',
        error: err?.message || 'Hero rendering failed',
      });
      this.logger.error(`Hero re-rendering failed for task ${taskId}`, err);
    });

    return this.db.getTask(taskId);
  }

  async confirmHero(taskId: string) {
    const task = await this.db.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if ((task.workflow || 'legacy') !== 'hero_storyboard') {
      throw new Error(`Task ${taskId} workflow is not hero_storyboard`);
    }
    if (!task.heroImageUrl) {
      throw new Error('Hero 尚未生成完成');
    }

    // 允许从 STORYBOARD_PLANNING 重试（上次规划失败可能会卡在该状态）
    if (
      task.status !== 'AWAITING_HERO_APPROVAL' &&
      task.status !== 'STORYBOARD_READY' &&
      task.status !== 'STORYBOARD_PLANNING'
    ) {
      throw new Error(`任务当前状态不允许确认Hero：${task.status}`);
    }

    await this.db.updateTask(taskId, {
      heroApprovedAt: Date.now(),
      status: 'STORYBOARD_PLANNING',
    });

    const { version } = await this.workflowPrompts.getActive();
    const plannerSystemPrompt = version?.pack?.plannerSystemPrompt?.trim();
    if (!plannerSystemPrompt) {
      throw new Error('workflow prompts 未发布：缺少 plannerSystemPrompt');
    }

    const brainRuntime = await this.modelConfigResolver.resolveBrainRuntimeFromSnapshot(task.config);

    try {
      const result = await this.brain.planStoryboard(
        task.heroImageUrl,
        [
          ...(task.garmentImagePaths || []),
          ...(task.faceRefPaths || []),
          ...(task.styleRefPaths || []),
        ].filter(Boolean),
        {
          shot_count: task.shotCount || 4,
          requirements: task.requirements,
          location: task.location,
          style_direction: task.styleDirection,
          garment_focus: task.garmentFocus,
          aspect_ratio: task.aspectRatio,
          quality: task.resolution,
          output_mode: task.layout_mode || task.layoutMode,
          scene: task.scene,
        },
        brainRuntime,
        plannerSystemPrompt,
        { taskId },
      );

      const cards = this.buildStoryboardCardsFromPlan(result.plan, task.shotCount || 4);

      await this.db.updateTask(taskId, {
        storyboardPlan: result.plan,
        storyboardCards: cards,
        storyboardPlannedAt: Date.now(),
        storyboardThinkingProcess: result.thinkingProcess,
        storyboardHistory: [
          ...((task.storyboardHistory || []) as any[]),
          {
            createdAt: Date.now(),
            model: brainRuntime?.brainModel,
            systemPromptVersionId: version?.versionId,
            promptSha256: version?.sha256,
            userPromptText: result.audit?.userPromptText,
            heroImageUrl: task.heroImageUrl,
            refImages: result.audit?.referenceImageUrls,
            outputPlan: result.plan,
            thinkingProcess: result.thinkingProcess,
          },
        ],
        status: 'STORYBOARD_READY',
        error: undefined,
      });

      this.logger.log(`✅ Storyboard planned for task ${taskId} (${result.plan.shots.length} shots)`);
      return this.db.getTask(taskId);
    } catch (e: any) {
      await this.db.updateTask(taskId, {
        status: 'AWAITING_HERO_APPROVAL',
        error: e?.message || 'Storyboard planning failed',
        storyboardHistory: [
          ...((task.storyboardHistory || []) as any[]),
          {
            createdAt: Date.now(),
            model: brainRuntime?.brainModel,
            systemPromptVersionId: version?.versionId,
            promptSha256: version?.sha256,
            heroImageUrl: task.heroImageUrl,
            error: e?.message || 'Storyboard planning failed',
          },
        ],
      });
      throw e;
    }

  }

  async replanStoryboard(taskId: string) {
    const task = await this.db.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if ((task.workflow || 'legacy') !== 'hero_storyboard') {
      throw new Error(`Task ${taskId} workflow is not hero_storyboard`);
    }
    if (!task.heroImageUrl) {
      throw new Error('Hero 尚未生成完成');
    }

    if (task.status !== 'STORYBOARD_READY' && task.status !== 'AWAITING_HERO_APPROVAL' && task.status !== 'STORYBOARD_PLANNING') {
      throw new Error(`任务当前状态不允许重新抽卡：${task.status}`);
    }

    const previousSnapshot = {
      storyboardPlan: task.storyboardPlan,
      storyboardCards: task.storyboardCards,
      storyboardPlannedAt: task.storyboardPlannedAt,
      storyboardThinkingProcess: task.storyboardThinkingProcess,
      heroShots: task.heroShots,
      gridImageUrl: task.gridImageUrl,
      gridShootLog: task.gridShootLog,
      gridStatus: task.gridStatus,
    };

    await this.db.updateTask(taskId, {
      status: 'STORYBOARD_PLANNING',
      error: undefined,
    });

    const { version } = await this.workflowPrompts.getActive();
    const plannerSystemPrompt = version?.pack?.plannerSystemPrompt?.trim();
    if (!plannerSystemPrompt) {
      await this.db.updateTask(taskId, { status: 'STORYBOARD_READY', error: 'workflow prompts 未发布：缺少 plannerSystemPrompt' });
      throw new Error('workflow prompts 未发布：缺少 plannerSystemPrompt');
    }

    const brainRuntime = await this.modelConfigResolver.resolveBrainRuntimeFromSnapshot(task.config);

    try {
      const result = await this.brain.planStoryboard(
        task.heroImageUrl,
        [
          ...(task.garmentImagePaths || []),
          ...(task.faceRefPaths || []),
          ...(task.styleRefPaths || []),
        ].filter(Boolean),
        {
          shot_count: task.shotCount || 4,
          requirements: task.requirements,
          location: task.location,
          style_direction: task.styleDirection,
          garment_focus: task.garmentFocus,
          aspect_ratio: task.aspectRatio,
          quality: task.resolution,
          output_mode: task.layout_mode || task.layoutMode,
          scene: task.scene,
        },
        brainRuntime,
        plannerSystemPrompt,
        { taskId },
      );

      const cards = this.buildStoryboardCardsFromPlan(result.plan, task.shotCount || 4);

      await this.db.updateTask(taskId, {
        storyboardPlan: result.plan,
        storyboardCards: cards,
        storyboardPlannedAt: Date.now(),
        storyboardThinkingProcess: result.thinkingProcess,
        storyboardHistory: [
          ...((task.storyboardHistory || []) as any[]),
          {
            createdAt: Date.now(),
            model: brainRuntime?.brainModel,
            systemPromptVersionId: version?.versionId,
            promptSha256: version?.sha256,
            userPromptText: result.audit?.userPromptText,
            heroImageUrl: task.heroImageUrl,
            refImages: result.audit?.referenceImageUrls,
            outputPlan: result.plan,
            thinkingProcess: result.thinkingProcess,
          },
        ],
        status: 'STORYBOARD_READY',
        // 重新抽卡后，旧镜头/拼图会与新计划不一致，直接清空避免误用
        heroShots: [],
        gridImageUrl: undefined,
        gridShootLog: undefined,
        gridStatus: undefined,
      });

      this.logger.log(`🔄 Storyboard replanned for task ${taskId} (${result.plan.shots.length} shots)`);
      return this.db.getTask(taskId);
    } catch (e: any) {
      // 失败回滚，避免把任务留在“抽卡中”或丢失旧结果
      await this.db.updateTask(taskId, {
        ...previousSnapshot,
        status: previousSnapshot.storyboardPlan ? 'STORYBOARD_READY' : 'AWAITING_HERO_APPROVAL',
        error: e?.message || 'Storyboard replan failed',
        storyboardHistory: [
          ...((task.storyboardHistory || []) as any[]),
          {
            createdAt: Date.now(),
            model: brainRuntime?.brainModel,
            systemPromptVersionId: version?.versionId,
            promptSha256: version?.sha256,
            heroImageUrl: task.heroImageUrl,
            error: e?.message || 'Storyboard replan failed',
          },
        ],
      });
      throw e;
    }
  }

  private limitPainterRefs(task: TaskModel) {
    const garments = (task.garmentImagePaths || []).slice(0, this.maxPainterGarmentRefs);
    const faces = (task.faceRefPaths || []).slice(0, this.maxPainterFaceRefs);
    const styles = (task.styleRefPaths || []).slice(0, 1);
    return {
      garment: garments,
      face: faces,
      style: styles,
      all: [...garments, ...faces, ...styles].filter(Boolean),
    };
  }

  private ensureStoryboardReady(task: TaskModel) {
    if (!task.heroImageUrl) throw new Error('Hero 尚未生成完成');
    if (!task.storyboardPlan?.shots || task.storyboardPlan.shots.length === 0) {
      throw new Error('分镜规划未生成');
    }
  }

  private recomputeRenderStatus(task: TaskModel): 'SHOTS_RENDERING' | 'STORYBOARD_READY' {
    const hasPendingShots = (task.heroShots || []).some((s) => s.status === 'PENDING');
    const hasPendingGrid = task.gridStatus === 'PENDING';
    return hasPendingShots || hasPendingGrid ? 'SHOTS_RENDERING' : 'STORYBOARD_READY';
  }

  private getSelectedOrLatestShotImageUrl(shot: HeroShotOutput | undefined): string | undefined {
    if (!shot) return undefined;

    if (shot.selectedAttemptCreatedAt) {
      const selected = (shot.attempts || []).find(
        (a) => a.createdAt === shot.selectedAttemptCreatedAt && !!a.outputImageUrl,
      );
      if (selected?.outputImageUrl) return selected.outputImageUrl;
    }

    if (shot.imageUrl) return shot.imageUrl;

    const latest = (shot.attempts || [])
      .filter((a) => !!a.outputImageUrl)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    return latest?.outputImageUrl;
  }

  async renderShot(taskId: string, index: number) {
    const task = await this.getTaskOrThrow(taskId);
    if ((task.workflow || 'legacy') !== 'hero_storyboard') {
      throw new Error(`Task ${taskId} workflow is not hero_storyboard`);
    }
    this.ensureStoryboardReady(task);

    const { version } = await this.workflowPrompts.getActive();
    const painterSystemPrompt = version?.pack?.painterSystemPrompt?.trim();
    if (!painterSystemPrompt) throw new Error('workflow prompts 未发布：缺少 painterSystemPrompt');

    const painterRuntime = await this.modelConfigResolver.resolvePainterRuntimeFromSnapshot(task.config);

    const refs = this.limitPainterRefs(task);
    const prevShot = (task.heroShots || []).find((s) => s.index === index - 1);
    const prevShotUrl = this.getSelectedOrLatestShotImageUrl(prevShot);

    const refImages: string[] = [
      task.heroImageUrl!,
      prevShotUrl,
      ...refs.all,
    ].filter(Boolean) as string[];

    const shot = task.storyboardPlan?.shots?.[index - 1];
    if (!shot) throw new Error(`镜头规划不存在: ${index}`);

    const prompt = [
      painterSystemPrompt,
      '',
      '[Mode]',
      'mode=SHOT',
      `index=${index}`,
      '',
      `[Params] aspectRatio=${task.aspectRatio || '3:4'} resolution=${task.resolution || '2K'} scene=${task.scene || 'Auto'}`,
      task.location ? `location=${task.location}` : '',
      task.styleDirection ? `styleDirection=${task.styleDirection}` : '',
      task.garmentFocus ? `garmentFocus=${task.garmentFocus}` : '',
      '',
      '[Planner Shot JSON]',
      JSON.stringify(shot, null, 2),
      '',
      '[User Requirements]',
      (task.requirements || '').trim(),
    ]
      .filter(Boolean)
      .join('\n');

    const existing = (task.heroShots || []).find((s) => s.index === index);
    const nextShots: HeroShotOutput[] = [
      ...(task.heroShots || []).filter((s) => s.index !== index),
      {
        index,
        status: 'PENDING' as const,
        createdAt: Date.now(),
        ...(existing?.imageUrl ? { imageUrl: existing.imageUrl } : {}),
      },
    ].sort((a, b) => a.index - b.index);

    await this.db.updateTask(taskId, {
      status: 'SHOTS_RENDERING',
      heroShots: nextShots,
    });

    // 审计：先写入 attempt（即便失败也保留）
    const attemptCreatedAt = Date.now();
    await this.db.updateTask(taskId, {
      heroShots: nextShots.map((s) => {
        if (s.index !== index) return s;
        const attempts = [
          ...((s.attempts || []) as any[]),
          {
            createdAt: attemptCreatedAt,
            model: painterRuntime?.painterModel,
            promptVersionId: version?.versionId,
            promptSha256: version?.sha256,
            promptText: prompt,
            refImages,
          },
        ];
        return { ...s, attempts };
      }),
    });

    let imagePath = '';
    let shootLogText = '';
    try {
      const r = await this.painter.generateImageWithLog(
        prompt,
        refImages,
        { aspectRatio: task.aspectRatio || '3:4', imageSize: task.resolution || '2K' },
        painterRuntime,
        { taskId, stage: `shot_${index}` },
      );
      imagePath = r.imagePath;
      shootLogText = r.shootLogText;
    } catch (e: any) {
      const latestFail = await this.getTaskOrThrow(taskId);
      const updatedShots = (latestFail.heroShots || []).map((s) => {
        if (s.index !== index) return s;
        const hadPreviousImage = !!s.imageUrl || (s.attempts || []).some((a) => !!a.outputImageUrl);
        const attempts = (s.attempts || []).map((a) => {
          if (a.createdAt !== attemptCreatedAt) return a;
          return { ...a, error: e?.message || 'Shot rendering failed' };
        });
        // 新一次生成失败，不应该覆盖/抹掉用户已有的可用版本：
        // - 如果已有历史图片，则保持整体 status=RENDERED，只在 attempt 上记录 error
        // - 如果没有任何图片，则 status=FAILED
        return {
          ...s,
          status: hadPreviousImage ? ('RENDERED' as const) : ('FAILED' as const),
          error: hadPreviousImage ? undefined : (e?.message || 'Shot rendering failed'),
          attempts,
        };
      });
      await this.db.updateTask(taskId, {
        heroShots: updatedShots,
        status: this.recomputeRenderStatus({ ...latestFail, heroShots: updatedShots } as TaskModel),
      });
      throw e;
    }

    if (!this.cos.isEnabled()) {
      throw new Error('COS未配置：Shot 输出图必须上传 COS');
    }

    const ext = path.extname(imagePath) || '.jpg';
    const key = `uploads/tasks/${taskId}/shots/${index}/${Date.now()}_${randomUUID()}${ext}`;
    await this.cos.uploadFile(key, imagePath);
    const imageUrl = this.cos.getImageUrl(key);

    const latest = await this.getTaskOrThrow(taskId);
    const finalShots: HeroShotOutput[] = (latest.heroShots || []).map((s) => {
      if (s.index !== index) return s;
      const attempts = (s.attempts || []).map((a) => {
        if (a.createdAt !== attemptCreatedAt) return a;
        return {
          ...a,
          outputImageUrl: imageUrl,
          outputShootLog: (shootLogText ?? '').trim(),
        };
      });

      const hasSelected = Number.isFinite(s.selectedAttemptCreatedAt || 0) && (s.selectedAttemptCreatedAt as any) > 0;
      const shouldAutoSelect = !hasSelected && !s.imageUrl;
      return {
        ...s,
        status: 'RENDERED' as const,
        // 不覆盖用户当前选中的版本：默认保留 imageUrl/shootLog
        ...(shouldAutoSelect ? {
          imageUrl,
          shootLog: (shootLogText ?? '').trim(),
          selectedAttemptCreatedAt: attemptCreatedAt,
        } : {}),
        error: undefined,
        createdAt: Date.now(),
        attempts,
      };
    }).sort((a, b) => a.index - b.index);

    await this.db.updateTask(taskId, {
      heroShots: finalShots,
      status: this.recomputeRenderStatus({ ...latest, heroShots: finalShots } as TaskModel),
    });

    return this.db.getTask(taskId);
  }

  async renderGrid(taskId: string) {
    const task = await this.getTaskOrThrow(taskId);
    if ((task.workflow || 'legacy') !== 'hero_storyboard') {
      throw new Error(`Task ${taskId} workflow is not hero_storyboard`);
    }
    this.ensureStoryboardReady(task);

    const shots = (task.storyboardPlan?.shots || []).slice(0, 4);
    if (shots.length !== 4) {
      throw new Error('四镜头拼图只支持 4 张动作卡（shot_count=4）');
    }

    const { version } = await this.workflowPrompts.getActive();
    const painterSystemPrompt = version?.pack?.painterSystemPrompt?.trim();
    if (!painterSystemPrompt) throw new Error('workflow prompts 未发布：缺少 painterSystemPrompt');

    const painterRuntime = await this.modelConfigResolver.resolvePainterRuntimeFromSnapshot(task.config);

    const refs = this.limitPainterRefs(task);
    const refImages: string[] = [
      task.heroImageUrl!,
      ...refs.all,
    ].filter(Boolean) as string[];

    const prompt = [
      painterSystemPrompt,
      '',
      '[Mode]',
      'mode=GRID',
      '',
      `[Params] aspectRatio=${task.aspectRatio || '3:4'} resolution=${task.resolution || '2K'} scene=${task.scene || 'Auto'}`,
      task.location ? `location=${task.location}` : '',
      task.styleDirection ? `styleDirection=${task.styleDirection}` : '',
      task.garmentFocus ? `garmentFocus=${task.garmentFocus}` : '',
      '',
      '[Planner Shots JSON]',
      JSON.stringify(shots, null, 2),
      '',
      '[User Requirements]',
      (task.requirements || '').trim(),
    ]
      .filter(Boolean)
      .join('\n');

    const gridAttemptCreatedAt = Date.now();
    await this.db.updateTask(taskId, {
      status: 'SHOTS_RENDERING',
      gridStatus: 'PENDING',
      gridHistory: [
        ...((task.gridHistory || []) as any[]),
        {
          createdAt: gridAttemptCreatedAt,
          model: painterRuntime?.painterModel,
          promptVersionId: version?.versionId,
          promptSha256: version?.sha256,
          promptText: prompt,
          refImages,
        },
      ],
    });

    let imagePath = '';
    let shootLogText = '';
    try {
      const r = await this.painter.generateImageWithLog(
        prompt,
        refImages,
        { aspectRatio: task.aspectRatio || '3:4', imageSize: task.resolution || '2K' },
        painterRuntime,
        { taskId, stage: 'grid' },
      );
      imagePath = r.imagePath;
      shootLogText = r.shootLogText;
    } catch (e: any) {
      const latestFail = await this.getTaskOrThrow(taskId);
      await this.db.updateTask(taskId, {
        gridStatus: 'FAILED',
        status: this.recomputeRenderStatus({ ...latestFail, gridStatus: 'FAILED' } as TaskModel),
        gridHistory: (latestFail.gridHistory || []).map((h) => {
          if (h.createdAt !== gridAttemptCreatedAt) return h;
          return { ...h, error: e?.message || 'Grid rendering failed' };
        }),
      });
      throw e;
    }

    if (!this.cos.isEnabled()) {
      throw new Error('COS未配置：Grid 输出图必须上传 COS');
    }

    const ext = path.extname(imagePath) || '.jpg';
    const key = `uploads/tasks/${taskId}/grid/${Date.now()}_${randomUUID()}${ext}`;
    await this.cos.uploadFile(key, imagePath);
    const gridUrl = this.cos.getImageUrl(key);

    const latest = await this.getTaskOrThrow(taskId);
    await this.db.updateTask(taskId, {
      gridStatus: 'RENDERED',
      gridImageUrl: gridUrl,
      gridShootLog: (shootLogText ?? '').trim(),
      status: this.recomputeRenderStatus({ ...latest, gridStatus: 'RENDERED' } as TaskModel),
      gridHistory: (latest.gridHistory || []).map((h) => {
        if (h.createdAt !== gridAttemptCreatedAt) return h;
        return {
          ...h,
          outputImageUrl: gridUrl,
          outputShootLog: (shootLogText ?? '').trim(),
        };
      }),
    });

    return this.db.getTask(taskId);
  }

  async updateStoryboardShot(
    taskId: string,
    index: number,
    patch: {
      scene_subarea?: string;
      action_pose?: string;
      shot_type?: string;
      goal?: string;
      physical_logic?: string;
      composition_notes?: string;
      exec_instruction_text?: string;
      occlusion_guard?: string[];
      ref_requirements?: string[];
      universal_requirements?: string[];
      lighting_plan?: {
        scene_light?: string;
        product_light?: {
          key?: string;
          rim?: string;
          fill?: string;
        };
      };
      camera_choice?: {
        system?: string;
        model?: string;
        f_stop?: string;
      };
    },
  ) {
    const task = await this.getTaskOrThrow(taskId);
    if ((task.workflow || 'legacy') !== 'hero_storyboard') {
      throw new Error(`Task ${taskId} workflow is not hero_storyboard`);
    }
    if (!task.storyboardPlan?.shots || task.storyboardPlan.shots.length === 0) {
      throw new Error('分镜规划未生成');
    }
    if (!Number.isFinite(index) || index <= 0) {
      throw new Error('index 参数无效');
    }
    if (index > task.storyboardPlan.shots.length) {
      throw new Error(`镜头不存在: ${index}`);
    }

    const originalShot = task.storyboardPlan.shots[index - 1] || {};
    const nextShot = { ...originalShot } as any;

    if (typeof patch.scene_subarea === 'string') nextShot.scene_subarea = patch.scene_subarea;
    if (typeof patch.action_pose === 'string') nextShot.action_pose = patch.action_pose;
    if (typeof patch.shot_type === 'string') nextShot.shot_type = patch.shot_type;
    if (typeof patch.goal === 'string') nextShot.goal = patch.goal;
    if (typeof patch.physical_logic === 'string') nextShot.physical_logic = patch.physical_logic;
    if (typeof patch.composition_notes === 'string') nextShot.composition_notes = patch.composition_notes;
    if (typeof patch.exec_instruction_text === 'string') nextShot.exec_instruction_text = patch.exec_instruction_text;

    if ('occlusion_guard' in patch) nextShot.occlusion_guard = this.normalizeStringArray(patch.occlusion_guard);
    if ('ref_requirements' in patch) nextShot.ref_requirements = this.normalizeStringArray(patch.ref_requirements);
    if ('universal_requirements' in patch) nextShot.universal_requirements = this.normalizeStringArray(patch.universal_requirements);

    if (patch.lighting_plan) {
      const prevLighting = nextShot.lighting_plan || {};
      const prevProduct = prevLighting.product_light || {};
      nextShot.lighting_plan = {
        ...prevLighting,
        ...(typeof patch.lighting_plan.scene_light === 'string' ? { scene_light: patch.lighting_plan.scene_light } : {}),
        ...(patch.lighting_plan.product_light
          ? {
            product_light: {
              ...prevProduct,
              ...(typeof patch.lighting_plan.product_light.key === 'string' ? { key: patch.lighting_plan.product_light.key } : {}),
              ...(typeof patch.lighting_plan.product_light.rim === 'string' ? { rim: patch.lighting_plan.product_light.rim } : {}),
              ...(typeof patch.lighting_plan.product_light.fill === 'string' ? { fill: patch.lighting_plan.product_light.fill } : {}),
            },
          }
          : {}),
      };
    }

    if (patch.camera_choice) {
      const prevCamera = nextShot.camera_choice || {};
      nextShot.camera_choice = {
        ...prevCamera,
        ...(typeof patch.camera_choice.system === 'string' ? { system: patch.camera_choice.system } : {}),
        ...(typeof patch.camera_choice.model === 'string' ? { model: patch.camera_choice.model } : {}),
        ...(typeof patch.camera_choice.f_stop === 'string' ? { f_stop: patch.camera_choice.f_stop } : {}),
      };
    }

    const nextPlan = {
      ...(task.storyboardPlan as any),
      shots: (task.storyboardPlan.shots || []).map((s: any, idx: number) => (idx === index - 1 ? nextShot : s)),
    };

    const nextCards = this.buildStoryboardCardsFromPlan(nextPlan, task.shotCount || nextPlan?.resolved_params?.shot_count || 4);

    const patchAudit = {
      createdAt: Date.now(),
      event: 'manual_shot_patch',
      shotIndex: index,
      patch,
      before: originalShot,
      after: nextShot,
    };

    await this.db.updateTask(taskId, {
      storyboardPlan: nextPlan,
      storyboardCards: nextCards,
      storyboardHistory: [
        ...((task.storyboardHistory || []) as any[]),
        patchAudit as any,
      ],
    });

    return this.db.getTask(taskId);
  }

  async selectShotVariant(taskId: string, index: number, attemptCreatedAt: number) {
    const task = await this.getTaskOrThrow(taskId);
    if ((task.workflow || 'legacy') !== 'hero_storyboard') {
      throw new Error(`Task ${taskId} workflow is not hero_storyboard`);
    }

    const shot = (task.heroShots || []).find((s) => s.index === index);
    if (!shot) {
      throw new Error(`镜头不存在: ${index}`);
    }

    const attempt = (shot.attempts || []).find((a) => a.createdAt === attemptCreatedAt);
    if (!attempt?.outputImageUrl) {
      throw new Error('该版本尚未生成完成（缺少 outputImageUrl）');
    }

    const nextShots: HeroShotOutput[] = (task.heroShots || []).map((s) => {
      if (s.index !== index) return s;
      return {
        ...s,
        status: 'RENDERED' as const,
        selectedAttemptCreatedAt: attemptCreatedAt,
        imageUrl: attempt.outputImageUrl,
        shootLog: (attempt.outputShootLog ?? '').trim() || s.shootLog,
        error: undefined,
      };
    }).sort((a, b) => a.index - b.index);

    await this.db.updateTask(taskId, {
      heroShots: nextShots,
      status: this.recomputeRenderStatus({ ...task, heroShots: nextShots } as TaskModel),
    });

    return this.db.getTask(taskId);
  }

  async getTaskOrThrow(taskId: string): Promise<TaskModel> {
    const task = await this.db.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    return task;
  }
}
