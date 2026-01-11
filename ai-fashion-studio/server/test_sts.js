
const STS = require('qcloud-cos-sts');
const path = require('path');
const dotenv = require('dotenv');

// 加载 .env.local
dotenv.config({ path: path.join(__dirname, '.env.local') });

async function testSTS() {
    console.log('--- STS Standalone Test ---');
    console.log(`SecretId: ${process.env.TENCENT_SECRET_ID ? 'YES' : 'NO'}`);
    console.log(`SecretKey: ${process.env.TENCENT_SECRET_KEY ? 'YES' : 'NO'}`);
    console.log(`Bucket: ${process.env.COS_BUCKET}`);
    console.log(`Region: ${process.env.COS_REGION}`);

    const bucket = process.env.COS_BUCKET;
    const region = process.env.COS_REGION;

    // 模拟 CosService 策略
    const policy = {
        version: '2.0',
        statement: [{
            effect: 'allow',
            action: [
                'name/cos:PutObject',
                'name/cos:InitiateMultipartUpload',
                'name/cos:UploadPart',
                'name/cos:CompleteMultipartUpload'
            ],
            // resource: [`qcs::cos:${region}:uid/1379020062:${bucket}/*`]
            resource: ['*']
        }]
    };

    const config = {
        secretId: process.env.TENCENT_SECRET_ID,
        secretKey: process.env.TENCENT_SECRET_KEY,
        policy: policy,
        durationSeconds: 1800,
        region: region
    };

    console.log('Calling STS.getCredential...');

    STS.getCredential(config, (err, credential) => {
        if (err) {
            console.error('❌ STS Error:', err);
        } else {
            console.log('✅ STS Success!');
            console.log(JSON.stringify(credential, null, 2));
        }
    });
}

testSTS();
