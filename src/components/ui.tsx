"use client";

// Small shared building blocks so every view behaves and looks the same.

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, X } from "lucide-react";
import type { Role } from "@/domain/types";
import { ROLE_LABEL, ROLE_STYLE } from "./nodeStyle";

// ── Modal ─────────────────────────────────────────────────────────────────────
// A real dialog: labelled, Escape closes, focus stays inside while open and
// goes back to where it was afterwards.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Keeps Tab inside a dialog, closes it on Escape, focuses the first field on
// open and gives focus back to whatever had it before.
export function useDialogFocus(ref: React.RefObject<HTMLElement | null>, onClose: () => void, initial?: string) {
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = (initial ? el?.querySelector<HTMLElement>(initial) : null)
      ?? el?.querySelector<HTMLElement>("[autofocus], textarea, input:not([type=range]):not([type=checkbox])")
      ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => before?.focus?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
    if (e.key !== "Tab" || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
}

export function Modal({ title, description, onClose, children, footer, width = "max-w-lg" }: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const onKeyDown = useDialogFocus(ref, onClose);

  return (
    <div className="fixed inset-0 z-50 bg-[rgb(16_24_40/0.32)] flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descId : undefined}
        onKeyDown={onKeyDown}
        className={`w-full ${width} max-h-[90vh] flex flex-col bg-surface rounded-lg shadow-[var(--shadow-modal)] overflow-hidden`}>
        <div className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-line">
          <div className="flex-1 min-w-0">
            <h2 id={titleId} className="text-[18px] font-semibold text-ink">{title}</h2>
            {description && <p id={descId} className="text-[13px] text-muted mt-0.5">{description}</p>}
          </div>
          <button onClick={onClose} className="icon-btn -mr-1.5" aria-label="Close"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-line flex items-center gap-3">{footer}</div>}
      </div>
    </div>
  );
}

// ── Menu ──────────────────────────────────────────────────────────────────────
// An overflow "⋯" menu. Closes on outside click, Escape, or choosing an item.

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function Menu({ label, items, align = "right" }: { label: string; items: MenuItem[]; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Rendered in a portal so it always sits above canvas layers and notices.
  const place = () => {
    const r = buttonRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos(align === "right"
      ? { top: r.bottom + 4, right: window.innerWidth - r.right }
      : { top: r.bottom + 4, left: r.left });
  };

  const close = () => { setOpen(false); setPos(null); buttonRef.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) { setOpen(false); setPos(null); }
    };
    // Escape closes the menu wherever focus is.
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", place);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Move focus into the menu once it's actually on screen.
  useEffect(() => {
    if (open && pos) menuRef.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
  }, [open, pos]);

  function onMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Tab") { e.preventDefault(); close(); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const enabled = [...(menuRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [])];
    const i = enabled.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (i + 1) % enabled.length : (i - 1 + enabled.length) % enabled.length;
    enabled[next]?.focus();
  }

  return (
    <>
      <button ref={buttonRef} className="btn btn-sm px-2" aria-label={label} aria-haspopup="menu" aria-expanded={open} title={label}
        onClick={() => (open ? close() : setOpen(true))}>
        <MoreHorizontal size={16} aria-hidden />
      </button>
      {open && pos && createPortal(
        <div ref={menuRef} role="menu" aria-label={label} onKeyDown={onMenuKeyDown}
          className="floating fixed w-max min-w-48 max-w-72 p-1 z-[100]" style={pos}>
          {items.map((it) => (
            <button key={it.label} role="menuitem" disabled={it.disabled}
              onClick={() => { close(); it.onSelect(); }}
              className={`w-full text-left px-2.5 py-1.5 rounded-md text-[13px] disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-offset-0 ${
                it.danger ? "text-danger hover:bg-danger-soft" : "text-ink hover:bg-subtle"}`}>
              {it.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Role badge ────────────────────────────────────────────────────────────────

export function RoleBadge({ role, onImage }: { role: Role; onImage?: boolean }) {
  const s = ROLE_STYLE[role];
  return (
    <span className="badge" style={onImage ? { background: "rgb(255 255 255 / 0.92)", color: s.ink } : { background: s.badgeBg, color: s.ink }}>
      {ROLE_LABEL[role]}
    </span>
  );
}
