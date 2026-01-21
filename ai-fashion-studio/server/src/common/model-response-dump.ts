import * as fs from 'fs-extra';
import * as path from 'path';

function shouldDump() {
  const raw = (process.env.DUMP_MODEL_RESPONSES ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function sanitize(value: any): any {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map(sanitize);
  }

  if (typeof value === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
      const key = String(k);

      if (key === 'data' && typeof v === 'string' && v.length > 128) {
        out[key] = `[REDACTED_BASE64 len=${v.length}]`;
        continue;
      }

      out[key] = sanitize(v);
    }
    return out;
  }

  return value;
}

export async function dumpModelResponseIfEnabled(params: {
  kind: 'BRAIN' | 'PAINTER';
  stage: string;
  taskId?: string;
  model?: string;
  responseData: any;
}) {
  if (!shouldDump()) return;

  const onlyTaskId = (process.env.DUMP_MODEL_TASK_ID ?? '').trim();
  if (onlyTaskId && params.taskId && params.taskId !== onlyTaskId) return;

  const dumpsDir = path.join(process.cwd(), 'uploads', 'model-dumps');
  await fs.ensureDir(dumpsDir);

  const ts = Date.now();
  const safeModel = (params.model || 'unknown').replace(/[^\w.-]+/g, '_');
  const safeStage = (params.stage || 'unknown').replace(/[^\w.-]+/g, '_');
  const safeTask = (params.taskId || 'no_task').replace(/[^\w.-]+/g, '_');
  const filename = `${ts}_${params.kind}_${safeStage}_${safeModel}_task-${safeTask}.json`;
  const filePath = path.join(dumpsDir, filename);

  const payload = {
    dumpedAt: ts,
    kind: params.kind,
    stage: params.stage,
    taskId: params.taskId,
    model: params.model,
    responseData: sanitize(params.responseData),
  };

  await fs.writeJson(filePath, payload, { spaces: 2 });
}
