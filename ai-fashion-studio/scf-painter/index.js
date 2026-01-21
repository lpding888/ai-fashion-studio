/**
 * SCF Painter云函数（批处理串行）
 * 功能：调用Painter API生成图片（单任务多张串行）
 *
 * 流程：
 * 1) 从COS下载参考图（可选CI压缩）
 * 2) 转Base64（inline_data）
 * 3) 调用Painter API（Gemini原生格式）
 * 4) 保存生成图到COS
 * 5) 返回每张图片URL与日志
 */

const axios = require('axios');
const COS = require('cos-nodejs-sdk-v5');

function isHttpUrl(value) {
    return typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'));
}

function applyTencentCiCompressionIfPossible(originalUrl) {
    if (!isHttpUrl(originalUrl)) return { url: originalUrl, applied: false };
    if (originalUrl.includes('imageMogr2/')) return { url: originalUrl, applied: false };

    const ciEnabled = String(process.env.PAINTER_CI_ENABLED || 'true').trim().toLowerCase() !== 'false';
    if (!ciEnabled) return { url: originalUrl, applied: false };

    try {
        const url = new URL(originalUrl);
        const host = url.hostname.toLowerCase();
        const isTencentCos = host.includes('.cos.') && host.endsWith('.myqcloud.com');
        if (!isTencentCos) return { url: originalUrl, applied: false };

        const hasSignedParams = Array.from(url.searchParams.keys()).some((key) => {
            const lowerKey = key.toLowerCase();
            return lowerKey.startsWith('q-sign-') || lowerKey.startsWith('x-cos-') || lowerKey.includes('signature');
        });
        if (hasSignedParams) return { url: originalUrl, applied: false };

        const maxWidth = Number(process.env.PAINTER_CI_MAX_WIDTH || 2048);
        const quality = Number(process.env.PAINTER_CI_QUALITY || 85);
        if (!Number.isFinite(maxWidth) || maxWidth <= 0 || !Number.isFinite(quality) || quality <= 0) {
            return { url: originalUrl, applied: false };
        }

        const ciOps = `imageMogr2/thumbnail/${Math.floor(maxWidth)}x/quality/${Math.floor(quality)}`;
        const joiner = url.search.length > 0 ? '&' : '?';
        return { url: `${originalUrl}${joiner}${ciOps}`, applied: true };
    } catch {
        return { url: originalUrl, applied: false };
    }
}

function guessMimeTypeFromUrl(pathOrUrl, contentType) {
    if (contentType && String(contentType).startsWith('image/')) {
        return String(contentType).split(';')[0].trim();
    }
    const lower = (() => {
        try {
            return new URL(pathOrUrl).pathname.toLowerCase();
        } catch {
            return String(pathOrUrl || '').toLowerCase().split('?')[0].split('#')[0];
        }
    })();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    return 'image/jpeg';
}

function buildPainterEndpoint(apiUrl, apiKey, model) {
    const raw = String(apiUrl || '').trim();
    if (!raw) {
        throw new Error('缺少 Painter API URL 配置');
    }

    const trimmed = raw.replace(/\/+$/, '');

    if (trimmed.includes(':generateContent')) {
        if (trimmed.includes('key=')) return trimmed;
        const joiner = trimmed.includes('?') ? '&' : '?';
        return `${trimmed}${joiner}key=${encodeURIComponent(apiKey)}`;
    }

    const painterModel = model ? String(model).trim() : '';
    if (!painterModel) {
        throw new Error('缺少 Painter 模型配置（painterModel）');
    }

    let gateway = trimmed;
    if (!gateway.match(/\/v1(beta)?$/)) {
        gateway = `${gateway}/v1`;
    }

    return `${gateway}/models/${encodeURIComponent(painterModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

function getKeyPool(config) {
    const pool = Array.isArray(config?.painterKeys) ? config.painterKeys : [];
    const single = (config?.painterKey || config?.apiKey || '').trim();
    const envKey = String(process.env.PAINTER_API_KEY || '').trim();
    const keys = pool.length > 0 ? pool : (single ? [single] : envKey ? [envKey] : []);
    return Array.from(new Set(keys.map((k) => String(k).trim()).filter(Boolean)));
}

function isRetryablePainterFailure(err) {
    const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return (
        message.includes('no image data found') ||
        message.includes('stream ended without image data') ||
        message.includes('stream ended with no data') ||
        message.includes('connect etimedout') ||
        message.includes('socket hang up') ||
        message.includes('econnreset') ||
        message.includes('eai_again') ||
        message.includes('http 429') ||
        message.includes('http 5') ||
        message.includes('timeout') ||
        message.includes('aborted') ||
        message.includes('canceled')
    );
}

function getFileDataFromPart(part) {
    const fd = part?.fileData || part?.file_data || part?.filedata;
    if (!fd) return null;
    const fileUri = String(fd?.fileUri || fd?.file_uri || fd?.uri || '').trim();
    const mimeType = String(fd?.mimeType || fd?.mime_type || '').trim() || undefined;
    if (!fileUri) return null;
    return { fileUri, mimeType };
}

async function readStreamAsText(stream, maxBytes) {
    return new Promise((resolve, reject) => {
        let total = 0;
        const chunks = [];

        stream.on('data', (chunk) => {
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

async function readGeminiStreamForImage(stream, onJson) {
    return new Promise((resolve, reject) => {
        stream.setEncoding('utf8');

        let buf = '';
        let seenAnyData = false;
        let resolved = false;
        let sseDataLines = [];
        let processing = Promise.resolve();

        const cleanup = () => {
            stream.removeAllListeners('data');
            stream.removeAllListeners('end');
            stream.removeAllListeners('error');
        };

        const enqueuePayload = (payload) => {
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
                            try { stream.destroy(); } catch { /* ignore */ }
                            resolve(found);
                        }
                    } catch {
                        // ignore
                    }
                })
                .catch(() => {
                    // ignore
                });
        };

        const flushSseEvent = () => {
            if (sseDataLines.length === 0) return;
            const payload = sseDataLines.join('\n');
            sseDataLines = [];
            enqueuePayload(payload);
        };

        const maxBytes = 64 * 1024 * 1024;

        stream.on('data', (chunk) => {
            if (resolved) return;
            seenAnyData = true;
            buf += chunk;

            if (Buffer.byteLength(buf, 'utf8') > maxBytes) {
                cleanup();
                try { stream.destroy(); } catch { /* ignore */ }
                reject(new Error(`Stream buffer too large (> ${maxBytes} bytes)`));
                return;
            }

            let idx = buf.indexOf('\n');
            while (idx >= 0 && !resolved) {
                const line = buf.slice(0, idx).replace(/\r$/, '');
                buf = buf.slice(idx + 1);

                const trimmed = line.trim();
                if (!trimmed) {
                    flushSseEvent();
                } else if (trimmed.startsWith('data:')) {
                    sseDataLines.push(trimmed.slice('data:'.length).trimStart());
                } else if (/^(event|id|retry)\s*:/.test(trimmed)) {
                    // ignore
                } else if (sseDataLines.length > 0) {
                    sseDataLines.push(trimmed);
                } else {
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

async function downloadImageAsBase64(url, allowCi) {
    const finalUrl = allowCi ? applyTencentCiCompressionIfPossible(url).url : url;
    const timeoutMs = Number(process.env.COS_DOWNLOAD_TIMEOUT_MS || 15000);

    const response = await axios.get(finalUrl, {
        responseType: 'arraybuffer',
        timeout: timeoutMs,
        maxContentLength: 20 * 1024 * 1024,
        validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
        throw new Error(`下载图片失败: HTTP ${response.status}`);
    }

    const contentType = response.headers?.['content-type'];
    const mimeType = guessMimeTypeFromUrl(finalUrl, contentType);
    const buffer = Buffer.from(response.data);
    const base64 = buffer.toString('base64');
    return { base64, mimeType };
}

async function callPainterGenerateContentWithRetries(args) {
    const { buildEndpoint, keysToTry, payload, timeoutMs } = args;
    const maxAttempts = keysToTry.length || 1;
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const key = keysToTry[attempt - 1];
            const endpoint = buildEndpoint(key);
            if (attempt > 1) {
                console.log(`🔁 Painter retry with next key (attempt ${attempt}/${maxAttempts})`);
            }

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const response = await axios.post(endpoint, payload, {
                    headers: { 'Content-Type': 'application/json' },
                    responseType: 'stream',
                    signal: controller.signal,
                    timeout: timeoutMs + 1000,
                    validateStatus: () => true,
                });

                const status = response.status;
                const contentType = String(response.headers?.['content-type'] || '').toLowerCase();

                if (status < 200 || status >= 300) {
                    const errText = await readStreamAsText(response.data, 64 * 1024);
                    throw new Error(`Painter HTTP ${status}: ${errText.slice(0, 1000)}`);
                }

                let shootLogText = '';

                const handleOnePayload = async (data) => {
                    if (data?.promptFeedback?.blockReason) {
                        throw new Error(`Prompt blocked: ${data.promptFeedback.blockReason}`);
                    }

                    const candidate = data?.candidates?.[0];
                    if (!candidate) return null;

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
                        const mimeType = imageData.mime_type || imageData.mimeType || 'image/png';
                        return { kind: 'inline', base64Data, mimeType };
                    }

                    for (const part of candidate.content?.parts || []) {
                        const fd = getFileDataFromPart(part);
                        if (!fd) continue;
                        const mimeType = fd.mimeType || guessMimeTypeFromUrl(fd.fileUri);
                        if (mimeType.startsWith('image/')) {
                            return { kind: 'url', url: fd.fileUri, mimeType };
                        }
                    }

                    return null;
                };

                const isEventStream = contentType.includes('text/event-stream');
                const isNdjson = contentType.includes('application/x-ndjson') || contentType.includes('application/ndjson');

                if (isEventStream || isNdjson) {
                    const result = await readGeminiStreamForImage(response.data, async (obj) => {
                        const found = await handleOnePayload(obj);
                        return found;
                    });

                    let base64Data = result.base64Data;
                    let mimeType = result.mimeType;
                    if (result.kind === 'url') {
                        const downloaded = await downloadImageAsBase64(result.url, false);
                        base64Data = downloaded.base64;
                        mimeType = downloaded.mimeType;
                    }

                    return { base64Data, mimeType, shootLogText };
                }

                const rawText = await readStreamAsText(response.data, 40 * 1024 * 1024);
                const data = JSON.parse(rawText);

                const found = await handleOnePayload(data);
                if (!found) {
                    const candidate = data?.candidates?.[0];
                    const finishReason = String(candidate?.finishReason || candidate?.finish_reason || '').trim();
                    const partKinds = (candidate?.content?.parts || []).map((p) => {
                        if (p?.inline_data || p?.inlineData) return 'inline';
                        if (getFileDataFromPart(p)) return 'fileData';
                        if (typeof p?.text === 'string') return 'text';
                        return 'other';
                    });
                    const preview = shootLogText ? shootLogText.slice(0, 400) : '';
                    throw new Error(`No image data found in API response. finishReason=${finishReason || 'UNKNOWN'} ModelTextPreview=${preview || 'EMPTY'} Parts=${JSON.stringify(partKinds)}`);
                }

                if (found.kind === 'url') {
                    const downloaded = await downloadImageAsBase64(found.url, false);
                    return { base64Data: downloaded.base64, mimeType: downloaded.mimeType, shootLogText };
                }

                return { base64Data: found.base64Data, mimeType: found.mimeType, shootLogText };
            } finally {
                clearTimeout(timer);
                try { controller.abort(); } catch { /* ignore */ }
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            lastError = err;
            const shouldRetry = attempt < maxAttempts && isRetryablePainterFailure(err);
            if (shouldRetry) {
                console.log(`Painter failed (attempt ${attempt}/${maxAttempts}), retrying...`);
                await new Promise((resolve) => setTimeout(resolve, 800));
                continue;
            }
            throw err;
        }
    }

    throw lastError || new Error('Image generation failed');
}

function buildGenerationConfig(params, editMode) {
    const painterParams = params && typeof params === 'object' ? params : {};

    const generationConfig = {
        responseModalities: Array.isArray(painterParams.responseModalities) && painterParams.responseModalities.length > 0
            ? painterParams.responseModalities
            : ['IMAGE'],
        candidateCount: 1,
    };

    if (painterParams.thinkingConfig) {
        generationConfig.thinkingConfig = painterParams.thinkingConfig;
    }
    if (Number.isFinite(painterParams.seed)) {
        generationConfig.seed = Math.trunc(painterParams.seed);
    }
    if (Number.isFinite(painterParams.temperature)) {
        generationConfig.temperature = painterParams.temperature;
    }

    const imageConfig = {};
    if (painterParams.aspectRatio) {
        imageConfig.aspectRatio = painterParams.aspectRatio;
    }
    if (painterParams.imageSize) {
        const sizeMap = {
            '1024x1024': '1K',
            '2048x2048': '2K',
            '4096x4096': '4K',
            '1K': '1K',
            '2K': '2K',
            '4K': '4K',
        };
        imageConfig.imageSize = sizeMap[painterParams.imageSize] || '2K';
    }
    if (Object.keys(imageConfig).length > 0) {
        generationConfig.imageConfig = imageConfig;
    }

    const finalEditMode = editMode || painterParams.editMode;
    if (finalEditMode) {
        generationConfig.editMode = finalEditMode;
    }

    return generationConfig;
}

function normalizeShots(params) {
    if (Array.isArray(params?.shots) && params.shots.length > 0) {
        return params.shots;
    }

    const prompt = typeof params?.prompt === 'string' ? params.prompt : undefined;
    const prompts = Array.isArray(params?.prompts) ? params.prompts : [];
    const finalPrompt = prompt || (prompts.length === 1 ? prompts[0] : undefined);
    const referenceImageUrls = Array.isArray(params?.referenceImageUrls) ? params.referenceImageUrls : [];

    if (prompts.length > 1) {
        return prompts.map((p, idx) => ({
            shotId: params?.shotId ? `${params.shotId}_${idx + 1}` : `shot_${idx + 1}`,
            prompt: String(p || '').trim(),
            referenceImageUrls,
            config: params?.config,
        })).filter((s) => s.prompt);
    }

    return [{
        shotId: params?.shotId,
        prompt: finalPrompt,
        referenceImageUrls,
        config: params?.config,
    }];
}

function normalizeImagesForShot(shot) {
    const images = [];
    const pushImage = (entry) => {
        if (!entry || !entry.url) return;
        if (images.some((img) => img.url === entry.url)) return;
        images.push(entry);
    };

    if (shot?.baseImageUrl) {
        pushImage({ url: String(shot.baseImageUrl).trim(), label: 'BASE', allowCi: false });
    }
    if (shot?.maskImageUrl) {
        pushImage({ url: String(shot.maskImageUrl).trim(), label: 'MASK', allowCi: false });
    }

    if (Array.isArray(shot?.images)) {
        for (const img of shot.images) {
            const raw = String(img?.url || img?.pathOrUrl || '').trim();
            if (!raw) continue;
            pushImage({
                url: raw,
                label: typeof img?.label === 'string' ? img.label : undefined,
                allowCi: typeof img?.allowCi === 'boolean' ? img.allowCi : true,
            });
        }
    }

    if (Array.isArray(shot?.referenceImageUrls)) {
        for (let i = 0; i < shot.referenceImageUrls.length; i += 1) {
            const raw = String(shot.referenceImageUrls[i] || '').trim();
            if (!raw) continue;
            pushImage({ url: raw, label: `REF_${i + 1}`, allowCi: true });
        }
    }

    const editMode = String(shot?.editMode || shot?.painterParams?.editMode || '').toUpperCase();
    const isInpaint = editMode.includes('INPAINT');
    if (isInpaint) {
        if (images[0]) images[0].allowCi = false;
        if (images[1]) images[1].allowCi = false;
    }

    return images;
}

async function generateShot(shot, config, cos) {
    const shotId = String(shot?.shotId || '').trim();
    if (!shotId) {
        throw new Error('缺少必要参数：shotId');
    }

    const runtimeConfig = { ...(config || {}), ...(shot?.config || {}) };
    const systemInstruction = String(shot?.systemInstruction || '').trim();
    const history = Array.isArray(shot?.history) ? shot.history : [];
    const userTextRaw = String(shot?.userText || shot?.prompt || '').trim();
    if (!userTextRaw) {
        throw new Error('缺少必要参数：userText/prompt');
    }

    const images = normalizeImagesForShot(shot);
    const inlineImages = [];
    for (const img of images) {
        if (!isHttpUrl(img.url)) {
            throw new Error(`图片URL无效: ${String(img.url).slice(0, 80)}`);
        }
        const downloaded = await downloadImageAsBase64(img.url, img.allowCi !== false);
        inlineImages.push({
            label: img.label,
            base64: downloaded.base64,
            mimeType: downloaded.mimeType,
        });
    }

    const userText = `${userTextRaw}\n\n[Hard Output Requirement]\nReturn IMAGE only. Do not return text.`;
    const parts = [{ text: userText }];
    for (const img of inlineImages) {
        if (systemInstruction && img.label) {
            parts.push({ text: `[Image] ${img.label}` });
        }
        parts.push({
            inline_data: {
                mime_type: img.mimeType || 'image/png',
                data: img.base64,
            },
        });
    }

    const generationConfig = buildGenerationConfig(shot?.painterParams || {}, shot?.editMode);

    const contents = [];
    if (systemInstruction && history.length > 0) {
        for (const m of history) {
            const role = m?.role === 'model' ? 'model' : 'user';
            const text = String(m?.text || '').trim();
            if (!text) continue;
            contents.push({ role, parts: [{ text }] });
        }
    }
    contents.push({ role: 'user', parts });

    const payload = systemInstruction
        ? {
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents,
            generationConfig,
        }
        : {
            contents: [{ role: 'user', parts }],
            generationConfig,
        };

    const gateway =
        runtimeConfig?.painterGateway
        || runtimeConfig?.gatewayUrl
        || runtimeConfig?.painterApiUrl
        || process.env.PAINTER_API_URL
        || 'https://api.vectorengine.ai/v1';
    const model = runtimeConfig?.painterModel || process.env.PAINTER_MODEL || 'gemini-3-pro-image-preview';
    const keysToTry = getKeyPool(runtimeConfig);
    if (keysToTry.length === 0) {
        throw new Error('缺少 Painter API Key');
    }

    const endpointBuilder = (key) => buildPainterEndpoint(gateway, key, model);
    const painterTimeoutMs = Number(runtimeConfig?.painterTimeoutMs || process.env.PAINTER_TIMEOUT_MS || 600000);

    const result = await callPainterGenerateContentWithRetries({
        buildEndpoint: endpointBuilder,
        keysToTry,
        payload,
        timeoutMs: painterTimeoutMs,
    });

    const imageUrl = await saveImageToCOS(
        cos,
        result.base64Data,
        shotId,
        process.env.COS_BUCKET,
        process.env.COS_REGION,
        result.mimeType,
    );

    return {
        imageUrl,
        shootLogText: result.shootLogText || '',
    };
}

async function saveImageToCOS(cos, base64Image, shotId, bucket, region, mimeType) {
    const safeMimeType = (typeof mimeType === 'string' && mimeType.startsWith('image/')) ? mimeType : 'image/png';
    const ext = safeMimeType.includes('webp') ? 'webp' : (safeMimeType.includes('png') ? 'png' : 'jpg');

    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const key = `generated/${shotId}-${timestamp}-${randomStr}.${ext}`;

    const buffer = Buffer.from(base64Image, 'base64');
    await cos.putObject({
        Bucket: bucket,
        Region: region,
        Key: key,
        Body: buffer,
        ContentType: safeMimeType,
    });

    return `https://${bucket}.cos.${region}.myqcloud.com/${key}`;
}

exports.main_handler = async (event, context) => {
    console.log('📥 收到事件:', JSON.stringify({
        requestId: context?.requestId,
        hasBody: !!event?.body,
    }));

    let params;
    try {
        const rawBody = typeof event?.body === 'string' ? event.body : JSON.stringify(event?.body ?? {});
        params = JSON.parse(rawBody);
    } catch (error) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: false, error: '请求体解析失败' }),
        };
    }

    try {
        if (!process.env.COS_BUCKET || !process.env.COS_REGION) {
            throw new Error('缺少 COS 配置（COS_BUCKET / COS_REGION）');
        }
        if (!process.env.TENCENT_SECRET_ID || !process.env.TENCENT_SECRET_KEY) {
            throw new Error('缺少腾讯云密钥（TENCENT_SECRET_ID / TENCENT_SECRET_KEY）');
        }

        const shots = normalizeShots(params);
        if (!Array.isArray(shots) || shots.length === 0) {
            throw new Error('缺少必要参数：shots');
        }

        const config = (params?.config && typeof params.config === 'object') ? params.config : {};
        const cos = new COS({
            SecretId: process.env.TENCENT_SECRET_ID,
            SecretKey: process.env.TENCENT_SECRET_KEY,
        });

        const results = [];
        for (const shot of shots) {
            const shotId = String(shot?.shotId || '').trim() || `shot_${results.length + 1}`;
            console.log(`🎨 开始生成 Shot ${shotId}...`);

            try {
                const result = await generateShot({ ...shot, shotId }, config, cos);
                console.log(`✅ Shot ${shotId} 生成成功`);
                results.push({
                    shotId,
                    success: true,
                    imageUrl: result.imageUrl,
                    shootLogText: result.shootLogText,
                });
            } catch (err) {
                console.error(`❌ Shot ${shotId} 生成失败:`, err?.message || err);
                results.push({
                    shotId,
                    success: false,
                    error: err?.message || String(err),
                });
            }
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                taskId: params?.taskId,
                results,
                count: results.length,
            }),
        };
    } catch (error) {
        console.error('❌ 处理失败:', error?.message || error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: false,
                taskId: params?.taskId,
                error: error?.message || String(error),
                stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
            }),
        };
    }
};
