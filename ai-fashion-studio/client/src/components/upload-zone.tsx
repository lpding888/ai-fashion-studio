
"use client";

import * as React from 'react';
import { UploadCloud, X, FileImage, ImagePlus, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface UploadZoneProps {
    onFilesSelected: (files: File[]) => void;
    selectedFiles: File[];
    className?: string;
    maxFiles?: number;
    label?: string;
}

export function UploadZone({
    onFilesSelected,
    selectedFiles,
    className,
    maxFiles = 14,
    label = "服装参考图"
}: UploadZoneProps) {
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = React.useState(false);

    const isAtLimit = selectedFiles.length >= maxFiles;
    const remainingSlots = maxFiles - selectedFiles.length;

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
        // Reset input to allow re-selecting same file
        e.target.value = '';
    };

    const removeFile = (index: number) => {
        const newFiles = [...selectedFiles];
        newFiles.splice(index, 1);
        onFilesSelected(newFiles);
    };

    return (
        <div className={cn("space-y-4", className)}>
            {/* Count indicator */}
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">{label}</span>
                <span className={cn(
                    "text-sm font-mono px-2 py-0.5 rounded",
                    isAtLimit ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                )}>
                    {selectedFiles.length}/{maxFiles}
                </span>
            </div>

            {/* Limit warning */}
            <AnimatePresence>
                {isAtLimit && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm"
                    >
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>已达到最大图片数量限制 ({maxFiles}张)</span>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.div
                whileHover={!isAtLimit ? { scale: 1.01 } : {}}
                whileTap={!isAtLimit ? { scale: 0.99 } : {}}
                className={cn(
                    "relative group overflow-hidden border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center transition-colors",
                    isAtLimit
                        ? "border-slate-200 bg-slate-50 cursor-not-allowed opacity-60"
                        : isDragOver
                            ? "border-primary bg-primary/5 cursor-pointer"
                            : "border-slate-200 hover:border-slate-400 hover:bg-slate-50 cursor-pointer"
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isAtLimit && fileInputRef.current?.click()}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleChange}
                    multiple
                    accept="image/*"
                    disabled={isAtLimit}
                />

                <div className="bg-white p-4 rounded-full mb-4 shadow-sm group-hover:shadow-md transition-shadow">
                    <UploadCloud className={cn(
                        "w-8 h-8 transition-colors",
                        isAtLimit ? "text-slate-400" : "text-slate-600 group-hover:text-primary"
                    )} />
                </div>

                <p className="text-lg font-semibold text-slate-700">
                    {isAtLimit ? "已达上限" : "点击上传 或 拖拽图片至此"}
                </p>
                <p className="text-sm text-slate-400 mt-1">支持 PNG, JPG (最大 10MB)</p>
            </motion.div>

            <AnimatePresence>
                {selectedFiles.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="grid grid-cols-3 md:grid-cols-4 gap-4"
                    >
                        {selectedFiles.map((file, i) => (
                            <motion.div
                                key={`${file.name}-${i}`}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.5 }}
                                className="relative group border border-slate-200 rounded-lg overflow-hidden h-24 flex items-center justify-center bg-slate-50 shadow-sm"
                            >
                                <img src={URL.createObjectURL(file)} alt="preview" className="h-full w-full object-cover" />

                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                                        className="bg-red-500 text-white p-1.5 rounded-full hover:bg-red-600 transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </motion.div>
                        ))}

                        {/* Small Add Button for convenience - only show if not at limit */}
                        {!isAtLimit && (
                            <motion.div
                                onClick={() => fileInputRef.current?.click()}
                                whileHover={{ scale: 1.05 }}
                                className="border-2 border-dashed border-slate-200 rounded-lg h-24 flex items-center justify-center cursor-pointer hover:border-slate-400 hover:bg-slate-50 text-slate-300 hover:text-slate-500"
                            >
                                <ImagePlus className="w-6 h-6" />
                            </motion.div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
