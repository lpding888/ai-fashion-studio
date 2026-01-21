export class CreateTaskDto {
  files: Array<Express.Multer.File>;
  face_refs?: Array<Express.Multer.File>;
  style_refs?: Array<Express.Multer.File>;

  // COS Direct Upload URLs
  file_urls?: string[];
  face_ref_urls?: string[];
  style_ref_urls?: string[];

  requirements: string;
  shot_count: number;
  layout_mode: string;
  scene: string;
  resolution: '1K' | '2K' | '4K';
  autoApprove?: boolean; // Auto-approve mode (skip manual check)
  workflow?: 'legacy' | 'hero_storyboard'; // A/B：默认 legacy（不传即老流程）
  autoApproveHero?: boolean; // 新流程：Hero 生成后自动进入分镜
  userId?: string; // 用户ID（用于积分扣费）

  // Advanced shooting options
  location?: string; // 拍摄地址
  styleDirection?: string; // 风格描述
  garmentFocus?: 'top' | 'bottom' | 'footwear' | 'accessories' | 'full_outfit'; // 焦点单品
  aspectRatio?: '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '21:9'; // 画面比例
  facePresetIds?: string; // 预设ID列表
  stylePresetIds?: string; // 风格预设ID列表
}
