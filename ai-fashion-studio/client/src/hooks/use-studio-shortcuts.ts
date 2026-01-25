import { useHotkeys } from "react-hotkeys-hook";

interface StudioShortcutsProps {
    onGenerate: () => void;
    onToggleLeftPanel: () => void;
    onToggleRightPanel: () => void;
    onClosePanels: () => void;
    onUndoOptimize: () => void;
    canUndoOptimize: boolean;
    onSaveSnapshot?: () => void;
    searching?: boolean;
}

export function useStudioShortcuts({
    onGenerate,
    onToggleLeftPanel,
    onToggleRightPanel,
    onClosePanels,
    onUndoOptimize,
    canUndoOptimize,
    onSaveSnapshot,
    searching = false,
}: StudioShortcutsProps) {
    // Options
    const options = {
        enableOnFormTags: true, // Allow shortcuts even when focusing inputs (except specific ones maybe)
        preventDefault: true,
    };

    const formOptions = {
        enableOnFormTags: true,
        preventDefault: true,
    };

    // Mod + Enter: Generate
    useHotkeys("mod+enter", () => {
        onGenerate();
    }, formOptions);

    // Mod + K: Toggle Left Panel (Resource Search)
    useHotkeys("mod+k", (e) => {
        e.preventDefault();
        onToggleLeftPanel();
    }, options);

    // Mod + /: Toggle Right Panel (Control Hub)
    useHotkeys("mod+/", (e) => {
        e.preventDefault();
        onToggleRightPanel();
    }, options);

    // Escape: Close Panels
    useHotkeys("escape", () => {
        if (searching) return; // Let search input handle escape if focused?
        onClosePanels();
    }, options);

    // Mod + Z: Undo Optimization
    useHotkeys("mod+z", (e) => {
        if (canUndoOptimize) {
            e.preventDefault();
            onUndoOptimize();
        }
    }, formOptions); // Form tags enabled to allow undoing while editing prompt

    // Mod + S: Save Snapshot (Future)
    useHotkeys("mod+s", (e) => {
        if (onSaveSnapshot) {
            e.preventDefault();
            onSaveSnapshot();
        }
    }, options);
}
