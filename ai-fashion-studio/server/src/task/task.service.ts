
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BrainService } from '../brain/brain.service';
import { PainterService } from '../painter/painter.service';
import { DbService } from '../db/db.service';
import { TaskModel, UserModel } from '../db/models';
import { ModelConfig } from '../common/model-config';
import { CreateTaskDto } from './dto/create-task.dto';
import { ModelConfigResolverService } from '../model-profile/model-config-resolver.service';
import { HeroStoryboardService } from './hero-storyboard.service';
import { TaskBillingService } from './task-billing.service';
import * as crypto from 'crypto';
import * as path from 'path';
import { CosService } from '../cos/cos.service';
import { PrismaService } from '../prisma/prisma.service';
import { DirectPromptService } from '../direct-prompt/direct-prompt.service';

const MAX_TOTAL_IMAGES = 14;

@Injectable()
export class TaskService {
  private logger = new Logger(TaskService.name);
  private readonly maxPainterGarmentRefs = 5;
  private readonly maxPainterFaceRefs = 2;
  private readonly maxConcurrentLegacyPerUser = (() => {
    const raw = parseInt(process.env.MAX_CONCURRENT_LEGACY_TASKS_PER_USER || '3', 10);
    const n = Number.isFinite(raw) ? raw : 3;
    return Math.max(1, Math.min(3, n));
  })();

  constructor(
    private db: DbService,
    private brain: BrainService,
    private painter: PainterService,
    private readonly modelConfigResolver: ModelConfigResolverService,
    private readonly heroStoryboard: HeroStoryboardService,
    private readonly billing: TaskBillingService,
    private readonly prisma: PrismaService,
    private readonly cos: CosService,
    private readonly directPrompt: DirectPromptService,
  ) { }

  private stripSecretsFromConfig(config: ModelConfig | undefined): ModelConfig {
    if (!config) return {};
    const {
      apiKey: _apiKey,
      brainKey: _brainKey,
      painterKey: _painterKey,
      brainKeys: _brainKeys,
      painterKeys: _painterKeys,
      ...rest
    } = config;
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

  private requireOwnerOrAdminForPreset(preset: any, user: UserModel, kindLabel: string) {
    if (!preset) throw new BadRequestException('Preset not found');

    // 兼容旧数据：未标记 userId 的预设只允许管理员访问，避免“历史数据全员可见”
    const ownerId = String((preset as any).userId || '').trim();
    if (!ownerId) {
      if (!user || user.role !== 'ADMIN') {
        throw new BadRequestException(`该${kindLabel}预设为历史数据，仅管理员可用`);
      }
      return;
    }

    if (user.role === 'ADMIN') return;
    if (ownerId !== user.id) {
      throw new BadRequestException(`无权访问该${kindLabel}预设`);
    }
  }

  private async buildDirectSystemInstruction(): Promise<string> {
    const fromAdmin = await this.directPrompt.getActiveSystemPromptText();
    const v = String(fromAdmin || '').trim();
    if (v) return v;

    // Fallback: keep a minimal safe default even if prompt store is empty.
    return [
      'You are a professional fashion photography generator.',
      'Your top priority is fidelity to the garment reference images and face identity reference images.',
      'Garment color fidelity is STRICT: preserve true garment hue/saturation/value (midtones). Do not recolor the garment with global grading or colored lighting.',
      'Garment fit fidelity is STRICT: preserve original silhouette and looseness (e.g., oversized/drop-shoulder). Do not tailor or change proportions.',
      'If style lighting/grading conflicts with garment color accuracy, garment color wins. Apply strong style effects mainly to the background.',
      'If there is any conflict between style/pose and garment/face fidelity, ALWAYS prioritize garment/face fidelity.',
      'Output must be an IMAGE only. No extra text.',
    ].join('\n');
  }

  private isAllowedCosImageUrl(raw: string): boolean {
    const input = String(raw || '').trim();
    if (!input) return false;
    try {
      const u = new URL(input);
      const host = (u.hostname || '').toLowerCase();
      // 最小约束：只接受腾讯云 COS 域名（与前端直传 COS 的 URL 形态一致）
      return u.protocol === 'https:' && host.includes('.cos.') && host.endsWith('.myqcloud.com');
    } catch {
      return false;
    }
  }

  private buildDirectUserText(args: {
    userPrompt: string;
    styleBlocks: string[];
    poseBlocks: string[];
  }): string {
    const styleBlocks = (args.styleBlocks || []).map((s) => String(s || '').trim()).filter(Boolean);
    const poseBlocks = (args.poseBlocks || []).map((s) => String(s || '').trim()).filter(Boolean).slice(0, 4);

    const lines: string[] = [];
    lines.push('[GOAL]');
    lines.push('Generate a photorealistic fashion photo. Apply STYLE and POSE while preserving GARMENT and FACE fidelity.');
    lines.push('');
    lines.push('[PRIORITY ORDER - MUST FOLLOW]');
    lines.push('1) GARMENT fidelity (including TRUE garment color / hue-saturation-value) is highest priority.');
    lines.push('   - Do NOT shift garment color by global grading, white balance, or colored lighting. Keep garment midtones color-accurate.');
    lines.push('   - Preserve original garment fit/silhouette (e.g., oversized, drop-shoulder, relaxed fit). Do NOT tailor, slim-fit, or alter proportions.');
    lines.push('2) FACE identity fidelity is second priority.');
    lines.push('3) POSE fidelity is third priority.');
    lines.push('4) STYLE fidelity is fourth priority.');
    lines.push('If conflicts occur, follow this order.');
    lines.push('');

    if (poseBlocks.length > 1) {
      const n = Math.min(4, poseBlocks.length);
      const layout =
        n === 2 ? 'a 1x2 diptych (two side-by-side panels)' :
          n === 3 ? 'a 1x3 triptych (three side-by-side panels)' :
            'a 2x2 grid (four panels)';

      lines.push('[MULTI-POSE CONTACT SHEET - MUST FOLLOW]');
      lines.push(`You MUST output ONE SINGLE IMAGE divided into ${n} panels as ${layout}.`);
      lines.push('Each panel shows the SAME model identity and the SAME garment(s), but with a DIFFERENT pose.');
      lines.push('Do NOT create multiple different people. It is the same person repeated across panels.');
      lines.push('Do NOT output a single full-canvas single pose. It must be a contact sheet.');
      lines.push('Panel order: left-to-right, then top-to-bottom.');
      lines.push('Do not add any text labels, numbers, captions, or watermarks.');
      lines.push('Apply STYLE consistently across all panels (especially lighting/camera), but keep garment color accurate.');
      lines.push('');
    }
    if (poseBlocks.length) {
      lines.push('[POSE_JSON_LIST]');
      lines.push('These JSON objects define human pose + framing + occlusion constraints.');
      lines.push('If multiple POSE JSON objects are provided, assign POSE #1 to panel 1, POSE #2 to panel 2, etc.');
      lines.push('Follow each POSE strictly within its panel.');
      for (let i = 0; i < poseBlocks.length; i++) {
        const b = poseBlocks[i];
        const raw = String(b || '').trim();
        const isJson = (() => {
          if (!raw) return false;
          if (!(raw.startsWith('{') || raw.startsWith('['))) return false;
          try {
            JSON.parse(raw);
            return true;
          } catch {
            return false;
          }
        })();
        lines.push(`[POSE #${i + 1}]`);
        lines.push(isJson ? '```json' : '```text');
        lines.push(raw);
        lines.push('```');
        lines.push('');
      }
    }
    if (styleBlocks.length) {
      lines.push('[STYLE_JSON]');
      lines.push('This JSON object defines the photographic style blueprint (lighting, scene, grading, camera).');
      lines.push('Apply STYLE mainly to background/atmosphere. If STYLE grading conflicts with GARMENT color accuracy, GARMENT color wins.');
      for (const b of styleBlocks) {
        const raw = String(b || '').trim();
        const isJson = (() => {
          if (!raw) return false;
          if (!(raw.startsWith('{') || raw.startsWith('['))) return false;
          try {
            JSON.parse(raw);
            return true;
          } catch {
            return false;
          }
        })();
        lines.push(isJson ? '```json' : '```text');
        lines.push(raw);
        lines.push('```');
        lines.push('');
      }
    }
    lines.push('[USER PROMPT]');
    lines.push(String(args.userPrompt || '').trim());
    lines.push('');
    lines.push('[HARD OUTPUT REQUIREMENT]');
    lines.push('Return IMAGE only. Do not return text.');
    return lines.join('\n').trim();
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
  }): Promise<TaskModel> {
    const user = args.user;
    const taskId = crypto.randomUUID();

    const needsPainterConfig = process.env.MOCK_PAINTER !== 'true';
    let configSnapshot: ModelConfig = {};
    try {
      configSnapshot = await this.modelConfigResolver.buildSnapshotFromActive();
    } catch {
      configSnapshot = {};
    }

    // 非草稿：先校验模型配置可用，避免“先扣积分再失败”
    if (needsPainterConfig) {
      await this.modelConfigResolver.resolvePainterRuntimeFromSnapshot(configSnapshot);
    }

    const resolution = (args.resolution || '2K') as TaskModel['resolution'];
    const aspectRatio = args.aspectRatio;

    // 积分：生成前先校验余额；真正扣费在“成功出图并产生图片链接”之后（通过 reserve/settle 实现）
    const estimated = this.billing.creditsForSuccessfulLegacyIndividualRender({
      successfulImages: 1,
      resolution,
    });
    const creditCheck = await this.billing.hasEnoughCreditsForAmount(user.id, estimated);
    if (!creditCheck.enough) {
      throw new Error(`积分不足。需要 ${creditCheck.required} 积分，当前余额 ${creditCheck.balance} 积分`);
    }

    const normalizePath = (p: string) => p.replace(/\\/g, '/');
    const garmentImagePaths = (args.garmentFiles || []).map((f) => normalizePath(f.path));
    if (garmentImagePaths.length > 6) {
      throw new BadRequestException('衣服图片最多 6 张');
    }

    // Face presets（最多 3，不占 6 张衣服限制）
    const facePresetIds = Array.isArray(args.facePresetIds) ? args.facePresetIds.slice(0, 3) : [];
    const faceRefPaths: string[] = [];
    if (facePresetIds.length) {
      for (const id of facePresetIds) {
        const preset = await this.db.getFacePreset(id);
        if (!preset) continue;
        // FacePreset 已包含 userId；这里做一次最小隔离
        if ((preset as any).userId && user.role !== 'ADMIN' && (preset as any).userId !== user.id) {
          throw new BadRequestException('无权访问该模特预设');
        }
        faceRefPaths.push(String((preset as any).imagePath || '').trim());
      }
    }

    // Style/Pose presets：仅展开 prompt blocks（不要把风格/姿势参考图发给生图模型）
    const stylePresetIds = Array.isArray(args.stylePresetIds) ? args.stylePresetIds.filter(Boolean) : [];
    if (stylePresetIds.length > 1) {
      throw new BadRequestException('风格只能选择 1 个');
    }
    const posePresetIds = Array.isArray(args.posePresetIds) ? args.posePresetIds.filter(Boolean) : [];
    if (posePresetIds.length > 4) {
      throw new BadRequestException('姿势最多选择 4 个');
    }

    const styleBlocks: string[] = [];
    const poseBlocks: string[] = [];

    for (const id of stylePresetIds) {
      const preset = await this.db.getStylePreset(id);
      if (!preset) continue;
      if ((preset as any).kind === 'POSE') continue;
      this.requireOwnerOrAdminForPreset(preset, user, '风格');
      const block = String((preset as any).promptBlock || (preset as any).styleHint || '').trim();
      if (block) styleBlocks.push(block);
    }

    for (const id of posePresetIds) {
      const preset = await this.db.getStylePreset(id);
      if (!preset) continue;
      if ((preset as any).kind !== 'POSE') continue;
      this.requireOwnerOrAdminForPreset(preset, user, '姿势');
      const block = String((preset as any).promptBlock || '').trim();
      if (block) poseBlocks.push(block);
    }

    const totalImages = garmentImagePaths.length + faceRefPaths.length;
    if (totalImages > MAX_TOTAL_IMAGES) {
      throw new BadRequestException(`总参考图数量过多（${totalImages}），上限 ${MAX_TOTAL_IMAGES}`);
    }

    const userPrompt = String(args.prompt || '').trim();
    if (!userPrompt) throw new BadRequestException('prompt 不能为空');

    const userText = this.buildDirectUserText({
      userPrompt,
      styleBlocks,
      poseBlocks,
    });

    const shotId = crypto.randomUUID();
    const now = Date.now();
    const task: TaskModel = {
      id: taskId,
      userId: user.id,
      createdAt: now,
      requirements: userPrompt,
      shotCount: 1,
      layoutMode: 'Individual',
      layout_mode: 'Individual',
      scene: 'Direct',
      resolution,
      garmentImagePaths,
      faceRefPaths,
      styleRefPaths: [], // 直出图：不发送风格参考图
      poseRefPaths: [],  // 直出图：不发送姿势参考图
      aspectRatio,
      status: 'RENDERING',
      resultImages: [],
      config: this.stripSecretsFromConfig(configSnapshot),
      shots: [
        {
          id: shotId,
          shotCode: '1',
          promptEn: userText,
          prompt: userText,
          type: 'DirectPrompt',
          status: 'PENDING',
        } as any,
      ],
      directPrompt: userPrompt,
      directIncludeThoughts: !!args.includeThoughts,
      directSeed: args.seed,
      directTemperature: args.temperature,
      directStylePresetIds: stylePresetIds,
      directPosePresetIds: posePresetIds,
      directFacePresetIds: facePresetIds,
      // 初始化对话会话：首轮 user message 固化为“解析后完整 userText”（包含风格/姿势 blocks）
      directPainterSession: {
        createdAt: now,
        updatedAt: now,
        messages: [{ role: 'user', text: userText, createdAt: now }],
      },
    };

    await this.db.saveTask(task);

    // 异步执行（不阻塞接口返回）
    this.startDirectRendering(taskId, { useSession: true }).catch((err) => {
      this.logger.error(`Direct rendering failed for task ${taskId}`, err);
      this.db.updateTask(taskId, { status: 'FAILED', error: err?.message || 'Direct rendering failed' }).catch(() => undefined);
    });

    return task;
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
  }): Promise<TaskModel> {
    const user = args.user;
    const taskId = crypto.randomUUID();

    const needsPainterConfig = process.env.MOCK_PAINTER !== 'true';
    let configSnapshot: ModelConfig = {};
    try {
      configSnapshot = await this.modelConfigResolver.buildSnapshotFromActive();
    } catch {
      configSnapshot = {};
    }

    // 非草稿：先校验模型配置可用，避免“先扣积分再失败”
    if (needsPainterConfig) {
      await this.modelConfigResolver.resolvePainterRuntimeFromSnapshot(configSnapshot);
    }

    const resolution = (args.resolution || '2K') as TaskModel['resolution'];
    const aspectRatio = args.aspectRatio;

    // 积分：生成前先校验余额；真正扣费在“成功出图并产生图片链接”之后（通过 reserve/settle 实现）
    const estimated = this.billing.creditsForSuccessfulLegacyIndividualRender({
      successfulImages: 1,
      resolution,
    });
    const creditCheck = await this.billing.hasEnoughCreditsForAmount(user.id, estimated);
    if (!creditCheck.enough) {
      throw new Error(`积分不足。需要 ${creditCheck.required} 积分，当前余额 ${creditCheck.balance} 积分`);
    }

    const garmentUrls = Array.isArray(args.garmentUrls) ? args.garmentUrls : [];
    const garmentImagePaths = garmentUrls
      .map((u) => String(u || '').trim())
      .filter(Boolean);

    if (garmentImagePaths.length === 0) {
      throw new BadRequestException('至少需要上传 1 张衣服图片');
    }
    // URL 版：衣服图本期允许到总上限 14（再叠加人脸会校验总数）
    if (garmentImagePaths.length > MAX_TOTAL_IMAGES) {
      throw new BadRequestException(`衣服图片最多 ${MAX_TOTAL_IMAGES} 张`);
    }
    for (const u of garmentImagePaths) {
      if (!this.isAllowedCosImageUrl(u)) {
        throw new BadRequestException('衣服图片必须为 COS URL（https://*.cos.*.myqcloud.com/...)');
      }
    }

    // Face presets（最多 3，不占“衣服张数”，但占总参考图 14 上限）
    const facePresetIds = Array.isArray(args.facePresetIds) ? args.facePresetIds.slice(0, 3) : [];
    const faceRefPaths: string[] = [];
    if (facePresetIds.length) {
      for (const id of facePresetIds) {
        const preset = await this.db.getFacePreset(id);
        if (!preset) continue;
        if ((preset as any).userId && user.role !== 'ADMIN' && (preset as any).userId !== user.id) {
          throw new BadRequestException('无权访问该模特预设');
        }
        const p = String((preset as any).imagePath || '').trim();
        if (p) faceRefPaths.push(p);
      }
    }

    // 总参考图上限：衣服+人脸<=14
    const totalImages = garmentImagePaths.length + faceRefPaths.length;
    if (totalImages > MAX_TOTAL_IMAGES) {
      throw new BadRequestException(`总参考图数量过多（${totalImages}），上限 ${MAX_TOTAL_IMAGES}`);
    }

    // Style/Pose presets：仅展开 prompt blocks（不要把风格/姿势参考图发给生图模型）
    const stylePresetIds = Array.isArray(args.stylePresetIds) ? args.stylePresetIds.filter(Boolean) : [];
    if (stylePresetIds.length > 1) {
      throw new BadRequestException('风格只能选择 1 个');
    }
    const posePresetIds = Array.isArray(args.posePresetIds) ? args.posePresetIds.filter(Boolean) : [];
    if (posePresetIds.length > 4) {
      throw new BadRequestException('姿势最多选择 4 个');
    }

    const styleBlocks: string[] = [];
    const poseBlocks: string[] = [];

    for (const id of stylePresetIds) {
      const preset = await this.db.getStylePreset(id);
      if (!preset) continue;
      if ((preset as any).kind === 'POSE') continue;
      this.requireOwnerOrAdminForPreset(preset, user, '风格');
      const block = String((preset as any).promptBlock || (preset as any).styleHint || '').trim();
      if (block) styleBlocks.push(block);
    }

    for (const id of posePresetIds) {
      const preset = await this.db.getStylePreset(id);
      if (!preset) continue;
      if ((preset as any).kind !== 'POSE') continue;
      this.requireOwnerOrAdminForPreset(preset, user, '姿势');
      const block = String((preset as any).promptBlock || '').trim();
      if (block) poseBlocks.push(block);
    }

    const userPrompt = String(args.prompt || '').trim();
    if (!userPrompt) throw new BadRequestException('prompt 不能为空');

    const userText = this.buildDirectUserText({
      userPrompt,
      styleBlocks,
      poseBlocks,
    });

    const shotId = crypto.randomUUID();
    const now = Date.now();
    const task: TaskModel = {
      id: taskId,
      userId: user.id,
      createdAt: now,
      requirements: userPrompt,
      shotCount: 1,
      layoutMode: 'Individual',
      layout_mode: 'Individual',
      scene: 'Direct',
      resolution,
      garmentImagePaths,
      faceRefPaths,
      styleRefPaths: [], // 直出图：不发送风格参考图
      poseRefPaths: [],  // 直出图：不发送姿势参考图
      aspectRatio,
      status: 'RENDERING',
      resultImages: [],
      config: this.stripSecretsFromConfig(configSnapshot),
      shots: [
        {
          id: shotId,
          shotCode: '1',
          promptEn: userText,
          prompt: userText,
          type: 'DirectPrompt',
          status: 'PENDING',
        } as any,
      ],
      directPrompt: userPrompt,
      directIncludeThoughts: !!args.includeThoughts,
      directSeed: args.seed,
      directTemperature: args.temperature,
      directStylePresetIds: stylePresetIds,
      directPosePresetIds: posePresetIds,
      directFacePresetIds: facePresetIds,
      directPainterSession: {
        createdAt: now,
        updatedAt: now,
        messages: [{ role: 'user', text: userText, createdAt: now }],
      },
    };

    await this.db.saveTask(task);

    // 异步执行（不阻塞接口返回）
    this.startDirectRendering(taskId, { useSession: true }).catch((err) => {
      this.logger.error(`Direct rendering failed for task ${taskId}`, err);
      this.db.updateTask(taskId, { status: 'FAILED', error: err?.message || 'Direct rendering failed' }).catch(() => undefined);
    });

    return task;
  }

  async regenerateDirectTask(taskId: string, user: UserModel): Promise<TaskModel> {
    const task = await this.db.getTask(taskId);
    if (!task) throw new NotFoundException('Task not found');
    if (task.userId && user.role !== 'ADMIN' && task.userId !== user.id) {
      throw new BadRequestException('无权访问该任务');
    }
    if (!task.directPrompt) {
      throw new BadRequestException('该任务不是直出图任务');
    }

    await this.db.updateTask(taskId, {
      status: 'RENDERING',
      error: undefined,
    });

    // 重绘：严格按“任务原始提示词”生成，不追加对话 history
    this.startDirectRendering(taskId, { useSession: false }).catch((err) => {
      this.logger.error(`Direct regenerate failed for task ${taskId}`, err);
      this.db.updateTask(taskId, { status: 'FAILED', error: err?.message || 'Direct regenerate failed' }).catch(() => undefined);
    });

    const updated = await this.db.getTask(taskId);
    if (!updated) throw new NotFoundException('Task not found');
    return updated;
  }

  async directMessage(taskId: string, user: UserModel, message: string): Promise<TaskModel> {
    const task = await this.db.getTask(taskId);
    if (!task) throw new NotFoundException('Task not found');
    if (task.userId && user.role !== 'ADMIN' && task.userId !== user.id) {
      throw new BadRequestException('无权访问该任务');
    }
    if (!task.directPrompt) {
      throw new BadRequestException('该任务不是直出图任务');
    }

    const msg = String(message || '').trim();
    if (!msg) throw new BadRequestException('message 不能为空');

    const session = task.directPainterSession || {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };

    // 兜底：若历史中没有 base prompt，则用当前 shot.promptEn 补上（保证对话有上下文锚点）
    const shots = Array.isArray(task.shots) ? task.shots : [];
    const shot = shots[0] as any;
    const base = String(shot?.promptEn || shot?.prompt || '').trim();
    if (base && session.messages.length === 0) {
      const ts = Date.now();
      session.messages.push({ role: 'user', text: base, createdAt: ts });
      session.updatedAt = ts;
    }

    const ts = Date.now();
    session.messages.push({ role: 'user', text: msg, createdAt: ts });
    session.updatedAt = ts;

    // 控制会话长度，避免 JSON 过大（只保留最近 20 条）
    if (session.messages.length > 20) {
      session.messages = session.messages.slice(-20);
    }

    await this.db.updateTask(taskId, {
      status: 'RENDERING',
      error: undefined,
      directPainterSession: session,
    } as any);

    this.startDirectRendering(taskId, { useSession: true }).catch((err) => {
      this.logger.error(`Direct message failed for task ${taskId}`, err);
      this.db.updateTask(taskId, { status: 'FAILED', error: err?.message || 'Direct message failed' }).catch(() => undefined);
    });

    const updated = await this.db.getTask(taskId);
    if (!updated) throw new NotFoundException('Task not found');
    return updated;
  }

  private async startDirectRendering(taskId: string, opts?: { useSession?: boolean }) {
    const task = await this.db.getTask(taskId);
    if (!task) throw new NotFoundException('Task not found');

    const painterRuntime = process.env.MOCK_PAINTER === 'true'
      ? undefined
      : await this.resolvePainterRuntime(task);

    const attemptCreatedAt = Date.now();
    const billingBaseKey = `direct:${attemptCreatedAt}`;
    const reserveKey = `reserve:${billingBaseKey}`;
    const settleKey = `settle:${billingBaseKey}`;

    let didReserve = false;

    try {
      // 预扣：1 张（失败则全退）
      // 注意：必须放在 try 内，避免后续前置校验/调用失败导致“已扣费但未退款”。
      if (task.userId) {
        const reserveAmount = this.billing.creditsForSuccessfulLegacyIndividualRender({
          successfulImages: 1,
          resolution: task.resolution,
        });
        await this.billing.reserveOnce({
          taskId,
          userId: task.userId,
          amount: reserveAmount,
          reason: '预扣：直出图生成',
          eventKey: reserveKey,
        });
        didReserve = true;
      }

      const shots = Array.isArray(task.shots) ? task.shots : [];
      const shot = shots[0] as any;
      if (!shot) throw new Error('No shot found');

      // “任务原始提示词”：以首次解析后的 promptEn 为准（包含当时选中的风格/姿势 blocks），避免后续预设变更导致漂移
      const baseUserText = String(shot.promptEn || shot.prompt || '').trim();
      if (!baseUserText) throw new Error('Direct task missing base promptEn');

      const useSession = !!opts?.useSession;

      // 重绘：严格使用 baseUserText，不受对话内容影响（“任务原始提示词重绘”）
      // 对话：使用 directPainterSession 的最后一条 user message + 其前序作为 history。
      const session = useSession ? task.directPainterSession : undefined;
      const rawMsgs = Array.isArray(session?.messages) ? session!.messages : [];
      const lastUserIdx = (() => {
        for (let i = rawMsgs.length - 1; i >= 0; i--) {
          if (rawMsgs[i]?.role === 'user' && String(rawMsgs[i]?.text || '').trim()) return i;
        }
        return -1;
      })();

      const history =
        lastUserIdx >= 0
          ? rawMsgs.slice(0, lastUserIdx).map((m) => ({ role: m.role, text: String(m.text || '') } as any))
          : [];
      const userText = useSession && lastUserIdx >= 0 ? String(rawMsgs[lastUserIdx].text || '').trim() : baseUserText;

      const images = [
        ...(task.garmentImagePaths || []).map((p, idx) => ({ label: `GARMENT_${idx + 1}`, pathOrUrl: p })),
        ...(task.faceRefPaths || []).map((p, idx) => ({ label: `FACE_${idx + 1}`, pathOrUrl: p, allowCi: false })),
      ];

      let imagePath = '';
      let shootLogText = '';

      const r = await this.painter.generateImageWithChatSessionWithLog({
        systemInstruction: await this.buildDirectSystemInstruction(),
        history,
        userText,
        images,
        options: {
          aspectRatio: task.aspectRatio,
          imageSize: task.resolution || '2K',
          seed: (task as any).directSeed,
          temperature: (task as any).directTemperature,
          responseModalities: ['IMAGE'],
          ...(task.directIncludeThoughts
            ? { thinkingConfig: { includeThoughts: true, thinkingBudget: -1 } as any }
            : {}),
        } as any,
        config: painterRuntime,
        context: { taskId, stage: 'direct_generate' },
      });
      imagePath = r.imagePath;
      shootLogText = r.shootLogText;

      // 对话模式：把模型返回的 TEXT（shootLog）写回 session，作为后续对话的“上文”
      if (useSession && session) {
        const t = String(shootLogText || '').trim();
        if (t) {
          const ts = Date.now();
          const nextSession: any = {
            ...session,
            updatedAt: ts,
            messages: [...(Array.isArray(session.messages) ? session.messages : []), { role: 'model', text: t, createdAt: ts }],
          };
          if (nextSession.messages.length > 20) nextSession.messages = nextSession.messages.slice(-20);
          (task as any).directPainterSession = nextSession;
        }
      }

      // 上传 COS（失败则退化为本地路径）
      let imageUrl: string | undefined;
      if (this.cos.isEnabled()) {
        const ext = path.extname(imagePath) || '.jpg';
        const key = `uploads/tasks/${taskId}/direct/${attemptCreatedAt}_${crypto.randomUUID()}${ext}`;
        try {
          await this.cos.uploadFile(key, imagePath);
          imageUrl = this.cos.getImageUrl(key);
        } catch (e: any) {
          this.logger.warn(`COS upload failed for direct task ${taskId}`, e?.message || e);
        }
      }

      const versions = Array.isArray(shot.versions) ? shot.versions : [];
      if (versions.length === 0 && (shot.imagePath || shot.imageUrl)) {
        versions.push({
          versionId: 1,
          imagePath: shot.imageUrl || shot.imagePath,
          prompt: String(shot.promptEn || shot.prompt || ''),
          createdAt: Date.now() - 1000,
        });
      }

      const newVersion = {
        versionId: versions.length + 1,
        imagePath: imageUrl || imagePath,
        prompt: userText,
        createdAt: attemptCreatedAt,
      };
      versions.push(newVersion);

      const updatedShot = {
        ...shot,
        status: 'RENDERED',
        imagePath,
        imageUrl,
        promptEn: userText,
        prompt: userText,
        shootLog: (shootLogText || '').trim(),
        versions,
        currentVersion: newVersion.versionId,
      };

      const nextShots = [updatedShot, ...shots.slice(1)];
      const resultImages = [imageUrl || imagePath].filter(Boolean) as string[];

      await this.db.updateTask(taskId, {
        status: 'COMPLETED',
        shots: nextShots as any,
        resultImages,
        error: undefined,
        ...(useSession && (task as any).directPainterSession ? { directPainterSession: (task as any).directPainterSession } : {}),
      });

      // 结算：成功 1 张
      if (task.userId && didReserve) {
        const actual = this.billing.creditsForSuccessfulLegacyIndividualRender({
          successfulImages: 1,
          resolution: task.resolution,
        });
        try {
          await this.billing.settleOnce({
            taskId,
            userId: task.userId,
            reserveEventKey: reserveKey,
            settleEventKey: settleKey,
            actualAmount: actual,
            reason: '直出图生成结算',
          });
        } catch (err: any) {
          this.logger.error(`Billing failed for task ${taskId} (direct settle success)`, err);
          await this.billing.markBillingError(taskId, err?.message || '直出图结算失败');
        }
      }
    } catch (e: any) {
      // 失败：全额退款
      await this.db.updateTask(taskId, { status: 'FAILED', error: e?.message || 'Direct rendering failed' });
      if (task.userId && didReserve) {
        try {
          await this.billing.settleOnce({
            taskId,
            userId: task.userId,
            reserveEventKey: reserveKey,
            settleEventKey: settleKey,
            actualAmount: 0,
            reason: '直出图生成失败结算',
          });
        } catch (err: any) {
          this.logger.error(`Billing failed for task ${taskId} (direct settle failure refund)`, err);
          await this.billing.markBillingError(taskId, err?.message || '直出图失败结算失败');
        }
      }
      throw e;
    }
  }

  private async countActiveLegacyTasksForUser(userId: string): Promise<number> {
    return this.prisma.task.count({
      where: {
        userId,
        status: { in: ['PLANNING', 'AWAITING_APPROVAL', 'RENDERING'] as any },
      },
    });
  }

  private async tryStartQueuedTasksForUser(userId: string): Promise<void> {
    const active = await this.countActiveLegacyTasksForUser(userId);
    const capacity = this.maxConcurrentLegacyPerUser - active;
    if (capacity <= 0) return;

    const queued = await this.prisma.task.findMany({
      where: { userId, status: 'QUEUED' as any },
      orderBy: { createdAt: 'asc' },
      take: capacity,
    });

    for (const row of queued) {
      const task = (row.data as any) as TaskModel;
      const garmentPaths = task.garmentImagePaths || [];
      const faceRefPaths = task.faceRefPaths || [];

      await this.db.updateTask(task.id, { status: 'PLANNING', error: undefined });

      this.processBrainAnalysis(
        { ...task, status: 'PLANNING' } as TaskModel,
        garmentPaths,
        faceRefPaths,
      ).catch((err) => {
        this.logger.error(`Brain analysis failed for queued task ${task.id}`, err);
        this.db.updateTask(task.id, { status: 'FAILED', error: err?.message || 'Brain analysis failed' }).finally(() => {
          if (task.userId) {
            this.tryStartQueuedTasksForUser(task.userId).catch(() => undefined);
          }
        });
      });
    }
  }

  async createTask(dto: CreateTaskDto, config?: ModelConfig) {
    const taskId = crypto.randomUUID();
    const isDraft = !dto.userId;
    const workflow = dto.workflow === 'hero_storyboard' ? 'hero_storyboard' : 'legacy';
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

    // 积分：生成前先校验余额；真正扣费在“成功出图并产生图片链接”之后
    const userId = dto.userId;
    if (userId && !isDraft) {
      const estimatedInitialCost =
        workflow === 'hero_storyboard'
          ? this.billing.creditsForSuccessfulHeroImage({ resolution: dto.resolution })
          : this.billing.estimateLegacyTaskCredits({
            shotCount: dto.shot_count,
            layoutMode: dto.layout_mode as any,
            resolution: dto.resolution,
          });

      const creditCheck = await this.billing.hasEnoughCreditsForAmount(userId, estimatedInitialCost);
      if (!creditCheck.enough) {
        throw new Error(`积分不足。需要 ${creditCheck.required} 积分，当前余额 ${creditCheck.balance} 积分`);
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

    const modelMetadata: TaskModel['modelMetadata'] = [];

    // Process face preset IDs if provided
    if (dto.facePresetIds) {
      const presetIds = dto.facePresetIds.split(',').map(id => id.trim()).filter(Boolean);
      this.logger.log(`Processing ${presetIds.length} face preset(s): ${presetIds.join(', ')}`);

      for (const presetId of presetIds) {
        const preset = await this.db.getFacePreset(presetId);
        if (preset) {
          faceRefPaths.push(preset.imagePath);
          this.logger.log(`✅ Loaded face preset: ${preset.name} (${presetId}) -> ${preset.imagePath}`);

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

      this.logger.log(`📂 Final face ref paths (${faceRefPaths.length}):`, faceRefPaths);
    }

    // Process style preset IDs if provided (expand to style reference images)
    if (dto.stylePresetIds) {
      const presetIds = dto.stylePresetIds.split(',').map(id => id.trim()).filter(Boolean);
      this.logger.log(`Processing ${presetIds.length} style preset(s): ${presetIds.join(', ')}`);

      for (const presetId of presetIds) {
        const preset = await this.db.getStylePreset(presetId);
        if (preset) {
          const paths = (preset.imagePaths || []).map(normalizePath).filter(Boolean);
          styleRefPaths.push(...paths);
          this.logger.log(`✅ Loaded style preset: ${preset.name} (${presetId}) -> ${paths.length} image(s)`);
        } else {
          this.logger.warn(`❌ Style preset not found: ${presetId}`);
        }
      }

      this.logger.log(`📂 Final style ref paths (${styleRefPaths.length}):`, styleRefPaths);
    }

    // Server-side guard: enforce maximum total image count after expanding presets
    const totalImages = imagePaths.length + faceRefPaths.length + styleRefPaths.length;
    if (totalImages > MAX_TOTAL_IMAGES) {
      throw new BadRequestException(
        `Total image count (${totalImages}) exceeds maximum allowed (${MAX_TOTAL_IMAGES}).`,
      );
    }

    const newTask: TaskModel = {
      id: taskId,
      userId: userId,                    // 创建任务的用户ID
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
      modelMetadata: modelMetadata.length > 0 ? modelMetadata : undefined,
      workflow,
      autoApproveHero: dto.autoApproveHero || false,
      status: isDraft ? 'DRAFT' : (workflow === 'hero_storyboard' ? 'HERO_RENDERING' : 'PLANNING'),
      resultImages: [],
      config: configSnapshot,
      autoApprove: dto.autoApprove || false
    };

    // legacy 并发兜底：同一用户在跑任务最多 N 个，其余排队（QUEUED）
    if (!isDraft && workflow === 'legacy' && newTask.userId) {
      const active = await this.countActiveLegacyTasksForUser(newTask.userId);
      if (active >= this.maxConcurrentLegacyPerUser) {
        newTask.status = 'QUEUED';
      }
    }

    await this.db.saveTask(newTask);
    this.logger.log(`Task ${taskId} created. AutoApprove: ${newTask.autoApprove}`);

    if (!isDraft) {
      if (workflow === 'hero_storyboard') {
        // New workflow: start Hero rendering phase (async)
        this.heroStoryboard.startHero(taskId).catch((err) => {
          this.logger.error(`Hero rendering failed for task ${taskId}`, err);
          this.db.updateTask(taskId, { status: 'FAILED', error: err?.message || 'Hero rendering failed' });
        });
      } else {
        if (newTask.status === 'QUEUED') {
          this.logger.log(`Task ${taskId} queued (user ${newTask.userId}, active>=${this.maxConcurrentLegacyPerUser})`);
        } else {
          // Legacy workflow: start Brain analysis phase (async)
          this.processBrainAnalysis(newTask, imagePaths, faceRefPaths).catch(err => {
            this.logger.error(`Brain analysis failed for task ${taskId}`, err);
            this.db.updateTask(taskId, { status: 'FAILED', error: err.message }).finally(() => {
              if (newTask.userId) {
                this.tryStartQueuedTasksForUser(newTask.userId).catch(() => undefined);
              }
            });
          });
        }
      }
    }

    if (newTask.userId) {
      this.tryStartQueuedTasksForUser(newTask.userId).catch(() => undefined);
    }

    return { task: newTask, claimToken };
  }

  async getTask(id: string) {
    return this.db.getTask(id);
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
    const allTasks = await this.db.getAllTasks();
    const isAdmin = viewer.role === 'ADMIN';

    const tasks = isAdmin
      ? (scope === 'mine' ? allTasks.filter((t) => t.userId === viewer.id) : allTasks)
      : allTasks.filter((t) => t.userId === viewer.id);

    // ADMIN only: optional filter by owner userId (口径：该用户所有任务)
    let filtered = tasks;
    if (isAdmin && filters?.userId) {
      filtered = filtered.filter((t) => t.userId === filters.userId);
    }

    if (filters?.status) {
      const status = String(filters.status).trim();
      if (status) filtered = filtered.filter((t) => String(t.status) === status);
    }

    if (filters?.q) {
      const q = String(filters.q).trim().toLowerCase();
      if (q) {
        filtered = filtered.filter((t) => {
          const hay = [
            String(t.id || ''),
            String(t.requirements || ''),
          ].join(' ').toLowerCase();
          return hay.includes(q);
        });
      }
    }

    // Sort by creation time (newest first)
    const sortedTasks = filtered.sort((a, b) => b.createdAt - a.createdAt);

    // Pagination
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedTasks = sortedTasks.slice(start, end);

    return {
      tasks: paginatedTasks,
      total: filtered.length,
      page,
      limit,
      totalPages: Math.ceil(filtered.length / limit)
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
    const estimatedInitialCost =
      (task.workflow || 'legacy') === 'hero_storyboard'
        ? this.billing.creditsForSuccessfulHeroImage({ resolution: task.resolution })
        : this.billing.estimateLegacyTaskCredits({
          shotCount: task.shotCount,
          layoutMode: task.layout_mode || task.layoutMode || 'Individual',
          resolution: task.resolution,
        });

    const creditCheck = await this.billing.hasEnoughCreditsForAmount(userId, estimatedInitialCost);
    if (!creditCheck.enough) {
      throw new BadRequestException(`积分不足。需要 ${creditCheck.required} 积分，当前余额 ${creditCheck.balance} 积分`);
    }

    // legacy 并发兜底：草稿任务开始时也遵循同用户并发≤N
    if ((task.workflow || 'legacy') === 'legacy') {
      const active = await this.countActiveLegacyTasksForUser(userId);
      if (active >= this.maxConcurrentLegacyPerUser) {
        await this.db.updateTask(taskId, { status: 'QUEUED', config: configSnapshot });
        return (await this.db.getTask(taskId)) as any;
      }
    }

    await this.db.updateTask(taskId, {
      status: (task.workflow || 'legacy') === 'hero_storyboard' ? 'HERO_RENDERING' : 'PLANNING',
      config: configSnapshot,
    });

    const imagePaths = task.garmentImagePaths || [];
    const faceRefPaths = task.faceRefPaths || [];

    if ((task.workflow || 'legacy') === 'hero_storyboard') {
      this.heroStoryboard.regenerateHero(taskId).catch((err) => {
        this.logger.error(`Hero rendering failed for task ${taskId}`, err);
        this.db.updateTask(taskId, { status: 'FAILED', error: err?.message || 'Hero rendering failed' });
      });
    } else {
      this.processBrainAnalysis(
        { ...task, status: 'PLANNING', userId, config: configSnapshot } as TaskModel,
        imagePaths,
        faceRefPaths
      ).catch(err => {
        this.logger.error(`Brain analysis failed for task ${taskId}`, err);
        this.db.updateTask(taskId, { status: 'FAILED', error: err.message }).finally(() => {
          this.tryStartQueuedTasksForUser(userId).catch(() => undefined);
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
          face_ref_paths: faceRefPaths,               // 传递人脸参考
          garment_focus: task.garmentFocus,
          aspect_ratio: task.aspectRatio,
          quality: task.resolution,
          model_metadata: task.modelMetadata
        },
        brainRuntime
      );

      // Extract plan and thinking process
      const plan = brainResult.plan;
      const thinkingProcess = brainResult.thinkingProcess;

      // 日志脱敏：不要把完整“思考过程”打到 stdout（可能很长、且有概率包含不可读内容）
      if (thinkingProcess) {
        const trimmed = String(thinkingProcess).trim();
        const preview = trimmed.length > 400 ? `${trimmed.slice(0, 400)}…` : trimmed;
        this.logger.log(`ThinkingProcess for ${task.id}: len=${trimmed.length}, preview=${preview}`);
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
   * legacy：重试 Brain（重新规划，并在 autoApprove=true 时自动进入 Painter）
   * - 仅用于：Brain 规划失败/任务无 brainPlan 的场景
   * - 并发兜底：若同用户在跑>=N，则置为 QUEUED
   */
  async retryBrain(taskId: string) {
    const task = await this.db.getTask(taskId);
    if (!task) throw new NotFoundException('任务不存在');
    if ((task.workflow || 'legacy') !== 'legacy') throw new BadRequestException('仅支持传统流程(legacy)重试');
    if (!task.userId) throw new BadRequestException('任务未绑定用户，无法重试');

    const active = await this.countActiveLegacyTasksForUser(task.userId);
    if (active >= this.maxConcurrentLegacyPerUser) {
      await this.db.updateTask(taskId, { status: 'QUEUED', error: undefined });
      return this.db.getTask(taskId);
    }

    const estimated = this.billing.estimateLegacyTaskCredits({
      shotCount: task.shotCount,
      layoutMode: task.layout_mode || task.layoutMode || 'Individual',
      resolution: task.resolution,
    });
    const creditCheck = await this.billing.hasEnoughCreditsForAmount(task.userId, estimated);
    if (!creditCheck.enough) {
      throw new BadRequestException(`积分不足。需要 ${creditCheck.required} 积分，当前余额 ${creditCheck.balance} 积分`);
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

    this.processBrainAnalysis(
      { ...task, status: 'PLANNING' } as TaskModel,
      garmentPaths,
      faceRefPaths,
    ).catch((err) => {
      this.logger.error(`Brain retry failed for task ${taskId}`, err);
      this.db.updateTask(taskId, { status: 'FAILED', error: err?.message || 'Brain retry failed' }).finally(() => {
        this.tryStartQueuedTasksForUser(task.userId as string).catch(() => undefined);
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
    if ((task.workflow || 'legacy') !== 'legacy') throw new BadRequestException('仅支持传统流程(legacy)重试');
    if (!task.userId) throw new BadRequestException('任务未绑定用户，无法重试');
    if (!task.brainPlan) throw new BadRequestException('任务缺少分镜规划（brainPlan），请先重试 Brain');

    const active = await this.countActiveLegacyTasksForUser(task.userId);
    if (active >= this.maxConcurrentLegacyPerUser) {
      await this.db.updateTask(taskId, { status: 'QUEUED', error: undefined });
      return this.db.getTask(taskId);
    }

    const layoutMode = task.layout_mode || task.layoutMode || 'Individual';

    // 只重试失败镜头：复用现有逻辑（内部自带 reserve/settle 的 retry eventKey）
    if (layoutMode !== 'Grid' && Array.isArray(task.shots) && task.shots.some((s) => s.status === 'FAILED')) {
      return this.retryFailedShots(taskId);
    }

    const estimated = this.billing.estimateLegacyTaskCredits({
      shotCount: task.shotCount,
      layoutMode,
      resolution: task.resolution,
    });
    const creditCheck = await this.billing.hasEnoughCreditsForAmount(task.userId, estimated);
    if (!creditCheck.enough) {
      throw new BadRequestException(`积分不足。需要 ${creditCheck.required} 积分，当前余额 ${creditCheck.balance} 积分`);
    }

    const garmentPaths = task.garmentImagePaths || [];
    const faceRefPaths = task.faceRefPaths || [];
    const attemptId = crypto.randomUUID();

    await this.db.updateTask(taskId, { status: 'RENDERING', error: undefined });

    this.startRendering(
      taskId,
      garmentPaths,
      faceRefPaths,
      task.config,
      { billingBaseKey: `legacy:rerender:${taskId}:${attemptId}`, reserveReason: '预扣：重新生成图片' },
    ).catch((err) => {
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
    opts?: { billingBaseKey?: string; reserveReason?: string }
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
        ? await this.resolvePainterRuntime(task, config)
        : config;

      const activeKey = painterRuntime?.painterKey || painterRuntime?.apiKey;
      if (needsPainterConfig && !activeKey) {
        throw new Error('Painter API Key 未配置（请在“模型配置”中设置并设为 Active）');
      }

      // 扣费策略（B）：Painter 开始前预扣最大额度，结束后按成功张数/固定2结算，多退少补
      const layoutMode = task.layout_mode || 'Individual';
      const isLegacyAlreadyCharged =
        (task.creditsSpent ?? 0) > 0 && (!task.billingEvents || task.billingEvents.length === 0);

      const shouldReserveInitial = !opts?.billingBaseKey && !isLegacyAlreadyCharged;
      const shouldReserve = !!task.userId && (opts?.billingBaseKey ? true : shouldReserveInitial);

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
      this.logger.log(`Rendering mode: ${layoutMode}`);

      if (layoutMode === 'Grid') {
        await this.renderGridMode(
          task,
          plan,
          allRefImages,
          limitedRefs.garment.length,
          limitedRefs.face.length,
          painterRuntime,
          { reserveEventKey: reserveKey, settleEventKey: settleKey },
        );
      } else {
        await this.renderIndividualMode(
          task,
          plan,
          allRefImages,
          limitedRefs.garment.length,
          limitedRefs.face.length,
          painterRuntime,
          { reserveEventKey: reserveKey, settleEventKey: settleKey },
        );
      }

    } catch (e: any) {
      this.logger.error(`Rendering failed for task ${taskId}`, e);
      await this.db.updateTask(taskId, {
        status: 'FAILED',
        error: e.message || 'Rendering failed'
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
      } catch (err: any) {
        await this.billing.markBillingError(taskId, err?.message || '结算失败');
      }

      throw e;
    } finally {
      const latest = await this.db.getTask(taskId);
      if (latest?.userId) {
        await this.tryStartQueuedTasksForUser(latest.userId).catch(() => undefined);
      }
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
    config?: ModelConfig,
    billingKeys?: { reserveEventKey: string; settleEventKey: string }
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

      let imageUrl: string | undefined;
      if (this.cos.isEnabled()) {
        const ext = path.extname(imagePath) || '.jpg';
        const filename = path.basename(imagePath);
        const key = `uploads/tasks/${task.id}/legacy/grid/${filename || `${Date.now()}${ext}`}`;
        try {
          await this.cos.uploadFile(key, imagePath);
          imageUrl = this.cos.getImageUrl(key);
        } catch (e: any) {
          this.logger.warn(`COS upload failed for legacy grid (task ${task.id}): ${e?.message || e}`);
        }
      }

      await this.db.updateTask(task.id, {
        status: 'COMPLETED',
        resultImages: [imageUrl || imagePath],
        shots: plan.shots.map((shot: any, idx: number) => ({
          id: crypto.randomUUID(),
          shotCode: shot.shot_id || shot.id || `${idx + 1}`,
          type: shot.type,
          promptEn: shot.prompt_en || shot.prompt,
          status: 'RENDERED',
          imagePath: imagePath,
          imageUrl: imageUrl,
        })) as any
      });

      this.logger.log(`✅ Grid contact sheet generated for task ${task.id}`);

      // 结算（Grid 固定扣2）
      try {
        if (task.userId) {
          const actual = this.billing.creditsForSuccessfulLegacyGridRender({ resolution: task.resolution });
          await this.billing.settleOnce({
            taskId: task.id,
            userId: task.userId,
            reserveEventKey: billingKeys?.reserveEventKey || `reserve:legacy:initial:${task.id}`,
            settleEventKey: billingKeys?.settleEventKey || `settle:legacy:initial:${task.id}`,
            actualAmount: actual,
            reason: '任务结算：拼图',
          });
        }
      } catch (err: any) {
        await this.billing.markBillingError(task.id, err?.message || '结算失败');
      }

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
    config?: ModelConfig,
    billingKeys?: { reserveEventKey: string; settleEventKey: string }
  ) {
    this.logger.log(`🎬 Individual Mode: Generating ${plan.shots.length} separate images`);

    const generatedShots = (plan.shots || []).map((shot: any, idx: number) => {
      const shotId = shot.shot_id || shot.id || `${idx + 1}`;
      return {
        id: crypto.randomUUID(),
        shotCode: shotId,
        type: shot.type,
        promptEn: shot.prompt_en || shot.prompt,
        status: 'PENDING',
        imagePath: undefined,
        error: undefined,
      };
    });

    const referenceInstruction = this.buildReferenceImageInstruction(plan, garmentRefCount, faceRefCount);

    // Progressive rendering UX: persist placeholders first, then update per-shot as soon as it finishes.
    // This allows the client to "show one image as soon as one succeeds" while the task is still rendering.
    await this.db.updateTask(task.id, {
      shots: generatedShots as any,
      resultImages: [],
    });

    const persistProgress = async () => {
      const successfulImages = generatedShots
        .filter((s: any) => s.status === 'RENDERED' && (s.imageUrl || s.imagePath))
        .map((s: any) => (s.imageUrl || s.imagePath) as string);

      await this.db.updateTask(task.id, {
        shots: generatedShots as any,
        resultImages: successfulImages,
      });
    };

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

        let imageUrl: string | undefined;
        if (this.cos.isEnabled()) {
          const ext = path.extname(imagePath) || '.jpg';
          const filename = path.basename(imagePath);
          const key = `uploads/tasks/${task.id}/legacy/${shotId}/${filename || `${Date.now()}${ext}`}`;
          try {
            await this.cos.uploadFile(key, imagePath);
            imageUrl = this.cos.getImageUrl(key);
          } catch (e: any) {
            this.logger.warn(`COS upload failed for legacy shot ${shotId} (task ${task.id}): ${e?.message || e}`);
          }
        }

        const targetIndex = generatedShots.findIndex((s: any) => s.shotCode === shotId);
        if (targetIndex >= 0) {
          generatedShots[targetIndex] = {
            ...generatedShots[targetIndex],
            status: 'RENDERED',
            imagePath: imagePath,
            imageUrl,
            error: undefined,
          };
        } else {
          generatedShots.push({
            id: crypto.randomUUID(),
            shotCode: shotId,
            type: shot.type,
            promptEn: shot.prompt_en || shot.prompt,
            status: 'RENDERED',
            imagePath: imagePath,
            imageUrl,
          });
        }

        await persistProgress();

        this.logger.log(`✅ Shot ${shotId} rendered successfully`);

      } catch (err: any) {
        this.logger.error(`Failed to paint shot ${shotId}`, err);
        const targetIndex = generatedShots.findIndex((s: any) => s.shotCode === shotId);
        if (targetIndex >= 0) {
          generatedShots[targetIndex] = {
            ...generatedShots[targetIndex],
            status: 'FAILED',
            imagePath: undefined,
            error: err.message,
          };
        } else {
          generatedShots.push({
            id: crypto.randomUUID(),
            shotCode: shotId,
            type: shot.type,
            promptEn: shot.prompt_en || shot.prompt,
            status: 'FAILED',
            error: err.message
          });
        }

        await persistProgress();
      }
    }

    // Collect successful images
    const successfulImages = generatedShots
      .filter((s: any) => s.status === 'RENDERED' && (s.imageUrl || s.imagePath))
      .map((s: any) => (s.imageUrl || s.imagePath) as string);

    await this.db.updateTask(task.id, {
      status: successfulImages.length > 0 ? 'COMPLETED' : 'FAILED',
      resultImages: successfulImages,
      shots: generatedShots as any
    });

    this.logger.log(`Task ${task.id} Completed with ${successfulImages.length} images.`);

    // 结算（Individual 按成功张数扣费）
    try {
      if (task.userId) {
        const actual = this.billing.creditsForSuccessfulLegacyIndividualRender({
          successfulImages: successfulImages.length,
          resolution: task.resolution,
        });
        await this.billing.settleOnce({
          taskId: task.id,
          userId: task.userId,
          reserveEventKey: billingKeys?.reserveEventKey || `reserve:legacy:initial:${task.id}`,
          settleEventKey: billingKeys?.settleEventKey || `settle:legacy:initial:${task.id}`,
          actualAmount: actual,
          reason: '任务结算：单图',
        });
      }
    } catch (err: any) {
      await this.billing.markBillingError(task.id, err?.message || '结算失败');
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
      referenceImages?: string[];
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

    if (!task.shots || task.shots.length === 0) {
      throw new Error('No shots found');
    }

    // 兼容：前端可能传入 task.shots[].id（UUID）或 shotCode（如 "1"/"2"）
    const shotIndex = task.shots.findIndex((s: any) => s.id === shotId || s.shotCode === shotId);
    if (shotIndex === -1) {
      throw new Error(`Shot ${shotId} not found`);
    }

    const shot = task.shots[shotIndex] as any;
    const baseImageRef = (shot.imagePath || shot.imageUrl || '').trim();
    if (!baseImageRef) {
      throw new Error(`Shot ${shotId} has no image to edit`);
    }

    this.logger.log(`✏️ Editing shot ${shotId} with mask-based editing`);

    try {
      // Prepare images for editing
      const fs = await import('fs-extra');

      const isHttpUrl = (value: string) => value.startsWith('http://') || value.startsWith('https://');

      // Mask：允许 dataURL(base64) 或 URL（推荐：前端直传 COS URL）
      let maskRef = editData.maskImage;
      let maskPath: string | undefined;
      if (!isHttpUrl(maskRef)) {
        const maskBuffer = Buffer.from(maskRef.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        maskPath = `./uploads/masks/${Date.now()}_mask.png`;
        await fs.ensureDir('./uploads/masks');
        await fs.writeFile(maskPath, maskBuffer);
        maskRef = maskPath;
      }

      const refImages = [baseImageRef, maskRef];

      // If reference image is provided, save it
      const tmpRefPaths: string[] = [];
      const extraRefs = [
        ...((Array.isArray(editData.referenceImages) ? editData.referenceImages : []).filter((v) => typeof v === 'string' && v.trim())),
        ...(editData.referenceImage ? [editData.referenceImage] : []),
      ]
        .map((v) => String(v).trim())
        .filter(Boolean)
        .slice(0, 12);

      if (extraRefs.length > 0) {
        // 兼容：仍允许传 base64，但会先落盘再交给 Painter（Painter 侧会上传 COS 并只用 URL）
        for (const raw of extraRefs) {
          if (isHttpUrl(raw)) {
            refImages.push(raw);
            continue;
          }

          const refBuffer = Buffer.from(raw.replace(/^data:image\/\w+;base64,/, ''), 'base64');
          const referencePath = `./uploads/refs/${Date.now()}_${crypto.randomUUID()}_ref.jpg`;
          await fs.ensureDir('./uploads/refs');
          await fs.writeFile(referencePath, refBuffer);
          tmpRefPaths.push(referencePath);
          refImages.push(referencePath);
        }
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

      // 可选：上传 COS（失败不阻塞流程）
      let editedImageUrl: string | undefined;
      if (this.cos.isEnabled()) {
        const ext = path.extname(editedImagePath) || '.jpg';
        const filename = path.basename(editedImagePath);
        const key = `uploads/tasks/${task.id}/legacy/edits/${shot.shotCode || shot.id}/${filename || `${Date.now()}${ext}`}`;
        try {
          await this.cos.uploadFile(key, editedImagePath);
          editedImageUrl = this.cos.getImageUrl(key);
        } catch (e: any) {
          this.logger.warn(`COS upload failed for edited shot ${shotId} (task ${task.id}): ${e?.message || e}`);
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
        prompt: editData.prompt,
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
        .filter((s: any) => s.status === 'RENDERED' && (s.imageUrl || s.imagePath))
        .map((s: any) => (s.imageUrl || s.imagePath) as string);

      await this.db.updateTask(taskId, {
        shots: task.shots as any,
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

    const isDirectTask =
      !!task.directPrompt ||
      task.scene === 'Direct' ||
      (Array.isArray(task.shots) && task.shots.some((s: any) => s?.type === 'DirectPrompt'));

    if (isDirectTask) {
      this.logger.log(`Retry request redirected to direct regenerate for task ${taskId}`);
      await this.db.updateTask(taskId, { status: 'RENDERING', error: undefined });
      this.startDirectRendering(taskId, { useSession: false }).catch((err) => {
        this.logger.error(`Direct retry failed for task ${taskId}`, err);
        this.db.updateTask(taskId, { status: 'FAILED', error: err?.message || 'Direct retry failed' }).catch(() => undefined);
      });
      const updated = await this.db.getTask(taskId);
      if (!updated) throw new NotFoundException('Task not found');
      return updated;
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

    // UX：重绘是一个明确的渲染过程。提前把任务状态置为 RENDERING，方便前端轮询/展示“生成中”。
    // 注意：保留旧图（shots/resultImages）直到新图生成成功后覆盖回填。
    await this.db.updateTask(taskId, { status: 'RENDERING', error: undefined });

    // 生成前先校验余额：避免“先出图，后扣费失败”
    if (task.userId) {
      const estimatedCost = this.billing.creditsForSuccessfulLegacyIndividualRender({
        successfulImages: failedShots.length,
        resolution: task.resolution,
      });
      const creditCheck = await this.billing.hasEnoughCreditsForAmount(task.userId, estimatedCost);
      if (!creditCheck.enough) {
        throw new BadRequestException(`积分不足。需要 ${creditCheck.required} 积分，当前余额 ${creditCheck.balance} 积分`);
      }
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
    const billingAttemptId = crypto.randomUUID();
    let successfulThisAttempt = 0;

    const billingBaseKey = `legacy:retry:${billingAttemptId}`;
    const reserveKey = `reserve:${billingBaseKey}`;
    const settleKey = `settle:${billingBaseKey}`;

    try {
      if (task.userId) {
        const reserveAmount = this.billing.creditsForSuccessfulLegacyIndividualRender({
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

          let imageUrl: string | undefined;
          if (this.cos.isEnabled()) {
            const ext = path.extname(imagePath) || '.jpg';
            const filename = path.basename(imagePath);
            const key = `uploads/tasks/${task.id}/legacy/retry/${billingAttemptId}/${failedShot.shotCode}/${filename || `${Date.now()}${ext}`}`;
            try {
              await this.cos.uploadFile(key, imagePath);
              imageUrl = this.cos.getImageUrl(key);
            } catch (e: any) {
              this.logger.warn(`COS upload failed for legacy retry shot ${failedShot.shotCode} (task ${task.id}): ${e?.message || e}`);
            }
          }

          updatedShots[shotIndex] = {
            ...failedShot,
            status: 'RENDERED',
            imagePath: imagePath,
            imageUrl,
            error: undefined
          };

          successfulThisAttempt += 1;
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
        .filter((s: any) => s.status === 'RENDERED' && (s.imageUrl || s.imagePath))
        .map((s: any) => (s.imageUrl || s.imagePath) as string);

      await this.db.updateTask(taskId, {
        shots: updatedShots as any,
        resultImages: successfulImages,
        status: successfulImages.length > 0 ? 'COMPLETED' : 'FAILED'
      });

      this.logger.log(`Retry complete for task ${taskId}. ${successfulImages.length} total successful shots.`);

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
        } catch (err: any) {
          this.logger.error(`Billing failed for task ${taskId} (legacy retry settle)`, err);
          await this.billing.markBillingError(taskId, err?.message || '结算失败');
        }
      }

      return this.db.getTask(taskId);
    } catch (err: any) {
      // 致命失败：把任务置回 FAILED，避免长期卡在 RENDERING
      await this.db.updateTask(taskId, { status: 'FAILED', error: err?.message || '重绘失败' });
      throw err;
    }
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
      // 删除任务不自动退款：避免“出图后删除=白嫖”；失败任务默认不会扣费。
    }

    return deleted;
  }
}
