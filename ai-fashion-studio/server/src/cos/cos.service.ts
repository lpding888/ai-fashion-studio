import { Injectable, Logger } from '@nestjs/common';
import STS from 'qcloud-cos-sts';
import COS from 'cos-nodejs-sdk-v5';

@Injectable()
export class CosService {
    private logger = new Logger(CosService.name);
    private cos: COS;

    private getAppIdFromBucketName(bucket: string) {
        const match = bucket.match(/-(\d+)$/);
        return match?.[1];
    }

    constructor() {
        // 只在配置了密钥时初始化COS客户端
        if (process.env.TENCENT_SECRET_ID && process.env.TENCENT_SECRET_KEY) {
            this.cos = new COS({
                SecretId: process.env.TENCENT_SECRET_ID,
                SecretKey: process.env.TENCENT_SECRET_KEY
            });
            this.logger.log('COS客户端初始化成功');
        } else {
            this.logger.warn('未配置腾讯云密钥，COS功能禁用');
        }
    }

    /**
     * 生成临时密钥（供前端直传使用）
     */
    async getUploadCredentials(userId?: string) {
        if (!this.cos) {
            console.error('COS not initialized');
            throw new Error('COS未配置，请在.env.local中设置TENCENT_SECRET_ID和TENCENT_SECRET_KEY');
        }

        const bucket = process.env.COS_BUCKET!;
        const region = process.env.COS_REGION!;

        const appId = this.getAppIdFromBucketName(bucket);
        if (!appId) {
            throw new Error(`无法从Bucket名称解析AppId: ${bucket}（期望形如 xxx-<AppId>）`);
        }

        const folder = userId ? `uploads/user/${userId}` : 'uploads/anon';
        const allowPrefix = `${folder}/*`;
        const uploadAcl = (process.env.COS_UPLOAD_ACL || '').trim() || undefined;

        // 定义权限策略（只允许上传到指定路径）
        const actions: string[] = [
            'name/cos:PutObject',
            'name/cos:HeadObject',
            'name/cos:InitiateMultipartUpload',
            'name/cos:UploadPart',
            'name/cos:CompleteMultipartUpload',
            'name/cos:AbortMultipartUpload',
            'name/cos:ListMultipartUploadParts',
            'name/cos:ListMultipartUploads'
        ];

        if (uploadAcl) {
            actions.push('name/cos:PutObjectAcl');
        }

        const policy = {
            version: '2.0',
            statement: [{
                effect: 'allow',
                action: actions,
                resource: [
                    `qcs::cos:${region}:uid/${appId}:${bucket}/${allowPrefix}`
                ]
            }]
        };

        return new Promise((resolve, reject) => {
            STS.getCredential({
                secretId: process.env.TENCENT_SECRET_ID!,
                secretKey: process.env.TENCENT_SECRET_KEY!,
                policy: policy,
                durationSeconds: 600, // 10分钟有效期（降低泄露/滥用风险）
                region: region
            }, (err, stsResponse: any) => {
                if (err) {
                    this.logger.error('获取临时密钥失败', err);
                    reject(err);
                } else {
                    this.logger.log(`生成临时密钥成功，允许路径: ${allowPrefix}`);
                    resolve({
                        credentials: stsResponse.credentials,
                        startTime: stsResponse.startTime,
                        expiredTime: stsResponse.expiredTime,
                        bucket: bucket,
                        region: region,
                        allowPrefix: allowPrefix,
                        uploadAcl: uploadAcl
                    });
                }
            });
        });
    }

    /**
     * 生成带数据万象处理参数的URL
     */
    getImageUrl(key: string, options?: {
        format?: 'webp' | 'avif' | 'heif';
        quality?: number;
        width?: number;
    }): string {
        const bucket = process.env.COS_BUCKET!;
        const region = process.env.COS_REGION!;
        const cdnDomain = process.env.COS_CDN_DOMAIN;

        // 基础URL（优先使用CDN域名）
        let baseUrl = cdnDomain
            ? `https://${cdnDomain}/${key}`
            : `https://${bucket}.cos.${region}.myqcloud.com/${key}`;

        // 如果不需要处理，直接返回
        if (!options) return baseUrl;

        // 构建数据万象处理参数
        const params: string[] = [];

        // 格式转换
        if (options.format) {
            params.push(`imageMogr2/format/${options.format}`);
        }

        // 质量压缩
        if (options.quality) {
            params.push(`quality/${options.quality}`);
        }

        // 宽度缩放（保持宽高比）
        if (options.width) {
            params.push(`thumbnail/${options.width}x`);
        }

        return params.length > 0
            ? `${baseUrl}?${params.join('|')}`
            : baseUrl;
    }

    /**
     * 获取智能压缩的WebP格式URL
     * 推荐用于AI API调用（减少传输体积）
     */
    getOptimizedUrl(key: string): string {
        return this.getImageUrl(key, {
            format: 'webp',
            quality: 85,
            width: 1920  // 限制最大宽度
        });
    }

    /**
     * 验证URL是否来自COS
     */
    isValidCosUrl(url: string): boolean {
        const bucket = process.env.COS_BUCKET;
        const region = process.env.COS_REGION;
        const cdnDomain = process.env.COS_CDN_DOMAIN;

        if (!bucket || !region) return false;

        const validDomains = [
            `${bucket}.cos.${region}.myqcloud.com`,
            cdnDomain
        ].filter(Boolean);

        return validDomains.some(domain => url.includes(domain!));
    }

    /**
     * 上传文件到COS
     * @param key COS上的文件路径
     * @param filePath 本地文件路径
     */
    async uploadFile(key: string, filePath: string): Promise<COS.PutObjectResult> {
        if (!this.cos) {
            throw new Error('COS未配置，无法上传文件');
        }

        const bucket = process.env.COS_BUCKET!;
        const region = process.env.COS_REGION!;

        return new Promise((resolve, reject) => {
            // 读取文件内容
            const fileStream = require('fs').createReadStream(filePath);

            this.cos.putObject({
                Bucket: bucket,
                Region: region,
                Key: key,
                Body: fileStream,
            }, (err, data) => {
                if (err) {
                    this.logger.error(`上传文件失败: ${key}`, err);
                    reject(err);
                } else {
                    this.logger.log(`文件上传成功: ${key}`);
                    resolve(data);
                }
            });
        });
    }

    /**
     * 检查COS服务是否已启用（即是否配置了密钥）
     */
    isEnabled(): boolean {
        return !!this.cos;
    }
}
