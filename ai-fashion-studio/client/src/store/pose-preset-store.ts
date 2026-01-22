import { create } from 'zustand';
import api from '@/lib/api';

export interface PosePreset {
  id: string;
  userId?: string;
  kind?: 'POSE';
  name: string;
  description?: string;
  imagePaths: string[];
  thumbnailPath?: string;
  tags?: string[];
  collectionIds?: string[];
  favoriteAt?: number;
  lastUsedAt?: number;
  promptBlock?: string;
  learnStatus?: 'SUCCESS' | 'FAILED';
  learnError?: string;
  createdAt: number;
}

interface PosePresetStore {
  presets: PosePreset[];
  loading: boolean;
  error: string | null;

  fetchPresets: () => Promise<void>;
  updatePreset: (id: string, updates: { name?: string; description?: string }) => Promise<void>;
  deletePreset: (id: string) => Promise<void>;
  relearnPreset: (id: string) => Promise<PosePreset>;
}

export const usePosePresetStore = create<PosePresetStore>((set) => ({
  presets: [],
  loading: false,
  error: null,

  fetchPresets: async () => {
    set({ loading: true, error: null });
    try {
      const res = await api.get('/pose-presets');
      set({ presets: res.data, loading: false });
    } catch (e) {
      console.error('Failed to fetch pose presets:', e);
      set({ error: 'Failed to load pose presets', loading: false });
    }
  },

  updatePreset: async (id, updates) => {
    try {
      const res = await api.patch(`/pose-presets/${id}`, updates);
      set((state) => ({
        presets: state.presets.map((p) => (p.id === id ? res.data : p)),
      }));
    } catch (e) {
      console.error('Failed to update pose preset:', e);
      set({ error: 'Failed to update pose preset' });
      throw e;
    }
  },

  deletePreset: async (id) => {
    try {
      await api.delete(`/pose-presets/${id}`);
      set((state) => ({ presets: state.presets.filter((p) => p.id !== id) }));
    } catch (e) {
      console.error('Failed to delete pose preset:', e);
      set({ error: 'Failed to delete pose preset' });
      throw e;
    }
  },

  relearnPreset: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post(`/pose-presets/${id}/relearn`, {});
      const preset = res.data?.preset || res.data;
      set((state) => ({
        presets: state.presets.map((p) => (p.id === id ? preset : p)),
        loading: false,
      }));
      return preset;
    } catch (e) {
      console.error('Failed to relearn pose preset:', e);
      set({ error: 'Failed to relearn pose preset', loading: false });
      throw e;
    }
  },
}));
