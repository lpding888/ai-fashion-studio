
import axios, { AxiosHeaders } from 'axios';

// 支持环境变量切换后端地址
// NEXT_PUBLIC_API_URL=http://localhost:3001  (本地 NestJS 默认端口)
export const BACKEND_ORIGIN = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
const baseURL = `${BACKEND_ORIGIN}/api`;

console.log(`🔗 API Backend: ${baseURL}`);

const api = axios.create({
    baseURL,
});

api.interceptors.request.use((config) => {
    if (typeof window === 'undefined') return config;

    const tokenFromStorage = localStorage.getItem('token');
    const tokenFromCookie = document.cookie
        .split('; ')
        .find((row) => row.startsWith('token='))
        ?.split('=')[1];
    const token = tokenFromStorage || (tokenFromCookie ? decodeURIComponent(tokenFromCookie) : null);

    if (token) {
        const headers = AxiosHeaders.from(config.headers);
        headers.set('Authorization', `Bearer ${token}`);
        config.headers = headers;
    }

    return config;
});


export const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/upload', formData);
    return response.data;
};

export const learnStyle = async (files: File | File[]) => {
    const formData = new FormData();
    const fileArray = Array.isArray(files) ? files : [files];

    fileArray.forEach(file => {
        formData.append('images', file);
    });

    const response = await api.post('/style-presets/learn', formData);
    return response.data;
};

export const relearnStylePreset = async (presetId: string) => {
    const response = await api.post(`/style-presets/${presetId}/relearn`, {});
    return response.data;
};

export const learnPose = async (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    const response = await api.post('/pose-presets/learn', formData);
    return response.data;
};

export const createDirectTask = async (args: {
    garmentImages: File[];
    prompt: string;
    resolution?: '1K' | '2K' | '4K';
    aspectRatio?: '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '21:9';
    stylePresetIds?: string[];
    posePresetIds?: string[];
    facePresetIds?: string[];
    includeThoughts?: boolean;
    seed?: number;
    temperature?: number;
}) => {
    const formData = new FormData();
    for (const f of args.garmentImages) {
        formData.append('garment_images', f);
    }
    formData.append('prompt', args.prompt);
    if (args.resolution) formData.append('resolution', args.resolution);
    if (args.aspectRatio) formData.append('aspectRatio', args.aspectRatio);
    if (args.stylePresetIds?.length) formData.append('style_preset_ids', args.stylePresetIds.join(','));
    if (args.posePresetIds?.length) formData.append('pose_preset_ids', args.posePresetIds.join(','));
    if (args.facePresetIds?.length) formData.append('face_preset_ids', args.facePresetIds.join(','));
    if (typeof args.includeThoughts === 'boolean') formData.append('includeThoughts', String(args.includeThoughts));
    if (typeof args.seed === 'number') formData.append('seed', String(args.seed));
    if (typeof args.temperature === 'number') formData.append('temperature', String(args.temperature));

    const response = await api.post('/tasks/direct', formData);
    return response.data;
};

export const createDirectTaskFromUrls = async (args: {
    garmentUrls: string[];
    prompt: string;
    resolution?: '1K' | '2K' | '4K';
    aspectRatio?: '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '21:9';
    stylePresetIds?: string[];
    posePresetIds?: string[];
    facePresetIds?: string[];
    includeThoughts?: boolean;
    seed?: number;
    temperature?: number;
}) => {
    const payload = {
        prompt: args.prompt,
        garmentUrls: args.garmentUrls,
        ...(args.resolution ? { resolution: args.resolution } : {}),
        ...(args.aspectRatio ? { aspectRatio: args.aspectRatio } : {}),
        ...(args.stylePresetIds ? { stylePresetIds: args.stylePresetIds } : {}),
        ...(args.posePresetIds ? { posePresetIds: args.posePresetIds } : {}),
        ...(args.facePresetIds ? { facePresetIds: args.facePresetIds } : {}),
        ...(typeof args.includeThoughts === 'boolean' ? { includeThoughts: args.includeThoughts } : {}),
        ...(typeof args.seed === 'number' ? { seed: args.seed } : {}),
        ...(typeof args.temperature === 'number' ? { temperature: args.temperature } : {}),
    };

    const response = await api.post('/tasks/direct-urls', payload, {
        headers: { 'Content-Type': 'application/json' },
    });
    return response.data;
};

export const directRegenerateTask = async (taskId: string) => {
    const response = await api.post(`/tasks/${taskId}/direct-regenerate`, {});
    return response.data;
};

export const directMessageTask = async (taskId: string, message: string) => {
    const response = await api.post(`/tasks/${taskId}/direct-message`, { message });
    return response.data;
};

export const createStylePreset = async (data: {
    name: string;
    description?: string;
    tags?: string[];
    styleHint?: string;
    analysis?: any;
    images: File[];
}) => {
    const formData = new FormData();
    formData.append('name', data.name);
    if (data.description) formData.append('description', data.description);
    if (data.tags) formData.append('tags', JSON.stringify(data.tags));
    if (data.styleHint) formData.append('styleHint', data.styleHint);
    if (data.analysis) formData.append('analysis', JSON.stringify(data.analysis));

    data.images.forEach((file) => {
        formData.append('images', file);
    });

    const response = await api.post('/style-presets', formData);
    return response.data;
};

export default api;
