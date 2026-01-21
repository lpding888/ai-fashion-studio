"use client";
/* eslint-disable @next/next/no-img-element */

import * as React from 'react';
import { X, ImagePlus, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface FaceRefUploadProps {
    onFilesSelected: (files: File[]) => void;
    selectedFiles: File[];
    selectedUrls?: string[];
    onRemoveUrl?: (url: string) => void;
    className?: string;
    maxFiles?: number;
}

export function FaceRefUpload({
    onFilesSelected,
    selectedFiles,
    selectedUrls = [],
    onRemoveUrl,
    className,
    maxFiles = 5
}: FaceRefUploadProps) {
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = React.useState(false);

    const totalCount = selectedFiles.length + selectedUrls.length;
    const isAtLimit = totalCount >= maxFiles;
    const remainingSlots = Math.max(0, maxFiles - totalCount);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (!isAtLimit) setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (isAtLimit) return;

        if (e.dataTransfer.files?.length) {
            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
            const filesToAdd = files.slice(0, remainingSlots);
            onFilesSelected([...selectedFiles, ...filesToAdd]);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isAtLimit) return;

        if (e.target.files?.length) {
            const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
            const filesToAdd = files.slice(0, remainingSlots);
            onFilesSelected([...selectedFiles, ...filesToAdd]);
        }
        e.target.value = '';
    };

    const removeFile = (index: number) => {
        const newFiles = [...selectedFiles];
        newFiles.splice(index, 1);
        onFilesSelected(newFiles);
    };

    return (
        <div className={cn("space-y-3", className)}>
            {/* Header Removed - Managed by Parent Tabs */}

            {/* Upload Zone */}
            <motion.div
                whileHover={!isAtLimit ? { scale: 1.01 } : {}}
                whileTap={!isAtLimit ? { scale: 0.99 } : {}}
                className={cn(
                    "relative group overflow-hidden border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 transition-all min-h-[200px]",
                    isAtLimit
                        ? "border-white/5 bg-white/5 cursor-not-allowed opacity-50"
                        : isDragOver
                            ? "border-pink-500 bg-pink-500/10 cursor-pointer"
                            : "border-white/10 bg-white/5 hover:border-pink-500/50 hover:bg-pink-500/5 cursor-pointer"
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isAtLimit && fileInputRef.current?.click()}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleChange}
                    className="hidden"
                    multiple
                    accept="image/*"
                />

                <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
                    isDragOver ? "bg-pink-500 text-white" : "bg-white/10 text-slate-400 group-hover:text-pink-400 group-hover:bg-pink-500/20"
                )}>
                    {isDragOver ? <ImagePlus className="w-6 h-6 animate-bounce" /> : <ImagePlus className="w-6 h-6" />}
                </div>

                <div className="text-center space-y-1">
                    <p className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
                        {isDragOver ? "释放以上传" : "点击或拖拽上传图片"}
                    </p>
                    <p className="text-xs text-slate-500">
                        支持 JPG, PNG · 最多 {maxFiles} 张
                    </p>
                </div>
            </motion.div>

            {/* Selected Files List */}
            <AnimatePresence>
                {totalCount > 0 && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="grid grid-cols-4 gap-2 mt-4"
                    >
                        {selectedUrls.map((url, idx) => (
                            <motion.div
                                key={`${url}-${idx}`}
                                layout
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0 }}
                                className="relative aspect-square rounded-lg overflow-hidden group border border-white/10"
                            >
                                <img
                                    src={url}
                                    alt="asset"
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRemoveUrl?.(url);
                                        }}
                                        className="p-1.5 bg-red-500/80 text-white rounded-full hover:bg-red-600 transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                        {selectedFiles.map((file, idx) => (
                            <motion.div
                                key={`${file.name}-${idx}`}
                                layout
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0 }}
                                className="relative aspect-square rounded-lg overflow-hidden group border border-white/10"
                            >
                                <img
                                    src={URL.createObjectURL(file)}
                                    alt="preview"
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeFile(idx);
                                        }}
                                        className="p-1.5 bg-red-500/80 text-white rounded-full hover:bg-red-600 transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>

            {isAtLimit && (
                <div className="flex items-center gap-2 justify-center text-amber-500/80 text-xs bg-amber-500/10 py-2 rounded-lg border border-amber-500/20">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>已达到上传上限</span>
                </div>
            )}
        </div>
    );
}
