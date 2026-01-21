import api from '@/lib/api';

export type UserAsset = {
  id: string;
  url: string;
  sha256: string;
  cosKey?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
  createdAt: number;
};

export type UserAssetInput = {
  url: string;
  sha256: string;
  cosKey?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
};

export type UserAssetListResponse = {
  items: UserAsset[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export const registerUserAssets = async (items: UserAssetInput[]) => {
  if (!items.length) return [];
  const res = await api.post('/assets/batch', { items });
  return (res.data?.items || []) as UserAsset[];
};

export const listUserAssets = async (page = 1, limit = 48) => {
  const res = await api.get('/assets', {
    params: { page, limit },
  });
  return res.data as UserAssetListResponse;
};

export const deleteUserAsset = async (id: string) => {
  const res = await api.delete(`/assets/${id}`);
  return res.data as { success: boolean; id: string };
};
