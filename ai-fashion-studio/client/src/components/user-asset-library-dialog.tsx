"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { listUserAssets, deleteUserAsset, type UserAsset } from '@/lib/user-assets';
import { Loader2, Trash2 } from 'lucide-react';

type UserAssetLibraryDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedUrls: string[];
    onConfirm: (urls: string[]) => void;
    maxSelection?: number;
    title?: string;
};

const DEFAULT_LIMIT = 48;

export function UserAssetLibraryDialog({
    open,
    onOpenChange,
    selectedUrls,
    onConfirm,
    maxSelection = 14,
    title = '素材库',
}: UserAssetLibraryDialogProps) {
    const [items, setItems] = React.useState<UserAsset[]>([]);
    const [page, setPage] = React.useState(1);
    const [totalPages, setTotalPages] = React.useState(1);
    const [loading, setLoading] = React.useState(false);
    const [loadingMore, setLoadingMore] = React.useState(false);
    const [deletingId, setDeletingId] = React.useState<string | null>(null);
    const [selectedSet, setSelectedSet] = React.useState<Set<string>>(new Set());

    const loadPage = React.useCallback(async (targetPage: number, replace = false) => {
        if (!open) return;
        const isFirst = targetPage === 1;
        if (isFirst) setLoading(true);
        else setLoadingMore(true);
        try {
            const data = await listUserAssets(targetPage, DEFAULT_LIMIT);
            setItems((prev) => (replace ? data.items : [...prev, ...data.items]));
            setPage(data.page);
            setTotalPages(data.totalPages);
        } catch (err) {
            console.error('加载素材库失败:', err);
        } finally {
            if (isFirst) setLoading(false);
            else setLoadingMore(false);
        }
    }, [open]);

    React.useEffect(() => {
        if (!open) return;
        setItems([]);
        setPage(1);
        setTotalPages(1);
        setSelectedSet(new Set(selectedUrls));
        void loadPage(1, true);
    }, [open, selectedUrls, loadPage]);

    const toggleSelect = (url: string) => {
        setSelectedSet((prev) => {
            const next = new Set(prev);
            if (next.has(url)) {
                next.delete(url);
                return next;
            }
            if (next.size >= maxSelection) return next;
            next.add(url);
            return next;
        });
    };

    const handleConfirm = () => {
        onConfirm(Array.from(selectedSet));
        onOpenChange(false);
    };

    const handleDelete = async (assetId: string) => {
        if (!confirm('确定要删除该素材吗？')) return;
        setDeletingId(assetId);
        try {
            await deleteUserAsset(assetId);
            setItems((prev) => prev.filter((item) => item.id !== assetId));
            setSelectedSet((prev) => {
                const next = new Set(prev);
                for (const item of items) {
                    if (item.id === assetId) {
                        next.delete(item.url);
                        break;
                    }
                }
                return next;
            });
        } finally {
            setDeletingId(null);
        }
    };

    const canLoadMore = page < totalPages && !loadingMore;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>已选择 {selectedSet.size}/{maxSelection}</span>
                    <span>新上传排在最前</span>
                </div>
                <div className="min-h-[220px]">
                    {loading ? (
                        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            加载中...
                        </div>
                    ) : items.length === 0 ? (
                        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                            暂无素材
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                            {items.map((item) => {
                                const selected = selectedSet.has(item.url);
                                return (
                                    <div
                                        key={item.id}
                                        className={`relative aspect-square rounded-lg overflow-hidden border ${selected ? 'border-orange-500 ring-2 ring-orange-300' : 'border-slate-200'}`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => toggleSelect(item.url)}
                                            className="absolute inset-0"
                                        >
                                            <img src={item.url} alt={item.fileName || 'asset'} className="h-full w-full object-cover" />
                                        </button>
                                        <button
                                            type="button"
                                            className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                                            onClick={() => void handleDelete(item.id)}
                                            disabled={deletingId === item.id}
                                        >
                                            {deletingId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                <div className="flex justify-center">
                    <Button
                        variant="outline"
                        onClick={() => void loadPage(page + 1)}
                        disabled={!canLoadMore}
                    >
                        {loadingMore ? '加载中...' : canLoadMore ? '加载更多' : '没有更多了'}
                    </Button>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        取消
                    </Button>
                    <Button onClick={handleConfirm} disabled={selectedSet.size === 0}>
                        确认选择
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
