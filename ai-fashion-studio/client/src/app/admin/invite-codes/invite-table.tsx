'use client';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

export type InviteCode = {
    id: string;
    createdAt: number;
    createdByUserId?: string;
    usedAt?: number;
    usedByUserId?: string;
    revokedAt?: number;
    note?: string;
    code?: string; // Sometimes returned
};

interface InviteTableProps {
    invites: InviteCode[];
    loading: boolean;
    revokingId: string | null;
    onRevoke: (id: string) => void;
}

export function InviteTable({ invites, loading, revokingId, onRevoke }: InviteTableProps) {
    if (loading) {
        return <div className="py-10 text-center text-muted-foreground">加载中...</div>;
    }

    if (invites.length === 0) {
        return <div className="py-10 text-center text-muted-foreground">暂无邀请码</div>;
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>状态</TableHead>
                    <TableHead>备注</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead>使用情况</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {invites.map((i) => {
                    const isUsed = !!i.usedAt || !!i.usedByUserId;
                    const isRevoked = !!i.revokedAt;
                    const status = isRevoked ? '已撤销' : isUsed ? '已使用' : '可用';
                    return (
                        <TableRow key={i.id}>
                            <TableCell>
                                <Badge variant={isRevoked ? 'outline' : isUsed ? 'secondary' : 'default'}>
                                    {status}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground max-w-[200px] truncate" title={i.note}>
                                {i.note || '-'}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                                {new Date(i.createdAt).toLocaleString('zh-CN')}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                                {isUsed ? (
                                    <div className="space-y-1">
                                        <div>用户: <span className="font-mono">{i.usedByUserId?.slice(0, 8)}...</span></div>
                                        <div>时间: {i.usedAt ? new Date(i.usedAt).toLocaleString('zh-CN') : '-'}</div>
                                    </div>
                                ) : (
                                    '-'
                                )}
                            </TableCell>
                            <TableCell className="text-right">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={isUsed || isRevoked || revokingId === i.id}
                                    onClick={() => onRevoke(i.id)}
                                    title="撤销"
                                >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}
