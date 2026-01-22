'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { ModelProfileKind, ModelProfilePublic, ModelProvider } from './types';

interface ProfileDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editing: ModelProfilePublic | null;
    defaultKind?: ModelProfileKind;
    loading: boolean;
    onSave: (data: {
        kind: ModelProfileKind;
        provider: ModelProvider;
        name: string;
        gateway: string;
        model: string;
        apiKey: string;
        disabled: boolean;
    }) => void;
}

export function ProfileDialog({ open, onOpenChange, editing, defaultKind, loading, onSave }: ProfileDialogProps) {
    const [kind, setKind] = React.useState<ModelProfileKind>('BRAIN');
    const [provider, setProvider] = React.useState<ModelProvider>('GEMINI');
    const [name, setName] = React.useState('');
    const [gateway, setGateway] = React.useState('https://api.vectorengine.ai/v1');
    const [model, setModel] = React.useState('');
    const [apiKey, setApiKey] = React.useState('');
    const [disabled, setDisabled] = React.useState(false);

    // Initialize/Reset form when opening or changing editing target
    React.useEffect(() => {
        if (open) {
            if (editing) {
                setKind(editing.kind);
                setProvider(editing.provider || 'GEMINI');
                setName(editing.name);
                setGateway(editing.gateway);
                setModel(editing.model);
                setDisabled(!!editing.disabled);
                setApiKey(''); // Always clear API key for security/editing
            } else {
                setKind(defaultKind || 'BRAIN');
                setProvider('GEMINI');
                setName('');
                setGateway('https://api.vectorengine.ai/v1');
                setModel('');
                setDisabled(false);
                setApiKey('');
            }
        }
    }, [open, editing, defaultKind]);

    React.useEffect(() => {
        if (kind === 'PAINTER' && provider !== 'GEMINI') {
            setProvider('GEMINI');
        }
    }, [kind, provider]);

    const handleSave = () => {
        onSave({
            kind,
            provider,
            name,
            gateway,
            model,
            apiKey,
            disabled
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                    <DialogTitle>{editing ? '编辑配置' : '新建配置'}</DialogTitle>
                    <DialogDescription>
                        {editing ? '不填密钥表示保持不变；密钥不会明文展示。' : '密钥仅用于创建时提交一次，服务端会加密存储。'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {!editing && (
                        <div className="space-y-2">
                            <Label>类型</Label>
                            <Select value={kind} onValueChange={(v: ModelProfileKind) => setKind(v)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="选择类型" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="BRAIN">BRAIN</SelectItem>
                                    <SelectItem value="PAINTER">PAINTER</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>Provider</Label>
                        <Select
                            value={provider}
                            onValueChange={(v: ModelProvider) => setProvider(v)}
                            disabled={kind === 'PAINTER'}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="选择 Provider" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="GEMINI">GEMINI</SelectItem>
                                <SelectItem value="OPENAI_COMPAT">OPENAI_COMPAT</SelectItem>
                            </SelectContent>
                        </Select>
                        {kind === 'PAINTER' && (
                            <p className="text-xs text-muted-foreground">Painter 仅支持 Gemini</p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label>名称</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：Gemini 3 Pro（主）" />
                    </div>

                    <div className="space-y-2">
                        <Label>网关 (Gateway)</Label>
                        <Input value={gateway} onChange={(e) => setGateway(e.target.value)} placeholder="https://api.vectorengine.ai/v1" />
                    </div>

                    <div className="space-y-2">
                        <Label>模型 (Model)</Label>
                        <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="例如：gemini-2.0-flash-exp" />
                    </div>

                    <div className="space-y-2">
                        <Label>密钥 (API Key)</Label>
                        <Input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder={editing ? '留空表示不修改' : '必填'}
                        />
                    </div>

                    {editing && (
                        <div className="space-y-2">
                            <Label>状态</Label>
                            <Select value={disabled ? 'disabled' : 'enabled'} onValueChange={(v) => setDisabled(v === 'disabled')}>
                                <SelectTrigger>
                                    <SelectValue placeholder="选择状态" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="enabled">Enabled</SelectItem>
                                    <SelectItem value="disabled">Disabled</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
                    <Button onClick={handleSave} disabled={loading}>
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        保存
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
