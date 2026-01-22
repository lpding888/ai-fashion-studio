'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StyleAnalyzer } from '@/components/style-analyzer';
import { Plus, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import api from '@/lib/api';
import { StyleCard } from './style-card';
import { StyleEditDialog, StylePreset } from './style-edit-dialog';


const fetcher = (url: string) => api.get(url).then(res => res.data);

export default function AdminStylesPage() {
    const { toast } = useToast();
    const { mutate } = useSWRConfig();
    const { data: presets = [], error } = useSWR<StylePreset[]>('/style-presets', fetcher);

    const [isCreating, setIsCreating] = useState(false);

    // Edit State
    const [editingPreset, setEditingPreset] = useState<StylePreset | null>(null);

    // Deletion
    const handleDelete = async (id: string) => {
        if (!confirm('确定要删除这个风格预设吗？')) return;
        try {
            await api.delete(`/style-presets/${id}`);
            toast({ title: "删除成功" });
            mutate('/style-presets');
        } catch {
            toast({ title: "删除失败", variant: "destructive" });
        }
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">风格库管理</h2>
                    <p className="text-muted-foreground">管理AI生成风格预设 (共 {presets.length} 个)</p>
                </div>
                <Button onClick={() => setIsCreating(!isCreating)} className={isCreating ? "bg-red-100 text-red-600 hover:bg-red-200" : ""}>
                    {isCreating ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                    {isCreating ? "取消创建" : "新增风格"}
                </Button>
            </div>

            {/* Creation Area */}
            {isCreating && (
                <Card className="border-purple-500/20 bg-purple-50/5">
                    <CardHeader>
                        <CardTitle>✨ AI 风格学习 (Style Learning)</CardTitle>
                        <CardDescription>
                            上传参考图（支持1-5张），AI 将自动分析风格、生成名称并直接入库。
                            <br />
                            <span className="text-xs text-muted-foreground">无需手动填写参数，一切交给 AI。</span>
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="max-w-xl mx-auto py-4">
                            <StyleAnalyzer
                                onAnalysisComplete={(preset) => {
                                    toast({
                                        title: "风格习得成功",
                                        description: `已收录风格: "${preset.name}"`,
                                    });
                                    setIsCreating(false);
                                    mutate('/style-presets');
                                }}
                            />
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Grid List */}
            {presets.length === 0 && !error ? (
                <div className="text-center py-10 text-muted-foreground">
                    暂无风格预设，请点击右上角新增。
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {presets.map((preset) => (
                        <StyleCard
                            key={preset.id}
                            preset={preset}
                            onEdit={setEditingPreset}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            )}

            {/* Edit Dialog */}
            <StyleEditDialog
                preset={editingPreset}
                open={!!editingPreset}
                onOpenChange={(open) => !open && setEditingPreset(null)}
            />
        </div>
    );
}
