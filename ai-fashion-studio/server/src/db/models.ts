import { ModelConfig } from '../common/model-config';

export type TaskWorkflow = 'legacy' | 'hero_storyboard';

export type TaskStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'QUEUED'
  | 'PLANNING'
  | 'AWAITING_APPROVAL'
  | 'RENDERING'
  | 'COMPLETED'
  | 'FAILED'
  // New workflow: hero_storyboard
  | 'HERO_RENDERING'
  | 'AWAITING_HERO_APPROVAL'
  | 'STORYBOARD_PLANNING'
  | 'STORYBOARD_READY'
  | 'SHOTS_RENDERING';

export interface BrainPlan {
  visual_analysis: any;
  styling_plan: any;
  shots: any[];
  thinkingProcess?: string; // AI reasoning process (English)
  thinkingProcessCN?: string; // AI reasoning process (Chinese)
}

export interface ShotVersion {
  versionId: number;
  imagePath: string;
  prompt: string;
  fixFeedback?: string;
  createdAt: number;
}

export interface Shot {
  id: string;
  shotCode: string;
  promptEn: string; // English prompt
  promptCn?: string; // Chinese prompt (translated)
  type?: string; // Shot type
  status: 'PENDING' | 'RENDERED' | 'FAILED';
  imagePath?: string;
  imageUrl?: string; // ✅ 可选：COS/CDN URL（用于多用户并发时走 CDN，不压后端带宽）
  shootLog?: string; // ✅ 生图模型返回的“手账”（新流程必落库）
  error?: string;
  qcStatus?: 'PENDING' | 'APPROVED' | 'NEEDS_FIX';
  versions?: ShotVersion[];
  currentVersion?: number;
}

export interface StoryboardActionCard {
  index: number; // 1..N
  action: string; // 动作
  blocking: string; // 站位/走位
  camera: string; // 机位/焦段/角度
  framing: string; // 景别/构图
  lighting: string; // 灯光要点（不描述衣服）
  occlusionNoGo: string; // 遮挡禁区（不允许遮住哪些区域）
  continuity: string; // 与上一帧承接（连续性锚点）
}

// New workflow planner output (stored as-is for audit / replay)
export interface HeroStoryboardPlannerOutput {
  _schema?: any;
  visual_audit?: any;
  resolved_params?: any;
  shots: any[];
}

export interface HeroShotOutput {
  index: number;
  status: 'PENDING' | 'RENDERED' | 'FAILED';
  imageUrl?: string; // COS URL
  shootLog?: string; // TEXT+IMAGE 的 TEXT 部分
  error?: string;
  createdAt: number;
  selectedAttemptCreatedAt?: number; // 用户选择的版本（用于“姿势裂变”作为上一帧）
  // 审计：每次“重新生成该镜头”都追加一条 attempt（不覆盖历史）
  attempts?: Array<{
    createdAt: number;
    model?: string;
    promptVersionId?: string;
    promptSha256?: string;
    promptText?: string;
    refImages?: string[];
    outputImageUrl?: string;
    outputShootLog?: string;
    error?: string;
  }>;
}

export type PainterSessionMessage = {
  role: 'user' | 'model';
  text: string;
  createdAt: number;
};

/**
 * Painter 会话（“原生会话保持”）：
 * - 持久化在 task.data（JSON）里，不需要 DB migration
 * - 仅保存文本历史（user/model），图片仍然通过每轮请求的 fileData(URL) 传入
 */
export type PainterSession = {
  createdAt: number;
  updatedAt: number;
  systemPromptVersionId?: string;
  systemPromptSha256?: string;
  /**
   * 为了可复现（以及 prompts 后续被发布更新时不“漂移”），这里可选持久化 system prompt 文本。
   * 若不存在，则按 versionId 回读版本文件，最后兜底取当前 active prompts。
   */
  systemPromptText?: string;
  messages: PainterSessionMessage[];
};

/**
 * Hero 工作区快照（用于 AB 版本对照/切换）：
 * - 每一个 heroAttemptCreatedAt（母版一次成功产出）对应一套完整工作区
 * - 切换版本时需要一起切换：Hero + 分镜规划 + 镜头产物 + 拼图 + Painter 会话
 */
export type HeroWorkspaceSnapshot = {
  attemptCreatedAt: number;
  updatedAt: number;
  heroImageUrl: string;
  heroShootLog?: string;
  heroApprovedAt?: number;
  storyboardPlan?: HeroStoryboardPlannerOutput;
  storyboardCards?: StoryboardActionCard[];
  storyboardPlannedAt?: number;
  storyboardThinkingProcess?: string;
  storyboardHistory?: any[];
  heroShots?: HeroShotOutput[];
  gridImageUrl?: string;
  gridShootLog?: string;
  gridStatus?: 'PENDING' | 'RENDERED' | 'FAILED';
  painterSession?: PainterSession;
};

export interface TaskModel {
  id: string;
  userId?: string; // 创建任务的用户ID（用于积分扣除）
  creditsSpent?: number; // 消费的积分数量（用于退款）
  billingEvents?: Array<{
    key: string; // 幂等键：同一次成功生成只扣一次
    kind: 'RESERVE' | 'SETTLE';
    amount: number; // 扣费额度（积分）
    reason: string; // 扣费原因
    createdAt: number;
    meta?: Record<string, number>;
  }>;
  billingError?: string; // 扣费失败时记录（不影响出图）
  createdAt: number;
  claimTokenHash?: string; // 匿名草稿任务的认领凭证（仅存 hash）
  requirements: string;
  shotCount: number;
  layoutMode: string;
  layout_mode: 'Individual' | 'Grid'; // 新增：输出模式（独立图片 vs 拼图）
  scene: string;
  resolution: '1K' | '2K' | '4K';
  garmentImagePaths: string[]; // 上传的服装图片路径
  faceRefPaths?: string[];

  // Advanced shooting options (新增)
  location?: string; // 拍摄地址（如："上海外滩"）
  styleDirection?: string; // 风格描述（如："日系清新"）
  styleRefPaths?: string[]; // 风格参考图路径
  poseRefPaths?: string[]; // 姿势参考图路径（知识库条目图片）
  garmentFocus?: 'top' | 'bottom' | 'footwear' | 'accessories' | 'full_outfit'; // 焦点单品
  aspectRatio?: '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '21:9'; // 画面比例

  // Workflow switch (A/B)
  workflow?: TaskWorkflow; // 默认 legacy（兼容旧任务）
  autoApproveHero?: boolean; // 新流程：Hero 生成后自动进入分镜（仍保留人工确认入口）

  // Status
  status: TaskStatus;

  resultImages: string[];

  brainPlan?: BrainPlan;
  shots?: Shot[];

  // hero_storyboard workflow state
  heroImageUrl?: string; // Hero 母版（COS URL）
  heroShootLog?: string; // Hero 手账（TEXT+IMAGE 的 TEXT 部分）
  heroApprovedAt?: number; // 人工确认时间戳（或 autoApproveHero）
  heroSelectedAttemptCreatedAt?: number; // 当前选择的 Hero 版本（heroHistory.createdAt）
  painterSession?: PainterSession; // ✅ Painter 原生会话保持（文本历史）
  /**
   * Hero 版本工作区：用于“AB 对照可切回去”。
   * 说明：主字段（heroImageUrl/storyboardPlan/...）代表“当前工作区视图”，heroWorkspaces 是历史快照集合。
   */
  heroWorkspaces?: HeroWorkspaceSnapshot[];
  storyboardPlan?: HeroStoryboardPlannerOutput; // Planner 原始结构化输出（用于审计/复盘）
  storyboardCards?: StoryboardActionCard[]; // 大脑规划出的动作卡（不含衣服描述）
  storyboardPlannedAt?: number;
  storyboardThinkingProcess?: string; // 可选：大脑思考过程（用于复盘）
  heroShots?: HeroShotOutput[]; // Phase 3：逐镜头生成结果
  gridImageUrl?: string; // Phase 3：四镜头拼图（COS URL）
  gridShootLog?: string; // Phase 3：拼图手账
  gridStatus?: 'PENDING' | 'RENDERED' | 'FAILED'; // 便于并发生成时正确展示“生成中”

  // 审计：每次调用都要保存提示词/参考图/产物（不覆盖历史）
  heroHistory?: Array<{
    createdAt: number;
    model?: string;
    promptVersionId?: string;
    promptSha256?: string;
    promptText?: string;
    refImages?: string[];
    outputImageUrl?: string;
    outputShootLog?: string;
    error?: string;
  }>;
  gridHistory?: Array<{
    createdAt: number;
    model?: string;
    promptVersionId?: string;
    promptSha256?: string;
    promptText?: string;
    refImages?: string[];
    outputImageUrl?: string;
    outputShootLog?: string;
    error?: string;
  }>;
  storyboardHistory?: Array<{
    createdAt: number;
    model?: string;
    promptVersionId?: string;
    promptSha256?: string;
    systemPromptVersionId?: string; // 工作流提示词版本（Planner）
    userPromptText?: string;
    heroImageUrl?: string;
    refImages?: string[];
    outputPlan?: any;
    thinkingProcess?: string;
    error?: string;
  }>;

  // Config Snapshot
  config: ModelConfig;

  // Approval workflow
  autoApprove?: boolean; // Auto-approve mode (skip manual check)
  approvedAt?: number; // Approval timestamp
  editedPrompts?: {
    // User-edited prompts (optional)
    [shotId: string]: string;
  };

  // Retry counter for painter failures
  painter_retry_count?: number;

  // ===== Direct prompt generation (learn page) =====
  /**
   * 直出图模式：跳过 Brain 规划，直接把用户提示词 + 知识库 prompt blocks + 参考图发给 Painter。
   * 说明：仍复用 Task 的状态流转与结果存储，便于队列/相册/重绘。
   */
  directPrompt?: string;
  directIncludeThoughts?: boolean;
  directSeed?: number;
  directTemperature?: number;
  directStylePresetIds?: string[];
  directPosePresetIds?: string[];
  directFacePresetIds?: string[];
  /**
   * 直出图“对话流程”会话：用于在同一个任务上追加用户指令进行迭代生成。
   * - 不做 DB migration：持久化在 task.data(JSON) 中
   * - 重绘（direct-regenerate）默认不走对话；发送对话（direct-message）才会使用并追加 history
   */
  directPainterSession?: PainterSession;

  // 模特元数据（从 FacePreset 提取用于 AI 生成）
  modelMetadata?: Array<{
    name: string;
    gender?: 'female' | 'male' | 'other';
    height?: number; // cm
    weight?: number; // kg
    measurements?: string; // e.g. "86-60-88"
    description?: string;
  }>;

  error?: string;
}

export interface FacePreset {
  id: string;
  userId?: string; // 归属用户（不填表示历史遗留/全局）
  name: string; // 用户自定义名称
  imagePath: string; // 存储路径
  thumbnailPath?: string; // 缩略图路径（可选优化）

  // Metadata
  gender?: 'female' | 'male' | 'other';
  height?: number; // cm
  weight?: number; // kg
  measurements?: string; // e.g. "86-60-88"
  description?: string; // 备注/特征

  createdAt: number;
}

// 用户模型（内测版本 - 简单账号密码）
export interface UserModel {
  id: string; // UUID
  username: string; // 账号（唯一）
  password: string; // 密码（bcrypt加密）

  // 用户信息
  nickname?: string; // 昵称
  email?: string; // 邮箱

  // 账户状态
  status: 'ACTIVE' | 'DISABLED' | 'PENDING'; // 账户状态（PENDING=待管理员审核）
  role: 'USER' | 'ADMIN'; // 角色

  // 统计
  credits: number; // 积分/额度
  totalTasks: number; // 总任务数

  // 时间戳
  createdAt: number;
  lastLoginAt?: number;

  // 元数据
  createdBy?: string; // 创建者（管理员ID）
  notes?: string; // 备注
}

export interface InviteCodeModel {
  id: string; // UUID
  codeHash: string; // sha256 hex
  createdAt: number;
  createdByUserId?: string; // 管理员ID
  usedAt?: number;
  usedByUserId?: string;
  revokedAt?: number;
  note?: string;
}

export interface StylePreset {
  id: string;
  userId?: string; // 所属用户（用于隔离；管理员可全量查看）
  kind?: 'STYLE' | 'POSE'; // 知识库条目类型：风格/姿势
  name: string; // 用户自定义名称（例如："日系胶片风"）
  description?: string; // 可选描述
  imagePaths: string[]; // 图片路径数组（1-3张）
  thumbnailPath?: string; // 封面缩略图（取第一张）
  tags?: string[]; // 标签（例如：["复古", "暖色调"]）
  styleHint?: string; // 风格提示（例如："Retro 1980s fashion editorial with Kodak Portra 400 aesthetic"）
  promptBlock?: string; // 可复用提示词块（风格/姿势统一使用）

  // 结构化分析（用于调试/复盘；不同 kind 的结构可能不同）
  analysis?: any;
  // 学习状态（模型返回为空时标记失败）
  learnStatus?: 'SUCCESS' | 'FAILED';
  learnError?: string;

  createdAt: number;
}

export interface PromptSnippetModel {
  id: string;
  userId: string;
  name?: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  avatar?: string;
  credits: number; // 积分余额
  totalTasks: number; // 总任务数
  createdAt: number;
  lastLoginAt?: number;
  status: 'active' | 'inactive';
  createdBy?: string; // 创建者（管理员ID）
  notes?: string; // 备注
}

// 积分流水记录
export interface CreditTransaction {
  id: string; // UUID
  userId: string; // 用户ID
  type: 'EARN' | 'SPEND'; // 类型：获得/消费
  amount: number; // 变动数额（正数）
  balance: number; // 交易后余额
  reason: string; // 原因描述
  relatedTaskId?: string; // 关联任务ID（生图消费时）
  adminId?: string; // 管理员ID（手动充值时）
  createdAt: number;
}

export interface DbSchema {
  tasks: TaskModel[];
  facePresets: FacePreset[];
  stylePresets: StylePreset[]; // 新增：风格预设库
  users: User[]; // 新增：用户列表
  creditTransactions: CreditTransaction[]; // 积分流水
}
