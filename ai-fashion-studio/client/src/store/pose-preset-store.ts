import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/lib/api';
import { clientStorage } from '@/store/persist-storage';

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
  addPreset: (file: File, name: string, description?: string, tags?: string[]) => Promise<PosePreset>;
  updatePreset: (id: string, updates: { name?: string; description?: string; tags?: string[] }) => Promise<void>;
  deletePreset: (id: string) => Promise<void>;
  relearnPreset: (id: string) => Promise<PosePreset>;
}

export const usePosePresetStore = create<PosePresetStore>()(
  persist(
    (set) => ({
      presets: [],
      loading: false,
      error: null,

      fetchPresets: async () => {
        // set({ loading: true, error: null });
        try {
          const res = await api.get('/pose-presets');
          set({ presets: res.data, loading: false });
        } catch (e) {
          console.error('Failed to fetch pose presets:', e);
          set({ error: 'Failed to load pose presets', loading: false });
        }
      },

      addPreset: async (file, name, description, tags) => {
        set({ loading: true, error: null });
        try {
          const formData = new FormData();
          formData.append('image', file);
          formData.append('name', name);
          if (description) formData.append('description', description);
          if (tags && tags.length > 0) formData.append('tags', JSON.stringify(tags));

          const res = await api.post('/pose-presets', formData);
          const newPreset = res.data;
          set((state) => ({
            presets: [...state.presets, newPreset],
            loading: false,
          }));
          return newPreset;
        } catch (e) {
          console.error('Failed to add pose preset:', e);
          set({ error: 'Failed to add pose preset', loading: false });
          throw e;
        }
      },

      updatePreset: async (id, updates) => {
        try {
          interface UpdatePayload {
            name?: string;
            description?: string;
            tags?: string;
          }

          const payload: UpdatePayload = {};
          if (updates.name !== undefined) payload.name = updates.name;
          if (updates.description !== undefined) payload.description = updates.description;
          if (updates.tags !== undefined) payload.tags = JSON.stringify(updates.tags);

          const res = await api.patch(`/pose-presets/${id}`, payload);
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
    }),
    {
      name: 'pose-preset-storage',
      storage: clientStorage,
      partialize: (state) => ({ presets: state.presets }),
    }
  )
);
