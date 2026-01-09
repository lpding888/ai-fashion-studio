import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 公开路径不需要认证
    const publicPaths = ['/login', '/api', '/admin/login'];
    if (publicPaths.some(path => pathname.startsWith(path))) {
        return NextResponse.next();
    }

    // 保护 /admin 路径
    if (pathname.startsWith('/admin')) {
        // 从Cookie读取token
        const token = request.cookies.get('token')?.value;

        if (!token) {
            console.log('[Middleware] No token found, redirecting to /admin/login');
            return NextResponse.redirect(new URL('/admin/login', request.url));
        }

        // Token存在，允许访问
        console.log('[Middleware] Token found, allowing access to', pathname);
        return NextResponse.next();
    }

    // 允许其他所有路径
    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$).*)',
    ],
};
