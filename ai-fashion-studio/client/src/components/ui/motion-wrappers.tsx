"use client";

import { motion } from "framer-motion";
import React from "react";

const staggerVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    show: { opacity: 1, scale: 1 },
};

export function ScaleIn({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
    return (
        <motion.div
            variants={staggerVariants}
            transition={{ type: "spring", stiffness: 300, damping: 25, delay }}
            className={className}
        >
            {children}
        </motion.div>
    );
}

const fadeInVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1 },
};

export function FadeIn({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
    return (
        <motion.div
            variants={fadeInVariants}
            transition={{ duration: 0.3, delay }}
            className={className}
        >
            {children}
        </motion.div>
    );
}

const slideUpVariants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 },
};

export function SlideUp({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
    return (
        <motion.div
            variants={slideUpVariants}
            transition={{ type: "spring", stiffness: 300, damping: 30, delay }}
            className={className}
        >
            {children}
        </motion.div>
    );
}

// Wrapper for lists with staggered children
export function StaggerContainer({ children, className, stagger = 0.05 }: { children: React.ReactNode; className?: string; stagger?: number }) {
    return (
        <motion.div
            initial="hidden"
            animate="show"
            exit="hidden"
            variants={{
                show: { transition: { staggerChildren: stagger } },
            }}
            className={className}
        >
            {children}
        </motion.div>
    );
}

export const hoverScale = { scale: 1.02, transition: { duration: 0.2 } };
export const tapScale = { scale: 0.98 };
