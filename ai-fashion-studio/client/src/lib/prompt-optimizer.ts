import api from "@/lib/api";

export type PromptOptimizerPreset = {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  styleHint?: string;
};

export type PromptOptimizerRequest = {
  prompt: string;
  settings: {
    layoutMode: "Individual" | "Grid";
    shotCount: number;
    resolution: "1K" | "2K" | "4K";
    aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9" | "21:9";
  };
  presets?: {
    styles?: PromptOptimizerPreset[];
    poses?: PromptOptimizerPreset[];
    faces?: PromptOptimizerPreset[];
  };
};

export type PromptOptimizerResponse = {
  optimizedPrompt: string;
  promptVersionId?: string;
  promptSha256?: string;
};

export const optimizePrompt = async (payload: PromptOptimizerRequest) => {
  const res = await api.post("/prompt-optimizer/optimize", payload);
  return res.data as PromptOptimizerResponse;
};
