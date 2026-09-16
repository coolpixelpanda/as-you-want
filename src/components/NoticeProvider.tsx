"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AlertCircle, Check, CheckCircle2, Info, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

type NoticeKind = "success" | "error" | "info";

type Notice = {
  id: string;
  kind: NoticeKind;
  message: string;
};

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type NoticeContextValue = {
  notify: (kind: NoticeKind, message: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const NoticeContext = createContext<NoticeContextValue | null>(null);

export function useNotice() {
  const value = useContext(NoticeContext);
  if (!value) throw new Error("useNotice must be used within NoticeProvider");
  return value;
}

export function NoticeProvider({ children }: { children: React.ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null);

  const notify = useCallback((kind: NoticeKind, message: string) => {
    const id = crypto.randomUUID();
    setNotices((rows) => [...rows, { id, kind, message }]);
    window.setTimeout(() => {
      setNotices((rows) => rows.filter((row) => row.id !== id));
    }, 4200);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setDialog({ ...options, resolve });
    });
  }, []);

  const value = useMemo(() => ({ notify, confirm }), [notify, confirm]);

  return (
    <NoticeContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(24rem,calc(100%-2rem))] flex-col gap-2">
        {notices.map((row) => (
          <div
            key={row.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-[0_12px_40px_rgba(80,50,20,0.12)] ${
              row.kind === "success"
                ? "border-[#cfe0d4] bg-[#f3f8f4] text-good"
                : row.kind === "error"
                  ? "border-[#ead0c8] bg-[#fbf1ee] text-bad"
                  : "border-line bg-card text-ink"
            }`}
          >
            {row.kind === "success" ? (
              <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            ) : row.kind === "error" ? (
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
            ) : (
              <Info size={18} className="mt-0.5 shrink-0" />
            )}
            <p className="flex-1 text-sm">{row.message}</p>
            <Button
              variant="ghost"
              size="sm"
              icon={X}
              className="shrink-0 text-current hover:bg-black/5"
              onClick={() => setNotices((rows) => rows.filter((item) => item.id !== row.id))}
              aria-label="Dismiss notification"
            />
          </div>
        ))}
      </div>
      {dialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-card p-6 shadow-[0_20px_60px_rgba(80,50,20,0.18)]">
            <h2 className="font-serif text-2xl">{dialog.title}</h2>
            <p className="mt-2 text-sm text-muted">{dialog.message}</p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="secondary"
                icon={X}
                onClick={() => {
                  dialog.resolve(false);
                  setDialog(null);
                }}
              >
                {dialog.cancelLabel || "Cancel"}
              </Button>
              <Button
                variant={dialog.danger ? "danger" : "accent"}
                icon={dialog.danger ? Trash2 : Check}
                className={dialog.danger ? "bg-bad text-white hover:bg-[#7f2323] hover:text-white" : ""}
                onClick={() => {
                  dialog.resolve(true);
                  setDialog(null);
                }}
              >
                {dialog.confirmLabel || "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </NoticeContext.Provider>
  );
}
