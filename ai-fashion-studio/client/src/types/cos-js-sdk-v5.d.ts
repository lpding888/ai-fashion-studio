declare module 'cos-js-sdk-v5' {
    interface COSOptions {
        getAuthorization: (options: any, callback: (data: any) => void) => void;
        [key: string]: any;
    }

    interface UploadFileOptions {
        Bucket: string;
        Region: string;
        Key: string;
        Body: File | Blob | string;
        SliceSize?: number;
        onProgress?: (progressData: { percent: number }) => void;
        [key: string]: any;
    }

    interface HeadObjectOptions {
        Bucket: string;
        Region: string;
        Key: string;
        [key: string]: any;
    }

    export default class COS {
        constructor(options: COSOptions);
        uploadFile(options: UploadFileOptions, callback: (err: Error | null, data: any) => void): void;
        headObject(options: HeadObjectOptions, callback: (err: any, data: any) => void): void;
    }
}
