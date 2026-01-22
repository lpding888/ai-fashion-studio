'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface DebugConsoleProps {
    onSend: (payload: unknown) => Promise<void>;
    connected: boolean;
    messagesUrl: string | null;
    nextId: number;
}

export function DebugConsole({ onSend, connected, messagesUrl, nextId }: DebugConsoleProps) {
    const [text, setText] = React.useState('');
    const [error, setError] = React.useState<string | null>(null);

    const handleSend = async () => {
        setError(null);
        try {
            const payload = JSON.parse(text || '{}');
            await onSend(payload);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };

    const fillTemplate = () => {
        setText(JSON.stringify({ jsonrpc: '2.0', id: nextId, method: 'tools/list', params: {} }, null, 2));
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>调试控制台</CardTitle>
                <CardDescription>直接发送 JSON-RPC 消息体到 messages endpoint</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder='例如：{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
                    className="min-h-[120px] font-mono text-xs"
                />

                {error && <div className="text-sm text-red-500">{error}</div>}

                <div className="flex gap-2">
                    <Button
                        onClick={handleSend}
                        disabled={!connected || !messagesUrl}
                    >
                        发送
                    </Button>
                    <Button variant="outline" onClick={fillTemplate}>
                        填充 tools/list 模板
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
