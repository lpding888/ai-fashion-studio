import api from '@/lib/api';

export type PresetKind = 'STYLE' | 'POSE' | 'FACE';

export type BatchMetaAction =
  | 'favorite'
  | 'unfavorite'
  | 'add-tags'
  | 'remove-tags'
  | 'set-tags'
  | 'add-collections'
  | 'remove-collections'
  | 'set-collections';

export type BatchMetaPayload = {
  tags?: string[];
  collectionIds?: string[];
};

export type BatchMetaRequest = {
  kind: PresetKind;
  ids: string[];
  action: BatchMetaAction;
  payload?: BatchMetaPayload;
};

export const batchUpdatePresetMeta = async (payload: BatchMetaRequest) => {
  const res = await api.patch('/preset-meta/batch', payload);
  return res.data?.items || [];
};
