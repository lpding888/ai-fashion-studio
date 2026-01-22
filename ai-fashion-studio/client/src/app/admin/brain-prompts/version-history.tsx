'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PromptVersionMeta } from './types';

interface VersionHistoryProps {
    versions: PromptVersionMeta[];
    onLoadToEditor: (id: string) => void;
    onSetA: (id: string) => void;
    onSetB: (id: string) => void;
    onPublish: (id: string) => void;
}

function formatTime(ms?: number) {
    if (!ms) return '-';
    return new Date(ms).toLocaleString('zh-CN');
}

export function VersionHistory({
    versions,
    onLoadToEditor,
    onSetA,
    onSetB,
    onPublish
}: VersionHistoryProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>历史版本</CardTitle>
                <CardDescription>点击加载/发布；A/B 对照建议选择“当前生效版本”作为 A</CardDescription>
            </CardHeader>
            <CardContent>
                {versions.length === 0 ? (
                    <div className="text-sm text-muted-foreground">暂无版本</div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>版本</TableHead>
                                <TableHead>创建时间</TableHead>
                                <TableHead>创建者</TableHead>
                                <TableHead>备注</TableHead>
                                <TableHead className="text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {versions.map((v) => (
                                <TableRow key={v.versionId}>
                                    <TableCell className="font-mono text-xs">{v.versionId}</TableCell>
                                    <TableCell className="text-muted-foreground">{formatTime(v.createdAt)}</TableCell>
                                    <TableCell>{v.createdBy?.username || '-'}</TableCell>
                                    <TableCell className="text-muted-foreground">{v.note || '-'}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button variant="ghost" size="sm" onClick={() => onLoadToEditor(v.versionId)}>加载</Button>
                                            <Button variant="ghost" size="sm" onClick={() => onSetA(v.versionId)}>设A</Button>
                                            <Button variant="ghost" size="sm" onClick={() => onSetB(v.versionId)}>设B</Button>
                                            <Button variant="outline" size="sm" onClick={() => onPublish(v.versionId)}>发布</Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}
