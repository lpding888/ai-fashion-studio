/**
 * 表单历史记录管理 Hook
 * 使用 LocalStorage 保存最近5次的表单配置
 */

import { useState, useEffect, useCallback } from 'react';

const HISTORY_KEY = 'ai-fashion-form-history';
const MAX_HISTORY_ITEMS = 50;

export interface FormHistoryItem {
    id: string;
    timestamp: number;
    name?: string;
    note?: string; // 备注（可选）

    // 表单配置
    requirements: string;
    resolution: '1K' | '2K' | '4K';
    aspectRatio: string;
    layoutMode: 'Individual' | 'Grid';
    shotCount: number;
    workflow?: 'legacy' | 'hero_storyboard';
    autoApproveHero?: boolean;

    facePresetIds?: string[];
    stylePresetIds?: string[];

    // 可选参数
    location?: string;
    styleDirection?: string;
    garmentFocus?: string;

    // 下载水印样式（仅在下载时叠加；款号/文本在 Batch 创建时逐任务输入）
    watermarkPosition?: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | 'center';
    watermarkOpacity?: number; // 0~1
    watermarkSize?: 'small' | 'medium' | 'large' | 'auto';
    watermarkColor?: 'white' | 'black';
    watermarkStroke?: boolean;
    watermarkShadow?: boolean;

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

    // 保存到 LocalStorage
    const saveToStorage = useCallback((items: FormHistoryItem[]) => {
        try {
            const data: FormHistoryData = {
                version: 3,
                items
            };
            localStorage.setItem(HISTORY_KEY, JSON.stringify(data));
            setHistoryItems(items);
        } catch (error) {
            console.error('保存历史记录失败:', error);
        }
    }, []);

    // 加载历史记录
    useEffect(() => {
        try {
            const stored = localStorage.getItem(HISTORY_KEY);
            if (!stored) return;

            const data: FormHistoryData = JSON.parse(stored);
            if (!Array.isArray(data.items)) return;

            // v1 -> v2 迁移：补齐新增字段
            if (data.version === 1) {
                const migrated = data.items.map((item) => ({
                    ...item,
                    note: '',
                    workflow: 'legacy' as const,
                    autoApproveHero: false,
                    facePresetIds: [],
                    stylePresetIds: [],
                    watermarkPosition: 'bottom_right' as const,
                    watermarkOpacity: 0.6,
                    watermarkSize: 'auto' as const,
                    watermarkColor: 'white' as const,
                    watermarkStroke: true,
                    watermarkShadow: false,
                }));
                saveToStorage(migrated);
                return;
            }

            if (data.version === 2) {
                const migrated = data.items.map((item) => ({
                    ...item,
                    watermarkPosition: item.watermarkPosition ?? ('bottom_right' as const),
                    watermarkOpacity: typeof item.watermarkOpacity === 'number' ? item.watermarkOpacity : 0.6,
                    watermarkSize: item.watermarkSize ?? ('auto' as const),
                    watermarkColor: item.watermarkColor ?? ('white' as const),
                    watermarkStroke: typeof item.watermarkStroke === 'boolean' ? item.watermarkStroke : true,
                    watermarkShadow: typeof item.watermarkShadow === 'boolean' ? item.watermarkShadow : false,
                }));
                saveToStorage(migrated);
                return;
            }

            if (data.version === 3) {
                setHistoryItems(data.items);
            }
        } catch (error) {
            console.error('加载历史记录失败:', error);
        }
    }, [saveToStorage]);

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

    const updateHistoryNote = useCallback((id: string, note: string) => {
        const sanitized = (note || '').slice(0, 500);
        const updatedItems = historyItems.map(item =>
            item.id === id ? { ...item, note: sanitized } : item
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
        updateHistoryName,
        updateHistoryNote
    };
}
