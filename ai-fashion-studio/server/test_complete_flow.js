/**
 * 完整端到端流程测试
 * 流程：上传图片 → Brain分析 → Painter生成
 * 完整展示每步的输入输出格式
 */

const axios = require('axios');
const fs = require('fs');

const API_BASE = 'https://api.vectorengine.ai/v1';
const API_KEY = process.env.VECTOR_ENGINE_API_KEY;
if (!API_KEY) {
    console.error('Missing VECTOR_ENGINE_API_KEY env var');
    process.exit(1);
}

const BRAIN_MODEL = 'gemini-3-pro-preview';
const PAINTER_MODEL = 'gemini-3-pro-image-preview';

// 测试用的服装图片URL
const GARMENT_IMAGE = 'https://ai-photo-prod-1379020062.cos.ap-guangzhou.myqcloud.com/mmexport1686641643361.jpg';

// ============================================
// 工具函数：简化Base64显示
// ============================================
function simplifyBase64(data) {
    if (!data) return null;
    const len = data.length;
    if (len <= 100) return data;
    return {
        preview: `${data.substring(0, 40)}...${data.substring(len - 40)}`,
        length: len,
        sizeKB: (len * 0.75 / 1024).toFixed(1) // Base64转实际大小
    };
}

function simplifyResponse(obj, depth = 0) {
    if (depth > 3) return '...';

    if (Array.isArray(obj)) {
        return obj.map(item => simplifyResponse(item, depth + 1));
    }

    if (typeof obj === 'object' && obj !== null) {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            if (key === 'data' && typeof value === 'string' && value.length > 100) {
                result[key] = simplifyBase64(value);
            } else {
                result[key] = simplifyResponse(value, depth + 1);
            }
        }
        return result;
    }

    return obj;
}

// ============================================
// Step 1: Brain 分析
// ============================================
async function step1_BrainAnalysis() {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  Step 1: Brain 分析服装并给出拍摄方案                      ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    const systemPrompt = `你是AI时尚摄影大脑。分析服装图片，为每个镜头设计：
1. shot_code: 镜头编号
2. scene_description: 场景描述
3. camera_angle: 机位角度
4. lighting: 灯光设置
5. model_pose: 模特姿势

返回JSON格式：
{
  "shots": [
    {
      "shot_code": "SHOT_001",
      "scene_description": "...",
      "camera_angle": "...",
      "lighting": "...",
      "model_pose": "..."
    }
  ]
}`;

    const userPrompt = `分析这件服装，生成1个拍摄镜头方案。
拍摄要求：
- 地点：户外街拍
- 风格：时尚休闲
- 构图：9:16竖版
- 分辨率：2K`;

    const requestPayload = {
        model: BRAIN_MODEL,
        messages: [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: [
                    { type: 'text', text: userPrompt },
                    {
                        type: 'image_url',
                        image_url: { url: GARMENT_IMAGE }
                    }
                ]
            }
        ],
        max_tokens: 1000,
        temperature: 0.7
    };

    console.log('📤 Brain 请求参数:');
    console.log(JSON.stringify({
        endpoint: `${API_BASE}/chat/completions`,
        model: requestPayload.model,
        messages: requestPayload.messages.map(m => ({
            role: m.role,
            content: typeof m.content === 'string'
                ? m.content.substring(0, 100) + '...'
                : m.content.map(c => c.type === 'image_url' ? { type: 'image_url', url: c.image_url.url.substring(0, 60) + '...' } : c)
        })),
        max_tokens: requestPayload.max_tokens
    }, null, 2));

    console.log('\n⏳ 调用 Brain API...\n');

    try {
        const response = await axios.post(
            `${API_BASE}/chat/completions`,
            requestPayload,
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ Brain 响应成功!\n');

        console.log('📥 完整响应结构:');
        console.log(JSON.stringify({
            id: response.data.id,
            object: response.data.object,
            created: response.data.created,
            model: response.data.model,
            choices: response.data.choices.map(c => ({
                index: c.index,
                message: {
                    role: c.message.role,
                    content: c.message.content.substring(0, 200) + '...\n[完整内容见下方]'
                },
                finish_reason: c.finish_reason
            })),
            usage: response.data.usage
        }, null, 2));

        const content = response.data.choices[0].message.content;
        console.log('\n📋 Brain 完整输出内容:');
        console.log('─'.repeat(60));
        console.log(content);
        console.log('─'.repeat(60));

        // 尝试解析JSON
        let plan = null;
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                plan = JSON.parse(jsonMatch[0]);
                console.log('\n✅ 成功解析拍摄计划:');
                console.log(JSON.stringify(plan, null, 2));
            }
        } catch (e) {
            console.log('\n⚠️ 无法解析为JSON，将直接使用文本内容');
        }

        console.log('\n📊 Token 使用统计:');
        console.log(`  - Prompt tokens: ${response.data.usage.prompt_tokens}`);
        console.log(`  - Completion tokens: ${response.data.usage.completion_tokens}`);
        console.log(`  - Total tokens: ${response.data.usage.total_tokens}`);

        return {
            plan: plan,
            rawContent: content,
            usage: response.data.usage
        };

    } catch (error) {
        console.log('❌ Brain API 调用失败');
        console.log('错误:', error.response?.data || error.message);
        throw error;
    }
}

// ============================================
// Step 2: Painter 生成图片
// ============================================
async function step2_PainterGenerate(brainOutput) {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  Step 2: Painter 根据方案生成图片                         ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    // 构建Painter的Prompt
    let painterPrompt = '';
    if (brainOutput.plan && brainOutput.plan.shots && brainOutput.plan.shots[0]) {
        const shot = brainOutput.plan.shots[0];
        painterPrompt = `时尚摄影作品：
场景：${shot.scene_description}
机位：${shot.camera_angle}
灯光：${shot.lighting}
模特姿势：${shot.model_pose}

要求：9:16竖版，2K高清，专业摄影质量`;
    } else {
        painterPrompt = `根据参考图片生成时尚模特照片：
- 构图：户外街拍
- 风格：时尚休闲
- 比例：9:16竖版
- 质量：2K高清`;
    }

    const requestPayload = {
        contents: [
            {
                role: 'user',
                parts: [
                    { text: painterPrompt },
                    {
                        image_url: {
                            url: GARMENT_IMAGE
                        }
                    }
                ]
            }
        ],
        generationConfig: {
            responseModalities: ['IMAGE'],
            candidateCount: 1,
            imageConfig: {
                aspectRatio: '9:16',
                imageSize: '2K'
            }
        }
    };

    console.log('📤 Painter 请求参数:');
    console.log(JSON.stringify({
        endpoint: `${API_BASE}/models/${PAINTER_MODEL}:generateContent`,
        model: PAINTER_MODEL,
        contents: requestPayload.contents.map(c => ({
            role: c.role,
            parts: c.parts.map(p =>
                p.text ? { type: 'text', text: p.text.substring(0, 100) + '...' }
                    : { type: 'image_url', url: p.image_url.url.substring(0, 60) + '...' }
            )
        })),
        generationConfig: requestPayload.generationConfig
    }, null, 2));

    console.log('\n⏳ 调用 Painter API...');
    console.log('   (图片生成需要较长时间，请耐心等待...)\n');

    try {
        const endpoint = `${API_BASE}/models/${PAINTER_MODEL}:generateContent?key=${API_KEY}`;

        const response = await axios.post(
            endpoint,
            requestPayload,
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 180000 // 3分钟
            }
        );

        console.log('✅ Painter 响应成功!\n');

        // 简化响应结构
        const simplifiedResponse = simplifyResponse(response.data);

        console.log('📥 完整响应结构 (Base64已简化):');
        console.log(JSON.stringify(simplifiedResponse, null, 2));

        // 提取并保存图片
        const candidate = response.data.candidates?.[0];
        if (candidate) {
            console.log('\n📋 Candidate 详情:');
            console.log(`  - Finish Reason: ${candidate.finishReason}`);
            console.log(`  - Safety Ratings: ${candidate.safetyRatings?.length || 0} 项`);

            const imagePart = candidate.content?.parts?.find(p => p.inlineData || p.inline_data);
            if (imagePart) {
                const imageData = imagePart.inlineData || imagePart.inline_data;
                const buffer = Buffer.from(imageData.data, 'base64');
                const mimeType = imageData.mimeType || imageData.mime_type;

                const filename = `generated_${Date.now()}.png`;
                fs.writeFileSync(filename, buffer);

                console.log('\n🖼️ 生成图片信息:');
                console.log(`  - MIME类型: ${mimeType}`);
                console.log(`  - 文件大小: ${(buffer.length / 1024).toFixed(0)}KB`);
                console.log(`  - 保存路径: ${filename}`);

                return {
                    imageFile: filename,
                    imageSize: buffer.length,
                    mimeType: mimeType
                };
            }
        }

        console.log('\n⚠️ 响应中未找到图片数据');
        return null;

    } catch (error) {
        console.log('❌ Painter API 调用失败');
        if (error.response) {
            console.log('错误状态:', error.response.status);
            console.log('错误详情:', JSON.stringify(simplifyResponse(error.response.data), null, 2));
        } else {
            console.log('错误:', error.message);
        }
        throw error;
    }
}

// ============================================
// 主流程
// ============================================
async function main() {
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('         AI 时尚摄影完整流程测试');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`测试图片: ${GARMENT_IMAGE.substring(0, 60)}...`);
    console.log(`生成配置: 2K分辨率, 9:16竖版, 生成1张`);
    console.log('═══════════════════════════════════════════════════════════\n');

    try {
        // Step 1: Brain 分析
        const brainResult = await step1_BrainAnalysis();

        console.log('\n⏸️  按 Ctrl+C 可以中止，或等待继续...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 2: Painter 生成
        const painterResult = await step2_PainterGenerate(brainResult);

        // 最终总结
        console.log('\n\n╔══════════════════════════════════════════════════════════╗');
        console.log('║                    流程完成总结                           ║');
        console.log('╚══════════════════════════════════════════════════════════╝\n');

        console.log('✅ Brain 分析完成:');
        console.log(`   - 生成方案: ${brainResult.plan ? '是' : '否'}`);
        console.log(`   - Token使用: ${brainResult.usage.total_tokens}`);

        console.log('\n✅ Painter 生成完成:');
        if (painterResult) {
            console.log(`   - 图片文件: ${painterResult.imageFile}`);
            console.log(`   - 图片大小: ${(painterResult.imageSize / 1024).toFixed(0)}KB`);
        }

        console.log('\n🎉 完整流程测试成功！');

    } catch (error) {
        console.log('\n\n💥 流程执行失败');
        console.log('请检查上方的错误信息');
        process.exit(1);
    }
}

main().catch(console.error);
