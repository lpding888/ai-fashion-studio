type RecordLike = Record<string, unknown>;

const toTrimmedString = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
};

const pickFromRecord = (record: RecordLike): string => {
  return (
    toTrimmedString(record.imageUrl) ||
    toTrimmedString(record.image_url) ||
    toTrimmedString(record.imagePath) ||
    toTrimmedString(record.image_path) ||
    toTrimmedString(record.url)
  );
};

const pickFirstFromArray = (value: unknown): string => {
  if (!Array.isArray(value)) return '';
  for (const item of value) {
    const direct = toTrimmedString(item);
    if (direct) return direct;
    if (item && typeof item === 'object') {
      const nested = pickFromRecord(item as RecordLike);
      if (nested) return nested;
    }
  }
  return '';
};

export const pickScfImageUrl = (input: unknown): string => {
  if (!input || typeof input !== 'object') return '';
  const record = input as RecordLike;
  const direct = pickFromRecord(record);
  if (direct) return direct;
  return (
    pickFirstFromArray(record.images) ||
    pickFirstFromArray(record.imageUrls) ||
    pickFirstFromArray(record.image_urls)
  );
};

export const isScfResultSuccess = (
  input: unknown,
  imageUrl: string,
): boolean => {
  if (!input || typeof input !== 'object') return !!imageUrl;
  const record = input as RecordLike;
  const error = toTrimmedString(record.error);
  if (error) return false;
  const raw = record.success;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw === 1;
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes' || v === 'ok' || v === 'success') {
      return true;
    }
    if (v === 'false' || v === '0' || v === 'no' || v === 'fail' || v === 'failed') {
      return false;
    }
  }
  return !!imageUrl;
};
