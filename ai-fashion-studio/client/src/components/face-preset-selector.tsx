"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useState, useRef } from 'react';
import { useFacePresetStore, FacePreset } from '@/store/face-preset-store';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Edit2, Check, Loader2, ImageIcon, Trash2, Eye, Ruler, Weight, User as UserIcon } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { getImageUrl } from '@/lib/utils';

interface FacePresetSelectorProps {
    selectedIds: string[];
    onSelect: (ids: string[]) => void;
    maxSelection?: number;
}

const getErrorMessage = (error: unknown, fallback: string) => {
    const maybe = error as { response?: { data?: { message?: string } }; message?: string };
    return maybe?.response?.data?.message || (error instanceof Error ? error.message : fallback);
};

export function FacePresetSelector({
    selectedIds,
    onSelect,
    maxSelection = 1
}: FacePresetSelectorProps) {
    const { presets, loading, fetchPresets, addPreset, deletePreset, updatePreset } = useFacePresetStore();
    const MAX_FACE_PRESET_FILE_SIZE = 10 * 1024 * 1024;
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [previewPreset, setPreviewPreset] = useState<FacePreset | null>(null);
    const [uploading, setUploading] = useState(false);

    // Upload Form State
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadName, setUploadName] = useState('');
    const [uploadGender, setUploadGender] = useState<string>('female');
    const [uploadHeight, setUploadHeight] = useState('');
    const [uploadWeight, setUploadWeight] = useState('');
    const [uploadMeasurements, setUploadMeasurements] = useState('');
    const [uploadDescription, setUploadDescription] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Edit State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    useEffect(() => {
        fetchPresets();
    }, [fetchPresets]); // 添加依赖项以消除 ESLint 警告

    const handleUpload = async () => {
        const trimmedName = uploadName.trim();
        if (!uploadFile || !trimmedName) {
            alert('请先上传图片并填写姓名');
            return;
        }
        setUploading(true);
        try {
            await addPreset(uploadFile, {
                name: trimmedName,
                gender: uploadGender,
                height: uploadHeight,
                weight: uploadWeight,
                measurements: uploadMeasurements,
                description: uploadDescription
            });
            setIsUploadOpen(false);
            resetForm();
        } catch (e: unknown) {
            alert(getErrorMessage(e, '上传失败'));
        } finally {
            setUploading(false);
        }
    };

    const resetForm = () => {
        setUploadFile(null);
        setUploadName('');
        setUploadHeight('');
        setUploadWeight('');
        setUploadMeasurements('');
        setUploadDescription('');
        setUploadGender('female');
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm('确定要删除这个预设吗？')) {
            await deletePreset(id);
            if (selectedIds.includes(id)) {
                onSelect(selectedIds.filter(i => i !== id));
            }
        }
    };

    const startEdit = (e: React.MouseEvent, preset: FacePreset) => {
        e.stopPropagation();
        setEditingId(preset.id);
        setEditName(preset.name);
    };

    const saveEdit = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (editingId && editName.trim()) {
            await updatePreset(editingId, { name: editName });
            setEditingId(null);
        }
    };

    const cancelEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingId(null);
    };

    const handleToggleSelect = (id: string) => {
        if (selectedIds.includes(id)) {
            onSelect(selectedIds.filter(i => i !== id));
        } else {
            if (selectedIds.length >= maxSelection) {
                // TODO: 替换为 Toast 通知以提升用户体验
                // 需要引入 Toast 组件库（如 sonner 或 shadcn/ui toast）
                alert(`最多只能选择 ${maxSelection} 个预设`);
                return;
            }
            onSelect([...selectedIds, id]);
        }
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {/* Add New Button */}
                <Dialog open={isUploadOpen} onOpenChange={(open) => {
                    setIsUploadOpen(open);
                    if (!open) resetForm();
                }}>
                    <DialogTrigger asChild>
                        <motion.div
                            whileHover={{ scale: 1.02, backgroundColor: "rgba(255,255,255,0.08)" }}
                            whileTap={{ scale: 0.98 }}
                            className="aspect-[3/4] rounded-2xl border border-white/10 bg-white/5 flex flex-col items-center justify-center cursor-pointer transition-colors group relative overflow-hidden"
                        >
                            <div className="w-12 h-12 rounded-full bg-white/5 group-hover:bg-indigo-500/20 flex items-center justify-center mb-3 transition-colors border border-white/10 group-hover:border-indigo-500/30">
                                <Plus className="w-6 h-6 text-slate-400 group-hover:text-indigo-400 transition-colors" />
                            </div>
                            <span className="text-xs text-slate-400 font-bold group-hover:text-slate-200 transition-colors">新建模特</span>

                            <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        </motion.div>
                    </DialogTrigger>

                    {/* Add Dialog Content */}
                    <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>添加新模特</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            {/* Image Upload */}
                            <div
                                className="border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center gap-4 cursor-pointer hover:bg-slate-50 hover:border-indigo-400 transition-all text-center"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {uploadFile ? (
                                    <div className="relative w-32 h-32 rounded-lg overflow-hidden border border-slate-200 shadow-sm">
                                        <img src={URL.createObjectURL(uploadFile)} alt="Preview" className="w-full h-full object-cover" />
                                    </div>
                                ) : (
                                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
                                        <ImageIcon className="w-10 h-10 text-slate-400" />
                                    </div>
                                )}
                                <div className="space-y-1">
                                    <p className="text-sm font-medium text-slate-700">{uploadFile ? '点击更换图片' : '上传模特照片'}</p>
                                    <p className="text-xs text-slate-400">支持 JPG, PNG (3:4 比例最佳)</p>
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0] || null;
                                        if (!file) {
                                            setUploadFile(null);
                                            return;
                                        }
                                        if (!file.type.startsWith('image/')) {
                                            alert('仅支持图片格式');
                                            e.currentTarget.value = '';
                                            return;
                                        }
                                        if (file.size > MAX_FACE_PRESET_FILE_SIZE) {
                                            alert('图片超过 10MB，请压缩后再上传');
                                            e.currentTarget.value = '';
                                            return;
                                        }
                                        setUploadFile(file);
                                        setUploadName((prev) => {
                                            if (prev.trim()) return prev;
                                            const derived = file.name.replace(/\.[^/.]+$/, '').trim();
                                            return derived || prev;
                                        });
                                        e.currentTarget.value = '';
                                    }}
                                />
                            </div>

                            {/* Basic Info */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>姓名</Label>
                                    <Input placeholder="例如：Luna" value={uploadName} onChange={e => setUploadName(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label>性别</Label>
                                    <Select value={uploadGender} onValueChange={setUploadGender}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="female">女性</SelectItem>
                                            <SelectItem value="male">男性</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="space-y-2">
                                    <Label className="text-xs">身高 (cm)</Label>
                                    <Input
                                        type="number"
                                        placeholder="175"
                                        value={uploadHeight}
                                        onChange={e => setUploadHeight(e.target.value)}
                                        onClick={e => e.stopPropagation()}
                                        autoComplete="off"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs">体重 (kg)</Label>
                                    <Input
                                        type="number"
                                        placeholder="50"
                                        value={uploadWeight}
                                        onChange={e => setUploadWeight(e.target.value)}
                                        onClick={e => e.stopPropagation()}
                                        autoComplete="off"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs">三围</Label>
                                    <Input
                                        placeholder="86-60-88"
                                        value={uploadMeasurements}
                                        onChange={e => setUploadMeasurements(e.target.value)}
                                        onClick={e => e.stopPropagation()}
                                        autoComplete="off"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>备注说明</Label>
                                <Textarea placeholder="描述模特的特征，例如：金发碧眼，高冷气质..." value={uploadDescription} onChange={e => setUploadDescription(e.target.value)} className="resize-none h-20" />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsUploadOpen(false)}>取消</Button>
                            <Button onClick={handleUpload} disabled={uploading}>
                                {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                保存
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Preset List */}
                <AnimatePresence>
                    {presets.map((preset) => {
                        const isSelected = selectedIds.includes(preset.id);
                        return (
                            <motion.div
                                key={preset.id}
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className={`relative group flex flex-col gap-2`}
                            >
                                {/* Valid interactive area for selection */}
                                <div
                                    onClick={() => handleToggleSelect(preset.id)}
                                    className={`relative aspect-[3/4] w-full rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 border ${isSelected
                                        ? 'border-indigo-500 shadow-[0_5px_20px_-5px_rgba(99,102,241,0.4)] ring-1 ring-indigo-500'
                                        : 'border-white/10 hover:border-white/30 hover:shadow-lg bg-black/20'
                                        }`}
                                >
                                    <img
                                        src={(() => {
                                            const url = getImageUrl(preset.imagePath);
                                            console.log('Loading image:', { name: preset.name, path: preset.imagePath, url });
                                            return url;
                                        })()}
                                        alt={preset.name}
                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                        loading="lazy"
                                        decoding="async"
                                        onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            console.error('Image load failed:', { name: preset.name, path: preset.imagePath, src: target.src });
                                            target.onerror = null;
                                            target.src = 'https://placehold.co/300x400/1e293b/94a3b8?text=No+Image';
                                        }}
                                    />

                                    {/* Gradient Overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                                    {/* Selection Checkmark */}
                                    <AnimatePresence>
                                        {isSelected && (
                                            <motion.div
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                exit={{ scale: 0 }}
                                                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/40 z-20"
                                            >
                                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Hover Actions */}
                                    <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0 duration-200 z-20">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setPreviewPreset(preset); }}
                                            className="p-1.5 bg-black/50 hover:bg-white text-white hover:text-black rounded-lg backdrop-blur-md transition-colors border border-white/10"
                                            title="查看详情"
                                        >
                                            <Eye className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={(e) => startEdit(e, preset)}
                                            className="p-1.5 bg-black/50 hover:bg-white text-white hover:text-black rounded-lg backdrop-blur-md transition-colors border border-white/10"
                                            title="编辑"
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={(e) => handleDelete(e, preset.id)}
                                            className="p-1.5 bg-black/50 hover:bg-red-500 text-white rounded-lg backdrop-blur-md transition-colors border border-white/10"
                                            title="删除"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Info below image */}
                                <div className="px-1">
                                    {editingId === preset.id ? (
                                        <div className="flex items-center gap-1">
                                            <Input
                                                value={editName}
                                                onChange={e => setEditName(e.target.value)}
                                                className="h-6 text-xs px-1 py-0 bg-white/10 border-white/20 text-white"
                                                autoFocus
                                            />
                                            <Check className="w-4 h-4 text-green-400 cursor-pointer" onClick={saveEdit} />
                                            <X className="w-4 h-4 text-red-400 cursor-pointer" onClick={cancelEdit} />
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-sm font-bold text-slate-200">{preset.name}</span>
                                            {(preset.height || preset.weight) && (
                                                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                                    {preset.height && <span>H: {preset.height}cm</span>}
                                                    {preset.weight && <span>W: {preset.weight}kg</span>}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            {loading && (
                <div className="flex justify-center p-4">
                    <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                </div>
            )}

            {/* Preview Dialog */}
            <Dialog open={!!previewPreset} onOpenChange={(open) => !open && setPreviewPreset(null)}>
                <DialogContent className="max-w-3xl border-0 p-0 overflow-hidden bg-slate-950 text-slate-100 max-h-[90vh]">
                    {previewPreset && (
                        <div className="flex flex-col md:flex-row gap-0 h-full min-h-[400px] md:min-h-[600px]">
                            {/* Left: Image (Zoomable/Large) */}
                            <div className="w-full md:w-2/3 bg-black flex items-center justify-center relative overflow-hidden group/preview min-h-[300px] md:min-h-0">
                                <img
                                    src={getImageUrl(previewPreset.imagePath)}
                                    alt={previewPreset.name}
                                    className="w-full h-full object-contain"
                                />
                            </div>

                            {/* Right: Details */}
                            <div className="w-full md:w-1/3 p-6 flex flex-col bg-slate-900 border-t md:border-t-0 md:border-l border-white/10">
                                <div>
                                    <DialogTitle>
                                        <div className="text-2xl font-bold flex items-center gap-2">
                                            {previewPreset.name}
                                            {previewPreset.gender === 'female' && <Badge variant="secondary" className="bg-pink-500/20 text-pink-300 hover:bg-pink-500/30">Female</Badge>}
                                            {previewPreset.gender === 'male' && <Badge variant="secondary" className="bg-blue-500/20 text-blue-300 hover:bg-blue-500/30">Male</Badge>}
                                        </div>
                                    </DialogTitle>
                                </div>

                                <div className="space-y-6 flex-1">
                                    {/* Stats Grid */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wider">
                                                <Ruler className="w-3 h-3" /> 身高
                                            </div>
                                            <p className="text-lg font-mono font-medium">{previewPreset.height ? `${previewPreset.height}cm` : '-'}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wider">
                                                <Weight className="w-3 h-3" /> 体重
                                            </div>
                                            <p className="text-lg font-mono font-medium">{previewPreset.weight ? `${previewPreset.weight}kg` : '-'}</p>
                                        </div>
                                        <div className="space-y-1 col-span-2">
                                            <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wider">
                                                <UserIcon className="w-3 h-3" /> 三围
                                            </div>
                                            <p className="text-lg font-mono font-medium">{previewPreset.measurements || '-'}</p>
                                        </div>
                                    </div>

                                    <Separator className="bg-white/10" />

                                    {/* Description */}
                                    <div className="space-y-2">
                                        <span className="text-slate-400 text-xs uppercase tracking-wider">备注信息</span>
                                        <p className="text-sm text-slate-300 leading-relaxed">
                                            {previewPreset.description || '暂无详细描述...'}
                                        </p>
                                    </div>
                                </div>

                                <div className="pt-6 mt-auto">
                                    <Button className="w-full bg-white text-black hover:bg-slate-200" onClick={() => {
                                        if (selectedIds.includes(previewPreset.id)) {
                                            onSelect(selectedIds.filter(i => i !== previewPreset.id));
                                        } else {
                                            if (selectedIds.length < maxSelection) {
                                                onSelect([...selectedIds, previewPreset.id]);
                                            }
                                        }
                                        setPreviewPreset(null);
                                    }}>
                                        {selectedIds.includes(previewPreset.id) ? '取消选择' : '选择此模特'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
