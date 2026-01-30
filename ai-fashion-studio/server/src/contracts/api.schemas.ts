import { z } from 'zod';
import { DIRECT_LAYOUT_MODES, MAX_DIRECT_SHOTS } from '../task/task.constants';

export const TestConnectionBodySchema = z
  .object({
    gateway: z.string().trim().min(1, 'gateway 不能为空'),
    apiKey: z.string().trim().min(1, 'apiKey 不能为空'),
    model: z.string().trim().optional(),
  })
  .strict();

export const BrainPromptCreateVersionBodySchema = z
  .object({
    content: z.string().trim().min(1, 'content 不能为空'),
    note: z.string().trim().optional(),
    publish: z.boolean().optional(),
  })
  .strict();

export const BrainPromptPublishBodySchema = z
  .object({
    versionId: z.string().trim().min(1, 'versionId 不能为空'),
  })
  .strict();

export const BrainPromptAbCompareBodySchema = z
  .object({
    taskId: z.string().trim().min(1, 'taskId 不能为空'),
    versionA: z.string().trim().min(1, 'versionA 不能为空'),
    versionB: z.string().trim().min(1, 'versionB 不能为空'),
  })
  .strict();

export const CosCredentialsBodySchema = z
  .object({
    userId: z.string().trim().optional(),
  })
  .passthrough();

export const CosImageUrlBodySchema = z
  .object({
    key: z.string().trim().min(1, 'key 不能为空'),
    format: z.enum(['webp', 'avif', 'heif']).optional(),
    quality: z.coerce.number().optional(),
    width: z.coerce.number().optional(),
  })
  .passthrough();

export const CosOptimizedUrlBodySchema = z
  .object({
    key: z.string().trim().min(1, 'key 不能为空'),
  })
  .passthrough();

export const McpMessageBodySchema = z.unknown();

export const UpdateQcStatusBodySchema = z
  .object({
    qcStatus: z.enum(['APPROVED', 'NEEDS_FIX']),
  })
  .strict();

export const FixShotBodySchema = z
  .object({
    feedback: z.string().trim().min(1, 'feedback 不能为空'),
  })
  .strict();

export const WorkflowPromptPackSchema = z
  .object({
    plannerSystemPrompt: z.string().trim().min(1, 'plannerSystemPrompt 不能为空'),
    painterSystemPrompt: z.string().trim().min(1, 'painterSystemPrompt 不能为空'),
  })
  .strict();

export const CreateWorkflowPromptBodySchema = z
  .object({
    pack: WorkflowPromptPackSchema,
    note: z.string().trim().optional(),
    publish: z.boolean().optional(),
  })
  .strict();

export const PublishWorkflowPromptBodySchema = z
  .object({
    versionId: z.string().trim().min(1, 'versionId 不能为空'),
  })
  .strict();

const TaskStatusSchema = z.enum([
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
]);

export const GetTasksQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    scope: z.enum(['all', 'mine']).optional(),
    userId: z.string().uuid().optional(),
    q: z.string().trim().max(200).optional(),
    directOnly: z.preprocess((v) => {
      if (v === undefined || v === null || v === '') return undefined;
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v === 1;
      if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (s === 'true' || s === '1' || s === 'yes') return true;
        if (s === 'false' || s === '0' || s === 'no') return false;
      }
      return undefined;
    }, z.boolean().optional()),
    direct_only: z.preprocess((v) => {
      if (v === undefined || v === null || v === '') return undefined;
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v === 1;
      if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (s === 'true' || s === '1' || s === 'yes') return true;
        if (s === 'false' || s === '0' || s === 'no') return false;
      }
      return undefined;
    }, z.boolean().optional()),
    favoriteOnly: z.preprocess((v) => {
      if (v === undefined || v === null || v === '') return undefined;
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v === 1;
      if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (s === 'true' || s === '1' || s === 'yes') return true;
        if (s === 'false' || s === '0' || s === 'no') return false;
      }
      return undefined;
    }, z.boolean().optional()),
    favorite_only: z.preprocess((v) => {
      if (v === undefined || v === null || v === '') return undefined;
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v === 1;
      if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (s === 'true' || s === '1' || s === 'yes') return true;
        if (s === 'false' || s === '0' || s === 'no') return false;
      }
      return undefined;
    }, z.boolean().optional()),
    status: TaskStatusSchema.optional(),
  })
  .passthrough();

export const EditShotBodySchema = z
  .object({
    maskImage: z.string().trim().min(1, 'maskImage 不能为空'),
    referenceImage: z.string().trim().min(1).optional(),
    referenceImages: z.array(z.string().trim().min(1)).max(12).optional(),
    prompt: z.string().trim().min(1, 'prompt 不能为空'),
    editMode: z.string().trim().min(1).optional(),
  })
  .strict();

export const CreateDirectTaskBodySchema = z
  .object({
    prompt: z.string().trim().min(1, 'prompt 不能为空'),
    resolution: z.enum(['1K', '2K', '4K']).optional(),
    aspectRatio: z
      .enum(['1:1', '4:3', '3:4', '16:9', '9:16', '21:9'])
      .optional(),
    aspect_ratio: z
      .enum(['1:1', '4:3', '3:4', '16:9', '9:16', '21:9'])
      .optional(),
    style_preset_ids: z.string().trim().optional(),
    pose_preset_ids: z.string().trim().optional(),
    face_preset_ids: z.string().trim().optional(),
    layout_mode: z.enum(DIRECT_LAYOUT_MODES).optional(),
    layoutMode: z.enum(DIRECT_LAYOUT_MODES).optional(),
    shot_count: z.preprocess((v) => {
      if (v === undefined || v === null || v === '') return undefined;
      return Number(v);
    }, z.number().int().min(1).max(MAX_DIRECT_SHOTS).optional()),
    shotCount: z.preprocess((v) => {
      if (v === undefined || v === null || v === '') return undefined;
      return Number(v);
    }, z.number().int().min(1).max(MAX_DIRECT_SHOTS).optional()),
    includeThoughts: z.preprocess((v) => {
      if (v === undefined || v === null || v === '') return undefined;
      if (typeof v === 'boolean') return v;
      if (typeof v !== 'string' && typeof v !== 'number') return undefined;
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

export const CreateDirectUrlsTaskBodySchema = z
  .object({
    prompt: z.string().trim().min(1, 'prompt 不能为空'),
    garmentUrls: z
      .array(z.string().trim().min(1))
      .min(1, '至少需要 1 张衣服图片')
      .max(14),
    resolution: z.enum(['1K', '2K', '4K']).optional(),
    aspectRatio: z
      .enum(['1:1', '4:3', '3:4', '16:9', '9:16', '21:9'])
      .optional(),
    aspect_ratio: z
      .enum(['1:1', '4:3', '3:4', '16:9', '9:16', '21:9'])
      .optional(),
    stylePresetIds: z.array(z.string().trim().min(1)).max(1).optional(),
    posePresetIds: z.array(z.string().trim().min(1)).max(4).optional(),
    facePresetIds: z.array(z.string().trim().min(1)).max(3).optional(),
    layoutMode: z.enum(DIRECT_LAYOUT_MODES).optional(),
    layout_mode: z.enum(DIRECT_LAYOUT_MODES).optional(),
    shotCount: z.coerce.number().int().min(1).max(MAX_DIRECT_SHOTS).optional(),
    shot_count: z.coerce.number().int().min(1).max(MAX_DIRECT_SHOTS).optional(),
    includeThoughts: z.preprocess((v) => {
      if (v === undefined || v === null || v === '') return undefined;
      if (typeof v === 'boolean') return v;
      if (typeof v !== 'string' && typeof v !== 'number') return undefined;
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

export const DirectRegenerateBodySchema = z
  .object({
    prompt: z.string().trim().min(1).optional(),
  })
  .strict();

export const DirectMessageBodySchema = z
  .object({
    message: z.string().trim().min(1, 'message 不能为空'),
  })
  .strict();

export const ApproveTaskBodySchema = z
  .object({
    editedPrompts: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export const ClaimTaskBodySchema = z
  .object({
    claimToken: z.string().trim().min(1, 'claimToken 不能为空'),
  })
  .strict();

export const ToggleFavoriteBodySchema = z
  .object({
    favorite: z.boolean(),
  })
  .strict();

export const AdminAnalyticsOverviewQuerySchema = z
  .object({
    days: z.coerce.number().int().min(1).max(90).default(7),
    topN: z.coerce.number().int().min(1).max(50).default(10),
    sampleN: z.coerce.number().int().min(10).max(500).default(200),
  })
  .strict();

export const AdminLogsRecentQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(2000).default(200),
  })
  .strict();

export const AdminCreateInviteBodySchema = z
  .object({
    note: z.string().trim().optional(),
  })
  .strict();

export const AdminUsersSummaryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    q: z.string().trim().max(100).optional(),
    role: z.enum(['USER', 'ADMIN']).optional(),
    status: z.enum(['ACTIVE', 'DISABLED', 'PENDING']).optional(),
  })
  .strict();

export const AdminUpdateMeBodySchema = z
  .object({
    currentPassword: z.string().min(1).optional(),
    username: z.string().trim().optional(),
    password: z.string().min(1).optional(),
    nickname: z.string().trim().optional(),
    email: z.string().trim().email('邮箱格式不正确').optional(),
  })
  .strict();

export const AdminCreateUserBodySchema = z
  .object({
    username: z.string().trim().min(1),
    password: z.string().min(6),
    nickname: z.string().trim().optional(),
    email: z.string().trim().email('邮箱格式不正确').optional(),
    role: z.enum(['USER', 'ADMIN']).optional(),
    status: z.enum(['ACTIVE', 'DISABLED', 'PENDING']).optional(),
    credits: z.number().int().min(0).optional(),
    notes: z.string().trim().optional(),
  })
  .strict();

export const AdminUpdateUserBodySchema = z
  .object({
    username: z.string().trim().optional(),
    password: z.string().min(1).optional(),
    nickname: z.string().trim().optional(),
    email: z.string().trim().email('邮箱格式不正确').optional(),
    role: z.enum(['USER', 'ADMIN']).optional(),
    status: z.enum(['ACTIVE', 'DISABLED', 'PENDING']).optional(),
    credits: z.number().int().min(0).optional(),
    notes: z.string().trim().optional(),
  })
  .strict();

export const AdminPromptOptimizerCreateVersionBodySchema = z
  .object({
    content: z.string().trim().min(1),
    note: z.string().trim().optional(),
    publish: z.boolean().optional(),
  })
  .strict();

export const AdminPromptOptimizerPublishBodySchema = z
  .object({
    versionId: z.string().trim().min(1),
  })
  .strict();

export const AdminBrainRoutingBodySchema = z
  .object({
    defaultBrainProfileId: z.string().trim().optional().nullable(),
    styleLearnProfileId: z.string().trim().optional().nullable(),
    poseLearnProfileId: z.string().trim().optional().nullable(),
    promptOptimizeProfileId: z.string().trim().optional().nullable(),
  })
  .strict();

const AdminModelProviderSchema = z.enum(['GEMINI', 'OPENAI_COMPAT']);

export const AdminCreateModelProfileBodySchema = z
  .object({
    kind: z.enum(['BRAIN', 'PAINTER']),
    provider: AdminModelProviderSchema.optional(),
    name: z.string().trim().min(1),
    gateway: z.string().trim().min(1),
    model: z.string().trim().min(1),
    apiKey: z.string().trim().min(1),
  })
  .strict();

export const AdminUpdateModelProfileBodySchema = z
  .object({
    provider: AdminModelProviderSchema.optional(),
    name: z.string().trim().min(1).optional(),
    gateway: z.string().trim().min(1).optional(),
    model: z.string().trim().min(1).optional(),
    apiKey: z.string().trim().min(1).optional(),
    disabled: z.boolean().optional(),
  })
  .strict();

export const AdminSetActiveModelProfileBodySchema = z
  .object({
    brainProfileId: z.string().trim().min(1).optional(),
    painterProfileId: z.string().trim().min(1).optional(),
    brainProfileIds: z.array(z.string().trim().min(1)).optional(),
    painterProfileIds: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

export const AdminCreateDirectPromptBodySchema = z
  .object({
    pack: z
      .object({
        directSystemPrompt: z.string().trim().min(1),
      })
      .strict(),
    note: z.string().trim().optional(),
    publish: z.boolean().optional(),
  })
  .strict();

export const AdminPublishDirectPromptBodySchema = z
  .object({
    versionId: z.string().trim().min(1),
  })
  .strict();

export const AdminCreateLearnPromptBodySchema = z
  .object({
    pack: z
      .object({
        styleLearnPrompt: z.string().trim().min(1),
        poseLearnPrompt: z.string().trim().min(1),
      })
      .strict(),
    note: z.string().trim().optional(),
    publish: z.boolean().optional(),
  })
  .strict();

export const AdminPublishLearnPromptBodySchema = z
  .object({
    versionId: z.string().trim().min(1),
  })
  .strict();

const PromptOptimizerPresetItemSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    description: z.string().trim().optional(),
    tags: z.array(z.string().trim().min(1).max(24)).optional(),
    styleHint: z.string().trim().optional(),
  })
  .strict();

export const PromptOptimizerBodySchema = z
  .object({
    prompt: z.string().trim().min(1).max(2000),
    settings: z
      .object({
        layoutMode: z.enum(DIRECT_LAYOUT_MODES),
        shotCount: z.number().int().min(1).max(MAX_DIRECT_SHOTS),
        resolution: z.enum(['1K', '2K', '4K']),
        aspectRatio: z.enum(['1:1', '3:4', '4:3', '9:16', '16:9', '21:9']),
      })
      .strict(),
    presets: z
      .object({
        styles: z.array(PromptOptimizerPresetItemSchema).max(3).optional(),
        poses: z.array(PromptOptimizerPresetItemSchema).max(4).optional(),
        faces: z.array(PromptOptimizerPresetItemSchema).max(3).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const UserAssetCreateItemSchema = z
  .object({
    url: z.string().trim().min(1),
    sha256: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{64}$/i, 'sha256 无效'),
    cosKey: z.string().trim().optional(),
    fileName: z.string().trim().optional(),
    mimeType: z.string().trim().optional(),
    size: z.coerce.number().int().positive().optional(),
    width: z.coerce.number().int().positive().optional(),
    height: z.coerce.number().int().positive().optional(),
  })
  .strict();

export const UserAssetCreateBodySchema = z
  .object({
    items: z.array(UserAssetCreateItemSchema).min(1),
  })
  .strict();

export const UserAssetListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(48),
  })
  .strict();

export const PosePresetUpdateBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().optional(),
  })
  .strict();

export const PosePresetRelearnBodySchema = z.object({}).strict();

export const StylePresetUpdateBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().optional(),
    tags: z.string().trim().optional(),
    styleHint: z.string().trim().optional(),
  })
  .strict();

export const StylePresetRelearnBodySchema = z.object({}).strict();

export const RegisterBodySchema = z
  .object({
    username: z.string().trim().min(1, '用户名不能为空'),
    password: z.string().min(6, '密码至少6位'),
    nickname: z.string().trim().optional(),
    email: z.string().trim().email('邮箱格式不正确').optional(),
    inviteCode: z.string().trim().optional(),
  })
  .strict();

export const LoginBodySchema = z
  .object({
    username: z.string().trim().min(1, '用户名不能为空'),
    password: z.string().min(1, '密码不能为空'),
  })
  .strict();

export const FacePresetGenderSchema = z.enum(['female', 'male', 'other']);

export const CreateFacePresetBodySchema = z
  .object({
    name: z.string().trim().min(1),
    gender: FacePresetGenderSchema.optional(),
    height: z.string().trim().optional(),
    weight: z.string().trim().optional(),
    measurements: z.string().trim().optional(),
    description: z.string().trim().optional(),
  })
  .strict();

export const UpdateFacePresetBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    gender: FacePresetGenderSchema.optional(),
    height: z.union([z.string().trim(), z.number()]).optional(),
    weight: z.union([z.string().trim(), z.number()]).optional(),
    measurements: z.string().trim().optional(),
    description: z.string().trim().optional(),
  })
  .strict();

export const PresetKindSchema = z.enum(['STYLE', 'POSE', 'FACE']);

export const PresetMetaBatchActionSchema = z.enum([
  'favorite',
  'unfavorite',
  'add-tags',
  'remove-tags',
  'set-tags',
  'add-collections',
  'remove-collections',
  'set-collections',
]);

export const PresetMetaBatchBodySchema = z
  .object({
    kind: PresetKindSchema,
    ids: z.array(z.string().trim().min(1)).min(1).max(50),
    action: PresetMetaBatchActionSchema,
    payload: z
      .object({
        tags: z.array(z.string().trim().min(1).max(24)).optional(),
        collectionIds: z.array(z.string().trim().min(1)).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const payload = value.payload;
    const action = value.action;
    const needsTags = ['add-tags', 'remove-tags', 'set-tags'].includes(action);
    const needsCollections = [
      'add-collections',
      'remove-collections',
      'set-collections',
    ].includes(action);

    if (needsTags) {
      if (!payload || !('tags' in payload)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '标签不能为空',
          path: ['payload', 'tags'],
        });
      } else if (
        (action === 'add-tags' || action === 'remove-tags') &&
        (payload.tags || []).length === 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '标签不能为空',
          path: ['payload', 'tags'],
        });
      }
    }

    if (needsCollections) {
      if (!payload || !('collectionIds' in payload)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '收藏夹不能为空',
          path: ['payload', 'collectionIds'],
        });
      } else if (
        (action === 'add-collections' || action === 'remove-collections') &&
        (payload.collectionIds || []).length === 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '收藏夹不能为空',
          path: ['payload', 'collectionIds'],
        });
      }
    }
  });

export const AdminOverviewQuerySchema = z
  .object({
    topN: z.coerce.number().int().min(1).max(100).optional(),
    recentN: z.coerce.number().int().min(1).max(500).optional(),
  })
  .strict();

export const AdminRechargeBodySchema = z
  .object({
    userId: z.string().uuid(),
    amount: z.coerce.number().int().positive(),
    reason: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const UpdateStoryboardShotBodySchema = z
  .object({
    patch: z
      .object({
        scene_subarea: z.string().optional(),
        action_pose: z.string().optional(),
        shot_type: z.string().optional(),
        goal: z.string().optional(),
        physical_logic: z.string().optional(),
        composition_notes: z.string().optional(),
        exec_instruction_text: z.string().optional(),
        occlusion_guard: z.array(z.string()).optional(),
        ref_requirements: z.array(z.string()).optional(),
        universal_requirements: z.array(z.string()).optional(),
        lighting_plan: z
          .object({
            scene_light: z.string().optional(),
            product_light: z
              .object({
                key: z.string().optional(),
                rim: z.string().optional(),
                fill: z.string().optional(),
              })
              .optional(),
          })
          .optional(),
        camera_choice: z
          .object({
            system: z.string().optional(),
            model: z.string().optional(),
            f_stop: z.string().optional(),
          })
          .optional(),
      })
      .strict(),
  })
  .strict()
  .refine((v) => Object.keys(v.patch || {}).length > 0, {
    message: 'patch 不能为空',
  });

export const UpdateShootLogBodySchema = z
  .object({
    shootLogText: z.string().max(20000).default(''),
  })
  .strict();

export const EditHeroBodySchema = z
  .object({
    maskImage: z
      .string()
      .url('maskImage 必须是可访问的 URL')
      .min(1, 'maskImage 不能为空'),
    referenceImages: z.array(z.string().url()).max(12).optional(),
    prompt: z.string().trim().min(1, 'prompt 不能为空'),
    editMode: z.string().trim().min(1).optional(),
  })
  .strict();

export const SelectHeroVariantBodySchema = z
  .object({
    attemptCreatedAt: z.coerce
      .number()
      .int()
      .positive('attemptCreatedAt 参数无效'),
  })
  .strict();

export const UserSafeSchema = z
  .object({
    id: z.string().uuid(),
    username: z.string().trim().min(1),
    nickname: z.string().trim().optional(),
    email: z.string().trim().optional(),
    status: z.enum(['ACTIVE', 'DISABLED', 'PENDING']),
    role: z.enum(['USER', 'ADMIN']),
    credits: z.number().int(),
    totalTasks: z.number().int(),
    createdAt: z.number(),
    lastLoginAt: z.number().optional(),
    createdBy: z.string().uuid().optional(),
    notes: z.string().optional(),
  })
  .strict();

export const InviteCodeSchema = z
  .object({
    id: z.string().uuid(),
    createdAt: z.number(),
    createdByUserId: z.string().uuid().optional(),
    usedAt: z.number().optional(),
    usedByUserId: z.string().uuid().optional(),
    revokedAt: z.number().optional(),
    note: z.string().optional(),
  })
  .strict();

export const AuthRegisterResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    user: UserSafeSchema,
  })
  .strict();

export const AuthLoginResponseSchema = z
  .object({
    success: z.literal(true),
    token: z.string().min(1),
    user: UserSafeSchema,
  })
  .strict();

export const AuthMeResponseSchema = z
  .object({
    success: z.literal(true),
    user: UserSafeSchema,
  })
  .strict();

export const AuthLogoutResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
  })
  .strict();

export const AdminCreateInviteResponseSchema = z
  .object({
    success: z.literal(true),
    code: z.string().min(1),
    invite: InviteCodeSchema,
  })
  .strict();

export const AdminListInvitesResponseSchema = z
  .object({
    success: z.literal(true),
    invites: z.array(InviteCodeSchema),
  })
  .strict();

export const AdminRevokeInviteResponseSchema = z
  .object({
    success: z.literal(true),
    invite: InviteCodeSchema,
  })
  .strict();

export const AdminUpdateMeResponseSchema = z
  .object({
    success: z.literal(true),
    token: z.string().min(1),
    user: UserSafeSchema,
  })
  .strict();

export const AdminCreateUserResponseSchema = z
  .object({
    success: z.literal(true),
    user: UserSafeSchema,
  })
  .strict();

export const AdminUsersResponseSchema = z
  .object({
    success: z.literal(true),
    users: z.array(UserSafeSchema),
  })
  .strict();

export const AdminUsersSummaryItemSchema = UserSafeSchema.extend({
  totalEarned: z.number().int(),
  totalSpent: z.number().int(),
}).strict();

export const AdminUsersSummaryResponseSchema = z
  .object({
    success: z.literal(true),
    users: z.array(AdminUsersSummaryItemSchema),
    total: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
    totalPages: z.number().int(),
  })
  .strict();

export const AdminUpdateUserResponseSchema = z
  .object({
    success: z.literal(true),
    user: UserSafeSchema,
  })
  .strict();

export const AdminDeleteUserResponseSchema = z
  .object({
    success: z.literal(true),
  })
  .strict();

export const CreditTransactionSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    type: z.enum(['EARN', 'SPEND']),
    amount: z.number().int(),
    balance: z.number().int(),
    reason: z.string(),
    relatedTaskId: z.string().optional(),
    adminId: z.string().uuid().optional(),
    createdAt: z.number(),
  })
  .strict();

export const UserCreditsResponseSchema = z
  .object({
    userId: z.string().uuid(),
    balance: z.number().int(),
    totalEarned: z.number().int(),
    totalSpent: z.number().int(),
  })
  .strict();

export const CreditTransactionsResponseSchema = z
  .object({
    transactions: z.array(CreditTransactionSchema),
    total: z.number().int(),
    page: z.number().int(),
  })
  .strict();

export const CreditCheckResponseSchema = z
  .object({
    enough: z.boolean(),
    required: z.number().int(),
    balance: z.number().int(),
  })
  .strict();

export const AdminRechargeResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string(),
    userId: z.string().uuid(),
    amount: z.number().int(),
  })
  .strict();

const CreditOverviewUserSchema = z
  .object({
    id: z.string().uuid(),
    username: z.string(),
    nickname: z.string().optional(),
    credits: z.number().int(),
    status: z.enum(['ACTIVE', 'DISABLED', 'PENDING']),
    role: z.enum(['USER', 'ADMIN']),
  })
  .strict();

export const CreditAdminOverviewResponseSchema = z
  .object({
    success: z.literal(true),
    totalUsers: z.number().int(),
    totalCredits: z.number().int(),
    topUsers: z.array(CreditOverviewUserSchema),
    recentTransactions: z.array(CreditTransactionSchema),
  })
  .strict();

export const FacePresetSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid().optional(),
    name: z.string(),
    imagePath: z.string(),
    thumbnailPath: z.string().optional(),
    tags: z.array(z.string()).optional(),
    collectionIds: z.array(z.string()).optional(),
    favoriteAt: z.number().optional(),
    lastUsedAt: z.number().optional(),
    gender: z.enum(['female', 'male', 'other']).optional(),
    height: z.number().optional(),
    weight: z.number().optional(),
    measurements: z.string().optional(),
    description: z.string().optional(),
    createdAt: z.number(),
  })
  .strict();

export const StylePresetSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid().optional(),
    kind: z.enum(['STYLE', 'POSE']).optional(),
    name: z.string(),
    description: z.string().optional(),
    imagePaths: z.array(z.string()),
    thumbnailPath: z.string().optional(),
    tags: z.array(z.string()).optional(),
    collectionIds: z.array(z.string()).optional(),
    favoriteAt: z.number().optional(),
    lastUsedAt: z.number().optional(),
    styleHint: z.string().optional(),
    promptBlock: z.string().optional(),
    analysis: z.any().optional(),
    learnStatus: z.enum(['SUCCESS', 'FAILED']).optional(),
    learnError: z.string().optional(),
    createdAt: z.number(),
  })
  .strict();

export const FacePresetDeleteResponseSchema = z
  .object({
    success: z.literal(true),
    id: z.string().uuid(),
  })
  .strict();

export const PresetMetaBatchResponseSchema = z
  .object({
    items: z.array(z.union([FacePresetSchema, StylePresetSchema])),
  })
  .strict();

const ModelProviderSchema = z.enum(['GEMINI', 'OPENAI_COMPAT']);

export const ModelConfigSchema = z
  .object({
    brainProfileId: z.string().optional(),
    brainProfileIds: z.array(z.string()).optional(),
    painterProfileId: z.string().optional(),
    painterProfileIds: z.array(z.string()).optional(),
    gatewayUrl: z.string().optional(),
    apiKey: z.string().optional(),
    brainGateway: z.string().optional(),
    brainKey: z.string().optional(),
    brainKeys: z.array(z.string()).optional(),
    brainModel: z.string().optional(),
    brainProvider: ModelProviderSchema.optional(),
    painterGateway: z.string().optional(),
    painterKey: z.string().optional(),
    painterKeys: z.array(z.string()).optional(),
    painterModel: z.string().optional(),
    painterProvider: ModelProviderSchema.optional(),
  })
  .passthrough();

const ShotStatusSchema = z.enum(['PENDING', 'RENDERED', 'FAILED']);
const TaskWorkflowSchema = z.enum(['legacy', 'hero_storyboard']);
const GridStatusSchema = z.enum(['PENDING', 'RENDERED', 'FAILED']);

export const ShotVersionSchema = z
  .object({
    versionId: z.number().int(),
    imagePath: z.string(),
    prompt: z.string(),
    fixFeedback: z.string().optional(),
    createdAt: z.number(),
  })
  .passthrough();

export const ShotSchema = z
  .object({
    id: z.string(),
    shotCode: z.string(),
    promptEn: z.string(),
    promptCn: z.string().optional(),
    type: z.string().optional(),
    status: ShotStatusSchema,
    imagePath: z.string().optional(),
    imageUrl: z.string().optional(),
    shootLog: z.string().optional(),
    error: z.string().optional(),
    qcStatus: z.enum(['PENDING', 'APPROVED', 'NEEDS_FIX']).optional(),
    versions: z.array(ShotVersionSchema).optional(),
    currentVersion: z.number().int().optional(),
  })
  .passthrough(); // 允许额外字段（如 Brain 返回的原始字段 shot_id, prompt, prompt_en 等）

export const BrainPlanSchema = z
  .object({
    visual_analysis: z.any(),
    styling_plan: z.any(),
    shots: z.array(z.any()),
    thinkingProcess: z.string().optional(),
    thinkingProcessCN: z.string().optional(),
  })
  .passthrough();

export const StoryboardActionCardSchema = z
  .object({
    index: z.number().int(),
    action: z.string(),
    blocking: z.string(),
    camera: z.string(),
    framing: z.string(),
    lighting: z.string(),
    occlusionNoGo: z.string(),
    continuity: z.string(),
  })
  .passthrough();

export const HeroShotAttemptSchema = z
  .object({
    createdAt: z.number(),
    model: z.string().optional(),
    promptVersionId: z.string().optional(),
    promptSha256: z.string().optional(),
    promptText: z.string().optional(),
    refImages: z.array(z.string()).optional(),
    outputImageUrl: z.string().optional(),
    outputShootLog: z.string().optional(),
    error: z.string().optional(),
  })
  .passthrough();

export const HeroShotOutputSchema = z
  .object({
    index: z.number().int(),
    status: ShotStatusSchema,
    imageUrl: z.string().optional(),
    shootLog: z.string().optional(),
    error: z.string().optional(),
    createdAt: z.number(),
    selectedAttemptCreatedAt: z.number().optional(),
    attempts: z.array(HeroShotAttemptSchema).optional(),
  })
  .passthrough();

export const PainterSessionMessageSchema = z
  .object({
    role: z.enum(['user', 'model']),
    text: z.string(),
    createdAt: z.number(),
  })
  .strict();

export const PainterSessionSchema = z
  .object({
    createdAt: z.number(),
    updatedAt: z.number(),
    systemPromptVersionId: z.string().optional(),
    systemPromptSha256: z.string().optional(),
    systemPromptText: z.string().optional(),
    messages: z.array(PainterSessionMessageSchema),
  })
  .passthrough();

export const HeroWorkspaceSnapshotSchema = z
  .object({
    attemptCreatedAt: z.number(),
    updatedAt: z.number(),
    heroImageUrl: z.string(),
    heroShootLog: z.string().optional(),
    heroApprovedAt: z.number().optional(),
    storyboardPlan: z.any().optional(),
    storyboardCards: z.array(StoryboardActionCardSchema).optional(),
    storyboardPlannedAt: z.number().optional(),
    storyboardThinkingProcess: z.string().optional(),
    storyboardHistory: z.array(z.any()).optional(),
    heroShots: z.array(HeroShotOutputSchema).optional(),
    gridImageUrl: z.string().optional(),
    gridShootLog: z.string().optional(),
    gridStatus: GridStatusSchema.optional(),
    painterSession: PainterSessionSchema.optional(),
  })
  .passthrough();

export const TaskBillingEventSchema = z
  .object({
    key: z.string(),
    kind: z.enum(['RESERVE', 'SETTLE']),
    amount: z.number().int(),
    reason: z.string(),
    createdAt: z.number(),
    meta: z.record(z.string(), z.number()).optional(),
  })
  .passthrough();

export const TaskModelSchema = z
  .object({
    id: z.string(),
    userId: z.string().optional(),
    creditsSpent: z.number().int().optional(),
    billingEvents: z.array(TaskBillingEventSchema).optional(),
    billingError: z.string().optional(),
    createdAt: z.number(),
    claimTokenHash: z.string().optional(),
    requirements: z.string(),
    shotCount: z.number().int(),
    layoutMode: z.enum(['Individual', 'Grid']),
    layout_mode: z.enum(['Individual', 'Grid']),
    scene: z.string(),
    resolution: z.enum(['1K', '2K', '4K']),
    garmentImagePaths: z.array(z.string()),
    faceRefPaths: z.array(z.string()).optional(),
    styleRefPaths: z.array(z.string()).optional(),
    location: z.string().optional(),
    styleDirection: z.string().optional(),
    poseRefPaths: z.array(z.string()).optional(),
    garmentFocus: z.enum([
      'top',
      'bottom',
      'footwear',
      'accessories',
      'full_outfit',
    ]).optional(),
    aspectRatio: z.enum(['1:1', '4:3', '3:4', '16:9', '9:16', '21:9']).optional(),
    workflow: TaskWorkflowSchema.optional(),
    autoApproveHero: z.boolean().optional(),
    status: TaskStatusSchema,
    favoriteAt: z.number().optional(),
    resultImages: z.array(z.string()),
    brainPlan: BrainPlanSchema.optional(),
    shots: z.array(ShotSchema).optional(),
    heroImageUrl: z.string().optional(),
    heroShootLog: z.string().optional(),
    heroApprovedAt: z.number().optional(),
    heroSelectedAttemptCreatedAt: z.number().optional(),
    painterSession: PainterSessionSchema.optional(),
    heroWorkspaces: z.array(HeroWorkspaceSnapshotSchema).optional(),
    storyboardPlan: z.any().optional(),
    storyboardCards: z.array(StoryboardActionCardSchema).optional(),
    storyboardPlannedAt: z.number().optional(),
    storyboardThinkingProcess: z.string().optional(),
    heroShots: z.array(HeroShotOutputSchema).optional(),
    gridImageUrl: z.string().optional(),
    gridShootLog: z.string().optional(),
    gridStatus: GridStatusSchema.optional(),
    heroHistory: z.array(HeroShotAttemptSchema).optional(),
    gridHistory: z.array(HeroShotAttemptSchema).optional(),
    storyboardHistory: z.array(z.any()).optional(),
    config: ModelConfigSchema,
    autoApprove: z.boolean().optional(),
    approvedAt: z.number().optional(),
    editedPrompts: z.record(z.string(), z.string()).optional(),
    painter_retry_count: z.number().int().optional(),
    directPrompt: z.string().optional(),
    directIncludeThoughts: z.boolean().optional(),
    directSeed: z.number().optional(),
    directTemperature: z.number().optional(),
    directStylePresetIds: z.array(z.string()).optional(),
    directPosePresetIds: z.array(z.string()).optional(),
    directFacePresetIds: z.array(z.string()).optional(),
    directPainterSession: PainterSessionSchema.optional(),
    modelMetadata: z.array(z.object({
      name: z.string(),
      gender: z.enum(['female', 'male', 'other']).optional(),
      height: z.number().optional(),
      weight: z.number().optional(),
      measurements: z.string().optional(),
      description: z.string().optional(),
    }).strict()).optional(),
    error: z.string().optional(),
  })
  .passthrough(); // 允许额外字段（兼容历史数据和未来扩展）

export const TaskCreateResponseSchema = z.union([
  TaskModelSchema,
  TaskModelSchema.extend({ claimToken: z.string().min(1) }).strict(),
]);

export const TaskListResponseSchema = z
  .object({
    tasks: z.array(TaskModelSchema),
    total: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
    totalPages: z.number().int(),
  })
  .passthrough();

export const TaskDeleteResponseSchema = z.boolean();

export const TaskRetryResponseSchema = z.union([
  TaskModelSchema,
  z.object({ message: z.string() }).strict(),
]);

export const TaskApproveResponseSchema = z
  .object({
    status: z.literal('ok'),
    message: z.string(),
  })
  .strict();

export const TaskUpdateShotPromptResponseSchema = z
  .object({
    status: z.literal('ok'),
    message: z.string(),
  })
  .strict();

export const EditShotResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    imagePath: z.string(),
    imageUrl: z.string().optional(),
  })
  .strict();

export const FixUpdateQcStatusResponseSchema = z
  .object({
    success: z.literal(true),
    qcStatus: z.enum(['APPROVED', 'NEEDS_FIX']),
  })
  .strict();

export const FixShotResponseSchema = z
  .object({
    success: z.literal(true),
    shotId: z.string(),
    newVersion: ShotVersionSchema,
    imagePath: z.string(),
  })
  .strict();

export const HeroStoryboardTaskResponseSchema = TaskModelSchema;

const PromptAuthorSchema = z
  .object({
    id: z.string(),
    username: z.string(),
  })
  .strict();

const PromptActiveRefSchema = z
  .object({
    versionId: z.string(),
    updatedAt: z.number(),
    updatedBy: PromptAuthorSchema,
  })
  .strict();

export const BrainPromptVersionMetaSchema = z
  .object({
    versionId: z.string(),
    sha256: z.string(),
    createdAt: z.number(),
    createdBy: PromptAuthorSchema,
    note: z.string().optional(),
  })
  .strict();

export const BrainPromptVersionSchema = BrainPromptVersionMetaSchema.extend({
  content: z.string(),
}).strict();

export const BrainPromptActiveResponseSchema = z
  .object({
    success: z.literal(true),
    ref: PromptActiveRefSchema.nullable(),
    version: BrainPromptVersionSchema.nullable(),
  })
  .strict();

export const BrainPromptListResponseSchema = z
  .object({
    success: z.literal(true),
    versions: z.array(BrainPromptVersionMetaSchema),
  })
  .strict();

export const BrainPromptGetVersionResponseSchema = z
  .object({
    success: z.literal(true),
    version: BrainPromptVersionSchema,
  })
  .strict();

export const BrainPromptCreateVersionResponseSchema = z
  .object({
    success: z.literal(true),
    version: BrainPromptVersionMetaSchema,
  })
  .strict();

export const BrainPromptPublishResponseSchema = z
  .object({
    success: z.literal(true),
    ref: PromptActiveRefSchema,
    version: BrainPromptVersionMetaSchema,
  })
  .strict();

export const BrainPromptAbCompareResponseSchema = z
  .object({
    success: z.literal(true),
    metaA: BrainPromptVersionMetaSchema,
    metaB: BrainPromptVersionMetaSchema,
    planA: z.any(),
    thinkingA: z.string().optional(),
    planB: z.any(),
    thinkingB: z.string().optional(),
  })
  .strict();

export const WorkflowPromptVersionMetaSchema = BrainPromptVersionMetaSchema;

export const WorkflowPromptVersionSchema = WorkflowPromptVersionMetaSchema.extend({
  pack: WorkflowPromptPackSchema,
}).strict();

export const WorkflowPromptActiveResponseSchema = z
  .object({
    success: z.literal(true),
    ref: PromptActiveRefSchema.nullable(),
    version: WorkflowPromptVersionSchema.nullable(),
  })
  .strict();

export const WorkflowPromptListResponseSchema = z
  .object({
    success: z.literal(true),
    versions: z.array(WorkflowPromptVersionMetaSchema),
  })
  .strict();

export const WorkflowPromptGetVersionResponseSchema = z
  .object({
    success: z.literal(true),
    version: WorkflowPromptVersionSchema,
  })
  .strict();

export const WorkflowPromptCreateVersionResponseSchema = z
  .object({
    success: z.literal(true),
    version: WorkflowPromptVersionMetaSchema,
  })
  .strict();

export const WorkflowPromptPublishResponseSchema = z
  .object({
    success: z.literal(true),
    ref: PromptActiveRefSchema,
    version: WorkflowPromptVersionMetaSchema,
  })
  .strict();

export const DirectPromptVersionMetaSchema = BrainPromptVersionMetaSchema;

export const DirectPromptPackSchema = z
  .object({
    directSystemPrompt: z.string(),
  })
  .strict();

export const DirectPromptVersionSchema = DirectPromptVersionMetaSchema.extend({
  pack: DirectPromptPackSchema,
}).strict();

export const DirectPromptActiveResponseSchema = z
  .object({
    success: z.literal(true),
    ref: PromptActiveRefSchema.nullable(),
    version: DirectPromptVersionSchema.nullable(),
  })
  .strict();

export const DirectPromptListResponseSchema = z
  .object({
    success: z.literal(true),
    versions: z.array(DirectPromptVersionMetaSchema),
  })
  .strict();

export const DirectPromptGetVersionResponseSchema = z
  .object({
    success: z.literal(true),
    version: DirectPromptVersionSchema,
  })
  .strict();

export const DirectPromptCreateVersionResponseSchema = z
  .object({
    success: z.literal(true),
    version: DirectPromptVersionMetaSchema,
  })
  .strict();

export const DirectPromptPublishResponseSchema = z
  .object({
    success: z.literal(true),
    ref: PromptActiveRefSchema,
    version: DirectPromptVersionMetaSchema,
  })
  .strict();

export const LearnPromptVersionMetaSchema = BrainPromptVersionMetaSchema;

export const LearnPromptPackSchema = z
  .object({
    styleLearnPrompt: z.string(),
    poseLearnPrompt: z.string(),
  })
  .strict();

export const LearnPromptVersionSchema = LearnPromptVersionMetaSchema.extend({
  pack: LearnPromptPackSchema,
}).strict();

export const LearnPromptActiveResponseSchema = z
  .object({
    success: z.literal(true),
    ref: PromptActiveRefSchema.nullable(),
    version: LearnPromptVersionSchema.nullable(),
  })
  .strict();

export const LearnPromptListResponseSchema = z
  .object({
    success: z.literal(true),
    versions: z.array(LearnPromptVersionMetaSchema),
  })
  .strict();

export const LearnPromptGetVersionResponseSchema = z
  .object({
    success: z.literal(true),
    version: LearnPromptVersionSchema,
  })
  .strict();

export const LearnPromptCreateVersionResponseSchema = z
  .object({
    success: z.literal(true),
    version: LearnPromptVersionMetaSchema,
  })
  .strict();

export const LearnPromptPublishResponseSchema = z
  .object({
    success: z.literal(true),
    ref: PromptActiveRefSchema,
    version: LearnPromptVersionMetaSchema,
  })
  .strict();

export const PromptOptimizerResponseSchema = z
  .object({
    success: z.literal(true),
    optimizedPrompt: z.string(),
    promptVersionId: z.string().optional(),
    promptSha256: z.string().optional(),
  })
  .strict();

export const PromptOptimizerPromptVersionMetaSchema =
  BrainPromptVersionMetaSchema;

export const PromptOptimizerPromptVersionSchema =
  PromptOptimizerPromptVersionMetaSchema.extend({
    content: z.string(),
  }).strict();

export const PromptOptimizerPromptActiveResponseSchema = z
  .object({
    success: z.literal(true),
    ref: PromptActiveRefSchema.nullable(),
    version: PromptOptimizerPromptVersionSchema.nullable(),
  })
  .strict();

export const PromptOptimizerPromptListResponseSchema = z
  .object({
    success: z.literal(true),
    versions: z.array(PromptOptimizerPromptVersionMetaSchema),
  })
  .strict();

export const PromptOptimizerPromptGetVersionResponseSchema = z
  .object({
    success: z.literal(true),
    version: PromptOptimizerPromptVersionSchema,
  })
  .strict();

export const PromptOptimizerPromptCreateVersionResponseSchema = z
  .object({
    success: z.literal(true),
    version: PromptOptimizerPromptVersionMetaSchema,
  })
  .strict();

export const PromptOptimizerPromptPublishResponseSchema = z
  .object({
    success: z.literal(true),
    ref: PromptActiveRefSchema,
    version: PromptOptimizerPromptVersionMetaSchema,
  })
  .strict();

export const PromptSnippetSchema = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    text: z.string(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .strict();

export const PromptSnippetListResponseSchema = z.array(PromptSnippetSchema);

export const PromptSnippetCreateResponseSchema = PromptSnippetSchema;

export const PromptSnippetDeleteResponseSchema = z
  .object({
    success: z.literal(true),
    id: z.string(),
  })
  .strict();
