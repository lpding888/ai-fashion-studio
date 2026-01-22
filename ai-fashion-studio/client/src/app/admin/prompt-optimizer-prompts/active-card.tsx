'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ActiveRef, PromptVersion } from './types';

interface ActiveCardProps {
    activeRef: ActiveRef | null;
    activeVersion: PromptVersion | null;
}

function formatTime(ms?: number) {
    if (!ms) return '-';
    return new Date(ms).toLocaleString('zh-CN');
}

export function ActiveCard({ activeRef, activeVersion }: ActiveCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>当前生效版本</CardTitle>
                <CardDescription>用于 Learn 提示词自动优化</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                    <Badge variant="outline">active: {activeRef?.versionId ? activeRef.versionId.slice(0, 8) : '-'}</Badge>
                    <span className="text-muted-foreground">更新时间：{formatTime(activeRef?.updatedAt)}</span>
                    <span className="text-muted-foreground">更新人：{activeRef?.updatedBy?.username || '-'}</span>
                </div>
                {activeVersion && (
                    <div className="text-xs text-muted-foreground">
                        sha256: <span className="font-mono">{activeVersion.sha256}</span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
