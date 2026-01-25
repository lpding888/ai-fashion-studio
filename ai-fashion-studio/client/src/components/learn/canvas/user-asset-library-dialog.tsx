"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Image as ImageIcon } from "lucide-react";

import { type UserAsset } from "@/lib/user-assets";

interface UserAssetLibraryDialogProps {
    children?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    // Data
    assets: UserAsset[];
    loading?: boolean;
    onLoadMore?: () => void;
    hasMore?: boolean;

    // Selection
    onSelect: (url: string) => void;
}

export function UserAssetLibraryDialog({
    children,
    open,
    onOpenChange,
    assets,
    loading,
    onLoadMore,
    hasMore,
    onSelect,
}: UserAssetLibraryDialogProps) {
    // Data validation - prevent crashes from malformed data
    const safeAssets = React.useMemo(() => {
        if (!Array.isArray(assets)) return [];
        return assets.filter(asset =>
            asset &&
            typeof asset === 'object' &&
            asset.id &&
            asset.url
        );
    }, [assets]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {children && (
                <DialogTrigger asChild>
                    {React.isValidElement(children) ? children : <span className="cursor-pointer">{children}</span>}
                </DialogTrigger>
            )}
            <DialogContent className="max-w-3xl h-[70vh] flex flex-col bg-white/40 backdrop-blur-xl border-white/40 shadow-2xl">
                <DialogHeader>
                    <DialogTitle>我的素材库 (User Assets)</DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto min-h-0 p-1">
                    {safeAssets.length === 0 && !loading ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                            <ImageIcon className="w-12 h-12 mb-2 opacity-50" />
                            <p>暂无素材，请先上传</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                            {safeAssets.map((asset) => (
                                <div
                                    key={asset.id}
                                    className="group relative aspect-square bg-slate-100 rounded-lg overflow-hidden cursor-pointer border hover:border-purple-500 transition-all"
                                    onClick={() => {
                                        onSelect(asset.url);
                                        onOpenChange?.(false);
                                    }}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={asset.url}
                                        alt={asset.fileName || "Asset"}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                        onError={(e) => {
                                            // Fallback to placeholder on error
                                            const target = e.target as HTMLImageElement;
                                            target.onerror = null; // Prevent infinite loop
                                            target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ddd" width="100" height="100"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3ENo Image%3C/text%3E%3C/svg%3E';
                                        }}
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] p-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                                        {asset.fileName || "Untitled"}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {hasMore && (
                        <div className="mt-4 flex justify-center">
                            <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={loading}>
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "加载更多"}
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
