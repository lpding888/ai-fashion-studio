
import { create } from 'zustand';
import api from '@/lib/api';

export interface StylePreset {
    id: string;
    userId?: string;
    kind?: 'STYLE' | 'POSE';
    name: string;
    description?: string;
    imagePaths: string[];
    thumbnailPath?: string;
    tags?: string[];
    styleHint?: string;
    promptBlock?: string;
    createdAt: number;
}

interface StylePresetStore {
    presets: StylePreset[];
    loading: boolean;
    error: string | null;

    // Actions
    fetchPresets: () => Promise<void>;
    addPreset: (files: File[], name: string, description?: string, tags?: string[], styleHint?: string) => Promise<StylePreset>;
    updatePreset: (id: string, updates: { name?: string; description?: string; tags?: string[]; styleHint?: string }) => Promise<void>;
    deletePreset: (id: string) => Promise<void>;
    relearnPreset: (id: string) => Promise<StylePreset>;
}

export const useStylePresetStore = create<StylePresetStore>((set) => ({
    presets: [],
    loading: false,
    error: null,

    fetchPresets: async () => {
        set({ loading: true, error: null });
        try {
            const res = await api.get('/style-presets');
            set({ presets: res.data, loading: false });
        } catch (error) {
            console.error('Failed to fetch style presets:', error);
            set({ error: 'Failed to load style presets', loading: false });
        }
    },

    addPreset: async (files: File[], name: string, description?: string, tags?: string[], styleHint?: string) => {
        set({ loading: true, error: null });
        try {
            const formData = new FormData();
            // 添加多张图片
            files.forEach(file => {
                formData.append('images', file);
            });
            formData.append('name', name);
            if (description) formData.append('description', description);
            if (tags && tags.length > 0) formData.append('tags', JSON.stringify(tags));
            if (styleHint) formData.append('styleHint', styleHint);

            const res = await api.post('/style-presets', formData);

            const newPreset = res.data;
            set(state => ({
                presets: [...state.presets, newPreset],
                loading: false
            }));
            return newPreset;
        } catch (error) {
            console.error('Failed to add style preset:', error);
            set({ error: 'Failed to add style preset', loading: false });
            throw error;
        }
    },

    updatePreset: async (id: string, updates: { name?: string; description?: string; tags?: string[]; styleHint?: string }) => {
        try {
            interface UpdatePayload {
                name?: string;
                description?: string;
                tags?: string;  // JSON 字符串
                styleHint?: string;
            }

            const payload: UpdatePayload = {};
            if (updates.name !== undefined) payload.name = updates.name;
            if (updates.description !== undefined) payload.description = updates.description;
            if (updates.tags !== undefined) payload.tags = JSON.stringify(updates.tags);
            if (updates.styleHint !== undefined) payload.styleHint = updates.styleHint;

            const res = await api.patch(`/style-presets/${id}`, payload);
            set(state => ({
                presets: state.presets.map(p => p.id === id ? res.data : p)
            }));
        } catch (error) {
            console.error('Failed to update style preset:', error);
            set({ error: 'Failed to update style preset' });
            throw error;
        }
    },

    deletePreset: async (id: string) => {
        try {
            await api.delete(`/style-presets/${id}`);
            set(state => ({
                presets: state.presets.filter(p => p.id !== id)
            }));
        } catch (error) {
            console.error('Failed to delete style preset:', error);
            set({ error: 'Failed to delete style preset' });
            throw error;
        }
    },

    relearnPreset: async (id: string) => {
        set({ loading: true, error: null });
        try {
            const res = await api.post(`/style-presets/${id}/relearn`, {});
            const preset = res.data?.preset || res.data;
            set(state => ({
                presets: state.presets.map(p => p.id === id ? preset : p),
                loading: false,
            }));
            return preset;
        } catch (error) {
            console.error('Failed to relearn style preset:', error);
            set({ error: 'Failed to relearn style preset', loading: false });
            throw error;
        }
    },
}));
