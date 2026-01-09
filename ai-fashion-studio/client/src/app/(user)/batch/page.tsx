'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Upload,
    X,
    Plus,
    Settings2,
    Sparkles,
    Layers,
    ArrowRight,
    Loader2,
    CheckCircle2,
    Undo2,
    Image as ImageIcon,
    Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import api from '@/lib/api';

// --- Types ---

interface TaskGroup {
    id: string;
    name: string; // "Look 1", "SKU001"
    files: File[];
    // Per-group overrides
    requirements: string;
    status: 'draft' | 'submitting' | 'success' | 'error';
}

interface GlobalConfig {
    style: string;
    location: string;
    resolution: string;
    autoApprove: boolean;
}

// --- Components ---

function FileUploadZone({ onFilesSelected }: { onFilesSelected: (files: File[]) => void }) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.length) {
            onFilesSelected(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')));
        }
    };

    return (
        <div
            onClick={() => inputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
        relative overflow-hidden rounded-3xl border-2 border-dashed transition-all duration-300 cursor-pointer
        flex flex-col items-center justify-center p-12 text-center group
        ${isDragging
                    ? 'border-purple-500 bg-purple-500/5 scale-[1.01]'
                    : 'border-slate-200 hover:border-purple-400 hover:bg-slate-50'
                }
      `}
        >
            <input
                type="file"
                multiple
                accept="image/*"
                ref={inputRef}
                className="hidden"
                onChange={(e) => {
                    if (e.target.files?.length) {
                        onFilesSelected(Array.from(e.target.files));
                    }
                }}
            />

            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-100 to-indigo-100 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-sm">
                <Upload className="w-10 h-10 text-purple-600" />
            </div>

            <h3 className="text-2xl font-bold text-slate-800 mb-2">导入新款图集</h3>
            <p className="text-slate-500 mb-6 max-w-md">
                将同一款式的多张角度图拖入此处，系统将自动按文件名为您归档分组。
            </p>

            <div className="flex gap-4">
                <Badge variant="secondary" className="bg-slate-100 text-slate-500 hover:bg-slate-200">
                    支持 JPG/PNG/WebP
                </Badge>
                <Badge variant="secondary" className="bg-slate-100 text-slate-500 hover:bg-slate-200">
                    智能文件名分组
                </Badge>
            </div>
        </div>
    );
}

function GroupCard({
    group,
    onUpdate,
    onDelete
}: {
    group: TaskGroup;
    onUpdate: (id: string, updates: Partial<TaskGroup>) => void;
    onDelete: (id: string) => void;
}) {
    const [isFlipped, setIsFlipped] = useState(false);

    // Front Face (Images)
    const FrontFace = (
        <div className="absolute inset-0 bg-white rounded-2xl p-4 flex flex-col backface-hidden">
            <div className="flex justify-between items-start mb-3">
                <div>
                    <h4 className="font-bold text-slate-800 flex items-center gap-2">
                        {group.status === 'success' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                        {group.name}
                    </h4>
                    <span className="text-xs text-slate-400">{group.files.length} 张图片</span>
                </div>
                <div className="flex gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-purple-600"
                        onClick={(e) => { e.stopPropagation(); setIsFlipped(true); }}
                    >
                        <Settings2 className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-red-500"
                        onClick={(e) => { e.stopPropagation(); onDelete(group.id); }}
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            <div className="flex-1 grid grid-cols-2 gap-2 overflow-hidden rounded-xl bg-slate-50 p-2 border border-slate-100">
                {group.files.slice(0, 4).map((file, i) => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-white">
                        <img
                            src={URL.createObjectURL(file)}
                            alt="preview"
                            className="w-full h-full object-cover"
                        />
                        {i === 3 && group.files.length > 4 && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-bold">
                                +{group.files.length - 4}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {group.requirements ? (
                <div className="mt-3 text-xs text-slate-500 line-clamp-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <span className="font-semibold text-purple-600 mr-1">特定需求:</span>
                    {group.requirements}
                </div>
            ) : (
                <div className="mt-3 text-xs text-slate-300 text-center italic py-2">
                    使用全局配置 (点击右上角设置修改)
                </div>
            )}

            {/* Status Overlay */}
            {group.status === 'submitting' && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-2xl z-20">
                    <div className="text-center">
                        <Loader2 className="w-8 h-8 text-purple-600 animate-spin mx-auto mb-2" />
                        <p className="text-xs font-semibold text-purple-700">创建中...</p>
                    </div>
                </div>
            )}
            {group.status === 'success' && (
                <div className="absolute inset-0 bg-green-50/90 backdrop-blur-sm flex items-center justify-center rounded-2xl z-20 border-2 border-green-200">
                    <div className="text-center">
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                            <CheckCircle2 className="w-6 h-6 text-green-600" />
                        </div>
                        <p className="font-bold text-green-800">已创建</p>
                    </div>
                </div>
            )}
        </div>
    );

    // Back Face (Settings)
    const BackFace = (
        <div
            className="absolute inset-0 bg-slate-900 rounded-2xl p-5 flex flex-col backface-hidden text-white rotate-y-180"
            style={{ transform: "rotateY(180deg)" }}
        >
            <div className="flex justify-between items-center mb-4">
                <h4 className="font-bold text-white/90">单组覆盖配置</h4>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-white/50 hover:text-white"
                    onClick={() => setIsFlipped(false)}
                >
                    <Undo2 className="w-4 h-4" />
                </Button>
            </div>

            <div className="space-y-4 flex-1">
                <div className="space-y-2">
                    <label className="text-xs font-medium text-purple-300 uppercase tracking-wider">
                        修改名称
                    </label>
                    <Input
                        value={group.name}
                        onChange={(e) => onUpdate(group.id, { name: e.target.value })}
                        className="bg-white/10 border-white/10 text-white placeholder:text-white/30 h-9"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-medium text-purple-300 uppercase tracking-wider">
                        特定需求描述
                    </label>
                    <Textarea
                        value={group.requirements}
                        onChange={(e) => onUpdate(group.id, { requirements: e.target.value })}
                        placeholder="对此款式的特别说明..."
                        className="bg-white/10 border-white/10 text-white placeholder:text-white/30 resize-none h-24 text-sm"
                    />
                </div>
            </div>

            <Button
                size="sm"
                className="w-full bg-white/10 hover:bg-white/20 text-white border-0"
                onClick={() => setIsFlipped(false)}
            >
                完成
            </Button>
        </div>
    );

    return (
        <div className="relative group w-full aspect-[3/4] perspective-1000">
            <motion.div
                initial={false}
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={{ duration: 0.6, type: "spring" }}
                className="w-full h-full relative preserve-3d shadow-xl hover:shadow-2xl transition-shadow rounded-2xl"
                style={{ transformStyle: "preserve-3d" }}
            >
                {FrontFace}
                {BackFace}
            </motion.div>
        </div>
    );
}

// --- Main Page ---

export default function BatchCreatePage() {
    const router = useRouter();
    const [groups, setGroups] = useState<TaskGroup[]>([]);
    const [globalConfig, setGlobalConfig] = useState<GlobalConfig>({
        style: '极简高级感',
        location: '专业影棚',
        resolution: '2K',
        autoApprove: true,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Smart Grouping Logic
    const handleFilesSelected = (files: File[]) => {
        const newGroups = new Map<string, File[]>();

        // 1. Group by prefix
        files.forEach(file => {
            // Regex for "SKU001_", "Name-", etc.
            const match = file.name.match(/^([^_]+)_/) ||
                file.name.match(/^([^-]+)-/) ||
                [null, file.name.split('.')[0]]; // Fallback

            const prefix = match ? match[1] : '未分组';

            if (!newGroups.has(prefix)) {
                newGroups.set(prefix, []);
            }
            newGroups.get(prefix)?.push(file);
        });

        // 2. Convert to TaskGroup objects
        const createdGroups: TaskGroup[] = Array.from(newGroups.entries()).map(([name, groupFiles]) => ({
            id: Math.random().toString(36).substring(7),
            name,
            files: groupFiles,
            requirements: "",
            status: 'draft'
        }));

        setGroups(prev => [...prev, ...createdGroups]);
    };

    const updateGroup = (id: string, updates: Partial<TaskGroup>) => {
        setGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
    };

    const deleteGroup = (id: string) => {
        setGroups(prev => prev.filter(g => g.id !== id));
    };

    const handleBatchSubmit = async () => {
        setIsSubmitting(true);
        let successCount = 0;

        for (const group of groups) {
            if (group.status === 'success') continue;

            updateGroup(group.id, { status: 'submitting' });

            try {
                const formData = new FormData();
                // Append all images
                group.files.forEach(file => {
                    formData.append('images', file);
                });

                // Construct requirements
                const reqText = group.requirements
                    ? `${group.requirements}. 风格: ${globalConfig.style}. 地点: ${globalConfig.location}`
                    : `为 ${group.name} 拍摄服装展示图. 风格: ${globalConfig.style}. 地点: ${globalConfig.location}`;

                formData.append('requirements', reqText);
                formData.append('autoApprove', String(globalConfig.autoApprove));
                // Note: Backend might need to handle 'images' array if it doesn't already. 
                // Assuming current backend can handle multiple files for task creation.

                await api.post('/tasks', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                updateGroup(group.id, { status: 'success' });
                successCount++;
            } catch (error) {
                console.error(`Failed to submit group ${group.name}`, error);
                updateGroup(group.id, { status: 'error' });
            }
        }

        setIsSubmitting(false);

        // If all success, maybe redirect or show toast
        if (successCount === groups.length) {
            setTimeout(() => router.push('/'), 1500);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 relative overflow-hidden">
            {/* Background Decor */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-100/50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

            <div className="max-w-[1600px] mx-auto p-8 relative z-10">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Badge className="bg-black text-white px-3 py-1 text-xs">Collection Studio</Badge>
                            <span className="text-purple-600 font-bold tracking-tight text-sm uppercase">AI Fashion Workflow</span>
                        </div>
                        <h1 className="text-4xl font-black text-slate-900 tracking-tight">
                            批量企划室
                        </h1>
                        <p className="text-slate-500 mt-2">
                            像整理胶卷一样管理您的设计系列
                        </p>
                    </div>

                    {/* Global Config Bar */}
                    <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap items-center gap-2">
                        <Select
                            value={globalConfig.style}
                            onValueChange={(v) => setGlobalConfig(prev => ({ ...prev, style: v }))}
                        >
                            <SelectTrigger className="w-[140px] border-0 bg-slate-50 h-10 rounded-xl font-medium">
                                <SelectValue placeholder="风格" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="极简高级感">极简高级感</SelectItem>
                                <SelectItem value="街头潮流">街头潮流</SelectItem>
                                <SelectItem value="森系清新">森系清新</SelectItem>
                                <SelectItem value="赛博朋克">赛博朋克</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select
                            value={globalConfig.location}
                            onValueChange={(v) => setGlobalConfig(prev => ({ ...prev, location: v }))}
                        >
                            <SelectTrigger className="w-[140px] border-0 bg-slate-50 h-10 rounded-xl font-medium">
                                <SelectValue placeholder="地点" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="专业影棚">专业影棚</SelectItem>
                                <SelectItem value="自然户外">自然户外</SelectItem>
                                <SelectItem value="城市街拍">城市街拍</SelectItem>
                                <SelectItem value="海边度假">海边度假</SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="w-px h-8 bg-slate-200 mx-1" />

                        <Button
                            size="lg"
                            className={`bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-8 transition-all ${groups.length === 0 ? 'opacity-50 cursor-not-allowed' : 'shadow-lg shadow-purple-900/20'
                                }`}
                            disabled={groups.length === 0 || isSubmitting}
                            onClick={handleBatchSubmit}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    生成中 {groups.filter(g => g.status === 'success').length}/{groups.length}
                                </>
                            ) : (
                                <>
                                    生成本季系列 <ArrowRight className="w-4 h-4 ml-2" />
                                </>
                            )}
                        </Button>
                    </div>
                </div>

                {/* Main Content Area */}
                {groups.length === 0 ? (
                    <div className="max-w-2xl mx-auto mt-20">
                        <FileUploadZone onFilesSelected={handleFilesSelected} />

                        {/* Demo Tips */}
                        <div className="mt-12 grid grid-cols-3 gap-6 opacity-60">
                            <div className="text-center">
                                <div className="bg-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm text-lg">📂</div>
                                <h4 className="font-bold text-slate-700 text-sm">拖入文件夹</h4>
                                <p className="text-xs text-slate-500 mt-1">支持一次性拖入整个文件夹的所有图片</p>
                            </div>
                            <div className="text-center">
                                <div className="bg-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm text-lg">🏷️</div>
                                <h4 className="font-bold text-slate-700 text-sm">自动归档</h4>
                                <p className="text-xs text-slate-500 mt-1">系统自动识别 SKU001_xxx 等命名规则</p>
                            </div>
                            <div className="text-center">
                                <div className="bg-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm text-lg">⚡</div>
                                <h4 className="font-bold text-slate-700 text-sm">批量并发</h4>
                                <p className="text-xs text-slate-500 mt-1">一键生成整个系列，效率提升10倍</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 items-start">
                        {/* Add More Card */}
                        <div className="aspect-[3/4] rounded-3xl border-2 border-dashed border-slate-200 hover:border-purple-300 hover:bg-purple-50 transition-colors cursor-pointer flex flex-col items-center justify-center text-slate-400 hover:text-purple-600 gap-2 relative group">
                            <input
                                type="file"
                                multiple
                                accept="image/*"
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                onChange={(e) => e.target.files && handleFilesSelected(Array.from(e.target.files))}
                            />
                            <Plus className="w-8 h-8" />
                            <span className="font-bold text-sm">添加更多</span>
                        </div>

                        {/* Group Cards */}
                        <AnimatePresence>
                            {groups.map(group => (
                                <motion.div
                                    key={group.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    transition={{ type: "spring", duration: 0.5 }}
                                >
                                    <GroupCard
                                        group={group}
                                        onUpdate={updateGroup}
                                        onDelete={deleteGroup}
                                    />
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}

            </div>
        </div>
    );
}
