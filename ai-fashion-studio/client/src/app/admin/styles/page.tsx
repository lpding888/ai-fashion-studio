"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StyleAnalyzer } from '@/components/style-analyzer';
import { Plus, Trash2, X, Edit2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import api, { BACKEND_ORIGIN } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface StylePreset {
    id: string;
    name: string;
    description: string;
    imagePaths: string[];
    thumbnailPath: string;
    tags?: string[];
    styleHint?: string;
    createdAt: number;
    analysis?: any;
}

export default function AdminStylesPage() {
    const { toast } = useToast();
    const [presets, setPresets] = useState<StylePreset[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);

    // Edit State
    const [editingPreset, setEditingPreset] = useState<StylePreset | null>(null);
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editTags, setEditTags] = useState('');
    const [editHint, setEditHint] = useState('');

    useEffect(() => {
        loadPresets();
    }, []);

    const loadPresets = async () => {
        try {
            setIsLoading(true);
            const res = await api.get('/style-presets');
            setPresets(res.data);
        } catch (error) {
            toast({
                title: "加载失败",
                description: "无法获取风格预设列表",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    // Deletion
    const handleDelete = async (id: string) => {
        if (!confirm('确定要删除这个风格预设吗？')) return;
        try {
            await api.delete(`/style-presets/${id}`);
            setPresets(presets.filter(p => p.id !== id));
            toast({ title: "删除成功" });
        } catch (e) {
            toast({ title: "删除失败", variant: "destructive" });
        }
    }

    // Edit Handlers
    const startEditing = (preset: StylePreset) => {
        setEditingPreset(preset);
        setEditName(preset.name);
        setEditDesc(preset.description || '');
        setEditTags(preset.tags ? preset.tags.join(', ') : '');
        setEditHint(preset.styleHint || '');
    };

    const handleUpdate = async () => {
        if (!editingPreset) return;
        if (!editName.trim()) {
            toast({ title: "名称不能为空", variant: "destructive" });
            return;
        }

        try {
            const tags = editTags.split(/[,，]/).map(t => t.trim()).filter(Boolean); // Support both comma types

            await api.patch(`/style-presets/${editingPreset.id}`, {
                name: editName,
                description: editDesc,
                tags: JSON.stringify(tags), // Backend expects stringified JSON for tags? Wait, Controller checks `tagsStr` body param which parses to array. 
                // Let's check api call. Controller: @Body('tags') tagsStr?: string. 
                // Wait, if I send JSON object via axios, nestjs might parse it directly if content-type is json.
                // But the controller explicitly does JSON.parse(tagsStr). This implies it expects a string.
                // However, axios usually sends JSON object. 
                // If I send { tags: ["a", "b"] }, NestJS @Body('tags') might get the array directly if validation pipe allows, OR it might fail if logic strictly expects string to parse.
                // Reviewing controller: `tagsStr` is type string. `JSON.parse(tagsStr)`. 
                // If 'tags' in body is ALREADY an array (from axios json), `tagsStr` will be the array object.
                // `JSON.parse(object)` -> "[object Object]" -> Error.
                // So I MUST send it as a stringified JSON string OR backend should handle both.
                // safer to send as string if backend code is fixed.
                // Controller says: `@Body('tags') tagsStr?: string`.
                styleHint: editHint
            });

            toast({ title: "更新成功" });
            setEditingPreset(null);
            loadPresets();
        } catch (e) {
            console.error(e);
            toast({ title: "更新失败", description: "请检查网络或参数", variant: "destructive" });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">风格库管理</h2>
                    <p className="text-muted-foreground">管理AI生成风格预设 (共 {presets.length} 个)</p>
                </div>
                <Button onClick={() => setIsCreating(!isCreating)}>
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
                                onAnalysisComplete={(preset, files) => {
                                    toast({
                                        title: "风格习得成功",
                                        description: `已收录风格: "${preset.name}"`,
                                    });
                                    setIsCreating(false);
                                    loadPresets();
                                }}
                            />
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Grid List */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {presets.map((preset) => (
                    <Card key={preset.id} className="overflow-hidden hover:shadow-lg transition-all group">
                        <div className="relative aspect-video bg-muted">
                            {preset.thumbnailPath ? (
                                <img
                                    src={`${BACKEND_ORIGIN}/${preset.thumbnailPath}`} // Assuming static serve
                                    alt={preset.name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="flex items-center justify-center w-full h-full text-muted-foreground">
                                    无封面
                                </div>
                            )}
                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                    size="icon"
                                    variant="secondary"
                                    className="h-8 w-8 bg-white/90 hover:bg-white"
                                    onClick={() => startEditing(preset)}
                                >
                                    <Edit2 className="h-4 w-4 text-blue-600" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="destructive"
                                    className="h-8 w-8"
                                    onClick={() => handleDelete(preset.id)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                        <CardHeader className="p-4">
                            <div className="flex justify-between items-start">
                                <CardTitle className="text-lg line-clamp-1" title={preset.name}>{preset.name}</CardTitle>
                            </div>
                            <div className="flex flex-wrap gap-1 mt-2">
                                {preset.tags?.slice(0, 3).map((tag, i) => (
                                    <Badge key={i} variant="secondary" className="text-[10px] px-1 py-0">{tag}</Badge>
                                ))}
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            {/* Analysis Chips */}
                            {preset.analysis ? (
                                <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                                    <div className="bg-muted p-1 rounded px-2 truncate" title={`Vibe: ${preset.analysis.vibe}`}>✨ {preset.analysis.vibe}</div>
                                    <div className="bg-muted p-1 rounded px-2 truncate" title={`Grade: ${preset.analysis.grading}`}>🎨 {preset.analysis.grading}</div>
                                </div>
                            ) : (
                                <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                                    {preset.description || "暂无描述"}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Edit Dialog */}
            <Dialog open={!!editingPreset} onOpenChange={(open) => !open && setEditingPreset(null)}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>编辑风格预设</DialogTitle>
                        <DialogDescription>
                            调整 AI 自动生成的风格信息
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">
                                名称
                            </Label>
                            <Input
                                id="name"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="tags" className="text-right">
                                标签
                            </Label>
                            <Input
                                id="tags"
                                value={editTags}
                                onChange={(e) => setEditTags(e.target.value)}
                                placeholder="逗号分隔"
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-start gap-4">
                            <Label htmlFor="desc" className="text-right mt-2">
                                描述
                            </Label>
                            <Textarea
                                id="desc"
                                value={editDesc}
                                onChange={(e) => setEditDesc(e.target.value)}
                                className="col-span-3"
                                rows={3}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-start gap-4">
                            <Label htmlFor="hint" className="text-right mt-2">
                                核心参数
                            </Label>
                            <Textarea
                                id="hint"
                                value={editHint}
                                onChange={(e) => setEditHint(e.target.value)}
                                className="col-span-3 font-mono text-xs"
                                rows={4}
                                placeholder="Lighting, Scene, etc."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingPreset(null)}>取消</Button>
                        <Button onClick={handleUpdate}>保存修改</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
