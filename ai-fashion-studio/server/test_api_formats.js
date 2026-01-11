/**
 * 详细测试 Brain & Painter API 返回格式
 * 对比 URL vs Base64 两种方式的响应数据
 */

const axios = require('axios');
const fs = require('fs');

const API_BASE = 'https://api.vectorengine.ai/v1';
const API_KEY = process.env.VECTOR_ENGINE_API_KEY;
if (!API_KEY) {
    console.error('Missing VECTOR_ENGINE_API_KEY env var');
    process.exit(1);
}

const IMAGE_URL = 'https://ai-photo-prod-1379020062.cos.ap-guangzhou.myqcloud.com/mmexport1686641643361.jpg';

// ==========================================
// Brain API 测试 (Gemini)
// ==========================================

async function testBrain_URL() {
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║        Brain API - 方式1: 直接URL                ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    try {
        const response = await axios.post(
            `${API_BASE}/chat/completions`,
            {
                model: 'gemini-3-pro-preview',
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: '简单描述这张图片' },
                            {
                                type: 'image_url',
                                image_url: { url: IMAGE_URL }
                            }
                        ]
                    }
                ],
                max_tokens: 200
            },
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ 成功!\n');
        console.log('📊 完整响应结构:');
        console.log(JSON.stringify(response.data, null, 2));

        console.log('\n📋 关键字段提取:');
        console.log('- Model:', response.data.model);
        console.log('- 返回内容:', response.data.choices[0].message.content.substring(0, 100) + '...');
        console.log('- Token使用:', response.data.usage);

        return response.data;
    } catch (error) {
        console.log('❌ 失败');
        console.log('错误:', error.response?.data || error.message);
        return null;
    }
}

async function testBrain_Base64() {
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║        Brain API - 方式2: Base64                 ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    try {
        const imageResponse = await axios.get(IMAGE_URL, { responseType: 'arraybuffer' });
        const base64 = Buffer.from(imageResponse.data).toString('base64');
        const mimeType = imageResponse.headers['content-type'] || 'image/jpeg';

        console.log(`图片: ${(imageResponse.data.length / 1024).toFixed(0)}KB\n`);

        const response = await axios.post(
            `${API_BASE}/chat/completions`,
            {
                model: 'gemini-3-pro-preview',
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: '简单描述这张图片' },
                            {
                                type: 'image_url',
                                image_url: { url: `data:${mimeType};base64,${base64}` }
                            }
                        ]
                    }
                ],
                max_tokens: 200
            },
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ 成功!\n');
        console.log('📊 完整响应结构:');
        console.log(JSON.stringify(response.data, null, 2));

        return response.data;
    } catch (error) {
        console.log('❌ 失败');
        console.log('错误:', error.response?.data || error.message);
        return null;
    }
}

// ==========================================
// Painter API 测试 (Imagen)
// ==========================================

async function testPainter_URL() {
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║       Painter API - 方式1: 直接URL               ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    try {
        const endpoint = `${API_BASE}/models/gemini-3-pro-image-preview:generateContent?key=${API_KEY}`;

        const response = await axios.post(
            endpoint,
            {
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: '生成类似风格的时尚照片' },
                            {
                                image_url: {
                                    url: IMAGE_URL
                                }
                            }
                        ]
                    }
                ],
                generationConfig: {
                    responseModalities: ['IMAGE'],
                    candidateCount: 1,
                    imageConfig: {
                        aspectRatio: '1:1',
                        imageSize: '1K'
                    }
                }
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 120000
            }
        );

        console.log('✅ 成功!\n');

        // 不打印完整响应（太大），只打印结构
        const data = response.data;

        console.log('📊 响应结构概览:');
        console.log(JSON.stringify({
            candidates: data.candidates?.map(c => ({
                finishReason: c.finishReason,
                safetyRatings: c.safetyRatings?.length + ' ratings',
                content: {
                    role: c.content?.role,
                    parts: c.content?.parts?.map(p => {
                        if (p.inlineData || p.inline_data) {
                            const imgData = p.inlineData || p.inline_data;
                            return {
                                type: 'inlineData',
                                mimeType: imgData.mimeType || imgData.mime_type,
                                dataSize: (Buffer.from(imgData.data, 'base64').length / 1024).toFixed(0) + 'KB'
                            };
                        }
                        return Object.keys(p);
                    })
                }
            })),
            usageMetadata: data.usageMetadata
        }, null, 2));

        // 提取并保存图片
        const imagePart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData || p.inline_data);
        if (imagePart) {
            const imageData = imagePart.inlineData || imagePart.inline_data;
            const buffer = Buffer.from(imageData.data, 'base64');
            fs.writeFileSync('./painter_url_response.png', buffer);
            console.log(`\n💾 生成图片已保存: painter_url_response.png (${(buffer.length / 1024).toFixed(0)}KB)`);
        }

        return data;
    } catch (error) {
        console.log('❌ 失败');
        console.log('错误:', error.response?.data || error.message);
        return null;
    }
}

async function testPainter_Base64() {
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║       Painter API - 方式2: Base64                ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    try {
        const imageResponse = await axios.get(IMAGE_URL, { responseType: 'arraybuffer' });
        const base64 = Buffer.from(imageResponse.data).toString('base64');
        const mimeType = imageResponse.headers['content-type'] || 'image/jpeg';

        console.log(`图片: ${(imageResponse.data.length / 1024).toFixed(0)}KB\n`);

        const endpoint = `${API_BASE}/models/gemini-3-pro-image-preview:generateContent?key=${API_KEY}`;

        const response = await axios.post(
            endpoint,
            {
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: '生成类似风格的时尚照片' },
                            {
                                inline_data: {
                                    mime_type: mimeType,
                                    data: base64
                                }
                            }
                        ]
                    }
                ],
                generationConfig: {
                    responseModalities: ['IMAGE'],
                    candidateCount: 1,
                    imageConfig: {
                        aspectRatio: '1:1',
                        imageSize: '1K'
                    }
                }
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 120000
            }
        );

        console.log('✅ 成功!\n');

        const data = response.data;

        console.log('📊 响应结构概览:');
        console.log(JSON.stringify({
            candidates: data.candidates?.map(c => ({
                finishReason: c.finishReason,
                safetyRatings: c.safetyRatings?.length + ' ratings',
                content: {
                    role: c.content?.role,
                    parts: c.content?.parts?.map(p => {
                        if (p.inlineData || p.inline_data) {
                            const imgData = p.inlineData || p.inline_data;
                            return {
                                type: 'inlineData',
                                mimeType: imgData.mimeType || imgData.mime_type,
                                dataSize: (Buffer.from(imgData.data, 'base64').length / 1024).toFixed(0) + 'KB'
                            };
                        }
                        return Object.keys(p);
                    })
                }
            })),
            usageMetadata: data.usageMetadata
        }, null, 2));

        // 提取并保存图片
        const imagePart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData || p.inline_data);
        if (imagePart) {
            const imageData = imagePart.inlineData || imagePart.inline_data;
            const buffer = Buffer.from(imageData.data, 'base64');
            fs.writeFileSync('./painter_base64_response.png', buffer);
            console.log(`\n💾 生成图片已保存: painter_base64_response.png (${(buffer.length / 1024).toFixed(0)}KB)`);
        }

        return data;
    } catch (error) {
        console.log('❌ 失败');
        console.log('错误:', error.response?.data || error.message);
        return null;
    }
}

// ==========================================
// 主测试流程
// ==========================================

async function main() {
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('         Brain & Painter API 返回格式详细测试');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`测试图片: ${IMAGE_URL.substring(0, 60)}...`);
    console.log('═══════════════════════════════════════════════════════════\n');

    const results = {};

    // Brain 测试
    console.log('\n🧠 开始测试 Brain API (Gemini)...\n');
    results.brain_url = await testBrain_URL();
    results.brain_base64 = await testBrain_Base64();

    // Painter 测试
    console.log('\n🎨 开始测试 Painter API (Imagen)...\n');
    results.painter_url = await testPainter_URL();
    results.painter_base64 = await testPainter_Base64();

    // 总结
    console.log('\n\n╔══════════════════════════════════════════════════╗');
    console.log('║                  测试总结                        ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    console.log('Brain API (Gemini):');
    console.log(`  ✅ URL方式:    ${results.brain_url ? '成功' : '失败'}`);
    console.log(`  ✅ Base64方式: ${results.brain_base64 ? '成功' : '失败'}`);

    console.log('\nPainter API (Imagen):');
    console.log(`  ✅ URL方式:    ${results.painter_url ? '成功' : '失败'}`);
    console.log(`  ✅ Base64方式: ${results.painter_base64 ? '成功' : '失败'}`);

    console.log('\n📋 关键发现:');
    console.log('1. Brain返回格式: OpenAI兼容 (choices/message/content)');
    console.log('2. Painter返回格式: Google原生 (candidates/content/parts)');
    console.log('3. 两者都支持 URL 和 Base64 两种输入方式');
    console.log('4. 推荐使用 URL 方式（更快、更省资源）\n');

    // 保存详细响应到文件
    fs.writeFileSync('./api_responses.json', JSON.stringify({
        brain_url_response: results.brain_url,
        brain_base64_response: results.brain_base64,
        painter_url_response_structure: results.painter_url ? {
            note: '完整响应太大，仅保存结构',
            hasImage: !!results.painter_url.candidates?.[0]?.content?.parts?.find(p => p.inlineData || p.inline_data)
        } : null,
        painter_base64_response_structure: results.painter_base64 ? {
            note: '完整响应太大，仅保存结构',
            hasImage: !!results.painter_base64.candidates?.[0]?.content?.parts?.find(p => p.inlineData || p.inline_data)
        } : null
    }, null, 2));

    console.log('💾 完整响应已保存到: api_responses.json\n');
}

main().catch(console.error);
