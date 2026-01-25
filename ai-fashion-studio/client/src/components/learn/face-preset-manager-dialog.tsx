"use client";

import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FacePresetSelector } from "@/components/face-preset-selector";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";

interface FacePresetManagerDialogProps {
    children?: React.ReactNode;
    activeFaceIds: string[];
    onSelectFaces: (ids: string[]) => void;
}

export function FacePresetManagerDialog({
    children,
    activeFaceIds,
    onSelectFaces,
}: FacePresetManagerDialogProps) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <span>
                    {children || (
                        <Button variant="ghost" className="w-full justify-start gap-2">
                            <Settings className="w-4 h-4" />
                            Manage Faces
                        </Button>
                    )}
                </span>
            </DialogTrigger>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 bg-transparent border-none sm:max-w-4xl">
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-full shadow-2xl">
                    <div className="p-4 border-b border-white/10 bg-slate-900/50 backdrop-blur">
                        <h2 className="text-lg font-semibold text-white">Face Model Manager</h2>
                        <p className="text-sm text-slate-400">Upload, edit, and manage your face models.</p>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 bg-slate-950/50">
                        <FacePresetSelector
                            selectedIds={activeFaceIds}
                            onSelect={onSelectFaces}
                            maxSelection={3} // Consistent with MAX_FACE_SELECT
                        />
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
