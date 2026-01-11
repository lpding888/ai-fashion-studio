/**
 * 测试 Painter (Imagen) API 图片输入方式
 * 测试直接发送URL vs Base64
 */

const axios = require('axios');
const fs = require('fs');

const API_BASE = 'https://api.vectorengine.ai/v1';
const API_KEY = process.env.VECTOR_ENGINE_API_KEY;
if (!API_KEY) {
    console.error('Missing VECTOR_ENGINE_API_KEY env var');
    process.exit(1);
}

const MODEL = 'gemini-3-pro-image-preview';  // ✅ 正确的Painter模型名
const IMAGE_URL = 'https://ai-photo-prod-1379020062.cos.ap-guangzhou.myqcloud.com/mmexport1686641643361.jpg';

async function test1_ImageURL() {
    console.log('\n========================================');
    console.log('测试1: Painter - 直接发送图片URL');
    console.log('========================================\n');

    try {
        const endpoint = `${API_BASE}/models/${MODEL}:generateContent?key=${API_KEY}`;

        const response = await axios.post(
            endpoint,
            {
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: '生成一张类似风格的时尚模特照片' },
                            {
                                // 尝试 image_url 格式
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
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 120000
            }
        );

        console.log('✅ 方式1成功！\n');

        // 检查返回
        const candidate = response.data.candidates?.[0];
        if (candidate) {
            console.log('返回数据结构:', {
                hasParts: !!candidate.content?.parts,
                partsCount: candidate.content?.parts?.length,
                partTypes: candidate.content?.parts?.map(p => Object.keys(p))
            });

            // 查找图片数据
            const imagePart = candidate.content?.parts?.find(p => p.inline_data || p.inlineData);
            if (imagePart) {
                console.log('✅ 成功生成图片');
                const imageData = imagePart.inline_data || imagePart.inlineData;
                const buffer = Buffer.from(imageData.data, 'base64');
                fs.writeFileSync('./test_painter_url_result.png', buffer);
                console.log(`图片已保存: test_painter_url_result.png (${(buffer.length / 1024).toFixed(0)}KB)`);
            }
        }

        return true;
    } catch (error) {
        console.log('❌ 方式1失败！\n');
        if (error.response) {
            console.log('错误状态:', error.response.status);
            console.log('错误详情:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.log('错误:', error.message);
        }
        return false;
    }
}

async function test2_InlineData() {
    console.log('\n========================================');
    console.log('测试2: Painter - inline_data (Base64)');
    console.log('========================================\n');

    try {
        // 下载图片
        console.log('正在下载图片...');
        const imageResponse = await axios.get(IMAGE_URL, {
            responseType: 'arraybuffer'
        });

        const base64 = Buffer.from(imageResponse.data).toString('base64');
        const mimeType = imageResponse.headers['content-type'] || 'image/jpeg';

        console.log(`图片大小: ${(imageResponse.data.length / 1024).toFixed(0)}KB`);
        console.log(`MIME类型: ${mimeType}\n`);

        const endpoint = `${API_BASE}/models/${MODEL}:generateContent?key=${API_KEY}`;

        const response = await axios.post(
            endpoint,
            {
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: '生成一张类似风格的时尚模特照片' },
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
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 120000
            }
        );

        console.log('✅ 方式2成功！\n');

        // 检查返回
        const candidate = response.data.candidates?.[0];
        if (candidate) {
            // 查找图片数据
            const imagePart = candidate.content?.parts?.find(p => p.inline_data || p.inlineData);
            if (imagePart) {
                console.log('✅ 成功生成图片');
                const imageData = imagePart.inline_data || imagePart.inlineData;
                const buffer = Buffer.from(imageData.data, 'base64');
                fs.writeFileSync('./test_painter_base64_result.png', buffer);
                console.log(`图片已保存: test_painter_base64_result.png (${(buffer.length / 1024).toFixed(0)}KB)`);
            }
        }

        return true;
    } catch (error) {
        console.log('❌ 方式2失败！\n');
        if (error.response) {
            console.log('错误状态:', error.response.status);
            console.log('错误详情:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.log('错误:', error.message);
        }
        return false;
    }
}

async function main() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║   Painter API 图片输入方式测试         ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`\n模型: ${MODEL}`);
    console.log(`API站点: ${API_BASE}`);
    console.log(`测试图片: ${IMAGE_URL.substring(0, 80)}...`);

    const results = {
        '直接URL (image_url)': await test1_ImageURL(),
        'Base64 (inline_data)': await test2_InlineData()
    };

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║              测试结果汇总              ║');
    console.log('╚════════════════════════════════════════╝\n');

    Object.entries(results).forEach(([name, success]) => {
        console.log(`${success ? '✅' : '❌'} ${name}`);
    });

    console.log('\n推荐方案:');
    if (results['直接URL (image_url)']) {
        console.log('🌟 Painter也支持直接URL！可以优化Painter Service');
    } else if (results['Base64 (inline_data)']) {
        console.log('⚠️ Painter只支持Base64，保持现状');
    } else {
        console.log('❌ 测试失败，请检查API配置');
    }
}

main().catch(console.error);
