import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { BrainService } from '../brain/brain.service';
import { CosService } from '../cos/cos.service';
import { DbService } from '../db/db.service';
import type { HeroShotOutput, HeroWorkspaceSnapshot, PainterSession, PainterSessionMessage, TaskModel } from '../db/models';
import { ModelConfigResolverService } from '../model-profile/model-config-resolver.service';
import { PainterService } from '../painter/painter.service';
import { WorkflowPromptService } from '../workflow-prompt/workflow-prompt.service';
import { TaskBillingService } from './task-billing.service';

@Injectable()
export class HeroStoryboardService {
  private logger = new Logger(HeroStoryboardService.name);
  private readonly maxPainterGarmentRefs = 5;
  private readonly maxPainterFaceRefs = 1; // 约束：每次只传 1 张模特（四宫格/头像锚点）
  private readonly maxHeroEditReferenceImages = 12;

  constructor(
    private readonly db: DbService,
    private readonly brain: BrainService,
    private readonly painter: PainterService,
    private readonly cos: CosService,
    private readonly modelConfigResolver: ModelConfigResolverService,
    private readonly workflowPrompts: WorkflowPromptService,
    private readonly billing: TaskBillingService,
  ) {}

  private normalizeStringArray(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return input
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean);
  }

  private sanitizeUserShootLogText(input: unknown): string {
    const raw = typeof input === 'string' ? input : '';
    const normalized = raw.replace(/\r\n/g, '\n').trim();
    return normalized.length > 20000 ? `${normalized.slice(0, 20000)}…` : normalized;
  }

  private getLatestSuccessfulHeroAttemptCreatedAt(task: TaskModel): number | null {
    const history = Array.isArray(task.heroHistory) ? task.heroHistory : [];
    const latest = history
      .filter((h: any) => Number(h?.createdAt) > 0 && typeof h?.outputImageUrl === 'string' && String(h.outputImageUrl).trim())
      .sort((a: any, b: any) => Number(b.createdAt) - Number(a.createdAt))[0];
    const createdAt = Number(latest?.createdAt) || 0;
    return createdAt > 0 ? createdAt : null;
  }

  private getActiveHeroAttemptCreatedAt(task: TaskModel): number | null {
    const selected = Number((task as any).heroSelectedAttemptCreatedAt) || 0;
    if (selected > 0) return selected;
    return this.getLatestSuccessfulHeroAttemptCreatedAt(task);
  }

  private buildHeroWorkspaceSnapshot(taskView: TaskModel, attemptCreatedAt: number): HeroWorkspaceSnapshot {
    return {
      attemptCreatedAt,
      updatedAt: Date.now(),
      heroImageUrl: String(taskView.heroImageUrl || '').trim(),
      heroShootLog: (taskView.heroShootLog || '').trim() || undefined,
      heroApprovedAt: Number(taskView.heroApprovedAt || 0) > 0 ? taskView.heroApprovedAt : undefined,
      storyboardPlan: taskView.storyboardPlan,
      storyboardCards: taskView.storyboardCards,
      storyboardPlannedAt: taskView.storyboardPlannedAt,
      storyboardThinkingProcess: taskView.storyboardThinkingProcess,
      storyboardHistory: Array.isArray(taskView.storyboardHistory) ? taskView.storyboardHistory : undefined,
      heroShots: Array.isArray(taskView.heroShots) ? taskView.heroShots : undefined,
      gridImageUrl: taskView.gridImageUrl,
      gridShootLog: taskView.gridShootLog,
      gridStatus: taskView.gridStatus,
      painterSession: taskView.painterSession,
    };
  }

  private upsertHeroWorkspace(
    existing: HeroWorkspaceSnapshot[] | undefined,
    next: HeroWorkspaceSnapshot,
  ): HeroWorkspaceSnapshot[] {
    const arr = Array.isArray(existing) ? existing.slice() : [];
    const idx = arr.findIndex((w) => Number(w?.attemptCreatedAt) === Number(next.attemptCreatedAt));
    if (idx >= 0) {
      arr[idx] = { ...arr[idx], ...next, attemptCreatedAt: next.attemptCreatedAt };
    } else {
      arr.push(next);
    }
    // 最近的放前面，便于前端展示
    return arr.sort((a, b) => Number(b.attemptCreatedAt) - Number(a.attemptCreatedAt));
  }

  private computeStableStatusFromWorkspace(snapshot: HeroWorkspaceSnapshot): TaskModel['status'] {
    if (!snapshot.heroImageUrl) return 'HERO_RENDERING';
    if (!snapshot.storyboardPlan) return 'AWAITING_HERO_APPROVAL';

    const hasPendingShots = (snapshot.heroShots || []).some((s) => s.status === 'PENDING');
    const hasPendingGrid = snapshot.gridStatus === 'PENDING';
    return (hasPendingShots || hasPendingGrid) ? 'SHOTS_RENDERING' : 'STORYBOARD_READY';
  }

  private async resolvePainterSystemInstruction(task: TaskModel): Promise<{
    systemInstruction: string;
    versionId?: string;
    sha256?: string;
  }> {
    const pinnedText = String(task.painterSession?.systemPromptText || '').trim();
    const pinnedVersionId = String(task.painterSession?.systemPromptVersionId || '').trim();
    const pinnedSha = String(task.painterSession?.systemPromptSha256 || '').trim();

    if (pinnedText) {
      return { systemInstruction: pinnedText, versionId: pinnedVersionId || undefined, sha256: pinnedSha || undefined };
    }

    if (pinnedVersionId) {
      const v = await this.workflowPrompts.getVersion(pinnedVersionId);
      const prompt = v?.pack?.painterSystemPrompt?.trim();
      if (prompt) {
        return { systemInstruction: prompt, versionId: v.versionId, sha256: v.sha256 };
      }
    }

    const { version } = await this.workflowPrompts.getActive();
    const prompt = version?.pack?.painterSystemPrompt?.trim();
    if (!prompt) throw new Error('workflow prompts 未发布：缺少 painterSystemPrompt');
    return { systemInstruction: prompt, versionId: version?.versionId, sha256: version?.sha256 };
  }

  private ensurePainterSession(task: TaskModel, systemMeta: { systemInstruction: string; versionId?: string; sha256?: string }): PainterSession {
    const existing = task.painterSession;
    if (existing && Array.isArray(existing.messages)) {
      // 固定 system prompt：如果已存在，就不跟随 active prompts 变化（避免漂移）
      return existing;
    }

    return {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      systemPromptVersionId: systemMeta.versionId,
      systemPromptSha256: systemMeta.sha256,
      systemPromptText: systemMeta.systemInstruction,
      messages: [],
    };
  }

  private appendSessionTurn(session: PainterSession, userText: string, modelText: string) {
    const now = Date.now();
    const u = String(userText || '').trim();
    const m = String(modelText || '').trim();
    const next: PainterSessionMessage[] = Array.isArray(session.messages) ? session.messages.slice() : [];
    if (u) next.push({ role: 'user', text: u, createdAt: now });
    if (m) next.push({ role: 'model', text: m, createdAt: now });
    session.messages = next;
    session.updatedAt = now;
  }

  private buildSessionHistoryForRequest(session: PainterSession | undefined, options?: { maxChars?: number; maxMessages?: number }) {
    const maxChars = Math.max(500, Number(options?.maxChars ?? 6000));
    const maxMessages = Math.max(2, Number(options?.maxMessages ?? 20));

    const messages = Array.isArray(session?.messages) ? session!.messages : [];
    if (messages.length === 0) return [];

    // 从尾部回溯截断：保证“会话保持”但不让 prompt 无限膨胀导致模型只回 TEXT/直接 stop。
    const picked: Array<{ role: 'user' | 'model'; text: string }> = [];
    let used = 0;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      const text = String(m?.text || '').trim();
      if (!text) continue;
      const role = m?.role === 'model' ? 'model' : 'user';
      const cost = text.length + 20;
      if (picked.length >= maxMessages) break;
      if (used + cost > maxChars && picked.length > 0) break;
      picked.push({ role, text });
      used += cost;
      if (used >= maxChars) break;
    }

    return picked.reverse();
  }

  private clonePainterSession(session: PainterSession): PainterSession {
    return {
      ...session,
      messages: Array.isArray(session.messages) ? session.messages.map((m) => ({ ...m })) : [],
    };
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

    // 生成前先校验余额：避免“先出图，后扣费失败”
    if (task.userId) {
      const estimatedCost = this.billing.creditsForSuccessfulHeroImage({ resolution: task.resolution });
      const creditCheck = await this.billing.hasEnoughCreditsForAmount(task.userId, estimatedCost);
      if (!creditCheck.enough) {
        throw new Error(`积分不足。需要 ${creditCheck.required} 积分，当前余额 ${creditCheck.balance} 积分`);
      }
    }

    const systemMeta = await this.resolvePainterSystemInstruction(task);
    const session = this.ensurePainterSession(task, systemMeta);

    const painterRuntime = await this.modelConfigResolver.resolvePainterRuntimeFromSnapshot(task.config);

    const refs = this.limitPainterRefs(task);
    const refImages: string[] = [...refs.all].filter(Boolean);

    const userText = [
      '[Mode]',
      'mode=HERO',
      '',
      '[User Requirements]',
      (task.requirements || '').trim(),
      '',
      `[Params] aspectRatio=${task.aspectRatio || '3:4'} resolution=${task.resolution || '2K'} scene=${task.scene || 'Auto'}`,
      task.location ? `location=${task.location}` : '',
      task.styleDirection ? `styleDirection=${task.styleDirection}` : '',
      '',
      '[Assets]',
      `garmentImages=${(task.garmentImagePaths || []).filter(Boolean).join(',')}`,
      task.faceRefPaths?.length ? `faceRefs=${(task.faceRefPaths || []).filter(Boolean).join(',')}` : '',
      task.styleRefPaths?.length ? `styleRefs=${(task.styleRefPaths || []).filter(Boolean).join(',')}` : '',
    ].filter(Boolean).join('\n');

    const promptForAudit = [
      '[SystemInstruction]',
      systemMeta.systemInstruction,
      '',
      '[UserText]',
      userText,
    ].filter(Boolean).join('\n');

    // 审计：先记录本次调用的提示词与参考图（即便失败也能复盘）
    const heroAttemptCreatedAt = Date.now();
    await this.db.updateTask(taskId, {
      heroHistory: [
        ...((task.heroHistory || []) as any[]),
        {
          createdAt: heroAttemptCreatedAt,
          model: painterRuntime?.painterModel,
          promptVersionId: systemMeta.versionId,
          promptSha256: systemMeta.sha256,
           promptText: promptForAudit,
           refImages,
         },
       ],
     });

    let imagePath = '';
    let shootLogText = '';
    try {
      // 扣费策略（B）：先预扣最大额度（本次 hero 固定 1 张），失败则全额退回
      const billingBaseKey = `hero:hero:${heroAttemptCreatedAt}`;
      const reserveKey = `reserve:${billingBaseKey}`;
      const settleKey = `settle:${billingBaseKey}`;
      if (task.userId) {
        const reserveAmount = this.billing.creditsForSuccessfulHeroImage({ resolution: task.resolution });
        await this.billing.reserveOnce({
          taskId,
          userId: task.userId,
          amount: reserveAmount,
          reason: '预扣：生成母本',
          eventKey: reserveKey,
        });
      }

      const r = await this.painter.generateImageWithChatSessionWithLog({
        systemInstruction: systemMeta.systemInstruction,
        history: this.buildSessionHistoryForRequest(session),
        userText,
        images: [
          ...refs.garment.map((u, idx) => ({ label: `GARMENT_${idx + 1}`, pathOrUrl: u })),
          ...refs.face.map((u, idx) => ({ label: `FACE_${idx + 1}`, pathOrUrl: u })),
          ...refs.style.map((u, idx) => ({ label: `STYLE_${idx + 1}`, pathOrUrl: u })),
        ],
        options: { aspectRatio: task.aspectRatio || '3:4', imageSize: task.resolution || '2K' },
        config: painterRuntime,
        context: { taskId, stage: 'hero' },
      });
      imagePath = r.imagePath;
      shootLogText = r.shootLogText;
      this.appendSessionTurn(session, userText, shootLogText);

      if (!this.cos.isEnabled()) {
        throw new Error('COS未配置：Hero 输出图必须上传 COS 才能进入后续流程');
      }

      const ext = path.extname(imagePath) || '.jpg';
      const key = `uploads/tasks/${taskId}/hero/${Date.now()}_${randomUUID()}${ext}`;
      await this.cos.uploadFile(key, imagePath);
      const heroUrl = this.cos.getImageUrl(key);

      const nextTaskView = {
        ...(task as any),
        heroImageUrl: heroUrl,
        heroShootLog: (shootLogText ?? '').trim(),
        status: 'AWAITING_HERO_APPROVAL' as const,
        heroSelectedAttemptCreatedAt: heroAttemptCreatedAt,
        painterSession: session,
        // 新 Hero 版本工作区从“待确认母版”开始
        heroApprovedAt: undefined,
        storyboardPlan: undefined,
        storyboardCards: undefined,
        storyboardPlannedAt: undefined,
        storyboardThinkingProcess: undefined,
        heroShots: [],
        gridImageUrl: undefined,
        gridShootLog: undefined,
        gridStatus: undefined,
      } as TaskModel;

      const nextWorkspace = this.buildHeroWorkspaceSnapshot(nextTaskView, heroAttemptCreatedAt);
      const heroWorkspaces = this.upsertHeroWorkspace(task.heroWorkspaces, nextWorkspace);

      await this.db.updateTask(taskId, {
        heroImageUrl: heroUrl,
        heroShootLog: (shootLogText ?? '').trim(),
        status: 'AWAITING_HERO_APPROVAL',
        heroSelectedAttemptCreatedAt: heroAttemptCreatedAt,
        painterSession: session,
        heroWorkspaces,
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

      // 成功结算：固定 1 张（4K=4x），预扣=实扣，通常不会发生退款/补扣
      if (task.userId) {
        const actual = this.billing.creditsForSuccessfulHeroImage({ resolution: task.resolution });
        await this.billing.settleOnce({
          taskId,
          userId: task.userId,
          reserveEventKey: reserveKey,
          settleEventKey: settleKey,
          actualAmount: actual,
          reason: '母本结算',
        });
      }

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
      // 失败结算：全额退款（如已预扣）
      try {
        if (task.userId) {
          await this.billing.settleOnce({
            taskId,
            userId: task.userId,
            reserveEventKey: `reserve:hero:hero:${heroAttemptCreatedAt}`,
            settleEventKey: `settle:hero:hero:${heroAttemptCreatedAt}`,
            actualAmount: 0,
            reason: '母本失败结算',
          });
        }
      } catch (err: any) {
        await this.billing.markBillingError(taskId, err?.message || '结算失败');
      }

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
      heroSelectedAttemptCreatedAt: undefined,
      painterSession: undefined,
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

    const heroApprovedAt = Date.now();
    await this.db.updateTask(taskId, {
      heroApprovedAt,
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
      const activeAttemptCreatedAt = this.getActiveHeroAttemptCreatedAt(task);
      const nextTaskView = {
        ...(task as any),
        heroApprovedAt,
        storyboardPlan: result.plan,
        storyboardCards: cards,
        storyboardPlannedAt: Date.now(),
        storyboardThinkingProcess: result.thinkingProcess,
        status: 'STORYBOARD_READY' as const,
        error: undefined,
      } as TaskModel;
      const heroWorkspaces = activeAttemptCreatedAt
        ? this.upsertHeroWorkspace(task.heroWorkspaces, this.buildHeroWorkspaceSnapshot(nextTaskView, activeAttemptCreatedAt))
        : task.heroWorkspaces;

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
        ...(heroWorkspaces ? { heroWorkspaces } : {}),
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
      const activeAttemptCreatedAt = this.getActiveHeroAttemptCreatedAt(task);
      const nextTaskView = {
        ...(task as any),
        storyboardPlan: result.plan,
        storyboardCards: cards,
        storyboardPlannedAt: Date.now(),
        storyboardThinkingProcess: result.thinkingProcess,
        status: 'STORYBOARD_READY' as const,
        heroShots: [],
        gridImageUrl: undefined,
        gridShootLog: undefined,
        gridStatus: undefined,
      } as TaskModel;
      const heroWorkspaces = activeAttemptCreatedAt
        ? this.upsertHeroWorkspace(task.heroWorkspaces, this.buildHeroWorkspaceSnapshot(nextTaskView, activeAttemptCreatedAt))
        : task.heroWorkspaces;

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
        ...(heroWorkspaces ? { heroWorkspaces } : {}),
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

    const existing = (task.heroShots || []).find((s) => s.index === index);
    if (existing?.status === 'PENDING') {
      throw new Error(`镜头 #${index} 正在生成中，请稍后再试`);
    }

    // 连续性护栏：如果后续镜头已生成成功，不允许回头重生成前面的镜头（否则时间线会断裂）
    const laterHasAnyImage = (task.heroShots || []).some((s) => {
      if (s.index <= index) return false;
      if (s.imageUrl) return true;
      return (s.attempts || []).some((a) => !!a.outputImageUrl);
    });
    if (laterHasAnyImage) {
      throw new Error(`镜头 #${index} 不能再次生成：后续镜头已生成。为保证连续性，请从最后一个镜头继续`);
    }

    // 生成前先校验余额：避免“先出图，后扣费失败”
    if (task.userId) {
      const estimatedCost = this.billing.creditsForSuccessfulHeroImage({ resolution: task.resolution });
      const creditCheck = await this.billing.hasEnoughCreditsForAmount(task.userId, estimatedCost);
      if (!creditCheck.enough) {
        throw new Error(`积分不足。需要 ${creditCheck.required} 积分，当前余额 ${creditCheck.balance} 积分`);
      }
    }

    const systemMeta = await this.resolvePainterSystemInstruction(task);
    const session = this.ensurePainterSession(task, systemMeta);

    const painterRuntime = await this.modelConfigResolver.resolvePainterRuntimeFromSnapshot(task.config);

    const refs = this.limitPainterRefs(task);
    const prevShot = (task.heroShots || []).find((s) => s.index === index - 1);
    const prevShotUrl = this.getSelectedOrLatestShotImageUrl(prevShot);
    if (index > 1 && !prevShotUrl) {
      throw new Error(`镜头 #${index} 需要先生成镜头 #${index - 1}`);
    }

    const refImages: string[] = [
      task.heroImageUrl!,
      prevShotUrl,
      ...refs.all,
    ].filter(Boolean) as string[];

    const shot = task.storyboardPlan?.shots?.[index - 1];
    if (!shot) throw new Error(`镜头规划不存在: ${index}`);

    const userText = [
      '[Mode]',
      'mode=SHOT',
      `index=${index}`,
      '',
      `[Params] aspectRatio=${task.aspectRatio || '3:4'} resolution=${task.resolution || '2K'} scene=${task.scene || 'Auto'}`,
      task.location ? `location=${task.location}` : '',
      task.styleDirection ? `styleDirection=${task.styleDirection}` : '',
      task.garmentFocus ? `garmentFocus=${task.garmentFocus}` : '',
      '',
      '[Anchor URLs]',
      `currentHeroUrl=${task.heroImageUrl}`,
      prevShotUrl ? `prevShotUrl=${prevShotUrl}` : '',
      '',
      '[Planner Shot JSON]',
      JSON.stringify(shot, null, 2),
      '',
      '[User Requirements]',
      (task.requirements || '').trim(),
      '',
      '[Hard Output Requirement]',
      // 经验：某些网关/模型会只回 TEXT；这里强制 IMAGE 必须输出（如有 TEXT 也要同时输出 IMAGE）。
      'Return IMAGE (mandatory). If you output any TEXT, keep it brief and still output IMAGE.',
    ].filter(Boolean).join('\n');

    const promptForAudit = [
      '[SystemInstruction]',
      systemMeta.systemInstruction,
      '',
      '[UserText]',
      userText,
    ].filter(Boolean).join('\n');

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
            promptVersionId: systemMeta.versionId,
            promptSha256: systemMeta.sha256,
            promptText: promptForAudit,
            refImages,
          },
        ];
        return { ...s, attempts };
      }),
    });

    // 扣费策略（B）：先预扣最大额度（单镜头固定 1 张），失败则全额退回
    const billingBaseKey = `hero:shot:${index}:${attemptCreatedAt}`;
    const reserveKey = `reserve:${billingBaseKey}`;
    const settleKey = `settle:${billingBaseKey}`;
    if (task.userId) {
      const reserveAmount = this.billing.creditsForSuccessfulHeroImage({ resolution: task.resolution });
      await this.billing.reserveOnce({
        taskId,
        userId: task.userId,
        amount: reserveAmount,
        reason: `预扣：生成镜头 #${index}`,
        eventKey: reserveKey,
      });
    }

    let imagePath = '';
    let shootLogText = '';
    try {
      const r = await this.painter.generateImageWithChatSessionWithLog({
        systemInstruction: systemMeta.systemInstruction,
        history: this.buildSessionHistoryForRequest(session),
        userText,
        images: [
          { label: 'HERO', pathOrUrl: task.heroImageUrl! },
          ...(prevShotUrl ? [{ label: `PREV_SHOT_${index - 1}`, pathOrUrl: prevShotUrl }] : []),
          ...refs.garment.map((u, idx) => ({ label: `GARMENT_${idx + 1}`, pathOrUrl: u })),
          ...refs.face.map((u, idx) => ({ label: `FACE_${idx + 1}`, pathOrUrl: u })),
          ...refs.style.map((u, idx) => ({ label: `STYLE_${idx + 1}`, pathOrUrl: u })),
        ],
        options: { aspectRatio: task.aspectRatio || '3:4', imageSize: task.resolution || '2K' },
        config: painterRuntime,
        context: { taskId, stage: `shot_${index}` },
      });
      imagePath = r.imagePath;
      shootLogText = r.shootLogText;
      this.appendSessionTurn(session, userText, shootLogText);
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
      const nextStatus = this.recomputeRenderStatus({ ...latestFail, heroShots: updatedShots } as TaskModel);
      const activeAttemptCreatedAt = this.getActiveHeroAttemptCreatedAt(latestFail);
      const nextTaskView = {
        ...(latestFail as any),
        heroShots: updatedShots,
        status: nextStatus,
      } as TaskModel;
      const heroWorkspaces = activeAttemptCreatedAt
        ? this.upsertHeroWorkspace(latestFail.heroWorkspaces, this.buildHeroWorkspaceSnapshot(nextTaskView, activeAttemptCreatedAt))
        : latestFail.heroWorkspaces;

      await this.db.updateTask(taskId, {
        heroShots: updatedShots,
        status: nextStatus,
        ...(heroWorkspaces ? { heroWorkspaces } : {}),
      });

      // 失败结算：全额退款（如已预扣）
      try {
        if (task.userId) {
          await this.billing.settleOnce({
            taskId,
            userId: task.userId,
            reserveEventKey: reserveKey,
            settleEventKey: settleKey,
            actualAmount: 0,
            reason: `镜头 #${index} 失败结算`,
          });
        }
      } catch (err: any) {
        await this.billing.markBillingError(taskId, err?.message || '结算失败');
      }

      throw e;
    }

    if (!this.cos.isEnabled()) {
      throw new Error('COS未配置：Shot 输出图必须上传 COS');
    }

    let imageUrl = '';
    try {
      const ext = path.extname(imagePath) || '.jpg';
      const key = `uploads/tasks/${taskId}/shots/${index}/${Date.now()}_${randomUUID()}${ext}`;
      await this.cos.uploadFile(key, imagePath);
      imageUrl = this.cos.getImageUrl(key);
    } catch (e: any) {
      // 上传失败也应退款
      try {
        if (task.userId) {
          await this.billing.settleOnce({
            taskId,
            userId: task.userId,
            reserveEventKey: reserveKey,
            settleEventKey: settleKey,
            actualAmount: 0,
            reason: `镜头 #${index} 上传失败结算`,
          });
        }
      } catch (err: any) {
        await this.billing.markBillingError(taskId, err?.message || '结算失败');
      }
      throw e;
    }

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

    const activeAttemptCreatedAt = this.getActiveHeroAttemptCreatedAt(latest);
    const nextStatus = this.recomputeRenderStatus({ ...latest, heroShots: finalShots } as TaskModel);
    const nextTaskView = {
      ...(latest as any),
      heroShots: finalShots,
      status: nextStatus,
      painterSession: session,
    } as TaskModel;
    const heroWorkspaces = activeAttemptCreatedAt
      ? this.upsertHeroWorkspace(latest.heroWorkspaces, this.buildHeroWorkspaceSnapshot(nextTaskView, activeAttemptCreatedAt))
      : latest.heroWorkspaces;

    await this.db.updateTask(taskId, {
      heroShots: finalShots,
      status: nextStatus,
      painterSession: session,
      ...(heroWorkspaces ? { heroWorkspaces } : {}),
    });

    // 成功结算：固定 1 张（4K=4x），预扣=实扣
    if (task.userId) {
      try {
        const actual = this.billing.creditsForSuccessfulHeroImage({ resolution: task.resolution });
        await this.billing.settleOnce({
          taskId,
          userId: task.userId,
          reserveEventKey: reserveKey,
          settleEventKey: settleKey,
          actualAmount: actual,
          reason: `镜头 #${index} 结算`,
        });
      } catch (err: any) {
        this.logger.error(`Billing failed for task ${taskId} (shot ${index})`, err);
        await this.billing.markBillingError(taskId, err?.message || '结算失败');
      }
    }

    return this.db.getTask(taskId);
  }

  async renderGrid(taskId: string) {
    const task = await this.getTaskOrThrow(taskId);
    if ((task.workflow || 'legacy') !== 'hero_storyboard') {
      throw new Error(`Task ${taskId} workflow is not hero_storyboard`);
    }
    this.ensureStoryboardReady(task);

    // 生成前先校验余额：避免“先出图，后扣费失败”
    if (task.userId) {
      const estimatedCost = this.billing.creditsForSuccessfulHeroGrid({ resolution: task.resolution });
      const creditCheck = await this.billing.hasEnoughCreditsForAmount(task.userId, estimatedCost);
      if (!creditCheck.enough) {
        throw new Error(`积分不足。需要 ${creditCheck.required} 积分，当前余额 ${creditCheck.balance} 积分`);
      }
    }

    const shots = (task.storyboardPlan?.shots || []).slice(0, 4);
    if (shots.length !== 4) {
      throw new Error('四镜头拼图只支持 4 张动作卡（shot_count=4）');
    }

    const systemMeta = await this.resolvePainterSystemInstruction(task);
    const session = this.ensurePainterSession(task, systemMeta);

    const painterRuntime = await this.modelConfigResolver.resolvePainterRuntimeFromSnapshot(task.config);

    const refs = this.limitPainterRefs(task);
    const refImages: string[] = [
      task.heroImageUrl!,
      ...refs.all,
    ].filter(Boolean) as string[];

    const userText = [
      '[Mode]',
      'mode=GRID',
      '',
      `[Params] aspectRatio=${task.aspectRatio || '3:4'} resolution=${task.resolution || '2K'} scene=${task.scene || 'Auto'}`,
      task.location ? `location=${task.location}` : '',
      task.styleDirection ? `styleDirection=${task.styleDirection}` : '',
      task.garmentFocus ? `garmentFocus=${task.garmentFocus}` : '',
      '',
      '[Anchor URLs]',
      `currentHeroUrl=${task.heroImageUrl}`,
      '',
      '[Planner Shots JSON]',
      JSON.stringify(shots, null, 2),
      '',
      '[User Requirements]',
      (task.requirements || '').trim(),
      '',
      '[Hard Output Requirement]',
      'Return IMAGE only. Do not output any TEXT.',
    ].filter(Boolean).join('\n');

    const promptForAudit = [
      '[SystemInstruction]',
      systemMeta.systemInstruction,
      '',
      '[UserText]',
      userText,
    ].filter(Boolean).join('\n');

    const gridAttemptCreatedAt = Date.now();
    const billingBaseKey = `hero:grid:${gridAttemptCreatedAt}`;
    const reserveKey = `reserve:${billingBaseKey}`;
    const settleKey = `settle:${billingBaseKey}`;

    // 扣费策略（B）：先预扣最大额度（拼图固定 2 张），失败则全额退回
    if (task.userId) {
      const reserveAmount = this.billing.creditsForSuccessfulHeroGrid({ resolution: task.resolution });
      await this.billing.reserveOnce({
        taskId,
        userId: task.userId,
        amount: reserveAmount,
        reason: '预扣：生成拼图（分镜）',
        eventKey: reserveKey,
      });
    }

    await this.db.updateTask(taskId, {
      status: 'SHOTS_RENDERING',
      gridStatus: 'PENDING',
      gridHistory: [
        ...((task.gridHistory || []) as any[]),
        {
          createdAt: gridAttemptCreatedAt,
          model: painterRuntime?.painterModel,
          promptVersionId: systemMeta.versionId,
          promptSha256: systemMeta.sha256,
          promptText: promptForAudit,
          refImages,
        },
      ],
    });

    let imagePath = '';
    let shootLogText = '';
    try {
      const r = await this.painter.generateImageWithChatSessionWithLog({
        systemInstruction: systemMeta.systemInstruction,
        // GRID 更偏“纯渲染输出”，不需要把历史手账喂给模型；避免模型继续只输出 TEXT。
        history: [],
        userText,
        images: [
          { label: 'HERO', pathOrUrl: task.heroImageUrl! },
          ...refs.garment.map((u, idx) => ({ label: `GARMENT_${idx + 1}`, pathOrUrl: u })),
          ...refs.face.map((u, idx) => ({ label: `FACE_${idx + 1}`, pathOrUrl: u })),
          ...refs.style.map((u, idx) => ({ label: `STYLE_${idx + 1}`, pathOrUrl: u })),
        ],
        options: {
          aspectRatio: task.aspectRatio || '3:4',
          imageSize: task.resolution || '2K',
          responseModalities: ['IMAGE'],
        },
        config: painterRuntime,
        context: { taskId, stage: 'grid' },
      });
      imagePath = r.imagePath;
      shootLogText = r.shootLogText;
      // 该调用强制 IMAGE-only，通常不会返回可用的 shootLogText；会话里只记录最小摘要，避免膨胀与干扰后续生成。
      this.appendSessionTurn(session, `mode=GRID aspectRatio=${task.aspectRatio || '3:4'} resolution=${task.resolution || '2K'}`, '');
    } catch (e: any) {
      const latestFail = await this.getTaskOrThrow(taskId);
      const nextStatus = this.recomputeRenderStatus({ ...latestFail, gridStatus: 'FAILED' } as TaskModel);
      const activeAttemptCreatedAt = this.getActiveHeroAttemptCreatedAt(latestFail);
      const nextTaskView = {
        ...(latestFail as any),
        gridStatus: 'FAILED' as const,
        status: nextStatus,
      } as TaskModel;
      const heroWorkspaces = activeAttemptCreatedAt
        ? this.upsertHeroWorkspace(latestFail.heroWorkspaces, this.buildHeroWorkspaceSnapshot(nextTaskView, activeAttemptCreatedAt))
        : latestFail.heroWorkspaces;

      await this.db.updateTask(taskId, {
        gridStatus: 'FAILED',
        status: nextStatus,
        ...(heroWorkspaces ? { heroWorkspaces } : {}),
        gridHistory: (latestFail.gridHistory || []).map((h) => {
          if (h.createdAt !== gridAttemptCreatedAt) return h;
          return { ...h, error: e?.message || 'Grid rendering failed' };
        }),
      });

      // 失败结算：全额退款（如已预扣）
      try {
        if (task.userId) {
          await this.billing.settleOnce({
            taskId,
            userId: task.userId,
            reserveEventKey: reserveKey,
            settleEventKey: settleKey,
            actualAmount: 0,
            reason: '拼图失败结算',
          });
        }
      } catch (err: any) {
        await this.billing.markBillingError(taskId, err?.message || '结算失败');
      }
      throw e;
    }

    if (!this.cos.isEnabled()) {
      throw new Error('COS未配置：Grid 输出图必须上传 COS');
    }

    let gridUrl = '';
    try {
      const ext = path.extname(imagePath) || '.jpg';
      const key = `uploads/tasks/${taskId}/grid/${Date.now()}_${randomUUID()}${ext}`;
      await this.cos.uploadFile(key, imagePath);
      gridUrl = this.cos.getImageUrl(key);
    } catch (e: any) {
      // 上传失败也应退款
      try {
        if (task.userId) {
          await this.billing.settleOnce({
            taskId,
            userId: task.userId,
            reserveEventKey: reserveKey,
            settleEventKey: settleKey,
            actualAmount: 0,
            reason: '拼图上传失败结算',
          });
        }
      } catch (err: any) {
        await this.billing.markBillingError(taskId, err?.message || '结算失败');
      }
      throw e;
    }

    const latest = await this.getTaskOrThrow(taskId);
    const activeAttemptCreatedAt = this.getActiveHeroAttemptCreatedAt(latest);
    const nextTaskView = {
      ...(latest as any),
      gridStatus: 'RENDERED' as const,
      gridImageUrl: gridUrl,
      gridShootLog: (shootLogText ?? '').trim(),
      painterSession: session,
      status: this.recomputeRenderStatus({ ...latest, gridStatus: 'RENDERED' } as TaskModel),
    } as TaskModel;
    const heroWorkspaces = activeAttemptCreatedAt
      ? this.upsertHeroWorkspace(latest.heroWorkspaces, this.buildHeroWorkspaceSnapshot(nextTaskView, activeAttemptCreatedAt))
      : latest.heroWorkspaces;

    await this.db.updateTask(taskId, {
      gridStatus: 'RENDERED',
      gridImageUrl: gridUrl,
      gridShootLog: (shootLogText ?? '').trim(),
      status: this.recomputeRenderStatus({ ...latest, gridStatus: 'RENDERED' } as TaskModel),
      painterSession: session,
      ...(heroWorkspaces ? { heroWorkspaces } : {}),
      gridHistory: (latest.gridHistory || []).map((h) => {
        if (h.createdAt !== gridAttemptCreatedAt) return h;
        return {
          ...h,
          outputImageUrl: gridUrl,
          outputShootLog: (shootLogText ?? '').trim(),
        };
      }),
    });

    // 成功结算：固定 2 张（4K=4x），预扣=实扣
    if (task.userId) {
      try {
        const actual = this.billing.creditsForSuccessfulHeroGrid({ resolution: task.resolution });
        await this.billing.settleOnce({
          taskId,
          userId: task.userId,
          reserveEventKey: reserveKey,
          settleEventKey: settleKey,
          actualAmount: actual,
          reason: '拼图结算',
        });
      } catch (err: any) {
        this.logger.error(`Billing failed for task ${taskId} (grid)`, err);
        await this.billing.markBillingError(taskId, err?.message || '结算失败');
      }
    }

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

    const nextStatus = this.recomputeRenderStatus({ ...task, heroShots: nextShots } as TaskModel);
    const activeAttemptCreatedAt = this.getActiveHeroAttemptCreatedAt(task);
    const nextTaskView = {
      ...(task as any),
      heroShots: nextShots,
      status: nextStatus,
    } as TaskModel;
    const heroWorkspaces = activeAttemptCreatedAt
      ? this.upsertHeroWorkspace(task.heroWorkspaces, this.buildHeroWorkspaceSnapshot(nextTaskView, activeAttemptCreatedAt))
      : task.heroWorkspaces;

    await this.db.updateTask(taskId, {
      heroShots: nextShots,
      status: nextStatus,
      ...(heroWorkspaces ? { heroWorkspaces } : {}),
    });

    return this.db.getTask(taskId);
  }

  async updateHeroShootLog(taskId: string, shootLogText: string) {
    const task = await this.getTaskOrThrow(taskId);
    if ((task.workflow || 'legacy') !== 'hero_storyboard') {
      throw new Error(`Task ${taskId} workflow is not hero_storyboard`);
    }

    const next = this.sanitizeUserShootLogText(shootLogText);
    const activeAttemptCreatedAt = this.getActiveHeroAttemptCreatedAt(task);
    const nextTaskView = { ...(task as any), heroShootLog: next } as TaskModel;
    const heroWorkspaces = activeAttemptCreatedAt
      ? this.upsertHeroWorkspace(task.heroWorkspaces, this.buildHeroWorkspaceSnapshot(nextTaskView, activeAttemptCreatedAt))
      : task.heroWorkspaces;

    await this.db.updateTask(taskId, { heroShootLog: next, ...(heroWorkspaces ? { heroWorkspaces } : {}) });
    return this.db.getTask(taskId);
  }

  async updateGridShootLog(taskId: string, shootLogText: string) {
    const task = await this.getTaskOrThrow(taskId);
    if ((task.workflow || 'legacy') !== 'hero_storyboard') {
      throw new Error(`Task ${taskId} workflow is not hero_storyboard`);
    }

    const next = this.sanitizeUserShootLogText(shootLogText);
    const activeAttemptCreatedAt = this.getActiveHeroAttemptCreatedAt(task);
    const nextTaskView = { ...(task as any), gridShootLog: next } as TaskModel;
    const heroWorkspaces = activeAttemptCreatedAt
      ? this.upsertHeroWorkspace(task.heroWorkspaces, this.buildHeroWorkspaceSnapshot(nextTaskView, activeAttemptCreatedAt))
      : task.heroWorkspaces;

    await this.db.updateTask(taskId, { gridShootLog: next, ...(heroWorkspaces ? { heroWorkspaces } : {}) });
    return this.db.getTask(taskId);
  }

  async updateShotShootLog(taskId: string, index: number, shootLogText: string) {
    const task = await this.getTaskOrThrow(taskId);
    if ((task.workflow || 'legacy') !== 'hero_storyboard') {
      throw new Error(`Task ${taskId} workflow is not hero_storyboard`);
    }

    const next = this.sanitizeUserShootLogText(shootLogText);
    const shots: HeroShotOutput[] = (task.heroShots || []).map((s) => {
      if (s.index !== index) return s;

      const selectedAttemptCreatedAt = s.selectedAttemptCreatedAt;
      const attempts = (s.attempts || []).map((a) => {
        if (selectedAttemptCreatedAt && a.createdAt === selectedAttemptCreatedAt) {
          return { ...a, outputShootLog: next };
        }
        if (!selectedAttemptCreatedAt && s.imageUrl && a.outputImageUrl && a.outputImageUrl === s.imageUrl) {
          return { ...a, outputShootLog: next };
        }
        return a;
      });

      return { ...s, shootLog: next, attempts };
    }).sort((a, b) => a.index - b.index);

    const activeAttemptCreatedAt = this.getActiveHeroAttemptCreatedAt(task);
    const nextTaskView = { ...(task as any), heroShots: shots } as TaskModel;
    const heroWorkspaces = activeAttemptCreatedAt
      ? this.upsertHeroWorkspace(task.heroWorkspaces, this.buildHeroWorkspaceSnapshot(nextTaskView, activeAttemptCreatedAt))
      : task.heroWorkspaces;

    await this.db.updateTask(taskId, { heroShots: shots, ...(heroWorkspaces ? { heroWorkspaces } : {}) });
    return this.db.getTask(taskId);
  }

  async editHero(taskId: string, edit: { maskImage: string; referenceImages?: string[]; prompt: string; editMode?: string }) {
    const task = await this.getTaskOrThrow(taskId);
    if ((task.workflow || 'legacy') !== 'hero_storyboard') {
      throw new Error(`Task ${taskId} workflow is not hero_storyboard`);
    }
    if (!task.heroImageUrl) {
      throw new Error('Hero 尚未生成完成');
    }

    // 生成中不允许编辑，避免并发写导致“工作区错乱”
    if (task.status === 'HERO_RENDERING' || task.status === 'STORYBOARD_PLANNING' || task.status === 'SHOTS_RENDERING') {
      throw new Error(`任务当前状态不允许编辑母版：${task.status}（生成中，请稍后再试）`);
    }

    const systemMeta = await this.resolvePainterSystemInstruction(task);
    const baseSession = this.ensurePainterSession(task, systemMeta);
    const nextSession = this.clonePainterSession(baseSession);

    const painterRuntime = await this.modelConfigResolver.resolvePainterRuntimeFromSnapshot(task.config);

    const safeRefs = Array.isArray(edit.referenceImages) ? edit.referenceImages : [];
    const referenceImages = safeRefs
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean)
      .slice(0, this.maxHeroEditReferenceImages);

    const userText = [
      '[Mode]',
      'mode=HERO_EDIT_INPAINT',
      '',
      '[Constraints]',
      '- Only modify the masked (white) region.',
      '- Keep unmasked region IDENTICAL (identity, wardrobe, lighting, composition, background).',
      '- Do not introduce unrelated changes unless explicitly requested.',
      '',
      '[Anchor URLs]',
      `baseHeroUrl=${task.heroImageUrl}`,
      `maskUrl=${String(edit.maskImage || '').trim()}`,
      referenceImages.length ? `referenceUrls=${referenceImages.join(',')}` : '',
      '',
      '[User Edit Instruction]',
      String(edit.prompt || '').trim(),
      '',
      '[User Requirements]',
      (task.requirements || '').trim(),
      '',
      `[Params] aspectRatio=${task.aspectRatio || '3:4'} resolution=${task.resolution || '2K'} scene=${task.scene || 'Auto'}`,
    ].map((v) => String(v).trimEnd()).filter((v) => v.length > 0).join('\n');

    const promptForAudit = [
      '[SystemInstruction]',
      systemMeta.systemInstruction,
      '',
      '[UserText]',
      userText,
    ].filter(Boolean).join('\n');

    // 审计：先记录本次调用（即便失败也能复盘）
    const attemptCreatedAt = Date.now();
    const refImages = [task.heroImageUrl, edit.maskImage, ...referenceImages].filter(Boolean);
    await this.db.updateTask(taskId, {
      heroHistory: [
        ...((task.heroHistory || []) as any[]),
        {
          createdAt: attemptCreatedAt,
          model: painterRuntime?.painterModel,
          promptVersionId: systemMeta.versionId,
          promptSha256: systemMeta.sha256,
          promptText: promptForAudit,
          refImages,
        },
      ],
    });

    let imagePath = '';
    let shootLogText = '';
    try {
      // 扣费策略（B）：先预扣 1 张，失败则全额退回
      const billingBaseKey = `hero:edit:${attemptCreatedAt}`;
      const reserveKey = `reserve:${billingBaseKey}`;
      const settleKey = `settle:${billingBaseKey}`;
      if (task.userId) {
        const reserveAmount = this.billing.creditsForSuccessfulHeroImage({ resolution: task.resolution });
        await this.billing.reserveOnce({
          taskId,
          userId: task.userId,
          amount: reserveAmount,
          reason: '预扣：编辑母版',
          eventKey: reserveKey,
        });
      }

      const r = await this.painter.generateImageWithChatSessionWithLog({
        systemInstruction: systemMeta.systemInstruction,
        history: this.buildSessionHistoryForRequest(baseSession),
        userText,
        images: [
          { label: 'BASE_HERO', pathOrUrl: task.heroImageUrl!, allowCi: false },
          { label: 'MASK', pathOrUrl: String(edit.maskImage || '').trim(), allowCi: false },
          ...referenceImages.map((u, idx) => ({ label: `REF_${idx + 1}`, pathOrUrl: u })),
        ],
        options: {
          aspectRatio: task.aspectRatio || '3:4',
          imageSize: task.resolution || '2K',
          editMode: edit.editMode || 'EDIT_MODE_INPAINT',
        },
        config: painterRuntime,
        context: { taskId, stage: 'hero_edit' },
      });
      imagePath = r.imagePath;
      shootLogText = r.shootLogText;
      this.appendSessionTurn(nextSession, userText, shootLogText);

      if (!this.cos.isEnabled()) {
        throw new Error('COS未配置：Hero 输出图必须上传 COS 才能进入后续流程');
      }

      const ext = path.extname(imagePath) || '.jpg';
      const key = `uploads/tasks/${taskId}/hero/edits/${attemptCreatedAt}_${randomUUID()}${ext}`;
      await this.cos.uploadFile(key, imagePath);
      const heroUrl = this.cos.getImageUrl(key);

      // 旧工作区快照：用于 AB 切回去（切换时整套切换）
      const prevAttemptCreatedAt = this.getActiveHeroAttemptCreatedAt(task);
      let heroWorkspaces = task.heroWorkspaces;
      if (prevAttemptCreatedAt) {
        const prevSnapshot = this.buildHeroWorkspaceSnapshot({ ...(task as any), painterSession: baseSession } as TaskModel, prevAttemptCreatedAt);
        heroWorkspaces = this.upsertHeroWorkspace(heroWorkspaces, prevSnapshot);
      }

      // 新工作区（2.b）：编辑成功后回到“待确认母版”，后续（分镜/镜头/拼图）在新工作区重新生成
      const nextTaskView = {
        ...(task as any),
        heroImageUrl: heroUrl,
        heroShootLog: (shootLogText ?? '').trim(),
        status: 'AWAITING_HERO_APPROVAL' as const,
        heroApprovedAt: undefined,
        heroSelectedAttemptCreatedAt: attemptCreatedAt,
        painterSession: nextSession,
        storyboardPlan: undefined,
        storyboardCards: undefined,
        storyboardPlannedAt: undefined,
        storyboardThinkingProcess: undefined,
        heroShots: [],
        gridImageUrl: undefined,
        gridShootLog: undefined,
        gridStatus: undefined,
      } as TaskModel;

      const nextWorkspace = this.buildHeroWorkspaceSnapshot(nextTaskView, attemptCreatedAt);
      heroWorkspaces = this.upsertHeroWorkspace(heroWorkspaces, nextWorkspace);

      await this.db.updateTask(taskId, {
        heroImageUrl: heroUrl,
        heroShootLog: (shootLogText ?? '').trim(),
        status: 'AWAITING_HERO_APPROVAL',
        heroApprovedAt: undefined,
        heroSelectedAttemptCreatedAt: attemptCreatedAt,
        painterSession: nextSession,
        heroWorkspaces,
        storyboardPlan: undefined,
        storyboardCards: undefined,
        storyboardPlannedAt: undefined,
        storyboardThinkingProcess: undefined,
        heroShots: [],
        gridImageUrl: undefined,
        gridShootLog: undefined,
        gridStatus: undefined,
      });

      if (task.userId) {
        const actual = this.billing.creditsForSuccessfulHeroImage({ resolution: task.resolution });
        await this.billing.settleOnce({
          taskId,
          userId: task.userId,
          reserveEventKey: reserveKey,
          settleEventKey: settleKey,
          actualAmount: actual,
          reason: '编辑母版结算',
        });
      }

      // 审计：补全本次 attempt 的产物
      const latest = await this.db.getTask(taskId);
      const heroHistory = (latest?.heroHistory || []).map((h) => {
        if (h.createdAt !== attemptCreatedAt) return h;
        return {
          ...h,
          outputImageUrl: heroUrl,
          outputShootLog: (shootLogText ?? '').trim(),
        };
      });
      await this.db.updateTask(taskId, { heroHistory });
    } catch (e: any) {
      const latestFail = await this.db.getTask(taskId);
      // 失败结算：全额退款（如已预扣）
      try {
        if (task.userId) {
          await this.billing.settleOnce({
            taskId,
            userId: task.userId,
            reserveEventKey: `reserve:hero:edit:${attemptCreatedAt}`,
            settleEventKey: `settle:hero:edit:${attemptCreatedAt}`,
            actualAmount: 0,
            reason: '编辑母版失败结算',
          });
        }
      } catch (err: any) {
        await this.billing.markBillingError(taskId, err?.message || '结算失败');
      }

      const heroHistory = (latestFail?.heroHistory || []).map((h) => {
        if (h.createdAt !== attemptCreatedAt) return h;
        return { ...h, error: e?.message || 'Hero editing failed' };
      });
      await this.db.updateTask(taskId, { heroHistory });
      throw e;
    }

    return this.db.getTask(taskId);
  }

  async selectHeroVariant(taskId: string, attemptCreatedAt: number) {
    const task = await this.getTaskOrThrow(taskId);
    if ((task.workflow || 'legacy') !== 'hero_storyboard') {
      throw new Error(`Task ${taskId} workflow is not hero_storyboard`);
    }
    if (!task.heroHistory || task.heroHistory.length === 0) {
      throw new Error('该任务没有母版历史版本');
    }

    // 生成中不允许切换，避免并发写导致“工作区错乱”
    if (task.status === 'HERO_RENDERING' || task.status === 'STORYBOARD_PLANNING' || task.status === 'SHOTS_RENDERING') {
      throw new Error(`任务当前状态不允许切换母版版本：${task.status}（生成中，请稍后再试）`);
    }

    const target = task.heroHistory.find((h) => Number(h?.createdAt) === attemptCreatedAt);
    if (!target?.outputImageUrl) {
      throw new Error('该版本尚未生成完成（缺少 outputImageUrl）');
    }

    const existingWorkspace = (task.heroWorkspaces || []).find((w) => Number(w?.attemptCreatedAt) === Number(attemptCreatedAt));
    const fallbackWorkspace: HeroWorkspaceSnapshot = existingWorkspace || {
      attemptCreatedAt,
      updatedAt: Date.now(),
      heroImageUrl: String(target.outputImageUrl).trim(),
      heroShootLog: (target.outputShootLog ?? '').trim() || task.heroShootLog,
      heroApprovedAt: undefined,
      storyboardPlan: undefined,
      storyboardCards: undefined,
      storyboardPlannedAt: undefined,
      storyboardThinkingProcess: undefined,
      storyboardHistory: undefined,
      heroShots: [],
      gridImageUrl: undefined,
      gridShootLog: undefined,
      gridStatus: undefined,
      painterSession: existingWorkspace?.painterSession,
    };

    const status = this.computeStableStatusFromWorkspace(fallbackWorkspace);
    const heroWorkspaces = existingWorkspace
      ? task.heroWorkspaces
      : this.upsertHeroWorkspace(task.heroWorkspaces, fallbackWorkspace);

    await this.db.updateTask(taskId, {
      heroImageUrl: fallbackWorkspace.heroImageUrl,
      heroShootLog: (fallbackWorkspace.heroShootLog ?? '').trim() || undefined,
      heroApprovedAt: fallbackWorkspace.heroApprovedAt,
      heroSelectedAttemptCreatedAt: attemptCreatedAt,
      painterSession: fallbackWorkspace.painterSession,
      heroWorkspaces,
      storyboardPlan: fallbackWorkspace.storyboardPlan,
      storyboardCards: fallbackWorkspace.storyboardCards,
      storyboardPlannedAt: fallbackWorkspace.storyboardPlannedAt,
      storyboardThinkingProcess: fallbackWorkspace.storyboardThinkingProcess,
      storyboardHistory: fallbackWorkspace.storyboardHistory as any,
      heroShots: fallbackWorkspace.heroShots,
      gridImageUrl: fallbackWorkspace.gridImageUrl,
      gridShootLog: fallbackWorkspace.gridShootLog,
      gridStatus: fallbackWorkspace.gridStatus,
      status,
    });

    return this.db.getTask(taskId);
  }

  async getTaskOrThrow(taskId: string): Promise<TaskModel> {
    const task = await this.db.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    return task;
  }
}
