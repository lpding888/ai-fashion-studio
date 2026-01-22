import api, {
    createDirectTaskFromUrls,
    BACKEND_ORIGIN
} from '@/lib/api';

export const MAX_GARMENT_IMAGES = 14;
export const MAX_TOTAL_REF_IMAGES = 14;
export const MAX_POSE_SELECT = 4;
export const MAX_STYLE_REF_IMAGES = 3;
export const MAX_DIRECT_SHOTS = 6;
export const DIRECT_STYLE_NONE = '__none__';
export const DIRECT_RESOLUTION_OPTIONS = ['1K', '2K', '4K'] as const;
export const DIRECT_ASPECT_RATIO_OPTIONS = ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9'] as const;
export const POLL_INTERVAL_MS = 2000;
export const BATCH_STORAGE_KEY = 'afs:batch:last-session:v1';

export type GroupRunStatus =
    | 'DRAFT'
    | 'CREATING'
    | 'QUEUED'
    | 'PLANNING'
    | 'RENDERING'
    | 'RETRYING'
    | 'COMPLETED'
    | 'FAILED';

export type TaskStatus =
    | 'DRAFT'
    | 'PENDING'
    | 'QUEUED'
    | 'PLANNING'
    | 'AWAITING_APPROVAL'
    | 'RENDERING'
    | 'COMPLETED'
    | 'FAILED'
    | 'HERO_RENDERING'
    | 'AWAITING_HERO_APPROVAL'
    | 'STORYBOARD_PLANNING'
    | 'STORYBOARD_READY'
    | 'SHOTS_RENDERING';

export type TaskApi = {
    id: string;
    status: TaskStatus;
    workflow?: 'legacy' | 'hero_storyboard';
    layout_mode?: 'Individual' | 'Grid';
    layoutMode?: 'Individual' | 'Grid';
    requirements?: string;
    resolution?: '1K' | '2K' | '4K';
    aspectRatio?: '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '21:9';
    location?: string;
    styleDirection?: string;
    garmentFocus?: string;
    autoApproveHero?: boolean;
    shotCount?: number;
    resultImages?: string[];
    shots?: Array<{
        id?: string;
        shotCode?: string;
        shot_id?: string;
        status: 'PENDING' | 'RENDERED' | 'FAILED';
        imageUrl?: string;
        imagePath?: string;
        error?: string;
    }>;
    brainPlan?: unknown;
    error?: string;
    scene?: string;
    faceRefPaths?: string[];
    styleRefPaths?: string[];
    directPrompt?: string;
    directIncludeThoughts?: boolean;
    directSeed?: number;
    directTemperature?: number;
    directStylePresetIds?: string[];
    directPosePresetIds?: string[];
    directFacePresetIds?: string[];
};

export type BatchImageItem = {
    url: string;
    shotCode?: string;
};

export type BatchGroup = {
    id: string;
    name: string;
    garmentFiles: File[];
    overrideRequirements: string;
    watermarkText: string;
    status: GroupRunStatus;
    taskId?: string;
    images: string[];
    imageItems: BatchImageItem[];
    error?: string;
    autoRetryUsed: boolean;
};

export type BatchTaskItem = {
    groupId: string;
    groupName: string;
    taskId: string;
    createdAt: number;
    status: GroupRunStatus;
    images: string[];
    imageItems: BatchImageItem[];
    expectedImages: number;
    watermarkText: string;
    error?: string;
    autoRetryUsed: boolean;
};

export type BatchMode = 'legacy' | 'direct';
export type DirectResolution = (typeof DIRECT_RESOLUTION_OPTIONS)[number];
export type DirectAspectRatio = (typeof DIRECT_ASPECT_RATIO_OPTIONS)[number];
export type DirectTaskPayload = Parameters<typeof createDirectTaskFromUrls>[0];

export function toImgSrc(pathOrUrl: string): string {
    if (!pathOrUrl) return '';
    const normalized = String(pathOrUrl).replace(/\\/g, '/');
    if (normalized.startsWith('http')) return normalized;
    // Use api.defaults.baseURL or fallback if not available in this scope
    const base = api.defaults.baseURL || '';
    return `${base}/${normalized}`.replace(/([^:]\/)\/+/g, '$1');
}

export function toStaticImgSrc(pathOrUrl: string): string {
    if (!pathOrUrl) return '';
    const normalized = String(pathOrUrl).replace(/\\/g, '/').replace(/^\/+/, '');
    if (normalized.startsWith('http')) return normalized;
    return `${BACKEND_ORIGIN}/${normalized}`.replace(/([^:]\/)\/+/g, '$1');
}

export const isDirectResolution = (value: string): value is DirectResolution =>
    DIRECT_RESOLUTION_OPTIONS.includes(value as DirectResolution);

export const isDirectAspectRatio = (value: string): value is DirectAspectRatio =>
    DIRECT_ASPECT_RATIO_OPTIONS.includes(value as DirectAspectRatio);

export function createGroup(index: number): BatchGroup {
    // 使用 crypto.randomUUID() 生成更安全的唯一ID
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? `g-${crypto.randomUUID()}`
        : `g-${Date.now()}-${Math.random().toString(36).slice(2)}`; // 降级方案

    return {
        id,
        name: `款式 ${index}`,
        garmentFiles: [],
        overrideRequirements: '',
        watermarkText: '',
        status: 'DRAFT',
        images: [],
        imageItems: [],
        autoRetryUsed: false,
    };
}

// 批量下载配置
export const BATCH_DOWNLOAD_STORAGE_KEY = 'afs:batch:download-config:v1';

export type BatchDownloadConfig = {
    autoWatermark: boolean; // 自动使用文件名作为水印
    downloadMode: 'individual' | 'zip'; // 下载方式
};

export const DEFAULT_BATCH_DOWNLOAD_CONFIG: BatchDownloadConfig = {
    autoWatermark: true,
    downloadMode: 'zip',
};

