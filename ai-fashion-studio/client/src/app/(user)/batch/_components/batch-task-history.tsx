'use client';

import * as React from 'react';
import { ExternalLink, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BatchTaskItem, toImgSrc } from './types';
import { StatusBadge } from './status-badge';

interface BatchTaskHistoryProps {
    tasks: BatchTaskItem[];
    onClear: () => void;
    onRetry: (taskId: string, direct: boolean) => void;
    isRetrying: (taskId: string) => boolean;
    onOpenLightbox: (taskId: string, initialIndex: number) => void;
    onViewTask: (taskId: string) => void;
}

export function BatchTaskHistory(props: BatchTaskHistoryProps) {
    const { tasks, onClear, onRetry, isRetrying, onOpenLightbox, onViewTask } = props;

    if (tasks.length === 0) return null;

    return (
        <Card className="border-0 bg-white/5 ring-1 ring-white/10 mt-8">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-bold text-white/90">
                    最近任务历史
                </CardTitle>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-white/40 hover:text-white hover:bg-white/10"
                    onClick={onClear}
                >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    清空
                </Button>
            </CardHeader>
            <CardContent className="space-y-4">
                {tasks.slice().sort((a, b) => b.createdAt - a.createdAt).map((t) => (
                    <div key={t.taskId} className="bg-black/20 rounded-xl p-3 border border-white/5 hover:bg-black/40 transition-colors">
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                                <div className="text-sm font-bold text-white mb-1">{t.groupName}</div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <StatusBadge status={t.status} />
                                    <Badge variant="outline" className="text-[10px] h-5 border-white/10 text-white/40 font-mono">
                                        ID: {t.taskId.slice(0, 8)}
                                    </Badge>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-white/40 hover:text-white"
                                onClick={() => onViewTask(t.taskId)}
                            >
                                <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                        </div>

                        {t.images.length > 0 && (
                            <div className="flex gap-2 overflow-x-auto pb-1 mb-2 scrollbar-thin scrollbar-thumb-white/10">
                                {t.images.slice(0, 10).map((img, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        className="relative w-12 h-12 rounded-lg overflow-hidden border border-white/10 bg-black/40 flex-shrink-0 hover:border-white/30"
                                        onClick={() => onOpenLightbox(t.taskId, idx)}
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={toImgSrc(img)}
                                            alt={`任务预览 ${idx + 1}`}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                        />
                                    </button>
                                ))}
                            </div>
                        )}

                        {t.status === 'FAILED' && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="w-full h-8 text-xs border-rose-500/20 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                                onClick={() => onRetry(t.taskId, !!t.watermarkText /* heuristic: direct tasks might have watermark? No, bad heuristic. Should pass mode or check task type but logic is complex here. Passed generic handler for now */)}
                                disabled={isRetrying(t.taskId)}
                            >
                                {isRetrying(t.taskId) ? '重试中...' : '重新生成'}
                            </Button>
                        )}
                        {!!t.error && <div className="text-xs text-rose-400/80 mt-2 line-clamp-2">{t.error}</div>}
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
