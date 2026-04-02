import { useEffect } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  title: string;
  open: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmVariant?: "primary" | "danger";
  loading?: boolean;
  children: React.ReactNode;
}

export function Modal({ title, open, onClose, onConfirm, confirmLabel = "Save", confirmVariant = "primary", loading, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const confirmClass = confirmVariant === "danger"
    ? "bg-[#da3633] hover:bg-[#b62324] text-white"
    : "bg-[#238636] hover:bg-[#2ea043] text-white";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xl bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d] shrink-0">
          <h2 className="text-sm font-semibold text-[#e6edf3]">{title}</h2>
          <button onClick={onClose} className="text-[#8b949e] hover:text-[#e6edf3] transition-colors w-7 h-7 flex items-center justify-center rounded hover:bg-[#21262d]">
            ✕
          </button>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {/* Footer */}
        {onConfirm && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#30363d] shrink-0">
            <button onClick={onClose} className="px-4 py-1.5 text-sm text-[#8b949e] hover:text-[#e6edf3] border border-[#30363d] rounded-md hover:border-[#8b949e] transition-colors">
              Cancel
            </button>
            <button onClick={onConfirm} disabled={loading} className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors disabled:opacity-50 ${confirmClass}`}>
              {loading ? "Saving…" : confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
