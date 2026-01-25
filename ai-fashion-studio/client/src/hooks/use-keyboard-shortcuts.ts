"use client";

import { useHotkeys } from "react-hotkeys-hook";
import { useState } from "react";

export interface ShortcutActions {
    onGenerate?: () => void;
    onSearch?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onDeleteSelected?: () => void;
    onCloseDialog?: () => void;
    onToggleLeftPanel?: () => void;
    onToggleRightPanel?: () => void;
}

export function useKeyboardShortcuts(actions: ShortcutActions) {
    const [showHelp, setShowHelp] = useState(false);

    // Helper to open help
    useHotkeys("ctrl+/, meta+/", (e) => {
        e.preventDefault();
        setShowHelp((prev) => !prev);
    });

    // Generate: Ctrl + Enter
    useHotkeys("ctrl+enter, meta+enter", (e) => {
        e.preventDefault();
        actions.onGenerate?.();
    }, { enableOnFormTags: true });

    // Search: Ctrl + K
    useHotkeys("ctrl+k, meta+k", (e) => {
        e.preventDefault();
        actions.onSearch?.();
    });

    // Undo: Ctrl + Z
    useHotkeys("ctrl+z, meta+z", (e) => {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
        e.preventDefault();
        actions.onUndo?.();
    });

    // Redo: Ctrl + Shift + Z
    useHotkeys("ctrl+shift+z, meta+shift+z", (e) => {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
        e.preventDefault();
        actions.onRedo?.();
    });

    // Delete Selection: Delete
    useHotkeys("delete, backspace", (e) => {
        // Only if not focused on input
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

        actions.onDeleteSelected?.();
    });

    // Close Dialogs: Esc (Usually handled by Dialog primitive, but added as fallback)
    useHotkeys("escape", () => {
        actions.onCloseDialog?.();
    });

    return { showHelp, setShowHelp };
}
