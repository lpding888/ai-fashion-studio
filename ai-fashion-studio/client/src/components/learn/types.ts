import type { TaskStatus } from "@/components/learn/learn-utils";

export type TaskApi = {
  id: string;
  status: TaskStatus;
  createdAt: number;
  // Common fields returned by /tasks/:id (server returns full task model; client only types what we use)
  requirements?: string;
  shotCount?: number;
  layout_mode?: "Individual" | "Grid";
  layoutMode?: "Individual" | "Grid";
  resolution?: "1K" | "2K" | "4K";
  aspectRatio?: "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9";
  // Direct (learn) workflow snapshot (用于“复用设置”回填)
  directPrompt?: string;
  directIncludeThoughts?: boolean;
  directSeed?: number;
  directTemperature?: number;
  directStylePresetIds?: string[];
  directPosePresetIds?: string[];
  directFacePresetIds?: string[];
  garmentImagePaths?: string[];
  shots?: Array<{
    id?: string;
    shotCode?: string;
    status?: string;
    imagePath?: string;
    imageUrl?: string;
    promptEn?: string;
    prompt?: string;
    versions?: Array<{ versionId: number; imagePath: string; prompt?: string; createdAt: number }>;
    currentVersion?: number;
  }>;
  resultImages?: string[];
  error?: string;
};

export type QueueItem = {
  taskId: string;
  createdAt: number;
};

export type PromptSnippet = {
  id: string;
  name?: string;
  text: string;
  createdAt: number;
  updatedAt: number;
};
