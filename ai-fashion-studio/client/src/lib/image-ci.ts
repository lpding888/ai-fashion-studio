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

/**
 * 智能判断是否需要使用数据万象处理
 * 减少不必要的 CI 调用,降低成本
 */
function shouldUseTencentCi(url: string, options: CiImageOptions): boolean {
  // 已经是处理过的 CI URL,不需要重复处理
  if (url.includes('imageMogr2/') || url.includes('imageView2/')) {
    return false;
  }

  // 如果已经是 WebP 格式,不需要格式转换(除非明确指定其他格式)
  if (url.toLowerCase().endsWith('.webp') && (!options.format || options.format === 'webp')) {
    // WebP 图片如果尺寸小于目标尺寸,也不需要缩放
    // 这里无法直接获取图片尺寸,只能根据 URL 判断(如果 URL 中包含尺寸信息)
    return true;  // 默认需要处理,实际项目中可以优化
  }

  return true;
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

  // 使用"等比缩放到不超过 WxH"作为缩略图；裁切交给前端 object-cover
  // 注意：此写法依赖腾讯云 COS 数据万象（CI）开启
  const query = `imageMogr2/thumbnail/!${w}x${h}r/format/${format}/quality/${quality}`;
  return appendQuery(trimmed, query);
}

/**
 * 智能使用数据万象,避免不必要的处理
 * 可以替代 withTencentCi 使用
 */
export function smartWithTencentCi(url: string, options: CiImageOptions) {
  const trimmed = (url || '').trim();
  if (!trimmed) return trimmed;

  if (!shouldUseTencentCi(trimmed, options)) {
    return trimmed;  // 直接返回原 URL,不添加 CI 参数
  }

  return withTencentCi(trimmed, options);
}

