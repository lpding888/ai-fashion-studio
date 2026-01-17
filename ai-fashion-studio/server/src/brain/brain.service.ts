
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import OpenAI from 'openai';
import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import { z } from 'zod';
import sharp from 'sharp';
import { ModelConfig } from '../common/model-config';
import { TranslationService } from '../translation/translation.service';
import { CosService } from '../cos/cos.service';  // ✅ 导入 CosService
import { dumpModelResponseIfEnabled } from '../common/model-response-dump';
import { dumpPromptText } from '../common/prompt-dump';
import { logLargeText } from '../common/log-large-text';

// Define image metadata schema
const ImageMetadataSchema = z.object({
    index: z.number(),
    view_type: z.enum(['front', 'back', 'side', 'detail', 'full_outfit', 'angle', 'texture', 'other']),
    description: z.string(),
    focus_area: z.string().optional()
});

const EcommerceColorManagementSchema = z
    .object({
        white_balance_kelvin: z.number().optional(),
        tint: z.string().optional(),
        color_anchor: z.enum(['gray_card', 'color_checker', 'none']).optional(),
        constraints: z.array(z.string()).optional(),
        notes: z.string().optional(),
    })
    .passthrough();

const EcommercePlatformComplianceSchema = z
    .object({
        target_platform: z.string().optional(),
        product_fill_ratio: z
            .object({
                min: z.number().optional(),
                max: z.number().optional(),
            })
            .passthrough()
            .optional(),
        product_is_hero: z.boolean().optional(),
        allow_lifestyle: z.boolean().optional(),
        no_watermark: z.boolean().optional(),
        no_extra_items: z.boolean().optional(),
        background_policy: z.string().optional(),
        cropping_rules: z.array(z.string()).optional(),
        forbidden: z.array(z.string()).optional(),
    })
    .passthrough();

// /learn: Style JSON block (English values) for re-use in direct generation prompts.
// Keep schema strict at the top-level (required keys), but flexible inside nested objects.
const StyleLearnV1Schema = z
    .object({
        schema: z.literal('afs_style_v1'),
        name: z.string().trim().min(1),
        description: z.string().trim().min(1),
        lighting: z.object({}).passthrough(),
        camera: z.object({}).passthrough(),
        composition: z.object({}).passthrough(),
        scene: z.object({}).passthrough(),
        color_grading: z.object({}).passthrough(),
        quality: z.object({}).passthrough(),
        negative_constraints: z.array(z.string()).optional(),
    })
    .passthrough();

const PoseLearnV1Schema = z
    .object({
        schema: z.literal('afs_pose_v1'),
        name: z.string().trim().min(1),
        description: z.string().trim().min(1),
        framing: z.object({}).passthrough(),
        pose: z.object({}).passthrough(),
        must_keep_visible: z.array(z.string()).optional(),
        occlusion_no_go: z.array(z.string()).optional(),
        constraints: z.array(z.string()).optional(),
    })
    .passthrough();

function normalizeStyleLearnV1(input: any): z.infer<typeof StyleLearnV1Schema> {
    const src: any = input && typeof input === 'object' ? input : {};
    const name =
        String(src?.name || '').trim() ||
        `Auto Style ${new Date().toLocaleDateString('en-US')}`;
    const description =
        String(src?.description || '').trim() ||
        String(src?.vibe || '').trim() ||
        'Learned fashion photography style.';

    const lightingObj = (() => {
        const v = src?.lighting;
        if (v && typeof v === 'object' && !Array.isArray(v)) return v;
        const summary = String(v || '').trim() || 'Physically plausible studio/daylight setup.';
        return { summary };
    })();

    const cameraObj = (() => {
        const v = src?.camera;
        if (v && typeof v === 'object' && !Array.isArray(v)) return v;
        const summary = String(v || '').trim() || 'Commercial fashion photo lens + DOF.';
        return { summary };
    })();

    const compositionObj = (() => {
        const v = src?.composition;
        if (v && typeof v === 'object' && !Array.isArray(v)) return v;
        return { summary: 'Clean fashion composition, subject-centered, readable garment silhouette.' };
    })();

    const sceneObj = (() => {
        const v = src?.scene;
        if (v && typeof v === 'object' && !Array.isArray(v)) return v;
        const summary = String(v || '').trim() || 'Minimal commercial set / location context.';
        return { summary };
    })();

    const gradingObj = (() => {
        const v = src?.color_grading ?? src?.grading;
        if (v && typeof v === 'object' && !Array.isArray(v)) return v;
        const summary = String(v || '').trim() || 'Neutral-to-stylized commercial color grading.';
        return { summary };
    })();

    const qualityObj = (() => {
        const v = src?.quality;
        if (v && typeof v === 'object' && !Array.isArray(v)) return v;
        const texture = String(src?.texture || '').trim();
        return {
            realism: 'photorealistic',
            texture_detail: texture || 'high',
            notes: 'High detail, natural skin and fabric micro-texture.'
        };
    })();

    const negative = (() => {
        const v = src?.negative_constraints;
        if (Array.isArray(v) && v.length) return v.map((x) => String(x).trim()).filter(Boolean);
        return [
            'No text overlays, captions, watermarks, or UI elements.',
            'No collage, no pasted reference backgrounds.',
            'No cartoon/CGI/plastic look; keep photorealistic skin and fabric.',
        ];
    })();

    const normalized: any = {
        schema: 'afs_style_v1',
        name,
        description,
        lighting: lightingObj,
        camera: cameraObj,
        composition: compositionObj,
        scene: sceneObj,
        color_grading: gradingObj,
        quality: qualityObj,
        negative_constraints: negative,
    };

    const parsed = StyleLearnV1Schema.safeParse(normalized);
    if (parsed.success) return parsed.data;
    // last resort: return the normalized object (should be rare)
    return normalized as any;
}

function normalizePoseLearnV1(input: any): z.infer<typeof PoseLearnV1Schema> {
    const src: any = input && typeof input === 'object' ? input : {};
    const name =
        String(src?.name || '').trim() ||
        `Auto Pose ${new Date().toLocaleDateString('en-US')}`;
    const description =
        String(src?.description || '').trim() ||
        String(src?.summary || '').trim() ||
        'Learned fashion pose.';

    const framingObj = (() => {
        const v = src?.framing;
        if (v && typeof v === 'object' && !Array.isArray(v)) return v;
        return {
            shot_type: 'full body',
            camera_angle: 'eye level',
            lens_hint: '50mm',
        };
    })();

    const poseObj = (() => {
        const v = src?.pose;
        if (v && typeof v === 'object' && !Array.isArray(v)) return v;
        const constraints = Array.isArray(src?.pose_constraints) ? src.pose_constraints : [];
        const summary = String(src?.summary || '').trim();
        return {
            summary: summary || 'Natural fashion pose with clear garment visibility.',
            constraints: constraints.map((x: any) => String(x).trim()).filter(Boolean),
        };
    })();

    const mustKeep = (() => {
        const v = src?.must_keep_visible;
        if (Array.isArray(v) && v.length) return v.map((x) => String(x).trim()).filter(Boolean);
        return ['garment front panel', 'face (if present)'];
    })();

    const occlusionNoGo = (() => {
        const v = src?.occlusion_no_go;
        if (Array.isArray(v) && v.length) return v.map((x) => String(x).trim()).filter(Boolean);
        return [
            'Do not cover the garment front panel with hands or props.',
            'No props blocking torso/waist.',
        ];
    })();

    const constraints = (() => {
        const v = src?.constraints;
        if (Array.isArray(v) && v.length) return v.map((x) => String(x).trim()).filter(Boolean);
        const legacy = Array.isArray(src?.pose_constraints) ? src.pose_constraints : [];
        return legacy.map((x: any) => String(x).trim()).filter(Boolean);
    })();

    const normalized: any = {
        schema: 'afs_pose_v1',
        name,
        description,
        framing: framingObj,
        pose: poseObj,
        must_keep_visible: mustKeep,
        occlusion_no_go: occlusionNoGo,
        constraints,
    };

    const parsed = PoseLearnV1Schema.safeParse(normalized);
    if (parsed.success) return parsed.data;
    return normalized as any;
}

type BrainEncodedImage =
    | { kind: 'fileData'; fileUri: string; mimeType: string }
    | { kind: 'inlineData'; data: string; mimeType: string };

const EcommerceExportSpecSchema = z
    .object({
        aspect_ratio: z.string().optional(),
        resolution_px: z.string().optional(),
        format: z.string().optional(),
        watermark: z.enum(['none', 'allowed']).optional(),
    })
    .passthrough();

const EcommerceShotPurposeSchema = z.preprocess((value) => {
    if (value === null || value === undefined) return value;

    // Some models may emit an array or a combined string; normalize best-effort for reliability.
    const raw =
        Array.isArray(value) && typeof value[0] === 'string'
            ? value[0]
            : typeof value === 'string'
                ? value
                : '';

    const normalized = raw
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');

    const firstToken = normalized.split(/[|/,]+/)[0]?.trim();
    const v = firstToken || normalized;

    if (!v) return undefined;

    // Chinese shortcuts
    if (v.includes('主图') || v.includes('封面') || v.includes('首图')) return 'main_listing';
    if (v.includes('细节') || v.includes('特写')) return 'detail';
    if (v.includes('背面') || v === '背') return 'back';
    if (v.includes('侧面') || v === '侧') return 'side';
    if (v.includes('纹理') || v.includes('材质') || v.includes('面料')) return 'texture';
    if (v.includes('场景') || v.includes('生活') || v.includes('氛围')) return 'lifestyle';
    if (v.includes('尺码') || v.includes('标签') || v.includes('洗标')) return 'size_tag';
    if (v.includes('包装') || v.includes('吊牌') || v.includes('外箱')) return 'packaging';

    // English synonyms
    if (['main', 'hero', 'cover', 'listing', 'primary', 'main_image', 'mainimage'].includes(v)) return 'main_listing';
    if (['detail', 'closeup', 'close_up', 'macro'].includes(v)) return 'detail';
    if (['back', 'rear', 'reverse'].includes(v)) return 'back';
    if (['side', 'profile'].includes(v)) return 'side';
    if (['texture', 'fabric', 'material'].includes(v)) return 'texture';
    if (['lifestyle', 'scene', 'context'].includes(v)) return 'lifestyle';
    if (['size_tag', 'size', 'tag', 'label', 'care_label'].includes(v)) return 'size_tag';
    if (['packaging', 'package', 'pack'].includes(v)) return 'packaging';
    if (['other', 'misc'].includes(v)) return 'other';

    // Fallback: keep pipeline running
    return 'other';
}, z.enum(['main_listing', 'detail', 'back', 'side', 'texture', 'lifestyle', 'size_tag', 'packaging', 'other']));

const EcommerceShotSheetSchema = z
    .object({
        action_index: z.number().optional(),
        big_scene: z.string().optional(),
        scene_area: z.string().optional(),
        scene_route_anchor: z.string().optional(),
        shot_purpose: EcommerceShotPurposeSchema.optional(),
        action_description: z.string().optional(),
        action_logic: z.string().optional(),
        core_show_points: z.array(z.string()).optional(),
        occlusion_no_go: z.array(z.string()).optional(),
        background_detail: z.string().optional(),
        model_spec: z.any().optional(),
        lighting_plan: z.any().optional(),
        composition: z.any().optional(),
        depth_of_field: z.string().optional(),
        color_management: EcommerceColorManagementSchema.optional(),
        platform_compliance: EcommercePlatformComplianceSchema.optional(),
        postprocess_rules: z.array(z.string()).optional(),
        export_spec: EcommerceExportSpecSchema.optional(),
        filename_suggestion: z.string().optional(),
        reference_requirements: z.any().optional(),
        universal_requirements: z.any().optional(),
    })
    .passthrough();

// Define the expected Output Schema from Brain
const ShotSchema = z.object({
    shot_id: z.string().optional(),
    id: z.number().optional(),
    strategy: z.string().optional(),
    type: z.string(),
    layout: z.enum(["Individual", "Grid", "Split", "FilmStrip"]).optional().default('Individual'),
    prompt_en: z.string().optional(),
    prompt: z.string().optional(), // API returns 'prompt', fallback to prompt_en
    camera_angle: z.string().optional(),
    lighting: z.string().optional(),
    sheet: EcommerceShotSheetSchema.optional(),
}).refine(data => data.prompt || data.prompt_en, {
    message: "Either 'prompt' or 'prompt_en' must be provided"
});

export const BrainPlanSchema = z.object({
    version: z.string().optional(),
    shooting_theme: z.string().optional(),
    big_scene: z.string().optional(),
    scene_route_plan: z.string().optional(),
    shooting_goal: z.string().optional(),
    color_management: EcommerceColorManagementSchema.optional(),
    platform_compliance: EcommercePlatformComplianceSchema.optional(),
    output_spec: EcommerceExportSpecSchema.optional(),
    image_analysis: z.array(ImageMetadataSchema).optional(), // NEW: Analyzed uploaded images
    visual_analysis: z.object({
        category: z.string(),
        hero_feature: z.string(),
        risk_factors: z.string().optional(),
        vibe: z.string(),
    }).optional(),
    style_analysis: z.string().optional(), // API may return style_analysis instead
    styling_plan: z.object({
        upper: z.string(),
        lower: z.string(),
        shoes: z.string(),
        accessories: z.string(),
    }).optional(),
    shots: z.array(ShotSchema),
});

export type BrainPlan = z.infer<typeof BrainPlanSchema>;

// ===== Hero Storyboard (Phase 2) =====
 const StoryboardActionCardSchema = z.object({
    index: z.number(),
    action: z.string(),
    blocking: z.string(),
    camera: z.string(),
    framing: z.string(),
    lighting: z.string(),
    occlusionNoGo: z.string(),
    continuity: z.string(),
});

 const StoryboardPlanSchema = z.object({
     cards: z.array(StoryboardActionCardSchema).min(1),
 });

 export type StoryboardPlan = z.infer<typeof StoryboardPlanSchema>;

// New planner output (v4.5+) for hero_storyboard workflow
const HeroStoryboardPlannerOutputSchema = z
    .object({
        _schema: z.any().optional(),
        visual_audit: z.any().optional(),
        resolved_params: z.any().optional(),
        shots: z.array(z.any()).min(1),
    })
    .passthrough();

export type HeroStoryboardPlannerOutput = z.infer<typeof HeroStoryboardPlannerOutputSchema>;

// Extended result including thinking process
export interface BrainResult {
    plan: BrainPlan;
    thinkingProcess?: string;
}

@Injectable()
export class BrainService {
    private logger = new Logger(BrainService.name);
    private systemPrompt: string;
    private openai: OpenAI;
    private keyRr = 0;

    constructor(
        private translation: TranslationService,
        private cosService: CosService  // ✅ 注入 CosService
    ) {
        this.loadSystemPrompt();
        this.openai = new OpenAI({
            apiKey: process.env.VECTOR_ENGINE_API_KEY || 'sk-dummy',
            baseURL: 'https://api.vectorengine.ai/v1'
        });
    }

    setSystemPrompt(content: string) {
        const trimmed = (content ?? '').trim();
        if (!trimmed) return;
        this.systemPrompt = trimmed;
    }

    private async loadSystemPrompt() {
        try {
            // Prefer runtime-managed active prompt if present
            const activeManagedPath = path.join(process.cwd(), 'data', 'brain-prompts', 'active.md');
            if (await fs.pathExists(activeManagedPath)) {
                this.systemPrompt = await fs.readFile(activeManagedPath, 'utf-8');
                this.logger.log(`System Prompt loaded from: ${activeManagedPath}`);
                return;
            }

            // Try multiple paths for flexibility
            const possiblePaths = [
                path.join(__dirname, '../../docs/System_Prompt_Brain_v2.0.md'),
                path.join(process.cwd(), 'docs/System_Prompt_Brain_v2.0.md'),
                path.join(process.cwd(), '../docs/System_Prompt_Brain_v2.0.md')
            ];

            for (const promptPath of possiblePaths) {
                if (await fs.pathExists(promptPath)) {
                    this.systemPrompt = await fs.readFile(promptPath, 'utf-8');
                    this.logger.log(`System Prompt v2.0 loaded from: ${promptPath}`);
                    return;
                }
            }

            // Fallback with warning
            this.logger.warn('System Prompt file not found, using default');
            this.systemPrompt = "You are a helpful assistant.";
        } catch (e) {
            this.logger.error('Failed to load system prompt', e);
        }
    }

    /**
     * Guess MIME type from file path or URL
     */
    private guessMimeTypeFromPathOrHeader(pathOrUrl: string, contentType?: string) {
        const fromHeader = contentType?.split(';')?.[0]?.trim();
        if (fromHeader?.startsWith('image/')) {
            return fromHeader;
        }

        const lower = pathOrUrl.toLowerCase();
        if (lower.endsWith('.png')) return 'image/png';
        if (lower.endsWith('.webp')) return 'image/webp';
        if (lower.endsWith('.gif')) return 'image/gif';
        return 'image/jpeg';
    }

    /**
     * Helper to extract the last complete JSON object from text with multiple JSON blocks
     * Handles model responses that include thinking text + multiple JSON objects
     */
    private extractLastCompleteJSON(text: string): string {
        const raw = (text ?? '').trim();
        if (!raw) return raw;

        // 常见格式：```json ... ```，先做轻量清理（不依赖它一定存在）
        const cleaned = raw
            .replace(/```json\s*/gi, '')
            .replace(/```/g, '')
            .trim();

        // 目标：取“最后一个完整 JSON 值”（对象或数组），忽略前后解释文字/多段 JSON
        let inString = false;
        let isEscaping = false;
        const stack: Array<'{' | '['> = [];
        let currentStart = -1;
        let lastCandidate: string | null = null;

        for (let i = 0; i < cleaned.length; i++) {
            const ch = cleaned[i];

            if (inString) {
                if (isEscaping) {
                    isEscaping = false;
                    continue;
                }
                if (ch === '\\') {
                    isEscaping = true;
                    continue;
                }
                if (ch === '"') {
                    inString = false;
                }
                continue;
            }

            if (ch === '"') {
                inString = true;
                continue;
            }

            if (ch === '{' || ch === '[') {
                if (stack.length === 0) {
                    currentStart = i;
                }
                stack.push(ch as any);
                continue;
            }

            if (ch === '}' || ch === ']') {
                if (stack.length === 0) continue;
                const top = stack[stack.length - 1];
                const isMatch = (top === '{' && ch === '}') || (top === '[' && ch === ']');
                if (!isMatch) {
                    // 不合法嵌套：丢弃当前捕获，继续扫描，尽量容错
                    stack.length = 0;
                    currentStart = -1;
                    continue;
                }

                stack.pop();
                if (stack.length === 0 && currentStart >= 0) {
                    lastCandidate = cleaned.slice(currentStart, i + 1).trim();
                    currentStart = -1;
                }
            }
        }

        if (lastCandidate) return lastCandidate;

        // 兜底：老逻辑（不保证正确，只保证“尽量有东西”）
        this.logger.warn('extractLastCompleteJSON failed, using fallback method');
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            return cleaned.substring(firstBrace, lastBrace + 1);
        }

        return cleaned;
    }

    private normalizeStoryboardPlanShape(parsed: any, shotCount: number) {
        const safeShotCount = Number.isFinite(shotCount) && shotCount > 0 ? Math.floor(shotCount) : 4;

        const pickArray = (val: any) => (Array.isArray(val) ? val : null);

        const extracted =
            pickArray(parsed?.cards) ??
            pickArray(parsed?.action_cards) ??
            pickArray(parsed?.actionCards) ??
            pickArray(parsed?.shots) ??
            pickArray(parsed?.frames) ??
            pickArray(parsed?.storyboardCards) ??
            pickArray(parsed?.storyboard_cards) ??
            pickArray(parsed?.plan?.cards) ??
            pickArray(parsed?.storyboard?.cards) ??
            pickArray(parsed?.result?.cards) ??
            pickArray(parsed?.data?.cards);

        let cards = extracted;
        if (!cards && parsed && typeof parsed === 'object') {
            // 兜底：如果顶层只有一个数组字段，就把它当 cards
            const firstArrayEntry = Object.entries(parsed).find(([, v]) => Array.isArray(v));
            cards = firstArrayEntry ? (firstArrayEntry[1] as any[]) : null;
        }

        if (!cards) return parsed;

        const normalizeCard = (src: any, idx: number) => {
            // index 由系统强制按顺序补齐，避免模型输出 NaN/uuid 导致解析失败
            return {
                index: idx + 1,
                action: String(src?.action ?? src?.pose ?? src?.motion ?? src?.movement ?? ''),
                blocking: String(src?.blocking ?? src?.staging ?? src?.position ?? src?.stance ?? ''),
                camera: String(src?.camera ?? src?.camera_move ?? src?.cameraMovement ?? src?.cameraAngle ?? ''),
                framing: String(src?.framing ?? src?.shot_size ?? src?.shotSize ?? src?.composition ?? ''),
                lighting: String(src?.lighting ?? src?.light ?? src?.lights ?? ''),
                occlusionNoGo: String(src?.occlusionNoGo ?? src?.occlusion_no_go ?? src?.no_go ?? src?.noGo ?? ''),
                continuity: String(src?.continuity ?? src?.transition ?? src?.notes ?? ''),
            };
        };

        const normalizedCards = (cards || []).slice(0, safeShotCount).map(normalizeCard);
        while (normalizedCards.length < safeShotCount) {
            normalizedCards.push(normalizeCard({}, normalizedCards.length));
        }

        return { cards: normalizedCards };
    }

    private normalizeHeroStoryboardPlannerOutput(parsed: any, shotCount: number): HeroStoryboardPlannerOutput {
        const safeShotCount = Number.isFinite(shotCount) && shotCount > 0 ? Math.floor(shotCount) : 4;

        const resolvedParams = parsed?.resolved_params ?? parsed?.resolvedParams ?? {};
        const visualAudit = parsed?.visual_audit ?? parsed?.visualAudit ?? parsed?.audit_results ?? parsed?.auditResults;
        const schema = parsed?._schema ?? parsed?._schema_meta ?? parsed?.schema;

        // New shape: shots[]
        const rawShots = Array.isArray(parsed?.shots) ? parsed.shots : null;
        if (rawShots) {
            const normalizedShots = rawShots.slice(0, safeShotCount);
            while (normalizedShots.length < safeShotCount) normalizedShots.push({});
            return {
                _schema: schema,
                visual_audit: visualAudit,
                resolved_params: { ...resolvedParams, shot_count: safeShotCount },
                shots: normalizedShots,
            };
        }

        // Backward compatible: cards[] (old director action cards)
        const cards = (this.normalizeStoryboardPlanShape(parsed, safeShotCount) as any)?.cards;
        if (Array.isArray(cards) && cards.length > 0) {
            const shots = cards.slice(0, safeShotCount).map((c: any, idx: number) => ({
                id: String(idx + 1).padStart(2, '0'),
                shot_type: 'unknown',
                goal: '',
                physical_logic: '',
                action_pose: c?.action ?? '',
                occlusion_guard: [c?.occlusionNoGo].filter(Boolean),
                lighting_plan: {
                    scene_light: '',
                    product_light: {
                        key: c?.lighting ?? '',
                        rim: '',
                        fill: '',
                    },
                },
                camera_choice: {
                    system: '',
                    model: c?.camera ?? '',
                    f_stop: '',
                },
                exec_instruction_text: [
                    `action_pose=${c?.action ?? ''}`,
                    `blocking=${c?.blocking ?? ''}`,
                    `camera=${c?.camera ?? ''}`,
                    `framing=${c?.framing ?? ''}`,
                    `lighting=${c?.lighting ?? ''}`,
                    `occlusion_guard=${c?.occlusionNoGo ?? ''}`,
                    `continuity=${c?.continuity ?? ''}`,
                ]
                    .filter(Boolean)
                    .join('\n'),
            }));
            return {
                _schema: schema,
                visual_audit: visualAudit,
                resolved_params: { ...resolvedParams, shot_count: safeShotCount },
                shots,
            };
        }

        // Fallback: minimal, to surface a clear validation error upstream
        return {
            _schema: schema,
            visual_audit: visualAudit,
            resolved_params: { ...resolvedParams, shot_count: safeShotCount },
            shots: Array.from({ length: safeShotCount }).map(() => ({})),
        };
    }

    /**
     * 为 Brain 编码图片
     * 重要约束（业务决定）：
     * - 发送给模型的图片一律使用 URL（COS 链接优先），禁止服务器转 base64（inline_data）上传。
     */
    private toBrainImagePart(encoded: BrainEncodedImage): any {
        if (encoded.kind === 'inlineData') {
            return {
                inlineData: {
                    data: encoded.data,
                    mimeType: encoded.mimeType,
                },
            };
        }
        return {
            fileData: {
                fileUri: encoded.fileUri,
                mimeType: encoded.mimeType,
            },
        };
    }

    private async encodeImageForBrain(filePath: string): Promise<BrainEncodedImage> {
        const input = (filePath ?? '').trim();
        if (!input) {
            throw new Error('图片路径为空');
        }

        // URL：直接走 fileData（不下载、不转 base64）
        if (input.startsWith('http://') || input.startsWith('https://')) {
            const useDirectURL = process.env.USE_DIRECT_IMAGE_URL !== 'false'; // 默认启用

            // COS URL：可选用万象做缩放/压缩（仍然是 URL，不走 base64）
            const brainCiEnabled = String(process.env.BRAIN_CI_ENABLED || 'true').trim().toLowerCase() !== 'false';

            if (useDirectURL && brainCiEnabled && this.cosService.isValidCosUrl(input)) {
                try {
                    const urlObj = new URL(input);
                    const key = urlObj.pathname.substring(1);

                    const quality = Number(process.env.CI_IMAGE_QUALITY || 82);
                    const maxWidth = Number(process.env.CI_IMAGE_MAX_WIDTH || 1536);

                    // 不做 format 转换，避免 mimeType 与真实内容不一致
                    const optimizedUrl = this.cosService.getImageUrl(key, {
                        quality,
                        width: maxWidth,
                    });

                    return {
                        kind: 'fileData',
                        fileUri: optimizedUrl,
                        mimeType: this.guessMimeTypeFromPathOrHeader(input),
                    };
                } catch (error) {
                    this.logger.warn(`Failed to generate CI URL for ${input}, fallback to original URL`, error);
                }
            }

            return {
                kind: 'fileData',
                fileUri: input,
                mimeType: this.guessMimeTypeFromPathOrHeader(input),
            };
        }

        // 本地路径：必须先转存 COS，然后用 COS URL（fileData）
        if (!(await fs.pathExists(input))) {
            throw new Error(`图片文件不存在: ${input}`);
        }

        // 生产环境：仍然强制走 COS URL，避免 inlineData 造成带宽/内存浪费与日志风险。
        if (!this.cosService.isEnabled()) {
            const allowInline =
                String(process.env.ALLOW_BRAIN_INLINE_DATA || '').trim().toLowerCase() === 'true'
                || String(process.env.NODE_ENV || '').trim().toLowerCase() !== 'production';

            if (!allowInline) {
                throw new Error('COS未配置：生产环境禁止服务器把图片转Base64发给模型；请启用COS或改为前端直传COS URL');
            }

            // 开发/测试兜底：本地图片 -> inlineData（压缩到合理大小）
            const maxWidth = Number(process.env.BRAIN_INLINE_MAX_WIDTH || 1536);
            const quality = Number(process.env.BRAIN_INLINE_QUALITY || 82);

            const buf = await sharp(input)
                .rotate()
                .resize({ width: maxWidth, withoutEnlargement: true })
                .jpeg({ quality, mozjpeg: true })
                .toBuffer();

            return {
                kind: 'inlineData',
                data: buf.toString('base64'),
                mimeType: 'image/jpeg',
            };
        }

        const ext = path.extname(input) || '.jpg';
        const key = `uploads/server/brain-refs/${Date.now()}_${crypto.randomUUID()}${ext}`;
        await this.cosService.uploadFile(key, input);

        return {
            kind: 'fileData',
            fileUri: this.cosService.getImageUrl(key),
            mimeType: this.guessMimeTypeFromPathOrHeader(input),
        };
    }

    async planTask(
        imagePaths: string[],
        requirements: string,
        options: {
            shot_count: number;
            layout_mode: string;
            location?: string;
            style_direction?: string;
            style_ref_paths?: string[];
            face_ref_paths?: string[];
            garment_focus?: string;
            aspect_ratio?: string;
            quality?: string;
            model_metadata?: Array<{  // ✅ 添加元数据类型
                name: string;
                gender?: 'female' | 'male' | 'other';
                height?: number;
                weight?: number;
                measurements?: string;
                description?: string;
            }>;
        },
        config?: ModelConfig,
        systemPromptOverride?: string
    ): Promise<BrainResult> {

        // MOCK MODE
        const keyPool = this.getBrainKeyPool(config);
        const shouldMock = process.env.MOCK_BRAIN === 'true' && keyPool.length === 0;

        if (shouldMock) {
            this.logger.warn('USING MOCK BRAIN RESPONSE');
            await new Promise(r => setTimeout(r, 1000));
            return {
                plan: {
                    visual_analysis: { category: "Mock Hoodie", hero_feature: "Mock Fabric", vibe: "Streetwear" },
                    styling_plan: { upper: "Mock Top", lower: "Mock Bottom", shoes: "Mock Shoes", accessories: "Mock Chain" },
                    shots: [
                        { shot_id: "01", strategy: "Mock Strategy", type: "Full Body", prompt_en: "Mock Prompt 1", layout: "Individual" },
                        { shot_id: "02", strategy: "Mock Strategy 2", type: "Detail", prompt_en: "Mock Prompt 2", layout: "Individual" }
                    ]
                },
                thinkingProcess: "[Mock Thinking] Analyzing garment... Planning shots..."
            };
        }

        // User must configure model via settings - no hardcoded defaults
        const model = config?.brainModel;
        if (!model) {
            throw new Error('Brain模型未配置，请在设置页面配置Brain模型（如：gemini-3-pro-preview）');
        }

        const activeGateway = config?.brainGateway || config?.gatewayUrl || 'https://api.vectorengine.ai/v1';

        // Convert to v1beta for Google Native format
        let baseUrl = activeGateway;
        if (baseUrl.endsWith('/v1')) {
            baseUrl = baseUrl.replace('/v1', '/v1beta');
        } else if (!baseUrl.includes('/v1beta')) {
            baseUrl = baseUrl.replace(/\/$/, "") + '/v1beta';
        }

        const buildEndpoint = (key: string) =>
            `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

        // Build content parts for Google Native format
        // Construct user prompt with all provided parameters
        let userPrompt = `Requirements: ${requirements}\nParams: shot_count=${options.shot_count}, layout_mode=${options.layout_mode}`;

        // Add optional parameters if provided
        if (options.location) {
            userPrompt += `\nLocation: ${options.location} (Design scenes authentically matching this real-world location)`;
        }
        if (options.style_direction) {
            userPrompt += `\nStyle Direction: ${options.style_direction} (Prioritize this style aesthetic)`;
        }
        if (options.garment_focus) {
            userPrompt += `\nGarment Focus: ${options.garment_focus} (Prioritize showcasing this focus item category)`;
        }
        if (options.aspect_ratio) {
            userPrompt += `\nAspect Ratio: ${options.aspect_ratio}`;
        }
        if (options.quality) {
            userPrompt += `\nQuality: ${options.quality}`;
        }

        // ✅ 添加模特元数据（如果有）
        if (options.model_metadata && options.model_metadata.length > 0) {
            userPrompt += `\n\n=== Model Reference Data ===`;
            for (const model of options.model_metadata) {
                userPrompt += `\nModel: ${model.name}`;
                if (model.gender) userPrompt += `\n- Gender: ${model.gender === 'female' ? 'Female' : model.gender === 'male' ? 'Male' : 'Other'}`;
                if (model.height) userPrompt += `\n- Height: ${model.height}cm`;
                if (model.weight) userPrompt += `\n- Weight: ${model.weight}kg`;
                if (model.measurements) userPrompt += `\n- Measurements: ${model.measurements}`;
                if (model.description) userPrompt += `\n- Features: ${model.description}`;
            }
            userPrompt += `\n\nIMPORTANT: Use the above body data to generate appropriate full-body shot compositions and proportions. Consider the model's physique when designing camera angles and framing.`;
        }

        userPrompt += `\n\nPlease respond with ONLY a valid JSON object.`;

        const contentParts: any[] = [{ text: userPrompt }];

        // Add garment images
        for (const imgPath of imagePaths) {
            try {
                const encoded = await this.encodeImageForBrain(imgPath);

                contentParts.push(this.toBrainImagePart(encoded));
                this.logger.log(`🌐 Garment image (${encoded.kind}): ${encoded.kind === 'fileData' ? encoded.fileUri : '[inlineData]'}`);
            } catch (e) {
                this.logger.error(`Failed to encode image ${imgPath}`, e);
            }
        }

        // Add style reference images if provided
        if (options.style_ref_paths && options.style_ref_paths.length > 0) {
            this.logger.log(`Adding ${options.style_ref_paths.length} style reference image(s)`);
            for (const refPath of options.style_ref_paths) {
                try {
                    const encoded = await this.encodeImageForBrain(refPath);

                    contentParts.push(this.toBrainImagePart(encoded));
                    this.logger.log(`🌐 Style ref (${encoded.kind}): ${encoded.kind === 'fileData' ? encoded.fileUri : '[inlineData]'}`);
                } catch (e) {
                    this.logger.error(`Failed to read style reference ${refPath}`, e);
                }
            }
        }

        // Add face reference images if provided
        if (options.face_ref_paths && options.face_ref_paths.length > 0) {
            this.logger.log(`Adding ${options.face_ref_paths.length} face reference image(s)`);
            for (const facePath of options.face_ref_paths) {
                try {
                    const encoded = await this.encodeImageForBrain(facePath);

                    contentParts.push(this.toBrainImagePart(encoded));
                    this.logger.log(`🌐 Face ref (${encoded.kind}): ${encoded.kind === 'fileData' ? encoded.fileUri : '[inlineData]'}`);
                } catch (e) {
                    this.logger.error(`Failed to read face reference ${facePath}`, e);
                }
            }
        }

        // Google Native request body
        const isThinkingModel = model.toLowerCase().includes('thinking');

        const requestBody = {
            systemInstruction: {
                parts: [{ text: (systemPromptOverride ?? this.systemPrompt) || "You are a helpful assistant." }]
            },
            contents: [{
                role: 'user',
                parts: contentParts
            }],
            generationConfig: {
                temperature: 0.2,
                topP: 1,
                // Thinking models don't support JSON mode yet, they output thoughts then content
                responseMimeType: isThinkingModel ? 'text/plain' : 'application/json'
            }
        };

        try {
            this.logger.log(`🚀 Calling Brain API with model: ${model}`);
            // endpoint/key 脱敏由 postWithKeyFailover 统一处理

            // 日志脱敏：requestBody 可能包含 inline_data(base64) 或长文本，禁止直接 JSON.stringify 打印
            const summarizeRequest = () => {
                try {
                    const contents = Array.isArray((requestBody as any)?.contents) ? (requestBody as any).contents : [];
                    const parts = Array.isArray(contents?.[0]?.parts) ? contents[0].parts : [];
                    const hasInline = parts.some((p: any) => !!p?.inline_data || !!p?.inlineData);
                    const hasFileData = parts.some((p: any) => !!p?.fileData);
                    const textLen = parts
                        .map((p: any) => (typeof p?.text === 'string' ? p.text.length : 0))
                        .reduce((a: number, b: number) => a + b, 0);
                    return {
                        parts: parts.length,
                        textLen,
                        hasInline,
                        hasFileData,
                        responseMimeType: (requestBody as any)?.generationConfig?.responseMimeType,
                    };
                } catch {
                    return { parts: 0 };
                }
            };
            this.logger.log(`📤 Request summary: ${JSON.stringify(summarizeRequest())}`);

            const response = await this.postWithKeyFailover({
                keyPool,
                buildEndpoint,
                requestBody,
                axiosConfig: {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 300000 // 5min
                },
                logLabel: 'plan_task',
            });

            await dumpModelResponseIfEnabled({
                kind: 'BRAIN',
                stage: 'plan_task',
                model,
                responseData: response.data,
            });

            this.logger.log(`🤖 Brain API Response Status: ${response.status}`);

            const candidate = response.data.candidates?.[0];
            if (!candidate) {
                this.logger.error(`No candidates in response`);
                throw new Error('No candidates returned from Brain API');
            }

            // Extract thinking process and content
            let thinkingProcess = '';
            let rawContent = '';

            for (const part of candidate.content?.parts || []) {
                if (part.thought) {
                    thinkingProcess += part.text + '\n';
                } else if (part.text) {
                    rawContent += part.text;
                }
            }

            this.logger.log(`📝 Raw content length: ${rawContent.length}`);
            this.logger.log(`📝 Thinking process length: ${thinkingProcess.length}`);
            if (thinkingProcess) {
                this.logger.log(`💭 Thinking process preview: ${thinkingProcess.substring(0, 150)}...`);
            }

            if (!rawContent) {
                this.logger.error('❌ No text content found in API response parts');
                throw new Error('No content in API response');
            }

            // Extract the last complete JSON object (handles multi-block responses)
            const cleanContent = this.extractLastCompleteJSON(rawContent);
            this.logger.log(`✂️ Extracted JSON length: ${cleanContent.length}`);
            this.logger.log(`✂️ Extracted JSON preview (first 300 chars): ${cleanContent.substring(0, 300)}`);

            let json;
            try {
                json = JSON.parse(cleanContent);
                this.logger.log(`✅ JSON parsed successfully`);
            } catch (e) {
                this.logger.error(`❌ JSON Parse Failed!`);
                this.logger.error(`Parse error: ${e.message}`);
                // 避免把大段内容打到日志（且可能包含长 base64 段）
                const preview = cleanContent.length > 600 ? `${cleanContent.slice(0, 600)}…` : cleanContent;
                this.logger.error(`Content preview that failed to parse: ${preview}`);
                throw new Error(`Failed to parse AI response: ${e.message}`);
            }

            this.logger.log(`🔍 Validating JSON against schema...`);

            // Some Gemini variants occasionally return an array of plan objects (e.g. per reference image).
            // Accept both formats and normalize to a single plan object.
            let candidateJson: unknown = json;
            if (Array.isArray(candidateJson)) {
                // 1) Prefer the first element that matches the expected plan schema
                for (const item of candidateJson) {
                    const itemResult = BrainPlanSchema.safeParse(item);
                    if (itemResult.success) {
                        candidateJson = itemResult.data;
                        break;
                    }
                }

                // 2) If it's actually an array of shots, wrap it
                if (Array.isArray(candidateJson)) {
                    const shotsResult = z.array(ShotSchema).safeParse(candidateJson);
                    if (shotsResult.success) {
                        candidateJson = { shots: shotsResult.data };
                    }
                }
            }

            const parseResult = BrainPlanSchema.safeParse(candidateJson);
            if (!parseResult.success) {
                this.logger.error('❌ ========== JSON VALIDATION FAILED ==========');
                const flattened = parseResult.error.flatten();
                this.logger.error(
                    `Validation errors: ${JSON.stringify({
                        formErrors: flattened.formErrors,
                        fieldErrors: flattened.fieldErrors,
                        issues: parseResult.error.issues,
                    })}`,
                );
                this.logger.error('============================================');
                throw new Error(
                    `Brain API returned invalid JSON structure: ${JSON.stringify({
                        formErrors: flattened.formErrors,
                        fieldErrors: flattened.fieldErrors,
                    })}`,
                );
            }
            this.logger.log(`✅ JSON validation passed`);
            const plan = parseResult.data;

            // === 翻译功能（已禁用，节省成本） ===
            // TODO: 后续使用免费模型实现翻译
            /*
            // 1. 翻译思考过程
            if (thinkingProcess && thinkingProcess.length > 10) {
                try {
                    this.logger.log('🌏 翻译思考过程...');
                    const thinkingCN = await this.translation.translateToZH(
                        thinkingProcess,
                        model,
                        activeKey,
                        activeGateway
                    );
                    (plan as any).thinkingProcessCN = thinkingCN;
                } catch (err) {
                    this.logger.warn('思考过程翻译失败', err.message);
                }
            }

            // 2. 批量翻译所有提示词
            if (plan.shots && plan.shots.length > 0) {
                try {
                    this.logger.log(`🌏 翻译 ${plan.shots.length} 个提示词...`);
                    const prompts = plan.shots.map((s: any) => s.prompt_en || s.prompt);
                    const translatedPrompts = await this.translation.translateBatch(
                        prompts,
                        model,
                        activeKey,
                        activeGateway
                    );

                    plan.shots.forEach((shot: any, index: number) => {
                        shot.prompt_cn = translatedPrompts[index];
                    });
                } catch (err) {
                    this.logger.warn('提示词翻译失败', err.message);
                }
            }
            */
            // === 翻译功能结束 ===

            return {
                plan: plan,
                thinkingProcess: thinkingProcess || undefined
            };

        } catch (error: any) {
            this.logger.error('Brain Planning Failed', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Hero Storyboard（Phase 2）：只做“动作/机位/遮挡/连续性”规划（不输出完整 prompt，不描述衣服）
     */
    async planStoryboard(
        heroImageUrl: string,
        referenceImageUrls: string[],
        options: {
            shot_count: number;
            requirements?: string;
            location?: string;
            style_direction?: string;
            garment_focus?: string;
            aspect_ratio?: string;
            quality?: string;
            output_mode?: string;
            scene?: string;
        },
        config?: ModelConfig,
        systemPromptOverride?: string,
        meta?: { taskId?: string },
    ): Promise<{
        plan: HeroStoryboardPlannerOutput;
        thinkingProcess?: string;
        audit?: { userPromptText: string; heroImageUrl: string; referenceImageUrls: string[] };
    }> {
        const keyPool = this.getBrainKeyPool(config);
        const shouldMock = process.env.MOCK_BRAIN === 'true' && keyPool.length === 0;

        if (shouldMock) {
            this.logger.warn('USING MOCK STORYBOARD RESPONSE');
            const shots = Array.from({ length: options.shot_count || 4 }).map((_, idx) => ({
                id: String(idx + 1).padStart(2, '0'),
                shot_type: 'mock',
                goal: 'mock goal',
                physical_logic: 'mock physical_logic',
                action_pose: `Mock action_pose ${idx + 1}`,
                occlusion_guard: ['mock occlusion_guard'],
                lighting_plan: {
                    scene_light: 'mock scene_light',
                    product_light: { key: 'mock key', rim: 'mock rim', fill: 'mock fill' },
                },
                camera_choice: { system: 'mock', model: 'mock', f_stop: 'mock' },
                exec_instruction_text: 'mock exec_instruction_text',
            }));
            return { plan: { resolved_params: { shot_count: options.shot_count || 4 }, shots } };
        }

        const model = config?.brainModel;
        if (!model) {
            throw new Error('Brain模型未配置，请在设置页面配置Brain模型（如：gemini-3-pro-preview）');
        }

        const activeGateway = config?.brainGateway || config?.gatewayUrl || 'https://api.vectorengine.ai/v1';

        // Convert to v1beta for Google Native format
        let baseUrl = activeGateway;
        if (baseUrl.endsWith('/v1')) {
            baseUrl = baseUrl.replace('/v1', '/v1beta');
        } else if (!baseUrl.includes('/v1beta')) {
            baseUrl = baseUrl.replace(/\/$/, "") + '/v1beta';
        }

        const buildEndpoint = (key: string) =>
            `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

        let userPrompt = `shot_count=${options.shot_count}`;
        if (options.requirements && options.requirements.trim()) {
            userPrompt += `\n\n[User Requirements] (Do NOT describe garment details; only use for scene/pose/camera constraints)\n${options.requirements.trim()}`;
        }
        if (options.location) {
            userPrompt += `\nLocation: ${options.location}`;
        }
        if (options.style_direction) {
            userPrompt += `\nStyle Direction: ${options.style_direction}`;
        }
        if (options.garment_focus) {
            userPrompt += `\nGarment Focus: ${options.garment_focus}`;
        }
        if (options.output_mode) {
            userPrompt += `\nOutput Mode: ${options.output_mode}`;
        }
        if (options.aspect_ratio) {
            userPrompt += `\nAspect Ratio: ${options.aspect_ratio}`;
        }
        if (options.quality) {
            userPrompt += `\nQuality: ${options.quality}`;
        }
        if (options.scene) {
            userPrompt += `\nScene: ${options.scene}`;
        }
        const garmentCount = referenceImageUrls?.length || 0;
        userPrompt += `\nReference Images: ${garmentCount} (garment/detail/face/style as provided)`;
        userPrompt += `\n\nPlease respond with ONLY a valid JSON object.`;

        const contentParts: any[] = [{ text: userPrompt }];
        const encodedHero = await this.encodeImageForBrain(heroImageUrl);
        contentParts.push(this.toBrainImagePart(encodedHero));

        // 业务要求：Planner 需要同时看 Hero + 参考图（衣服/细节/模特/风格）做 visual_audit
        const refs = (referenceImageUrls || []).filter(Boolean);
        for (const ref of refs) {
            const encoded = await this.encodeImageForBrain(ref);
            contentParts.push(this.toBrainImagePart(encoded));
        }

        const requestBody = {
            systemInstruction: {
                parts: [{ text: (systemPromptOverride ?? '').trim() || 'You are a helpful assistant.' }],
            },
            contents: [
                {
                    role: 'user',
                    parts: contentParts,
                },
            ],
            generationConfig: {
                temperature: 0.2,
                topP: 1,
                responseMimeType: 'application/json',
            },
        };

        try {
            this.logger.log(`🎬 Calling Brain storyboard planner... model=${model}`);
            const response = await this.postWithKeyFailover({
                keyPool,
                buildEndpoint,
                requestBody,
                axiosConfig: {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 300000,
                },
                logLabel: 'plan_storyboard',
            });

            await dumpModelResponseIfEnabled({
                kind: 'BRAIN',
                stage: 'plan_storyboard',
                taskId: meta?.taskId,
                model,
                responseData: response.data,
            });

            const candidate = response.data.candidates?.[0];
            if (!candidate) {
                throw new Error('No candidates returned from Brain API');
            }

            let thinkingProcess = '';
            for (const part of candidate.content?.parts || []) {
                if (part.thoughtSignature) {
                    thinkingProcess = part.thoughtSignature;
                    break;
                }
            }

            let rawText = '';
            for (const part of candidate.content?.parts || []) {
                if (part.text) rawText += part.text;
            }
            if (!rawText) {
                throw new Error('No text content in storyboard response');
            }

            const cleanContent = this.extractLastCompleteJSON(rawText);
            const parsed = JSON.parse(cleanContent);
            const normalized = this.normalizeHeroStoryboardPlannerOutput(parsed, options.shot_count);
            const plan = HeroStoryboardPlannerOutputSchema.parse(normalized);

            return {
                plan,
                thinkingProcess: thinkingProcess || undefined,
                audit: {
                    userPromptText: userPrompt,
                    heroImageUrl,
                    referenceImageUrls: refs,
                },
            };
        } catch (error: any) {
            // 这里经常会遇到：网关忽略 responseMimeType、模型输出被包了一层 plan/storyboard、或输出夹带解释文本
            // 为了便于排查，只打印“短预览”，避免日志爆炸
            const errSummary = error.response?.data || error.message;
            this.logger.error('Storyboard planning failed', errSummary);
            throw error;
        }
    }

    private getBrainKeyPool(config?: ModelConfig): string[] {
        const pool = Array.isArray(config?.brainKeys) ? config?.brainKeys : [];
        const single = (config?.brainKey || (config as any)?.apiKey || '').trim();
        const keys = pool.length > 0 ? pool : (single ? [single] : []);
        return Array.from(new Set(keys.map((k) => String(k).trim()).filter(Boolean)));
    }

    private pickKeyPair(keys: string[]): string[] {
        if (!keys.length) return [];
        const idx = this.keyRr % keys.length;
        this.keyRr = (this.keyRr + 1) % keys.length;
        const primary = keys[idx];
        const secondary = keys.length > 1 ? keys[(idx + 1) % keys.length] : undefined;
        return secondary && secondary !== primary ? [primary, secondary] : [primary];
    }

    private isFailoverableError(error: any): boolean {
        const status = Number(error?.response?.status);
        if (Number.isFinite(status)) {
            if (status === 429) return true;
            if (status >= 500) return true;
            return false;
        }

        const code = String(error?.code || '').toUpperCase();
        if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ECONNRESET') return true;

        const msg = String(error?.message || '').toLowerCase();
        if (msg.includes('timeout') || msg.includes('timed out')) return true;
        if (msg.includes('aborted') || msg.includes('canceled')) return true;

        return false;
    }

    private async postWithKeyFailover(params: {
        keyPool: string[];
        buildEndpoint: (key: string) => string;
        requestBody: any;
        axiosConfig: any;
        logLabel: string;
    }): Promise<any> {
        const { keyPool, buildEndpoint, requestBody, axiosConfig, logLabel } = params;
        const keys = this.pickKeyPair(keyPool);
        if (keys.length === 0) {
            throw new Error('Brain密钥未配置，请在设置页面配置Brain Key');
        }

        const safeEndpoint = buildEndpoint('***');
        this.logger.log(`📤 [${logLabel}] Endpoint: ${safeEndpoint}`);
        this.logger.log(`🔑 [${logLabel}] Key pool size: ${keyPool.length}`);

        try {
            return await axios.post(buildEndpoint(keys[0]), requestBody, axiosConfig);
        } catch (e: any) {
            if (keys.length < 2 || !this.isFailoverableError(e)) {
                throw e;
            }
            this.logger.warn(`⚠️ [${logLabel}] 上游失败（可切换 key 重试 1 次），正在切换到下一把 key...`);
            return axios.post(buildEndpoint(keys[1]), requestBody, axiosConfig);
        }
    }

    /**
     * Translate Chinese fix feedback into an English prompt for Painter
     */
    async translateFixFeedback(
        originalPrompt: string,
        feedback: string,
        config?: ModelConfig
    ): Promise<{ fixPromptEn: string }> {

        // MOCK MODE
        const keyPool = this.getBrainKeyPool(config);
        const shouldMock = process.env.MOCK_BRAIN === 'true' && keyPool.length === 0;

        if (shouldMock) {
            this.logger.warn('USING MOCK FIX TRANSLATION');
            return {
                fixPromptEn: `${originalPrompt} [FIXED: ${feedback}]`
            };
        }

        // User must configure model - no hardcoded defaults
        const model = config?.brainModel;
        if (!model) {
            throw new Error('Brain模型未配置，无法执行修复翻译');
        }

        const activeGateway = config?.brainGateway || config?.gatewayUrl || 'https://api.vectorengine.ai/v1';
        const baseUrl = activeGateway.replace('/v1', '/v1beta');
        const buildEndpoint = (key: string) =>
            `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

        const systemInstruction = `You are a professional fashion photography prompt engineer.
Your task is to modify an existing image generation prompt based on user feedback.
The user will provide feedback in Chinese describing what they want to change.
You must output ONLY the modified English prompt, incorporating the requested changes.
Keep the overall style and structure of the original prompt, but apply the specific changes requested.`;

        const userMessage = `Original Prompt:
${originalPrompt}

User Feedback (in Chinese):
${feedback}

Please output the modified English prompt that incorporates the user's requested changes:`;

        const requestBody = {
            systemInstruction: {
                parts: [{ text: systemInstruction }]
            },
            contents: [
                {
                    role: 'user',
                    parts: [{ text: userMessage }]
                }
            ],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 2048
            }
        };

        try {
            this.logger.log(`Calling Brain for fix translation...`);

            const response = await this.postWithKeyFailover({
                keyPool,
                buildEndpoint,
                requestBody,
                axiosConfig: {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                },
                logLabel: 'translate_fix_feedback',
            });

            const candidate = response.data.candidates?.[0];
            if (!candidate) {
                throw new Error('No candidates in fix translation response');
            }

            let fixPromptEn = '';
            for (const part of candidate.content?.parts || []) {
                if (part.text) {
                    fixPromptEn += part.text;
                }
            }

            this.logger.log(`Fix prompt generated: ${fixPromptEn.substring(0, 100)}...`);

            return { fixPromptEn: fixPromptEn.trim() };

        } catch (error: any) {
            this.logger.error('Fix translation failed', error.response?.data || error.message);
            // Fallback: append feedback to original prompt
            return {
                fixPromptEn: `${originalPrompt}. Additional requirements: ${feedback}`
            };
        }
    }
    async analyzeStyleImage(
        imagePaths: string | string[],
        config?: ModelConfig,
        trace?: { traceId?: string }
    ): Promise<any> {
        // Normalize to array
        const paths = Array.isArray(imagePaths) ? imagePaths : [imagePaths];

        // MOCK MODE
        const keyPool = this.getBrainKeyPool(config);
        const shouldMock = process.env.MOCK_BRAIN === 'true' && keyPool.length === 0;

        if (shouldMock) {
            this.logger.warn('USING MOCK STYLE ANALYSIS');
            return normalizeStyleLearnV1({
                schema: 'afs_style_v1',
                name: 'Rainy Cyberpunk Noir',
                description: 'Moody high-contrast neon-on-wet-streets fashion photo style.',
                lighting: {
                    environment: 'night / mixed',
                    key_light: { type: 'neon practicals', direction: 'side/back', softness: 'hard', color_temperature_k: 3200 },
                    fill_light: { type: 'ambient bounce', softness: 'soft', intensity: 'low' },
                    rim_light: { type: 'streetlight rim', direction: 'back', intensity: 'medium' },
                    shadow_character: 'high contrast, crisp shadows with soft ambient lift',
                },
                camera: {
                    shot_type: 'three-quarter',
                    camera_height: 'eye level',
                    camera_angle: 'three-quarter',
                    lens_focal_length_mm: 35,
                    aperture: 'f/2.0',
                    focus: 'sharp subject, shallow DOF bokeh highlights',
                },
                composition: { orientation: 'portrait', subject_placement: 'centered', crop_notes: 'keep full garment silhouette readable' },
                scene: { location: 'urban street', background: 'wet pavement, neon signs', time_of_day: 'night', weather: 'rainy' },
                color_grading: { white_balance: 'cool shadows / warm highlights', palette: ['teal', 'magenta', 'amber'], contrast: 'high', saturation: 'medium-high' },
                quality: { realism: 'photorealistic', texture_detail: 'high', grain: 'subtle' },
            });
        }

        const model = config?.brainModel || 'gemini-2.0-flash-exp'; // Use a fast vision model
        const activeGateway = config?.brainGateway || config?.gatewayUrl || 'https://api.vectorengine.ai/v1';

        // Convert to v1beta for Google Native format
        let baseUrl = activeGateway;
        if (baseUrl.endsWith('/v1')) {
            baseUrl = baseUrl.replace('/v1', '/v1beta');
        } else if (!baseUrl.includes('/v1beta')) {
            baseUrl = baseUrl.replace(/\/$/, "") + '/v1beta';
        }

        const buildEndpoint = (key: string) =>
            `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

        const prompt = `You are a world-class fashion photographer and art director.
Task: learn a reusable PHOTOGRAPHIC STYLE blueprint from the input image set.
If multiple images are provided, infer their shared "common DNA" and ignore outliers.
Focus ONLY on photography: lighting physics, scene/set design, composition, camera, color grading, and post-processing.
DO NOT describe garments, brands, logos, specific model identity, or any unique objects that would leak content.
Be concrete and specific, but keep it generic enough to be reusable as a style template.
All string values MUST be in English.
Return ONLY valid JSON (no markdown, no commentary) that conforms EXACTLY to this schema.
You MUST fill every field with a best-guess; never return null or empty strings.

{
  "schema": "afs_style_v1",
  "name": "Evocative style name (max 5 words)",
  "description": "1-2 sentences describing mood + commercial intent",
  "lighting": {
    "environment": "studio | daylight | mixed | night",
    "key_light": {
      "type": "softbox/window/sun/practical",
      "direction": "front/side/back + angle (e.g. 45 deg side-back)",
      "height": "low/eye/high",
      "softness": "soft/medium/hard",
      "color_temperature_k": 5600,
      "intensity": "low/medium/high",
      "notes": "what the key is doing"
    },
    "fill_light": { "type": "bounce/negative_fill/none", "intensity": "none/low/medium/high", "notes": "..." },
    "rim_light": { "type": "none/practical/strip", "direction": "back/side", "intensity": "none/low/medium/high", "notes": "..." },
    "shadow_character": "soft wrap / crisp / high-contrast, physically plausible",
    "specular_character": "matte / glossy highlights, highlight roll-off notes",
    "notes": "any important lighting constraints"
  },
  "camera": {
    "shot_type": "full body | three-quarter | half body | close-up",
    "camera_height": "low | eye level | high",
    "camera_angle": "front | three-quarter | profile",
    "lens_focal_length_mm": 85,
    "aperture": "f/2.8",
    "focus": "sharpness + depth of field notes",
    "capture_notes": "ISO/shutter or motion/flash notes if implied",
    "shutter_speed": "e.g. 1/250",
    "iso": "e.g. 100"
  },
  "composition": {
    "orientation": "portrait | landscape | square",
    "subject_placement": "centered | rule of thirds | negative space",
    "negative_space": "low | medium | high",
    "horizon_line": "low | mid | high | not visible",
    "foreground_background_layers": "describe depth layering and separation",
    "crop_notes": "cropping and silhouette readability notes"
  },
  "scene": {
    "location": "studio / street / indoor / outdoor etc.",
    "set_design": "key set design cues (seamless paper, concrete wall, skate park, etc)",
    "background": "background materials + textures + visual noise level",
    "floor": "floor material/texture if implied",
    "props": ["list props as generic types only"],
    "time_of_day": "morning / noon / golden hour / night etc.",
    "weather": "clear / cloudy / rainy etc.",
    "atmosphere": "haze/smoke/dust/rain droplets/none",
    "notes": "any additional scene rules (clean vs gritty, bokeh highlights, depth cues)"
  },
  "color_grading": {
    "white_balance": "neutral / warm / cool (+ nuance)",
    "palette": ["#RRGGBB", "#RRGGBB", "#RRGGBB"],
    "contrast": "low/medium/high (+ curve notes)",
    "saturation": "low/medium/high",
    "film_emulation": "film stock / digital look if implied",
    "grain": "none/subtle/noticeable",
    "notes": "what the grade is doing (neutral midtones, highlight roll-off, etc)"
  },
  "quality": {
    "realism": "photorealistic",
    "texture_detail": "low/medium/high",
    "skin_retouch": "none/subtle/beauty",
    "sharpness": "natural/crisp",
    "notes": "any additional rendering/retouch constraints"
  },
  "negative_constraints": [
    "No text overlays/watermarks.",
    "No pasted backgrounds/collage.",
    "No CGI/plastic look."
  ]
}`;

        const imageParts: any[] = [];
        // Encode all images once to avoid duplicate uploads on retry.
        for (const path of paths) {
            const encoded = await this.encodeImageForBrain(path);
            imageParts.push(this.toBrainImagePart(encoded));
            this.logger.log(`🌐 Using image reference (${encoded.kind}): ${encoded.kind === 'fileData' ? encoded.fileUri : '[inlineData]'}`);
        }

        const maxAttempts = 2;
        let lastError: any;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
            const contentParts: any[] = [{ text: prompt }, ...imageParts];

            const requestBody = {
                contents: [{ role: 'user', parts: contentParts }],
                generationConfig: {
                    temperature: 0.2,
                    responseMimeType: 'application/json'
                }
            };

            // Dump exact outgoing prompt (no base64; only text + file URIs / inlineData placeholder)
            try {
                const refId = String(trace?.traceId || '').trim() || undefined;
                const lines: string[] = [];
                lines.push('[BRAIN_REQUEST] analyze_style_image');
                lines.push('[TEXT]');
                lines.push(prompt);
                lines.push('');
                lines.push('[IMAGE_PARTS]');
                for (const p of contentParts) {
                    if (typeof p?.text === 'string') continue;
                    if (p?.fileData?.fileUri) {
                        lines.push(`- fileData: ${String(p.fileData.fileUri)}`);
                        continue;
                    }
                    if (p?.inlineData?.data) {
                        const mime = String(p?.inlineData?.mimeType || '');
                        const len = String(p?.inlineData?.data || '').length;
                        lines.push(`- inlineData: mime=${mime || 'unknown'} base64Len=${len}`);
                        continue;
                    }
                    lines.push(`- part: ${JSON.stringify(Object.keys(p || {}))}`);
                }
                lines.push('');
                lines.push('[GENERATION_CONFIG]');
                lines.push(JSON.stringify(requestBody.generationConfig));

                const dumped = await dumpPromptText({
                    kind: 'BRAIN',
                    stage: 'analyze_style_image_request',
                    refId,
                    content: lines.join('\n'),
                });

                logLargeText({
                    log: (m) => this.logger.log(m),
                    header: `🧾 Brain Style Learn REQUEST (ref=${refId || '-'}) saved=${dumped.filePath.replace(/\\\\/g, '/')} sha256=${dumped.sha256.slice(0, 12)}`,
                    text: lines.join('\n'),
                    chunkSize: 3200,
                    maxLen: 120_000,
                });
            } catch {
                // ignore dump failures
            }

            this.logger.log(`🔍 Analyzing style image with ${model}...`);
            const response = await this.postWithKeyFailover({
                keyPool,
                buildEndpoint,
                requestBody,
                axiosConfig: {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 300000
                },
                logLabel: 'analyze_style_image',
            });

            await dumpModelResponseIfEnabled({
                kind: 'BRAIN',
                stage: 'analyze_style_image',
                model,
                responseData: response.data,
            });

            const candidate = response.data.candidates?.[0];
            if (!candidate) throw new Error('No candidates in analysis response');

            let rawContent = '';
            for (const part of candidate.content?.parts || []) {
                if (part?.thought) continue;
                if (typeof part?.text === 'string') rawContent += part.text;
            }
            rawContent = String(rawContent || '').trim();
            if (!rawContent) throw new Error('No text content in analysis response');

            // Dump raw response text (what model returned as text parts)
            try {
                const refId = String(trace?.traceId || '').trim() || undefined;
                const dumped = await dumpPromptText({
                    kind: 'BRAIN',
                    stage: 'analyze_style_image_response_text',
                    refId,
                    content: rawContent,
                });

                logLargeText({
                    log: (m) => this.logger.log(m),
                    header: `🧾 Brain Style Learn RESPONSE_TEXT (ref=${refId || '-'}) saved=${dumped.filePath.replace(/\\\\/g, '/')} sha256=${dumped.sha256.slice(0, 12)}`,
                    text: rawContent,
                    chunkSize: 3200,
                    maxLen: 120_000,
                });
            } catch {
                // ignore
            }

            const cleanContent = this.extractLastCompleteJSON(rawContent);
            const json = JSON.parse(cleanContent);

            // Translate values to Chinese for consistency
            // Note: For now we keep English as internal style signals are often better in English, 
            // BUT user requested Chinese UI.
            // Let's translate values to Chinese using TranslationService if needed, 
            // but for technical prompts, English is often better for re-generation.
            // Compromise: We store English parameters for generation, but maybe frontend shows translated?
            // User Rule: "所有对话回复、步骤说明...一律使用中文" -> But these are technical params for the AI itself.
            // Decision: Keep English for precision, as these are "Tech Specs". 
            // If user wants to see them, we can translate on read.

            const normalized = normalizeStyleLearnV1(json);

            // Dump final parsed JSON (what we store as promptBlock)
            try {
                const refId = String(trace?.traceId || '').trim() || undefined;
                const dumped = await dumpPromptText({
                    kind: 'BRAIN',
                    stage: 'analyze_style_image_response_json',
                    refId,
                    content: JSON.stringify(normalized, null, 2),
                });

                logLargeText({
                    log: (m) => this.logger.log(m),
                    header: `🧾 Brain Style Learn RESPONSE_JSON (ref=${refId || '-'}) saved=${dumped.filePath.replace(/\\\\/g, '/')} sha256=${dumped.sha256.slice(0, 12)}`,
                    text: JSON.stringify(normalized, null, 2),
                    chunkSize: 3200,
                    maxLen: 120_000,
                });
            } catch {
                // ignore
            }

            return normalized;
            } catch (error: any) {
                lastError = error;
                this.logger.error(
                    `Style Analysis Failed (attempt ${attempt}/${maxAttempts})`,
                    error?.response?.data || error?.message || error
                );
                if (attempt < maxAttempts) {
                    this.logger.warn('🔁 Retrying style analysis once...');
                }
            }
        }

        throw lastError || new Error('Style Analysis Failed');
    }

    /**
     * AI 姿势学习：分析姿势参考图，输出可复用的 pose prompt block（JSON -> server 格式化后落库）。
     * 约束：只负责“人体姿势/构图/遮挡禁区”，不描述衣服细节。
     */
    async analyzePoseImage(
        imagePath: string,
        config?: ModelConfig,
        trace?: { traceId?: string }
    ): Promise<any> {
        const input = String(imagePath || '').trim();
        if (!input) {
            throw new Error('imagePath 不能为空');
        }

        const keyPool = this.getBrainKeyPool(config);
        const shouldMock = process.env.MOCK_BRAIN === 'true' && keyPool.length === 0;
        if (shouldMock) {
            this.logger.warn('USING MOCK POSE ANALYSIS');
            return normalizePoseLearnV1({
                schema: 'afs_pose_v1',
                name: 'Auto Pose 001',
                description: 'A clean standing pose with slight contrapposto.',
                framing: {
                    shot_type: 'full body',
                    camera_angle: 'eye level',
                    camera_height: 'eye level',
                    lens_hint: '50mm',
                    crop_notes: 'Keep full silhouette visible.',
                },
                pose: {
                    head: 'Head slightly turned to camera-left.',
                    gaze: 'Eyes to camera or slightly off-camera.',
                    shoulders: 'Relaxed shoulders, chest open.',
                    torso: 'Slight S-curve, natural posture.',
                    arms_hands: 'One hand near hip, the other relaxed.',
                    legs_feet: 'Weight on one leg, other leg slightly forward.',
                },
                must_keep_visible: ['garment front panel', 'face'],
                occlusion_no_go: [
                    'Do not cover the garment front panel with hands.',
                    'No props blocking the torso.',
                ],
            });
        }

        const model = config?.brainModel || 'gemini-2.0-flash-exp';
        const activeGateway = config?.brainGateway || config?.gatewayUrl || 'https://api.vectorengine.ai/v1';

        // Convert to v1beta for Google Native format
        let baseUrl = activeGateway;
        if (baseUrl.endsWith('/v1')) {
            baseUrl = baseUrl.replace('/v1', '/v1beta');
        } else if (!baseUrl.includes('/v1beta')) {
            baseUrl = baseUrl.replace(/\/$/, "") + '/v1beta';
        }

        const buildEndpoint = (key: string) =>
            `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

        const prompt = `You are a world-class fashion pose director.
Task: learn a reusable POSE blueprint from the input image.
Focus ONLY on human pose + framing. Do NOT describe garment details, fabric, patterns, logos, brand, or identity.
All string values MUST be in English.
Return ONLY valid JSON (no markdown, no commentary) that conforms EXACTLY to this schema.
You MUST fill every field with a best-guess; never return null.

{
  "schema": "afs_pose_v1",
  "name": "Short pose name (max 6 words)",
  "description": "1 sentence, what this pose communicates",
  "framing": {
    "shot_type": "full body | three-quarter | half body | close-up",
    "camera_angle": "eye level | low angle | high angle",
    "camera_height": "low | eye level | high",
    "lens_hint": "e.g. 35mm/50mm/85mm",
    "crop_notes": "cropping notes"
  },
  "pose": {
    "head": "head orientation",
    "gaze": "gaze direction",
    "shoulders": "shoulder line + rotation",
    "torso": "torso angle + posture",
    "hips": "hip rotation + stance",
    "arms_hands": "arm positions + hand placement",
    "legs_feet": "leg positions + foot direction",
    "weight_distribution": "where the weight sits"
  },
  "must_keep_visible": [
    "what must stay visible (e.g. garment front panel, face)"
  ],
  "occlusion_no_go": [
    "what must NOT be occluded, one per line"
  ],
  "constraints": [
    "extra constraints as short English bullets"
  ]
}`;

        const encoded = await this.encodeImageForBrain(input);
        const requestBody = {
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: prompt },
                        this.toBrainImagePart(encoded),
                    ],
                },
            ],
            generationConfig: {
                temperature: 0.2,
                responseMimeType: 'application/json',
            },
        };

        const maxAttempts = 2;
        let lastError: any;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
            // Dump outgoing prompt (no base64)
            try {
                const refId = String(trace?.traceId || '').trim() || undefined;
                const lines: string[] = [];
                lines.push('[BRAIN_REQUEST] analyze_pose_image');
                lines.push('[TEXT]');
                lines.push(prompt);
                lines.push('');
                lines.push('[IMAGE_PART]');
                if (encoded.kind === 'fileData') {
                    lines.push(`fileData: ${encoded.fileUri}`);
                } else {
                    lines.push(`inlineData: mime=${encoded.mimeType} base64Len=${encoded.data.length}`);
                }
                lines.push('');
                lines.push('[GENERATION_CONFIG]');
                lines.push(JSON.stringify(requestBody.generationConfig));
                const dumped = await dumpPromptText({ kind: 'BRAIN', stage: 'analyze_pose_image_request', refId, content: lines.join('\n') });
                logLargeText({
                    log: (m) => this.logger.log(m),
                    header: `🧾 Brain Pose Learn REQUEST (ref=${refId || '-'}) saved=${dumped.filePath.replace(/\\\\/g, '/')} sha256=${dumped.sha256.slice(0, 12)}`,
                    text: lines.join('\n'),
                    chunkSize: 3200,
                    maxLen: 120_000,
                });
            } catch {
                // ignore
            }

            const response = await this.postWithKeyFailover({
                keyPool,
                buildEndpoint,
                requestBody,
                axiosConfig: {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 300000,
                },
                logLabel: 'analyze_pose_image',
            });

            await dumpModelResponseIfEnabled({
                kind: 'BRAIN',
                stage: 'analyze_pose_image',
                model,
                responseData: response.data,
            });

            const candidate = response.data.candidates?.[0];
            if (!candidate) throw new Error('No candidates in pose analysis response');

            let rawContent = '';
            for (const part of candidate.content?.parts || []) {
                if (part?.thought) continue;
                if (typeof part?.text === 'string') rawContent += part.text;
            }
            rawContent = String(rawContent || '').trim();
            if (!rawContent) throw new Error('No text content in pose analysis response');

            // Dump raw response text
            try {
                const refId = String(trace?.traceId || '').trim() || undefined;
                const dumped = await dumpPromptText({
                    kind: 'BRAIN',
                    stage: 'analyze_pose_image_response_text',
                    refId,
                    content: rawContent,
                });
                logLargeText({
                    log: (m) => this.logger.log(m),
                    header: `🧾 Brain Pose Learn RESPONSE_TEXT (ref=${refId || '-'}) saved=${dumped.filePath.replace(/\\\\/g, '/')} sha256=${dumped.sha256.slice(0, 12)}`,
                    text: rawContent,
                    chunkSize: 3200,
                    maxLen: 120_000,
                });
            } catch {
                // ignore
            }

            const cleanContent = this.extractLastCompleteJSON(rawContent);
            const normalized = normalizePoseLearnV1(JSON.parse(cleanContent));

            // Dump final parsed JSON (what we store as promptBlock)
            try {
                const refId = String(trace?.traceId || '').trim() || undefined;
                const dumped = await dumpPromptText({
                    kind: 'BRAIN',
                    stage: 'analyze_pose_image_response_json',
                    refId,
                    content: JSON.stringify(normalized, null, 2),
                });
                logLargeText({
                    log: (m) => this.logger.log(m),
                    header: `🧾 Brain Pose Learn RESPONSE_JSON (ref=${refId || '-'}) saved=${dumped.filePath.replace(/\\\\/g, '/')} sha256=${dumped.sha256.slice(0, 12)}`,
                    text: JSON.stringify(normalized, null, 2),
                    chunkSize: 3200,
                    maxLen: 120_000,
                });
            } catch {
                // ignore
            }

            return normalized;
            } catch (e: any) {
                lastError = e;
                this.logger.error(
                    `Pose Analysis Failed (attempt ${attempt}/${maxAttempts})`,
                    e?.response?.data || e?.message || e
                );
                if (attempt < maxAttempts) {
                    this.logger.warn('🔁 Retrying pose analysis once...');
                }
            }
        }

        throw lastError || new Error('Pose Analysis Failed');
    }
}
