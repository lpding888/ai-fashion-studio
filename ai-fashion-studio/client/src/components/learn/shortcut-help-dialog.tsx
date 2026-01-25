"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Keyboard, Command, Delete, RotateCcw, Search, Play } from "lucide-react";

interface ShortcutHelpDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ShortcutHelpDialog({ open, onOpenChange }: ShortcutHelpDialogProps) {
    const shortcuts = [
        { key: "Ctrl + Enter", desc: "快速生成 (Generate)", icon: Play },
        { key: "Ctrl + K", desc: "聚焦搜索框 (Search)", icon: Search },
        { key: "Ctrl + Z", desc: "撤销 (Undo)", icon: RotateCcw },
        { key: "Ctrl + Shift + Z", desc: "重做 (Redo)", icon: RotateCcw },
        { key: "Delete", desc: "删除选中项", icon: Delete },
        { key: "Esc", desc: "关闭面板/对话框", icon: Keyboard },
        { key: "Ctrl + /", desc: "查看快捷键", icon: Command },
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        <span className="flex items-center gap-2">
                            <Keyboard className="w-5 h-5 text-purple-500" />
                            快捷键指南
                        </span>
                    </DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    {shortcuts.map((s, i) => (
                        <div key={i} className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0">
                            <div className="flex items-center gap-2 text-sm text-foreground">
                                <s.icon className="w-4 h-4 text-muted-foreground" />
                                {s.desc}
                            </div>
                            <div className="flex gap-1">
                                {s.key.split(" ").map((k, j) => (
                                    <kbd key={j} className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100">
                                        {k === "Ctrl" ? "⌘" : k}
                                    </kbd>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
