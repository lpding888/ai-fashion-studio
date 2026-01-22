'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PromptVersionMeta, ActiveRef } from './types';

interface HistoryProps {
    versions: PromptVersionMeta[];
    activeRef: ActiveRef | null;
    loading: boolean;
    onLoad: (id: string) => void;
    onPublish: (id: string) => void;
}

function formatTime(ms?: number) {
    if (!ms) return '-';
    return new Date(ms).toLocaleString('zh-CN');
}

export function History({ versions, activeRef, loading, onLoad, onPublish }: HistoryProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>版本列表</CardTitle>
                <CardDescription>点击加载到编辑器，或发布某个版本</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>版本</TableHead>
                            <TableHead>创建时间</TableHead>
                            <TableHead>创建人</TableHead>
                            <TableHead>备注</TableHead>
                            <TableHead className="text-right">操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {versions.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="text-muted-foreground text-center">
                                    暂无版本（首次启动会从 docs/learn-prompts 自动 seed）
                                </TableCell>
                            </TableRow>
                        )}
                        {versions.map((v) => (
                            <TableRow key={v.versionId}>
                                <TableCell className="font-mono text-xs">
                                    {v.versionId.slice(0, 8)}
                                    {activeRef?.versionId === v.versionId ? <Badge className="ml-2">active</Badge> : null}
                                </TableCell>
                                <TableCell>{formatTime(v.createdAt)}</TableCell>
                                <TableCell>{v.createdBy?.username || '-'}</TableCell>
                                <TableCell className="max-w-[380px] truncate">{v.note || '-'}</TableCell>
                                <TableCell className="text-right space-x-2">
                                    <Button variant="outline" size="sm" onClick={() => onLoad(v.versionId)}>
                                        加载
                                    </Button>
                                    <Button size="sm" onClick={() => onPublish(v.versionId)} disabled={loading}>
                                        发布
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
