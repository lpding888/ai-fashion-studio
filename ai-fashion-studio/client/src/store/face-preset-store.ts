import { create } from 'zustand';
import api from '@/lib/api';

export interface FacePreset {
    id: string;
    name: string;
    imagePath: string;
    thumbnailPath?: string;
    // Metadata
    gender?: 'female' | 'male' | 'other';
    height?: number;
    weight?: number;
    measurements?: string;
    description?: string;
    createdAt: number;
}

interface FacePresetStore {
    presets: FacePreset[];
    loading: boolean;
    error: string | null;

    // Actions
    fetchPresets: () => Promise<void>;
    addPreset: (file: File, data: {
        name: string;
        gender?: string;
        height?: string;
        weight?: string;
        measurements?: string;
        description?: string;
    }) => Promise<FacePreset>;
    updatePreset: (id: string, data: Partial<FacePreset>) => Promise<void>;
    deletePreset: (id: string) => Promise<void>;
}

export const useFacePresetStore = create<FacePresetStore>((set) => ({
    presets: [],
    loading: false,
    error: null,

    fetchPresets: async () => {
        set({ loading: true, error: null });
        try {
            const res = await api.get('/face-presets');
            set({ presets: res.data, loading: false });
        } catch (error) {
            console.error('Failed to fetch presets:', error);
            set({ error: 'Failed to load presets', loading: false });
        }
    },

    addPreset: async (file: File, data) => {
        set({ loading: true, error: null });
        try {
            const formData = new FormData();
            formData.append('image', file);
            formData.append('name', data.name);
            if (data.gender) formData.append('gender', data.gender);
            if (data.height) formData.append('height', data.height);
            if (data.weight) formData.append('weight', data.weight);
            if (data.measurements) formData.append('measurements', data.measurements);
            if (data.description) formData.append('description', data.description);

            const res = await api.post('/face-presets', formData);

            const newPreset = res.data;
            set(state => ({
                presets: [...state.presets, newPreset],
                loading: false
            }));
            return newPreset;
        } catch (error) {
            console.error('Failed to add preset:', error);
            set({ error: 'Failed to add preset', loading: false });
            throw error;
        }
    },

    updatePreset: async (id: string, data) => {
        try {
            const res = await api.patch(`/face-presets/${id}`, data);
            set(state => ({
                presets: state.presets.map(p => p.id === id ? res.data : p)
            }));
        } catch (error) {
            console.error('Failed to update preset:', error);
            set({ error: 'Failed to update preset' });
            throw error;
        }
    },

    deletePreset: async (id: string) => {
        try {
            await api.delete(`/face-presets/${id}`);
            set(state => ({
                presets: state.presets.filter(p => p.id !== id)
            }));
        } catch (error) {
            console.error('Failed to delete preset:', error);
            set({ error: 'Failed to delete preset' });
            throw error;
        }
    }
}));
