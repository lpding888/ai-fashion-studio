"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PresetCard } from "@/components/learn/preset-card";
import { toImgSrc } from "@/components/learn/learn-utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

// Types need to be imported or redefined if not shared properly. 
// Assuming shared types or simple interfaces for now.
import type { StylePreset } from "@/store/style-preset-store";
import type { PosePreset } from "@/store/pose-preset-store";

interface AssetLibraryProps {
    stylePresets: StylePreset[];
    posePresets: PosePreset[];
    facePresets: any[]; // Using any to avoid circular deps or complex imports for now, refine later
    selectedStyleIds: string[];
    setSelectedStyleIds: React.Dispatch<React.SetStateAction<string[]>>;
    selectedPoseIds: string[];
    togglePoseSelect: (id: string) => void;
    selectedFaceIds: string[];
    toggleFaceSelect: (id: string) => void;

    // Actions
    onDeleteStyle: (id: string) => Promise<void>;
    onDeletePose: (id: string) => Promise<void>;
    onDeleteFace: (id: string) => Promise<void>;
    onUpdateStyle: (id: string, updates: any) => Promise<void>;
    onUpdatePose: (id: string, updates: any) => Promise<void>;
    onUpdateFace: (id: string, updates: any) => Promise<void>;
    onRelearnStyle: (id: string) => Promise<any>;
    onRelearnPose: (id: string) => Promise<any>;
}

export function AssetLibrary({
    stylePresets,
    posePresets,
    facePresets,
    selectedStyleIds,
    setSelectedStyleIds,
    selectedPoseIds,
    togglePoseSelect,
    selectedFaceIds,
    toggleFaceSelect,
    onDeleteStyle,
    onDeletePose,
    onDeleteFace,
    onUpdateStyle,
    onUpdatePose,
    onUpdateFace,
    onRelearnStyle,
    onRelearnPose,
}: AssetLibraryProps) {
    const [activeTab, setActiveTab] = React.useState("styles");
    const [searchQuery, setSearchQuery] = React.useState("");

    // Details Dialog State
    const [detailOpen, setDetailOpen] = React.useState(false);
    const [detailKind, setDetailKind] = React.useState<"STYLE" | "POSE" | "FACE" | null>(null);
    const [detailItem, setDetailItem] = React.useState<any>(null);
    const [detailName, setDetailName] = React.useState("");
    const [detailDesc, setDetailDesc] = React.useState("");
    const [detailBusy, setDetailBusy] = React.useState<string | null>(null);

    const filterItems = (items: any[]) => {
        if (!searchQuery.trim()) return items;
        const lower = searchQuery.toLowerCase();
        return items.filter(item => item.name?.toLowerCase().includes(lower));
    };

    const openDetails = (kind: "STYLE" | "POSE" | "FACE", item: any) => {
        setDetailKind(kind);
        setDetailItem(item);
        setDetailName(item.name || "");
        setDetailDesc(item.description || "");
        setDetailOpen(true);
    };

    const closeDetails = () => {
        setDetailOpen(false);
        setDetailBusy(null);
    };

    return (
        <div className="flex flex-col h-full bg-white/50 backdrop-blur-xl border-r border-slate-200/60">
            <div className="p-4 space-y-4 flex-shrink-0">
                <h2 className="text-lg font-bold text-slate-800">资源库</h2>
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="搜索风格/姿势..."
                        className="pl-9 bg-white/80"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="styles">风格</TabsTrigger>
                        <TabsTrigger value="poses">姿势</TabsTrigger>
                        <TabsTrigger value="faces">人脸</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <ScrollArea className="flex-1 px-4 pb-4">
                <div className="space-y-4">
                    {activeTab === "styles" && (
                        <div className="grid grid-cols-2 gap-3 pb-8">
                            {filterItems(stylePresets).map((p) => (
                                <PresetCard
                                    key={p.id}
                                    id={p.id}
                                    name={p.name}
                                    thumbnailPath={p.thumbnailPath || p.imagePaths?.[0]}
                                    kindLabel="STYLE"
                                    selected={selectedStyleIds.includes(p.id)}
                                    isFailed={p.learnStatus === "FAILED"}
                                    onToggle={() => setSelectedStyleIds((prev) => (prev.includes(p.id) ? [] : [p.id]))}
                                    onOpenDetails={() => openDetails("STYLE", p)}
                                    description={p.description}
                                    compact
                                />
                            ))}
                            {filterItems(stylePresets).length === 0 && (
                                <div className="col-span-2 text-center text-sm text-muted-foreground py-8">
                                    无风格资源
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === "poses" && (
                        <div className="grid grid-cols-2 gap-3 pb-8">
                            {filterItems(posePresets).map((p) => (
                                <PresetCard
                                    key={p.id}
                                    id={p.id}
                                    name={p.name}
                                    thumbnailPath={p.thumbnailPath || p.imagePaths?.[0]}
                                    kindLabel="POSE"
                                    selected={selectedPoseIds.includes(p.id)}
                                    isFailed={p.learnStatus === "FAILED"}
                                    onToggle={() => togglePoseSelect(p.id)}
                                    onOpenDetails={() => openDetails("POSE", p)}
                                    description={p.description}
                                    compact
                                />
                            ))}
                            {filterItems(posePresets).length === 0 && (
                                <div className="col-span-2 text-center text-sm text-muted-foreground py-8">
                                    无姿势资源
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === "faces" && (
                        <div className="grid grid-cols-2 gap-3 pb-8">
                            {filterItems(facePresets).map((p) => (
                                <PresetCard
                                    key={p.id}
                                    id={p.id}
                                    name={p.name}
                                    thumbnailPath={p.thumbnailPath || p.imagePath}
                                    kindLabel="FACE"
                                    selected={selectedFaceIds.includes(p.id)}
                                    onToggle={() => toggleFaceSelect(p.id)}
                                    onOpenDetails={() => openDetails("FACE", p)}
                                    description={p.description}
                                    compact
                                />
                            ))}
                            {filterItems(facePresets).length === 0 && (
                                <div className="col-span-2 text-center text-sm text-muted-foreground py-8">
                                    无人脸资源
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </ScrollArea>

            {/* Details/Edit Dialog */}
            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>编辑资源</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {(detailKind === "STYLE" || detailKind === "POSE") && detailItem?.learnStatus === "FAILED" && (
                            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
                                <span className="h-2 w-2 rounded-full bg-rose-500" />
                                {detailItem?.learnError ? `${detailItem.learnError}，请点击“重新学习”` : "学习失败，请点击“重新学习”"}
                            </div>
                        )}
                        {detailItem && (() => {
                            const images =
                                detailKind === "FACE"
                                    ? [detailItem.imagePath].filter(Boolean)
                                    : Array.isArray(detailItem.imagePaths)
                                        ? detailItem.imagePaths
                                        : [];
                            if (!images.length) return null;
                            return (
                                <div className="grid grid-cols-3 gap-2">
                                    {images.map((src: string, idx: number) => (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            key={`${detailItem.id}-${idx}`}
                                            src={toImgSrc(src)}
                                            alt={detailItem.name || "preset"}
                                            className="aspect-square w-full rounded-lg border border-slate-200 object-cover"
                                        />
                                    ))}
                                </div>
                            );
                        })()}
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">名称</label>
                            <Input value={detailName} onChange={(e) => setDetailName(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">备注</label>
                            <Textarea value={detailDesc} onChange={(e) => setDetailDesc(e.target.value)} />
                        </div>
                        <div className="flex gap-2 justify-end">
                            <Button variant="destructive" size="sm" onClick={async () => {
                                if (!confirm("确定删除?")) return;
                                setDetailBusy("delete");
                                try {
                                    if (detailKind === "STYLE") await onDeleteStyle(detailItem.id);
                                    else if (detailKind === "POSE") await onDeletePose(detailItem.id);
                                    else if (detailKind === "FACE") await onDeleteFace(detailItem.id);
                                    closeDetails();
                                } finally { setDetailBusy(null); }
                            }} disabled={!!detailBusy}>
                                {detailBusy === "delete" ? "删除中..." : "删除"}
                            </Button>

                            {detailKind !== "FACE" && (
                                <Button variant="secondary" size="sm" onClick={async () => {
                                    if (!confirm("重新学习?")) return;
                                    setDetailBusy("relearn");
                                    try {
                                        if (detailKind === "STYLE") await onRelearnStyle(detailItem.id);
                                        else if (detailKind === "POSE") await onRelearnPose(detailItem.id);
                                        closeDetails();
                                    } finally { setDetailBusy(null); }
                                }} disabled={!!detailBusy}>
                                    {detailBusy === "relearn" ? "学习中..." : "重新学习"}
                                </Button>
                            )}

                            <Button onClick={async () => {
                                setDetailBusy("save");
                                try {
                                    const updates = { name: detailName, description: detailDesc };
                                    if (detailKind === "STYLE") await onUpdateStyle(detailItem.id, updates);
                                    else if (detailKind === "POSE") await onUpdatePose(detailItem.id, updates);
                                    else if (detailKind === "FACE") await onUpdateFace(detailItem.id, updates);
                                    closeDetails();
                                } finally { setDetailBusy(null); }
                            }} disabled={!!detailBusy}>
                                {detailBusy === "save" ? "保存中..." : "保存"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
