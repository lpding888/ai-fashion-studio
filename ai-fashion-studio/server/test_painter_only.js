const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.VECTOR_ENGINE_API_KEY;
if (!API_KEY) {
    console.error('Missing VECTOR_ENGINE_API_KEY env var');
    process.exit(1);
}

const GATEWAY = 'https://api.vectorengine.ai';
const PAINTER_MODEL = 'gemini-3-pro-image-preview';

// 使用从 Brain 成功提取的 prompt
const TEST_PROMPT = "Low-angle full-body fashion shot, a model walking confidently across a city crosswalk, wearing an oversized black and white striped long-sleeve shirt and beige cargo pants. The background features blurred European architecture and street lines to emphasize motion. Natural daylight, high contrast, 35mm lens, streetwear editorial style, dynamic composition.";

const REFERENCE_IMAGE = process.argv[2] || './server/uploads/1767539648965-465058879.jpg';

console.log('=== Painter 生图测试 ===\n');
console.log(`模型: ${PAINTER_MODEL}`);
console.log(`参考图: ${REFERENCE_IMAGE}`);
console.log(`\nPrompt:\n${TEST_PROMPT}\n`);
console.log('=' + '='.repeat(60));

async function testPainter() {
    const imageBuffer = fs.readFileSync(REFERENCE_IMAGE);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = REFERENCE_IMAGE.endsWith('.png') ? 'image/png' : 'image/jpeg';

    console.log(`\n图片大小: ${(imageBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`MIME类型: ${mimeType}`);

    const requestBody = {
        contents: [{
            role: 'user',
            parts: [
                { text: TEST_PROMPT },
                { inline_data: { mime_type: mimeType, data: base64Image } }
            ]
        }],
        generationConfig: {
            temperature: 1.0,
            topP: 0.95
        }
    };

    const endpoint = `${GATEWAY}/v1beta/models/${PAINTER_MODEL}:generateContent?key=${API_KEY}`;

    console.log(`\n请求 URL: ${endpoint.replace(API_KEY, 'API_KEY')}`);
    console.log(`请求体大小: ${(JSON.stringify(requestBody).length / 1024 / 1024).toFixed(2)} MB`);
    console.log('\n发送请求（预计 2-5 分钟）...\n');

    try {
        const startTime = Date.now();
        const response = await axios.post(endpoint, requestBody, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 300000  // 5分钟
        });
        const duration = Date.now() - startTime;

        console.log('=' + '='.repeat(60));
        console.log(`✅ Painter 调用成功！`);
        console.log(`耗时: ${(duration / 1000).toFixed(1)} 秒`);
        console.log(`状态码: ${response.status}`);

        const candidate = response.data.candidates?.[0];
        if (!candidate) {
            console.error('\n❌ 响应中没有 candidate');
            console.log('完整响应:', JSON.stringify(response.data, null, 2));
            return;
        }

        // 查找生成的图片
        let foundImage = false;
        for (const part of candidate.content?.parts || []) {
            if (part.inline_data) {
                foundImage = true;
                const imageData = Buffer.from(part.inline_data.data, 'base64');
                const sizeMB = (imageData.length / 1024 / 1024).toFixed(2);

                console.log(`\n✅ 图片生成成功！`);
                console.log(`MIME类型: ${part.inline_data.mime_type}`);
                console.log(`图片大小: ${sizeMB} MB`);

                // 保存图片
                const outputPath = path.join(process.cwd(), 'painter_test_output.png');
                fs.writeFileSync(outputPath, imageData);
                console.log(`\n✅ 已保存到: ${outputPath}`);
                console.log('=' + '='.repeat(60));
                console.log('\n🎉 端到端测试成功！Brain + Painter 流程完整验证！');
                console.log('=' + '='.repeat(60));
            }
        }

        if (!foundImage) {
            console.error('\n❌ 响应中没有图片数据');
            console.log('Parts:', candidate.content?.parts?.map(p => Object.keys(p)));
        }

    } catch (error) {
        console.log('=' + '='.repeat(60));
        console.error('\n❌ Painter 调用失败');
        console.error(`状态码: ${error.response?.status}`);
        console.error(`错误信息:`, JSON.stringify(error.response?.data || error.message, null, 2));
        console.log('=' + '='.repeat(60));
        process.exit(1);
    }
}

testPainter();
