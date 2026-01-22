'use client';

import { Suspense } from 'react';
import useSWR from 'swr';
import { useSearchParams } from 'next/navigation';
import { DataTable } from '@/components/admin/shared/data-table/data-table';
import { columns } from './columns';
import { PageHeader } from '@/components/admin/shared/page-header';
import api from '@/lib/api';

const fetcher = (url: string) => api.get(url).then(res => res.data);

function AdminTasksContent() {
    const searchParams = useSearchParams();
    const userId = searchParams?.get('userId');
    // We can use the 'users' approach: fetch logic.
    // However, for tasks, we might need filters.
    // The previous implementation had server-side filtering params: scope, q, userId, status.
    // UseSWR key should include these if we want server-side.
    // Or fetch all ? Fetching all tasks might be heavy.
    // The previous page.tsx had fetchTasks() with params.
    // Let's assume we want to keep server-side fetching because tasks can be many.
    // But `DataTable` likes all data for client features.
    // If the tasks list is < 1000, client side is fine.
    // Let's try fetching a decent limit (e.g. 200) or 'all' if possible.
    // API endpoint `/tasks` supports limit.
    // Let's fetch the latest 500 tasks for the admin dashboard view.

    // We can allow the user to filter by userId via the DataTable search if we fetch enough data,
    // OR we can pass initial filters from URL to the API call.

    const url = userId
        ? `/tasks?scope=all&limit=500&userId=${userId}`
        : `/tasks?scope=all&limit=500`;

    const { data: responseData, isLoading } = useSWR(url, fetcher);

    const tasks = Array.isArray(responseData?.tasks) ? responseData.tasks : [];

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <PageHeader
                title="任务管理"
                description="查看并管理所有生成任务 (展示最近 500 条)"
            />

            <DataTable
                columns={columns}
                data={tasks}
                searchKey="requirements"
                loading={isLoading}
            />
        </div>
    );
}

export default function AdminTasksPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-muted-foreground">加载中...</div>}>
            <AdminTasksContent />
        </Suspense>
    )
}
