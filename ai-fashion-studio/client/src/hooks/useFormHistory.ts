/**
 * 表单历史记录管理 Hook
 * 使用 LocalStorage 保存最近5次的表单配置
 */

import { useState, useEffect, useCallback } from 'react';

const HISTORY_KEY = 'ai-fashion-form-history';
const MAX_HISTORY_ITEMS = 5;

export interface FormHistoryItem {
    id: string;
    timestamp: number;
    name?: string;

    // 表单配置
    requirements: string;
    resolution: '1K' | '2K' | '4K';
    aspectRatio: string;
    layoutMode: 'Individual' | 'Grid';
    shotCount: number;

    // 可选参数
    location?: string;
    styleDirection?: string;
    garmentFocus?: string;

    // 图片数量（不保存实际文件）
    garmentImageCount?: number;
    faceRefCount?: number;
    styleRefCount?: number;
}

interface FormHistoryData {
    version: number;
    items: FormHistoryItem[];
}

export function useFormHistory() {
    const [historyItems, setHistoryItems] = useState<FormHistoryItem[]>([]);

    // 加载历史记录
    useEffect(() => {
        try {
            const stored = localStorage.getItem(HISTORY_KEY);
            if (stored) {
                const data: FormHistoryData = JSON.parse(stored);
                if (data.version === 1 && Array.isArray(data.items)) {
                    setHistoryItems(data.items);
                }
            }
        } catch (error) {
            console.error('加载历史记录失败:', error);
        }
    }, []);

    // 保存到 LocalStorage
    const saveToStorage = useCallback((items: FormHistoryItem[]) => {
        try {
            const data: FormHistoryData = {
                version: 1,
                items
            };
            localStorage.setItem(HISTORY_KEY, JSON.stringify(data));
            setHistoryItems(items);
        } catch (error) {
            console.error('保存历史记录失败:', error);
        }
    }, []);

    // 添加新的历史记录
    const saveHistory = useCallback((item: Omit<FormHistoryItem, 'id' | 'timestamp'>) => {
        const newItem: FormHistoryItem = {
            ...item,
            id: `history-${Date.now()}`,
            timestamp: Date.now()
        };

        const updatedItems = [newItem, ...historyItems];

        // 保持最多5条记录
        if (updatedItems.length > MAX_HISTORY_ITEMS) {
            updatedItems.splice(MAX_HISTORY_ITEMS);
        }

        saveToStorage(updatedItems);
        return newItem.id;
    }, [historyItems, saveToStorage]);

    // 获取所有历史记录
    const getHistoryList = useCallback(() => {
        return historyItems;
    }, [historyItems]);

    // 获取单条历史记录
    const getHistory = useCallback((id: string) => {
        return historyItems.find(item => item.id === id);
    }, [historyItems]);

    // 删除历史记录
    const deleteHistory = useCallback((id: string) => {
        const updatedItems = historyItems.filter(item => item.id !== id);
        saveToStorage(updatedItems);
    }, [historyItems, saveToStorage]);

    // 清空所有历史记录
    const clearHistory = useCallback(() => {
        saveToStorage([]);
    }, [saveToStorage]);

    // 更新历史记录名称
    const updateHistoryName = useCallback((id: string, name: string) => {
        const updatedItems = historyItems.map(item =>
            item.id === id ? { ...item, name } : item
        );
        saveToStorage(updatedItems);
    }, [historyItems, saveToStorage]);

    return {
        historyItems,
        saveHistory,
        getHistoryList,
        getHistory,
        deleteHistory,
        clearHistory,
        updateHistoryName
    };
}
