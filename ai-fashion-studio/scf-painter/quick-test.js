/**
 * SCF Painter 快速测试脚本
 * 测试文生图功能（不需要参考图）
 */

require('dotenv').config({ path: '.env.local' });
const { main_handler } = require('./index');

async function quickTest() {
    console.log('🧪 开始测试 SCF Painter 单张生图功能...\n');

    // ✅ 单张模式 - 适配改造后的index.js
    const event = {
        body: JSON.stringify({
            referenceImageUrls: [],  // 空数组表示不使用参考图（文生图）
            prompt: 'A beautiful fashion model in urban setting, professional photography, 4K, cinematic lighting',  // 单个提示词
            shotId: 'test_shot_001',  // Shot ID（必需）
            config: {
                painterModel: 'gemini-3-pro-image-preview',  // ✅ 指定正确的模型
                painterParams: {
                    aspectRatio: '16:9',
                    imageSize: '1K'
                }
            }
        })
    };

    // 模拟SCF上下文对象
    const context = {
        request_id: 'test-' + Date.now(),
        function_name: 'painter-test',
        memory_limit_in_mb: 1024
    };

    try {
        console.log('📋 测试配置：');
        console.log(`  Painter API: ${process.env.PAINTER_API_URL}`);
        console.log(`  API Key: ${process.env.PAINTER_API_KEY ? '***已配置***' : '❌未配置'}`);
        console.log(`  COS Bucket: ${process.env.COS_BUCKET}`);
        console.log(`  COS Region: ${process.env.COS_REGION}\n`);

        console.log('⏳ 调用 SCF Painter（单张模式）...\n');

        const startTime = Date.now();
        const result = await main_handler(event, context);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log('\n✅ 测试成功！');
        console.log(`⏱️  耗时: ${duration}秒`);
        console.log('\n📊 返回结果：');
        const responseBody = JSON.parse(result.body);
        console.log(JSON.stringify(responseBody, null, 2));

        if (responseBody.success && responseBody.imageUrl) {
            console.log('\n🎨 生成的图片：');
            console.log(`  ${responseBody.imageUrl}`);
            console.log('\n💡 复制上面的URL到浏览器查看图片！');
        }

    } catch (error) {
        console.error('\n❌ 测试失败：', error.message);
        if (error.response) {
            console.error('API响应：', error.response.data);
        }
        console.error('\n完整错误：', error);
        process.exit(1);
    }
}

// 运行测试
quickTest().then(() => {
    console.log('\n✨ 测试完成！');
    process.exit(0);
}).catch(err => {
    console.error('\n💥 测试崩溃：', err);
    process.exit(1);
});
