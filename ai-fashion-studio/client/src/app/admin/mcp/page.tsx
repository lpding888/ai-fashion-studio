'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BACKEND_ORIGIN } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type McpStatus = {
  name: string;
  version: string;
  tools: string[];
  toolCallCounts: Record<string, number>;
  lastToolCallAt?: number;
  lastConnectedAt?: number;
  hasActiveTransport: boolean;
  activeSessions?: number;
  sessionIds?: string[];
};

type SseEvent = {
  ts: number;
  event: string;
  data: string;
  parsed?: unknown;
};

export default function AdminMcpPage() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [messagesUrl, setMessagesUrl] = useState<string | null>(null);
  const [events, setEvents] = useState<SseEvent[]>([]);
  const [sendText, setSendText] = useState<string>('');
  const [clientName, setClientName] = useState('afs-admin');
  const [protocolVersion, setProtocolVersion] = useState('2024-11-05');
  const [nextId, setNextId] = useState(1);
  const abortRef = useRef<AbortController | null>(null);

  const rows = useMemo(() => {
    if (!status) return [];
    const tools = status.tools || [];
    return tools
      .map((t) => ({
        name: t,
        count: Number(status.toolCallCounts?.[t] || 0),
      }))
      .sort((a, b) => b.count - a.count);
  }, [status]);

  const pushEvent = (evt: SseEvent) => {
    setEvents((prev) => {
      const next = [...prev, evt];
      return next.length > 500 ? next.slice(-500) : next;
    });
  };

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');
      const res = await fetch(`${BACKEND_ORIGIN}/api/admin/mcp/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || `HTTP ${res.status}`);
      }
      setStatus(data?.status || null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setConnecting(false);
    setConnected(false);
    setMessagesUrl(null);
  };

  const connect = async () => {
    try {
      setError(null);
      setConnecting(true);
      setEvents([]);
      setMessagesUrl(null);

      const token = localStorage.getItem('token');
      if (!token) throw new Error('缺少 token（请重新登录管理台）');

      // Abort previous
      disconnect();

      const aborter = new AbortController();
      abortRef.current = aborter;

      const res = await fetch(`${BACKEND_ORIGIN}/api/admin/mcp/sse`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: aborter.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`SSE 连接失败：HTTP ${res.status}`);
      }

      setConnected(true);
      setConnecting(false);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      let currentEvent = 'message';
      let dataLines: string[] = [];
      const flush = () => {
        const payload = dataLines.join('\n');
        const evt: SseEvent = { ts: Date.now(), event: currentEvent, data: payload };
        if (currentEvent === 'message') {
          try {
            evt.parsed = JSON.parse(payload);
          } catch {
            // ignore
          }
        }
        if (currentEvent === 'endpoint') {
          const relative = payload.trim();
          if (relative.startsWith('/')) {
            setMessagesUrl(`${BACKEND_ORIGIN}${relative}`);
          }
        }
        pushEvent(evt);
        currentEvent = 'message';
        dataLines = [];
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let idx = buf.indexOf('\n');
        while (idx >= 0) {
          const line = buf.slice(0, idx).replace(/\r$/, '');
          buf = buf.slice(idx + 1);
          idx = buf.indexOf('\n');

          if (!line) {
            if (dataLines.length) flush();
            continue;
          }

          if (line.startsWith('event:')) {
            currentEvent = line.slice('event:'.length).trim() || 'message';
            continue;
          }
          if (line.startsWith('data:')) {
            dataLines.push(line.slice('data:'.length).trimStart());
            continue;
          }
          // ignore: id/retry/other fields
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : String(e));
      setConnecting(false);
      setConnected(false);
      setMessagesUrl(null);
    }
  };

  const postMessage = async (payload: unknown) => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('缺少 token');
    if (!messagesUrl) throw new Error('尚未拿到 messages endpoint（等待 SSE endpoint 事件）');

    const res = await fetch(messagesUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`POST messages 失败：HTTP ${res.status} ${text}`);
    }
  };

  const sendInitialize = async () => {
    const id = nextId;
    setNextId((v) => v + 1);
    await postMessage({
      jsonrpc: '2.0',
      id,
      method: 'initialize',
      params: {
        protocolVersion,
        capabilities: {},
        clientInfo: { name: clientName, version: '1.0.0' },
      },
    });
  };

  const sendInitialized = async () => {
    await postMessage({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    });
  };

  const sendListTools = async () => {
    const id = nextId;
    setNextId((v) => v + 1);
    await postMessage({ jsonrpc: '2.0', id, method: 'tools/list', params: {} });
  };

  const sendCallTool = async (toolName: string, args: Record<string, unknown>) => {
    const id = nextId;
    setNextId((v) => v + 1);
    await postMessage({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    });
  };

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const fmtTs = (ts?: number) => {
    if (!ts) return '-';
    try {
      return new Date(ts).toLocaleString('zh-CN');
    } catch {
      return String(ts);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">MCP</h2>
          <p className="text-muted-foreground">可交互控制台：SSE 连接 + JSON-RPC（initialize/tools/list/tools/call）</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void fetchStatus()} disabled={loading}>
            刷新
          </Button>
        </div>
      </div>

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle>加载失败</CardTitle>
            <CardDescription className="text-destructive">{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>连接</CardTitle>
          <CardDescription>后端 SSE：`GET /api/admin/mcp/sse`；消息：`POST /api/admin/mcp/messages?sessionId=...`</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Badge variant={connected ? 'default' : 'secondary'}>{connected ? 'Connected' : 'Disconnected'}</Badge>
            {messagesUrl ? <span className="font-mono text-xs text-muted-foreground break-all">{messagesUrl}</span> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void connect()} disabled={connecting || connected}>
              连接
            </Button>
            <Button variant="outline" onClick={disconnect} disabled={!connected}>
              断开
            </Button>
            <Button variant="outline" onClick={() => setEvents([])} disabled={events.length === 0}>
              清空事件
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
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void sendInitialize().catch((e) => setError(e?.message || String(e)))}
              disabled={!connected || !messagesUrl}
            >
              initialize
            </Button>
            <Button
              variant="outline"
              onClick={() => void sendInitialized().catch((e) => setError(e?.message || String(e)))}
              disabled={!connected || !messagesUrl}
            >
              notifications/initialized
            </Button>
            <Button
              variant="outline"
              onClick={() => void sendListTools().catch((e) => setError(e?.message || String(e)))}
              disabled={!connected || !messagesUrl}
            >
              tools/list
            </Button>
          </div>
          <div className="grid gap-2">
            <div className="text-sm text-muted-foreground">tools/call（JSON args）</div>
            <div className="flex flex-wrap gap-2">
              {rows.map((r) => (
                <Button
                  key={`call-${r.name}`}
                  variant="outline"
                  size="sm"
                  onClick={() => void sendCallTool(r.name, {}).catch((e) => setError(e?.message || String(e)))}
                  disabled={!connected || !messagesUrl}
                >
                  {r.name}({})
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>发送消息（raw JSON）</CardTitle>
          <CardDescription>直接发送 JSON-RPC 消息体到 messages endpoint（用于调试）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={sendText}
            onChange={(e) => setSendText(e.target.value)}
            placeholder='例如：{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
            className="min-h-[120px] font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button
              onClick={() =>
                void (async () => {
                  try {
                    const payload = JSON.parse(sendText || '');
                    await postMessage(payload);
                  } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : String(e));
                  }
                })()
              }
              disabled={!connected || !messagesUrl}
            >
              发送
            </Button>
            <Button
              variant="outline"
              onClick={() => setSendText(JSON.stringify({ jsonrpc: '2.0', id: nextId, method: 'tools/list', params: {} }, null, 2))}
            >
              填充 tools/list 模板
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>服务</CardTitle>
            <CardDescription>名称/版本</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm">
              <span className="text-muted-foreground">Name：</span>
              <span className="font-mono">{status?.name || '-'}</span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Version：</span>
              <span className="font-mono">{status?.version || '-'}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>连接</CardTitle>
            <CardDescription>SSE Transport 状态</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={status?.hasActiveTransport ? 'default' : 'secondary'}>
                {status?.hasActiveTransport ? 'Active' : 'Inactive'}
              </Badge>
              <span className="text-xs text-muted-foreground">sessions={status?.activeSessions ?? '-'}</span>
            </div>
            <div className="text-sm text-muted-foreground">最近连接：{fmtTs(status?.lastConnectedAt)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>调用</CardTitle>
            <CardDescription>工具调用统计</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm">
              <span className="text-muted-foreground">工具数：</span>
              <span className="font-mono">{status?.tools?.length ?? '-'}</span>
            </div>
            <div className="text-sm text-muted-foreground">最近调用：{fmtTs(status?.lastToolCallAt)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>工具列表</CardTitle>
          <CardDescription>按调用次数排序</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">加载中...</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">暂无工具数据</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tool</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="font-mono">{r.name}</TableCell>
                    <TableCell className="text-right font-mono">{r.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>事件（SSE）</CardTitle>
          <CardDescription>只保留最近 500 条</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[55vh] overflow-auto rounded-md border bg-background p-3 font-mono text-xs leading-5">
            {events.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground">暂无事件</div>
            ) : (
              events.map((e, idx) => (
                <div key={`${e.ts}-${idx}`} className="py-1 border-b last:border-b-0">
                  <div className="flex gap-2 items-center">
                    <span className="text-muted-foreground w-[180px]">
                      {new Date(e.ts).toLocaleString('zh-CN')}
                    </span>
                    <Badge variant={e.event === 'message' ? 'default' : 'secondary'}>{e.event}</Badge>
                  </div>
                  <div className="mt-1 break-all whitespace-pre-wrap">
                    {e.parsed ? JSON.stringify(e.parsed, null, 2) : e.data}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
