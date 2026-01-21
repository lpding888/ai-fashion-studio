declare module 'cos-js-sdk-v5' {
    type CosAuthorizationData = {
        TmpSecretId?: string;
        TmpSecretKey?: string;
        SecurityToken?: string;
        StartTime?: number;
        ExpiredTime?: number;
        ScopeLimit?: boolean;
        error?: Error;
    };

    interface COSOptions {
        getAuthorization: (options: Record<string, unknown>, callback: (data: CosAuthorizationData) => void) => void;
        [key: string]: unknown;
    }

    interface UploadFileOptions {
        Bucket: string;
        Region: string;
        Key: string;
        Body: File | Blob | string;
        SliceSize?: number;
        onProgress?: (progressData: { percent: number }) => void;
        [key: string]: unknown;
    }

    interface HeadObjectOptions {
        Bucket: string;
        Region: string;
        Key: string;
        [key: string]: unknown;
    }

    export default class COS {
        constructor(options: COSOptions);
        uploadFile(options: UploadFileOptions, callback: (err: Error | null, data: Record<string, unknown>) => void): void;
        headObject(options: HeadObjectOptions, callback: (err: unknown, data: Record<string, unknown>) => void): void;
    }
}
