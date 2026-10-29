"use client";

// Adds a user-made node. Any role can have an image (an image can itself be a
// concept or a motif), and the node can hang under existing nodes.

import { useEffect, useMemo, useRef, useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { visibleNodes } from "@/domain/graph";
import type { NodeId, Role } from "@/domain/types";
import { fileToImage } from "@/services/images";
import { ROLES, ROLE_LABEL, ROLE_STYLE } from "./nodeStyle";
import styles from "./TreeView.module.css";

export default function AddNodeModal({ initialParentIds, onClose }: { initialParentIds: NodeId[]; onClose: () => void }) {
  const project = useProjectStore((s) => s.project)!;
  const addNode = useProjectStore((s) => s.addNode);
  const addImageNode = useProjectStore((s) => s.addImageNode);
  const setSelection = useProjectStore((s) => s.setSelection);

  const [role, setRole] = useState<Role>("note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [parentIds, setParentIds] = useState<Set<NodeId>>(new Set(initialParentIds));
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const candidates = useMemo(() => visibleNodes(project), [project]);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const canAdd = !!title.trim() || !!file;

  async function submit() {
    if (!canAdd || saving) return;
    setSaving(true);
    const input = { role, title: title.trim() || file!.name, body: body.trim() || undefined };
    const id = file
      ? await addImageNode(await fileToImage(file), input, [...parentIds])
      : addNode(input, [...parentIds]);
    if (id) setSelection([id]);
    onClose();
  }

  const toggleParent = (id: NodeId) => setParentIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className={`bg-white shadow-xl w-full max-w-md p-5 ${styles.sq}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[13px] font-semibold text-[#111]">Add node</h2>
          <button onClick={onClose} className="text-[#6b6b6b] hover:text-[#555] text-base leading-none">✕</button>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {ROLES.map((r) => {
            const s = ROLE_STYLE[r];
            const active = role === r;
            return (
              <button key={r} onClick={() => setRole(r)}
                className={`text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 transition-colors ${styles.sq}`}
                style={active ? { background: s.badgeBg, color: s.badgeText } : { background: "#f5f5f3", color: "#888" }}>
                {ROLE_LABEL[r]}
              </button>
            );
          })}
        </div>

        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder={file ? "Title (defaults to the file name)" : "Title"}
          className="w-full text-[13px] border border-[#e4e3e0] rounded-lg px-3 py-2 mb-3 focus:outline-none focus:border-[#aaa] placeholder:text-[#6b6b6b]" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Description (optional)" rows={2}
          className="w-full text-[12px] border border-[#e4e3e0] rounded-lg px-3 py-2 mb-3 resize-none focus:outline-none focus:border-[#aaa] placeholder:text-[#6b6b6b]" />

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {file && preview ? (
          <div className="flex items-center gap-3 border border-[#e4e3e0] rounded-lg px-3 py-2.5 mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={file.name} className="w-12 h-12 object-cover rounded shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-[#333] truncate">{file.name}</p>
              <button onClick={() => setFile(null)} className="text-[11px] text-[#666] hover:text-[#333] underline mt-0.5">Remove image</button>
            </div>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()}
            className="w-full border border-dashed border-[#ccc] rounded-lg py-3 text-[11px] text-[#6b6b6b] hover:border-[#888] hover:text-[#555] transition-colors mb-4">
            + Add an image (optional, any role)
          </button>
        )}

        {candidates.length > 0 && (
          <div className="mb-4">
            <p className="text-[11px] text-[#6b6b6b] uppercase tracking-wide font-semibold mb-1.5">Comes from (optional)</p>
            <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto border border-[#f0efec] rounded-lg p-1">
              {candidates.map((n) => {
                const s = ROLE_STYLE[n.role];
                const checked = parentIds.has(n.id);
                return (
                  <label key={n.id} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${checked ? "bg-blue-50" : "hover:bg-[#f7f6f3]"}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleParent(n.id)} className="shrink-0 accent-blue-600" />
                    <span className="text-[10px] font-semibold uppercase px-1 py-0.5 rounded shrink-0" style={{ background: s.badgeBg, color: s.badgeText }}>
                      {ROLE_LABEL[n.role]}
                    </span>
                    <span className="text-[11px] text-[#333] truncate flex-1">{n.title}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-[11px] text-[#666] hover:text-[#333] px-3 py-1.5 transition-colors">Cancel</button>
          <button onClick={submit} disabled={!canAdd || saving}
            className="text-[11px] bg-[#111] text-white px-4 py-1.5 rounded-lg hover:bg-[#333] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? "Adding…" : "Add node"}
          </button>
        </div>
      </div>
    </div>
  );
}
