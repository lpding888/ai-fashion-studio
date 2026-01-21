'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Download, ChevronLeft, ChevronRight, RefreshCcw, Loader2, Images } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { downloadImageWithOptionalTaskWatermark } from '@/lib/watermark';

export interface LightboxItem {
    id: string; // Shot ID
    url: string;
    prompt?: string;
}

interface ImageLightboxProps {
    images: LightboxItem[];
    initialIndex?: number;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onRegenerate?: (id: string) => void;
    isRegenerating?: boolean;
    watermarkTaskId?: string;
    regenerateLabel?: string;
    onUseForBatch?: () => void;
    useForBatchLabel?: string;
}

export function ImageLightbox({
    images,
    initialIndex = 0,
    open,
    onOpenChange,
    onRegenerate,
    isRegenerating = false,
    watermarkTaskId,
    regenerateLabel,
    onUseForBatch,
    useForBatchLabel
}: ImageLightboxProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);

    useEffect(() => {
        if (!open) return;
        const next = Math.max(0, Math.min(images.length - 1, initialIndex));
        setCurrentIndex(next);
    }, [open, initialIndex, images.length]);

    const handlePrevious = () => {
        setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
    };

    const handleNext = () => {
        setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
    };

    const handleDownload = async () => {
        const image = images[currentIndex];
        try {
            await downloadImageWithOptionalTaskWatermark({
                taskId: watermarkTaskId || '',
                url: image.url,
                filename: `shot-${image.id}.jpg`,
            });
        } catch (error) {
            console.error('Download failed:', error);
            alert('下载失败：图片跨域限制或网络错误。若需水印下载，请确保 COS 已开启 CORS。');
        }
    };

    const handleDownloadAll = async () => {
        for (let i = 0; i < images.length; i++) {
            try {
                await downloadImageWithOptionalTaskWatermark({
                    taskId: watermarkTaskId || '',
                    url: images[i].url,
                    filename: `shot-${images[i].id}.jpg`,
                });

                // Add delay between downloads
                if (i < images.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } catch (error) {
                console.error(`Download ${i + 1} failed:`, error);
            }
        }
    };

    const currentItem = images[currentIndex];

    // Safe check if images array is empty or index is out of bounds
    if (!currentItem) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-7xl h-[90vh] p-0 bg-black/95 border-0">
                <div className="relative w-full h-full flex items-center justify-center">
                    {/* Close Button */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-4 right-4 z-50 text-white hover:bg-white/20"
                        onClick={() => onOpenChange(false)}
                    >
                        <X className="h-6 w-6" />
                    </Button>

                    {/* Navigation Buttons */}
                    {images.length > 1 && (
                        <>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute left-4 z-50 text-white hover:bg-white/20"
                                onClick={handlePrevious}
                            >
                                <ChevronLeft className="h-8 w-8" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute right-4 z-50 text-white hover:bg-white/20"
                                onClick={handleNext}
                            >
                                <ChevronRight className="h-8 w-8" />
                            </Button>
                        </>
                    )}

                    {/* Image */}
                    <AnimatePresence mode="wait">
                        <motion.img
                            key={currentIndex}
                            src={currentItem.url}
                            alt={`Shot ${currentItem.id}`}
                            className="max-w-full max-h-full object-contain"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.2 }}
                        />
                    </AnimatePresence>

                    {/* Bottom Controls */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 backdrop-blur-md px-6 py-3 rounded-full">
                        <span className="text-white text-sm font-medium">
                            {currentIndex + 1} / {images.length}
                        </span>
                        <div className="w-px h-6 bg-white/20" />

                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-white hover:bg-white/20"
                            onClick={handleDownload}
                        >
                            <Download className="h-4 w-4 mr-2" />
                            下载
                        </Button>

                        {onUseForBatch && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-white hover:bg-white/20"
                                onClick={onUseForBatch}
                            >
                                <Images className="h-4 w-4 mr-2" />
                                {useForBatchLabel || '用此数据批量生成'}
                            </Button>
                        )}

                        {onRegenerate && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-white hover:bg-white/20 hover:text-blue-300"
                                onClick={() => onRegenerate(currentItem.id)}
                                disabled={isRegenerating}
                            >
                                {isRegenerating ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <RefreshCcw className="h-4 w-4 mr-2" />
                                )}
                                {regenerateLabel || '不满意? 重绘'}
                            </Button>
                        )}

                        {images.length > 1 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-white hover:bg-white/20"
                                onClick={handleDownloadAll}
                            >
                                <Download className="h-4 w-4 mr-2" />
                                全部下载
                            </Button>
                        )}
                    </div>

                    {/* Prompt Overlay (Optional helper) */}
                    {currentItem.prompt && (
                        <div className="absolute top-4 left-4 max-w-2xl">
                            <p className="text-white/70 text-xs bg-black/40 p-2 rounded backdrop-blur-sm line-clamp-2">
                                {currentItem.prompt}
                            </p>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
