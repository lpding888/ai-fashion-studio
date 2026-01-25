"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, X, Palette, User, Smile, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useStudioSound } from "@/hooks/use-studio-sound";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    horizontalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface RecipeBarProps {
    // Data
    styleLabel?: string;
    poseCount: number;
    faceRemark?: string;

    // Actions
    onClearStyle?: () => void;
    onClearPoses?: () => void;
    onClearFace?: () => void;

    onOptimizePrompt?: () => void;
    onUndoOptimize?: () => void;
    canUndoOptimize?: boolean;
    optimizeBusy?: boolean;
    optimizeDisabled?: boolean;

    onClearWorkbench?: () => void;
    hasWorkbenchState?: boolean;
}

interface RecipeChipProps {
    id: string;
    icon: React.ReactNode;
    label: string;
    subLabel?: string;
    colorClass: string;
    onRemove?: () => void;
}

function RecipeChip({ id, icon, label, subLabel, colorClass, onRemove }: RecipeChipProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : "auto",
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <motion.div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className={cn(
                "flex items-center gap-2 pl-2 pr-1 py-1 rounded-full border shadow-sm select-none shrink-0 cursor-grab active:cursor-grabbing touch-none",
                colorClass
            )}
        >
            {icon}
            <div className="flex flex-col leading-none">
                <span className="text-[9px] font-bold opacity-70 uppercase tracking-wider">{label}</span>
                {subLabel && <span className="text-xs font-semibold truncate max-w-[120px]">{subLabel}</span>}
            </div>
            {onRemove && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove();
                    }}
                    className="ml-1 p-0.5 rounded-full hover:bg-black/10 transition-colors"
                >
                    <X className="w-3 h-3" />
                </button>
            )}
        </motion.div>
    );
}

export function RecipeBar({
    styleLabel,
    poseCount,
    faceRemark,
    onClearStyle,
    onClearPoses,
    onClearFace,
    onOptimizePrompt,
    onUndoOptimize,
    canUndoOptimize,
    optimizeBusy,
    optimizeDisabled,
    onClearWorkbench,
    hasWorkbenchState,
}: RecipeBarProps) {

    const hasPresetItems = !!(styleLabel || poseCount > 0 || faceRemark);
    const canClearWorkbench = typeof hasWorkbenchState === "boolean" ? hasWorkbenchState : hasPresetItems;

    // Sound
    // We can use play() if we add interactive elements here later
    const [order, setOrder] = React.useState<string[]>(["style", "pose", "face"]);
    const { play } = useStudioSound();

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setOrder((items) => {
                const oldIndex = items.indexOf(active.id as string);
                const newIndex = items.indexOf(over.id as string);
                return arrayMove(items, oldIndex, newIndex);
            });
            play('click');
        }
    };

    // Filter items based on availability
    const availableItems = order.filter(id => {
        if (id === "style") return !!styleLabel;
        if (id === "pose") return poseCount > 0;
        if (id === "face") return !!faceRemark;
        return false;
    });

    const getLabel = (id: string) => {
        if (id === "style") return "风格";
        if (id === "pose") return "姿势";
        if (id === "face") return "人脸";
        return id;
    };

    return (
        <div className="flex items-center gap-3 overflow-x-auto py-2 min-h-[42px] scrollbar-none">
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={availableItems}
                    strategy={horizontalListSortingStrategy}
                >
                    <AnimatePresence mode="popLayout">
                        {availableItems.map((id) => {
                            if (id === "style") return (
                                <RecipeChip
                                    key="style"
                                    id="style"
                                    icon={<Palette className="w-3.5 h-3.5" />}
                                    label={getLabel("style")}
                                    subLabel={styleLabel}
                                    colorClass="bg-purple-100 text-purple-700 border-purple-200"
                                    onRemove={onClearStyle}
                                />
                            );
                            if (id === "pose") return (
                                <RecipeChip
                                    key="pose"
                                    id="pose"
                                    icon={<User className="w-3.5 h-3.5" />}
                                    label={getLabel("pose")}
                                    subLabel={`已选 ${poseCount} 个`}
                                    colorClass="bg-blue-100 text-blue-700 border-blue-200"
                                    onRemove={onClearPoses}
                                />
                            );
                            if (id === "face") return (
                                <RecipeChip
                                    key="face"
                                    id="face"
                                    icon={<Smile className="w-3.5 h-3.5" />}
                                    label={getLabel("face")}
                                    subLabel={faceRemark}
                                    colorClass="bg-rose-100 text-rose-700 border-rose-200"
                                    onRemove={onClearFace}
                                />
                            );
                            return null;
                        })}
                    </AnimatePresence>
                </SortableContext>
            </DndContext>

            {!hasPresetItems && (
                <div className="text-xs text-slate-400 italic px-2">
                    当前未选择任何预设
                </div>
            )}

            {/* Optimize Action (Right Aligned - Sticky) */}
            <div className="ml-auto flex items-center gap-2 pl-4 sticky right-0 bg-white/80 backdrop-blur-sm">
                {onClearWorkbench && canClearWorkbench && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        onClick={() => {
                            play('delete');
                            onClearWorkbench();
                        }}
                        title="清空工作台"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                )}

                {onOptimizePrompt && (
                    <>
                        {canUndoOptimize && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs hover:bg-white/80"
                                onClick={() => {
                                    play('click');
                                    onUndoOptimize?.();
                                }}
                            >
                                撤销
                            </Button>
                        )}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={cn(
                                "h-7 px-3 text-xs border-orange-200 bg-white/80 hover:bg-orange-50 hover:text-orange-600 transition-all shadow-sm",
                                optimizeBusy && "opacity-80"
                            )}
                            onClick={() => {
                                play('click');
                                onOptimizePrompt?.();
                            }}
                            disabled={optimizeDisabled || optimizeBusy}
                        >
                            {optimizeBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5 text-orange-500" />}
                            {optimizeBusy ? "优化中..." : "AI 优化提示词"}
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}
