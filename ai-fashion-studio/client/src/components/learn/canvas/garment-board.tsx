"use client";

import * as React from "react";
import { UploadCloud, X, Plus, Cloud, HardDrive, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GlassPanel } from "@/components/learn/glass-panel";
import { collectDroppedFiles } from "@/lib/file-system-utils";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { GarmentItem } from "@/components/learn/types";
import { useStudioSound } from "@/hooks/use-studio-sound";

interface GarmentBoardProps {
    items: GarmentItem[];
    addGarmentFiles: (files: File[]) => void;
    removeItem: (id: string) => void;
    onClearGarments?: () => void;
    onOpenUserAssets?: () => void;
    maxImages?: number;
    className?: string;
    // Dnd Handlers
    onReorder?: (newItems: GarmentItem[]) => void;
}

// Sortable Item Component
function SortableGarmentItem({
    id,
    type,
    src,
    onRemove
}: {
    id: string;
    type: "file" | "url";
    src: string;
    onRemove: () => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className="relative group aspect-[3/4] bg-white/5 rounded-xl border border-white/10 overflow-hidden shadow-lg touch-none"
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="Garment" className="w-full h-full object-contain pointer-events-none" />

            {/* Source Badge */}
            <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded-md bg-white/80 backdrop-blur-md border border-[#D8B4FE] flex items-center gap-1 shadow-sm">
                {type === "file" ? (
                    <HardDrive className="w-2.5 h-2.5 text-[#333333]" />
                ) : (
                    <Cloud className="w-2.5 h-2.5 text-[#FF4500]" />
                )}
                <span className="text-[8px] font-bold text-[#333333] uppercase tracking-tighter">
                    {type === "file" ? "本地" : "云端"}
                </span>
            </div>

            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
            <Button
                variant="destructive" size="icon"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 rounded-full scale-90"
                onPointerDown={(e) => e.stopPropagation()} // Prevent drag start
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                }}
            >
                <X className="w-3 h-3" />
            </Button>
        </div>
    );
}

export function GarmentBoard({
    items,
    addGarmentFiles,
    removeItem,
    onClearGarments,
    onOpenUserAssets,
    maxImages = 6,
    className,
    onReorder,
}: GarmentBoardProps) {
    const { play } = useStudioSound();
    const [dragOver, setDragOver] = React.useState(false);
    const dragCounter = React.useRef(0);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const folderInputRef = React.useRef<HTMLInputElement>(null);

    // Manage Object URLs to prevent memory leaks
    const [fileUrls, setFileUrls] = React.useState<Map<File, string>>(new Map());
    const fileUrlsRef = React.useRef<Map<File, string>>(new Map());

    const totalCount = items.length;

    // --- Object URL Management (Memory Leak Fix) ---
    React.useEffect(() => {
        setFileUrls((prev) => {
            const newMap = new Map<File, string>();
            const validFiles: File[] = [];

            items.forEach(item => {
                if (item.type === "file" && item.file) {
                    const file = item.file;
                    validFiles.push(file);
                    // Reuse existing URL if file hasn't changed
                    if (prev.has(file)) {
                        newMap.set(file, prev.get(file)!);
                    } else {
                        newMap.set(file, URL.createObjectURL(file));
                    }
                }
            });

            // Revoke URLs for removed files
            prev.forEach((url, file) => {
                if (!validFiles.includes(file)) {
                    URL.revokeObjectURL(url);
                }
            });

            fileUrlsRef.current = newMap;
            return newMap;
        });
    }, [items]); // Only run when items changes

    React.useEffect(() => {
        return () => {
            fileUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        };
    }, []);

    // --- Dnd Logic ---
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id && onReorder) {
            play('hover');
            const oldIndex = items.findIndex((item) => item.id === active.id);
            const newIndex = items.findIndex((item) => item.id === over.id);
            onReorder(arrayMove(items, oldIndex, newIndex));
        }
    };

    // --- Drag & Drop Handlers (Native File Drop) ---
    const onDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        dragCounter.current += 1;
        setDragOver(true);
    };

    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        dragCounter.current = Math.max(0, dragCounter.current - 1);
        if (dragCounter.current === 0) setDragOver(false);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        dragCounter.current = 0;
        setDragOver(false);

        const dt = e.dataTransfer;
        void (async () => {
            const files = await collectDroppedFiles(dt);
            const images = files.filter(f => f.type.startsWith("image/"));

            // Enforce max limit
            const remaining = maxImages - totalCount;
            if (remaining <= 0) {
                alert(`最多只能上传 ${maxImages} 张图片`);
                return;
            }

            const toAdd = images.slice(0, remaining);
            if (toAdd.length < images.length) {
                alert(`已选择 ${images.length} 张，但只能添加 ${toAdd.length} 张`);
            }

            if (toAdd.length > 0) {
                addGarmentFiles(toAdd);
            }
        })();
    };

    // Directory upload attributes shim
    React.useEffect(() => {
        if (folderInputRef.current) {
            folderInputRef.current.setAttribute("webkitdirectory", "");
            folderInputRef.current.setAttribute("directory", "");
        }
    }, []);

    return (
        <GlassPanel
            intensity="low"
            className={cn(
                "relative flex flex-col items-center justify-center p-4 sm:p-6 transition-all duration-300 border-2 border-dashed h-full min-h-[400px]",
                dragOver ? "border-purple-400 bg-purple-50/10" : "border-white/20 hover:border-white/40",
                totalCount > 0 ? "border-solid border-white/10 bg-black/20" : "",
                className
            )}
            onDragEnter={onDragEnter}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            {/* Clear Button */}
            {totalCount > 0 && onClearGarments && (
                <div className="absolute top-3 right-3 z-20">
                    <Button
                        variant="destructive"
                        size="sm"
                        className="h-7 px-2 text-[10px]"
                        onClick={onClearGarments}
                    >
                        清空图片
                    </Button>
                </div>
            )}

            {totalCount > 0 ? (
                /* Grid View */
                <div className="w-full h-full p-4 overflow-y-auto">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 animate-in fade-in zoom-in-95 duration-300">
                        {/* Unified Items List */}
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={items.map(i => i.id)}
                                strategy={rectSortingStrategy}
                            >
                                {items.map((item) => {
                                    const isFile = item.type === "file";
                                    const src = isFile ? (item.file ? (fileUrls.get(item.file) || "") : "") : (item.url || "");

                                    return (
                                        <SortableGarmentItem
                                            key={item.id}
                                            id={item.id}
                                            type={item.type}
                                            src={src}
                                            onRemove={() => removeItem(item.id)}
                                        />
                                    );
                                })}
                            </SortableContext>
                        </DndContext>

                        {/* Add More Placeholders with Dropdown */}
                        {totalCount < maxImages && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <div
                                        className="aspect-[3/4] rounded-xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center text-white/30 hover:text-white/80 hover:border-white/30 hover:bg-white/5 cursor-pointer transition-all animate-in fade-in"
                                    >
                                        <Plus className="w-8 h-8 mb-2" />
                                        <span className="text-xs">添加图片</span>
                                    </div>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="center" className="w-48 bg-slate-900 border-slate-800 text-slate-200">
                                    <DropdownMenuItem className="gap-2 focus:bg-white/10 focus:text-white cursor-pointer" onClick={() => inputRef.current?.click()}>
                                        <HardDrive className="w-4 h-4" />
                                        <span>上传本地文件</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="gap-2 focus:bg-white/10 focus:text-white cursor-pointer" onClick={() => folderInputRef.current?.click()}>
                                        <FolderOpen className="w-4 h-4" />
                                        <span>上传文件夹</span>
                                    </DropdownMenuItem>
                                    {onOpenUserAssets && (
                                        <DropdownMenuItem className="gap-2 focus:bg-white/10 focus:text-white cursor-pointer" onClick={onOpenUserAssets}>
                                            <Cloud className="w-4 h-4 text-purple-400" />
                                            <span>从我的素材库选择</span>
                                        </DropdownMenuItem>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>

                    {/* Action Bar (Below Grid) */}
                    <div className="mt-8 flex justify-center gap-2 sticky bottom-0 py-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="bg-white border-[#9ACD32] text-[#9ACD32] hover:bg-[#9ACD32] hover:text-white transition-colors"
                            onClick={() => inputRef.current?.click()}
                        >
                            上传图片
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="bg-white border-[#9ACD32] text-[#9ACD32] hover:bg-[#9ACD32] hover:text-white transition-colors"
                            onClick={() => folderInputRef.current?.click()}
                        >
                            上传文件夹
                        </Button>
                        {onOpenUserAssets && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="bg-white border-[#9ACD32] text-[#9ACD32] hover:bg-[#9ACD32] hover:text-white transition-colors"
                                onClick={onOpenUserAssets}
                            >
                                我的素材库
                            </Button>
                        )}
                    </div>
                </div>
            ) : (
                /* Empty State */
                <div className="flex flex-col items-center justify-center text-center space-y-4 cursor-pointer p-8" onClick={() => inputRef.current?.click()}>
                    <div className="w-24 h-24 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-full flex items-center justify-center border border-white/10 group-hover:scale-105 transition-transform backdrop-blur-md">
                        <UploadCloud className="w-10 h-10 text-purple-400 group-hover:text-purple-300 transition-colors" />
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-xl font-bold text-white/90">拖拽衣服图片到这里</h3>
                        <p className="text-sm text-slate-400">支持 JPG / PNG，自动去除背景</p>
                    </div>

                    <div className="flex gap-2 pt-4">
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
                            选择文件
                        </Button>
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}>
                            选择文件夹
                        </Button>
                        {onOpenUserAssets && (
                            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onOpenUserAssets(); }}>
                                我的素材库
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Hidden Inputs */}
            <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith("image/"));
                    if (files.length) addGarmentFiles(files);
                    e.target.value = "";
                }}
            />
            <input
                ref={folderInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith("image/"));
                    if (files.length) addGarmentFiles(files);
                    e.target.value = "";
                }}
            />
        </GlassPanel>
    );
}
