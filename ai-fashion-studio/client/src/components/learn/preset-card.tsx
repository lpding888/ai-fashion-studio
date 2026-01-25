"use client";

import { motion } from "framer-motion";
import { useStudioSound } from "@/hooks/use-studio-sound";

import * as React from "react";
import { Pencil, X, Trash2, Check, Loader2, Sparkles, Image as ImageIcon, RotateCcw, Star } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toImgSrc } from "@/components/learn/learn-utils";
import { cn } from "@/lib/utils";

export function PresetCard(props: {
  id: string;
  name: string;
  description?: string;
  thumbnailPath?: string;
  selected: boolean;
  kindLabel: string;
  isFailed?: boolean;
  onToggle: () => void;
  onRename?: (nextName: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  onRetry?: () => Promise<void>;
  onOpenDetails?: () => void;
  compact?: boolean; // Added for AssetLibrary smaller layout
  batchMode?: boolean;
  batchSelected?: boolean;
  onBatchToggle?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}) {
  const { id, name, description, thumbnailPath, selected, kindLabel, isFailed, onToggle, onRename, onDelete, onRetry, onOpenDetails, compact, batchMode, batchSelected, onBatchToggle, isFavorite, onToggleFavorite } = props;
  const [editing, setEditing] = React.useState(false);
  const [draftName, setDraftName] = React.useState(name);
  const [busy, setBusy] = React.useState<"rename" | "delete" | "retry" | null>(null);
  const { play } = useStudioSound();
  const isCompact = !!compact;

  const showInlineActions = !onOpenDetails;
  const showFavoriteAction = !!onToggleFavorite;
  const showDetailsOnlyAction = !!onOpenDetails && !showInlineActions;

  React.useEffect(() => setDraftName(name), [name]);

  return (
    <motion.div
      layout
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onMouseEnter={() => play('hover')}
      className="h-full relative group" // Ensure smooth layout
    >
      <div
        className={cn(
          "absolute -inset-[2px] rounded-xl bg-gradient-to-r from-orange-400 via-pink-500 to-violet-600 opacity-0 transition-opacity duration-300",
          selected ? "opacity-100" : "group-hover:opacity-50"
        )}
      />
      <Card
        className={cn(
          "relative h-full overflow-hidden border-0 transition-all duration-300 cursor-pointer",
          selected ? "ring-2 ring-transparent" : "ring-1 ring-slate-200 group-hover:ring-transparent"
        )}
        onClick={() => {
          if (editing) return;
          play('click');
          if (batchMode && onBatchToggle) {
            onBatchToggle();
            return;
          }
          onToggle();
        }}
        title={name}
      >
        <div className="aspect-[4/3] bg-muted relative">
          {thumbnailPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={toImgSrc(thumbnailPath)}
              alt={name}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <ImageIcon className={cn(isCompact ? "w-5 h-5" : "w-6 h-6")} />
            </div>
          )}

          <div className="absolute top-2 left-2">
            <Badge className={cn("bg-white/80 text-slate-800 border border-slate-200", isCompact ? "text-[9px]" : "text-[10px]")}>
              {isFailed && <span className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-500" />}
              {kindLabel}
            </Badge>
          </div>

          {showDetailsOnlyAction && (
            <div className="absolute top-2 right-2">
              <Button
                variant="secondary"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDetails?.();
                }}
              >
                详情/编辑
              </Button>
            </div>
          )}

          {showInlineActions && (
            <div className="absolute top-2 right-2 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
              {showFavoriteAction && (
                <Button
                  variant="secondary"
                  size="icon"
                  className={cn(isCompact ? "h-8 w-8" : "h-9 w-9")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite?.();
                  }}
                  title={isFavorite ? "取消收藏" : "收藏"}
                  disabled={busy !== null}
                >
                  <Star className={cn(isCompact ? "w-4 h-4" : "w-5 h-5", isFavorite ? "fill-amber-400 text-amber-400" : "")} />
                </Button>
              )}
              {!!onRetry && (
                <Button
                  variant="secondary"
                  size="icon"
                  className={cn(isCompact ? "h-8 w-8" : "h-9 w-9")}
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm(`重试学习会覆盖该${kindLabel}卡片的 AI 分析结果，是否继续？`)) return;
                    setBusy("retry");
                    try {
                      await onRetry();
                    } finally {
                      setBusy(null);
                    }
                  }}
                  title="重试学习"
                  disabled={busy !== null}
                >
                  {busy === "retry" ? <Loader2 className="w-5 h-5 animate-spin" /> : <RotateCcw className="w-5 h-5" />}
                </Button>
              )}

              {!editing ? (
                <Button
                  variant="secondary"
                  size="icon"
                  className={cn(isCompact ? "h-8 w-8" : "h-9 w-9")}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(true);
                  }}
                  title="重命名"
                >
                  <Pencil className={cn(isCompact ? "w-4 h-4" : "w-5 h-5")} />
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="icon"
                  className={cn(isCompact ? "h-8 w-8" : "h-9 w-9")}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(false);
                    setDraftName(name);
                  }}
                  title="取消"
                >
                  <X className={cn(isCompact ? "w-4 h-4" : "w-5 h-5")} />
                </Button>
              )}

              <Button
                variant="destructive"
                size="icon"
                className={cn(isCompact ? "h-8 w-8" : "h-9 w-9")}
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!confirm(`确定删除这个${kindLabel}卡片吗？`)) return;
                  if (!onDelete) return;
                  setBusy("delete");
                  try {
                    await onDelete();
                  } finally {
                    setBusy(null);
                  }
                }}
                title="删除"
                disabled={busy !== null}
              >
                {busy === "delete" ? <Loader2 className={cn(isCompact ? "w-4 h-4" : "w-5 h-5", "animate-spin")} /> : <Trash2 className={cn(isCompact ? "w-4 h-4" : "w-5 h-5")} />}
              </Button>
            </div>
          )}

          {!showInlineActions && showFavoriteAction && (
            <button
              type="button"
              className="absolute top-2 right-2 rounded-full bg-white/90 p-2 text-slate-700 shadow-sm"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite?.();
              }}
              title={isFavorite ? "取消收藏" : "收藏"}
            >
              <Star className={`h-4 w-4 ${isFavorite ? "fill-amber-400 text-amber-400" : ""}`} />
            </button>
          )}

          {batchMode && (
            <div className="absolute top-2 left-2 z-20">
              <div
                className={cn(
                  "w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all duration-200",
                  batchSelected
                    ? "bg-purple-600 border-purple-600 shadow-md"
                    : "bg-white/40 border-white/60 backdrop-blur-sm"
                )}
              >
                {batchSelected && <Check className="w-4 h-4 text-white" />}
              </div>
            </div>
          )}
        </div>

        <CardContent className={cn(isCompact ? "p-2" : "p-3")}>
          {editing ? (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} className={cn(isCompact ? "h-7 text-[11px]" : "h-9")} />
              <Button
                size="icon"
                className={cn(isCompact ? "h-7 w-7" : "h-9 w-9")}
                onClick={async () => {
                  const next = draftName.trim();
                  if (!next || !onRename) return;
                  setBusy("rename");
                  try {
                    await onRename(next);
                    setEditing(false);
                  } finally {
                    setBusy(null);
                  }
                }}
                disabled={busy !== null}
                title="保存"
              >
                {busy === "rename" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className={cn("font-semibold line-clamp-1", isCompact ? "text-[11px]" : "text-sm")}>{name}</div>
              {selected && <Sparkles className={cn(isCompact ? "w-3.5 h-3.5" : "w-4 h-4", "text-purple-500")} />}
            </div>
          )}
          <div className="mt-1 flex items-center justify-between gap-2">
            {isFailed ? (
              <div className={cn("text-rose-500 line-clamp-1", isCompact ? "text-[10px]" : "text-[11px]")}>学习失败，请重新学习</div>
            ) : (
              !!description && (
                <div className={cn("text-muted-foreground line-clamp-1", isCompact ? "text-[10px]" : "text-[11px]")}>备注：{description}</div>
              )
            )}
          </div>
          <div className={cn("mt-2 text-muted-foreground", isCompact ? "text-[10px]" : "text-[11px]")}>ID: {id.slice(0, 8)}</div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
