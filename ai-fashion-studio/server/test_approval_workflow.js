const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:5000';
const API_KEY = process.env.VECTOR_ENGINE_API_KEY;
if (!API_KEY) {
    console.error('Missing VECTOR_ENGINE_API_KEY env var');
    process.exit(1);
}

const GATEWAY = 'https://api.vectorengine.ai/v1';
const BRAIN_MODEL = 'gemini-3-pro-preview';
const PAINTER_MODEL = 'gemini-3-pro-image-preview';

const TEST_IMAGE = process.argv[2] || './uploads/1767539648965-465058879.jpg';

console.log('=== 后端两阶段Workflow测试 ===\n');
console.log('测试场景：');
console.log('1. 创建任务（autoApprove=false）');
console.log('2. 验证状态为 AWAITING_APPROVAL');
console.log('3. 调用 /approve API');
console.log('4. 验证开始渲染');
console.log('=' + '='.repeat(60) + '\n');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function pollTaskStatus(taskId, expectedStatus, maxWait = 120000) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
        try {
            const res = await axios.get(`${API_BASE}/tasks/${taskId}`);
            const task = res.data;
            console.log(`  [轮询] 状态: ${task.status}`);

            if (task.status === expectedStatus) {
                return task;
            }

            if (task.status === 'FAILED') {
                console.error(`\n❌ 任务失败:`, task.error);
                throw new Error('Task failed: ' + task.error);
            }

            await sleep(2000);
        } catch (err) {
            if (err.response?.status === 404) {
                // Task not found yet, keep waiting
                await sleep(1000);
                continue;
            }
            throw err;
        }
    }
    throw new Error(`Timeout waiting for status: ${expectedStatus}`);
}

async function createMultipartRequest(imagePath) {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const imageBuffer = fs.readFileSync(imagePath);
    const imageFilename = path.basename(imagePath);

    const parts = [];

    // Add file field
    parts.push(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="files"; filename="${imageFilename}"\r\n` +
        `Content-Type: image/jpeg\r\n\r\n`
    );
    parts.push(imageBuffer);
    parts.push('\r\n');

    // Add form fields
    const fields = {
        requirements: '专业时尚街拍',
        shot_count: '3',
        layout_mode: 'Individual',
        scene: 'Street',
        resolution: '2K',
        autoApprove: 'false'
    };

    for (const [key, value] of Object.entries(fields)) {
        parts.push(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
            `${value}\r\n`
        );
    }

    parts.push(`--${boundary}--\r\n`);

    // Combine all parts
    const buffers = parts.map(part =>
        Buffer.isBuffer(part) ? part : Buffer.from(part, 'utf8')
    );
    const body = Buffer.concat(buffers);

    return { body, boundary };
}

async function runTest() {
    let taskId;

    try {
        // Step 1: 创建任务（手动模式）
        console.log('📝 Step 1: 创建任务 (autoApprove=false)...');

        const { body, boundary } = await createMultipartRequest(TEST_IMAGE);

        const createRes = await axios.post(`${API_BASE}/tasks`, body, {
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'x-brain-gateway': GATEWAY,
                'x-brain-key': API_KEY,
                'x-brain-model': BRAIN_MODEL,
                'x-painter-gateway': GATEWAY,
                'x-painter-key': API_KEY,
                'x-painter-model': PAINTER_MODEL
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        });

        taskId = createRes.data.id;
        console.log(`✅ 任务创建成功: ${taskId}`);
        console.log(`   autoApprove: ${createRes.data.autoApprove}\n`);

        // Step 2: 等待 Brain 分析完成
        console.log('🧠 Step 2: 等待 Brain 分析完成...');
        const awaitingTask = await pollTaskStatus(taskId, 'AWAITING_APPROVAL', 180000);

        console.log(`\n✅ Brain 分析完成，状态: ${awaitingTask.status}`);
        console.log(`   思考过程: ${awaitingTask.brainPlan?.thinkingProcess ? '有' : '无'}`);
        console.log(`   生成镜头数: ${awaitingTask.brainPlan?.shots?.length || 0}`);

        // 显示生成的提示词
        if (awaitingTask.brainPlan?.shots) {
            console.log('\n📸 生成的提示词:');
            awaitingTask.brainPlan.shots.forEach((shot, i) => {
                const prompt = shot.prompt || shot.prompt_en || 'N/A';
                console.log(`  Shot ${i + 1}: ${prompt.substring(0, 70)}...`);
            });
        }

        // Step 3: 批准并开始生图
        console.log('\n✅ Step 3: 批准任务并开始生图...');

        const approveRes = await axios.post(`${API_BASE}/tasks/${taskId}/approve`, {});
        console.log(`✅ 批准API响应:`, approveRes.data);

        // Step 4: 验证渲染开始
        console.log('\n🎨 Step 4: 验证 Painter 开始渲染...');
        await sleep(3000);

        const renderingTask = await axios.get(`${API_BASE}/tasks/${taskId}`);
        console.log(`   当前状态: ${renderingTask.data.status}`);

        if (renderingTask.data.status === 'RENDERING' || renderingTask.data.status === 'COMPLETED') {
            console.log('✅ Painter 已开始渲染\n');
        } else {
            console.warn(`⚠️  状态异常: ${renderingTask.data.status}\n`);
        }

        console.log('='.repeat(62));
        console.log('✅ 两阶段Workflow后端测试成功！');
        console.log('='.repeat(62));
        console.log(`\n任务ID: ${taskId}`);
        console.log(`访问: http://localhost:3000/tasks/${taskId}\n`);

    } catch (error) {
        console.error('\n' + '='.repeat(62));
        console.error('❌ 测试失败');
        console.error('='.repeat(62));
        if (error.response) {
            console.error('状态码:', error.response.status);
            console.error('响应:', error.response.data);
        } else {
            console.error('错误:', error.message);
        }
        if (taskId) {
            console.error(`任务ID: ${taskId}`);
        }
        process.exit(1);
    }
}

runTest();
