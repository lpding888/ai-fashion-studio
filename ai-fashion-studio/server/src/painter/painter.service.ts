
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { ModelConfig } from '../common/model-config';

export interface PainterOptions {
    aspectRatio?: string;       // 画面比例 (如: "16:9", "1:1", "9:16")
    imageSize?: string;         // 图像尺寸 (如: "2048x2048", "1024x1024")
    editMode?: string;          // 编辑模式 (如: "EDIT_MODE_INPAINT", "EDIT_MODE_BGSWAP")
    negativePrompt?: string;
}

@Injectable()
export class PainterService {
    private logger = new Logger(PainterService.name);

    constructor() {
        fs.ensureDirSync('./uploads/painter');
    }

    private applyTencentCiCompressionIfPossible(originalUrl: string) {
        if (!originalUrl.startsWith('http')) {
            return { url: originalUrl, applied: false };
        }

        if (originalUrl.includes('imageMogr2/')) {
            return { url: originalUrl, applied: false };
        }

        try {
            const url = new URL(originalUrl);
            const host = url.hostname.toLowerCase();
            const isTencentCos = host.includes('.cos.') && host.endsWith('.myqcloud.com');

            if (!isTencentCos) {
                return { url: originalUrl, applied: false };
            }

            const hasSignedParams = Array.from(url.searchParams.keys()).some((key) => {
                const lowerKey = key.toLowerCase();
                return lowerKey.startsWith('q-sign-') || lowerKey.startsWith('x-cos-') || lowerKey.includes('signature');
            });

            if (hasSignedParams) {
                return { url: originalUrl, applied: false };
            }

            // ✅ Painter需要高质量参考图，使用轻度压缩
            // 分辨率2560px足够大，质量95%接近无损
            const ciOps = 'imageMogr2/thumbnail/2560x/quality/95';
            const joiner = url.search.length > 0 ? '&' : '?';

            return { url: `${originalUrl}${joiner}${ciOps}`, applied: true };
        } catch {
            return { url: originalUrl, applied: false };
        }
    }

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

    async generateImage(
        prompt: string,
        refImagePaths: string[] = [],
        options: PainterOptions = {},
        config?: ModelConfig
    ): Promise<string> {
        const result = await this.generateImageWithLog(prompt, refImagePaths, options, config);
        return result.imagePath;
    }

    async generateImageWithLog(
        prompt: string,
        refImagePaths: string[] = [],
        options: PainterOptions = {},
        config?: ModelConfig,
        context?: { taskId?: string; stage?: string } // Add context param to match usage
    ): Promise<{ imagePath: string; shootLogText: string }> {

        // MOCK MODE
        if (process.env.MOCK_PAINTER === 'true') {
            this.logger.warn('USING MOCK PAINTER RESPONSE');
            await new Promise(r => setTimeout(r, 1000));
            return { imagePath: 'src/assets/mock_render.png', shootLogText: 'Mock thinking process...' };
        }

        const gateway = config?.painterGateway || config?.gatewayUrl || "https://api.vectorengine.ai/v1";
        const apiKey = config?.painterKey || config?.apiKey;
        const model = config?.painterModel;

        this.logger.log(`🎨 Painter Config - Gateway: ${gateway?.substring(0, 30)}..., Model: ${model || 'UNDEFINED'}, Key: ${apiKey ? 'YES' : 'NO'}`);

        if (!model) {
            throw new Error('Painter模型未配置，请在设置页面配置Painter模型');
        }

        // Normalize gateway URL and ensure it has /v1 or /v1beta
        let normalizedGateway = gateway.replace(/\/+$/, ''); // Remove trailing slashes
        if (!normalizedGateway.match(/\/v1(beta)?$/)) {
            // If gateway doesn't end with /v1 or /v1beta, add /v1
            normalizedGateway = `${normalizedGateway}/v1`;
        }

        // Use VectorEngine URL format with API key as query parameter
        const endpoint = `${normalizedGateway}/models/${model}:generateContent?key=${apiKey}`;

        this.logger.log(`🔗 Final Endpoint: ${endpoint.replace(apiKey, 'sk-***')}`);
        this.logger.log(`Prompt: ${prompt.substring(0, 100)}...`);
        this.logger.log(`📷 Reference images: ${refImagePaths.length} files`);
        if (context) {
            this.logger.log(`ℹ️ Context: Task=${context.taskId}, Stage=${context.stage}`);
        }

        // Read reference images if provided
        const parts: any[] = [
            { text: prompt }
        ];

        for (const imgPath of refImagePaths) {
            if (imgPath.startsWith('http')) {
                // ✅ 使用Gemini标准格式：fileData (通过URL引用)
                const { url: optimizedUrl, applied: ciApplied } = this.applyTencentCiCompressionIfPossible(imgPath);
                const mimeType = this.guessMimeTypeFromPathOrHeader(optimizedUrl);

                this.logger.log(`🌐 Using URL reference (fileData): ${imgPath.substring(0, 60)}...${ciApplied ? ' [CI optimized]' : ''}`);

                parts.push({
                    fileData: {
                        fileUri: optimizedUrl,
                        mimeType: mimeType
                    }
                });
            } else if (await fs.pathExists(imgPath)) {
                // ✅ 使用Gemini标准格式：inline_data (Base64内联)
                const imgBuffer = await fs.readFile(imgPath);
                const base64 = imgBuffer.toString('base64');
                const mimeType = this.guessMimeTypeFromPathOrHeader(imgPath);

                parts.push({
                    inline_data: {
                        mime_type: mimeType,
                        data: base64
                    }
                });
                this.logger.log(`📦 Loaded local image (inline_data): ${imgPath} (${(base64.length / 1024).toFixed(1)}KB)`);
            } else {
                this.logger.warn(`⚠️ Image file not found: ${imgPath}`);
            }
        }

        // Google Native API format for image generation
        const generationConfig: any = {
            responseModalities: ['TEXT', 'IMAGE'],
            candidateCount: 1
        };

        // Build imageConfig object for resolution and aspect ratio
        const imageConfig: any = {};

        if (options.aspectRatio) {
            imageConfig.aspectRatio = options.aspectRatio;
        }

        if (options.imageSize) {
            // Enhanced mapping to handle both pixel/name formats
            const sizeMap: Record<string, string> = {
                '1024x1024': '1K',
                '2048x2048': '2K',
                '4096x4096': '4K',
                '1K': '1K',
                '2K': '2K',
                '4K': '4K'
            };
            const mappedSize = sizeMap[options.imageSize] || '2K';
            imageConfig.imageSize = mappedSize;
            this.logger.log(`📐 Image Gen Config - Size: ${mappedSize} (Raw: ${options.imageSize}), Aspect: ${options.aspectRatio || 'DEFAULT'}`);
        }

        // Add imageConfig to generationConfig if it has any properties
        if (Object.keys(imageConfig).length > 0) {
            generationConfig.imageConfig = imageConfig;
        }

        // Add editMode if provided (e.g., "EDIT_MODE_INPAINT")
        // NOTE: For Gemini 3, sometimes editMode is a separate top-level field or part of generationConfig
        if (options.editMode) {
            generationConfig.editMode = options.editMode;
            this.logger.log(`✏️ Edit mode set to: ${options.editMode}`);
        }

        const payload = {
            contents: [{ role: 'user', parts: parts }],
            generationConfig: generationConfig
        };

        // Log the config (NOT the full payload with Base64!)
        this.logger.log(`📤 Generation Config:`, JSON.stringify(generationConfig, null, 2));

        try {
            this.logger.log(`Calling Painter... Prompt len: ${prompt.length}`);
            const timeoutMs = Number(process.env.PAINTER_TIMEOUT_MS || 600000); // 默认 10 分钟，Grid/多参考图更容易超时

            const response = await axios.post(endpoint, payload, {
                headers: {
                    // 'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: timeoutMs
            });

            const data = response.data;

            // Log response summary
            const responseSummary = {
                hasCandidates: !!data.candidates,
                candidatesCount: data.candidates?.length || 0,
                // Do not log full prompt feedback if it's huge
                blockReason: data.promptFeedback?.blockReason
            };
            this.logger.debug('📨 API Response Received', responseSummary);

            // ... (rest of processing logic remains the same until catch)

            // Re-verify the rest of the flow...

            // Manually recreate the middle part to ensure no context mismatch
            if (data.promptFeedback?.blockReason) {
                this.logger.error(`❌ Prompt blocked: ${data.promptFeedback.blockReason}`);
                throw new Error(`Prompt blocked: ${data.promptFeedback.blockReason}`);
            }

            const candidate = data.candidates?.[0];
            if (!candidate) {
                this.logger.error('❌ No candidates in response');
                throw new Error('No candidates returned from Painter API');
            }

            // Check candidate finish reason
            if (candidate.finishReason && candidate.finishReason !== 'STOP') {
                this.logger.warn(`⚠️ Unusual finish reason: ${candidate.finishReason}`, {
                    safetyRatings: candidate.safetyRatings
                });
            }

            // Log candidate content structure for debugging
            this.logger.log(`📦 Candidate content structure:`, {
                hasParts: !!candidate.content?.parts,
                partsCount: candidate.content?.parts?.length || 0,
                partTypes: candidate.content?.parts?.map((p: any) => Object.keys(p))
            });

            // Extract thinking process if present
            let thinkingProcess = '';
            for (const part of candidate.content?.parts || []) {
                if (part.thoughtSignature) {
                    thinkingProcess = part.thoughtSignature;
                    this.logger.log(`💭 Painter Thinking Process:\n${thinkingProcess}`);
                    break;
                }
            }

            // Extract image from response - check both inline_data and inlineData
            for (const part of candidate.content?.parts || []) {
                const imageData = part.inline_data || part.inlineData;

                if (imageData) {
                    const base64Data = imageData.data;
                    const buffer = Buffer.from(base64Data, 'base64');
                    const mimeType = imageData.mime_type || imageData.mimeType || 'image/png';
                    const ext = mimeType.includes('png') ? 'png' : 'jpg';

                    const filename = `${Date.now()}_${randomUUID()}.${ext}`;
                    const savePath = `./uploads/painter/${filename}`;
                    await fs.writeFile(savePath, buffer);

                    this.logger.log(`✅ Found image data, mime: ${mimeType}, size: ${(buffer.length / 1024).toFixed(1)}KB`);
                    this.logger.log(`💾 Image saved to ${savePath}`);
                    return { imagePath: savePath, shootLogText: thinkingProcess || '' };
                }
            }

            // No image found
            this.logger.error(`❌ No image in response parts`);
            throw new Error('No image data found in API response');

        } catch (error) {
            // SAFE ERROR LOGGING
            const errorData = error.response?.data;
            const safeError = errorData ? {
                code: errorData.error?.code,
                message: errorData.error?.message,
                status: errorData.error?.status
            } : error.message;

            this.logger.error('Painter API error (Sanitized):', safeError);
            throw new Error(`Image generation failed: ${error.message}`);
        }
    }
}
