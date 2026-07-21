"use client";

import { useState, useCallback, createContext, useContext, ReactNode } from "react";
import {
    CheckCircleIcon,
    ExclamationCircleIcon,
    InformationCircleIcon,
    ExclamationTriangleIcon,
    XMarkIcon,
} from "@heroicons/react/24/solid";

export type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

interface ToastContextValue {
    toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast must be used inside ToastProvider");
    return ctx;
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((message: string, type: ToastType = "info") => {
        const id = nextId++;

        setToasts((prev) => [...prev, { id, message, type }]);

        // Auto remove toast after 5 seconds
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 5000);
    }, []);

    const removeToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ toast: addToast }}>
            {children}

            {toasts.length > 0 && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-3 w-full px-4 max-w-fit pointer-events-none">
                    {toasts.map((t) => (
                        <div
                            key={t.id}
                            className={`pointer-events-auto relative overflow-hidden flex items-center gap-3 px-4 py-3 min-w-[340px] max-w-md rounded-lg shadow-2xl text-sm font-medium transition-all animate-in fade-in slide-in-from-bottom-4 duration-200
              ${t.type === "warning"
                                    ? "bg-[#18181b] text-white border border-zinc-800"
                                    : t.type === "success"
                                        ? "bg-emerald-600 text-white"
                                        : t.type === "error"
                                            ? "bg-red-600 text-white"
                                            : "bg-blue-600 text-white"
                                }`}
                        >
                            {/* Icon */}
                            <span className="w-6 h-6 flex items-center justify-center flex-none">
                                {t.type === "warning" && (
                                    <div className="w-6 h-6 rounded-md bg-amber-400/20 text-amber-400 flex items-center justify-center">
                                        <ExclamationTriangleIcon className="w-5 h-5 text-amber-400" />
                                    </div>
                                )}
                                {t.type === "success" && <CheckCircleIcon className="w-5 h-5" />}
                                {t.type === "error" && <ExclamationCircleIcon className="w-5 h-5 text-white" />}
                                {t.type === "info" && <InformationCircleIcon className="w-5 h-5 text-white" />}
                            </span>

                            {/* Message */}
                            <span className="flex-1 text-sm text-zinc-100 font-medium">{t.message}</span>

                            {/* Close button */}
                            <button
                                onClick={() => removeToast(t.id)}
                                className="ml-2 text-zinc-400 hover:text-white transition-colors p-0.5 rounded-md"
                            >
                                <XMarkIcon className="w-4 h-4" />
                            </button>

                            {/* Progress Bar / Bottom Line */}
                            {t.type === "warning" && (
                                <div className="absolute bottom-0 left-0 h-1 bg-amber-400 rounded-b-lg animate-shrink-progress"></div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </ToastContext.Provider>
    );
}