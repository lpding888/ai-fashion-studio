'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ConnectorCardProps {
    connected: boolean;
    connecting: boolean;
    messagesUrl: string | null;
    eventsCount: number;
    onConnect: () => void;
    onDisconnect: () => void;
    onClearEvents: () => void;
    onInitialize: (clientName: string, version: string) => void;
    onSendInitialized: () => void;
    onListTools: () => void;
    onCallTool: (name: string, args: Record<string, unknown>) => void;
    tools: string[];
}

export function ConnectorCard({
    connected,
    connecting,
    messagesUrl,
    eventsCount,
    onConnect,
    onDisconnect,
    onClearEvents,
    onInitialize,
    onSendInitialized,
    onListTools,
    onCallTool,
    tools
}: ConnectorCardProps) {
    const [clientName, setClientName] = React.useState('afs-admin');
    const [protocolVersion, setProtocolVersion] = React.useState('2024-11-05');

    return (
        <Card>
            <CardHeader>
                <CardTitle>连接控制</CardTitle>
                <CardDescription>后端 SSE：`GET /api/admin/mcp/sse`；消息：`POST /api/admin/mcp/messages`</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2 items-center">
                    <Badge variant={connected ? 'default' : 'secondary'}>{connected ? 'Connected' : 'Disconnected'}</Badge>
                    {messagesUrl && <span className="font-mono text-xs text-muted-foreground break-all">{messagesUrl}</span>}
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button onClick={onConnect} disabled={connecting || connected}>
                        连接
                    </Button>
                    <Button variant="outline" onClick={onDisconnect} disabled={!connected}>
                        断开
                    </Button>
                    <Button variant="outline" onClick={onClearEvents} disabled={eventsCount === 0}>
                        清空事件 ({eventsCount})
                    </Button>
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                    <div className="grid gap-2">
                        <div className="text-sm text-muted-foreground">protocolVersion</div>
                        <Input value={protocolVersion} onChange={(e) => setProtocolVersion(e.target.value)} />
                    </div>
                    <div className="grid gap-2">
                        <div className="text-sm text-muted-foreground">clientInfo.name</div>
                        <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onInitialize(clientName, protocolVersion)}
                        disabled={!connected || !messagesUrl}
                    >
                        1. initialize
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={onSendInitialized}
                        disabled={!connected || !messagesUrl}
                    >
                        2. notifications/initialized
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={onListTools}
                        disabled={!connected || !messagesUrl}
                    >
                        3. tools/list
                    </Button>
                </div>

                <div className="grid gap-2 pt-2 border-t">
                    <div className="text-sm text-muted-foreground">快速调用 (tools/call w/ empty args)</div>
                    <div className="flex flex-wrap gap-2">
                        {tools.map((t) => (
                            <Button
                                key={`call-${t}`}
                                variant="outline"
                                size="sm"
                                onClick={() => onCallTool(t, {})}
                                disabled={!connected || !messagesUrl}
                            >
                                {t}()
                            </Button>
                        ))}
                        {tools.length === 0 && <span className="text-xs text-muted-foreground">无可用工具（请先调用 tools/list）</span>}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
