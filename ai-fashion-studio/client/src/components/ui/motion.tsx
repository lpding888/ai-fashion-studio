
"use client";

import { motion } from 'framer-motion';
import * as React from 'react';

export const FadeIn = ({ children, delay = 0, className }: { children: React.ReactNode, delay?: number, className?: string }) => (
    <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay, ease: "easeOut" }}
        className={className}
    >
        {children}
    </motion.div>
);

export const SlideUp = ({ children, delay = 0, className }: { children: React.ReactNode, delay?: number, className?: string }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay, type: "spring", stiffness: 100 }}
        className={className}
    >
        {children}
    </motion.div>
);

export const StaggerContainer = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <motion.div
        initial="hidden"
        animate="show"
        variants={{
            hidden: {},
            show: {
                transition: {
                    staggerChildren: 0.1
                }
            }
        }}
        className={className}
    >
        {children}
    </motion.div>
);

export const StaggerItem = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <motion.div
        variants={{
            hidden: { opacity: 0, y: 20 },
            show: { opacity: 1, y: 0 }
        }}
        className={className}
    >
        {children}
    </motion.div>
);
