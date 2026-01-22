'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/admin/shared/data-table/data-table';
import { columns } from './columns';
import { PageHeader } from '@/components/admin/shared/page-header';
import { UserDialog } from '@/components/admin/user-dialog';
import { BACKEND_ORIGIN } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';
import { useSWRConfig } from 'swr';

const fetcher = (url: string) => {
    const token = localStorage.getItem('token');
    return fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
    }).then(res => res.json());
};

export default function AdminUsersPage() {
    const { mutate } = useSWRConfig();
    const { data, isLoading } = useSWR(
        `${BACKEND_ORIGIN}/api/auth/admin/users`,
        fetcher
    );

    const [openCreate, setOpenCreate] = useState(false);

    const users = Array.isArray(data?.users) ? data.users : [];

    const handleCreateUser = async (userData: {
        username: string;
        email?: string;
        role: 'ADMIN' | 'USER';
        status: 'ACTIVE' | 'DISABLED' | 'PENDING';
    }) => {
        const token = localStorage.getItem('token');
        const res = await fetch(`${BACKEND_ORIGIN}/api/auth/admin/create-user`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                ...userData,
                password: 'temp123456', // Default temp password
                credits: 100
            }),
        });

        if (!res.ok) throw new Error('创建失败');

        toast({ title: '用户创建成功', description: '默认密码: temp123456' });
        mutate((key: string) => key.includes('/api/auth/admin/users'));
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <PageHeader
                title="用户管理"
                description="管理系统注册用户、积分与权限状态"
            >
                <Button onClick={() => setOpenCreate(true)} className="bg-gradient-to-r from-orange-500 to-pink-500 hover:opacity-90 transition-opacity border-none">
                    <Plus className="mr-2 h-4 w-4" />
                    添加用户
                </Button>
            </PageHeader>

            <DataTable
                columns={columns}
                data={users}
                searchKey="username"
                loading={isLoading}
            />

            <UserDialog
                open={openCreate}
                onOpenChange={setOpenCreate}
                onSave={handleCreateUser}
            />
        </div>
    );
}
