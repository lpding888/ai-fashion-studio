/**
 * 测试 Gemini API 图片输入方式
 * 方式1: 直接发送图片URL
 * 方式2: 下载后转Base64
 */

const axios = require('axios');

const API_BASE = 'https://api.vectorengine.ai/v1';
const API_KEY = process.env.VECTOR_ENGINE_API_KEY;
if (!API_KEY) {
    console.error('Missing VECTOR_ENGINE_API_KEY env var');
    process.exit(1);
}

const MODEL = 'gemini-3-pro-preview';
const IMAGE_URL = 'https://ai-photo-prod-1379020062.cos.ap-guangzhou.myqcloud.com/mmexport1686641643361.jpg?q-sign-algorithm=sha1&q-ak=AKIDrrG1X7_izCvZL-UqZKLzL2B4y4Q3ZXCD-9SKzjP_QPCK5CgDQXM0jOQIkfh8TwCa&q-sign-time=1767848047;1767851647&q-key-time=1767848047;1767851647&q-header-list=host&q-url-param-list=ci-process&q-signature=fe5ccf4690596cf9153aa2bcec2fd617ba0027be&x-cos-security-token=bo1lzStDdBavJemHrydppSBBGnbpZ3Qaa4566c20515f79904efc0197bf5f538dUKagMZ6T-zl11EgyvY8EP9n011zGe5LAh3VOrtYeY8TIKlY8O0UKDMQkJiazXs6tWxWWvzDJgMtdDvfWCgHZlGMfer_22_5WWUj_F3YHb4Eou_-kjPLAQmquzOWKtrHUW2k2BgxFgRsh4ifFdCZW3cDrPH4yTKDRZO0QT-rmM3rS3odbBJNFqbSRzJyQnMiE&ci-process=originImage';

async function test1_DirectURL() {
    console.log('\n========================================');
    console.log('测试1: 直接发送图片URL');
    console.log('========================================\n');

    try {
        const response = await axios.post(
            `${API_BASE}/chat/completions`,
            {
                model: MODEL,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: '请描述这张图片中的内容'
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: IMAGE_URL
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 500
            },
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ 方式1成功！\n');
        console.log('模型响应:', response.data.choices[0].message.content);
        console.log('\nToken使用:', {
            prompt: response.data.usage.prompt_tokens,
            completion: response.data.usage.completion_tokens,
            total: response.data.usage.total_tokens
        });

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

async function test2_Base64() {
    console.log('\n========================================');
    console.log('测试2: 下载图片转Base64');
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
        console.log(`MIME类型: ${mimeType}`);
        console.log(`Base64长度: ${base64.length}\n`);

        // 发送Base64
        const response = await axios.post(
            `${API_BASE}/chat/completions`,
            {
                model: MODEL,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: '请描述这张图片中的内容'
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:${mimeType};base64,${base64}`
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 500
            },
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ 方式2成功！\n');
        console.log('模型响应:', response.data.choices[0].message.content);
        console.log('\nToken使用:', {
            prompt: response.data.usage.prompt_tokens,
            completion: response.data.usage.completion_tokens,
            total: response.data.usage.total_tokens
        });

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

async function test3_GeminiNativeFormat() {
    console.log('\n========================================');
    console.log('测试3: Gemini原生格式 (inline_data)');
    console.log('========================================\n');

    try {
        // 下载图片
        console.log('正在下载图片...');
        const imageResponse = await axios.get(IMAGE_URL, {
            responseType: 'arraybuffer'
        });

        const base64 = Buffer.from(imageResponse.data).toString('base64');
        const mimeType = imageResponse.headers['content-type'] || 'image/jpeg';

        console.log(`图片大小: ${(imageResponse.data.length / 1024).toFixed(0)}KB\n`);

        // Gemini原生API格式
        const response = await axios.post(
            `${API_BASE}/v1beta/models/${MODEL}:generateContent`,
            {
                contents: [
                    {
                        parts: [
                            { text: '请描述这张图片中的内容' },
                            {
                                inline_data: {
                                    mime_type: mimeType,
                                    data: base64
                                }
                            }
                        ]
                    }
                ]
            },
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ 方式3成功！\n');
        console.log('模型响应:', response.data.candidates[0].content.parts[0].text);

        return true;
    } catch (error) {
        console.log('❌ 方式3失败！\n');
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
    console.log('║   Gemini API 图片输入方式测试          ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`\n模型: ${MODEL}`);
    console.log(`API站点: ${API_BASE}`);
    console.log(`测试图片: ${IMAGE_URL.substring(0, 80)}...`);

    const results = {
        '直接URL': await test1_DirectURL(),
        'Base64 (OpenAI格式)': await test2_Base64(),
        'inline_data (Gemini原生)': await test3_GeminiNativeFormat()
    };

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║              测试结果汇总              ║');
    console.log('╚════════════════════════════════════════╝\n');

    Object.entries(results).forEach(([name, success]) => {
        console.log(`${success ? '✅' : '❌'} ${name}`);
    });

    console.log('\n推荐方案:');
    if (results['直接URL']) {
        console.log('🌟 使用方式1: 直接发送COS URL (最快、最省资源)');
    } else if (results['Base64 (OpenAI格式)']) {
        console.log('🌟 使用方式2: 下载后转Base64 (OpenAI兼容格式)');
    } else if (results['inline_data (Gemini原生)']) {
        console.log('🌟 使用方式3: Gemini原生inline_data格式');
    } else {
        console.log('❌ 所有方式都失败了，请检查API配置');
    }
}

main().catch(console.error);
