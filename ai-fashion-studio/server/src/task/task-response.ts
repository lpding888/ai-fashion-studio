import type { TaskModel } from '../db/models';

const toLayoutMode = (value: unknown): 'Individual' | 'Grid' | undefined => {
  return value === 'Grid' || value === 'Individual'
    ? (value as 'Individual' | 'Grid')
    : undefined;
};

const toResolution = (value: unknown): '1K' | '2K' | '4K' | undefined => {
  return value === '1K' || value === '2K' || value === '4K'
    ? (value as '1K' | '2K' | '4K')
    : undefined;
};

const toPositiveInt = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const next = Math.floor(value);
  return next > 0 ? next : undefined;
};

export const normalizeTaskResponse = (
  task: TaskModel | null | undefined,
): TaskModel | null | undefined => {
  if (!task) return task;
  const layoutMode =
    toLayoutMode(task.layoutMode) ??
    toLayoutMode(task.layout_mode) ??
    'Individual';
  const layout_mode =
    toLayoutMode(task.layout_mode) ?? toLayoutMode(task.layoutMode) ?? layoutMode;
  const resultImages = Array.isArray(task.resultImages)
    ? task.resultImages.filter((v) => typeof v === 'string')
    : [];
  const config = task.config ?? {};
  const requirements =
    typeof task.requirements === 'string'
      ? task.requirements
      : String(task.directPrompt ?? '').trim();
  const shotCount =
    toPositiveInt(task.shotCount) ??
    (Array.isArray(task.shots) && task.shots.length > 0
      ? task.shots.length
      : 1);
  const resolution = toResolution(task.resolution) ?? '2K';
  const garmentImagePaths = Array.isArray(task.garmentImagePaths)
    ? task.garmentImagePaths.filter((v) => typeof v === 'string')
    : [];
  const scene =
    typeof task.scene === 'string' && task.scene.trim()
      ? task.scene
      : typeof task.directPrompt === 'string'
        ? 'Direct'
        : 'Legacy';

  return {
    ...task,
    requirements,
    shotCount,
    layoutMode,
    layout_mode,
    resolution,
    garmentImagePaths,
    scene,
    resultImages,
    config,
  };
};
