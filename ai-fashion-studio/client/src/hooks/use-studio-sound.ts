"use client";
import * as React from "react";
import { playSynthSound, type SoundType } from "@/lib/audio-synth";

export function useStudioSound() {
    const play = React.useCallback((type: SoundType) => {
        try {
            playSynthSound(type);
        } catch (e) {
            console.warn("Audio playback failed", e);
        }
    }, []);

    return { play };
}
