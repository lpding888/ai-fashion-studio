import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { ModelConfig } from '../common/model-config';
import { CosService } from '../cos/cos.service';
import type { Readable } from 'stream';
import * as path from 'path';
import { dumpPromptText } from '../common/prompt-dump';
import { logLargeText } from '../common/log-large-text';

export interface PainterOptions {
  aspectRatio?: string; // 画面比例 (如: "16:9", "1:1", "9:16")
  imageSize?: string; // 图像尺寸 (如: "2048x2048", "1024x1024")
  editMode?: string; // 编辑模式 (如: "EDIT_MODE_INPAINT", "EDIT_MODE_BGSWAP")
  negativePrompt?: string;
  seed?: number; // generationConfig.seed（部分模型/网关支持）
  temperature?: number; // generationConfig.temperature（部分模型/网关支持）
  /**
   * Thinking（实验）：仅当上游模型支持时生效。
   * 注意：若开启 includeThoughts，部分上游可能更倾向返回 TEXT；本服务会保持 responseModalities=['IMAGE'] 并做无图兜底重试。
   */
  thinkingConfig?: {
    includeThoughts?: boolean;
    thinkingBudget?: number;
  };
  /**
   * 可选：覆盖 generationConfig.responseModalities。
   * 说明：部分网关会偏向返回第一个模态，因此默认会把 IMAGE 放在前面。
   */
  responseModalities?: Array<'IMAGE' | 'TEXT'>;
}

export type PainterChatMessage = {
  role: 'user' | 'model';
  text: string;
};

export type PainterChatImage = {
  label: string;
  pathOrUrl: string;
  allowCi?: boolean;
};

@Injectable()
export class PainterService {
  private logger = new Logger(PainterService.name);
  private keyRr = 0;

  constructor(private readonly cosService: CosService) {
    fs.ensureDirSync('./uploads/painter');
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  isScfEnabled(): boolean {
    const enabled =
      String(process.env.USE_SCF_PAINTER || '').trim().toLowerCase() === 'true';
    const scfUrl = String(process.env.SCF_PAINTER_URL || '').trim();
    return enabled && scfUrl.length > 0;
  }

  private buildScfConfig(config?: ModelConfig): Record<string, unknown> {
    if (!config) return {};

    const payload: Record<string, unknown> = {};
    if (config.painterGateway) payload.painterGateway = config.painterGateway;
    if (config.gatewayUrl) payload.gatewayUrl = config.gatewayUrl;
    if (config.painterModel) payload.painterModel = config.painterModel;
    if (config.painterKey) {
      payload.painterKey = config.painterKey;
      payload.apiKey = config.painterKey;
    }
    if (Array.isArray(config.painterKeys) && config.painterKeys.length > 0) {
      payload.painterKeys = config.painterKeys;
    }

    return payload;
  }

  async generateImagesViaScf(args: {
    taskId: string;
    shots: Array<Record<string, unknown>>;
    config?: ModelConfig;
  }): Promise<unknown[]> {
    if (!this.isScfEnabled()) {
      throw new Error('SCF Painter 未启用');
    }

    const scfUrl = String(process.env.SCF_PAINTER_URL || '').trim();
    if (!scfUrl) {
      throw new Error('未配置 SCF_PAINTER_URL 环境变量');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const apiKey = String(process.env.SCF_API_KEY || '').trim();
    if (apiKey) headers['X-API-Key'] = apiKey;

    const timeoutRaw = Number(
      process.env.SCF_PAINTER_TIMEOUT_MS || 600000,
    );
    const timeoutMs =
      Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 600000;

    this.logger.log(
      `🚀 调用 SCF Painter... shots=${args.shots.length}, taskId=${args.taskId}`,
    );

    const response = await axios.post(
      scfUrl,
      {
        taskId: args.taskId,
        shots: args.shots,
        config: this.buildScfConfig(args.config),
      },
      {
        headers,
        timeout: timeoutMs,
        validateStatus: () => true,
      },
    );

    const status = response.status;
    const data = response.data;
    if (status < 200 || status >= 300) {
      const errText =
        typeof data === 'string' ? data : JSON.stringify(data ?? {});
      throw new Error(`SCF HTTP ${status}: ${errText.slice(0, 1000)}`);
    }

    if (!data || data.success !== true) {
      const errMessage = data?.error ? String(data.error) : '未知错误';
      throw new Error(`SCF云函数失败: ${errMessage}`);
    }

    const results = Array.isArray(data.results) ? data.results : [];
    this.logger.log(`✅ SCF 云函数完成: ${results.length} 张`);
    return results;
  }

  private getPainterKeyPool(config?: ModelConfig): string[] {
    const pool = Array.isArray(config?.painterKeys) ? config?.painterKeys : [];
    const single = (config?.painterKey || (config as any)?.apiKey || '').trim();
    const keys = pool.length > 0 ? pool : single ? [single] : [];
    return Array.from(
      new Set(keys.map((k) => String(k).trim()).filter(Boolean)),
    );
  }

  private pickKeyPair(keys: string[]): string[] {
    if (!keys.length) return [];
    const idx = this.keyRr % keys.length;
    this.keyRr = (this.keyRr + 1) % keys.length;
    const primary = keys[idx];
    const secondary =
      keys.length > 1 ? keys[(idx + 1) % keys.length] : undefined;
    return secondary && secondary !== primary
      ? [primary, secondary]
      : [primary];
  }

  private isRetryablePainterFailure(err: unknown) {
    const message = (
      err instanceof Error ? err.message : String(err)
    ).toLowerCase();
    return (
      message.includes('no image data found in api response') ||
      message.includes('stream ended without image data') ||
      message.includes('stream ended with no data') ||
      message.includes('connect etimedout') ||
      message.includes('etimedout') ||
      message.includes('econnreset') ||
      message.includes('socket hang up') ||
      message.includes('eai_again') ||
      message.includes('http 429') ||
      message.includes('painter http 5') ||
      message.includes('timeout') ||
      message.includes('aborted') ||
      message.includes('canceled')
    );
  }

  private sanitizeModelShootLogText(input: string): string {
    const trimmed = (input || '').trim();
    if (!trimmed) return '';

    // 保护：历史上错误把 thoughtSignature/base64 写进“手账”，这里直接丢弃
    const looksLikeBase64 =
      trimmed.length >= 200 &&
      !/[\s]/.test(trimmed) &&
      /^[A-Za-z0-9+/=]+$/.test(trimmed);
    if (looksLikeBase64) return '';

    // 防止过长导致前端/日志卡死
    return trimmed.length > 12000 ? `${trimmed.slice(0, 12000)}…` : trimmed;
  }

  private sanitizeShootLogForDump(input: string): string {
    // For disk dumps we can keep longer content than UI, but still cap to avoid runaway memory/disk.
    const trimmed = (input || '').trim();
    if (!trimmed) return '';
    return trimmed.length > 80000 ? `${trimmed.slice(0, 80000)}…` : trimmed;
  }

  private getFileDataFromPart(
    part: any,
  ): { fileUri: string; mimeType?: string } | null {
    const fd = part?.fileData || part?.file_data || part?.filedata;
    if (!fd) return null;
    const fileUri = String(fd?.fileUri || fd?.file_uri || fd?.uri || '').trim();
    const mimeType =
      String(fd?.mimeType || fd?.mime_type || '').trim() || undefined;
    if (!fileUri) return null;
    return { fileUri, mimeType };
  }

  private async downloadImageFromUrl(
    url: string,
  ): Promise<{ buffer: Buffer; mimeType?: string }> {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to download image: HTTP ${response.status}`);
    }
    const mimeType =
      String(response.headers?.['content-type'] || '')
        .split(';')[0]
        .trim() || undefined;
    const buffer = Buffer.from(response.data as ArrayBuffer);
    return { buffer, mimeType };
  }

  private async callPainterGenerateContentWithRetries(args: {
    buildEndpoint: (key: string) => string;
    keysToTry: string[];
    payload: any;
    promptLen: number;
    context?: { taskId?: string; stage?: string };
  }): Promise<{
    imagePath: string;
    shootLogText: string;
    shootLogTextRaw?: string;
  }> {
    const { buildEndpoint, keysToTry, payload, promptLen, context } = args;

    const maxAttempts = keysToTry.length; // 自动重试 1 次（切换下一把 key）
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const endpoint = buildEndpoint(keysToTry[attempt - 1]);
        if (attempt > 1) {
          this.logger.warn(
            `🔁 Painter retry with next key (attempt ${attempt}/${maxAttempts})`,
          );
        }
        this.logger.log(`Calling Painter... Prompt len: ${promptLen}`);
        const timeoutMs = Number(process.env.PAINTER_TIMEOUT_MS || 1200000); // 默认 20 分钟，Grid/多参考图更容易超时

        // 一些中转网关会返回 SSE/流式响应（不主动结束连接），如果按 JSON 等待会表现为“卡住”。
        // 这里统一用 stream 读取：遇到包含图片的事件就立即落盘并终止请求。
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await axios.post(endpoint, payload, {
            headers: {
              'Content-Type': 'application/json',
            },
            responseType: 'stream',
            signal: controller.signal as any,
            // 不依赖 axios 的 timeout（stream 下容易“等到天荒地老”），用上面的 AbortController 控制
            timeout: timeoutMs + 1000,
            validateStatus: () => true,
          });

          const status = response.status;
          const contentType = String(
            response.headers?.['content-type'] || '',
          ).toLowerCase();

          if (status < 200 || status >= 300) {
            // 尝试从流里读一点错误信息（避免全量 base64 打爆日志）
            const errText = await this.readStreamAsText(
              response.data as Readable,
              64 * 1024,
            );
            throw new Error(
              `Painter HTTP ${status}: ${errText.slice(0, 1000)}`,
            );
          }

          let shootLogText = '';

          const handleOnePayload = async (data: any) => {
            if (data?.promptFeedback?.blockReason) {
              throw new Error(
                `Prompt blocked: ${data.promptFeedback.blockReason}`,
              );
            }

            const candidate = data?.candidates?.[0];
            if (!candidate) return null;

            // “手账”应来自模型返回的 TEXT，而不是 thoughtSignature（通常是不可读的签名/二进制）。
            // 这里把所有 text parts 拼接起来，作为 shootLogText（用于前端展示/调试）。
            for (const part of candidate.content?.parts || []) {
              const t = typeof part?.text === 'string' ? part.text.trim() : '';
              if (!t) continue;
              shootLogText = shootLogText ? `${shootLogText}\n${t}` : t;
              if (shootLogText.length > 80000) {
                shootLogText = shootLogText.slice(0, 80000);
                break;
              }
            }

            for (const part of candidate.content?.parts || []) {
              const imageData = part.inline_data || part.inlineData;
              if (!imageData) continue;

              const base64Data = imageData.data;
              const mimeType =
                imageData.mime_type || imageData.mimeType || 'image/png';
              return { kind: 'inline' as const, base64Data, mimeType };
            }

            // 兼容：部分网关会把输出图片放在 fileData.fileUri（而不是 inline_data）
            for (const part of candidate.content?.parts || []) {
              const fd = this.getFileDataFromPart(part);
              if (!fd) continue;
              const mimeType =
                fd.mimeType || this.guessMimeTypeFromPathOrHeader(fd.fileUri);
              if (mimeType.startsWith('image/')) {
                return { kind: 'url' as const, url: fd.fileUri, mimeType };
              }
            }

            return null;
          };

          const isEventStream = contentType.includes('text/event-stream');
          const isNdjson =
            contentType.includes('application/x-ndjson') ||
            contentType.includes('application/ndjson');

          if (isEventStream || isNdjson) {
            const result = await this.readGeminiStreamForImage(
              response.data as Readable,
              async (obj) => {
                const found = await handleOnePayload(obj);
                return found;
              },
            );
            const buffer =
              result.kind === 'inline'
                ? Buffer.from(result.base64Data, 'base64')
                : (await this.downloadImageFromUrl(result.url)).buffer;
            const ext = String(result.mimeType).includes('png') ? 'png' : 'jpg';

            const filename = `${Date.now()}_${randomUUID()}.${ext}`;
            const savePath = `./uploads/painter/${filename}`;
            await fs.writeFile(savePath, buffer);

            this.logger.log(
              `✅ Found image data, mime: ${result.mimeType}, size: ${(buffer.length / 1024).toFixed(1)}KB`,
            );
            this.logger.log(`💾 Image saved to ${savePath}`);
            const raw = this.sanitizeShootLogForDump(shootLogText);
            return {
              imagePath: savePath,
              shootLogText: this.sanitizeModelShootLogText(shootLogText),
              shootLogTextRaw: raw,
            };
          }

          // 兜底：按 JSON 全量读取（普通 generateContent）
          const rawText = await this.readStreamAsText(
            response.data as Readable,
            40 * 1024 * 1024,
          );
          const data = JSON.parse(rawText);

          const summary = {
            hasCandidates: !!data.candidates,
            candidatesCount: data.candidates?.length || 0,
            blockReason: data.promptFeedback?.blockReason,
          };
          this.logger.debug(
            `📨 API Response Received: ${JSON.stringify(summary)}`,
          );

          const found = await handleOnePayload(data);
          if (!found) {
            const candidate = data?.candidates?.[0];
            const finishReason = String(
              candidate?.finishReason || candidate?.finish_reason || '',
            ).trim();
            const partKinds = (candidate?.content?.parts || []).map(
              (p: any) => {
                if (p?.inline_data || p?.inlineData) return 'inline';
                if (this.getFileDataFromPart(p)) return 'fileData';
                if (typeof p?.text === 'string') return 'text';
                return 'other';
              },
            );
            const preview = shootLogText ? shootLogText.slice(0, 400) : '';
            this.logger.error(
              `❌ No image in response parts (finishReason=${finishReason || 'UNKNOWN'}, parts=${JSON.stringify(partKinds)})`,
            );
            const err: any = new Error(
              `No image data found in API response. finishReason=${finishReason || 'UNKNOWN'} ModelTextPreview=${preview || 'EMPTY'}`,
            );
            err.finishReason = finishReason || undefined;
            err.shootLogText = shootLogText;
            err.partKinds = partKinds;
            throw err;
          }

          const buffer =
            found.kind === 'inline'
              ? Buffer.from(found.base64Data, 'base64')
              : (await this.downloadImageFromUrl(found.url)).buffer;
          const ext = String(found.mimeType).includes('png') ? 'png' : 'jpg';

          const filename = `${Date.now()}_${randomUUID()}.${ext}`;
          const savePath = `./uploads/painter/${filename}`;
          await fs.writeFile(savePath, buffer);

          this.logger.log(
            `✅ Found image data, mime: ${found.mimeType}, size: ${(buffer.length / 1024).toFixed(1)}KB`,
          );
          this.logger.log(`💾 Image saved to ${savePath}`);
          const raw = this.sanitizeShootLogForDump(shootLogText);
          return {
            imagePath: savePath,
            shootLogText: this.sanitizeModelShootLogText(shootLogText),
            shootLogTextRaw: raw,
          };
        } finally {
          clearTimeout(timer);
          try {
            controller.abort();
          } catch {
            /* ignore */
          }
        }
      } catch (error) {
        const err = error;
        // SAFE ERROR LOGGING
        const errorData = err?.response?.data;
        let safeError: any = err?.message || 'Unknown error';

        if (
          errorData &&
          typeof errorData === 'object' &&
          typeof errorData.on === 'function'
        ) {
          try {
            safeError = await this.readStreamAsText(
              errorData as Readable,
              32 * 1024,
            );
          } catch {
            // ignore
          }
        } else if (errorData && typeof errorData === 'object') {
          safeError = {
            code: errorData.error?.code,
            message: errorData.error?.message,
            status: errorData.error?.status,
          };
        }

        this.logger.error('Painter API error (Sanitized):', safeError);
        const wrapped = new Error(
          `Image generation failed: ${err?.message || String(err)}`,
        );
        lastError = wrapped;

        const shouldRetry =
          attempt < maxAttempts && this.isRetryablePainterFailure(wrapped);
        if (shouldRetry) {
          this.logger.warn(
            `Painter failed (attempt ${attempt}/${maxAttempts}), retrying once...`,
          );
          await this.sleep(800);
          continue;
        }

        throw wrapped;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(String(lastError || 'Image generation failed'));
  }

  private isNoImageResponseError(err: unknown): boolean {
    const msg = (
      err instanceof Error ? err.message : String(err || '')
    ).toLowerCase();
    return msg.includes('no image data found in api response');
  }

  private applyTencentCiCompressionIfPossible(originalUrl: string) {
    if (!originalUrl.startsWith('http')) {
      return { url: originalUrl, applied: false };
    }

    if (originalUrl.includes('imageMogr2/')) {
      return { url: originalUrl, applied: false };
    }

    const ciEnabled =
      String(process.env.PAINTER_CI_ENABLED || 'true')
        .trim()
        .toLowerCase() !== 'false';
    if (!ciEnabled) {
      return { url: originalUrl, applied: false };
    }

    try {
      const url = new URL(originalUrl);
      const host = url.hostname.toLowerCase();
      const isTencentCos =
        host.includes('.cos.') && host.endsWith('.myqcloud.com');

      if (!isTencentCos) {
        return { url: originalUrl, applied: false };
      }

      const hasSignedParams = Array.from(url.searchParams.keys()).some(
        (key) => {
          const lowerKey = key.toLowerCase();
          return (
            lowerKey.startsWith('q-sign-') ||
            lowerKey.startsWith('x-cos-') ||
            lowerKey.includes('signature')
          );
        },
      );

      if (hasSignedParams) {
        return { url: originalUrl, applied: false };
      }

      const maxWidth = Number(process.env.PAINTER_CI_MAX_WIDTH || 2048);
      const quality = Number(process.env.PAINTER_CI_QUALITY || 85);
      if (
        !Number.isFinite(maxWidth) ||
        maxWidth <= 0 ||
        !Number.isFinite(quality) ||
        quality <= 0
      ) {
        return { url: originalUrl, applied: false };
      }

      // ✅ Painter需要高质量参考图，但可通过环境变量下调尺寸/质量控制 CI 下行成本
      const ciOps = `imageMogr2/thumbnail/${Math.floor(maxWidth)}x/quality/${Math.floor(quality)}`;
      const joiner = url.search.length > 0 ? '&' : '?';

      return { url: `${originalUrl}${joiner}${ciOps}`, applied: true };
    } catch {
      return { url: originalUrl, applied: false };
    }
  }

  private guessMimeTypeFromPathOrHeader(
    pathOrUrl: string,
    contentType?: string,
  ) {
    const fromHeader = contentType?.split(';')?.[0]?.trim();
    if (fromHeader?.startsWith('image/')) {
      return fromHeader;
    }

    const lower = (() => {
      try {
        return new URL(pathOrUrl).pathname.toLowerCase();
      } catch {
        return pathOrUrl.toLowerCase().split('?')[0].split('#')[0];
      }
    })();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    return 'image/jpeg';
  }

  /**
   * 重要约束（业务决定）：
   * - 发送给模型的图片一律使用 URL（COS 链接优先），禁止服务器转 base64（inline_data）上传。
   */
  private async encodeImageForPainter(
    inputPathOrUrl: string,
    options: { allowCi: boolean },
  ): Promise<{ url: string; mimeType: string }> {
    const input = (inputPathOrUrl ?? '').trim();
    if (!input) {
      throw new Error('图片路径为空');
    }

    // URL：直接走 fileData（不下载、不转 base64）
    if (input.startsWith('http://') || input.startsWith('https://')) {
      const finalUrl = options.allowCi
        ? this.applyTencentCiCompressionIfPossible(input).url
        : input;
      return {
        url: finalUrl,
        mimeType: this.guessMimeTypeFromPathOrHeader(finalUrl),
      };
    }

    // 本地路径：必须先转存 COS，然后用 COS URL（fileData）
    if (!(await fs.pathExists(input))) {
      throw new Error(`图片文件不存在: ${input}`);
    }
    if (!this.cosService.isEnabled()) {
      throw new Error(
        'COS未配置：禁止服务器把图片转Base64发给模型；请启用COS或改为前端直传COS URL',
      );
    }

    const ext = path.extname(input) || '.jpg';
    const key = `uploads/server/painter-refs/${Date.now()}_${randomUUID()}${ext}`;
    await this.cosService.uploadFile(key, input);

    const url = this.cosService.getImageUrl(key);
    const finalUrl = options.allowCi
      ? this.applyTencentCiCompressionIfPossible(url).url
      : url;
    return {
      url: finalUrl,
      mimeType: this.guessMimeTypeFromPathOrHeader(finalUrl),
    };
  }

  async generateImage(
    prompt: string,
    refImagePaths: string[] = [],
    options: PainterOptions = {},
    config?: ModelConfig,
  ): Promise<string> {
    const result = await this.generateImageWithLog(
      prompt,
      refImagePaths,
      options,
      config,
    );
    return result.imagePath;
  }

  async generateImageWithLog(
    prompt: string,
    refImagePaths: string[] = [],
    options: PainterOptions = {},
    config?: ModelConfig,
    context?: { taskId?: string; stage?: string }, // Add context param to match usage
  ): Promise<{ imagePath: string; shootLogText: string }> {
    // MOCK MODE
    if (process.env.MOCK_PAINTER === 'true') {
      this.logger.warn('USING MOCK PAINTER RESPONSE');
      await new Promise((r) => setTimeout(r, 1000));
      return {
        imagePath: 'src/assets/mock_render.png',
        shootLogText: 'Mock thinking process...',
      };
    }

    const gateway =
      config?.painterGateway ||
      config?.gatewayUrl ||
      'https://api.vectorengine.ai/v1';
    const model = config?.painterModel;
    const keyPool = this.getPainterKeyPool(config);
    const keysToTry = this.pickKeyPair(keyPool);

    this.logger.log(
      `🎨 Painter Config - Gateway: ${gateway?.substring(0, 30)}..., Model: ${model || 'UNDEFINED'}, KeyPool: ${keyPool.length}`,
    );

    if (!model) {
      throw new Error('Painter模型未配置，请在设置页面配置Painter模型');
    }
    if (keysToTry.length === 0) {
      throw new Error('Painter密钥未配置，请在设置页面配置Painter Key');
    }

    // Normalize gateway URL and ensure it has /v1 or /v1beta
    let normalizedGateway = gateway.replace(/\/+$/, ''); // Remove trailing slashes
    if (!normalizedGateway.match(/\/v1(beta)?$/)) {
      // If gateway doesn't end with /v1 or /v1beta, add /v1
      normalizedGateway = `${normalizedGateway}/v1`;
    }

    const buildEndpoint = (key: string) =>
      `${normalizedGateway}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

    this.logger.log(`🔗 Final Endpoint: ${buildEndpoint('***')}`);
    this.logger.log(`Prompt: ${prompt.substring(0, 100)}...`);
    this.logger.log(`📷 Reference images: ${refImagePaths.length} files`);
    if (context) {
      this.logger.log(
        `ℹ️ Context: Task=${context.taskId}, Stage=${context.stage}`,
      );
    }

    // Read reference images if provided
    // 强制要求只输出图片（与 responseModalities=['IMAGE'] 配合，降低“只回文字”的概率）
    const parts: any[] = [
      {
        text: `${prompt}\n\n[Hard Output Requirement]\nReturn IMAGE only. Do not return text.`,
      },
    ];

    const isInpaint = String(options.editMode || '')
      .toUpperCase()
      .includes('INPAINT');

    for (let i = 0; i < refImagePaths.length; i += 1) {
      const imgPathOrUrl = refImagePaths[i];
      try {
        // Inpaint: base + mask must keep exact pixel mapping, 禁止做 CI 缩放/压缩
        const allowCi = !(isInpaint && i < 2);
        const encoded = await this.encodeImageForPainter(imgPathOrUrl, {
          allowCi,
        });

        parts.push({
          fileData: {
            fileUri: encoded.url,
            mimeType: encoded.mimeType,
          },
        });

        this.logger.log(
          `🌐 Reference image (fileData): ${encoded.url.substring(0, 80)}...${allowCi ? '' : ' [NO_CI]'}`,
        );
      } catch (e: any) {
        this.logger.warn(
          `⚠️ Failed to encode reference image: ${String(imgPathOrUrl).slice(0, 120)}`,
          e?.message || e,
        );
      }
    }

    // Google Native API format for image generation
    const generationConfig: any = {
      // 目标：强制只要图片，避免模型/网关在可输出 TEXT 时“只回文字”导致无图失败
      responseModalities:
        Array.isArray(options.responseModalities) &&
        options.responseModalities.length > 0
          ? options.responseModalities
          : ['IMAGE'],
      candidateCount: 1,
    };

    if (options.thinkingConfig) {
      generationConfig.thinkingConfig = options.thinkingConfig;
    }
    if (Number.isFinite(options.seed)) {
      generationConfig.seed = Math.trunc(options.seed);
    }
    if (Number.isFinite(options.temperature)) {
      generationConfig.temperature = options.temperature;
    }

    if (options.thinkingConfig) {
      generationConfig.thinkingConfig = options.thinkingConfig;
    }

    if (Number.isFinite(options.seed)) {
      generationConfig.seed = Math.trunc(options.seed);
    }
    if (Number.isFinite(options.temperature)) {
      generationConfig.temperature = options.temperature;
    }

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
        '4K': '4K',
      };
      const mappedSize = sizeMap[options.imageSize] || '2K';
      imageConfig.imageSize = mappedSize;
      this.logger.log(
        `📐 Image Gen Config - Size: ${mappedSize} (Raw: ${options.imageSize}), Aspect: ${options.aspectRatio || 'DEFAULT'}`,
      );
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
      generationConfig: generationConfig,
    };

    // Log the config (NOT the full payload with Base64!)
    this.logger.log(
      `📤 Generation Config: ${JSON.stringify(generationConfig)}`,
    );

    try {
      return await this.callPainterGenerateContentWithRetries({
        buildEndpoint,
        keysToTry,
        payload,
        promptLen: prompt.length,
        context,
      });
    } catch (e: any) {
      // 兜底：模型只回了 TEXT（finishReason=STOP/parts=["text"]），再尝试一次“只要图片”
      const alreadyImageOnly =
        Array.isArray(options.responseModalities) &&
        options.responseModalities.length === 1 &&
        options.responseModalities[0] === 'IMAGE';
      if (!alreadyImageOnly && this.isNoImageResponseError(e)) {
        const shootLogText =
          typeof e?.shootLogText === 'string' ? e.shootLogText : '';
        const payload2 = JSON.parse(JSON.stringify(payload));
        payload2.generationConfig = {
          ...(payload2.generationConfig || {}),
          responseModalities: ['IMAGE'],
        };
        // 兜底重试：禁用 thinking，降低“只回文字”的概率
        if (payload2?.generationConfig?.thinkingConfig) {
          delete payload2.generationConfig.thinkingConfig;
        }
        // 强提示：避免继续只回文字
        if (Array.isArray(payload2?.contents) && payload2.contents.length > 0) {
          const last = payload2.contents[payload2.contents.length - 1];
          if (
            last?.role === 'user' &&
            Array.isArray(last.parts) &&
            last.parts.length > 0 &&
            typeof last.parts[0]?.text === 'string'
          ) {
            last.parts[0].text = `${last.parts[0].text}\n\n[Hard Output Requirement]\nReturn IMAGE only. Do not return text.`;
          }
        }
        const r2 = await this.callPainterGenerateContentWithRetries({
          buildEndpoint,
          keysToTry,
          payload: payload2,
          promptLen: prompt.length,
          context,
        });
        return {
          imagePath: r2.imagePath,
          shootLogText: shootLogText || r2.shootLogText,
        };
      }
      throw e;
    }
  }

  /**
   * 会话模式：使用 systemInstruction + 多轮 contents[]（user/model 文本历史）
   * 说明：图片输入仍然严格使用 fileData(URL)，不走 inline_data。
   */
  async generateImageWithChatSessionWithLog(args: {
    systemInstruction: string;
    history: PainterChatMessage[];
    userText: string;
    images?: PainterChatImage[];
    options?: PainterOptions;
    config?: ModelConfig;
    context?: { taskId?: string; stage?: string };
  }): Promise<{ imagePath: string; shootLogText: string }> {
    const systemInstruction = String(args.systemInstruction || '').trim();
    if (!systemInstruction) {
      throw new Error('systemInstruction 不能为空');
    }

    const userText = String(args.userText || '').trim();
    if (!userText) {
      throw new Error('userText 不能为空');
    }

    const gateway =
      args.config?.painterGateway ||
      args.config?.gatewayUrl ||
      'https://api.vectorengine.ai/v1';
    const model = args.config?.painterModel;
    const keyPool = this.getPainterKeyPool(args.config);
    const keysToTry = this.pickKeyPair(keyPool);

    this.logger.log(
      `🎨 Painter Config - Gateway: ${gateway?.substring(0, 30)}..., Model: ${model || 'UNDEFINED'}, KeyPool: ${keyPool.length}`,
    );

    if (!model) {
      throw new Error('Painter模型未配置，请在设置页面配置Painter模型');
    }
    if (keysToTry.length === 0) {
      throw new Error('Painter密钥未配置，请在设置页面配置Painter Key');
    }

    let normalizedGateway = gateway.replace(/\/+$/, '');
    if (!normalizedGateway.match(/\/v1(beta)?$/)) {
      normalizedGateway = `${normalizedGateway}/v1`;
    }

    const buildEndpoint = (key: string) =>
      `${normalizedGateway}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

    const options = args.options || {};
    const images = Array.isArray(args.images) ? args.images : [];
    const history = Array.isArray(args.history) ? args.history : [];

    const isInpaint = String(options.editMode || '')
      .toUpperCase()
      .includes('INPAINT');

    const contents: any[] = [];
    for (const m of history) {
      const role = m?.role === 'model' ? 'model' : 'user';
      const text = String(m?.text || '').trim();
      if (!text) continue;
      contents.push({ role, parts: [{ text }] });
    }

    // 强制要求只输出图片（与 responseModalities=['IMAGE'] 配合，降低“只回文字”的概率）
    const parts: any[] = [
      {
        text: `${userText}\n\n[Hard Output Requirement]\nReturn IMAGE only. Do not return text.`,
      },
    ];
    const sentImages: Array<{
      label: string;
      fileUri: string;
      mimeType?: string;
      allowCi?: boolean;
    }> = [];
    for (let i = 0; i < images.length; i += 1) {
      const img = images[i];
      const label = String(img?.label || `IMAGE_${i + 1}`).trim();
      const pathOrUrl = String(img?.pathOrUrl || '').trim();
      if (!pathOrUrl) continue;

      const allowCi =
        typeof img?.allowCi === 'boolean' ? img.allowCi : !(isInpaint && i < 2);
      const encoded = await this.encodeImageForPainter(pathOrUrl, { allowCi });

      parts.push({ text: `[Image] ${label}` });
      parts.push({
        fileData: {
          fileUri: encoded.url,
          mimeType: encoded.mimeType,
        },
      });
      sentImages.push({
        label,
        fileUri: encoded.url,
        mimeType: encoded.mimeType,
        allowCi,
      });
    }

    const generationConfig: any = {
      // 目标：强制只要图片，避免模型/网关在可输出 TEXT 时“只回文字”导致无图失败
      responseModalities:
        Array.isArray(options.responseModalities) &&
        options.responseModalities.length > 0
          ? options.responseModalities
          : ['IMAGE'],
      candidateCount: 1,
    };

    const imageConfig: any = {};
    if (options.aspectRatio) {
      imageConfig.aspectRatio = options.aspectRatio;
    }
    if (options.imageSize) {
      const sizeMap: Record<string, string> = {
        '1024x1024': '1K',
        '2048x2048': '2K',
        '4096x4096': '4K',
        '1K': '1K',
        '2K': '2K',
        '4K': '4K',
      };
      const mappedSize = sizeMap[options.imageSize] || '2K';
      imageConfig.imageSize = mappedSize;
      this.logger.log(
        `📐 Image Gen Config - Size: ${mappedSize} (Raw: ${options.imageSize}), Aspect: ${options.aspectRatio || 'DEFAULT'}`,
      );
    }
    if (Object.keys(imageConfig).length > 0) {
      generationConfig.imageConfig = imageConfig;
    }
    if (options.editMode) {
      generationConfig.editMode = options.editMode;
      this.logger.log(`✏️ Edit mode set to: ${options.editMode}`);
    }

    const payload = {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [...contents, { role: 'user', parts }],
      generationConfig,
    };

    // 打印“发送给 API 的完整提示词”（不包含图片 base64，仅包含文本 + 图片标签）
    // 注意：systemInstruction + history + user part 合起来才是最终 prompt 上下文。
    try {
      const ctxTaskId = String(args.context?.taskId || '').trim();
      const ctxStage = String(args.context?.stage || '').trim();
      const header = `🧾 Painter Prompt (taskId=${ctxTaskId || '-'},stage=${ctxStage || '-'})`;

      const lines: string[] = [];
      lines.push('[SYSTEM]');
      lines.push(systemInstruction);
      lines.push('');
      lines.push('[HISTORY]');
      if (history.length === 0) {
        lines.push('(empty)');
      } else {
        for (const m of history) {
          const role = m?.role === 'model' ? 'model' : 'user';
          const text = String(m?.text || '').trim();
          if (!text) continue;
          lines.push(`${role}: ${text}`);
        }
      }
      lines.push('');
      lines.push('[USER]');
      lines.push(String(parts?.[0]?.text || '').trim());
      lines.push('');
      lines.push('[IMAGES]');
      if (sentImages.length === 0) {
        lines.push('(none)');
      } else {
        for (const img of sentImages) {
          lines.push(
            `- ${img.label}: ${img.fileUri}${img.mimeType ? ` (${img.mimeType})` : ''}${img.allowCi === false ? ' [NO_CI]' : ''}`,
          );
        }
      }
      lines.push('');
      lines.push('[GENERATION_CONFIG]');
      lines.push(JSON.stringify(generationConfig));

      const refId = ctxTaskId || undefined;
      const stage = ctxStage || 'painter_generate';
      const dumped = await dumpPromptText({
        kind: 'PAINTER',
        stage: `${stage}_request`,
        refId,
        content: lines.join('\n'),
      });

      // 你要求“在日志里完整打印”：通过分片（<4000）绕过 admin-log 截断。
      logLargeText({
        log: (m) => this.logger.log(m),
        header: `${header} saved=${dumped.filePath.replace(/\\\\/g, '/')} sha256=${dumped.sha256.slice(0, 12)}`,
        text: lines.join('\n'),
        chunkSize: 3200,
        maxLen: 120_000,
      });
    } catch {
      // ignore logging failures
    }

    this.logger.log(
      `📤 Generation Config: ${JSON.stringify(generationConfig)}`,
    );

    try {
      const result = await this.callPainterGenerateContentWithRetries({
        buildEndpoint,
        keysToTry,
        payload,
        promptLen: userText.length,
        context: args.context,
      });

      // 保存“收到的文字”（shootLogText）到文件，便于完整复盘
      try {
        const ctxTaskId = String(args.context?.taskId || '').trim();
        const ctxStage = String(args.context?.stage || '').trim();
        const refId = ctxTaskId || undefined;
        const stage = ctxStage || 'painter_generate';
        const dumped = await dumpPromptText({
          kind: 'PAINTER',
          stage: `${stage}_response_text`,
          refId,
          content: String(
            (result as any).shootLogTextRaw || result.shootLogText || '',
          ),
        });

        const header = `🧾 Painter Response TEXT (taskId=${ctxTaskId || '-'},stage=${ctxStage || '-'})`;
        logLargeText({
          log: (m) => this.logger.log(m),
          header: `${header} saved=${dumped.filePath.replace(/\\\\/g, '/')} sha256=${dumped.sha256.slice(0, 12)}`,
          text: String(
            (result as any).shootLogTextRaw || result.shootLogText || '',
          ),
          chunkSize: 3200,
          maxLen: 120_000,
        });
      } catch {
        // ignore
      }

      return result;
    } catch (e: any) {
      // 兜底：模型只回了 TEXT（finishReason=STOP/parts=["text"]），再尝试一次“只要图片”
      const alreadyImageOnly =
        Array.isArray(options.responseModalities) &&
        options.responseModalities.length === 1 &&
        options.responseModalities[0] === 'IMAGE';
      if (!alreadyImageOnly && this.isNoImageResponseError(e)) {
        const shootLogText =
          typeof e?.shootLogText === 'string' ? e.shootLogText : '';
        const payload2 = JSON.parse(JSON.stringify(payload));
        payload2.generationConfig = {
          ...(payload2.generationConfig || {}),
          responseModalities: ['IMAGE'],
        };
        // 兜底重试：禁用 thinking，降低“只回文字”的概率
        if (payload2?.generationConfig?.thinkingConfig) {
          delete payload2.generationConfig.thinkingConfig;
        }
        if (Array.isArray(payload2?.contents) && payload2.contents.length > 0) {
          const last = payload2.contents[payload2.contents.length - 1];
          if (
            last?.role === 'user' &&
            Array.isArray(last.parts) &&
            last.parts.length > 0 &&
            typeof last.parts[0]?.text === 'string'
          ) {
            last.parts[0].text = `${last.parts[0].text}\n\n[Hard Output Requirement]\nReturn IMAGE only. Do not return text.`;
          }
        }
        const r2 = await this.callPainterGenerateContentWithRetries({
          buildEndpoint,
          keysToTry,
          payload: payload2,
          promptLen: userText.length,
          context: args.context,
        });
        return {
          imagePath: r2.imagePath,
          shootLogText: shootLogText || r2.shootLogText,
        };
      }
      throw e;
    }
  }

  async generateImageWithChatSession(
    systemInstruction: string,
    history: PainterChatMessage[],
    userText: string,
    images: PainterChatImage[] = [],
    options: PainterOptions = {},
    config?: ModelConfig,
    context?: { taskId?: string; stage?: string },
  ): Promise<string> {
    const result = await this.generateImageWithChatSessionWithLog({
      systemInstruction,
      history,
      userText,
      images,
      options,
      config,
      context,
    });
    return result.imagePath;
  }

  private async readStreamAsText(stream: Readable, maxBytes: number) {
    return new Promise<string>((resolve, reject) => {
      let total = 0;
      const chunks: Buffer[] = [];

      stream.on('data', (chunk: Buffer | string) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buf.length;
        if (total > maxBytes) {
          stream.destroy();
          reject(new Error(`Response too large (> ${maxBytes} bytes)`));
          return;
        }
        chunks.push(buf);
      });

      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      stream.on('error', (e) => reject(e));
    });
  }

  private async readGeminiStreamForImage(
    stream: Readable,
    onJson: (
      obj: any,
    ) => Promise<
      | { kind: 'inline'; base64Data: string; mimeType: string }
      | { kind: 'url'; url: string; mimeType: string }
      | null
    >,
  ) {
    return new Promise<
      | { kind: 'inline'; base64Data: string; mimeType: string }
      | { kind: 'url'; url: string; mimeType: string }
    >((resolve, reject) => {
      stream.setEncoding('utf8');

      let buf = '';
      let seenAnyData = false;
      let resolved = false;
      let sseDataLines: string[] = [];
      let processing = Promise.resolve();

      const cleanup = () => {
        stream.removeAllListeners('data');
        stream.removeAllListeners('end');
        stream.removeAllListeners('error');
      };

      const enqueuePayload = (payload: string) => {
        const trimmed = payload.trim();
        if (!trimmed || trimmed === '[DONE]') return;
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return;

        processing = processing
          .then(async () => {
            if (resolved) return;
            try {
              const obj = JSON.parse(trimmed);
              const found = await onJson(obj);
              if (found && !resolved) {
                resolved = true;
                cleanup();
                try {
                  stream.destroy();
                } catch {
                  /* ignore */
                }
                resolve(found);
              }
            } catch {
              // ignore (often partial JSON or non-json keepalive)
            }
          })
          .catch(() => {
            // ignore parsing failures
          });
      };

      const flushSseEvent = () => {
        if (sseDataLines.length === 0) return;
        const payload = sseDataLines.join('\n');
        sseDataLines = [];
        enqueuePayload(payload);
      };

      const maxBytes = 64 * 1024 * 1024; // 64MB，避免上游异常导致内存爆炸

      stream.on('data', (chunk: string) => {
        if (resolved) return;
        seenAnyData = true;
        buf += chunk;

        if (Buffer.byteLength(buf, 'utf8') > maxBytes) {
          cleanup();
          try {
            stream.destroy();
          } catch {
            /* ignore */
          }
          reject(new Error(`Stream buffer too large (> ${maxBytes} bytes)`));
          return;
        }

        // SSE: 事件分隔通常是空行；NDJSON: 按单行
        // 这里统一按行扫描，兼容 data: {json} 的 SSE。
        let idx = buf.indexOf('\n');
        while (idx >= 0 && !resolved) {
          const line = buf.slice(0, idx).replace(/\r$/, '');
          buf = buf.slice(idx + 1);

          const trimmed = line.trim();
          if (!trimmed) {
            // SSE 事件结束（空行）
            flushSseEvent();
          } else if (trimmed.startsWith('data:')) {
            // SSE 数据行（允许多行 data: 拼接成一个 JSON）
            sseDataLines.push(trimmed.slice('data:'.length).trimStart());
          } else if (/^(event|id|retry)\s*:/.test(trimmed)) {
            // ignore SSE meta fields
          } else if (sseDataLines.length > 0) {
            // 容错：有些实现会把数据行不带 data: 前缀
            sseDataLines.push(trimmed);
          } else {
            // NDJSON / 单行 JSON
            enqueuePayload(trimmed);
          }
          idx = buf.indexOf('\n');
        }
      });

      stream.on('end', () => {
        if (resolved) return;
        flushSseEvent();
        const tail = buf.trim();
        if (tail) {
          enqueuePayload(tail);
        }

        processing
          .then(() => {
            if (resolved) return;
            if (!seenAnyData) {
              reject(new Error('Stream ended with no data'));
              return;
            }
            reject(new Error('Stream ended without image data'));
          })
          .catch((e) => reject(e));
      });

      stream.on('error', (e) => {
        if (resolved) return;
        reject(e);
      });
    });
  }
}
