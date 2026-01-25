import { BACKEND_ORIGIN } from "@/lib/api";

export type TaskStatus =
  | "DRAFT"
  | "PENDING"
  | "QUEUED"
  | "PLANNING"
  | "AWAITING_APPROVAL"
  | "RENDERING"
  | "COMPLETED"
  | "FAILED"
  | "HERO_RENDERING"
  | "AWAITING_HERO_APPROVAL"
  | "STORYBOARD_PLANNING"
  | "STORYBOARD_READY"
  | "SHOTS_RENDERING";

export function toImgSrc(pathOrUrl: string): string {
  if (!pathOrUrl) return "";
  const raw = String(pathOrUrl).trim();
  if (!raw) return "";
  if (raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
  const normalized = raw.replace(/\\/g, "/");
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }
  const lower = normalized.toLowerCase();
  const uploadsIndex = lower.lastIndexOf("/uploads/");
  if (uploadsIndex >= 0) {
    const rel = normalized.slice(uploadsIndex + 1);
    return `${BACKEND_ORIGIN}/${rel.replace(/^\/+/, "")}`;
  }
  if (/^[a-zA-Z]:\//.test(normalized)) {
    const stripped = normalized.replace(/^[a-zA-Z]:/, "");
    return `${BACKEND_ORIGIN}/${stripped.replace(/^\/+/, "")}`;
  }
  return `${BACKEND_ORIGIN}/${normalized.replace(/^\/+/, "")}`;
}

export function formatTime(ts: number): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("zh-CN", { hour12: false });
}

export function formatDurationMs(ms: number): string {
  const v = Number(ms);
  if (!Number.isFinite(v) || v < 0) return "-";
  if (v < 1000) return `${Math.round(v)}ms`;
  const s = Math.floor(v / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const ss = s % 60;
  if (m < 60) return ss ? `${m}m${ss}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h${mm}m` : `${h}h`;
}

export function computeProgress(status: TaskStatus): number {
  switch (status) {
    case "DRAFT":
      return 0;
    case "PENDING":
      return 5;
    case "QUEUED":
      return 15;
    case "PLANNING":
      return 25;
    case "AWAITING_APPROVAL":
      return 40;
    case "RENDERING":
    case "HERO_RENDERING":
    case "SHOTS_RENDERING":
      return 70;
    case "STORYBOARD_PLANNING":
      return 50;
    case "STORYBOARD_READY":
      return 60;
    case "AWAITING_HERO_APPROVAL":
      return 80;
    case "COMPLETED":
    case "FAILED":
      return 100;
    default:
      return 0;
  }
}

export function getStatusLabel(status: TaskStatus): { label: string; color: string } {
  switch (status) {
    case "COMPLETED":
      return { label: "已完成", color: "bg-emerald-100 text-emerald-700" };
    case "FAILED":
      return { label: "失败", color: "bg-rose-100 text-rose-700" };
    case "RENDERING":
    case "HERO_RENDERING":
    case "SHOTS_RENDERING":
      return { label: "生成中", color: "bg-purple-100 text-purple-700" };
    case "QUEUED":
    case "PENDING":
      return { label: "排队中", color: "bg-slate-100 text-slate-700" };
    case "PLANNING":
    case "STORYBOARD_PLANNING":
      return { label: "分析中", color: "bg-blue-100 text-blue-700" };
    case "AWAITING_APPROVAL":
    case "AWAITING_HERO_APPROVAL":
      return { label: "待确认", color: "bg-amber-100 text-amber-700" };
    case "STORYBOARD_READY":
      return { label: "就绪", color: "bg-emerald-100 text-emerald-700" };
    default:
      return { label: status, color: "bg-slate-100 text-slate-700" };
  }
}

export function taskDisplayName(args: { id: string; directPrompt?: string; requirements?: string }): string {
  const t = String(args.directPrompt || args.requirements || "").trim();
  if (!t) return `Task ${args.id.slice(0, 6)}`;
  return t.length > 18 ? `${t.slice(0, 18)}…` : t;
}

/**
 * 计算“生图耗时/已用时”（尽量不改后端）：
 * - Direct：用 shots[0].versions[*].createdAt 作为完成时间锚点（首个版本）
 * - In-progress：用客户端 now - createdAt 显示“已用时”（近似）
 */
export function computeRenderDurationMs(task: {
  createdAt?: number;
  status?: TaskStatus | string;
  shots?: Array<{ versions?: Array<{ createdAt: number }> }>;
}): { kind: "elapsed" | "duration"; ms: number } | null {
  const start = Number(task?.createdAt || 0);
  if (!start) return null;

  const status = String(task?.status || "").trim().toUpperCase();
  const isTerminal = status === "COMPLETED" || status === "FAILED";

  const versions = task?.shots?.[0]?.versions;
  if (Array.isArray(versions) && versions.length) {
    const end = Math.min(...versions.map((v) => Number(v?.createdAt || 0)).filter(Boolean));
    if (end && end >= start) return { kind: "duration", ms: end - start };
  }

  if (!isTerminal) {
    const now = Date.now();
    if (now >= start) return { kind: "elapsed", ms: now - start };
  }

  return null;
}
