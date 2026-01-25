"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Download, Trash, RotateCcw, Upload } from "lucide-react";
import { useWorkspaceSnapshots } from "@/hooks/use-workspace-snapshots";

interface WorkspaceSnapshotManagerProps<T> {
    children?: React.ReactNode;
    getCurrentState: () => T;
    onRestoreState: (data: T) => void;
}

export function WorkspaceSnapshotManager<T>({
    children,
    getCurrentState,
    onRestoreState
}: WorkspaceSnapshotManagerProps<T>) {
    const { snapshots, saveSnapshot, deleteSnapshot, restoreSnapshot, exportSnapshot, importSnapshot } = useWorkspaceSnapshots<T>();
    const [newName, setNewName] = useState("");
    const [open, setOpen] = useState(false);

    const handleSave = () => {
        if (!newName.trim()) return;
        const data = getCurrentState();
        saveSnapshot(newName, data);
        setNewName("");
    };

    const handleRestore = (id: string) => {
        const data = restoreSnapshot(id) as T | undefined;
        if (data) {
            onRestoreState(data);
            setOpen(false);
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            await importSnapshot(file);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {(children && React.isValidElement(children)) ? (
                    children
                ) : children ? (
                    <span className="cursor-pointer">{children}</span>
                ) : (
                    <Button variant="outline" size="sm">
                        <Save className="w-4 h-4 mr-2" /> Snapshots
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Workspace Snapshots</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Save New */}
                    <div className="flex gap-2">
                        <Input
                            placeholder="Snapshot Name (e.g. 'Cyberpunk V1')"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                        />
                        <Button onClick={handleSave} disabled={!newName.trim()}>
                            <Save className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* List */}
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {snapshots.length === 0 && (
                            <div className="text-center text-sm text-muted-foreground py-4">
                                No snapshots saved.
                            </div>
                        )}
                        {snapshots.map((s) => (
                            <div key={s.id} className="flex items-center justify-between p-2 rounded-lg border bg-muted/50">
                                <div className="flex flex-col">
                                    <span className="font-medium text-sm">{s.name}</span>
                                    <span className="text-[10px] text-muted-foreground">
                                        {new Date(s.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="flex gap-1">
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleRestore(s.id)} title="Restore">
                                        <RotateCcw className="w-3 h-3" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => exportSnapshot(s.id)} title="Export JSON">
                                        <Download className="w-3 h-3" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => deleteSnapshot(s.id)} title="Delete">
                                        <Trash className="w-3 h-3" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Import */}
                    <div className="pt-4 border-t">
                        <div className="relative">
                            <input type="file" accept=".json" className="hidden" id="snapshot-upload" onChange={handleImport} />
                            <label htmlFor="snapshot-upload">
                                <Button variant="outline" className="w-full cursor-pointer" type="button" asChild>
                                    <span>
                                        <Upload className="w-4 h-4 mr-2" /> Import Snapshot JSON
                                    </span>
                                </Button>
                            </label>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
