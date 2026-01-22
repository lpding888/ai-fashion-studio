"use client";

import * as React from "react";
import { Pencil, Trash2, X, Check } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { PresetCollection } from "@/lib/preset-collections";

type CollectionManagerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PresetCollection[];
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export function CollectionManagerDialog({
  open,
  onOpenChange,
  items,
  onCreate,
  onRename,
  onDelete,
}: CollectionManagerDialogProps) {
  const [newName, setNewName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const startEdit = (item: PresetCollection) => {
    setEditingId(item.id);
    setEditingName(item.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await onCreate(name);
      setNewName("");
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: string) => {
    const name = editingName.trim();
    if (!name) return;
    setBusyId(id);
    try {
      await onRename(id, name);
      cancelEdit();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该收藏夹吗？")) return;
    setBusyId(id);
    try {
      await onDelete(id);
      if (editingId === id) cancelEdit();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>管理收藏夹</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="新收藏夹名称"
              maxLength={40}
            />
            <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
              {creating ? "创建中..." : "创建"}
            </Button>
          </div>

          {items.length === 0 ? (
            <div className="text-sm text-muted-foreground">暂无收藏夹</div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const editing = editingId === item.id;
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2"
                  >
                    {editing ? (
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="h-8"
                        maxLength={40}
                      />
                    ) : (
                      <div className="text-sm font-medium">{item.name}</div>
                    )}
                    <div className="flex items-center gap-2">
                      {editing ? (
                        <>
                          <Button
                            size="icon"
                            variant="secondary"
                            onClick={() => void handleRename(item.id)}
                            disabled={busyId === item.id}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={cancelEdit}>
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => startEdit(item)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="destructive"
                        onClick={() => void handleDelete(item.id)}
                        disabled={busyId === item.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
