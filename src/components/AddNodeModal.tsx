"use client";

// Adds a user-made node. Any role can have an image (an image can itself be a
// concept or a motif), and the node can hang under existing nodes.

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { useProjectStore } from "@/store/projectStore";
import { visibleNodes } from "@/domain/graph";
import type { NodeId, Role } from "@/domain/types";
import { fileToImage } from "@/services/images";
import { ROLES, ROLE_LABEL } from "./nodeStyle";
import { Modal, RoleBadge } from "./ui";

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

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canAdd || saving) return;
    setSaving(true);
    const input = { role, title: title.trim() || file!.name.replace(/\.[^.]+$/, ""), body: body.trim() || undefined };
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
    <Modal title="Add node" onClose={onClose} width="max-w-md"
      footer={
        <>
          <span className="flex-1" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => submit()} disabled={!canAdd || saving}>{saving ? "Adding…" : "Add node"}</button>
        </>
      }>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <fieldset>
          <legend className="field-label">Type</legend>
          <div role="radiogroup" className="flex p-0.5 rounded-md bg-subtle border border-line">
            {ROLES.map((r) => (
              <button type="button" key={r} role="radio" aria-checked={role === r} onClick={() => setRole(r)}
                className={`flex-1 h-7 rounded-[5px] text-[13px] font-medium transition-colors ${
                  role === r ? "bg-surface text-ink shadow-[0_1px_2px_rgb(16_24_40/0.1)]" : "text-ink-2 hover:text-ink"}`}>
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="node-title" className="field-label">Title</label>
          <input id="node-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder={file ? "Leave empty to use the file name" : "Name the idea"} className="field idea text-[15px]" />
        </div>
        <div>
          <label htmlFor="node-body" className="field-label">Description (optional)</label>
          <textarea id="node-body" value={body} onChange={(e) => setBody(e.target.value)} rows={2} className="field resize-y" />
        </div>

        <div>
          <span className="field-label">Image (optional, for any type)</span>
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" aria-label="Choose an image"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file && preview ? (
            <div className="flex items-center gap-3 rounded-md border border-line p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="" className="w-12 h-12 rounded object-cover shrink-0" />
              <span className="text-[13px] text-ink truncate flex-1">{file.name}</span>
              <button type="button" className="icon-btn" aria-label="Remove image" onClick={() => setFile(null)}><X size={14} /></button>
            </div>
          ) : (
            <button type="button" className="btn w-full border-dashed" onClick={() => fileRef.current?.click()}>
              <ImagePlus size={15} aria-hidden /> Choose an image
            </button>
          )}
        </div>

        {candidates.length > 0 && (
          <fieldset>
            <legend className="field-label">Comes from (optional)</legend>
            <div className="flex flex-col max-h-44 overflow-y-auto rounded-md border border-line p-1">
              {candidates.map((n) => (
                <label key={n.id} className="flex items-center gap-2 px-2 py-1.5 rounded-[5px] cursor-pointer hover:bg-subtle has-[:checked]:bg-accent-soft">
                  <input type="checkbox" checked={parentIds.has(n.id)} onChange={() => toggleParent(n.id)} className="accent-[var(--color-accent)]" />
                  <RoleBadge role={n.role} />
                  <span className="idea text-[14px] text-ink truncate flex-1">{n.title}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <button type="submit" className="sr-only" tabIndex={-1}>Add node</button>
      </form>
    </Modal>
  );
}
