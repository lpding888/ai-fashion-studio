"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Image as ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { computeProgress, computeRenderDurationMs, formatDurationMs, formatTime, getStatusLabel, taskDisplayName, toImgSrc, type TaskStatus } from "@/components/learn/learn-utils";
import type { QueueItem, TaskApi } from "@/components/learn/types";

function pickTaskThumbnail(task: TaskApi): string {
  const s0 = task?.shots?.[0];
  const versions = s0?.versions && s0.versions.length ? s0.versions : undefined;
  if (versions && versions.length) {
    const current = Math.max(1, Number(s0?.currentVersion || versions[versions.length - 1]?.versionId || versions.length));
    const found = versions.find((x) => x.versionId === current) || versions[versions.length - 1];
    return found?.imagePath ? toImgSrc(found.imagePath) : "";
  }
  const raw = String(s0?.imageUrl || s0?.imagePath || task?.resultImages?.[0] || "").trim();
  return raw ? toImgSrc(raw) : "";
}

export function QueueSidebar(props: {
  queue: QueueItem[];
  tasksById: Record<string, TaskApi | undefined>;
  onOpenTask: (taskId: string) => void;
  onReuseTask: (taskId: string) => void;
  onRetryTask: (taskId: string) => void;
  retryingTaskId?: string | null;
  onClear: () => void;
}) {
  const { queue, tasksById, onOpenTask, onReuseTask, onRetryTask, retryingTaskId, onClear } = props;

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Clock className="w-4 h-4" /> 生成队列
          </h3>
        </div>
        <div className="space-y-3 flex-1 overflow-y-auto p-3 scrollbar-thin">
          {queue.length === 0 && (
            <div className="text-sm text-muted-foreground">暂无任务。点击“生成”后会自动出现在这里。</div>
          )}

          <AnimatePresence initial={false}>
            {queue.map((q) => {
              const t = tasksById[q.taskId];
              const status = (t?.status || "QUEUED") as TaskStatus;
              const statusUi = getStatusLabel(status);
              const progress = computeProgress(status);
              const thumb = t ? pickTaskThumbnail(t) : "";
              const name = t ? taskDisplayName({ id: t.id, directPrompt: t.directPrompt, requirements: t.requirements }) : `Task ${q.taskId.slice(0, 6)}`;
              const isFailed = status === "FAILED";
              const isRetrying = isFailed && retryingTaskId === q.taskId;

              return (
                <motion.div
                  key={q.taskId}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                  role="button"
                  tabIndex={0}
                  onClick={() => t && onOpenTask(q.taskId)}
                  onKeyDown={(e) => {
                    if (!t) return;
                    if (e.key === "Enter" || e.key === " ") onOpenTask(q.taskId);
                  }}
                  draggable={!!t}
                  onDragStartCapture={(e: React.DragEvent<HTMLDivElement>) => {
                    if (!t) return;
                    e.dataTransfer.effectAllowed = "copy";
                    e.dataTransfer.setData("application/x-afs-task-ref", JSON.stringify({ taskId: q.taskId }));
                    // 为了兼容某些浏览器的拖拽预览（至少有一个 text/plain）
                    e.dataTransfer.setData("text/plain", q.taskId);
                  }}
                  className="w-full text-left rounded-2xl border p-3 transition-all duration-200 cursor-pointer bg-white/40 border-white/40 hover:bg-white/60 hover:border-purple-300 hover:shadow-md hover:-translate-x-1 active:scale-[0.98]"
                  title={t ? "点击查看；或拖拽到左侧工作台复用设置" : undefined}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-16 h-16 rounded-xl overflow-hidden border bg-muted flex items-center justify-center flex-shrink-0">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt={name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold line-clamp-1">{name}</div>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${statusUi.color}`}>{statusUi.label}</span>
                      </div>

                      <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full bg-purple-500" style={{ width: `${progress}%` }} />
                      </div>

                      <div className="mt-2 text-[11px] text-muted-foreground flex items-center justify-between">
                        <span>{formatTime(t?.createdAt || q.createdAt)}</span>
                        <span>{progress}%</span>
                      </div>

                      {!!t && (() => {
                        const r = computeRenderDurationMs(t);
                        if (!r) return null;
                        const label = r.kind === "duration" ? "耗时" : "已用";
                        return (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {label}：<span className="font-mono">{formatDurationMs(r.ms)}</span>
                          </div>
                        );
                      })()}

                      {!!t && (
                        <div className="mt-2 flex items-center justify-end gap-2">
                          {isFailed && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRetryTask(q.taskId);
                              }}
                              disabled={isRetrying}
                            >
                              {isRetrying ? "重试中..." : "重新生成"}
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              onReuseTask(q.taskId);
                            }}
                            title="把该任务的参数回填到左侧工作台（仅回填 COS 衣服图；非 COS 需手动重传）"
                          >
                            拉入工作台
                          </Button>
                        </div>
                      )}

                      {!!t?.error && <div className="mt-2 text-[11px] text-rose-600 line-clamp-2">{t.error}</div>}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {queue.length > 0 && (
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => {
                if (!confirm("清空右侧队列列表（不会删除任务本身）？")) return;
                onClear();
              }}
            >
              清空队列列表
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
