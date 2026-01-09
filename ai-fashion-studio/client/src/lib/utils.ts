import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 图片 URL 处理：将服务器路径转为可访问的 URL
export function getImageUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  // 移除开头的 ./ 但保留 uploads/
  const cleanPath = path.replace(/^\.\//, '');
  return `http://localhost:3002/${cleanPath}`;
}
