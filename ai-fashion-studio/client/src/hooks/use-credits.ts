'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { useAuth } from './use-auth';

// 每张图片消费的积分
export const CREDITS_PER_IMAGE = 10;

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

    // 检查积分是否足够
    const checkCredits = useCallback(async (shotCount: number): Promise<CreditCheckResult> => {
        if (!user?.id) {
            return { enough: false, required: shotCount * CREDITS_PER_IMAGE, balance: 0 };
        }

        try {
            const res = await api.get(`/credits/check?userId=${user.id}&shotCount=${shotCount}`);
            return res.data;
        } catch (err: any) {
            console.error('检查积分失败:', err);
            return {
                enough: false,
                required: shotCount * CREDITS_PER_IMAGE,
                balance: credits?.balance || 0
            };
        }
    }, [user?.id, credits?.balance]);

    // 计算所需积分
    const calculateRequired = (shotCount: number) => shotCount * CREDITS_PER_IMAGE;

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
