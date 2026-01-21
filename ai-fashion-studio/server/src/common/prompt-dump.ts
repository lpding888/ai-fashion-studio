import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';

export async function dumpPromptText(params: {
  kind: 'BRAIN' | 'PAINTER';
  stage: string;
  refId?: string; // taskId / presetId / traceId
  content: string;
}): Promise<{ filePath: string; sha256: string; len: number }> {
  const dumpsDir = path.join(process.cwd(), 'uploads', 'prompt-dumps');
  await fs.ensureDir(dumpsDir);

  const ts = Date.now();
  const safeStage = (params.stage || 'unknown').replace(/[^\w.-]+/g, '_');
  const safeRef = (params.refId || 'no_ref').replace(/[^\w.-]+/g, '_');

  const text = String(params.content || '');
  const sha256 = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  const filename = `${ts}_${params.kind}_${safeStage}_ref-${safeRef}_${sha256.slice(0, 12)}.txt`;
  const filePath = path.join(dumpsDir, filename);

  await fs.writeFile(filePath, text, 'utf8');
  return { filePath, sha256, len: text.length };
}
