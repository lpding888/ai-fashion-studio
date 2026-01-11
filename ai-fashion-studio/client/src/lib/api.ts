
import axios, { AxiosHeaders } from 'axios';

// 支持环境变量切换后端地址
// NEXT_PUBLIC_API_URL=http://localhost:5000  (NestJS 默认)
export const BACKEND_ORIGIN = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/+$/, '');
const baseURL = `${BACKEND_ORIGIN}/api`;

console.log(`🔗 API Backend: ${baseURL}`);

const api = axios.create({
    baseURL,
    headers: {
        'Content-Type': 'application/json',
    },
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
    const response = await api.post('/upload', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

export const learnStyle = async (files: File | File[]) => {
    const formData = new FormData();
    const fileArray = Array.isArray(files) ? files : [files];

    fileArray.forEach(file => {
        formData.append('images', file);
    });

    const response = await api.post('/style-presets/learn', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
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

    const response = await api.post('/style-presets', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
};

export default api;
