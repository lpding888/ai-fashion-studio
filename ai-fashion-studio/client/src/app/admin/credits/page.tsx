'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/admin/shared/data-table/data-table';
import { columns } from './columns';
import { PageHeader } from '@/components/admin/shared/page-header';
import { StatCard } from '@/components/admin/shared/stat-card';
import { RechargeDialog } from './recharge-dialog';
import api from '@/lib/api';

const fetcher = (url: string) => api.get(url).then(res => res.data);

export default function AdminCreditsPage() {
    const [openRecharge, setOpenRecharge] = useState(false);

    // Fetch overview data: recent 500 transactions, top 10 users
    const { data, isLoading } = useSWR('/credits/admin/overview?recentN=500&topN=10', fetcher);

    // Data parsing
    const totalCredits = data?.totalCredits || 0;
    const recentTransactions = Array.isArray(data?.recentTransactions) ? data.recentTransactions : [];

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <PageHeader
                    title="积分管理"
                    description="监控系统积分流动与充值管理"
                />
                <Button
                    onClick={() => setOpenRecharge(true)}
                    className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 border-none shadow-lg shadow-orange-500/20"
                >
                    <Plus className="mr-2 h-4 w-4" />
                    充值积分
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="系统总积分池"
                    value={totalCredits.toLocaleString()}
                    icon={Coins}
                    description="当前系统内所有用户持有的积分总和 (实时)"
                    variant="orange"
                />
                {/* Future: Add more stats like "Today Spent", "Top Spender", etc. */}
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">最近流水 (Top 500)</h3>
                </div>
                <DataTable
                    columns={columns}
                    data={recentTransactions}
                    searchKey="reason"  // Simple search on reason
                    loading={isLoading}
                />
            </div>

            <RechargeDialog
                open={openRecharge}
                onOpenChange={setOpenRecharge}
            />
        </div>
    );
}
