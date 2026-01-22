import {
    WatermarkStyle,
    normalizeWatermarkText,
    normalizeWatermarkStyle,
    downloadImageWithWatermark,
} from './watermark';

// 内部工具函数从watermark.ts复制（避免循环依赖）
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

function clamp01(n: number) {
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(1, n));
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

/**
 * 从文件名提取水印文字（去除扩展名）
 */
export function extractWatermarkFromFilename(filename: string): string {
    const name = String(filename || '').trim();
    // 移除扩展名：去掉最后一个点及其后的内容
    const withoutExt = name.replace(/\.[^/.]+$/, '');
    return normalizeWatermarkText(withoutExt, 50);
}

/**
 * 将图片 Blob 添加水印后返回新 Blob
 */
export async function addWatermarkToBlob(
    blob: Blob,
    watermarkText: string,
    style?: Partial<WatermarkStyle>
): Promise<Blob> {
    const text = normalizeWatermarkText(watermarkText);
    const finalStyle = normalizeWatermarkStyle(style);

    if (!text) throw new Error('水印文字为空');

    const bitmap = await blobToBitmap(blob);

    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 初始化失败');

    bitmap.draw(ctx);
    drawWatermark(ctx, text, finalStyle, canvas.width, canvas.height);

    const outMime = blob.type.startsWith('image/png') ? 'image/png' : 'image/jpeg';
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (b) => {
                if (!b) return reject(new Error('导出图片失败'));
                resolve(b);
            },
            outMime,
            outMime === 'image/jpeg' ? 0.92 : undefined
        );
    });
}

/**
 * 批量下载带水印的图片（逐个下载）
 */
export async function batchDownloadWithWatermarks(
    items: Array<{ url: string; filename: string; watermarkText: string }>,
    style?: Partial<WatermarkStyle>,
    onProgress?: (current: number, total: number) => void
) {
    const finalStyle = normalizeWatermarkStyle(style);

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        onProgress?.(i + 1, items.length);

        await downloadImageWithWatermark({
            url: item.url,
            filename: item.filename,
            watermarkText: item.watermarkText,
            style: finalStyle,
        });

        // 避免浏览器阻止多文件下载
        await new Promise((r) => setTimeout(r, 500));
    }
}

/**
 * 将带水印的图片打包为 ZIP 下载
 */
export async function downloadAsZipWithWatermarks(
    groups: Array<{
        name: string;
        images: Array<{ url: string; filename: string; watermarkText: string }>;
    }>,
    zipFilename: string = 'batch-export.zip',
    style?: Partial<WatermarkStyle>,
    onProgress?: (current: number, total: number) => void
) {
    // 动态导入 jszip，避免打包体积
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const finalStyle = normalizeWatermarkStyle(style);

    let processed = 0;
    const totalImages = groups.reduce((sum, g) => sum + g.images.length, 0);

    for (const group of groups) {
        // 为每个分组创建文件夹（去除非法字符）
        const safeFolderName = group.name.replace(/[<>:"/\\|?*]/g, '_');
        const folder = zip.folder(safeFolderName);
        if (!folder) continue;

        for (const img of group.images) {
            processed++;
            onProgress?.(processed, totalImages);

            try {
                // 1. 下载图片
                const res = await fetch(img.url);
                if (!res.ok) continue;
                const blob = await res.blob();

                // 2. 添加水印
                const watermarkedBlob = img.watermarkText
                    ? await addWatermarkToBlob(blob, img.watermarkText, finalStyle)
                    : blob;

                // 3. 添加到 ZIP
                const safeFilename = img.filename.replace(/[<>:"/\\|?*]/g, '_');
                folder.file(safeFilename, watermarkedBlob);
            } catch (err) {
                console.error(`处理图片失败: ${img.filename}`, err);
                // 继续处理下一张
            }
        }
    }

    // 生成 ZIP 并下载
    const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
    });

    downloadBlob(zipBlob, zipFilename);
}
