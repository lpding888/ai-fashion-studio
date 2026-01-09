"use client";

import { RequirementForm } from "@/components/requirement-form";
import { FadeIn, SlideUp } from "@/components/ui/motion";
import { Settings, ArrowRight, Sparkles, Layers, LogIn, User } from 'lucide-react';
import Link from 'next/link';
import { TaskHistory } from "@/components/task-history";
import { InspirationGallery } from "@/components/inspiration-gallery";
import { motion, useScroll, useTransform } from "framer-motion";
import { useAuth } from '@/hooks/use-auth';

export default function Home() {
    const { scrollY } = useScroll();
    const heroOpacity = useTransform(scrollY, [0, 300], [1, 0]);
    const heroY = useTransform(scrollY, [0, 300], [0, 100]);
    const { isAuthenticated } = useAuth();

    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 flex flex-col items-center selection:bg-orange-500 selection:text-white relative overflow-hidden">

            {/* 1. Immersive Vibrant Pop Background - BRIGHTENED */}
            <div className="fixed inset-0 z-0">
                {/* Primary sunset glow - TOP RIGHT */}
                <div className="absolute top-[-20%] right-[-10%] w-[70%] h-[70%] rounded-full bg-orange-400/50 blur-[140px] animate-pulse-slow" />

                {/* Secondary pink glow - BOTTOM LEFT */}
                <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-pink-400/50 blur-[140px] animate-pulse-slow delay-1000" />

                {/* Tertiary rose accent - CENTER */}
                <div className="absolute top-[40%] left-[30%] w-[50%] h-[50%] rounded-full bg-rose-500/30 blur-[120px] animate-pulse-slow delay-2000" />

                {/* Ambient violet layer - CENTER */}
                <div className="absolute top-[50%] right-[30%] w-[40%] h-[40%] rounded-full bg-violet-500/25 blur-[100px] animate-pulse-slow delay-500" />

                {/* Grid overlay */}
                <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-20 [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />
            </div>

            {/* 2. Top Navigation */}
            <div className="w-full max-w-[1600px] px-6 py-6 flex justify-between items-center relative z-20">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-6 h-6 text-orange-400" />
                    <span className="text-white font-bold tracking-wider">AI FASHION STUDIO</span>
                </div>

                <div className="flex gap-4">
                    <Link href="/batch">
                        <div className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white backdrop-blur-md rounded-full transition-all flex items-center gap-2 cursor-pointer border border-white/10 group hover:border-white/30 hover:shadow-[0_0_15px_rgba(251,146,60,0.3)]">
                            <Layers className="w-4 h-4" />
                            <span className="text-sm font-medium">Collection Studio</span>
                            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform opacity-50" />
                        </div>
                    </Link>

                    <Link href={isAuthenticated ? "/profile" : "/login"}>
                        <div className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white backdrop-blur-md rounded-full transition-all flex items-center gap-2 cursor-pointer border border-white/10 hover:border-white/30">
                            {isAuthenticated ? <User className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                            <span className="text-sm font-medium">{isAuthenticated ? "个人中心" : "登录"}</span>
                        </div>
                    </Link>

                    <Link href="/settings">
                        <div className="p-2.5 bg-white/5 hover:bg-white/10 backdrop-blur-md rounded-full border border-white/10 transition-all text-white/70 hover:text-white cursor-pointer hover:rotate-90 duration-500">
                            <Settings className="w-5 h-5" />
                        </div>
                    </Link>
                </div>
            </div>

            {/* 3. Hero Section */}
            <motion.div
                style={{ opacity: heroOpacity, y: heroY }}
                className="relative z-10 text-center mt-20 md:mt-32 mb-16 px-4"
            >
                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/5 border border-white/10 rounded-full backdrop-blur-md mb-8 ring-1 ring-white/10 hover:ring-orange-500/50 transition-all shadow-lg shadow-orange-500/10">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                    </span>
                    <span className="text-xs font-medium tracking-widest text-orange-100 uppercase">
                        V 2.0 Agentic Workflow
                    </span>
                </div>

                <h1 className="text-6xl md:text-8xl font-serif text-transparent bg-clip-text bg-gradient-to-b from-white via-orange-100 to-white/50 tracking-tight leading-[1.1] drop-shadow-[0_0_30px_rgba(249,115,22,0.3)]">
                    Redefine <br />
                    <span className="italic font-light bg-clip-text text-transparent bg-gradient-to-r from-orange-300 via-pink-300 to-purple-300">Digital Couture</span>
                </h1>

                <p className="mt-8 text-lg text-slate-300 max-w-2xl mx-auto font-light leading-relaxed">
                    Where artificial intelligence meets high fashion. <br />
                    <span className="text-white/80">Transform your sketches into runway-ready masterpieces.</span>
                </p>
            </motion.div>

            {/* 4. Main Workspace (Glassmorphism) */}
            <div className="w-full max-w-5xl px-4 relative z-20 mb-20">
                <SlideUp className="bg-gradient-to-b from-white/12 to-white/8 backdrop-blur-xl border border-white/40 rounded-3xl p-1 shadow-[0_8px_32px_rgba(0,0,0,0.15)] ring-1 ring-white/25">
                    <div className="bg-white/8 rounded-[20px] p-6 md:p-10 border border-white/10">
                        <div className="flex items-center gap-3 mb-8 border-b border-white/10 pb-4">
                            <div className="w-3 h-3 rounded-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]" />
                            <div className="w-3 h-3 rounded-full bg-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.5)]" />
                            <div className="w-3 h-3 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
                            <div className="ml-auto text-xs text-orange-200/70 font-mono font-bold tracking-widest">VIBRANT_WORKSPACE_ACTIVE</div>
                        </div>

                        <RequirementForm />
                    </div>
                </SlideUp>
            </div>

            {/* 5. Inspiration Stream */}
            <div className="w-full relative z-10 mb-24">
                <div className="text-center mb-8">
                    <h3 className="text-white/40 text-sm font-medium tracking-widest uppercase">Latest Creations</h3>
                </div>
                <InspirationGallery />
            </div>

            {/* 6. History Section */}
            <div className="w-full max-w-7xl px-6 relative z-10 mb-20">
                <div className="flex items-center gap-4 mb-8">
                    <h2 className="text-2xl font-bold text-white">Recent Projects</h2>
                    <div className="h-px bg-white/10 flex-1" />
                </div>
                <TaskHistory />
            </div>

            {/* Footer */}
            <footer className="w-full py-10 border-t border-white/5 text-center text-slate-600 text-sm relative z-10 bg-slate-950">
                <p>Powered by Gemini 2.0 Flash & Gemini 3 Pro</p>
            </footer>

        </main>
    );
}
