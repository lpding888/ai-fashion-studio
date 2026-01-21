'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BACKEND_ORIGIN } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

type Level = 'log' | 'warn' | 'error' | 'debug' | 'verbose';

type ServerLogEvent =
  | {
      type: 'log';
      id: number;
      ts: number;
      level: Level;
      context?: string;
      message: string;
      meta?: Record<string, unknown>;
    }
  | { type: 'ping'; ts: number };

type UiLogItem = {
  ts: number;
  level: Level;
  source: 'frontend' | 'backend';
  message: string;
  context?: string;
};

const MAX_ITEMS = 1500;

function formatTs(ts: number) {
  try {
    return new Date(ts).toLocaleString('zh-CN');
  } catch {
    return String(ts);
  }
}

function normalizeMessage(args: unknown[]) {
  if (args.length === 1) {
    const v = args[0];
    if (typeof v === 'string') return v;
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }

  return args
    .map((v) => {
      if (typeof v === 'string') return v;
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    })
    .join(' ');
}

export default function AdminLogsPage() {
  const [items, setItems] = useState<UiLogItem[]>([]);
  const [paused, setPaused] = useState(false);
  const [search, setSearch] = useState('');
  const [levels, setLevels] = useState<Record<Level, boolean>>({
    log: true,
    warn: true,
    error: true,
    debug: false,
    verbose: false,
  });

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (!levels[i.level]) return false;
      if (!q) return true;
      return (
        i.message.toLowerCase().includes(q) ||
        (i.context || '').toLowerCase().includes(q) ||
        i.source.toLowerCase().includes(q)
      );
    });
  }, [items, levels, search]);

  useEffect(() => {
    if (paused) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [visible.length, paused]);

  useEffect(() => {
    const original = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
      info: console.info,
    };

    type ConsoleArgs = Parameters<typeof console.log>;

    const pushFrontend = (level: Level, args: unknown[]) => {
      const message = normalizeMessage(args);
      setItems((prev) => {
        const next = [
          ...prev,
          { ts: Date.now(), level, source: 'frontend', message } satisfies UiLogItem,
        ];
        return next.length > MAX_ITEMS ? next.slice(-MAX_ITEMS) : next;
      });
    };

    console.log = (...args: ConsoleArgs) => {
      original.log(...args);
      pushFrontend('log', args);
    };
    console.warn = (...args: ConsoleArgs) => {
      original.warn(...args);
      pushFrontend('warn', args);
    };
    console.error = (...args: ConsoleArgs) => {
      original.error(...args);
      pushFrontend('error', args);
    };
    console.debug = (...args: ConsoleArgs) => {
      original.debug(...args);
      pushFrontend('debug', args);
    };
    console.info = (...args: ConsoleArgs) => {
      original.info(...args);
      pushFrontend('verbose', args);
    };

    const onError = (event: ErrorEvent) => {
      pushFrontend('error', [event.message, event.filename, event.lineno, event.colno]);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      pushFrontend('error', ['UnhandledRejection', event.reason]);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      console.log = original.log;
      console.warn = original.warn;
      console.error = original.error;
      console.debug = original.debug;
      console.info = original.info;
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    abortRef.current?.abort();
    const aborter = new AbortController();
    abortRef.current = aborter;

    const pushBackend = (evt: Extract<ServerLogEvent, { type: 'log' }>) => {
      setItems((prev) => {
        const next = [
          ...prev,
          {
            ts: evt.ts,
            level: evt.level,
            source: 'backend',
            message: evt.message,
            context: evt.context,
          } satisfies UiLogItem,
        ];
        return next.length > MAX_ITEMS ? next.slice(-MAX_ITEMS) : next;
      });
    };

    const start = async () => {
      try {
        const recentRes = await fetch(`${BACKEND_ORIGIN}/api/admin/logs/recent?limit=200`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: aborter.signal,
        });
        if (recentRes.ok) {
          const data = await recentRes.json();
          const list: ServerLogEvent[] = data?.items || [];
          list.forEach((evt) => {
            if (evt?.type === 'log') pushBackend(evt);
          });
        }

        const res = await fetch(`${BACKEND_ORIGIN}/api/admin/logs/stream`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: aborter.signal,
        });
        if (!res.ok || !res.body) {
          console.error('后端日志流连接失败', res.status, res.statusText);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          let idx = buf.indexOf('\n');
          while (idx >= 0) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            idx = buf.indexOf('\n');

            if (!line) continue;
            try {
              const evt = JSON.parse(line) as ServerLogEvent;
              if (evt.type === 'log') pushBackend(evt);
            } catch {
              // ignore
            }
          }
        }
      } catch (e: unknown) {
        const maybe = e as { name?: string; message?: string };
        if (maybe?.name === 'AbortError') return;
        console.error('后端日志流异常', maybe?.message || e);
      }
    };

    start();

    return () => {
      aborter.abort();
    };
  }, []);

  const toggleLevel = (level: Level) => {
    setLevels((prev) => ({ ...prev, [level]: !prev[level] }));
  };

  const clear = () => setItems([]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">实时日志</h2>
          <p className="text-muted-foreground">前端控制台 + 后端日志流（仅管理员可见）</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPaused((v) => !v)}>
            {paused ? '继续滚动' : '暂停滚动'}
          </Button>
          <Button variant="outline" onClick={clear}>
            清空
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>过滤</CardTitle>
          <CardDescription>级别/关键字过滤（不会影响采集，只影响显示）</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {(['log', 'warn', 'error', 'debug', 'verbose'] as Level[]).map((lvl) => (
              <Button
                key={lvl}
                variant={levels[lvl] ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleLevel(lvl)}
              >
                {lvl}
              </Button>
            ))}
          </div>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索（message/context/source）" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>日志</CardTitle>
          <CardDescription>共 {visible.length} 条（最多保留 {MAX_ITEMS} 条）</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[70vh] overflow-auto rounded-md border bg-background p-3 font-mono text-xs leading-5">
            {visible.map((i, idx) => (
              <div key={`${i.ts}-${idx}`} className="flex gap-2 py-0.5">
                <span className="w-[180px] text-muted-foreground">{formatTs(i.ts)}</span>
                <Badge variant={i.level === 'error' ? 'destructive' : i.level === 'warn' ? 'secondary' : 'outline'}>
                  {i.level}
                </Badge>
                <Badge variant={i.source === 'backend' ? 'default' : 'secondary'}>{i.source}</Badge>
                {i.context ? <span className="text-muted-foreground">[{i.context}]</span> : null}
                <span className="break-all">{i.message}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
