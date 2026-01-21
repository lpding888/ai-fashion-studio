import { useState } from 'react';
import { uploadFileToCosWithMeta } from '@/lib/cos';
import { registerUserAssets } from '@/lib/user-assets';

interface UseCosUploadReturn {
    isUploading: boolean;
    progress: number;
    uploadFiles: (files: File[]) => Promise<string[]>;
    error: Error | null;
}

export function useCosUpload(): UseCosUploadReturn {
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<Error | null>(null);

    const uploadFiles = async (files: File[]) => {
        if (!files || files.length === 0) return [];

        setIsUploading(true);
        setProgress(0);
        setError(null);

        try {
            // 使用 Promise.all 并行上传
            const uploadPromises = files.map(async (file) => {
                // 这里简化处理，不追踪每个文件的详细进度，只追踪完成数量
                // 如果需要更精确的进度条，需要维护一个进度数组
                return uploadFileToCosWithMeta(file);
            });

            // 监听进度 - 这种方式比较粗略，每完成一个文件更新一次
            let completedCount = 0;
            const total = files.length;

            // 包装 promise 以追踪完成
            // 注意：Promise.all 会等待所有，但我们想在单独完成时更新进度
            const trackedPromises = uploadPromises.map(p => p.then(res => {
                completedCount++;
                setProgress(Math.round((completedCount / total) * 100));
                return res;
            }));

            const results = await Promise.all(trackedPromises);
            const urls = results.map((res) => res.url);
            try {
                await registerUserAssets(results.map((res) => ({
                    url: res.url,
                    sha256: res.sha256,
                    cosKey: res.key,
                    fileName: res.fileName,
                    size: res.size,
                    mimeType: res.mimeType,
                })));
            } catch (err) {
                console.warn('Register user assets failed:', err);
            }
            return urls;

        } catch (err) {
            console.error('Upload failed:', err);
            const errorObj = err instanceof Error ? err : new Error('Upload failed');
            setError(errorObj);
            throw errorObj;
        } finally {
            setIsUploading(false);
        }
    };

    return { isUploading, progress, uploadFiles, error };
}
