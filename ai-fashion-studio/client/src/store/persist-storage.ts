"use client";

import { createJSONStorage } from "zustand/middleware";

const noopStorage: Storage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
};

export const clientStorage = createJSONStorage(() => {
    if (typeof window === "undefined") {
        return noopStorage;
    }
    return localStorage;
});
