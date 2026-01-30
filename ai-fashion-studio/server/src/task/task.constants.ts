export const MAX_TOTAL_IMAGES = 14;
export const MAX_DIRECT_SHOTS = 6;
export const DIRECT_LAYOUT_MODES = ['Individual', 'Grid'] as const;

// 用于 Swagger/OpenAPI 的可变数组版本
export const DIRECT_LAYOUT_MODES_ARRAY: string[] = [
  ...DIRECT_LAYOUT_MODES,
];
