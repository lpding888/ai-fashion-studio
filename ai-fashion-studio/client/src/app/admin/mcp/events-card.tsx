'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SseEvent } from './types';

interface EventsCardProps {
    events: SseEvent[];
}

export function EventsCard({ events }: EventsCardProps) {
    return (
        <Card className="flex flex-col h-[600px]">
            <CardHeader className="flex-none">
                <CardTitle>事件日志 (SSE)</CardTitle>
                <CardDescription>实时监控 JSON-RPC 交互（保留最近 500 条）</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-hidden">
                <div className="h-full overflow-auto rounded-md border bg-slate-950 p-4 font-mono text-xs leading-5 shadow-inner">
                    {events.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-slate-500">
                            暂无事件数据
                        </div>
                    ) : (
                        events.map((e, idx) => (
                            <div key={`${e.ts}-${idx}`} className="mb-4 last:mb-0 border-b border-slate-800 pb-3 last:border-0">
                                <div className="flex gap-2 items-center mb-1">
                                    <span className="text-slate-500 select-none">
                                        {new Date(e.ts).toLocaleTimeString('zh-CN')}
                                    </span>
                                    <Badge
                                        variant={e.event === 'message' ? 'default' : 'secondary'}
                                        className={e.event === 'message' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-700 hover:bg-slate-600'}
                                    >
                                        {e.event}
                                    </Badge>
                                </div>
                                <div className="pl-[5.5rem] text-slate-300 break-all whitespace-pre-wrap">
                                    {e.parsed ? JSON.stringify(e.parsed, null, 2) : e.data}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
