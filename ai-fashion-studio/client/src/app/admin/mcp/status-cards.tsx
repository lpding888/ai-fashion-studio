'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { McpStatus } from './types';

interface StatusCardsProps {
    status: McpStatus | null;
}

export function StatusCards({ status }: StatusCardsProps) {
    const fmtTs = (ts?: number) => {
        if (!ts) return '-';
        try {
            return new Date(ts).toLocaleString('zh-CN');
        } catch {
            return String(ts);
        }
    };

    return (
        <div className="grid gap-4 md:grid-cols-3">
            <Card>
                <CardHeader>
                    <CardTitle>服务</CardTitle>
                    <CardDescription>名称/版本</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    <div className="text-sm">
                        <span className="text-muted-foreground mr-2">Name:</span>
                        <span className="font-mono">{status?.name || '-'}</span>
                    </div>
                    <div className="text-sm">
                        <span className="text-muted-foreground mr-2">Version:</span>
                        <span className="font-mono">{status?.version || '-'}</span>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>连接</CardTitle>
                    <CardDescription>SSE Transport 状态</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Badge variant={status?.hasActiveTransport ? 'default' : 'secondary'}>
                            {status?.hasActiveTransport ? 'Active' : 'Inactive'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">sessions={status?.activeSessions ?? '-'}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">最近连接：{fmtTs(status?.lastConnectedAt)}</div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>调用</CardTitle>
                    <CardDescription>工具调用统计</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    <div className="text-sm">
                        <span className="text-muted-foreground mr-2">工具数:</span>
                        <span className="font-mono">{status?.tools?.length ?? '-'}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">最近调用：{fmtTs(status?.lastToolCallAt)}</div>
                </CardContent>
            </Card>
        </div>
    );
}
