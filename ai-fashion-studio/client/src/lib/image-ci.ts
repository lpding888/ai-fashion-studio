export type CiImageOptions = {
  maxWidth: number;
  maxHeight: number;
  quality?: number;
  format?: 'webp' | 'jpg' | 'png';
};

function appendQuery(url: string, rawQuery: string) {
  const trimmed = (url || '').trim();
  if (!trimmed) return trimmed;

  const [base, hash] = trimmed.split('#', 2);
  const separator = base.includes('?') ? '&' : '?';
  const next = `${base}${separator}${rawQuery}`;
  return hash ? `${next}#${hash}` : next;
}

export function withTencentCi(url: string, options: CiImageOptions) {
  const trimmed = (url || '').trim();
  if (!trimmed) return trimmed;

  // 已经是处理过的 CI URL，就不要重复叠加（避免 query 越来越长）
  if (trimmed.includes('imageMogr2/') || trimmed.includes('imageView2/')) return trimmed;

  const quality = Number.isFinite(options.quality) ? Math.floor(options.quality!) : 70;
  const format = options.format || 'webp';
  const w = Math.max(1, Math.floor(options.maxWidth));
  const h = Math.max(1, Math.floor(options.maxHeight));

  // 使用“等比缩放到不超过 WxH”作为缩略图；裁切交给前端 object-cover
  // 注意：此写法依赖腾讯云 COS 数据万象（CI）开启
  const query = `imageMogr2/thumbnail/!${w}x${h}r/format/${format}/quality/${quality}`;
  return appendQuery(trimmed, query);
}

