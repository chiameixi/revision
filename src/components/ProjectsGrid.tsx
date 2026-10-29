"use client";

// Landing page: every project as a card, newest first. Create, open, rename
// and delete. Deleting asks for confirmation inline (no browser dialogs).

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useProjectStore } from "@/store/projectStore";
import type { ProjectSummary } from "@/domain/types";
import { useImageUrl } from "./useImageUrl";
import { formatUsd, PRICES_CHECKED } from "@/domain/pricing";
import styles from "./Workspace.module.css";

function timeAgo(iso: string): string {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(iso).toLocaleDateString();
}

function ProjectCard({ p }: { p: ProjectSummary }) {
  const renameProject = useProjectStore((s) => s.renameProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const cover = useImageUrl(p.coverImageId);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(p.title);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveTitle = () => {
    setRenaming(false);
    if (title.trim() && title.trim() !== p.title) renameProject(p.id, title.trim());
    else setTitle(p.title);
  };

  return (
    <article className={`group bg-white border border-[rgba(0,0,0,0.15)] hover:border-black transition-colors flex flex-col overflow-hidden ${styles.sq}`}>
      <Link href={`/p/${p.id}`} className="block aspect-[16/9] bg-[#f5f4f0] overflow-hidden" aria-label={`Open ${p.title}`}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[11px] italic text-[#757575]">No images yet</div>
        )}
      </Link>
      <div className="p-3.5 flex flex-col gap-1.5 flex-1">
        {renaming ? (
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setTitle(p.title); setRenaming(false); } }}
            className="text-[14px] font-semibold text-[#111] border-b border-black outline-none bg-transparent" />
        ) : (
          <Link href={`/p/${p.id}`} className="text-[14px] font-semibold text-[#111] truncate hover:underline">{p.title}</Link>
        )}
        <p className="text-[12px] text-[#666] leading-snug line-clamp-2 min-h-[2.5em]">
          {p.briefExcerpt || <span className="italic text-[#6b6b6b]">No brief yet</span>}
        </p>
        <div className="flex items-center gap-2 text-[11px] text-[#6b6b6b] mt-auto pt-1" style={{ fontVariantNumeric: "tabular-nums" }}>
          <span>{p.nodeCount} {p.nodeCount === 1 ? "node" : "nodes"}</span>
          <span>·</span>
          <span>{p.imageCount} {p.imageCount === 1 ? "image" : "images"}</span>
          <span>·</span>
          <span title={`${p.calls} model ${p.calls === 1 ? "call" : "calls"}, estimated cost`}>≈ {formatUsd(p.costUsd)}</span>
          <span>·</span>
          <span title={new Date(p.updatedAt).toLocaleString()}>{timeAgo(p.updatedAt)}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] pt-1">
          {confirmDelete ? (
            <>
              <span className="text-red-600">Delete this project and its log?</span>
              <button onClick={() => deleteProject(p.id)} className="font-semibold text-red-600 hover:text-red-800">Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="text-[#6b6b6b] hover:text-[#333]">Keep</button>
            </>
          ) : (
            <>
              <button onClick={() => setRenaming(true)} className="text-[#6b6b6b] hover:text-black">Rename</button>
              <button onClick={() => setConfirmDelete(true)} className="text-[#6b6b6b] hover:text-red-600">Delete</button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

export default function ProjectsGrid() {
  const router = useRouter();
  const projects = useProjectStore((s) => s.projects);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const createProject = useProjectStore((s) => s.createProject);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const totals = projects.reduce((t, p) => ({ calls: t.calls + p.calls, costUsd: t.costUsd + p.costUsd }), { calls: 0, costUsd: 0 });

  useEffect(() => { loadProjects().then(() => setLoaded(true)); }, [loadProjects]);

  async function newProject() {
    setCreating(true);
    const id = await createProject();
    router.push(`/p/${id}`);
  }

  return (
    <main className="min-h-screen bg-[#f0eeea]">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col gap-8">
        <header>
          <h1 className="text-[26px] text-black">Projects</h1>
          <p className="text-[13px] italic text-[#666] mt-1">
            {loaded && projects.length === 0
              ? "No projects yet. Start one with a brief, then expand it into concepts, motifs and visuals."
              : "Each project has its own brief, tree and collections."}
          </p>
          {totals.calls > 0 && (
            <p className="text-[12px] text-[#666] mt-2" style={{ fontVariantNumeric: "tabular-nums" }}
              title={`Estimated from the tokens Gemini reports, at list prices checked ${PRICES_CHECKED}. Retries and failed calls are included. Deleted projects aren't counted.`}>
              Gemini use across all projects: {totals.calls} {totals.calls === 1 ? "call" : "calls"} · ≈ {formatUsd(totals.costUsd)}
            </p>
          )}
        </header>

        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
          <button onClick={newProject} disabled={creating}
            className={`group min-h-[280px] border border-dashed border-[rgba(0,0,0,0.3)] bg-transparent hover:bg-white hover:border-black transition-colors flex flex-col items-center justify-center gap-2 disabled:opacity-50 ${styles.sq}`}>
            <span className="text-[44px] leading-none font-light text-[#6b6b6b] group-hover:text-black transition-colors">+</span>
            <span className="text-[13px] text-[rgba(0,0,0,0.5)] group-hover:text-black transition-colors">
              {creating ? "Creating…" : "New project"}
            </span>
          </button>
          {projects.map((p) => <ProjectCard key={p.id} p={p} />)}
        </div>
      </div>
    </main>
  );
}
