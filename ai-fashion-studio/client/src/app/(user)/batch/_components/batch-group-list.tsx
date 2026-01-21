'use client';

import * as React from 'react';
import { Plus, Trash2, ExternalLink, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { GarmentUploadStrip } from './upload-strips';
import { BatchGroup, BatchMode, toImgSrc, BatchImageItem } from './types';
import { StatusBadge } from './status-badge';

interface BatchGroupListProps {
    groups: BatchGroup[];
    mode: BatchMode;
    updateGroup: (id: string, patch: Partial<BatchGroup>) => void;
    removeGroup: (id: string) => void;
    addGroup: () => void;

    isRunning: boolean;
    isCreatingTasks: boolean;
    directPaused: boolean;
    maxGarmentsPerGroup: number;
    expectedImagesPerGroup: number;

    // Handlers
    onRetryTask: (taskId: string) => void;
    isRetrying: (taskId: string) => boolean;
    onOpenLightbox: (taskId: string, initialIndex: number) => void;
    onViewTask: (taskId: string) => void;
}

export function BatchGroupList(props: BatchGroupListProps) {
    const {
        groups, mode, updateGroup, removeGroup, addGroup,
        isRunning, isCreatingTasks, directPaused,
        maxGarmentsPerGroup, expectedImagesPerGroup,
        onRetryTask, isRetrying, onOpenLightbox, onViewTask
    } = props;

    return (
        <div className="space-y-6 pb-20">
            {/* Header Actions */}
            <div className="flex items-center justify-between sticky top-0 z-30 py-4 bg-[#0a0f1c]/80 backdrop-blur-md border-b border-white/5 -mx-4 px-4 lg:mx-0 lg:px-0 lg:static lg:bg-transparent lg:border-none">
                <div className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                    分组列表
                    <span className="text-sm font-normal text-white/40 bg-white/5 px-2 py-0.5 rounded-full font-mono">{groups.length}</span>
                </div>
                <Button
                    onClick={addGroup}
                    disabled={isRunning}
                    className="bg-white/10 hover:bg-white/20 text-white border border-white/10 shadow-lg backdrop-blur-sm transition-all active:scale-95"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    添加分组
                </Button>
            </div>

            {groups.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-white/10 rounded-3xl bg-white/5 text-center">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                        <Plus className="w-8 h-8 text-white/20" />
                    </div>
                    <h3 className="text-lg font-bold text-white/80">暂无分组</h3>
                    <p className="text-sm text-white/40 mt-1 mb-6">点击右上角“添加分组”开始你的创作</p>
                    <Button onClick={addGroup} variant="outline" className="border-white/10 text-white hover:bg-white/10">
                        立即添加
                    </Button>
                </div>
            )}

            {/* Grid of Cards */}
            <div className="grid grid-cols-1 gap-6">
                {groups.map((g, index) => {
                    const disabled = mode === 'direct'
                        ? (isRunning || isCreatingTasks || directPaused)
                        : (isRunning || isCreatingTasks) && ['CREATING', 'PLANNING', 'RENDERING', 'QUEUED', 'RETRYING'].includes(g.status);

                    return (
                        <Card key={g.id} className="group border-0 bg-white/5 ring-1 ring-white/10 hover:ring-white/20 transition-all duration-300 shadow-xl overflow-hidden relative">
                            {/* ID / Status Bar */}
                            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-white/10 to-transparent group-hover:from-pink-500/50 group-hover:to-purple-500/50 transition-colors" />

                            <CardContent className="p-6 space-y-5">
                                {/* Header Row */}
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 space-y-3">
                                        <div className="flex items-center gap-3">
                                            <Input
                                                value={g.name}
                                                disabled={disabled}
                                                onChange={(e) => updateGroup(g.id, { name: e.target.value })}
                                                className="h-9 w-48 bg-transparent border-none text-lg font-bold text-white placeholder:text-white/20 focus:bg-white/5 hover:bg-white/5 transition-colors px-2 -ml-2 rounded-lg"
                                                placeholder={`分组 ${index + 1}`}
                                            />
                                            <StatusBadge status={g.status} />
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Input
                                                value={g.watermarkText}
                                                disabled={disabled}
                                                onChange={(e) => updateGroup(g.id, { watermarkText: e.target.value.slice(0, 50) })}
                                                className="h-8 max-w-[200px] bg-black/20 border-white/10 text-xs text-white placeholder:text-white/30 focus:border-white/30"
                                                placeholder="款号水印 (可选)"
                                            />
                                            {!!g.taskId && (
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 px-2 text-xs text-white/50 hover:text-white hover:bg-white/10"
                                                        onClick={() => onViewTask(g.taskId!)}
                                                    >
                                                        <ExternalLink className="w-3.5 h-3.5 mr-1" />
                                                        Task #{g.taskId.slice(0, 8)}
                                                    </Button>
                                                    {g.status === 'FAILED' && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 px-3 text-xs border-rose-500/30 text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 hover:text-white"
                                                            onClick={() => onRetryTask(g.taskId!)}
                                                            disabled={isRetrying(g.taskId!)}
                                                        >
                                                            {isRetrying(g.taskId!) ? '重试中...' : '重试'}
                                                        </Button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-white/20 hover:text-red-400 hover:bg-red-500/10 -mt-2 -mr-2"
                                        onClick={() => removeGroup(g.id)}
                                        disabled={isRunning}
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </Button>
                                </div>

                                {/* Upload Area */}
                                <div className="bg-black/20 rounded-2xl p-4 border border-white/5">
                                    <GarmentUploadStrip
                                        files={g.garmentFiles}
                                        onChange={(files) => updateGroup(g.id, { garmentFiles: files })}
                                        disabled={disabled}
                                        maxFiles={maxGarmentsPerGroup}
                                    />
                                </div>

                                {/* Footer / Results */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {mode !== 'direct' && (
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider pl-1">特殊需求 (Override)</label>
                                            <Textarea
                                                value={g.overrideRequirements}
                                                disabled={disabled}
                                                onChange={(e) => updateGroup(g.id, { overrideRequirements: e.target.value })}
                                                className="bg-black/20 border-white/10 text-white min-h-[80px] text-xs resize-none placeholder:text-white/20"
                                                placeholder="输入本组特有的提示词或需求，覆盖全局预设..."
                                            />
                                        </div>
                                    )}

                                    {(g.images.length > 0 || g.imageItems.length > 0) && (
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-emerald-400/80 uppercase tracking-wider pl-1 flex items-center justify-between">
                                                <span>生成结果</span>
                                                <span>{g.images.length}/{expectedImagesPerGroup || '-'}</span>
                                            </label>
                                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/10 h-[80px] items-center">
                                                {(() => {
                                                    const isGrid = expectedImagesPerGroup === 1;
                                                    const displayItems: BatchImageItem[] = isGrid
                                                        ? (g.images[0] ? [{ url: g.images[0] }] : [])
                                                        : ((g.imageItems.length ? g.imageItems : g.images.map((u) => ({ url: u } as BatchImageItem))) as BatchImageItem[]);

                                                    return displayItems.map((it, idx) => (
                                                        <button
                                                            key={`${it.url}-${idx}`}
                                                            type="button"
                                                            className="relative w-20 h-20 rounded-lg overflow-hidden border border-white/10 bg-black/40 flex-shrink-0 group/img hover:border-emerald-500/50 transition-colors shadow-lg"
                                                            onClick={() => g.taskId && onOpenLightbox(g.taskId, idx)}
                                                        >
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img
                                                                src={toImgSrc(it.url)}
                                                                className="w-full h-full object-cover"
                                                                alt="result"
                                                                loading="lazy"
                                                            />
                                                            <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors" />
                                                        </button>
                                                    ));
                                                })()}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {!!g.error && (
                                    <div className="flex items-start gap-2 p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-100 text-xs animate-in slide-in-from-top-2">
                                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-rose-400" />
                                        <div className="min-w-0 break-words font-medium">{g.error}</div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
