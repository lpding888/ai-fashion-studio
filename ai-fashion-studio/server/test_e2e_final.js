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

console.log('=== 端到端生图流程测试 (修复版) ===\n');
console.log(`Gateway: ${GATEWAY}`);
console.log(`Brain Model: ${BRAIN_MODEL}`);
console.log(`Painter Model: ${PAINTER_MODEL}\n`);

const TEST_IMAGE = process.argv[2] || './uploads/test.jpg';

// 提取最后一个完整的 JSON 对象
function extractLastJSON(text) {
    // 策略: 从后往前找 }, 然后往前找到匹配的 {
    const lines = text.split('\n');
    let jsonText = '';
    let braceCount = 0;
    let foundEnd = false;

    // 从后往前遍历每一行
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        jsonText = line + '\n' + jsonText;

        // 计算花括号
        for (let j = line.length - 1; j >= 0; j--) {
            if (line[j] === '}') {
                braceCount++;
                if (!foundEnd) foundEnd = true;
            } else if (line[j] === '{') {
                braceCount--;
            }
        }

        // 如果找到匹配的开始括号
        if (foundEnd && braceCount === 0) {
            // 清理前后空白
            jsonText = jsonText.trim();
            // 移除可能的 markdown 标记
            jsonText = jsonText.replace(/^```json\s*/i, '').replace(/\s*```$/g, '');
            return jsonText;
        }
    }

    // Fallback: 使用原有逻辑
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        return text.substring(firstBrace, lastBrace + 1);
    }

    return text;
}

async function testBrainAnalysis(imagePath) {
    console.log('[步骤 1] 测试 Brain 分析...');
    console.log(`图片: ${imagePath}\n`);

    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const requestBody = {
        systemInstruction: {
            parts: [{ text: "You are a fashion analysis AI. Analyze the garment and create a photoshoot plan." }]
        },
        contents: [{
            role: 'user',
            parts: [
                { text: "Requirements: 专业时尚大片\nParams: shot_count=3, layout_mode=Individual\n\nPlease respond with ONLY a valid JSON object." },
                { inline_data: { mime_type: mimeType, data: base64Image } }
            ]
        }],
        generationConfig: {
            temperature: 0.2,
            topP: 1,
            responseMimeType: 'application/json'
        }
    };

    const endpoint = `${GATEWAY}/v1beta/models/${BRAIN_MODEL}:generateContent?key=${API_KEY}`;

    try {
        console.log('发送请求...');
        const startTime = Date.now();
        const response = await axios.post(endpoint, requestBody, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000
        });
        const duration = Date.now() - startTime;

        console.log(`✅ Brain 调用成功 (${duration}ms)\n`);

        const candidate = response.data.candidates?.[0];
        if (!candidate) {
            console.error('❌ 没有 candidate');
            return null;
        }

        let rawContent = '';
        for (const part of candidate.content?.parts || []) {
            if (part.text) rawContent += part.text;
        }

        console.log(`原始内容长度: ${rawContent.length} 字符`);

        // 提取最后一个 JSON 对象
        const cleanContent = extractLastJSON(rawContent);
        console.log(`提取后长度: ${cleanContent.length} 字符\n`);

        try {
            const json = JSON.parse(cleanContent);
            console.log('✅ JSON 解析成功');
            console.log('Keys:', Object.keys(json));
            console.log('Shots:', json.shots?.length || 0);

            const firstPrompt = json.shots?.[0]?.prompt;
            if (!firstPrompt) {
                throw new Error('找不到 shots[0].prompt');
            }

            console.log(`\n提取的 Prompt:\n${firstPrompt.substring(0, 150)}...\n`);
            return firstPrompt;
        } catch (e) {
            console.error('❌ JSON 解析失败:', e.message);
            console.error('提取内容:', cleanContent.substring(0, 500));
            return null;
        }
    } catch (error) {
        console.error('❌ Brain 调用失败');
        console.error('状态码:', error.response?.status);
        console.error('错误:', error.response?.data || error.message);
        throw error;
    }
}

async function testPainterGeneration(prompt, referencePath) {
    console.log('\n[步骤 2] 测试 Painter 生图...');
    console.log(`Prompt: ${prompt.substring(0, 100)}...`);
    console.log(`参考图片: ${referencePath}\n`);

    const imageBuffer = fs.readFileSync(referencePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = referencePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const requestBody = {
        contents: [{
            role: 'user',
            parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: base64Image } }
            ]
        }],
        generationConfig: {
            temperature: 1.0,
            topP: 0.95
        }
    };

    const endpoint = `${GATEWAY}/v1beta/models/${PAINTER_MODEL}:generateContent?key=${API_KEY}`;

    try {
        console.log('发送请求（预计需要 2-5 分钟）...');
        const startTime = Date.now();
        const response = await axios.post(endpoint, requestBody, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 300000
        });
        const duration = Date.now() - startTime;

        console.log(`✅ Painter 调用成功 (${(duration / 1000).toFixed(1)}秒)\n`);

        const candidate = response.data.candidates?.[0];
        if (!candidate) {
            console.error('❌ 没有 candidate');
            return;
        }

        let foundImage = false;
        for (const part of candidate.content?.parts || []) {
            if (part.inline_data) {
                foundImage = true;
                const actualSize = (Buffer.from(part.inline_data.data, 'base64').length / 1024 / 1024).toFixed(2);
                console.log(`✅ 生成图片成功`);
                console.log(`MIME: ${part.inline_data.mime_type}`);
                console.log(`大小: ${actualSize} MB\n`);

                const outputPath = path.join(__dirname, 'test_final_output.png');
                fs.writeFileSync(outputPath, Buffer.from(part.inline_data.data, 'base64'));
                console.log(`✅ 已保存到: ${outputPath}`);
            }
        }

        if (!foundImage) {
            console.error('❌ 响应中没有图片');
        }
    } catch (error) {
        console.error('❌ Painter 调用失败');
        console.error('状态码:', error.response?.status);
        console.error('错误:', error.response?.data || error.message);
        throw error;
    }
}

async function runE2ETest() {
    try {
        console.log(`测试图片: ${TEST_IMAGE}\n`);
        console.log('=' + '='.repeat(50) + '\n');

        const prompt = await testBrainAnalysis(TEST_IMAGE);

        if (!prompt) {
            console.error('\n❌ Brain 失败，终止测试');
            process.exit(1);
        }

        console.log('=' + '='.repeat(50));
        await testPainterGeneration(prompt, TEST_IMAGE);

        console.log('\n' + '=' + '='.repeat(50));
        console.log('=== ✅ 端到端测试成功！===');
        console.log('=' + '='.repeat(50));
    } catch (error) {
        console.error('\n' + '=' + '='.repeat(50));
        console.error('=== ❌ 测试失败 ===');
        console.error('Error:', error.message);
        console.error('=' + '='.repeat(50));
        process.exit(1);
    }
}

runE2ETest();
