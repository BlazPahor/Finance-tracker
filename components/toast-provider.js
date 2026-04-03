"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

const ToastContext = createContext(null);

function makeToast(message, type = "success") {
  return {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now() + Math.random()),
    message,
    type,
  };
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message, type = "success") => {
    const toast = makeToast(message, type);

    setToasts((current) => [...current, toast]);

    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== toast.id));
    }, 3000);
  }, []);

  const value = useMemo(
    () => ({
      showToast,
      dismissToast,
    }),
    [showToast, dismissToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-3">
        {toasts.map((toast) => {
          const toneClass =
            toast.type === "error"
              ? "border-[#fecaca] bg-[#fff5f5] text-[#991b1b]"
              : toast.type === "info"
                ? "border-[#dbeafe] bg-[#f8fbff] text-[#1d4ed8]"
                : "border-[#d9eadf] bg-[#f4fbf6] text-[#166534]";

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 shadow-[0_12px_30px_rgba(16,24,40,0.12)] ${toneClass}`}
            >
              <div className="text-sm font-medium leading-6">{toast.message}</div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="text-xs font-semibold opacity-70 transition hover:opacity-100"
              >
                Zapri
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return context;
}
