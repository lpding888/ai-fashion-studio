"use client";

import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Trash2, Sparkles } from 'lucide-react';
import api, { BACKEND_ORIGIN } from '@/lib/api';

interface ImageEditorProps {
    open: boolean;
    onClose: () => void;
    taskId: string;
    shotId: string;
    imageUrl: string;
    onEditComplete: () => void;
}

export function ImageEditor({ open, onClose, taskId, shotId, imageUrl, onEditComplete }: ImageEditorProps) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const maskCanvasRef = React.useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = React.useState(false);
    const [brushSize, setBrushSize] = React.useState(20);
    const [prompt, setPrompt] = React.useState('');
    const [referenceFile, setReferenceFile] = React.useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [image, setImage] = React.useState<HTMLImageElement | null>(null);

    React.useEffect(() => {
        if (open && imageUrl) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = `${BACKEND_ORIGIN}/${imageUrl}`;
            img.onload = () => {
                setImage(img);
                initCanvas(img);
            };
        }
    }, [open, imageUrl]);

    const initCanvas = (img: HTMLImageElement) => {
        const canvas = canvasRef.current;
        const maskCanvas = maskCanvasRef.current;
        if (!canvas || !maskCanvas) return;

        canvas.width = img.width;
        canvas.height = img.height;
        maskCanvas.width = img.width;
        maskCanvas.height = img.height;

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

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        setIsDrawing(true);
        draw(e);
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing && e.type !== 'mousedown') return;
        const canvas = canvasRef.current;
        const maskCanvas = maskCanvasRef.current;
        if (!canvas || !maskCanvas || !image) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.save();
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = 'red';
            ctx.beginPath();
            ctx.arc(x, y, brushSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        const maskCtx = maskCanvas.getContext('2d');
        if (maskCtx) {
            maskCtx.fillStyle = 'white';
            maskCtx.beginPath();
            maskCtx.arc(x, y, brushSize, 0, Math.PI * 2);
            maskCtx.fill();
        }
    };

    const clearMask = () => {
        const canvas = canvasRef.current;
        const maskCanvas = maskCanvasRef.current;
        if (!canvas || !maskCanvas || !image) return;

        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(image, 0, 0);
        }

        const maskCtx = maskCanvas.getContext('2d');
        if (maskCtx) {
            maskCtx.fillStyle = 'black';
            maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
        }
    };

    const handleSubmit = async () => {
        if (!prompt) {
            alert('请输入修改描述');
            return;
        }

        const maskCanvas = maskCanvasRef.current;
        if (!maskCanvas) return;

        setIsSubmitting(true);

        try {
            const maskDataUrl = maskCanvas.toDataURL('image/png');
            let referenceDataUrl: string | undefined;
            if (referenceFile) {
                referenceDataUrl = await fileToBase64(referenceFile);
            }

            await api.post(`/tasks/${taskId}/shots/${shotId}/edit`, {
                maskImage: maskDataUrl,
                referenceImage: referenceDataUrl,
                prompt: prompt,
                editMode: 'EDIT_MODE_INPAINT'
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

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>编辑图片</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="text-sm text-slate-600">用画笔圈出要修改的区域（红色区域将被修改）</div>
                    <div className="border rounded-lg overflow-auto bg-slate-50 max-h-96">
                        <canvas
                            ref={canvasRef}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={() => setIsDrawing(false)}
                            onMouseLeave={() => setIsDrawing(false)}
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

                    <Button variant="outline" onClick={clearMask} className="w-full">
                        <Trash2 className="mr-2 h-4 w-4" />
                        清除选区
                    </Button>

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
                            onChange={(e) => setReferenceFile(e.target.files?.[0] || null)}
                        />
                        {referenceFile && (
                            <div className="text-sm text-green-600 mt-1">✓ {referenceFile.name}</div>
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
