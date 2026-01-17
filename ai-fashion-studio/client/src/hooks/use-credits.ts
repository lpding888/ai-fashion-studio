'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { useAuth } from './use-auth';

// 每张图片消费的积分
export const CREDITS_PER_IMAGE = 1;

export type CreditCostParams = {
    shotCount: number;
    layoutMode?: 'Individual' | 'Grid' | string;
    resolution?: '1K' | '2K' | '4K' | string;
};

const resolutionMultiplier = (resolution: CreditCostParams['resolution']) => (resolution === '4K' ? 4 : 1);

// 口径对齐后端：1 张图=1；拼图=2；4K=4x
export const calculateRequiredCredits = (params: CreditCostParams) => {
    const shotCount = Number.isFinite(params.shotCount) ? Math.max(0, Math.floor(params.shotCount)) : 0;
    const layoutMode = (params.layoutMode || 'Individual') as string;
    const baseUnits = layoutMode === 'Grid' ? 2 : shotCount;
    return baseUnits * resolutionMultiplier(params.resolution);
};

export interface UserCredits {
    userId: string;
    balance: number;
    totalEarned: number;
    totalSpent: number;
}

export interface CreditCheckResult {
    enough: boolean;
    required: number;
    balance: number;
}

const CREDITS_REFRESH_EVENT = 'ai-fashion:credits-refresh';

export const requestCreditsRefresh = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event(CREDITS_REFRESH_EVENT));
};

export function useCredits() {
    const { user, isAuthenticated } = useAuth();
    const [credits, setCredits] = useState<UserCredits | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 获取用户积分余额
    const fetchCredits = useCallback(async () => {
        if (!user?.id || !isAuthenticated) {
            setCredits(null);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const res = await api.get(`/credits?userId=${user.id}`);
            setCredits(res.data);
        } catch (err: any) {
            console.error('获取积分失败:', err);
            setError(err?.response?.data?.message || '获取积分失败');
            // 设置默认值
            setCredits({
                userId: user.id,
                balance: 0,
                totalEarned: 0,
                totalSpent: 0,
            });
        } finally {
            setLoading(false);
        }
    }, [user?.id, isAuthenticated]);

    // 检查积分是否足够（前端预估；最终以服务端为准）
    const checkCredits = useCallback(async (params: CreditCostParams): Promise<CreditCheckResult> => {
        const required = calculateRequiredCredits(params);
        return {
            enough: (credits?.balance ?? 0) >= required,
            required,
            balance: credits?.balance ?? 0,
        };
    }, [credits?.balance]);

    // 计算所需积分（前端预估；最终以服务端为准）
    const calculateRequired = (params: CreditCostParams) => calculateRequiredCredits(params);

    // 刷新积分
    const refresh = () => fetchCredits();

    // 管理员充值
    const adminRecharge = useCallback(async (targetUserId: string, amount: number, reason?: string) => {
        if (!user?.id) return false;
        try {
            await api.post('/credits/admin/recharge', {
                userId: targetUserId,
                amount,
                reason,
                adminId: user.id
            });
            await fetchCredits(); // 充值后刷新
            return true;
        } catch (err: any) {
            console.error('充值失败:', err);
            throw err;
        }
    }, [user?.id, fetchCredits]);

    // 初始化时获取积分
    useEffect(() => {
        fetchCredits();
    }, [fetchCredits]);

    // 监听全局刷新事件：让 Navbar/页面上的多个实例能同时更新
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!isAuthenticated) return;

        const handler = () => { fetchCredits(); };
        window.addEventListener(CREDITS_REFRESH_EVENT, handler);
        return () => window.removeEventListener(CREDITS_REFRESH_EVENT, handler);
    }, [fetchCredits, isAuthenticated]);

    return {
        credits,
        balance: credits?.balance ?? 0,
        loading,
        error,
        checkCredits,
        calculateRequired,
        refresh,
        adminRecharge,
        isLoaded: !loading && credits !== null,
    };
}
