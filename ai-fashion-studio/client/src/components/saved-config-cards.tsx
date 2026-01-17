"use client";

import * as React from "react";
import { FormHistoryItem } from "@/hooks/useFormHistory";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { Pencil, Trash2, Play, StickyNote } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

export function SavedConfigCards(props: {
  items: FormHistoryItem[];
  onLoad: (item: FormHistoryItem) => void | Promise<void>;
  onDelete: (id: string) => void;
  onUpdateName: (id: string, name: string) => void;
  onUpdateNote: (id: string, note: string) => void;
}) {
  const [editing, setEditing] = React.useState<FormHistoryItem | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editNote, setEditNote] = React.useState("");

  const openEdit = (item: FormHistoryItem) => {
    setEditing(item);
    setEditName(item.name || "");
    setEditNote(item.note || "");
  };

  const saveEdit = () => {
    if (!editing) return;
    const name = editName.trim();
    props.onUpdateName(editing.id, name);
    props.onUpdateNote(editing.id, editNote);
    setEditing(null);
  };

  if (!props.items.length) return null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {props.items.map((item) => {
          const title = item.name?.trim() || (item.requirements || "").trim().slice(0, 28) || "未命名配置";
          const note = (item.note || "").trim();

          return (
            <Card
              key={item.id}
              className="border-white/10 bg-white/5 hover:bg-white/10 transition-colors p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate" title={title}>
                    {title}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    {formatDistanceToNow(item.timestamp, { addSuffix: true, locale: zhCN })}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEdit(item)}
                    title="编辑名称/备注"
                  >
                    <Pencil className="h-4 w-4 text-slate-300" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => props.onDelete(item.id)}
                    title="删除"
                  >
                    <Trash2 className="h-4 w-4 text-red-300" />
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                <Badge variant="secondary" className="bg-black/30 text-slate-200">
                  {item.workflow === "hero_storyboard" ? "先出母版后分镜" : "先规划后出图"}
                </Badge>
                <Badge variant="secondary" className="bg-black/30 text-slate-200">
                  {item.layoutMode === "Grid" ? "拼图" : "单图"}
                </Badge>
                <Badge variant="secondary" className="bg-black/30 text-slate-200">
                  {item.resolution}
                </Badge>
                <Badge variant="secondary" className="bg-black/30 text-slate-200">
                  {item.aspectRatio}
                </Badge>
                <Badge variant="secondary" className="bg-black/30 text-slate-200">
                  {item.workflow === "hero_storyboard" ? "母版×1" : `${item.shotCount}张`}
                </Badge>
                {!!item.autoApproveHero && (
                  <Badge variant="secondary" className="bg-amber-500/20 text-amber-200">
                    自动进分镜
                  </Badge>
                )}
              </div>

              {note && (
                <div className="mt-3 text-[12px] text-slate-200/80 leading-snug line-clamp-3 flex gap-2">
                  <StickyNote className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0" title={note}>
                    {note}
                  </div>
                </div>
              )}

              <div className="mt-4">
                <Button
                  type="button"
                  className="w-full gap-2"
                  onClick={() => void props.onLoad(item)}
                >
                  <Play className="h-4 w-4" />
                  加载此配置
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="bg-slate-950 border-white/10">
          <DialogHeader>
            <DialogTitle>编辑配置预设</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-xs font-bold text-white/80">名称</div>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-white/5 border-white/10 text-white"
                placeholder="例如：外滩-男装-2K-单图"
              />
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold text-white/80">备注（最多 500 字）</div>
              <Textarea
                value={editNote}
                onChange={(e) => setEditNote(e.target.value.slice(0, 500))}
                className="bg-white/5 border-white/10 text-white min-h-[120px]"
                placeholder="写下本次配置的要点/适用场景/注意事项…"
              />
              <div className="text-[11px] text-slate-400 text-right">{editNote.length}/500</div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button onClick={saveEdit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
