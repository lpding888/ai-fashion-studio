'use client';

import * as React from 'react';
import { Download, FileArchive, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';
import { batchDownloadWithWatermarks, downloadAsZipWithWatermarks } from '@/lib/watermark';
import { BatchGroup } from './types';

interface BatchDownloadPanelProps {
    groups: BatchGroup[];
    autoWatermark: boolean;
}

export function BatchDownloadPanel(props: BatchDownloadPanelProps) {
    const { groups, autoWatermark } = props;
    const { toast } = useToast();

    const [isDownloading, setIsDownloading] = React.useState(false);
    const [progress, setProgress] = React.useState(0);
    const [total, setTotal] = React.useState(0);

    // 统计已完成的分组
    const completedGroups = React.useMemo(
        () => groups.filter((g) => g.status === 'COMPLETED' && g.images.length > 0),
        [groups]
    );

    const totalImages = React.useMemo(
        () => completedGroups.reduce((sum, g) => sum + g.images.length, 0),
        [completedGroups]
    );

    if (completedGroups.length === 0) return null;

    const handleIndividualDownload = async () => {
        setIsDownloading(true);
        setProgress(0);
        setTotal(totalImages);

        try {
            const items = completedGroups.flatMap((group) =>
                group.images.map((url, idx) => ({
                    url,
                    filename: `${group.watermarkText || group.name}_${idx + 1}.jpg`,
                    watermarkText: autoWatermark && group.watermarkText
                        ? group.watermarkText
                        : '', // 如果开启自动水印且有水印文字，则使用
                }))
            );

            await batchDownloadWithWatermarks(items, undefined, (current, total) => {
                setProgress(current);
                setTotal(total);
            });

            toast({ title: '下载完成', description: `共 ${totalImages} 张图片` });
        } catch (err) {
            toast({
                title: '下载失败',
                description: (err as Error)?.message || '未知错误',
                variant: 'destructive',
            });
        } finally {
            setIsDownloading(false);
            setProgress(0);
        }
    };

    const handleZipDownload = async () => {
        setIsDownloading(true);
        setProgress(0);
        setTotal(totalImages);

        try {
            const zipGroups = completedGroups.map((group) => ({
                name: group.name || '未命名分组',
                images: group.images.map((url, idx) => ({
                    url,
                    filename: `${group.watermarkText || group.name}_${idx + 1}.jpg`,
                    watermarkText: autoWatermark && group.watermarkText
                        ? group.watermarkText
                        : '',
                })),
            }));

            await downloadAsZipWithWatermarks(
                zipGroups,
                `batch-export-${Date.now()}.zip`,
                undefined,
                (current, total) => {
                    setProgress(current);
                    setTotal(total);
                }
            );

            toast({ title: 'ZIP 打包完成', description: `共 ${totalImages} 张图片` });
        } catch (err) {
            toast({
                title: '打包失败',
                description: (err as Error)?.message || '未知错误',
                variant: 'destructive',
            });
        } finally {
            setIsDownloading(false);
            setProgress(0);
        }
    };

    return (
        <Card className="border-0 bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 ring-1 ring-white/10 shadow-xl">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                    <Download className="w-4 h-4 text-emerald-400" />
                    批量下载 ({completedGroups.length} 组 / {totalImages} 图)
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {isDownloading && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-white/60">
                            <span>正在处理...</span>
                            <span>
                                {progress}/{total}
                            </span>
                        </div>
                        <Progress value={(progress / total) * 100} className="h-2" />
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                    <Button
                        size="sm"
                        variant="outline"
                        className="bg-white/5 border-white/10 text-white hover:bg-white/10"
                        onClick={handleIndividualDownload}
                        disabled={isDownloading}
                    >
                        {isDownloading ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <Download className="w-4 h-4 mr-2" />
                        )}
                        逐个下载
                    </Button>

                    <Button
                        size="sm"
                        className="bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-lg"
                        onClick={handleZipDownload}
                        disabled={isDownloading}
                    >
                        {isDownloading ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <FileArchive className="w-4 h-4 mr-2" />
                        )}
                        ZIP 打包
                    </Button>
                </div>

                {autoWatermark && (
                    <p className="text-[10px] text-emerald-300/60 text-center">
                        ✓ 已启用自动水印
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
