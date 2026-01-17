"use client";

import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eraser, Loader2, Redo2, Sparkles, Trash2, Undo2 } from 'lucide-react';
import api, { BACKEND_ORIGIN } from '@/lib/api';
import { uploadFileToCos } from '@/lib/cos';

interface ImageEditorProps {
    open: boolean;
    onClose: () => void;
    taskId: string;
    mode?: 'shot' | 'hero';
    shotId?: string;
    imageUrl: string;
    onEditComplete: () => void;
}

export function ImageEditor({ open, onClose, taskId, mode = 'shot', shotId, imageUrl, onEditComplete }: ImageEditorProps) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const maskCanvasRef = React.useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = React.useRef<HTMLCanvasElement | null>(null);

    const strokesRef = React.useRef<Array<{ tool: 'paint' | 'erase'; size: number; points: Array<{ x: number; y: number }> }>>([]);
    const redoRef = React.useRef<Array<{ tool: 'paint' | 'erase'; size: number; points: Array<{ x: number; y: number }> }>>([]);
    const activeStrokeRef = React.useRef<{ tool: 'paint' | 'erase'; size: number; points: Array<{ x: number; y: number }> } | null>(null);
    const activePointerIdRef = React.useRef<number | null>(null);

    const [brushSize, setBrushSize] = React.useState(20);
    const [tool, setTool] = React.useState<'paint' | 'erase'>('paint');
    const [expandPx, setExpandPx] = React.useState(0);
    const [featherPx, setFeatherPx] = React.useState(0);
    const [prompt, setPrompt] = React.useState('');
    const [referenceFiles, setReferenceFiles] = React.useState<File[]>([]);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [image, setImage] = React.useState<HTMLImageElement | null>(null);
    const [, bumpHistoryVersion] = React.useState(0);

    const toImgSrc = React.useCallback((pathOrUrl: string) => {
        if (!pathOrUrl) return '';
        if (pathOrUrl.startsWith('http')) return pathOrUrl;
        return `${BACKEND_ORIGIN}/${pathOrUrl}`;
    }, []);

    const ensureOverlayCanvas = React.useCallback(() => {
        if (!overlayCanvasRef.current) {
            overlayCanvasRef.current = document.createElement('canvas');
        }
        return overlayCanvasRef.current;
    }, []);

    const redrawDisplay = React.useCallback(() => {
        const canvas = canvasRef.current;
        const overlay = overlayCanvasRef.current;
        if (!canvas || !overlay || !image) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0);
        ctx.drawImage(overlay, 0, 0);
    }, [image]);

    React.useEffect(() => {
        if (open && imageUrl) {
            // 每次打开都重置选区与历史，避免“上一张图的 mask”污染
            strokesRef.current = [];
            redoRef.current = [];
            activeStrokeRef.current = null;
            activePointerIdRef.current = null;
            bumpHistoryVersion((v) => v + 1);

            setTool('paint');
            setExpandPx(0);
            setFeatherPx(0);
            setPrompt('');
            setReferenceFiles([]);

            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = toImgSrc(imageUrl);
            img.onload = () => {
                setImage(img);
                initCanvas(img);
            };
        }
    }, [open, imageUrl, toImgSrc]);

    const initCanvas = (img: HTMLImageElement) => {
        const canvas = canvasRef.current;
        const maskCanvas = maskCanvasRef.current;
        if (!canvas || !maskCanvas) return;

        canvas.width = img.width;
        canvas.height = img.height;
        maskCanvas.width = img.width;
        maskCanvas.height = img.height;

        const overlay = ensureOverlayCanvas();
        overlay.width = img.width;
        overlay.height = img.height;
        overlay.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);

        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(img, 0, 0);
        }

        const maskCtx = maskCanvas.getContext('2d');
        if (maskCtx) {
            maskCtx.fillStyle = 'black';
            maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
        }
    };

    const getPointFromPointerEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        return { x, y };
    };

    const applyStrokeToCanvases = React.useCallback((stroke: { tool: 'paint' | 'erase'; size: number; points: Array<{ x: number; y: number }> }) => {
        const overlay = overlayCanvasRef.current;
        const maskCanvas = maskCanvasRef.current;
        if (!overlay || !maskCanvas) return;

        const overlayCtx = overlay.getContext('2d');
        const maskCtx = maskCanvas.getContext('2d');
        if (!overlayCtx || !maskCtx) return;

        const lineWidth = Math.max(1, stroke.size * 2);

        const drawDot = (p: { x: number; y: number }) => {
            overlayCtx.save();
            if (stroke.tool === 'paint') {
                overlayCtx.globalCompositeOperation = 'source-over';
                overlayCtx.globalAlpha = 0.35;
                overlayCtx.fillStyle = 'red';
            } else {
                overlayCtx.globalCompositeOperation = 'destination-out';
                overlayCtx.globalAlpha = 1;
                overlayCtx.fillStyle = 'rgba(0,0,0,1)';
            }
            overlayCtx.beginPath();
            overlayCtx.arc(p.x, p.y, stroke.size, 0, Math.PI * 2);
            overlayCtx.fill();
            overlayCtx.restore();

            maskCtx.save();
            maskCtx.globalCompositeOperation = 'source-over';
            maskCtx.fillStyle = stroke.tool === 'paint' ? 'white' : 'black';
            maskCtx.beginPath();
            maskCtx.arc(p.x, p.y, stroke.size, 0, Math.PI * 2);
            maskCtx.fill();
            maskCtx.restore();
        };

        const drawSegment = (from: { x: number; y: number }, to: { x: number; y: number }) => {
            overlayCtx.save();
            if (stroke.tool === 'paint') {
                overlayCtx.globalCompositeOperation = 'source-over';
                overlayCtx.globalAlpha = 0.35;
                overlayCtx.strokeStyle = 'red';
            } else {
                overlayCtx.globalCompositeOperation = 'destination-out';
                overlayCtx.globalAlpha = 1;
                overlayCtx.strokeStyle = 'rgba(0,0,0,1)';
            }
            overlayCtx.lineWidth = lineWidth;
            overlayCtx.lineCap = 'round';
            overlayCtx.lineJoin = 'round';
            overlayCtx.beginPath();
            overlayCtx.moveTo(from.x, from.y);
            overlayCtx.lineTo(to.x, to.y);
            overlayCtx.stroke();
            overlayCtx.restore();

            maskCtx.save();
            maskCtx.globalCompositeOperation = 'source-over';
            maskCtx.strokeStyle = stroke.tool === 'paint' ? 'white' : 'black';
            maskCtx.lineWidth = lineWidth;
            maskCtx.lineCap = 'round';
            maskCtx.lineJoin = 'round';
            maskCtx.beginPath();
            maskCtx.moveTo(from.x, from.y);
            maskCtx.lineTo(to.x, to.y);
            maskCtx.stroke();
            maskCtx.restore();
        };

        const pts = stroke.points;
        if (pts.length === 0) return;
        drawDot(pts[0]);
        for (let i = 1; i < pts.length; i += 1) {
            drawSegment(pts[i - 1], pts[i]);
        }
    }, []);

    const rebuildFromHistory = React.useCallback(() => {
        const overlay = overlayCanvasRef.current;
        const maskCanvas = maskCanvasRef.current;
        if (!overlay || !maskCanvas) return;

        overlay.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);

        const maskCtx = maskCanvas.getContext('2d');
        if (maskCtx) {
            maskCtx.fillStyle = 'black';
            maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
        }

        for (const stroke of strokesRef.current) {
            applyStrokeToCanvases(stroke);
        }

        redrawDisplay();
    }, [applyStrokeToCanvases, redrawDisplay]);

    const clearMask = React.useCallback(() => {
        strokesRef.current = [];
        redoRef.current = [];
        activeStrokeRef.current = null;
        activePointerIdRef.current = null;
        bumpHistoryVersion((v) => v + 1);
        rebuildFromHistory();
    }, [rebuildFromHistory]);

    const undo = React.useCallback(() => {
        if (strokesRef.current.length === 0) return;
        const last = strokesRef.current.pop();
        if (last) redoRef.current.unshift(last);
        bumpHistoryVersion((v) => v + 1);
        rebuildFromHistory();
    }, [rebuildFromHistory]);

    const redo = React.useCallback(() => {
        if (redoRef.current.length === 0) return;
        const next = redoRef.current.shift();
        if (next) strokesRef.current.push(next);
        bumpHistoryVersion((v) => v + 1);
        rebuildFromHistory();
    }, [rebuildFromHistory]);

    const startStroke = React.useCallback((p: { x: number; y: number }) => {
        const stroke = { tool, size: brushSize, points: [p] };
        activeStrokeRef.current = stroke;
        redoRef.current = []; // 新动作会清空 redo 栈

        applyStrokeToCanvases(stroke);
        redrawDisplay();
    }, [applyStrokeToCanvases, brushSize, redrawDisplay, tool]);

    const addStrokePoint = React.useCallback((p: { x: number; y: number }) => {
        const stroke = activeStrokeRef.current;
        if (!stroke) return;

        const prev = stroke.points[stroke.points.length - 1];
        stroke.points.push(p);

        const overlay = overlayCanvasRef.current;
        const maskCanvas = maskCanvasRef.current;
        if (!overlay || !maskCanvas) return;

        const overlayCtx = overlay.getContext('2d');
        const maskCtx = maskCanvas.getContext('2d');
        if (!overlayCtx || !maskCtx) return;

        const lineWidth = Math.max(1, stroke.size * 2);

        overlayCtx.save();
        if (stroke.tool === 'paint') {
            overlayCtx.globalCompositeOperation = 'source-over';
            overlayCtx.globalAlpha = 0.35;
            overlayCtx.strokeStyle = 'red';
        } else {
            overlayCtx.globalCompositeOperation = 'destination-out';
            overlayCtx.globalAlpha = 1;
            overlayCtx.strokeStyle = 'rgba(0,0,0,1)';
        }
        overlayCtx.lineWidth = lineWidth;
        overlayCtx.lineCap = 'round';
        overlayCtx.lineJoin = 'round';
        overlayCtx.beginPath();
        overlayCtx.moveTo(prev.x, prev.y);
        overlayCtx.lineTo(p.x, p.y);
        overlayCtx.stroke();
        overlayCtx.restore();

        maskCtx.save();
        maskCtx.globalCompositeOperation = 'source-over';
        maskCtx.strokeStyle = stroke.tool === 'paint' ? 'white' : 'black';
        maskCtx.lineWidth = lineWidth;
        maskCtx.lineCap = 'round';
        maskCtx.lineJoin = 'round';
        maskCtx.beginPath();
        maskCtx.moveTo(prev.x, prev.y);
        maskCtx.lineTo(p.x, p.y);
        maskCtx.stroke();
        maskCtx.restore();

        redrawDisplay();
    }, [redrawDisplay]);

    const finishStroke = React.useCallback(() => {
        const stroke = activeStrokeRef.current;
        activeStrokeRef.current = null;
        activePointerIdRef.current = null;
        if (!stroke || stroke.points.length === 0) return;
        strokesRef.current.push(stroke);
        bumpHistoryVersion((v) => v + 1);
    }, []);

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!image) return;
        if (e.button !== 0) return;

        const p = getPointFromPointerEvent(e);
        if (!p) return;

        activePointerIdRef.current = e.pointerId;
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            // ignore
        }

        startStroke(p);
        e.preventDefault();
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (activePointerIdRef.current === null) return;
        if (activePointerIdRef.current !== e.pointerId) return;

        const p = getPointFromPointerEvent(e);
        if (!p) return;

        addStrokePoint(p);
        e.preventDefault();
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (activePointerIdRef.current !== e.pointerId) return;
        finishStroke();
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            // ignore
        }
        e.preventDefault();
    };

    const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (activePointerIdRef.current !== e.pointerId) return;
        activeStrokeRef.current = null;
        activePointerIdRef.current = null;
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            // ignore
        }
        rebuildFromHistory();
        e.preventDefault();
    };

    React.useEffect(() => {
        if (!open) return;

        const onKeyDown = (ev: KeyboardEvent) => {
            if (ev.key.toLowerCase() === 'z' && (ev.ctrlKey || ev.metaKey)) {
                ev.preventDefault();
                undo();
                return;
            }
            if (ev.key.toLowerCase() === 'y' && (ev.ctrlKey || ev.metaKey)) {
                ev.preventDefault();
                redo();
                return;
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open, redo, undo]);

    const buildProcessedMaskBlob = async (): Promise<Blob> => {
        const raw = maskCanvasRef.current;
        if (!raw) throw new Error('mask canvas 不存在');

        const w = raw.width;
        const h = raw.height;

        const makeCanvas = () => {
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            return c;
        };

        const drawBlur = (src: HTMLCanvasElement, blur: number) => {
            const c = makeCanvas();
            const ctx = c.getContext('2d');
            if (!ctx) throw new Error('canvas ctx 不存在');
            ctx.filter = `blur(${blur}px)`;
            ctx.drawImage(src, 0, 0);
            ctx.filter = 'none';
            return c;
        };

        // Step 1: raw mask
        let work = makeCanvas();
        const workCtx = work.getContext('2d');
        if (!workCtx) throw new Error('canvas ctx 不存在');
        workCtx.drawImage(raw, 0, 0);

        // Step 2: expand（blur -> threshold）
        if (expandPx > 0) {
            const blurred = drawBlur(work, expandPx);
            const bctx = blurred.getContext('2d');
            if (!bctx) throw new Error('canvas ctx 不存在');
            const img = bctx.getImageData(0, 0, w, h);
            const data = img.data;
            for (let i = 0; i < data.length; i += 4) {
                const v = data[i]; // 0..255
                const on = v > 10 ? 255 : 0;
                data[i] = on;
                data[i + 1] = on;
                data[i + 2] = on;
                data[i + 3] = 255;
            }
            workCtx.putImageData(img, 0, 0);
        }

        // Step 3: feather（soft edge blur）
        if (featherPx > 0) {
            work = drawBlur(work, featherPx);
            const ctx = work.getContext('2d');
            if (ctx) {
                const img = ctx.getImageData(0, 0, w, h);
                for (let i = 0; i < img.data.length; i += 4) {
                    img.data[i + 3] = 255; // ensure opaque alpha
                }
                ctx.putImageData(img, 0, 0);
            }
        }

        return await new Promise<Blob>((resolve, reject) => {
            work.toBlob((blob) => {
                if (!blob) return reject(new Error('无法导出遮罩（mask）'));
                resolve(blob);
            }, 'image/png');
        });
    };

    const handleSubmit = async () => {
        if (!prompt.trim()) {
            alert('请输入修改描述');
            return;
        }

        if (mode === 'shot' && !shotId) {
            alert('缺少 shotId，无法编辑该图片');
            return;
        }

        setIsSubmitting(true);

        try {
            // ✅ 严格只传 URL：mask/参考图先直传 COS，再把 URL 传给后端/模型（禁止 base64 inline_data）
            const maskBlob = await buildProcessedMaskBlob();
            const targetKey = mode === 'hero' ? 'hero' : shotId!;
            const maskFile = new File([maskBlob], `mask_${taskId}_${targetKey}_${Date.now()}.png`, { type: 'image/png' });
            const maskUrl = await uploadFileToCos(maskFile);

            const referenceUrls = (await Promise.all(referenceFiles.map((f) => uploadFileToCos(f))))
                .map((v) => (v || '').trim())
                .filter(Boolean);

            const endpoint =
                mode === 'hero'
                    ? `/tasks/${taskId}/hero/edit`
                    : `/tasks/${taskId}/shots/${shotId}/edit`;

            await api.post(endpoint, {
                maskImage: maskUrl,
                referenceImages: referenceUrls,
                prompt: prompt.trim(),
                editMode: 'EDIT_MODE_INPAINT',
            });

            alert('图片编辑成功！');
            onEditComplete();
            onClose();

        } catch (err) {
            console.error('Edit failed:', err);
            alert('编辑失败，请重试');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{mode === 'hero' ? '编辑母版' : '编辑图片'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="text-sm text-slate-600">用画笔涂抹要修改的区域（红色区域将被修改）</div>
                    <div className="border rounded-lg overflow-auto bg-slate-50 max-h-96">
                        <canvas
                            ref={canvasRef}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerCancel}
                            onPointerLeave={handlePointerCancel}
                            className="cursor-crosshair max-w-full"
                        />
                        <canvas ref={maskCanvasRef} className="hidden" />
                    </div>

                    <div>
                        <Label>画笔大小: {brushSize}px</Label>
                        <Input
                            type="range"
                            min="5"
                            max="50"
                            value={brushSize}
                            onChange={(e) => setBrushSize(Number(e.target.value))}
                        />
                    </div>

                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant={tool === 'paint' ? 'default' : 'outline'}
                            onClick={() => setTool('paint')}
                            className="flex-1"
                        >
                            画笔
                        </Button>
                        <Button
                            type="button"
                            variant={tool === 'erase' ? 'default' : 'outline'}
                            onClick={() => setTool('erase')}
                            className="flex-1"
                        >
                            <Eraser className="mr-2 h-4 w-4" />
                            橡皮擦
                        </Button>
                    </div>

                    <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={undo} disabled={strokesRef.current.length === 0} className="flex-1">
                            <Undo2 className="mr-2 h-4 w-4" />
                            撤销
                        </Button>
                        <Button type="button" variant="outline" onClick={redo} disabled={redoRef.current.length === 0} className="flex-1">
                            <Redo2 className="mr-2 h-4 w-4" />
                            重做
                        </Button>
                        <Button type="button" variant="outline" onClick={clearMask} className="flex-1">
                            <Trash2 className="mr-2 h-4 w-4" />
                            清空
                        </Button>
                    </div>

                    <div>
                        <Label>扩边: {expandPx}px</Label>
                        <Input
                            type="range"
                            min="0"
                            max="60"
                            value={expandPx}
                            onChange={(e) => setExpandPx(Number(e.target.value))}
                        />
                    </div>

                    <div>
                        <Label>羽化: {featherPx}px</Label>
                        <Input
                            type="range"
                            min="0"
                            max="40"
                            value={featherPx}
                            onChange={(e) => setFeatherPx(Number(e.target.value))}
                        />
                    </div>

                    <div>
                        <Label>修改描述 *</Label>
                        <Input
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="例如：把T恤改成黑色"
                        />
                    </div>

                    <div>
                        <Label>上传参考图（可选）</Label>
                        <Input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => {
                                const files = Array.from(e.target.files || []);
                                if (files.length === 0) return;
                                setReferenceFiles((prev) => [...prev, ...files].slice(0, 12));
                                // 允许重复选择同一个文件
                                e.currentTarget.value = '';
                            }}
                        />
                        {referenceFiles.length > 0 && (
                            <div className="mt-2 space-y-1">
                                {referenceFiles.map((f, idx) => (
                                    <div key={`${f.name}_${f.size}_${idx}`} className="flex items-center justify-between gap-2 text-sm">
                                        <div className="text-green-600 truncate">✓ {f.name}</div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setReferenceFiles((prev) => prev.filter((_, i) => i !== idx))}
                                        >
                                            移除
                                        </Button>
                                    </div>
                                ))}
                                {referenceFiles.length >= 12 && (
                                    <div className="text-xs text-slate-500">最多可上传 12 张参考图</div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose} className="flex-1">
                            取消
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !prompt}
                            className="flex-1 bg-purple-600 hover:bg-purple-700"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    处理中...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="mr-2 h-4 w-4" />
                                    应用修改
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
