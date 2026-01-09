'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface User {
    id: string;
    username: string;
    nickname?: string;
    email?: string;
    role: 'ADMIN' | 'USER' | 'admin' | 'user';
    status?: 'ACTIVE' | 'DISABLED' | 'PENDING' | 'active' | 'inactive';
}

interface AuthState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isAdmin: boolean;
    hasHydrated: boolean;
    login: (payload: { token: string; user: User }) => void;
    logout: () => void;
    setHasHydrated: (value: boolean) => void;
    recomputeFlags: () => void;
}

function computeIsAdmin(user: User | null) {
    const role = user?.role;
    return role === 'ADMIN' || role === 'admin';
}

export const useAuth = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            token: null,
            isAuthenticated: false,
            isAdmin: false,
            hasHydrated: false,

            login: ({ token, user }) => {
                if (typeof window !== 'undefined') {
                    localStorage.setItem('token', token);
                    localStorage.setItem('user', JSON.stringify(user));
                    document.cookie = `token=${encodeURIComponent(token)}; path=/; max-age=604800`;
                }

                set({
                    token,
                    user,
                    isAuthenticated: true,
                    isAdmin: computeIsAdmin(user),
                });
            },

            logout: () => {
                if (typeof window !== 'undefined') {
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    document.cookie = 'token=; path=/; max-age=0';
                }

                set({
                    token: null,
                    user: null,
                    isAuthenticated: false,
                    isAdmin: false,
                });
            },

            setHasHydrated: (value) => set({ hasHydrated: value }),

            recomputeFlags: () =>
                set((state) => ({
                    isAuthenticated: !!state.token && !!state.user,
                    isAdmin: computeIsAdmin(state.user),
                })),
        }),
        {
            name: 'auth-storage',
            storage: createJSONStorage(() => {
                // Use cookies for SSR compatibility
                if (typeof window !== 'undefined') {
                    return {
                        getItem: (name) => {
                            const value = document.cookie
                                .split('; ')
                                .find(row => row.startsWith(`${name}=`))
                                ?.split('=')[1];
                            return value ? decodeURIComponent(value) : null;
                        },
                        setItem: (name, value) => {
                            document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=604800`; // 7 days
                        },
                        removeItem: (name) => {
                            document.cookie = `${name}=; path=/; max-age=0`;
                        },
                    };
                }
                return {
                    getItem: () => null,
                    setItem: () => { },
                    removeItem: () => { },
                };
            }),
            onRehydrateStorage: () => (state) => {
                state?.recomputeFlags();
                state?.setHasHydrated(true);
            },
        }
    )
);

// Mock login function for development
export async function mockLogin(email: string, password: string): Promise<User> {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));

    // Mock admin user
    if (email === 'admin@example.com' && password === 'admin') {
        return {
            id: 'mock-admin-1',
            username: 'Admin User',
            email: 'admin@example.com',
            role: 'admin',
            status: 'active',
        };
    }

    // Mock regular user
    if (email === 'user@example.com' && password === 'user') {
        return {
            id: 'mock-user-1',
            username: 'Test User',
            email: 'user@example.com',
            role: 'user',
            status: 'active',
        };
    }

    throw new Error('Invalid credentials');
}
