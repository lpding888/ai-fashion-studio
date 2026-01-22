"use client";

import * as React from "react";
import { Pencil, X, Trash2, Check, Loader2, Sparkles, Image as ImageIcon, RotateCcw, Star } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toImgSrc } from "@/components/learn/learn-utils";

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
  const { id, name, description, thumbnailPath, selected, kindLabel, isFailed, onToggle, onRename, onDelete, onRetry, onOpenDetails, batchMode, batchSelected, onBatchToggle, isFavorite, onToggleFavorite } = props;
  const [editing, setEditing] = React.useState(false);
  const [draftName, setDraftName] = React.useState(name);
  const [busy, setBusy] = React.useState<"rename" | "delete" | "retry" | null>(null);
  const showInlineActions = !onOpenDetails;
  const showFavoriteAction = !!onToggleFavorite;
  const showDetailsOnlyAction = !!onOpenDetails && !showInlineActions;

  React.useEffect(() => setDraftName(name), [name]);

  return (
    <Card
      className={
        "group overflow-hidden border transition-all duration-300 cursor-pointer hover:shadow-lg hover:-translate-y-1 active:scale-95 " +
        (selected ? "border-purple-500 ring-2 ring-purple-200 shadow-purple-200/50" : "border-border hover:border-purple-300 hover:shadow-purple-100")
      }
      onClick={() => {
        if (editing) return;
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
            <ImageIcon className="w-6 h-6" />
          </div>
        )}

        <div className="absolute top-2 left-2">
          <Badge className="bg-white/80 text-slate-800 border border-slate-200">
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
                className="h-9 w-9"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite?.();
                }}
                title={isFavorite ? "取消收藏" : "收藏"}
                disabled={busy !== null}
              >
                <Star className={`w-5 h-5 ${isFavorite ? "fill-amber-400 text-amber-400" : ""}`} />
              </Button>
            )}
            {!!onRetry && (
              <Button
                variant="secondary"
                size="icon"
                className="h-9 w-9"
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
                className="h-9 w-9"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(true);
                }}
                title="重命名"
              >
                <Pencil className="w-5 h-5" />
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="icon"
                className="h-9 w-9"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(false);
                  setDraftName(name);
                }}
                title="取消"
              >
                <X className="w-5 h-5" />
              </Button>
            )}

            <Button
              variant="destructive"
              size="icon"
              className="h-9 w-9"
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
              {busy === "delete" ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
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
          <div className="absolute bottom-2 right-2 rounded-full bg-white/90 px-2 py-1 text-xs font-semibold text-slate-700 shadow-sm">
            {batchSelected ? "已选" : "未选"}
          </div>
        )}
      </div>

      <CardContent className="p-3">
        {editing ? (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="h-9" />
            <Button
              size="icon"
              className="h-9 w-9"
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
            <div className="text-sm font-semibold line-clamp-1">{name}</div>
            {selected && <Sparkles className="w-4 h-4 text-purple-500" />}
          </div>
        )}
        <div className="mt-1 flex items-center justify-between gap-2">
          {isFailed ? (
            <div className="text-[11px] text-rose-500 line-clamp-1">学习失败，请重新学习</div>
          ) : (
            !!description && (
              <div className="text-[11px] text-muted-foreground line-clamp-1">备注：{description}</div>
            )
          )}
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">ID: {id.slice(0, 8)}</div>
      </CardContent>
    </Card>
  );
}
