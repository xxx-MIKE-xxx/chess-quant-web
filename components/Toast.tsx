"use client";
import { useEffect, useState } from "react";

export type NotificationType = "info" | "warning" | "danger" | "success";

interface ToastProps {
  message: string;
  type: NotificationType;
  onClose: () => void;
}

export function Toast({ message, type, onClose }: ToastProps) {
  // Auto-dismiss after 5s
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colors = {
    info: "bg-blue-900/90 border-blue-700 text-blue-100",
    success: "bg-green-900/90 border-green-700 text-green-100",
    warning: "bg-yellow-900/90 border-yellow-700 text-yellow-100",
    danger: "bg-red-900/90 border-red-700 text-red-100",
  };

  return (
    <div className={`fixed bottom-4 right-4 z-50 max-w-sm w-full shadow-2xl rounded-lg border px-4 py-3 flex items-center gap-3 animate-in slide-in-from-bottom-5 fade-in ${colors[type]}`}>
      <div className="flex-1 text-sm font-medium">{message}</div>
      <button onClick={onClose} className="text-white/50 hover:text-white">✕</button>
    </div>
  );
}