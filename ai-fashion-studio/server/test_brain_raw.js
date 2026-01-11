const axios = require('axios');
const fs = require('fs');

const API_KEY = process.env.VECTOR_ENGINE_API_KEY;
if (!API_KEY) {
    console.error('Missing VECTOR_ENGINE_API_KEY env var');
    process.exit(1);
}

const GATEWAY = 'https://api.vectorengine.ai';
const BRAIN_MODEL = 'gemini-3-pro-preview';

console.log('=== 简化测试：Brain API 原始响应 ===\n');

async function testBrainRaw() {
    const imagePath = process.argv[2] || './server/uploads/1767539648965-465058879.jpg';

    console.log(`图片: ${imagePath}`);

    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const requestBody = {
        systemInstruction: {
            parts: [{ text: "You are a fashion analysis AI." }]
        },
        contents: [{
            role: 'user',
            parts: [
                { text: "Requirements: 时尚大片\nParams: shot_count=3\n\nPlease respond with ONLY a valid JSON object." },
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
        console.log('发送请求...\n');
        const response = await axios.post(endpoint, requestBody, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000
        });

        console.log('✅ 请求成功\n');

        // 保存完整响应
        fs.writeFileSync('brain_raw_response.json', JSON.stringify(response.data, null, 2));
        console.log('完整响应已保存到: brain_raw_response.json\n');

        const candidate = response.data.candidates?.[0];
        if (!candidate) {
            console.error('❌ 没有 candidate');
            return;
        }

        // 提取文本内容
        let rawContent = '';
        for (const part of candidate.content?.parts || []) {
            if (part.text) {
                rawContent += part.text;
            }
        }

        console.log('=== 原始返回内容 ===');
        console.log(rawContent);
        console.log('\n=== 内容长度 ===');
        console.log(`${rawContent.length} 字符`);

        // 保存原始文本
        fs.writeFileSync('brain_raw_text.txt', rawContent);
        console.log('\n原始文本已保存到: brain_raw_text.txt');

        // 尝试提取 JSON
        const firstBrace = rawContent.indexOf('{');
        const lastBrace = rawContent.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1) {
            const extracted = rawContent.substring(firstBrace, lastBrace + 1);
            console.log(`\n提取的 JSON (${extracted.length} 字符):`);
            console.log(extracted.substring(0, 500) + '...');

            try {
                const json = JSON.parse(extracted);
                console.log('\n✅ JSON 解析成功！');
                console.log('Keys:', Object.keys(json));

                fs.writeFileSync('brain_parsed.json', JSON.stringify(json, null, 2));
                console.log('解析后的 JSON 已保存到: brain_parsed.json');

                if (json.shots) {
                    console.log(`\nShots 数量: ${json.shots.length}`);
                    console.log('第一个 Prompt:', json.shots[0]?.prompt_en?.substring(0, 100));
                }
            } catch (e) {
                console.error('\n❌ JSON 解析失败:', e.message);
                fs.writeFileSync('brain_extracted.txt', extracted);
                console.log('提取的内容已保存到: brain_extracted.txt');
            }
        } else {
            console.error('\n❌ 找不到 JSON 边界');
        }

    } catch (error) {
        console.error('❌ 请求失败');
        console.error('状态码:', error.response?.status);
        console.error('错误:', error.response?.data || error.message);
    }
}

testBrainRaw();
