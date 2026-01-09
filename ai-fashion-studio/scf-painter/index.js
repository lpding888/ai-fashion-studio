/**
 * SCF Painter云函数（单张模式）
 * 功能：调用Painter API生成单张图片
 * 
 * 流程：
 * 1. 从COS下载参考图
 * 2. WebP压缩 + 转Base64
 * 3. 调用Painter API（单张）
 * 4. 保存生成图到COS
 * 5. 返回图片URL
 * 
 * 优势：
 * - 重新生成时只调用单张，成本最低
 * - 失败隔离，不影响其他图片
 * - 更容易控制和调试
 */

const axios = require('axios');
const COS = require('cos-nodejs-sdk-v5');

function maskSecret(value) {
    if (!value) return '';
    const text = String(value);
    if (text.length <= 8) return '***';
    return `${text.slice(0, 3)}***${text.slice(-3)}`;
}

function buildPainterEndpoint(apiUrl, apiKey, model) {
    const raw = String(apiUrl || '').trim();
    if (!raw) {
        throw new Error('缺少 Painter API URL 配置');
    }

    const trimmed = raw.replace(/\/+$/, '');

    // 兼容：直接传完整 generateContent endpoint（带或不带 key）
    if (trimmed.includes(':generateContent')) {
        if (trimmed.includes('key=')) return trimmed;
        const joiner = trimmed.includes('?') ? '&' : '?';
        return `${trimmed}${joiner}key=${encodeURIComponent(apiKey)}`;
    }

    const painterModel = model ? String(model).trim() : '';
    if (!painterModel) {
        throw new Error('缺少 Painter 模型配置（painterModel）');
    }

    // 兼容：传网关根地址（自动补 /v1）
    let gateway = trimmed;
    if (!gateway.match(/\/v1(beta)?$/)) {
        gateway = `${gateway}/v1`;
    }

    return `${gateway}/models/${encodeURIComponent(painterModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

function extractGeneratedImageFromResponse(data) {
    if (data?.promptFeedback?.blockReason) {
        throw new Error(`Prompt blocked: ${data.promptFeedback.blockReason}`);
    }

    const candidate = data?.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    for (const part of parts) {
        const inline = part?.inline_data || part?.inlineData;
        if (!inline?.data) continue;
        return {
            base64: inline.data,
            mimeType: inline.mime_type || inline.mimeType || 'image/png'
        };
    }

    throw new Error('No image data found in API response');
}

/**
 * SCF入口函数
 * @param {Object} event - 触发事件
 * @param {Object} context - 运行时上下文
 */
exports.main_handler = async (event, context) => {
    console.log('📥 收到事件:', JSON.stringify(event, null, 2));

    let params;  // ✅ 移到外面，让catch块也能访问

    try {
        // 1. 解析请求参数
        const rawBody = typeof event?.body === 'string' ? event.body : JSON.stringify(event?.body ?? {});
        params = JSON.parse(rawBody);
        const {
            referenceImageUrls,  // 参考图URLs数组
            prompt,              // 单个提示词 (改为单数)
            prompts,             // 兼容旧字段（数组）
            shotId,              // Shot ID (新增，用于标识)
            config               // 配置信息
        } = params;

        // 2. 验证参数
        const finalPrompt = typeof prompt === 'string'
            ? prompt
            : (Array.isArray(prompts) && prompts.length === 1 ? prompts[0] : undefined);

        if (!finalPrompt || typeof finalPrompt !== 'string') {
            throw new Error('缺少必要参数：prompt（或旧版 prompts[0]）');
        }

        if (!shotId || typeof shotId !== 'string') {
            throw new Error('缺少必要参数：shotId');
        }

        const finalReferenceImageUrls = Array.isArray(referenceImageUrls) ? referenceImageUrls : [];
        const finalConfig = (config && typeof config === 'object') ? config : {};

        if (!process.env.COS_BUCKET || !process.env.COS_REGION) {
            throw new Error('缺少 COS 配置（COS_BUCKET / COS_REGION）');
        }

        console.log(`📸 参考图数量: ${finalReferenceImageUrls.length}`);
        console.log(`📝 生成 Shot: ${shotId}`);

        // 3. 初始化COS客户端
        const cos = new COS({
            SecretId: process.env.TENCENT_SECRET_ID,
            SecretKey: process.env.TENCENT_SECRET_KEY
        });

        // 4. 下载并压缩参考图（转Base64）
        console.log('⬇️  下载参考图...');
        const base64Images = await downloadAndCompressImages(finalReferenceImageUrls);
        console.log('✅ 参考图处理完成');

        // 5. 调用Painter API（单张）
        console.log(`🎨 开始生成 Shot ${shotId}...`);
        const { base64: imageBase64, mimeType } = await generateImage(base64Images, finalPrompt, finalConfig, 0);
        console.log('✅ 图片生成完成');

        // 6. 保存生成图到COS（单张）
        console.log('💾 保存图片到COS...');
        const imageUrl = await saveImageToCOS(
            cos,
            imageBase64,
            shotId,
            process.env.COS_BUCKET,
            process.env.COS_REGION,
            mimeType
        );
        console.log('✅ 保存完成');

        // 7. 返回成功结果
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                shotId: shotId,
                imageUrl: imageUrl
            })
        };

    } catch (error) {
        console.error('❌ 处理失败:', error.message);
        console.error(error.stack);

        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: false,
                shotId: params?.shotId,  // ✅ 使用可选链，防止params未定义
                error: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            })
        };
    }
};

/**
 * 下载并压缩图片
 * @param {Array<string>} imageUrls - 图片URL数组
 * @returns {Promise<Array<string>>} Base64编码的图片数组
 */
async function downloadAndCompressImages(imageUrls) {
    const downloadPromises = imageUrls.map(async (url) => {
        try {
            // 添加数据万象压缩参数（WebP + 质量85 + 限制宽度）
            const compressedUrl = url.includes('?')
                ? `${url}&imageMogr2/format/webp/quality/85/thumbnail/1920x`
                : `${url}?imageMogr2/format/webp/quality/85/thumbnail/1920x`;

            console.log(`⬇️  下载: ${compressedUrl.substring(0, 80)}...`);

            // 下载图片（内网访问COS，速度快）
            const response = await axios.get(compressedUrl, {
                responseType: 'arraybuffer',
                timeout: 10000,
                maxContentLength: 10 * 1024 * 1024  // 限制10MB
            });

            // 转Base64
            const base64 = Buffer.from(response.data).toString('base64');
            const sizeKB = Math.round(response.data.length / 1024);
            console.log(`✅ 下载完成: ${sizeKB}KB`);

            return base64;

        } catch (error) {
            console.error(`❌ 下载失败: ${url}`, error.message);
            throw new Error(`下载图片失败: ${error.message}`);
        }
    });

    return Promise.all(downloadPromises);
}

/**
 * 调用Painter API生成图片（VectorEngine格式）
 * @param {Array<string>} base64Images - Base64编码的参考图
 * @param {string} prompt - 提示词
 * @param {Object} config - 配置信息
 * @param {number} index - 索引（用于日志）
 * @returns {Promise<{ base64: string, mimeType: string }>} 生成图Base64 + 类型
 */
async function generateImage(base64Images, prompt, config, index) {
    const startTime = Date.now();

    console.log(`🎨 [${index + 1}] 开始生成: ${prompt.substring(0, 50)}...`);

    try {
        // ✅ 优先使用环境变量，fallback到config
        const apiUrl = process.env.PAINTER_API_URL || config.painterApiUrl;
        const apiKey = process.env.PAINTER_API_KEY || config.apiKey;

        if (!apiUrl || !apiKey) {
            throw new Error('缺少 Painter API 配置（URL或Key）');
        }

        const painterModel = config.painterModel || process.env.PAINTER_MODEL || 'gemini-3-pro-image-preview';
        const endpoint = buildPainterEndpoint(apiUrl, apiKey, painterModel);

        console.log(`  🔗 Endpoint: ${endpoint.replace(String(apiKey), maskSecret(apiKey))}`);
        console.log(`  🤖 Model: ${painterModel || 'N/A'}`);

        // 提取参数
        const aspectRatio = config.painterParams?.aspectRatio || '16:9';
        const imageSize = config.painterParams?.imageSize || '1K';

        console.log(`  📐 比例: ${aspectRatio}`);
        console.log(`  📏 尺寸: ${imageSize}`);

        // 构建parts数组（文本 + 图片）
        const parts = [{ text: prompt }];

        // 添加参考图片
        for (const base64 of base64Images) {
            parts.push({
                inline_data: {
                    mime_type: 'image/webp',
                    data: base64
                }
            });
        }

        // 构建generationConfig
        const generationConfig = {
            responseModalities: ['IMAGE'],
            candidateCount: 1,
            imageGenerationConfig: {
                aspectRatio: aspectRatio,
                imageSize: imageSize
            }
        };

        const payload = {
            contents: [{ role: 'user', parts: parts }],
            generationConfig: generationConfig
        };

        const timeoutMs = Number(process.env.PAINTER_TIMEOUT_MS || 600000);
        const response = await axios.post(endpoint, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: timeoutMs
        });

        const { base64, mimeType } = extractGeneratedImageFromResponse(response.data);

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✅ [${index + 1}] 生成成功: ${duration}s, mime=${mimeType}`);

        return { base64, mimeType };

    } catch (error) {
        const status = error.response?.status;
        const message = error.response?.data?.error?.message || error.message;
        console.error(`❌ [${index + 1}] 生成失败${status ? ` (HTTP ${status})` : ''}:`, message);
        throw new Error(`生成图片失败: ${message}`);
    }
}

/**
 * 保存单张图片到COS
 * @param {COS} cos - COS客户端
 * @param {string} base64Image - Base64图片
 * @param {string} shotId - Shot ID
 * @param {string} bucket - 存储桶名称
 * @param {string} region - 地域
 * @param {string} mimeType - 图片类型（可选）
 * @returns {Promise<string>} 图片URL
 */
async function saveImageToCOS(cos, base64Image, shotId, bucket, region, mimeType = 'image/png') {
    try {
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 8);

        const safeMimeType = (typeof mimeType === 'string' && mimeType.startsWith('image/')) ? mimeType : 'image/png';
        const ext = safeMimeType.includes('webp') ? 'webp' : (safeMimeType.includes('png') ? 'png' : 'jpg');
        const key = `generated/${shotId}-${timestamp}-${randomStr}.${ext}`;

        console.log(`💾 保存 Shot ${shotId}: ${key}`);

        // 转Buffer
        const buffer = Buffer.from(base64Image, 'base64');
        const sizeKB = Math.round(buffer.length / 1024);

        // 上传到COS
        await cos.putObject({
            Bucket: bucket,
            Region: region,
            Key: key,
            Body: buffer,
            ContentType: safeMimeType
        });

        const url = `https://${bucket}.cos.${region}.myqcloud.com/${key}`;
        console.log(`✅ 保存完成: ${sizeKB}KB`);

        return url;

    } catch (error) {
        console.error('❌ 保存失败:', error.message);
        throw new Error(`保存图片失败: ${error.message}`);
    }
}
