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
  const origin = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
  // 移除开头的 ./ 但保留 uploads/
  const cleanPath = path.replace(/^\.\//, '').replace(/^\/+/, '');
  return `${origin}/${cleanPath}`;
}
