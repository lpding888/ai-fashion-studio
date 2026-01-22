export type WatermarkPosition = 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | 'center';
export type WatermarkSize = 'small' | 'medium' | 'large' | 'auto';
export type WatermarkColor = 'white' | 'black';

export type WatermarkStyle = {
  position: WatermarkPosition;
  opacity: number; // 0~1
  size: WatermarkSize;
  color: WatermarkColor;
  stroke: boolean;
  shadow: boolean;
};

export type TaskWatermarkInput = {
  text: string; // 款号
  style?: Partial<WatermarkStyle>;
};

export type TaskWatermark = {
  text: string;
  style: WatermarkStyle;
};

const TASK_WATERMARK_KEY = 'afs:watermark:by-task:v1';

export const DEFAULT_WATERMARK_STYLE: WatermarkStyle = {
  position: 'bottom_right',
  opacity: 0.6,
  size: 'auto',
  color: 'white',
  stroke: true,
  shadow: false,
};

export function normalizeWatermarkText(input: string, maxLen: number = 50) {
  return String(input || '').trim().slice(0, maxLen);
}

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function normalizeWatermarkStyle(style?: Partial<WatermarkStyle>): WatermarkStyle {
  const raw = style || {};
  const position: WatermarkPosition =
    raw.position === 'top_left' ||
      raw.position === 'top_right' ||
      raw.position === 'bottom_left' ||
      raw.position === 'bottom_right' ||
      raw.position === 'center'
      ? raw.position
      : DEFAULT_WATERMARK_STYLE.position;

  const size: WatermarkSize =
    raw.size === 'small' || raw.size === 'medium' || raw.size === 'large' || raw.size === 'auto'
      ? raw.size
      : DEFAULT_WATERMARK_STYLE.size;

  const color: WatermarkColor = raw.color === 'black' || raw.color === 'white' ? raw.color : DEFAULT_WATERMARK_STYLE.color;

  return {
    position,
    size,
    color,
    opacity: clamp01(typeof raw.opacity === 'number' ? raw.opacity : DEFAULT_WATERMARK_STYLE.opacity),
    stroke: typeof raw.stroke === 'boolean' ? raw.stroke : DEFAULT_WATERMARK_STYLE.stroke,
    shadow: typeof raw.shadow === 'boolean' ? raw.shadow : DEFAULT_WATERMARK_STYLE.shadow,
  };
}

export function setTaskWatermark(taskId: string, payload: TaskWatermarkInput | null) {
  if (typeof window === 'undefined') return;
  const id = String(taskId || '').trim();
  if (!id) return;

  const normalized: TaskWatermark | null =
    payload && payload.text
      ? {
        text: normalizeWatermarkText(payload.text),
        style: normalizeWatermarkStyle(payload.style),
      }
      : null;

  try {
    const raw = window.localStorage.getItem(TASK_WATERMARK_KEY);
    const parsed = raw ? (JSON.parse(raw) as { version?: number; tasks?: Record<string, TaskWatermark> }) : {};
    const tasks = typeof parsed?.tasks === 'object' && parsed.tasks ? { ...parsed.tasks } : {};

    if (!normalized) {
      delete tasks[id];
    } else {
      tasks[id] = normalized;
    }

    window.localStorage.setItem(TASK_WATERMARK_KEY, JSON.stringify({ version: 1, tasks }));
  } catch {
    // ignore
  }
}

export function getTaskWatermark(taskId: string): TaskWatermark | null {
  if (typeof window === 'undefined') return null;
  const id = String(taskId || '').trim();
  if (!id) return null;

  try {
    const raw = window.localStorage.getItem(TASK_WATERMARK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: number; tasks?: Record<string, TaskWatermark> };
    const tasks = parsed?.tasks;
    if (!tasks || typeof tasks !== 'object') return null;
    const found = tasks[id];
    if (!found || !found.text) return null;
    return {
      text: normalizeWatermarkText(found.text),
      style: normalizeWatermarkStyle(found.style),
    };
  } catch {
    return null;
  }
}

function mimeFromFilename(filename: string) {
  const lower = String(filename || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  return 'image/jpeg';
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

async function blobToBitmap(blob: Blob): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D) => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx) => ctx.drawImage(bitmap, 0, 0),
      };
    } catch {
      // fall through
    }
  }

  const objectUrl = window.URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('加载图片失败'));
      el.src = objectUrl;
    });
    return {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      draw: (ctx) => ctx.drawImage(img, 0, 0),
    };
  } finally {
    window.URL.revokeObjectURL(objectUrl);
  }
}

function computeFontPx(style: WatermarkStyle, width: number, height: number) {
  const base = Math.max(1, Math.min(width, height));
  const scale =
    style.size === 'small' ? 0.03 : style.size === 'large' ? 0.06 : style.size === 'medium' ? 0.04 : 0.04;
  const px = base * scale;
  return Math.max(18, Math.min(96, Math.round(px)));
}

function computePaddingPx(width: number, height: number) {
  const base = Math.max(1, Math.min(width, height));
  return Math.max(12, Math.round(base * 0.03));
}

function drawWatermark(ctx: CanvasRenderingContext2D, text: string, style: WatermarkStyle, width: number, height: number) {
  const fontPx = computeFontPx(style, width, height);
  const pad = computePaddingPx(width, height);

  ctx.save();
  ctx.globalAlpha = clamp01(style.opacity);
  ctx.font = `${fontPx}px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",system-ui,sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const fill = style.color === 'black' ? '#000000' : '#ffffff';
  const stroke = style.color === 'black' ? '#ffffff' : '#000000';
  ctx.fillStyle = fill;

  if (style.shadow) {
    ctx.shadowColor = stroke;
    ctx.shadowBlur = Math.max(4, Math.round(fontPx * 0.25));
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  } else {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  let x = pad;
  let y = height - pad;

  switch (style.position) {
    case 'top_left':
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      x = pad;
      y = pad;
      break;
    case 'top_right':
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      x = width - pad;
      y = pad;
      break;
    case 'bottom_left':
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      x = pad;
      y = height - pad;
      break;
    case 'bottom_right':
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      x = width - pad;
      y = height - pad;
      break;
    case 'center':
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      x = width / 2;
      y = height / 2;
      break;
  }

  if (style.stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(2, Math.round(fontPx * 0.1));
    ctx.strokeText(text, x, y);
  }
  ctx.fillText(text, x, y);
  ctx.restore();
}

export async function downloadImageWithWatermark(params: {
  url: string;
  filename: string;
  watermarkText: string;
  style: WatermarkStyle;
}) {
  const safeUrl = String(params.url || '').trim();
  const filename = String(params.filename || '').trim() || `image_${Date.now()}.jpg`;
  const watermarkText = normalizeWatermarkText(params.watermarkText);
  const style = normalizeWatermarkStyle(params.style);

  if (!safeUrl) throw new Error('图片 URL 为空');
  if (!watermarkText) throw new Error('水印文字为空');

  const res = await fetch(safeUrl);
  if (!res.ok) throw new Error(`下载图片失败：HTTP ${res.status}`);
  const blob = await res.blob();
  const bitmap = await blobToBitmap(blob);

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 初始化失败');

  bitmap.draw(ctx);
  drawWatermark(ctx, watermarkText, style, canvas.width, canvas.height);

  const outMime = mimeFromFilename(filename);
  const outBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) return reject(new Error('导出图片失败'));
        resolve(b);
      },
      outMime,
      outMime === 'image/jpeg' ? 0.92 : undefined,
    );
  });

  downloadBlob(outBlob, filename);
}

export async function downloadImageWithOptionalTaskWatermark(params: { taskId: string; url: string; filename: string }) {
  const wm = getTaskWatermark(params.taskId);
  if (wm && wm.text) {
    await downloadImageWithWatermark({
      url: params.url,
      filename: params.filename,
      watermarkText: wm.text,
      style: wm.style,
    });
    return;
  }

  // 无水印：保持现有体验（fetch->blob，否则新标签页）
  const safeUrl = String(params.url || '').trim();
  const filename = String(params.filename || '').trim() || `image_${Date.now()}.jpg`;
  if (!safeUrl) return;

  try {
    const res = await fetch(safeUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    downloadBlob(blob, filename);
  } catch {
    window.open(safeUrl, '_blank', 'noopener,noreferrer');
  }
}

// 导出批量处理相关函数
export { extractWatermarkFromFilename, addWatermarkToBlob, batchDownloadWithWatermarks, downloadAsZipWithWatermarks } from './watermark-batch';

