"use client";

import * as React from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Loader2, ArrowRight, Wand2, AlertTriangle, Sparkles, MapPin, Palette, Crop, Shirt, FolderOpen, Upload, Save, Footprints, Watch, Briefcase, User, Layers, BrainCircuit } from 'lucide-react';
import { UploadZone } from './upload-zone';
import { FaceRefUpload } from './face-ref-upload';
import { FacePresetSelector } from './face-preset-selector';
import { StylePresetSelector } from './style-preset-selector';
import { useStylePresetStore } from '@/store/style-preset-store';
import { FormHistoryDropdown } from './FormHistoryDropdown';
import { StyleAnalyzer } from './style-analyzer';
import { useFormHistory, type FormHistoryItem } from '@/hooks/useFormHistory';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useSettingsStore } from '@/store/settings-store';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from './ui/use-toast';
import { useCosUpload } from '@/hooks/use-cos-upload';
import { useAuth } from '@/hooks/use-auth';
import { useCredits, CREDITS_PER_IMAGE } from '@/hooks/use-credits';

const MAX_TOTAL_IMAGES = 14;

export function RequirementForm() {
    const router = useRouter();
    const { toast } = useToast();
    const [files, setFiles] = React.useState<File[]>([]);
    const [faceRefs, setFaceRefs] = React.useState<File[]>([]);
    const [facePresetIds, setFacePresetIds] = React.useState<string[]>([]);
    const [stylePresetIds, setStylePresetIds] = React.useState<string[]>([]);  // 新增：风格预设
    const [styleRefs, setStyleRefs] = React.useState<File[]>([]);
    const [requirements, setRequirements] = React.useState('');
    const [resolution, setResolution] = React.useState<'1K' | '2K' | '4K'>('2K');
    const [garmentFocus, setGarmentFocus] = React.useState<string>('');
    const [aspectRatio, setAspectRatio] = React.useState<string>('3:4');
    const [location, setLocation] = React.useState<string>('');
    const [styleDirection, setStyleDirection] = React.useState<string>('');
    const [layoutMode, setLayoutMode] = React.useState<'Individual' | 'Grid'>('Individual');
    const [shotCount, setShotCount] = React.useState<number>(4);

    // const [loading, setLoading] = React.useState(false); // 使用 hook 的状态
    const { uploadFiles, isUploading: isUploadingCos, progress: uploadProgress } = useCosUpload();
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const loading = isUploadingCos || isSubmitting;

    const { autoApprove } = useSettingsStore();
    const { user } = useAuth();
    const { balance, checkCredits, calculateRequired, refresh: refreshCredits } = useCredits();

    // Form history hook
    const { historyItems, saveHistory, deleteHistory, clearHistory } = useFormHistory();

    // Calculate remaining slots（更新：支持风格预设多图计算）
    const { presets: stylePresets } = useStylePresetStore();
    const stylePresetImageCount = stylePresetIds.reduce((sum, id) => {
        const preset = stylePresets.find(p => p.id === id);
        return sum + (preset?.imagePaths.length || 0);
    }, 0);

    const totalImages = files.length + faceRefs.length + styleRefs.length + facePresetIds.length + stylePresetImageCount;
    const isOverLimit = totalImages > MAX_TOTAL_IMAGES;
    const remainingForGarment = Math.max(0, MAX_TOTAL_IMAGES - faceRefs.length - styleRefs.length - facePresetIds.length - stylePresetImageCount);
    const remainingForFace = Math.max(0, MAX_TOTAL_IMAGES - files.length - styleRefs.length - stylePresetImageCount);
    const remainingForStyle = Math.max(0, Math.min(3, MAX_TOTAL_IMAGES - files.length - faceRefs.length - facePresetIds.length - stylePresetImageCount));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (files.length === 0) return;
        if (isOverLimit) return;
        if (loading) return;

        // 积分检查：如果用户已登录，检查积分是否足够
        if (user?.id) {
            const requiredCredits = calculateRequired(shotCount);
            if (balance < requiredCredits) {
                toast({
                    title: '积分不足',
                    description: `此任务需要 ${requiredCredits} 积分，当前余额 ${balance} 积分`,
                    variant: 'destructive',
                });
                return;
            }
        }

        setIsSubmitting(true);
        try {
            // 1. 准备上传所有文件
            const allFiles = [...files, ...faceRefs, ...styleRefs];

            // 2. 上传到 COS
            const allUrls = await uploadFiles(allFiles);

            // 3. 分割 URL
            const fileUrls = allUrls.slice(0, files.length);
            const faceRefUrls = allUrls.slice(files.length, files.length + faceRefs.length);
            const styleRefUrls = allUrls.slice(files.length + faceRefs.length);

            // 4. 构建 JSON 数据
            const payload = {
                file_urls: fileUrls,
                face_ref_urls: faceRefUrls,
                style_ref_urls: styleRefUrls,

                requirements,
                shot_count: shotCount,
                layout_mode: layoutMode,
                resolution,
                autoApprove,
                userId: user?.id,  // 传递用户ID用于积分扣费

                face_preset_ids: facePresetIds.length > 0 ? facePresetIds.join(',') : undefined,
                style_preset_ids: stylePresetIds.length > 0 ? stylePresetIds.join(',') : undefined,
                garment_focus: garmentFocus || undefined,
                aspect_ratio: aspectRatio || undefined,
                location: location || undefined,
                style_direction: styleDirection || undefined,
            };

            // 5. 发送任务请求 (JSON)
            const res = await api.post('/tasks', payload);

            const task = res.data;
            router.push(`/tasks/${task.id}`);

        } catch (error) {
            console.error("Failed to create task", error);
            const message =
                (error as any)?.response?.data?.message
                || (error as any)?.message
                || '创建任务失败，请检查网络或联系管理员配置模型';
            toast({
                title: '创建任务失败',
                description: message,
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // 保存当前配置
    const handleSaveConfig = () => {
        saveHistory({
            requirements,
            resolution,
            aspectRatio,
            layoutMode,
            shotCount,
            location,
            styleDirection,
            garmentFocus,
            garmentImageCount: files.length,
            faceRefCount: faceRefs.length,
            styleRefCount: styleRefs.length
        });
        alert('配置已保存！');
    };

    // 加载历史配置
    const handleLoadHistory = (item: FormHistoryItem) => {
        setRequirements(item.requirements);
        setResolution(item.resolution);
        setAspectRatio(item.aspectRatio);
        setLayoutMode(item.layoutMode);
        setShotCount(item.shotCount);
        if (item.location) setLocation(item.location);
        if (item.styleDirection) setStyleDirection(item.styleDirection);
        if (item.garmentFocus) setGarmentFocus(item.garmentFocus);

        alert('已加载配置！\n注意：图片需要重新上传');
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
        >
            {/* Vibrant Pop Background */}
            <div className="fixed inset-0 bg-slate-950 -z-50" />
            <div className="fixed top-[-20%] right-[-10%] w-[50%] h-[50%] bg-orange-500/20 blur-[120px] rounded-full animate-pulse -z-40" />
            <div className="fixed bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-pink-500/20 blur-[120px] rounded-full animate-pulse delay-1000 -z-40" />

            <Card className="w-full max-w-4xl mx-auto shadow-[0_8px_32px_rgba(0,0,0,0.15)] border-white/40 bg-gradient-to-b from-white/15 to-white/10 backdrop-blur-xl overflow-hidden ring-1 ring-white/25">
                <div className="h-1.5 w-full bg-gradient-to-r from-orange-400 via-pink-500 to-purple-600 shadow-[0_0_25px_rgba(236,72,153,0.6)]" />

                <CardHeader className="text-center pb-6 pt-8 bg-gradient-to-b from-white/5 to-transparent">
                    <CardTitle className="text-3xl font-black tracking-tight text-white drop-shadow-[0_2px_15px_rgba(0,0,0,0.8)]">
                        AI Fashion Studio
                    </CardTitle>
                    <p className="text-white mt-2 font-semibold tracking-wide drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]">智能策划 · 商业级拍摄 · 极致光影</p>

                    {/* 历史记录功能 */}
                    <div className="flex justify-center gap-3 mt-6">
                        <FormHistoryDropdown
                            historyItems={historyItems}
                            onLoad={handleLoadHistory}
                            onDelete={deleteHistory}
                            onClear={clearHistory}
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleSaveConfig}
                            className="gap-2 border-white/20 hover:bg-white/10 hover:text-white transition-all rounded-full px-4"
                        >
                            <Save className="h-4 w-4" />
                            保存配置
                        </Button>
                    </div>
                </CardHeader>

                <CardContent className="space-y-8 p-8">

                    {/* Warning Message */}
                    <AnimatePresence>
                        {isOverLimit && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm font-medium shadow-sm"
                            >
                                <AlertTriangle className="w-5 h-5 shrink-0" />
                                <span>当前总图片 ({totalImages}) 超过系统限制 ({MAX_TOTAL_IMAGES}张)，请精简素材以保证最佳生成质量。</span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Step 1: Main Garment */}
                    <div className="space-y-4">
                        <label className="text-base font-bold text-white flex items-center gap-2.5 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                            <span className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 text-white flex items-center justify-center text-sm font-bold shadow-lg shadow-orange-500/40">1</span>
                            上传主推服装 <span className="text-pink-300 font-extrabold">*</span>
                        </label>
                        <div className="bg-white/5 p-1 rounded-2xl border border-white/10">
                            <UploadZone
                                selectedFiles={files}
                                onFilesSelected={setFiles}
                                maxFiles={remainingForGarment}
                                label="服装图"
                            />
                        </div>
                    </div>


                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Step 2: Model Ref */}
                        <div className="space-y-4">
                            <label className="text-sm font-bold text-white flex items-center gap-2.5 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                                <span className="w-6 h-6 rounded-full bg-white/20 text-white flex items-center justify-center text-xs font-bold border border-white/30 shadow-md">2</span>
                                模特参考
                            </label>

                            <SelectionTabs
                                label="预设库"
                                icon={User}
                                count={facePresetIds.length}
                                tab1Content={
                                    <FacePresetSelector
                                        selectedIds={facePresetIds}
                                        onSelect={setFacePresetIds}
                                        maxSelection={MAX_TOTAL_IMAGES}
                                    />
                                }
                                tab2Content={
                                    <FaceRefUpload
                                        selectedFiles={faceRefs}
                                        onFilesSelected={setFaceRefs}
                                        maxFiles={remainingForFace}
                                    />
                                }
                            />
                        </div>

                        {/* Step 3: Style Ref */}
                        <div className="space-y-4">
                            <label className="text-sm font-bold text-white flex items-center gap-2.5 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                                <span className="w-6 h-6 rounded-full bg-white/20 text-white flex items-center justify-center text-xs font-bold border border-white/30 shadow-md">3</span>
                                风格参考
                            </label>

                            <SelectionTabs
                                label="风格库"
                                icon={Palette}
                                count={stylePresetIds.length}
                                countLabel={stylePresetImageCount > 0 ? `${stylePresetImageCount} 图` : undefined}
                                tab1Content={
                                    <StylePresetSelector
                                        selectedIds={stylePresetIds}
                                        onSelect={setStylePresetIds}
                                        maxSelection={3}
                                        hideCreateButton={true}
                                    />
                                }
                                tab2Content={
                                    <FaceRefUpload
                                        selectedFiles={styleRefs}
                                        onFilesSelected={setStyleRefs}
                                        maxFiles={Math.min(3, remainingForStyle)}
                                    />
                                }
                                tab3Content={
                                    <div className="space-y-4">
                                        <p className="text-xs text-slate-400 mb-2">
                                            🧠 上传 1-5 张参考图，AI 将学习其风格特征，自动分析光影、色调和运镜，并智能优化您的拍摄方案。学习结果会自动保存到风格库。
                                        </p>
                                        <StyleAnalyzer
                                            compact
                                            onAnalysisComplete={(preset, files) => {
                                                const analysis = preset.analysis;
                                                // Auto-fill form fields logic
                                                if (analysis.vibe) setStyleDirection(analysis.vibe);

                                                // Construct a detailed photography requirement from analysis
                                                const newReq = `[Style Reference]: ${analysis.vibe}\n` +
                                                    `[Lighting]: ${analysis.lighting}\n` +
                                                    `[Scene]: ${analysis.scene}\n` +
                                                    `[Color Grading]: ${analysis.grading}\n` +
                                                    `[Camera]: ${analysis.camera}`;

                                                setRequirements(prev => prev ? prev + '\n\n' + newReq : newReq);

                                                // Add files to styleRefs if there is space
                                                if (files && files.length > 0) {
                                                    setStyleRefs(prev => {
                                                        const remainingSlots = 5 - prev.length; // Max 5 style refs (aligned with analyzer limit)
                                                        if (remainingSlots > 0) {
                                                            return [...prev, ...files.slice(0, remainingSlots)];
                                                        }
                                                        return prev;
                                                    });
                                                }

                                                toast({
                                                    title: "风格学习完成",
                                                    description: `已习得 "${preset.name}" 并自动优化拍摄方案`,
                                                });
                                            }}
                                        />
                                    </div>
                                }
                            />
                        </div>
                    </div>

                    <div className="h-px bg-white/10" />

                    {/* Step 4: Advanced Controls */}
                    <div className="space-y-6">
                        <label className="text-base font-bold text-white flex items-center gap-2.5 mb-6 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                            <span className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 text-white flex items-center justify-center text-sm font-bold shadow-lg shadow-purple-500/40">4</span>
                            拍摄策划与控制
                        </label>

                        {/* Basic Requirement Input */}
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                <Sparkles className="h-5 w-5 text-orange-400 group-focus-within:text-pink-400 transition-colors" />
                            </div>
                            <Input
                                className="h-14 pl-10 bg-white/5 border-white/10 focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 text-base shadow-sm transition-all text-white placeholder:text-slate-500 rounded-xl"
                                placeholder="描述想要拍摄的氛围、灯光或特殊要求..."
                                value={requirements}
                                onChange={(e) => setRequirements(e.target.value)}
                            />
                        </div>

                        {/* Advanced Options Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white/5 p-6 rounded-2xl border border-white/10">

                            {/* Garment Focus - Visual Selector */}
                            <div className="md:col-span-2 space-y-3">
                                <label className="text-xs font-bold text-white/90 uppercase tracking-wider flex items-center gap-1.5 drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
                                    <Shirt className="w-3.5 h-3.5 text-orange-300" /> 焦点单品
                                </label>
                                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                                    {[
                                        { value: "", label: "智能识别", icon: Sparkles },
                                        { value: "top", label: "上装", icon: Shirt },
                                        { value: "bottom", label: "下装", icon: Layers },
                                        { value: "footwear", label: "鞋履", icon: Footprints || Shirt }, // Fallback if Footprints not imported, will fix imports
                                        { value: "accessories", label: "配饰", icon: Watch || Briefcase || Shirt },
                                        { value: "full_outfit", label: "全身", icon: User || Shirt }
                                    ].map((item) => {
                                        const isSelected = garmentFocus === item.value;
                                        const Icon = item.icon;
                                        return (
                                            <div
                                                key={item.value}
                                                onClick={() => setGarmentFocus(item.value)}
                                                className={`relative cursor-pointer group rounded-xl border transition-all duration-300 overflow-hidden
                                                    ${isSelected
                                                        ? 'border-orange-500 bg-orange-500/20 shadow-[0_0_20px_-5px_rgba(249,115,22,0.4)]'
                                                        : 'border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/20'}
                                                `}
                                            >
                                                <div className="relative z-10 flex flex-col items-center justify-center py-3 gap-2">
                                                    <Icon className={`w-5 h-5 transition-colors ${isSelected ? 'text-orange-200' : 'text-slate-400 group-hover:text-slate-200'}`} />
                                                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isSelected ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`}>
                                                        {item.label}
                                                    </span>
                                                </div>
                                                {isSelected && (
                                                    <motion.div
                                                        layoutId="garmentFocusGlow"
                                                        className="absolute inset-0 bg-gradient-to-tr from-orange-500/20 to-pink-500/20 z-0"
                                                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                                    />
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Location */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-white/90 uppercase tracking-wider flex items-center gap-1.5 drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
                                    <MapPin className="w-3.5 h-3.5 text-blue-300" /> 拍摄地
                                </label>
                                <Input
                                    className="h-10 bg-white/5 border-white/10 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 text-white rounded-xl placeholder:text-slate-500"
                                    placeholder="例如：上海外滩"
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                />
                            </div>

                            {/* Layout Mode & Shot Count Row */}
                            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Layout Mode */}
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-white/90 uppercase tracking-wider flex items-center gap-1.5 drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
                                        <FolderOpen className="w-3.5 h-3.5 text-green-300" /> 输出模式
                                    </label>
                                    <div className="flex bg-black/20 p-1.5 rounded-xl ring-1 ring-white/10 relative z-0 backdrop-blur-md">
                                        {[
                                            { id: 'Individual', label: '单图模式', desc: 'Indiv' },
                                            { id: 'Grid', label: '拼图模式', desc: 'Grid' }
                                        ].map((mode) => {
                                            const isSelected = layoutMode === mode.id;
                                            return (
                                                <button
                                                    key={mode.id}
                                                    type="button"
                                                    onClick={() => setLayoutMode(mode.id as any)}
                                                    className={`relative flex-1 py-2.5 text-xs font-bold rounded-lg transition-all z-10 ${isSelected ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}
                                                >
                                                    {isSelected && (
                                                        <motion.div
                                                            layoutId="layoutModeBg"
                                                            className="absolute inset-0 bg-gradient-to-r from-orange-500 to-pink-500 rounded-lg shadow-lg shadow-orange-500/20 -z-10"
                                                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                                        />
                                                    )}
                                                    <span className="flex items-center justify-center gap-2">
                                                        {mode.label}
                                                    </span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* Shot Count */}
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-white/90 uppercase tracking-wider flex items-center gap-1.5 drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
                                        <Crop className="w-3.5 h-3.5 text-purple-300" /> 镜头数量
                                    </label>
                                    <div className="flex bg-black/20 p-1.5 rounded-xl ring-1 ring-white/10 relative z-0 backdrop-blur-md">
                                        {[1, 2, 4, 6].map((count) => {
                                            const isSelected = shotCount === count;
                                            return (
                                                <button
                                                    key={count}
                                                    type="button"
                                                    onClick={() => setShotCount(count)}
                                                    className={`relative flex-1 py-2.5 text-xs font-bold rounded-lg transition-all z-10 ${isSelected ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}
                                                >
                                                    {isSelected && (
                                                        <motion.div
                                                            layoutId="shotCountBg"
                                                            className="absolute inset-0 bg-gradient-to-r from-pink-500 to-purple-500 rounded-lg shadow-lg shadow-pink-500/20 -z-10"
                                                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                                        />
                                                    )}
                                                    {count}张
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Style Direction */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-white/90 uppercase tracking-wider flex items-center gap-1.5 drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
                                    <Palette className="w-3.5 h-3.5 text-pink-300" /> 风格微调
                                </label>
                                <Input
                                    className="h-10 bg-white/5 border-white/10 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 text-white rounded-xl placeholder:text-slate-500"
                                    placeholder="例如：胶片感、极简冷淡"
                                    value={styleDirection}
                                    onChange={(e) => setStyleDirection(e.target.value)}
                                />
                            </div>

                            {/* Resolution */}
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-white/90 uppercase tracking-wider drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
                                    画质精度
                                </label>
                                <div className="flex bg-black/20 p-1.5 rounded-xl ring-1 ring-white/10 relative z-0 backdrop-blur-md">
                                    {(['1K', '2K', '4K'] as const).map((res) => {
                                        const isSelected = resolution === res;
                                        return (
                                            <button
                                                key={res}
                                                type="button"
                                                onClick={() => setResolution(res)}
                                                className={`relative flex-1 py-2.5 text-xs font-bold rounded-lg transition-all z-10 ${isSelected ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}
                                            >
                                                {isSelected && (
                                                    <motion.div
                                                        layoutId="resBg"
                                                        className="absolute inset-0 bg-gradient-to-r from-purple-500 to-indigo-500 shadow-lg shadow-purple-500/20 rounded-lg -z-10"
                                                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                                    />
                                                )}
                                                {res}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Aspect Ratio - Visual Frames */}
                            <div className="space-y-3 md:col-span-2 pt-2">
                                <label className="text-xs font-bold text-white/90 uppercase tracking-wider flex items-center gap-1.5 drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
                                    <Crop className="w-3.5 h-3.5 text-indigo-300" /> 画面比例
                                </label>
                                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                                    {[
                                        { value: '1:1', label: '1:1', desc: '正方形', aspectClass: 'aspect-square' },
                                        { value: '4:3', label: '4:3', desc: '经典', aspectClass: 'aspect-[4/3]' },
                                        { value: '3:4', label: '3:4', desc: '人像', aspectClass: 'aspect-[3/4]' },
                                        { value: '16:9', label: '16:9', desc: '影院', aspectClass: 'aspect-video' },
                                        { value: '9:16', label: '9:16', desc: '手机', aspectClass: 'aspect-[9/16]' },
                                        { value: '21:9', label: '21:9', desc: '超宽', aspectClass: 'aspect-[21/9]' }
                                    ].map((ratio) => {
                                        const isSelected = aspectRatio === ratio.value;
                                        return (
                                            <button
                                                key={ratio.value}
                                                type="button"
                                                onClick={() => setAspectRatio(ratio.value)}
                                                className={`group relative flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-300
                                                    ${isSelected
                                                        ? 'border-pink-500 bg-pink-500/10 shadow-[0_0_20px_-5px_rgba(236,72,153,0.3)]'
                                                        : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'}
                                                `}
                                            >
                                                {/* Visual Frame Representation */}
                                                <div className={`w-8 ${ratio.aspectClass} rounded-sm border-2 mb-2 transition-all duration-300
                                                    ${isSelected
                                                        ? 'border-pink-400 bg-pink-400/20'
                                                        : 'border-slate-600 bg-slate-800 group-hover:border-slate-400'}
                                                `} />

                                                <span className={`text-xs font-bold leading-none ${isSelected ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`}>
                                                    {ratio.label}
                                                </span>
                                                <span className={`text-[9px] mt-1 font-medium tracking-wide uppercase ${isSelected ? 'text-pink-300' : 'text-slate-600 group-hover:text-slate-500'}`}>
                                                    {ratio.desc}
                                                </span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                </CardContent>

                <CardFooter className="bg-transparent p-8">
                    <Button
                        className="w-full h-14 text-lg font-bold bg-gradient-to-r from-orange-500 via-rose-500 to-pink-500 text-white hover:scale-[1.01] hover:shadow-[0_0_30px_rgba(251,113,133,0.4)] rounded-2xl transition-all disabled:opacity-50 disabled:translate-y-0"
                        onClick={handleSubmit}
                        disabled={files.length === 0 || loading || isOverLimit}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                正在构建视觉方案...
                            </>
                        ) : (
                            <>
                                <Wand2 className="mr-2 h-5 w-5" />
                                AI 立即生成 <ArrowRight className="ml-2 h-5 w-5 opacity-70" />
                            </>
                        )}
                    </Button>
                </CardFooter>
            </Card>
        </motion.div>
    );
}

// 内部组件：SelectionTabs
function SelectionTabs({
    label,
    icon: Icon,
    count,
    countLabel,
    tab1Content,
    tab2Content,
    tab3Content // New prop
}: {
    label: string;
    icon: any;
    count: number;
    countLabel?: string;
    tab1Content: React.ReactNode;
    tab2Content: React.ReactNode;
    tab3Content?: React.ReactNode;
}) {
    const [activeTab, setActiveTab] = React.useState<'presets' | 'upload' | 'analyze'>('presets');

    return (
        <div className="rounded-2xl border border-white/20 bg-white/5 overflow-hidden shadow-sm">
            {/* Headers */}
            <div className="flex bg-black/20 backdrop-blur-md p-1">
                <button
                    onClick={() => setActiveTab('presets')}
                    className={`flex-1 py-2.5 px-4 flex items-center justify-center gap-2 text-xs font-bold transition-all relative rounded-lg
                        ${activeTab === 'presets'
                            ? 'text-white'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                        }`}
                >
                    <Icon className={`w-3.5 h-3.5 ${activeTab === 'presets' ? 'text-white' : 'text-slate-500'}`} />
                    <span>{label}</span>
                    {count > 0 && (
                        <span className="ml-1 bg-white text-indigo-600 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold">
                            {countLabel || count}
                        </span>
                    )}
                    {activeTab === 'presets' && (
                        <motion.div
                            layoutId={`${label}-active-indicator`}
                            className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-lg shadow-sm -z-10"
                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                        />
                    )}
                </button>

                <button
                    onClick={() => setActiveTab('upload')}
                    className={`flex-1 py-2.5 px-4 flex items-center justify-center gap-2 text-xs font-bold transition-all relative rounded-lg
                        ${activeTab === 'upload'
                            ? 'text-white'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                        }`}
                >
                    <Upload className={`w-3.5 h-3.5 ${activeTab === 'upload' ? 'text-white' : 'text-slate-500'}`} />
                    <span>临时上传</span>
                    {activeTab === 'upload' && (
                        <motion.div
                            layoutId={`${label}-active-indicator`}
                            className="absolute inset-0 bg-gradient-to-r from-pink-500 to-rose-500 rounded-lg shadow-sm -z-10"
                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                        />
                    )}
                </button>
                {tab3Content && (
                    <>
                        <button
                            onClick={() => setActiveTab('analyze')}
                            className={`flex-1 py-2.5 px-4 flex items-center justify-center gap-2 text-xs font-bold transition-all relative rounded-lg
                            ${activeTab === 'analyze'
                                    ? 'text-white'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                                }`}
                        >
                            <BrainCircuit className={`w-3.5 h-3.5 ${activeTab === 'analyze' ? 'text-white' : 'text-slate-500'}`} />
                            <span>AI 学习</span>
                            {activeTab === 'analyze' && (
                                <motion.div
                                    layoutId={`${label}-active-indicator`}
                                    className="absolute inset-0 bg-gradient-to-r from-purple-500 to-violet-500 rounded-lg shadow-sm -z-10"
                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                            )}
                        </button>
                    </>
                )}
            </div>

            {/* Content Area */}
            <div className="p-4 bg-black/10 min-h-[300px] relative">
                <AnimatePresence mode="wait">
                    {activeTab === 'presets' && (
                        <motion.div
                            key="presets"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.2 }}
                        >
                            {tab1Content}
                        </motion.div>
                    )}
                    {activeTab === 'upload' && (
                        <motion.div
                            key="upload"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.2 }}
                            className="h-full flex flex-col justify-center"
                        >
                            {tab2Content}
                        </motion.div>
                    )}
                    {activeTab === 'analyze' && tab3Content && (
                        <motion.div
                            key="analyze"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.2 }}
                        >
                            {tab3Content}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
