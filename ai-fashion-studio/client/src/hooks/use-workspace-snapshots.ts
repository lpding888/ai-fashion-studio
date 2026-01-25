"use client";

import { useState, useEffect, useCallback } from "react";

export interface WorkspaceSnapshot<T = unknown> {
    id: string;
    name: string;
    createdAt: number;
    data: T; // Flexible payload
}

const STORAGE_KEY = "afs:workspace:snapshots";

function isSnapshotArray<T>(value: unknown): value is WorkspaceSnapshot<T>[] {
    return Array.isArray(value);
}

export function useWorkspaceSnapshots<T = unknown>() {
    const [snapshots, setSnapshots] = useState<WorkspaceSnapshot<T>[]>([]);

    // Load from local storage
    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as unknown;
                if (isSnapshotArray<T>(parsed)) {
                    setSnapshots(parsed);
                }
            }
        } catch (e) {
            console.error("Failed to load snapshots", e);
        }
    }, []);

    const saveSnapshot = useCallback((name: string, data: T) => {
        const newSnapshot: WorkspaceSnapshot<T> = {
            id: crypto.randomUUID(),
            name: name || `Snapshot ${new Date().toLocaleString()}`,
            createdAt: Date.now(),
            data,
        };
        setSnapshots((prev) => {
            const updated = [...prev, newSnapshot];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            return updated;
        });
    }, []);

    const deleteSnapshot = useCallback((id: string) => {
        setSnapshots((prev) => {
            const updated = prev.filter((s) => s.id !== id);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            return updated;
        });
    }, []);

    const restoreSnapshot = useCallback((id: string) => {
        return snapshots.find((s) => s.id === id)?.data;
    }, [snapshots]);

    const exportSnapshot = useCallback((id: string) => {
        const target = snapshots.find((s) => s.id === id);
        if (!target) return;

        const blob = new Blob([JSON.stringify(target, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `snapshot-${target.name.replace(/\s+/g, "-")}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [snapshots]);

    const importSnapshot = useCallback((file: File) => {
        return new Promise<void>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const content = e.target?.result as string;
                    const parsed = JSON.parse(content) as WorkspaceSnapshot<T>;
                    // Basic validation
                    if (!parsed || typeof parsed !== "object" || !("id" in parsed) || !("data" in parsed)) {
                        throw new Error("Invalid snapshot file");
                    }

                    // Regenerate ID to avoid collision on re-import
                    parsed.id = crypto.randomUUID();
                    parsed.name = `${parsed.name} (Imported)`;

                    setSnapshots((prev) => {
                        const updated = [...prev, parsed];
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
                        return updated;
                    });
                    resolve();
                } catch (err) {
                    reject(err);
                }
            };
            reader.readAsText(file);
        });
    }, []);

    return {
        snapshots,
        saveSnapshot,
        deleteSnapshot,
        restoreSnapshot,
        exportSnapshot,
        importSnapshot,
    };
}
