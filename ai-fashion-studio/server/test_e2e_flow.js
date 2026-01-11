const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.VECTOR_ENGINE_API_KEY;
if (!API_KEY) {
    console.error('Missing VECTOR_ENGINE_API_KEY env var');
    process.exit(1);
}

const GATEWAY = 'https://api.vectorengine.ai';
const BRAIN_MODEL = 'gemini-3-pro-preview';
const PAINTER_MODEL = 'gemini-3-pro-image-preview';

console.log('=== 端到端生图流程测试 ===\n');
console.log(`Gateway: ${GATEWAY}`);
console.log(`Brain Model: ${BRAIN_MODEL}`);
console.log(`Painter Model: ${PAINTER_MODEL}`);
console.log(`API Key: ${API_KEY.substring(0, 10)}...\n`);

// 测试图片路径（需要手动指定）
const TEST_IMAGE = process.argv[2] || './uploads/test.jpg';

async function testBrainAnalysis(imagePath) {
    console.log('\n[步骤 1] 测试 Brain 分析...');
    console.log(`图片路径: ${imagePath}`);

    if (!fs.existsSync(imagePath)) {
        throw new Error(`图片不存在: ${imagePath}`);
    }

    // 读取图片并转换为 base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    console.log(`图片大小: ${(imageBuffer.length / 1024).toFixed(2)} KB`);
    console.log(`MIME类型: ${mimeType}`);

    // Google Native 格式 - Brain 请求
    const requestBody = {
        systemInstruction: {
            parts: [{ text: "You are a fashion analysis AI. Analyze the garment and create a photoshoot plan." }]
        },
        contents: [
            {
                role: 'user',
                parts: [
                    { text: "Requirements: 专业时尚大片\nParams: shot_count=3, layout_mode=Individual\n\nPlease respond with ONLY a valid JSON object." },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Image
                        }
                    }
                ]
            }
        ],
        generationConfig: {
            temperature: 0.2,
            topP: 1,
            responseMimeType: 'application/json',
            thinkingConfig: {
                includeThoughts: true,
                thinkingBudget: 8192
            }
        }
    };

    const endpoint = `${GATEWAY}/v1beta/models/${BRAIN_MODEL}:generateContent?key=${API_KEY}`;

    console.log(`\n请求 URL: ${endpoint.replace(API_KEY, 'API_KEY')}`);
    console.log(`请求体大小: ${JSON.stringify(requestBody).length} bytes`);

    try {
        const startTime = Date.now();
        const response = await axios.post(endpoint, requestBody, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000
        });
        const duration = Date.now() - startTime;

        console.log(`\n✅ Brain 调用成功 (${duration}ms)`);
        console.log(`状态码: ${response.status}`);

        const candidate = response.data.candidates?.[0];
        if (!candidate) {
            console.error('❌ 响应中没有 candidate');
            console.log('完整响应:', JSON.stringify(response.data, null, 2));
            return null;
        }

        // 提取内容
        let thinkingProcess = '';
        let rawContent = '';

        for (const part of candidate.content?.parts || []) {
            if (part.thought) {
                thinkingProcess += part.text + '\n';
            } else if (part.text) {
                rawContent += part.text;
            }
        }

        if (thinkingProcess) {
            console.log(`\n思考过程: ${thinkingProcess.substring(0, 200)}...`);
        }

        console.log(`\n返回内容: ${rawContent.substring(0, 300)}...`);

        // 鲁棒的 JSON 提取：查找第一个 { 和最后一个 }
        const firstBrace = rawContent.indexOf('{');
        const lastBrace = rawContent.lastIndexOf('}');

        let cleanContent = rawContent;
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleanContent = rawContent.substring(firstBrace, lastBrace + 1);
            console.log(`\n🔧 检测到 Markdown 包裹，已提取纯 JSON`);
        } else {
            // Fallback: 尝试移除常见的 Markdown 格式
            cleanContent = rawContent
                .replace(/^```json\s*/i, '')
                .replace(/^```\s*/, '')
                .replace(/\s*```$/g, '')
                .trim();
        }

        console.log(`清洗后内容: ${cleanContent.substring(0, 200)}...`);

        // 尝试解析 JSON
        try {
            const json = JSON.parse(cleanContent);
            console.log('\n✅ JSON 解析成功');
            console.log('返回结构:', Object.keys(json));
            console.log('shots 数量:', json.shots?.length || 0);

            // 返回第一个 prompt 用于测试 Painter
            const firstPrompt = json.shots?.[0]?.prompt_en;
            if (!firstPrompt) {
                console.log('完整 JSON:', JSON.stringify(json, null, 2));
                throw new Error('JSON 中找不到 shots[0].prompt_en');
            }

            console.log(`\n提取的 Prompt: ${firstPrompt.substring(0, 100)}...`);
            return firstPrompt;
        } catch (e) {
            console.error('❌ JSON 解析失败:', e.message);
            console.error('清洗后的完整内容:', cleanContent);
            return null;
        }

    } catch (error) {
        console.error(`\n❌ Brain 调用失败`);
        console.error(`状态码: ${error.response?.status}`);
        console.error(`错误信息:`, JSON.stringify(error.response?.data || error.message, null, 2));
        throw error;
    }
}

async function testPainterGeneration(prompt, referencePath) {
    console.log('\n\n[步骤 2] 测试 Painter 生图...');
    console.log(`Prompt: ${prompt}`);
    console.log(`参考图片: ${referencePath}`);

    // 读取参考图片
    const imageBuffer = fs.readFileSync(referencePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = referencePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    // Google Native 格式 - Painter 请求
    const requestBody = {
        contents: [
            {
                role: 'user',
                parts: [
                    { text: prompt },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Image
                        }
                    }
                ]
            }
        ],
        generationConfig: {
            temperature: 1.0,
            topP: 0.95
        }
    };

    const endpoint = `${GATEWAY}/v1beta/models/${PAINTER_MODEL}:generateContent?key=${API_KEY}`;

    console.log(`\n请求 URL: ${endpoint.replace(API_KEY, 'API_KEY')}`);

    try {
        const startTime = Date.now();
        const response = await axios.post(endpoint, requestBody, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 300000  // 5分钟
        });
        const duration = Date.now() - startTime;

        console.log(`\n✅ Painter 调用成功 (${duration}ms)`);
        console.log(`状态码: ${response.status}`);

        const candidate = response.data.candidates?.[0];
        if (!candidate) {
            console.error('❌ 响应中没有 candidate');
            return;
        }

        // 检查是否有图片
        let foundImage = false;
        for (const part of candidate.content?.parts || []) {
            if (part.inline_data) {
                foundImage = true;
                console.log(`\n✅ 生成图片成功`);
                console.log(`MIME类型: ${part.inline_data.mime_type}`);
                console.log(`图片大小: ${(part.inline_data.data.length / 1024).toFixed(2)} KB (base64)`);

                // 保存图片
                const outputPath = path.join(__dirname, 'test_generated.png');
                fs.writeFileSync(outputPath, Buffer.from(part.inline_data.data, 'base64'));
                console.log(`已保存到: ${outputPath}`);
            }
        }

        if (!foundImage) {
            console.error('❌ 响应中没有图片数据');
            console.log('完整响应:', JSON.stringify(response.data, null, 2));
        }

    } catch (error) {
        console.error(`\n❌ Painter 调用失败`);
        console.error(`状态码: ${error.response?.status}`);
        console.error(`错误信息:`, JSON.stringify(error.response?.data || error.message, null, 2));
        throw error;
    }
}

async function runE2ETest() {
    try {
        console.log(`\n开始测试，测试图片: ${TEST_IMAGE}\n`);

        // 步骤 1: Brain 分析
        const prompt = await testBrainAnalysis(TEST_IMAGE);

        if (!prompt) {
            console.error('\n❌ Brain 分析失败，无法继续测试 Painter');
            process.exit(1);
        }

        // 步骤 2: Painter 生图
        await testPainterGeneration(prompt, TEST_IMAGE);

        console.log('\n\n=== 测试完成 ===');
        console.log('✅ 完整流程测试成功！');

    } catch (error) {
        console.error('\n\n=== 测试失败 ===');
        console.error('Error:', error.message);
        process.exit(1);
    }
}

runE2ETest();
