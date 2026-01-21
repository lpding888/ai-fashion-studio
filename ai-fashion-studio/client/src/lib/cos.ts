import COS from 'cos-js-sdk-v5';
import api from '@/lib/api';

// 单例模式，避免重复初始化
let cosInstance: COS | null = null;

const inMemoryUrlCache = new Map<string, string>(); // sha256Hex -> url

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

const sha256HexFromFile = async (file: File): Promise<string> => {
    if (typeof window === 'undefined' || !window.crypto?.subtle) {
        throw new Error('当前环境不支持 WebCrypto，无法计算文件哈希');
    }

    const buf = await file.arrayBuffer();
    const hashBuf = await window.crypto.subtle.digest('SHA-256', buf);
    const hashArr = Array.from(new Uint8Array(hashBuf));
    return hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
};

const headObjectExists = async (cos: COS, bucket: string, region: string, key: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        cos.headObject(
            { Bucket: bucket, Region: region, Key: key },
            (err) => {
                if (!err) return resolve(true);

                const errInfo = err as { statusCode?: number; code?: string };
                const status = errInfo?.statusCode;
                const code = errInfo?.code;
                if (status === 404 || code === 'NoSuchKey' || code === 'NotFound') {
                    return resolve(false);
                }

                return reject(err);
            }
        );
    });
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

export type CosUploadResult = {
    url: string;
    sha256: string;
    key: string;
    fileName: string;
    size: number;
    mimeType: string;
};

const uploadFileToCosInternal = async (file: File, onProgress?: (progress: number) => void): Promise<CosUploadResult> => {
    const creds = await fetchCosCredentials();
    const cos = getCosInstance();

    const sha256 = await sha256HexFromFile(file);
    const extByMime: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
    };
    const extFromName = (file.name.split('.').pop() || '').toLowerCase();
    const ext = extByMime[file.type] || extFromName || 'png';
    const folder = normalizeAllowPrefixToFolder(creds.allowPrefix);

    // ✅ 去重缓存：同一用户、同一图片内容（SHA-256）复用同一个 COS Key
    // 这样“用户重复上传同一张图”会变成一次 HEAD（小流量）+ 直接复用 URL
    const key = `${folder}/by-hash/${sha256}.${ext}`;
    const cachedUrl = inMemoryUrlCache.get(sha256);
    if (cachedUrl) {
        return {
            url: cachedUrl,
            sha256,
            key,
            fileName: file.name,
            size: file.size,
            mimeType: file.type,
        };
    }

    const BUCKET = creds.bucket;
    const REGION = creds.region;

    // 先 HEAD 检查对象是否已存在（存在则不重复上传）
    const exists = await headObjectExists(cos, BUCKET, REGION, key);
    if (exists) {
        const url = `https://${BUCKET}.cos.${REGION}.myqcloud.com/${key}`;
        inMemoryUrlCache.set(sha256, url);
        return {
            url,
            sha256,
            key,
            fileName: file.name,
            size: file.size,
            mimeType: file.type,
        };
    }

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
        }, function (err) {
            if (err) {
                console.error('COS Upload Error:', err);
                reject(err);
            } else {
                // 返回完整的 URL
                // 格式: https://<Bucket>.cos.<Region>.myqcloud.com/<Key>
                const url = `https://${BUCKET}.cos.${REGION}.myqcloud.com/${key}`;
                inMemoryUrlCache.set(sha256, url);
                resolve({
                    url,
                    sha256,
                    key,
                    fileName: file.name,
                    size: file.size,
                    mimeType: file.type,
                });
            }
        });
    });
};

/**
 * 上传单个文件
 */
export const uploadFileToCos = async (file: File, onProgress?: (progress: number) => void): Promise<string> => {
    const result = await uploadFileToCosInternal(file, onProgress);
    return result.url;
};

export const uploadFileToCosWithMeta = async (
    file: File,
    onProgress?: (progress: number) => void
): Promise<CosUploadResult> => {
    return uploadFileToCosInternal(file, onProgress);
};
