'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BACKEND_ORIGIN } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/admin/shared/page-header';

import { McpStatus, SseEvent } from './types';
import { StatusCards } from './status-cards';
import { ConnectorCard } from './connector-card';
import { EventsCard } from './events-card';
import { ToolsTable } from './tools-table';
import { DebugConsole } from './debug-console';

export default function AdminMcpPage() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [messagesUrl, setMessagesUrl] = useState<string | null>(null);
  const [events, setEvents] = useState<SseEvent[]>([]);
  const [nextId, setNextId] = useState(1);
  const abortRef = useRef<AbortController | null>(null);

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

  const handleInitialize = async (clientName: string, protocolVersion: string) => {
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

  const handleInitialized = async () => {
    await postMessage({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    });
  };

  const handleListTools = async () => {
    const id = nextId;
    setNextId((v) => v + 1);
    await postMessage({ jsonrpc: '2.0', id, method: 'tools/list', params: {} });
  };

  const handleCallTool = async (toolName: string, args: Record<string, unknown>) => {
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
    return () => disconnect();
  }, [fetchStatus]);

  // Derive available tools from tools/list response if possible, 
  // but for now we rely on the status API or we just let it be empty initially.
  // The original code used `status.tools`.
  const availableTools = status?.tools || [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <PageHeader
          title="MCP 控制台"
          description="模型上下文协议 (Model Context Protocol) 调试工具。支持 SSE 连接与 JSON-RPC 交互。"
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void fetchStatus()} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            刷新状态
          </Button>
        </div>
      </div>

      {error && <div className="p-4 rounded-md bg-red-50 text-red-600 border border-red-200">{error}</div>}

      <StatusCards status={status} />

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <ConnectorCard
            connected={connected}
            connecting={connecting}
            messagesUrl={messagesUrl}
            eventsCount={events.length}
            onConnect={connect}
            onDisconnect={disconnect}
            onClearEvents={() => setEvents([])}
            onInitialize={handleInitialize}
            onSendInitialized={handleInitialized}
            onListTools={handleListTools}
            onCallTool={handleCallTool}
            tools={availableTools}
          />
          <DebugConsole
            onSend={postMessage}
            connected={connected}
            messagesUrl={messagesUrl}
            nextId={nextId}
          />
          <ToolsTable status={status} loading={loading} />
        </div>

        <div className="h-full">
          <EventsCard events={events} />
        </div>
      </div>
    </div>
  );
}
