import api from '@/lib/api';

export type PresetCollection = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
};

export const listPresetCollections = async () => {
  const res = await api.get('/preset-collections');
  return (res.data?.items || []) as PresetCollection[];
};

export const createPresetCollection = async (name: string) => {
  const res = await api.post('/preset-collections', { name });
  return res.data?.item as PresetCollection;
};

export const renamePresetCollection = async (id: string, name: string) => {
  const res = await api.patch(`/preset-collections/${id}`, { name });
  return res.data?.item as PresetCollection;
};

export const deletePresetCollection = async (id: string) => {
  const res = await api.delete(`/preset-collections/${id}`);
  return res.data as { success: boolean; id: string };
};
