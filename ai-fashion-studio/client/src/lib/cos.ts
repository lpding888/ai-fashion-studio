import COS from 'cos-js-sdk-v5';
import api from '@/lib/api';

// 单例模式，避免重复初始化
let cosInstance: COS | null = null;

type CosCredentialsResponse = {
    credentials: {
        tmpSecretId?: string;
        tmpSecretKey?: string;
        sessionToken?: string;
        sessionAccessKeyId?: string;
        sessionSecretAccessKey?: string;
    };
    startTime?: number;
    expiredTime: number;
    bucket: string;
    region: string;
    allowPrefix: string;
    uploadAcl?: string;
};

let cachedCreds: CosCredentialsResponse | null = null;
let cachedCredsExpireAtMs = 0;

const normalizeAllowPrefixToFolder = (allowPrefix: string) => {
    const cleaned = allowPrefix.trim();
    if (!cleaned) return 'uploads/user';
    return cleaned.endsWith('/*') ? cleaned.slice(0, -2) : cleaned.replace(/\/+$/, '');
};

const fetchCosCredentials = async () => {
    const now = Date.now();
    if (cachedCreds && cachedCredsExpireAtMs - now > 60_000) {
        return cachedCreds;
    }

    const res = await api.post('/cos/credentials', {});
    const data = res.data as CosCredentialsResponse;

    if (!data || !data.credentials || !data.bucket || !data.region || !data.expiredTime || !data.allowPrefix) {
        throw new Error(`COS credentials 响应格式错误: ${JSON.stringify(data)}`);
    }

    cachedCreds = data;
    cachedCredsExpireAtMs = data.expiredTime * 1000;
    return data;
};

export const getCosInstance = () => {
    if (!cosInstance) {
        cosInstance = new COS({
            //获取签名/临时密钥
            getAuthorization: async (_options, callback) => {
                try {
                    // 调用后端临时密钥接口
                    const data = await fetchCosCredentials();
                    const credentials = data.credentials;

                    callback({
                        TmpSecretId: credentials.tmpSecretId || credentials.sessionAccessKeyId,
                        TmpSecretKey: credentials.tmpSecretKey || credentials.sessionSecretAccessKey,
                        SecurityToken: credentials.sessionToken,
                        // 建议返回服务器时间作为签名的开始时间，避免用户浏览器本地时间偏差过大导致签名错误
                        StartTime: data.startTime,
                        ExpiredTime: data.expiredTime,
                        ScopeLimit: true, // 设为 true，则 SDK 会限制签名的 Scope (仅上传当前文件)
                    });
                } catch (error) {
                    console.error('Failed to get COS credentials', error);
                    // 返回错误
                    callback({ error: error as Error });
                }
            }
        });
    }
    return cosInstance;
};

/**
 * 上传单个文件
 */
export const uploadFileToCos = async (file: File, onProgress?: (progress: number) => void): Promise<string> => {
    const creds = await fetchCosCredentials();
    const cos = getCosInstance();

    // 生成唯一文件名
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    // 简单处理文件扩展名
    const ext = file.name.split('.').pop() || 'png';
    const folder = normalizeAllowPrefixToFolder(creds.allowPrefix);
    const key = `${folder}/${timestamp}-${randomStr}.${ext}`;

    const BUCKET = creds.bucket;
    const REGION = creds.region;

    return new Promise((resolve, reject) => {
        cos.uploadFile({
            Bucket: BUCKET,
            Region: REGION,
            Key: key,
            Body: file,
            ...(creds.uploadAcl ? { ACL: creds.uploadAcl } : {}),
            SliceSize: 1024 * 1024 * 5, // 大于5M使用分片上传
            onProgress: function (progressData) {
                if (onProgress) {
                    onProgress(progressData.percent);
                }
            }
        }, function (err, _data) {
            if (err) {
                console.error('COS Upload Error:', err);
                reject(err);
            } else {
                // 返回完整的 URL
                // 格式: https://<Bucket>.cos.<Region>.myqcloud.com/<Key>
                const url = `https://${BUCKET}.cos.${REGION}.myqcloud.com/${key}`;
                resolve(url);
            }
        });
    });
};
