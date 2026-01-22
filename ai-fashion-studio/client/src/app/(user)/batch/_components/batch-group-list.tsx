'use client';

import * as React from 'react';
import { Plus, Trash2, ExternalLink, AlertTriangle, Copy, UploadCloud, Check, Square, Stamp, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { GarmentUploadStrip } from './upload-strips';
import { BatchGroup, BatchMode, toImgSrc, BatchImageItem } from './types';
import { StatusBadge } from './status-badge';
import { processDropItems } from '@/lib/file-utils';

interface BatchGroupListProps {
    groups: BatchGroup[];
    mode: BatchMode;
    updateGroup: (id: string, patch: Partial<BatchGroup>) => void;
    removeGroup: (id: string) => void;
    addGroup: () => void;
    addGroups: (newGroups: Partial<BatchGroup>[]) => void;
    copyGroup: (id: string) => void;

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
        groups, mode, updateGroup, removeGroup, addGroup, addGroups, copyGroup,
        isRunning, isCreatingTasks, directPaused,
        maxGarmentsPerGroup, expectedImagesPerGroup,
        onRetryTask, isRetrying, onOpenLightbox, onViewTask
    } = props;

    const [isGlobalDragOver, setIsGlobalDragOver] = React.useState(false);
    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

    const toggleSelection = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === groups.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(groups.map(g => g.id)));
        }
    };

    const handleBatchDelete = () => {
        if (!confirm(`确定要删除选中的 ${selectedIds.size} 个分组吗？`)) return;
        selectedIds.forEach(id => removeGroup(id));
        setSelectedIds(new Set());
    };

    const handleBatchWatermark = () => {
        const text = prompt('请输入要应用的水印文字:');
        if (text === null) return;
        selectedIds.forEach(id => updateGroup(id, { watermarkText: text }));
        setSelectedIds(new Set());
    };

    const isAllSelected = groups.length > 0 && selectedIds.size === groups.length;

    // Global Drop Handler
    const onGlobalDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsGlobalDragOver(false);

        if (isRunning || isCreatingTasks) return;

        const { files: flatFiles, groups: newGroupsData } = await processDropItems(e.dataTransfer.items, e.dataTransfer.files);

        const groupsToAdd: Partial<BatchGroup>[] = [];

        // 1. Handle folders as new groups
        if (newGroupsData.length > 0) {
            groupsToAdd.push(...newGroupsData.map(g => ({
                name: g.name,
                garmentFiles: g.files.slice(0, maxGarmentsPerGroup)
            })));
        }

        // 2. Handle flat files -> Create ONE new group or add to last?
        // Strategy: Always create a new group for loose files if dropped on the list background
        if (flatFiles.length > 0) {
            groupsToAdd.push({
                name: `New Group ${groups.length + groupsToAdd.length + 1}`,
                garmentFiles: flatFiles.slice(0, maxGarmentsPerGroup)
            });
        }

        if (groupsToAdd.length > 0) {
            addGroups(groupsToAdd);
        }
    };

    return (
        <div
            className="space-y-6 pb-20 relative min-h-[50vh]"
            onDragOver={(e) => { e.preventDefault(); setIsGlobalDragOver(true); }}
            onDragLeave={(e) => {
                // Simple drag leave check to avoid flickering when entering children
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setIsGlobalDragOver(false);
            }}
            onDrop={onGlobalDrop}
        >
            {/* Global Drag Overlay */}
            {isGlobalDragOver && !isRunning && (
                <div className="absolute inset-0 z-50 bg-pink-500/10 border-2 border-dashed border-pink-500/50 rounded-3xl backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200 pointer-events-none">
                    <div className="bg-[#0a0f1c] p-8 rounded-3xl border border-pink-500/30 shadow-2xl flex flex-col items-center gap-4">
                        <UploadCloud className="w-16 h-16 text-pink-500 animate-bounce" />
                        <div className="text-xl font-bold text-white">释放添加文件或文件夹</div>
                        <div className="text-white/50">支持文件夹自动分组</div>
                    </div>
                </div>
            )}

            {/* Header Actions */}
            <div className="flex items-center justify-between sticky top-0 z-30 py-4 bg-[#0a0f1c]/80 backdrop-blur-md border-b border-white/5 -mx-4 px-4 lg:mx-0 lg:px-0 lg:static lg:bg-transparent lg:border-none">
                <div className="text-xl font-bold text-white tracking-tight flex items-center gap-4">
                    <button
                        onClick={toggleSelectAll}
                        className="flex items-center gap-2 text-sm font-normal text-white/60 hover:text-white transition-colors"
                    >
                        {isAllSelected ? <div className="p-0.5 bg-pink-500 rounded"><Check className="w-3 h-3 text-white" /></div> : <Square className="w-4 h-4" />}
                        {selectedIds.size > 0 ? `已选 ${selectedIds.size}` : '全选'}
                    </button>
                    <div className="h-4 w-px bg-white/10" />
                    分组列表
                    <span className="text-sm font-normal text-white/40 bg-white/5 px-2 py-0.5 rounded-full font-mono">{groups.length}</span>
                </div>
                <button
                    type="button"
                    onClick={addGroup}
                    disabled={isRunning}
                    className="flex items-center px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/10 shadow-lg backdrop-blur-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    添加分组
                </button>

            </div >

            {
                groups.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-white/10 rounded-3xl bg-white/5 text-center">
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                            <Plus className="w-8 h-8 text-white/20" />
                        </div>
                        <h3 className="text-lg font-bold text-white/80">暂无分组</h3>
                        <p className="text-sm text-white/40 mt-1 mb-6">
                            点击右上角“添加分组”，或<span className="text-pink-300 font-bold mx-1">直接拖入文件夹</span>
                        </p>
                        <button type="button" onClick={addGroup} className="px-4 py-2 rounded-lg border border-white/10 text-white hover:bg-white/10 transition-colors">
                            立即添加
                        </button>
                    </div>
                )
            }

            {/* Grid of Cards */}
            <div className="grid grid-cols-1 gap-6">
                {groups.map((g, index) => {
                    const disabled = mode === 'direct'
                        ? (isRunning || isCreatingTasks || directPaused)
                        : (isRunning || isCreatingTasks) && ['CREATING', 'PLANNING', 'RENDERING', 'QUEUED', 'RETRYING'].includes(g.status);

                    return (
                        <Card key={g.id} className="group border-0 bg-white/5 ring-1 ring-white/10 hover:ring-white/20 transition-all duration-300 shadow-xl overflow-hidden relative">
                            {/* ID / Status Bar */}
                            <div className={`absolute top-0 left-0 w-1 h-full transition-colors ${selectedIds.has(g.id) ? 'bg-pink-500' : 'bg-gradient-to-b from-white/10 to-transparent group-hover:from-pink-500/50 group-hover:to-purple-500/50'}`} />

                            {/* Selection Checkbox */}
                            <button
                                type="button"
                                onClick={() => toggleSelection(g.id)}
                                className={`absolute top-4 left-4 z-20 w-5 h-5 rounded border transition-all flex items-center justify-center ${selectedIds.has(g.id) ? 'bg-pink-500 border-pink-500 text-white' : 'border-white/30 hover:border-white/60 bg-black/40 text-transparent'}`}
                            >
                                <Check className="w-3.5 h-3.5" />
                            </button>

                            <CardContent className="p-6 space-y-5">
                                {/* Header Row */}
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 space-y-3">
                                        <div className="flex items-center gap-3">
                                            <div className="h-6 w-6 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-mono text-white/40 border border-white/5">
                                                {index + 1}
                                            </div>
                                            <Input
                                                value={g.name}
                                                disabled={disabled}
                                                onChange={(e) => updateGroup(g.id, { name: e.target.value })}
                                                className="h-9 w-48 bg-transparent border-none text-lg font-bold text-white placeholder:text-white/20 focus:bg-white/5 hover:bg-white/5 transition-colors px-2 -ml-2 rounded-lg focus-visible:ring-1 focus-visible:ring-pink-500/30"
                                                placeholder={`分组 ${index + 1}`}
                                            />
                                            <StatusBadge status={g.status} />
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Input
                                                value={g.watermarkText}
                                                disabled={disabled}
                                                onChange={(e) => updateGroup(g.id, { watermarkText: e.target.value.slice(0, 50) })}
                                                className="h-8 max-w-[200px] bg-black/20 border-white/10 text-xs text-white placeholder:text-white/30 focus:border-white/30 rounded-lg"
                                                placeholder="款号水印 (可选)"
                                            />
                                            {!!g.taskId && (
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        className="h-8 px-2 flex items-center gap-1 rounded-md text-xs text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                                                        onClick={() => onViewTask(g.taskId!)}
                                                    >
                                                        <ExternalLink className="w-3.5 h-3.5" />
                                                        #{g.taskId.slice(0, 8)}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="h-8 px-3 rounded-md border text-xs border-rose-500/30 text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 hover:text-white transition-colors disabled:opacity-50"
                                                        onClick={() => onRetryTask(g.taskId!)}
                                                        disabled={isRetrying(g.taskId!)}
                                                    >
                                                        {isRetrying(g.taskId!) ? '重试中...' : '重试'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            className="h-8 w-8 rounded-md flex items-center justify-center text-white/20 hover:text-white hover:bg-white/10 transition-colors"
                                            onClick={() => copyGroup(g.id)}
                                            disabled={disabled}
                                            title="复制分组配置"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            className="h-8 w-8 rounded-md flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                            onClick={() => removeGroup(g.id)}
                                            disabled={isRunning}
                                            title="删除分组"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
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
                                                className="bg-black/20 border-white/10 text-white min-h-[80px] text-xs resize-none placeholder:text-white/20 rounded-xl"
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
            {/* Floating Batch Toolbar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-black/80 backdrop-blur-xl border border-white/10 rounded-full px-6 py-3 shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-4 fade-in duration-300">
                    <span className="text-sm font-bold text-white">已选择 {selectedIds.size} 项</span>
                    <div className="h-4 w-px bg-white/20" />
                    <button
                        onClick={handleBatchWatermark}
                        className="flex items-center gap-2 text-xs font-bold text-white hover:text-pink-300 transition-colors"
                    >
                        <Stamp className="w-4 h-4" />
                        设置水印
                    </button>
                    <button
                        onClick={handleBatchDelete}
                        className="flex items-center gap-2 text-xs font-bold text-rose-400 hover:text-rose-300 transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                        批量删除
                    </button>
                    <div className="h-4 w-px bg-white/20" />
                    <button
                        onClick={() => setSelectedIds(new Set())}
                        className="text-white/40 hover:text-white"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div >
    );
}
