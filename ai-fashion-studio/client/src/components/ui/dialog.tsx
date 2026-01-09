
"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils'; // Assuming this exists, based on other components

// Context
interface DialogContextType {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

function useDialog() {
    const context = useContext(DialogContext);
    if (!context) {
        throw new Error('useDialog must be used within a Dialog');
    }
    return context;
}

// Components
export function Dialog({ children, open, onOpenChange }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}) {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);

    // Use controlled state if provided, otherwise internal state
    const isControlled = open !== undefined;
    const isOpen = isControlled ? open : uncontrolledOpen;
    const setIsOpen = (newOpen: boolean) => {
        if (!isControlled) {
            setUncontrolledOpen(newOpen);
        }
        onOpenChange?.(newOpen);
    };

    return (
        <DialogContext.Provider value={{ isOpen, setIsOpen }}>
            {children}
        </DialogContext.Provider>
    );
}

type DialogTriggerProps =
    | { children: React.ReactElement; asChild: true }
    | { children: React.ReactNode; asChild?: false };

export function DialogTrigger({ children, asChild }: DialogTriggerProps) {
    const { setIsOpen } = useDialog();

    if (!asChild) {
        return (
            <button type="button" onClick={() => setIsOpen(true)}>
                {children}
            </button>
        );
    }

    const child = React.Children.only(children) as React.ReactElement<{
        onClick?: React.MouseEventHandler<HTMLElement>;
    }>;

    return React.cloneElement(child, {
        onClick: (e: React.MouseEvent<HTMLElement>) => {
            child.props.onClick?.(e);
            setIsOpen(true);
        }
    });
}

export function DialogContent({ children, className }: { children: React.ReactNode; className?: string }) {
    const { isOpen, setIsOpen } = useDialog();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    // Prevent body scroll when open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 z-[9999] backdrop-blur-sm"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Content */}
                    <div className="fixed inset-0 flex items-center justify-center z-[9999] pointer-events-none p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className={cn(
                                "bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden pointer-events-auto max-h-[90vh] overflow-y-auto",
                                className
                            )}
                            onClick={e => e.stopPropagation()}
                        >
                            {children}
                            <button
                                onClick={() => setIsOpen(false)}
                                className="absolute top-4 right-4 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors bg-white/50 backdrop-blur-sm z-10"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
}

export function DialogHeader({ children }: { children: React.ReactNode }) {
    return <div className="px-6 py-4 border-b border-slate-100">{children}</div>;
}

export function DialogTitle({ children }: { children: React.ReactNode }) {
    return <h2 className="text-lg font-semibold text-slate-900">{children}</h2>;
}

export function DialogDescription({ children }: { children: React.ReactNode }) {
    return <p className="mt-1 text-sm text-slate-500">{children}</p>;
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
    return <div className="px-6 py-4 bg-slate-50 flex justify-end gap-2 border-t border-slate-100">{children}</div>;
}
