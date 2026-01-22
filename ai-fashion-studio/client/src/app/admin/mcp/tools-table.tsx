'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { McpStatus } from './types';

interface ToolsTableProps {
    status: McpStatus | null;
    loading: boolean;
}

export function ToolsTable({ status, loading }: ToolsTableProps) {
    const rows = (status?.tools || [])
        .map((t) => ({
            name: t,
            count: Number(status?.toolCallCounts?.[t] || 0),
        }))
        .sort((a, b) => b.count - a.count);

    return (
        <Card>
            <CardHeader>
                <CardTitle>工具调用统计</CardTitle>
                <CardDescription>从服务端状态获取</CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="py-8 text-center text-muted-foreground">加载中...</div>
                ) : rows.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">暂无工具数据</div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>工具名称</TableHead>
                                <TableHead className="text-right">累计调用次数</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((r) => (
                                <TableRow key={r.name}>
                                    <TableCell className="font-mono text-sm">{r.name}</TableCell>
                                    <TableCell className="text-right font-mono text-sm">{r.count}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}
