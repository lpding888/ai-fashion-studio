
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import OpenAI from 'openai';
import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import { z } from 'zod';
import { ModelConfig } from '../common/model-config';
import { TranslationService } from '../translation/translation.service';
import { CosService } from '../cos/cos.service';  // ✅ 导入 CosService
import { dumpModelResponseIfEnabled } from '../common/model-response-dump';

// Define image metadata schema
const ImageMetadataSchema = z.object({
    index: z.number(),
    view_type: z.enum(['front', 'back', 'side', 'detail', 'full_outfit', 'angle', 'texture', 'other']),
    description: z.string(),
    focus_area: z.string().optional()
});

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
}).refine(data => data.prompt || data.prompt_en, {
    message: "Either 'prompt' or 'prompt_en' must be provided"
});

export const BrainPlanSchema = z.object({
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
    private async encodeImageForBrain(filePath: string): Promise<{
        url: string;
        mimeType: string;
    }> {
        const input = (filePath ?? '').trim();
        if (!input) {
            throw new Error('图片路径为空');
        }

        // URL：直接走 fileData（不下载、不转 base64）
        if (input.startsWith('http://') || input.startsWith('https://')) {
            const useDirectURL = process.env.USE_DIRECT_IMAGE_URL !== 'false'; // 默认启用

            // COS URL：可选用万象做缩放/压缩（仍然是 URL，不走 base64）
            if (useDirectURL && this.cosService.isValidCosUrl(input)) {
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
                        url: optimizedUrl,
                        mimeType: this.guessMimeTypeFromPathOrHeader(input),
                    };
                } catch (error) {
                    this.logger.warn(`Failed to generate CI URL for ${input}, fallback to original URL`, error);
                }
            }

            return {
                url: input,
                mimeType: this.guessMimeTypeFromPathOrHeader(input),
            };
        }

        // 本地路径：必须先转存 COS，然后用 COS URL（fileData）
        if (!(await fs.pathExists(input))) {
            throw new Error(`图片文件不存在: ${input}`);
        }
        if (!this.cosService.isEnabled()) {
            throw new Error('COS未配置：禁止服务器把图片转Base64发给模型；请启用COS或改为前端直传COS URL');
        }

        const ext = path.extname(input) || '.jpg';
        const key = `uploads/server/brain-refs/${Date.now()}_${crypto.randomUUID()}${ext}`;
        await this.cosService.uploadFile(key, input);

        return {
            url: this.cosService.getImageUrl(key),
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
        const activeKey = config?.brainKey || config?.apiKey;
        const shouldMock = process.env.MOCK_BRAIN === 'true' && !activeKey;

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

        const endpoint = `${baseUrl}/models/${model}:generateContent?key=${activeKey}`;

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

                contentParts.push({
                    fileData: {
                        fileUri: encoded.url,
                        mimeType: encoded.mimeType,
                    },
                });
                this.logger.log(`🌐 Garment image (fileData): ${encoded.url}`);
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

                    contentParts.push({
                        fileData: {
                            fileUri: encoded.url,
                            mimeType: encoded.mimeType,
                        },
                    });
                    this.logger.log(`🌐 Style ref (fileData): ${encoded.url}`);
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

                    contentParts.push({
                        fileData: {
                            fileUri: encoded.url,
                            mimeType: encoded.mimeType,
                        },
                    });
                    this.logger.log(`🌐 Face ref (fileData): ${encoded.url}`);
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
            const safeEndpoint = activeKey ? endpoint.replace(activeKey, 'sk-***') : endpoint;
            this.logger.log(`📤 Request endpoint: ${safeEndpoint}`);
            this.logger.log(`📤 Request body preview (first 500 chars): ${JSON.stringify(requestBody).substring(0, 500)}`);

            const response = await this.fetchWithRetry(endpoint, requestBody, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 300000 // 5min
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
                this.logger.error(`Content that failed to parse: ${cleanContent.substring(0, 1000)}`);
                throw new Error(`Failed to parse AI response: ${e.message}`);
            }

            this.logger.log(`🔍 Validating JSON against schema...`);
            const parseResult = BrainPlanSchema.safeParse(json);
            if (!parseResult.success) {
                this.logger.error('❌ ========== JSON VALIDATION FAILED ==========');
                this.logger.error(`Validation errors: ${JSON.stringify(parseResult.error.flatten().fieldErrors)}`);
                this.logger.error('============================================');
                throw new Error(`Brain API returned invalid JSON structure: ${JSON.stringify(parseResult.error.flatten().fieldErrors)}`);
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
        const activeKey = config?.brainKey || config?.apiKey;
        const shouldMock = process.env.MOCK_BRAIN === 'true' && !activeKey;

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

        const endpoint = `${baseUrl}/models/${model}:generateContent?key=${activeKey}`;

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
        contentParts.push({
            fileData: {
                fileUri: encodedHero.url,
                mimeType: encodedHero.mimeType,
            },
        });

        // 业务要求：Planner 需要同时看 Hero + 参考图（衣服/细节/模特/风格）做 visual_audit
        const refs = (referenceImageUrls || []).filter(Boolean);
        for (const ref of refs) {
            const encoded = await this.encodeImageForBrain(ref);
            contentParts.push({
                fileData: {
                    fileUri: encoded.url,
                    mimeType: encoded.mimeType,
                },
            });
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
            const response = await this.fetchWithRetry(endpoint, requestBody, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 300000,
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

    /**
     * Helper to retry requests on 429/5xx errors with exponential backoff
     */
    private async fetchWithRetry(url: string, payload: any, config: any, retries = 3, backoff = 2000): Promise<any> {
        try {
            return await axios.post(url, payload, config);
        } catch (error: any) {
            const status = error.response?.status;
            if (retries > 0 && (status === 429 || status >= 500)) {
                this.logger.warn(`API Request failed with ${status}. Retrying in ${backoff / 1000}s... (${retries} retries left)`);
                await new Promise(r => setTimeout(r, backoff));
                return this.fetchWithRetry(url, payload, config, retries - 1, backoff * 2);
            }
            throw error;
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
        const activeKey = config?.brainKey || config?.apiKey;
        const shouldMock = process.env.MOCK_BRAIN === 'true' && !activeKey;

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
        const endpoint = `${baseUrl}/models/${model}:generateContent?key=${activeKey}`;

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

            const response = await axios.post(
                endpoint,
                requestBody,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

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
    async analyzeStyleImage(imagePaths: string | string[], config?: ModelConfig): Promise<any> {
        // Normalize to array
        const paths = Array.isArray(imagePaths) ? imagePaths : [imagePaths];

        // MOCK MODE
        const activeKey = config?.brainKey || config?.apiKey;
        const shouldMock = process.env.MOCK_BRAIN === 'true' && !activeKey;

        if (shouldMock) {
            this.logger.warn('USING MOCK STYLE ANALYSIS');
            return {
                name: "Rainy Cyberpunk Noir",
                description: "A moody, high-contrast urban aesthetic combining neon lights with wet textures.",
                lighting: "Soft, diffused natural light (Golden Hour)",
                scene: "Outdoor urban street with rainy atmosphere",
                grading: "Cyberpunk teal and orange, high contrast",
                texture: "Reflective wet pavement, synthetic fabrics",
                vibe: "Melancholic, cinematic, solitary",
                camera: "35mm focal length, f/2.0 aperture, slight vignetting"
            };
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

        const endpoint = `${baseUrl}/models/${model}:generateContent?key=${activeKey}`;

        const prompt = `Act as a world-class Fashion Photographer and Art Director.
Analyze this set of images to reverse-engineer their **shared aesthetic formula** ("The Common DNA").
Ignore outliers if any, focus on the consistent visual theme across the series.

First, give this style a creative, evocative **Name** (max 4-5 words, e.g. "Cyberpunk Neon Noir", "Vintage French Film").
Second, write a compelling **Description** (1-2 sentences) summarizing the mood and visual impact.
Third, break it down into these 6 critical dimensions.
Be extremely specific with technical terminology (e.g. "Rembrandt lighting", "85mm lens", "Teal & Orange grading").

Output ONLY a JSON object with these keys:
{
  "name": "Creative Style Name",
  "description": "Compelling summary of the aesthetic",
  "lighting": "Detailed description of light quality, direction, and color temperature",
  "scene": "Environment, time of day, weather, and spatial context",
  "grading": "Color palette, saturation, contrast, and film look",
  "texture": "Key surface details, fabric qualities, and resolution feel",
  "vibe": "Emotional atmosphere, model attitude, and energy",
  "camera": "Lens focal length, depth of field (bokeh), and camera angle"
}`;

        const contentParts: any[] = [{ text: prompt }];

        try {
            // Encode all images using Gemini-native format
            for (const path of paths) {
                const encoded = await this.encodeImageForBrain(path);
                contentParts.push({
                    fileData: {
                        fileUri: encoded.url,
                        mimeType: encoded.mimeType,
                    },
                });
                this.logger.log(`🌐 Using URL reference (fileData): ${encoded.url}`);
            }

            const requestBody = {
                contents: [{ role: 'user', parts: contentParts }],
                generationConfig: {
                    temperature: 0.2,
                    responseMimeType: 'application/json'
                }
            };

            this.logger.log(`🔍 Analyzing style image with ${model}...`);
            const response = await this.fetchWithRetry(endpoint, requestBody, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 60000
            });

            const rawContent = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!rawContent) throw new Error('No content in analysis response');

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

            return json;

        } catch (error: any) {
            this.logger.error('Style Analysis Failed', error.message);
            // Fallback to empty analysis rather than blocking
            return {
                lighting: "N/A",
                scene: "N/A",
                grading: "N/A",
                texture: "N/A",
                vibe: "N/A",
                camera: "N/A"
            };
        }
    }
}
