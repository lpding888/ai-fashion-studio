"use client";

import * as React from "react";
import { Pencil, X, Trash2, Check, Loader2, Sparkles, Image as ImageIcon, RotateCcw } from "lucide-react";

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
  onToggle: () => void;
  onRename: (nextName: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onRetry?: () => Promise<void>;
  onOpenDetails?: () => void;
}) {
  const { id, name, description, thumbnailPath, selected, kindLabel, onToggle, onRename, onDelete, onRetry, onOpenDetails } = props;
  const [editing, setEditing] = React.useState(false);
  const [draftName, setDraftName] = React.useState(name);
  const [busy, setBusy] = React.useState<"rename" | "delete" | "retry" | null>(null);
  const showInlineActions = !onOpenDetails;

  React.useEffect(() => setDraftName(name), [name]);

  return (
    <Card
      className={
        "group overflow-hidden border transition-colors cursor-pointer " +
        (selected ? "border-purple-500 ring-2 ring-purple-200" : "border-border hover:border-purple-300")
      }
      onClick={() => !editing && onToggle()}
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
          <Badge className="bg-white/80 text-slate-800 border border-slate-200">{kindLabel}</Badge>
        </div>

        {showInlineActions && (
          <div className="absolute top-2 right-2 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
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
                if (!next) return;
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
          {!!description && (
            <div className="text-[11px] text-muted-foreground line-clamp-1">备注：{description}</div>
          )}
          {!!onOpenDetails && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetails();
              }}
            >
              详情/编辑
            </Button>
          )}
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">ID: {id.slice(0, 8)}</div>
      </CardContent>
    </Card>
  );
}
