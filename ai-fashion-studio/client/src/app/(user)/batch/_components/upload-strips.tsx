'use client';

import * as React from 'react';
import { UploadCloud, X, Plus } from 'lucide-react';
import { toStaticImgSrc } from './types';

export const MAX_GARMENT_IMAGES = 14;

// 本地工具函数: 管理 File 对象的预览 URL
function useObjectUrls(files: File[]) {
    const [urls, setUrls] = React.useState<string[]>([]);

    React.useEffect(() => {
        const next = files.map((f) => URL.createObjectURL(f));
        setUrls(next);
        return () => {
            for (const u of next) URL.revokeObjectURL(u);
        };
    }, [files]);

    return urls;
}

export function GarmentUploadStrip(props: {
    files: File[];
    onChange: (files: File[]) => void;
    maxFiles?: number;
    disabled?: boolean;
}) {
    const { files, onChange, maxFiles = MAX_GARMENT_IMAGES, disabled } = props;
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = React.useState(false);
    const urls = useObjectUrls(files);

    const remaining = Math.max(0, maxFiles - files.length);

    const addFiles = (incoming: File[]) => {
        const images = incoming.filter((f) => f.type.startsWith('image/'));
        if (!images.length) return;
        onChange([...files, ...images.slice(0, remaining)]);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (disabled) return;
        setIsDragOver(false);
        if (!e.dataTransfer.files?.length) return;
        addFiles(Array.from(e.dataTransfer.files));
    };

    const removeAt = (idx: number) => {
        const next = [...files];
        next.splice(idx, 1);
        onChange(next);
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-white/80">衣服图</div>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-black/30 text-white/80">
                    {files.length}/{maxFiles}
                </span>
            </div>

            <div
                onClick={() => !disabled && inputRef.current?.click()}
                onDragOver={(e) => {
                    e.preventDefault();
                    if (!disabled) setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={onDrop}
                className={[
                    'rounded-2xl border-2 border-dashed transition-all cursor-pointer relative overflow-hidden group',
                    'px-4 py-4 min-h-[120px] flex flex-col justify-center',
                    disabled ? 'opacity-60 cursor-not-allowed' : '',
                    isDragOver
                        ? 'border-pink-400/60 bg-pink-500/10 shadow-[0_0_20px_rgba(244,114,182,0.2)]'
                        : 'border-white/15 bg-white/5 hover:border-white/30 hover:bg-white/8',
                ].join(' ')}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={disabled}
                    className="hidden"
                    onChange={(e) => {
                        if (disabled) return;
                        if (e.target.files?.length) addFiles(Array.from(e.target.files));
                        e.target.value = '';
                    }}
                />

                {files.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 text-white/70 py-2">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-colors ${isDragOver ? 'bg-pink-500/20 border-pink-500/30' : 'bg-white/10 border-white/10 group-hover:bg-white/15'}`}>
                            <UploadCloud className={`w-6 h-6 ${isDragOver ? 'text-pink-300' : ''}`} />
                        </div>
                        <div className="text-center">
                            <div className="text-sm font-bold">点击上传 或 拖拽图片至此</div>
                            <div className="text-xs text-white/45 mt-1">支持 PNG/JPG（单组最多 {maxFiles} 张）</div>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                        {urls.map((url, idx) => (
                            <div
                                key={`${url}-${idx}`}
                                className="relative w-20 h-20 rounded-xl overflow-hidden border border-white/10 bg-black/20 flex-shrink-0 group/item"
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={url}
                                    alt="preview"
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                    decoding="async"
                                />
                                {!disabled && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeAt(idx);
                                        }}
                                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 border border-white/10 text-white flex items-center justify-center opacity-0 group-hover/item:opacity-100 hover:bg-red-500/90 transition-all"
                                        title="移除"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        ))}

                        {!disabled && remaining > 0 && (
                            <div className="w-20 h-20 rounded-xl border-2 border-dashed border-white/15 bg-white/5 flex items-center justify-center flex-shrink-0 hover:border-white/30 hover:bg-white/10 transition-colors">
                                <Plus className="w-6 h-6 text-white/60" />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export function ReferenceUploadStrip(props: {
    label: string;
    files: File[];
    urls: string[];
    onChangeFiles: (files: File[]) => void;
    onRemoveUrl: (url: string) => void;
    maxFiles?: number;
    disabled?: boolean;
    hint?: string;
}) {
    const { label, files, urls, onChangeFiles, onRemoveUrl, maxFiles, disabled, hint } = props;
    const inputRef = React.useRef<HTMLInputElement>(null);
    const fileUrls = useObjectUrls(files);
    const limit = Number.isFinite(maxFiles) ? Math.max(0, Math.floor(maxFiles as number)) : undefined;
    const totalCount = files.length + urls.length;
    const remaining = typeof limit === 'number' ? Math.max(0, limit - totalCount) : undefined;
    const [isDragOver, setIsDragOver] = React.useState(false);

    const addFiles = (incoming: File[]) => {
        if (disabled) return;
        const images = incoming.filter((f) => f.type.startsWith('image/'));
        if (!images.length) return;
        if (typeof remaining === 'number') {
            onChangeFiles([...files, ...images.slice(0, remaining)]);
            return;
        }
        onChangeFiles([...files, ...images]);
    };

    const removeFileAt = (idx: number) => {
        const next = [...files];
        next.splice(idx, 1);
        onChangeFiles(next);
    };

    const showEmpty = totalCount === 0;

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (disabled) return;
        setIsDragOver(false);
        if (!e.dataTransfer.files?.length) return;
        addFiles(Array.from(e.dataTransfer.files));
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-white/80">{label}</div>
                {typeof limit === 'number' && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-black/30 text-white/80">
                        {totalCount}/{limit}
                    </span>
                )}
            </div>

            <div
                onClick={() => !disabled && inputRef.current?.click()}
                onDragOver={(e) => {
                    e.preventDefault();
                    if (!disabled) setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={onDrop}
                className={[
                    'rounded-2xl border-2 border-dashed transition-all cursor-pointer bg-white/5 relative group',
                    'px-4 py-4 min-h-[100px] flex flex-col justify-center',
                    disabled ? 'opacity-60 cursor-not-allowed' : '',
                    isDragOver
                        ? 'border-pink-400/60 bg-pink-500/10 shadow-[0_0_20px_rgba(244,114,182,0.2)]'
                        : 'border-white/15 hover:border-white/30 hover:bg-white/8',
                ].join(' ')}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={disabled}
                    className="hidden"
                    onChange={(e) => {
                        if (disabled) return;
                        if (e.target.files?.length) addFiles(Array.from(e.target.files));
                        e.target.value = '';
                    }}
                />

                {showEmpty ? (
                    <div className="flex items-center gap-3 text-white/70">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${isDragOver ? 'bg-pink-500/20 border-pink-500/30' : 'bg-white/10 border-white/10 group-hover:bg-white/15'}`}>
                            <UploadCloud className={`w-5 h-5 ${isDragOver ? 'text-pink-300' : ''}`} />
                        </div>
                        <div className="min-w-0">
                            <div className="text-sm font-bold">点击上传参考图</div>
                            <div className="text-xs text-white/45 mt-0.5">
                                {hint || '支持 PNG/JPG，自动加入所有分组'}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-white/20">
                        {urls.map((url) => (
                            <div
                                key={url}
                                className="relative w-16 h-16 rounded-xl overflow-hidden border border-white/10 bg-black/20 flex-shrink-0 group/item"
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={toStaticImgSrc(url)}
                                    alt="prefill"
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                    decoding="async"
                                />
                                {!disabled && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRemoveUrl(url);
                                        }}
                                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 border border-white/10 text-white flex items-center justify-center opacity-0 group-hover/item:opacity-100 hover:bg-red-500/90 transition-all"
                                        title="移除"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        ))}
                        {fileUrls.map((url, idx) => (
                            <div
                                key={`${url}-${idx}`}
                                className="relative w-16 h-16 rounded-xl overflow-hidden border border-white/10 bg-black/20 flex-shrink-0 group/item"
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={url}
                                    alt="preview"
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                    decoding="async"
                                />
                                {!disabled && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeFileAt(idx);
                                        }}
                                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 border border-white/10 text-white flex items-center justify-center opacity-0 group-hover/item:opacity-100 hover:bg-red-500/90 transition-all"
                                        title="移除"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        ))}

                        {!disabled && (typeof remaining !== 'number' || remaining > 0) && (
                            <div className="w-16 h-16 rounded-xl border-2 border-dashed border-white/15 bg-white/5 flex items-center justify-center flex-shrink-0 hover:border-white/30 hover:bg-white/10 transition-colors">
                                <Plus className="w-5 h-5 text-white/60" />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
