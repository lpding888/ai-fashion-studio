"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_FAVORITES_KEY = "afs:learn:favorites:v1";

export function useFavorites() {
    const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load from localStorage on mount
    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const raw = localStorage.getItem(STORAGE_FAVORITES_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            setFavoriteIds(Array.isArray(parsed) ? parsed : []);
        } catch (e) {
            console.error("Failed to load favorites", e);
            setFavoriteIds([]);
        } finally {
            setIsLoaded(true);
        }
    }, []);

    // Save to localStorage whenever favorites change
    useEffect(() => {
        if (!isLoaded || typeof window === "undefined") return;
        try {
            localStorage.setItem(STORAGE_FAVORITES_KEY, JSON.stringify(favoriteIds));
        } catch (e) {
            console.error("Failed to save favorites", e);
        }
    }, [favoriteIds, isLoaded]);

    const toggleFavorite = useCallback((taskId: string) => {
        setFavoriteIds((prev) => {
            if (prev.includes(taskId)) {
                return prev.filter((id) => id !== taskId);
            } else {
                return [...prev, taskId];
            }
        });
    }, []);

    const isFavorite = useCallback(
        (taskId: string) => favoriteIds.includes(taskId),
        [favoriteIds]
    );

    return {
        favoriteIds,
        toggleFavorite,
        isFavorite,
        isLoaded,
    };
}
