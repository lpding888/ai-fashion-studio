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
import type {
  PainterSession,
  PainterSessionMessage,
  Shot,
  TaskModel,
  UserModel,
} from '../db/models';
import { DirectPromptService } from '../direct-prompt/direct-prompt.service';
import { ModelConfigResolverService } from '../model-profile/model-config-resolver.service';
import type {
  PainterChatImage,
  PainterChatMessage,
  PainterOptions,
} from '../painter/painter.service';
import { PainterService } from '../painter/painter.service';
import { CosService } from '../cos/cos.service';
import { TaskCommonService } from './task-common.service';
import { TaskBillingService } from './task-billing.service';
import { MAX_DIRECT_SHOTS, MAX_TOTAL_IMAGES } from './task.constants';

type DirectTaskShot = Shot & {
  prompt?: string;
  prompt_en?: string;
  shot_id?: string;
};

type ScfImagePayload = {
  label: string;
  url: string;
  allowCi?: boolean;
};

type ScfShotRequest = {
  shotId: string;
  systemInstruction: string;
  history: PainterChatMessage[];
  userText: string;
  images: ScfImagePayload[];
  painterParams: PainterOptions;
};

type ScfShotResult = {
  shotId?: string;
  success?: boolean;
  imageUrl?: string;
  shootLogText?: string;
  error?: string;
};

@Injectable()
export class DirectTaskService {
  private logger = new Logger(DirectTaskService.name);

  constructor(
    private readonly db: DbService,
    private readonly painter: PainterService,
    private readonly modelConfigResolver: ModelConfigResolverService,
    private readonly billing: TaskBillingService,
    private readonly cos: CosService,
    private readonly directPrompt: DirectPromptService,
    private readonly common: TaskCommonService,
  ) {}

  private resolveErrorMessage(err: unknown, fallback: string) {
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === 'string') return err;
    return fallback;
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

  private buildDirectContactSheetAppendix(): string {
    return [
      '多姿势 Contact Sheet 规则（当输入包含多个 POSE JSON 时生效）',
      '- 你必须输出“一张图”的拼图/联排：每个 POSE 对应一个 panel（最多 4 个 panel）。',
      '- 同一个模特、同一套服装在不同 panel 重复出现，不得生成多个人物或不同身份。',
      '- Panel 布局建议：2=左右双联；3=三联横排；4=2x2 九宫格风格（四宫格）。',
      '- 禁止文字标注、编号、水印。',
    ].join('\n');
  }

  private buildDirectUserText(args: {
    userPrompt: string;
    styleBlocks: string[];
    poseBlocks: string[];
  }): string {
    const styleBlocks = (args.styleBlocks || [])
      .map((s) => String(s || '').trim())
      .filter(Boolean);
    const poseBlocks = (args.poseBlocks || [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .slice(0, 4);

    const lines: string[] = [];
    lines.push('[GOAL]');
    lines.push(
      'Generate a photorealistic fashion photo. Apply STYLE and POSE while preserving GARMENT and FACE fidelity.',
    );
    lines.push('');
    lines.push('[PRIORITY ORDER - MUST FOLLOW]');
    lines.push(
      '1) GARMENT fidelity (including TRUE garment color / hue-saturation-value) is highest priority.',
    );
    lines.push(
      '   - Do NOT shift garment color by global grading, white balance, or colored lighting. Keep garment midtones color-accurate.',
    );
    lines.push(
      '   - Preserve original garment fit/silhouette (e.g., oversized, drop-shoulder, relaxed fit). Do NOT tailor, slim-fit, or alter proportions.',
    );
    lines.push('2) FACE identity fidelity is second priority.');
    lines.push('3) POSE fidelity is third priority.');
    lines.push('4) STYLE fidelity is fourth priority.');
    lines.push('If conflicts occur, follow this order.');
    lines.push('');

    if (poseBlocks.length) {
      lines.push('[POSE_JSON_LIST]');
      lines.push(
        'These JSON objects define human pose + framing + occlusion constraints.',
      );
      lines.push('Follow each POSE strictly as specified.');
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
      lines.push(
        'This JSON object defines the photographic style blueprint (lighting, scene, grading, camera).',
      );
      lines.push(
        'Apply STYLE mainly to background/atmosphere. If STYLE grading conflicts with GARMENT color accuracy, GARMENT color wins.',
      );
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
    shotCount?: number;
    layoutMode?: TaskModel['layout_mode'];
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
      await this.modelConfigResolver.resolvePainterRuntimeFromSnapshot(
        configSnapshot,
      );
    }

    const resolution = args.resolution || '2K';
    const aspectRatio = args.aspectRatio;
    const layoutMode = args.layoutMode === 'Grid' ? 'Grid' : 'Individual';
    const rawShotCount = Number.isFinite(args.shotCount)
      ? Math.floor(args.shotCount)
      : 1;
    const normalizedShotCount = rawShotCount > 0 ? rawShotCount : 1;
    const shotCount = layoutMode === 'Grid' ? 1 : normalizedShotCount;
    if (shotCount > MAX_DIRECT_SHOTS) {
      throw new BadRequestException(`直出图最多 ${MAX_DIRECT_SHOTS} 张`);
    }

    // 积分：生成前先校验余额；真正扣费在“成功出图并产生图片链接”之后（通过 reserve/settle 实现）
    const estimated = this.billing.estimateLegacyTaskCredits({
      shotCount,
      layoutMode,
      resolution,
    });
    const creditCheck = await this.billing.hasEnoughCreditsForAmount(
      user.id,
      estimated,
    );
    if (!creditCheck.enough) {
      throw new Error(
        `积分不足。需要 ${creditCheck.required} 积分，当前余额 ${creditCheck.balance} 积分`,
      );
    }

    const normalizePath = (p: string) => p.replace(/\\/g, '/');
    const garmentImagePaths = (args.garmentFiles || []).map((f) =>
      normalizePath(f.path),
    );
    if (garmentImagePaths.length > 6) {
      throw new BadRequestException('衣服图片最多 6 张');
    }

    // Face presets（最多 3，不占 6 张衣服限制）
    const facePresetIds = Array.isArray(args.facePresetIds)
      ? args.facePresetIds.slice(0, 3)
      : [];
    const faceRefPaths: string[] = [];
    if (facePresetIds.length) {
      for (const id of facePresetIds) {
        const preset = await this.db.getFacePreset(id);
        if (!preset) continue;
        // FacePreset 已包含 userId；这里做一次最小隔离
        if (
          preset.userId &&
          user.role !== 'ADMIN' &&
          preset.userId !== user.id
        ) {
          throw new BadRequestException('无权访问该模特预设');
        }
        faceRefPaths.push(String(preset.imagePath || '').trim());
      }
    }

    // Style/Pose presets：仅展开 prompt blocks（不要把风格/姿势参考图发给生图模型）
    const stylePresetIds = Array.isArray(args.stylePresetIds)
      ? args.stylePresetIds.filter(Boolean)
      : [];
    if (stylePresetIds.length > 1) {
      throw new BadRequestException('风格只能选择 1 个');
    }
    const posePresetIds = Array.isArray(args.posePresetIds)
      ? args.posePresetIds.filter(Boolean)
      : [];
    if (posePresetIds.length > 4) {
      throw new BadRequestException('姿势最多选择 4 个');
    }

    const styleBlocks: string[] = [];
    const poseBlocks: string[] = [];

    for (const id of stylePresetIds) {
      const preset = await this.db.getStylePreset(id);
      if (!preset) continue;
      if (preset.learnStatus === 'FAILED') continue;
      if (preset.kind === 'POSE') continue;
      this.common.requireOwnerOrAdminForPreset(preset, user, '风格');
      const block = String(preset.promptBlock || preset.styleHint || '').trim();
      if (block) styleBlocks.push(block);
    }

    for (const id of posePresetIds) {
      const preset = await this.db.getStylePreset(id);
      if (!preset) continue;
      if (preset.learnStatus === 'FAILED') continue;
      if (preset.kind !== 'POSE') continue;
      this.common.requireOwnerOrAdminForPreset(preset, user, '姿势');
      const block = String(preset.promptBlock || '').trim();
      if (block) poseBlocks.push(block);
    }

    const totalImages = garmentImagePaths.length + faceRefPaths.length;
    if (totalImages > MAX_TOTAL_IMAGES) {
      throw new BadRequestException(
        `总参考图数量过多（${totalImages}），上限 ${MAX_TOTAL_IMAGES}`,
      );
    }

    const userPrompt = String(args.prompt || '').trim();
    if (!userPrompt) throw new BadRequestException('prompt 不能为空');

    const contactSheetAppendix =
      layoutMode === 'Grid' && poseBlocks.length >= 2
        ? this.buildDirectContactSheetAppendix()
        : '';
    const finalUserPrompt = contactSheetAppendix
      ? `${userPrompt}\n\n${contactSheetAppendix}`
      : userPrompt;

    const resolvePoseBlocksForShot = (index: number) => {
      if (layoutMode === 'Grid') return poseBlocks;
      if (!poseBlocks.length) return [];
      return [poseBlocks[index % poseBlocks.length]];
    };

    const shots: DirectTaskShot[] = Array.from(
      { length: shotCount },
      (_, index) => {
        const shotPoseBlocks = resolvePoseBlocksForShot(index);
        const userText = this.buildDirectUserText({
          userPrompt: finalUserPrompt,
          styleBlocks,
          poseBlocks: shotPoseBlocks,
        });
        return {
          id: crypto.randomUUID(),
          shotCode: String(index + 1),
          promptEn: userText,
          prompt: userText,
          type: 'DirectPrompt',
          status: 'PENDING',
        };
      },
    );
    const now = Date.now();
    const task: TaskModel = {
      id: taskId,
      userId: user.id,
      createdAt: now,
      requirements: userPrompt,
      shotCount,
      layoutMode,
      layout_mode: layoutMode,
      scene: 'Direct',
      resolution,
      garmentImagePaths,
      faceRefPaths,
      styleRefPaths: [], // 直出图：不发送风格参考图
      poseRefPaths: [], // 直出图：不发送姿势参考图
      aspectRatio,
      status: 'RENDERING',
      resultImages: [],
      config: this.common.stripSecretsFromConfig(configSnapshot),
      shots,
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
        messages: [
          {
            role: 'user',
            text: String(shots[0]?.promptEn || '').trim(),
            createdAt: now,
          },
        ],
      },
    };

    await this.db.saveTask(task);

    // 异步执行（不阻塞接口返回）
    void this.startDirectRendering(taskId, { useSession: true }).catch(
      (err) => {
        const errorMessage = this.resolveErrorMessage(
          err,
          'Direct rendering failed',
        );
        this.logger.error(`Direct rendering failed for task ${taskId}`, err);
        void this.db
          .updateTask(taskId, {
            status: 'FAILED',
            error: errorMessage,
          })
          .catch(() => undefined);
      },
    );

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
    shotCount?: number;
    layoutMode?: TaskModel['layout_mode'];
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
      await this.modelConfigResolver.resolvePainterRuntimeFromSnapshot(
        configSnapshot,
      );
    }

    const resolution = args.resolution || '2K';
    const aspectRatio = args.aspectRatio;
    const layoutMode = args.layoutMode === 'Grid' ? 'Grid' : 'Individual';
    const rawShotCount = Number.isFinite(args.shotCount)
      ? Math.floor(args.shotCount)
      : 1;
    const normalizedShotCount = rawShotCount > 0 ? rawShotCount : 1;
    const shotCount = layoutMode === 'Grid' ? 1 : normalizedShotCount;
    if (shotCount > MAX_DIRECT_SHOTS) {
      throw new BadRequestException(`直出图最多 ${MAX_DIRECT_SHOTS} 张`);
    }

    // 积分：生成前先校验余额；真正扣费在“成功出图并产生图片链接”之后（通过 reserve/settle 实现）
    const estimated = this.billing.estimateLegacyTaskCredits({
      shotCount,
      layoutMode,
      resolution,
    });
    const creditCheck = await this.billing.hasEnoughCreditsForAmount(
      user.id,
      estimated,
    );
    if (!creditCheck.enough) {
      throw new Error(
        `积分不足。需要 ${creditCheck.required} 积分，当前余额 ${creditCheck.balance} 积分`,
      );
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
      if (!this.common.isAllowedCosImageUrl(u)) {
        throw new BadRequestException(
          '衣服图片必须为 COS URL（https://*.cos.*.myqcloud.com/...)',
        );
      }
    }

    // Face presets（最多 3，不占“衣服张数”，但占总参考图 14 上限）
    const facePresetIds = Array.isArray(args.facePresetIds)
      ? args.facePresetIds.slice(0, 3)
      : [];
    const faceRefPaths: string[] = [];
    if (facePresetIds.length) {
      for (const id of facePresetIds) {
        const preset = await this.db.getFacePreset(id);
        if (!preset) continue;
        if (
          preset.userId &&
          user.role !== 'ADMIN' &&
          preset.userId !== user.id
        ) {
          throw new BadRequestException('无权访问该模特预设');
        }
        const p = String(preset.imagePath || '').trim();
        if (p) faceRefPaths.push(p);
      }
    }

    // 总参考图上限：衣服+人脸<=14
    const totalImages = garmentImagePaths.length + faceRefPaths.length;
    if (totalImages > MAX_TOTAL_IMAGES) {
      throw new BadRequestException(
        `总参考图数量过多（${totalImages}），上限 ${MAX_TOTAL_IMAGES}`,
      );
    }

    // Style/Pose presets：仅展开 prompt blocks（不要把风格/姿势参考图发给生图模型）
    const stylePresetIds = Array.isArray(args.stylePresetIds)
      ? args.stylePresetIds.filter(Boolean)
      : [];
    if (stylePresetIds.length > 1) {
      throw new BadRequestException('风格只能选择 1 个');
    }
    const posePresetIds = Array.isArray(args.posePresetIds)
      ? args.posePresetIds.filter(Boolean)
      : [];
    if (posePresetIds.length > 4) {
      throw new BadRequestException('姿势最多选择 4 个');
    }

    const styleBlocks: string[] = [];
    const poseBlocks: string[] = [];

    for (const id of stylePresetIds) {
      const preset = await this.db.getStylePreset(id);
      if (!preset) continue;
      if (preset.learnStatus === 'FAILED') continue;
      if (preset.kind === 'POSE') continue;
      this.common.requireOwnerOrAdminForPreset(preset, user, '风格');
      const block = String(preset.promptBlock || preset.styleHint || '').trim();
      if (block) styleBlocks.push(block);
    }

    for (const id of posePresetIds) {
      const preset = await this.db.getStylePreset(id);
      if (!preset) continue;
      if (preset.learnStatus === 'FAILED') continue;
      if (preset.kind !== 'POSE') continue;
      this.common.requireOwnerOrAdminForPreset(preset, user, '姿势');
      const block = String(preset.promptBlock || '').trim();
      if (block) poseBlocks.push(block);
    }

    const userPrompt = String(args.prompt || '').trim();
    if (!userPrompt) throw new BadRequestException('prompt 不能为空');

    const contactSheetAppendix =
      layoutMode === 'Grid' && poseBlocks.length >= 2
        ? this.buildDirectContactSheetAppendix()
        : '';
    const finalUserPrompt = contactSheetAppendix
      ? `${userPrompt}\n\n${contactSheetAppendix}`
      : userPrompt;

    const resolvePoseBlocksForShot = (index: number) => {
      if (layoutMode === 'Grid') return poseBlocks;
      if (!poseBlocks.length) return [];
      return [poseBlocks[index % poseBlocks.length]];
    };

    const shots: DirectTaskShot[] = Array.from(
      { length: shotCount },
      (_, index) => {
        const shotPoseBlocks = resolvePoseBlocksForShot(index);
        const userText = this.buildDirectUserText({
          userPrompt: finalUserPrompt,
          styleBlocks,
          poseBlocks: shotPoseBlocks,
        });
        return {
          id: crypto.randomUUID(),
          shotCode: String(index + 1),
          promptEn: userText,
          prompt: userText,
          type: 'DirectPrompt',
          status: 'PENDING',
        };
      },
    );
    const now = Date.now();
    const task: TaskModel = {
      id: taskId,
      userId: user.id,
      createdAt: now,
      requirements: userPrompt,
      shotCount,
      layoutMode,
      layout_mode: layoutMode,
      scene: 'Direct',
      resolution,
      garmentImagePaths,
      faceRefPaths,
      styleRefPaths: [], // 直出图：不发送风格参考图
      poseRefPaths: [], // 直出图：不发送姿势参考图
      aspectRatio,
      status: 'RENDERING',
      resultImages: [],
      config: this.common.stripSecretsFromConfig(configSnapshot),
      shots,
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
        messages: [
          {
            role: 'user',
            text: String(shots[0]?.promptEn || '').trim(),
            createdAt: now,
          },
        ],
      },
    };

    await this.db.saveTask(task);

    // 异步执行（不阻塞接口返回）
    void this.startDirectRendering(taskId, { useSession: true }).catch(
      (err) => {
        const errorMessage = this.resolveErrorMessage(
          err,
          'Direct rendering failed',
        );
        this.logger.error(`Direct rendering failed for task ${taskId}`, err);
        void this.db
          .updateTask(taskId, {
            status: 'FAILED',
            error: errorMessage,
          })
          .catch(() => undefined);
      },
    );

    return task;
  }

  async regenerateDirectTask(
    taskId: string,
    user: UserModel,
  ): Promise<TaskModel> {
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
    void this.startDirectRendering(taskId, { useSession: false }).catch(
      (err) => {
        const errorMessage = this.resolveErrorMessage(
          err,
          'Direct regenerate failed',
        );
        this.logger.error(`Direct regenerate failed for task ${taskId}`, err);
        void this.db
          .updateTask(taskId, {
            status: 'FAILED',
            error: errorMessage,
          })
          .catch(() => undefined);
      },
    );

    const updated = await this.db.getTask(taskId);
    if (!updated) throw new NotFoundException('Task not found');
    return updated;
  }

  async retryDirectTask(taskId: string): Promise<TaskModel> {
    const task = await this.db.getTask(taskId);
    if (!task) throw new NotFoundException('Task not found');

    const shots = Array.isArray(task.shots)
      ? (task.shots as Array<{ type?: string }>)
      : [];
    const isDirectTask =
      !!task.directPrompt ||
      task.scene === 'Direct' ||
      shots.some((shot) => shot?.type === 'DirectPrompt');
    if (!isDirectTask) {
      throw new BadRequestException('该任务不是直出图任务');
    }

    await this.db.updateTask(taskId, {
      status: 'RENDERING',
      error: undefined,
    });

    void this.startDirectRendering(taskId, { useSession: false }).catch(
      (err) => {
        const errorMessage = this.resolveErrorMessage(
          err,
          'Direct retry failed',
        );
        this.logger.error(`Direct retry failed for task ${taskId}`, err);
        void this.db
          .updateTask(taskId, {
            status: 'FAILED',
            error: errorMessage,
          })
          .catch(() => undefined);
      },
    );

    const updated = await this.db.getTask(taskId);
    if (!updated) throw new NotFoundException('Task not found');
    return updated;
  }

  async directMessage(
    taskId: string,
    user: UserModel,
    message: string,
  ): Promise<TaskModel> {
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

    const session: PainterSession = task.directPainterSession || {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };

    // 兜底：若历史中没有 base prompt，则用当前 shot.promptEn 补上（保证对话有上下文锚点）
    const shots: DirectTaskShot[] = Array.isArray(task.shots) ? task.shots : [];
    const shot = shots[0];
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
    });

    void this.startDirectRendering(taskId, { useSession: true }).catch(
      (err) => {
        const errorMessage = this.resolveErrorMessage(
          err,
          'Direct message failed',
        );
        this.logger.error(`Direct message failed for task ${taskId}`, err);
        void this.db
          .updateTask(taskId, {
            status: 'FAILED',
            error: errorMessage,
          })
          .catch(() => undefined);
      },
    );

    const updated = await this.db.getTask(taskId);
    if (!updated) throw new NotFoundException('Task not found');
    return updated;
  }

  async startDirectRendering(taskId: string, opts?: { useSession?: boolean }) {
    const task = await this.db.getTask(taskId);
    if (!task) throw new NotFoundException('Task not found');

    const painterRuntime =
      process.env.MOCK_PAINTER === 'true'
        ? undefined
        : await this.common.resolvePainterRuntime(task);

    const attemptCreatedAt = Date.now();
    const billingBaseKey = `direct:${attemptCreatedAt}`;
    const reserveKey = `reserve:${billingBaseKey}`;
    const settleKey = `settle:${billingBaseKey}`;

    let didReserve = false;

    try {
      const shots: DirectTaskShot[] = Array.isArray(task.shots)
        ? task.shots
        : [];
      const layoutMode: TaskModel['layout_mode'] =
        task.layout_mode === 'Grid' || task.layoutMode === 'Grid'
          ? 'Grid'
          : 'Individual';
      const rawShotCount = Number.isFinite(task.shotCount)
        ? Math.floor(task.shotCount)
        : 1;
      const normalizedShotCount = rawShotCount > 0 ? rawShotCount : 1;
      const shotCount = layoutMode === 'Grid' ? 1 : normalizedShotCount;
      const shotsToRender = shots.slice(0, Math.min(shotCount, shots.length));
      if (!shotsToRender.length) throw new Error('No shot found');

      // 预扣：按张数（失败则全退）
      // 注意：必须放在 try 内，避免后续前置校验/调用失败导致“已扣费但未退款”。
      if (task.userId) {
        const reserveAmount = this.billing.estimateLegacyTaskCredits({
          shotCount: shotsToRender.length,
          layoutMode,
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

      const firstShot = shotsToRender[0];
      const fallbackUserText = String(
        firstShot?.promptEn || firstShot?.prompt || '',
      ).trim();
      if (!fallbackUserText)
        throw new Error('Direct task missing base promptEn');

      const useSession = !!opts?.useSession;

      // 重绘：严格使用 baseUserText，不受对话内容影响（“任务原始提示词重绘”）
      // 对话：使用 directPainterSession 的最后一条 user message + 其前序作为 history。
      const session = useSession ? task.directPainterSession : undefined;
      const rawMsgs: PainterSessionMessage[] = Array.isArray(session?.messages)
        ? session.messages
        : [];
      const lastUserIdx = (() => {
        for (let i = rawMsgs.length - 1; i >= 0; i--) {
          if (
            rawMsgs[i]?.role === 'user' &&
            String(rawMsgs[i]?.text || '').trim()
          )
            return i;
        }
        return -1;
      })();
      const userMessages = rawMsgs.filter(
        (m) => m?.role === 'user' && String(m?.text || '').trim(),
      );
      const hasUserOverride = userMessages.length > 1;

      const history: PainterChatMessage[] =
        lastUserIdx >= 0
          ? rawMsgs
              .slice(0, lastUserIdx)
              .map((m) => ({ role: m.role, text: String(m.text || '') }))
          : [];

      const images: PainterChatImage[] = [
        ...(task.garmentImagePaths || []).map((p, idx) => ({
          label: `GARMENT_${idx + 1}`,
          pathOrUrl: p,
        })),
        ...(task.faceRefPaths || []).map((p, idx) => ({
          label: `FACE_${idx + 1}`,
          pathOrUrl: p,
          allowCi: false,
        })),
      ];

      const baseSeed =
        typeof task.directSeed === 'number'
          ? Number(task.directSeed)
          : undefined;
      const updatedShots: DirectTaskShot[] = [];
      const resultImages: string[] = [];
      const nextSession: PainterSession | undefined =
        useSession && session
          ? {
              ...session,
              messages: Array.isArray(session.messages)
                ? [...session.messages]
                : [],
            }
          : undefined;

      const useScf = this.painter.isScfEnabled();
      if (useScf) {
        let scfCommitted = false;
        try {
          const systemInstruction = await this.buildDirectSystemInstruction();
          const shotRequests: ScfShotRequest[] = [];
          const shotMetas: Array<{
            shot: DirectTaskShot;
            shotId: string;
            userText: string;
          }> = [];
          const scfUpdatedShots: DirectTaskShot[] = [];
          const scfResultImages: string[] = [];
          const scfSession =
            useSession && nextSession
              ? {
                  ...nextSession,
                  messages: Array.isArray(nextSession.messages)
                    ? [...nextSession.messages]
                    : [],
                }
              : undefined;

          for (let i = 0; i < shotsToRender.length; i += 1) {
            const currentShot = shotsToRender[i];
            const baseUserText = String(
              currentShot?.promptEn || currentShot?.prompt || fallbackUserText,
            ).trim();
            const userText =
              useSession && hasUserOverride && lastUserIdx >= 0
                ? String(rawMsgs[lastUserIdx].text || '').trim()
                : baseUserText;
            const seed = typeof baseSeed === 'number' ? baseSeed + i : undefined;
            const shotId = String(
              currentShot?.id ||
                currentShot?.shotCode ||
                currentShot?.shot_id ||
                `${i + 1}`,
            ).trim();

            shotRequests.push({
              shotId,
              systemInstruction,
              history,
              userText,
              images: images.map((img) => ({
                label: img.label,
                url: img.pathOrUrl,
                allowCi: img.allowCi,
              })),
              painterParams: {
                aspectRatio: task.aspectRatio,
                imageSize: task.resolution ?? '2K',
                ...(typeof seed === 'number' ? { seed } : {}),
                temperature: task.directTemperature,
                responseModalities: ['IMAGE'],
                ...(task.directIncludeThoughts
                  ? {
                      thinkingConfig: {
                        includeThoughts: true,
                        thinkingBudget: -1,
                      },
                    }
                  : {}),
              },
            });
            shotMetas.push({ shot: currentShot, shotId, userText });
          }

          const results = (await this.painter.generateImagesViaScf({
            taskId,
            shots: shotRequests,
            config: painterRuntime,
          })) as ScfShotResult[];

          const resultMap = new Map<string, ScfShotResult>();
          for (const r of results) {
            if (r?.shotId) resultMap.set(String(r.shotId), r);
          }

          for (let i = 0; i < shotMetas.length; i += 1) {
            const { shot: currentShot, shotId, userText } = shotMetas[i];
            const r = resultMap.get(shotId) || results[i];
            const imageUrl =
              r?.success && r?.imageUrl ? String(r.imageUrl).trim() : '';
            const shootLogText = r?.shootLogText || '';

            if (imageUrl) {
              if (useSession && scfSession) {
                const t = String(shootLogText || '').trim();
                if (t) {
                  const ts = Date.now();
                  scfSession.updatedAt = ts;
                  scfSession.messages.push({
                    role: 'model',
                    text: t,
                    createdAt: ts,
                  });
                  if (scfSession.messages.length > 20)
                    scfSession.messages = scfSession.messages.slice(-20);
                }
              }

              const versions = Array.isArray(currentShot.versions)
                ? currentShot.versions
                : [];
              if (
                versions.length === 0 &&
                (currentShot.imagePath || currentShot.imageUrl)
              ) {
                versions.push({
                  versionId: 1,
                  imagePath: currentShot.imageUrl || currentShot.imagePath,
                  prompt: String(
                    currentShot.promptEn || currentShot.prompt || '',
                  ),
                  createdAt: Date.now() - 1000,
                });
              }

              const newVersion = {
                versionId: versions.length + 1,
                imagePath: imageUrl,
                prompt: userText,
                createdAt: attemptCreatedAt,
              };
              versions.push(newVersion);

              const updatedShot: DirectTaskShot = {
                ...currentShot,
                status: 'RENDERED',
                imagePath: imageUrl,
                imageUrl,
                promptEn: userText,
                prompt: userText,
                shootLog: (shootLogText || '').trim(),
                versions,
                currentVersion: newVersion.versionId,
                error: undefined,
              };

              scfUpdatedShots.push(updatedShot);
              scfResultImages.push(imageUrl);
            } else {
              const hadPreviousImage =
                !!currentShot.imageUrl || !!currentShot.imagePath;
              const failedShot: DirectTaskShot = {
                ...currentShot,
                status: hadPreviousImage ? 'RENDERED' : 'FAILED',
                error: r?.error || 'Direct rendering failed',
              };
              scfUpdatedShots.push(failedShot);
            }
          }

          const nextShots = [
            ...scfUpdatedShots,
            ...shots.slice(scfUpdatedShots.length),
          ];
          if (useSession && scfSession) {
            task.directPainterSession = scfSession;
          }

          await this.db.updateTask(taskId, {
            status: scfResultImages.length > 0 ? 'COMPLETED' : 'FAILED',
            shots: nextShots,
            resultImages: scfResultImages,
            error:
              scfResultImages.length > 0 ? undefined : 'Direct rendering failed',
            ...(useSession && task.directPainterSession
              ? { directPainterSession: task.directPainterSession }
              : {}),
          });
          scfCommitted = true;

          if (task.userId && didReserve) {
            const actual =
              layoutMode === 'Grid'
                ? scfResultImages.length > 0
                  ? this.billing.creditsForSuccessfulLegacyGridRender({
                      resolution: task.resolution,
                    })
                  : 0
                : this.billing.creditsForSuccessfulLegacyIndividualRender({
                    successfulImages: scfResultImages.length,
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
            } catch (err) {
              const errorMessage = this.resolveErrorMessage(
                err,
                '直出图结算失败',
              );
              this.logger.error(
                `Billing failed for task ${taskId} (direct settle success)`,
                err,
              );
              await this.billing.markBillingError(taskId, errorMessage);
            }
          }

          return;
        } catch (err) {
          this.logger.warn(
            `SCF direct rendering failed for task ${taskId}, fallback to direct painter`,
            err,
          );
          if (scfCommitted) throw err;
        }
      }

      for (let i = 0; i < shotsToRender.length; i += 1) {
        const currentShot = shotsToRender[i];
        const baseUserText = String(
          currentShot?.promptEn || currentShot?.prompt || fallbackUserText,
        ).trim();
        const userText =
          useSession && hasUserOverride && lastUserIdx >= 0
            ? String(rawMsgs[lastUserIdx].text || '').trim()
            : baseUserText;
        const seed = typeof baseSeed === 'number' ? baseSeed + i : undefined;

        const r = await this.painter.generateImageWithChatSessionWithLog({
          systemInstruction: await this.buildDirectSystemInstruction(),
          history,
          userText,
          images,
          options: {
            aspectRatio: task.aspectRatio,
            imageSize: task.resolution ?? '2K',
            ...(typeof seed === 'number' ? { seed } : {}),
            temperature: task.directTemperature,
            responseModalities: ['IMAGE'],
            ...(task.directIncludeThoughts
              ? {
                  thinkingConfig: {
                    includeThoughts: true,
                    thinkingBudget: -1,
                  },
                }
              : {}),
          },
          config: painterRuntime,
          context: { taskId, stage: 'direct_generate' },
        });

        const imagePath = r.imagePath;
        const shootLogText = r.shootLogText;

        // 对话模式：把模型返回的 TEXT（shootLog）写回 session，作为后续对话的“上文”
        if (useSession && nextSession) {
          const t = String(shootLogText || '').trim();
          if (t) {
            const ts = Date.now();
            nextSession.updatedAt = ts;
            nextSession.messages.push({
              role: 'model',
              text: t,
              createdAt: ts,
            });
            if (nextSession.messages.length > 20)
              nextSession.messages = nextSession.messages.slice(-20);
          }
        }

        // 上传 COS（失败则退化为本地路径）
        let imageUrl: string | undefined;
        const isHttpUrl = (value: string) =>
          value.startsWith('http://') || value.startsWith('https://');
        if (isHttpUrl(imagePath)) {
          imageUrl = imagePath;
        } else if (this.cos.isEnabled()) {
          const ext = path.extname(imagePath) || '.jpg';
          const key = `uploads/tasks/${taskId}/direct/${attemptCreatedAt}_${crypto.randomUUID()}${ext}`;
          try {
            await this.cos.uploadFile(key, imagePath);
            imageUrl = this.cos.getImageUrl(key);
          } catch (err) {
            const errorMessage = this.resolveErrorMessage(
              err,
              'COS upload failed',
            );
            this.logger.warn(
              `COS upload failed for direct task ${taskId}`,
              errorMessage,
            );
          }
        }

        const versions = Array.isArray(currentShot.versions)
          ? currentShot.versions
          : [];
        if (
          versions.length === 0 &&
          (currentShot.imagePath || currentShot.imageUrl)
        ) {
          versions.push({
            versionId: 1,
            imagePath: currentShot.imageUrl || currentShot.imagePath,
            prompt: String(currentShot.promptEn || currentShot.prompt || ''),
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

        const updatedShot: DirectTaskShot = {
          ...currentShot,
          status: 'RENDERED',
          imagePath,
          imageUrl,
          promptEn: userText,
          prompt: userText,
          shootLog: (shootLogText || '').trim(),
          versions,
          currentVersion: newVersion.versionId,
        };

        updatedShots.push(updatedShot);
        if (imageUrl || imagePath) resultImages.push(imageUrl || imagePath);
      }

      const nextShots = [...updatedShots, ...shots.slice(updatedShots.length)];
      if (useSession && nextSession) {
        task.directPainterSession = nextSession;
      }

      await this.db.updateTask(taskId, {
        status: 'COMPLETED',
        shots: nextShots,
        resultImages,
        error: undefined,
        ...(useSession && task.directPainterSession
          ? { directPainterSession: task.directPainterSession }
          : {}),
      });

      // 结算：成功 N 张
      if (task.userId && didReserve) {
        const actual =
          layoutMode === 'Grid'
            ? this.billing.creditsForSuccessfulLegacyGridRender({
                resolution: task.resolution,
              })
            : this.billing.creditsForSuccessfulLegacyIndividualRender({
                successfulImages: shotsToRender.length,
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
        } catch (err) {
          const errorMessage = this.resolveErrorMessage(err, '直出图结算失败');
          this.logger.error(
            `Billing failed for task ${taskId} (direct settle success)`,
            err,
          );
          await this.billing.markBillingError(taskId, errorMessage);
        }
      }
    } catch (err) {
      const errorMessage = this.resolveErrorMessage(
        err,
        'Direct rendering failed',
      );
      // 失败：全额退款
      await this.db.updateTask(taskId, {
        status: 'FAILED',
        error: errorMessage,
      });
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
        } catch (refundErr) {
          const refundMessage = this.resolveErrorMessage(
            refundErr,
            '直出图失败结算失败',
          );
          this.logger.error(
            `Billing failed for task ${taskId} (direct settle failure refund)`,
            refundErr,
          );
          await this.billing.markBillingError(taskId, refundMessage);
        }
      }
      throw err;
    }
  }
}
