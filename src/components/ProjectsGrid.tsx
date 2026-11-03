"use client";

// Landing page: every project as a card, newest first. Create, upload, open,
// rename and delete. Deleting asks for confirmation on the card (no browser dialogs).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Plus, Upload } from "lucide-react";
import { useProjectStore } from "@/store/projectStore";
import type { ProjectSummary } from "@/domain/types";
import { aboutUsd, PRICES_CHECKED } from "@/domain/pricing";
import { downloadJson, exportFileName } from "@/services/exportLog";
import { projectFileName } from "@/services/projectFile";
import { useImageUrl } from "./useImageUrl";
import { Menu } from "./ui";

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
  const exportStudyLog = useProjectStore((s) => s.exportStudyLog);
  const exportProjectFile = useProjectStore((s) => s.exportProjectFile);
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
    <article className="group relative rounded-lg bg-surface border border-line hover:border-line-strong hover:shadow-[var(--shadow-float)] transition-shadow overflow-hidden flex flex-col">
      <div className="aspect-[16/9] bg-subtle border-b border-line overflow-hidden">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[13px] text-muted">No images yet</div>
        )}
      </div>
      <div className="p-4 flex flex-col gap-1.5 flex-1">
        {renaming ? (
          <>
            <label htmlFor={`rename-${p.id}`} className="sr-only">Project name</label>
            <input id={`rename-${p.id}`} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle}
              onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setTitle(p.title); setRenaming(false); } }}
              className="field idea text-[17px] relative z-10" />
          </>
        ) : (
          <h2 className="idea text-[18px] leading-tight text-ink truncate">
            {/* The whole card opens the project; the link's box covers it. */}
            <Link href={`/p/${p.id}`} className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-accent focus-visible:after:rounded-lg">
              {p.title}
            </Link>
          </h2>
        )}
        <p className="idea text-[14px] leading-snug text-ink-2 line-clamp-2 min-h-[2.6em]">
          {p.briefExcerpt || <span className="italic text-muted">No brief yet</span>}
        </p>
        <p className="text-[12px] text-muted mt-auto pt-2 tabular-nums" title={`Last edited ${new Date(p.updatedAt).toLocaleString()}`}>
          {p.nodeCount} {p.nodeCount === 1 ? "node" : "nodes"}, {p.imageCount} {p.imageCount === 1 ? "image" : "images"}, {aboutUsd(p.costUsd)}. Edited {timeAgo(p.updatedAt)}.
        </p>
        {confirmDelete && (
          <div role="alert" className="relative z-10 mt-2 flex items-center gap-2 rounded-md bg-danger-soft px-2.5 py-2">
            <span className="text-[13px] text-danger flex-1">Delete this project and its log?</span>
            <button className="btn btn-sm" onClick={() => setConfirmDelete(false)}>Keep</button>
            <button className="btn btn-sm btn-primary bg-danger border-danger hover:bg-[#912018]" onClick={() => deleteProject(p.id)}>Delete</button>
          </div>
        )}
      </div>
      {!renaming && !confirmDelete && (
        <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <Menu label={`Actions for ${p.title}`} items={[
            { label: "Rename", onSelect: () => setRenaming(true) },
            { label: "Export project (with images)", onSelect: async () => {
              const file = await exportProjectFile(p.id);
              if (file) downloadJson(file, projectFileName(p.title, new Date()));
            } },
            { label: "Export study log (JSON)", onSelect: async () => {
              const log = await exportStudyLog(p.id);
              if (log) downloadJson(log, exportFileName(p.title, new Date()));
            } },
            { label: "Delete", onSelect: () => setConfirmDelete(true), danger: true },
          ]} />
        </div>
      )}
    </article>
  );
}

export default function ProjectsGrid() {
  const router = useRouter();
  const projects = useProjectStore((s) => s.projects);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const createProject = useProjectStore((s) => s.createProject);
  const uploadProject = useProjectStore((s) => s.uploadProject);
  const exportAllStudyLogs = useProjectStore((s) => s.exportAllStudyLogs);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const totals = projects.reduce((t, p) => ({ calls: t.calls + p.calls, costUsd: t.costUsd + p.costUsd }), { calls: 0, costUsd: 0 });

  useEffect(() => { loadProjects().then(() => setLoaded(true)); }, [loadProjects]);
  useEffect(() => { document.title = "Projects | Design Workspace"; }, []);

  // One file with every project's log, for analysis across participants.
  async function exportAll() {
    const logs = await exportAllStudyLogs();
    const now = new Date();
    downloadJson({ format: "design-workspace/study-logs@1", exportedAt: now.toISOString(), projects: logs },
      `all-study-logs_${now.toISOString().slice(0, 10)}.json`);
  }

  async function newProject() {
    setCreating(true);
    const id = await createProject();
    router.push(`/p/${id}`);
  }

  async function upload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const id = await uploadProject(await file.text());
      router.push(`/p/${id}`);
    } catch (err) {
      setUploading(false);
      setUploadError(err instanceof Error ? err.message : "Couldn't upload this project.");
    }
  }

  return (
    <main className="min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-12 flex flex-col gap-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-64">
            <h1 className="text-[28px] font-semibold tracking-tight text-ink">Projects</h1>
            <p className="text-[14px] text-ink-2 mt-1">
              {loaded && projects.length === 0
                ? "No projects yet. Start one with a brief, then expand it into concepts, motifs and visuals."
                : "Each project has its own brief, tree and collections."}
            </p>
            {totals.calls > 0 && (
              <p className="text-[13px] text-muted mt-1 tabular-nums"
                title={`Estimated from the tokens Gemini reports, at list prices checked ${PRICES_CHECKED}. Retries and failed calls are included. Deleted projects aren't counted.`}>
                Gemini use across all projects: {totals.calls} {totals.calls === 1 ? "call" : "calls"}, {aboutUsd(totals.costUsd)}
              </p>
            )}
          </div>
          {projects.length > 0 && (
            <button className="btn" onClick={exportAll}><Download size={15} aria-hidden /> Export all study logs</button>
          )}
        </header>

        {uploadError && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {uploadError}
          </p>
        )}

        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
          <button onClick={newProject} disabled={creating}
            className="min-h-[280px] rounded-lg border-2 border-dashed border-line-strong text-ink-2 hover:border-ink-2 hover:text-ink hover:bg-surface transition-colors flex flex-col items-center justify-center gap-2 disabled:opacity-50">
            <Plus size={28} strokeWidth={1.5} aria-hidden />
            <span className="text-[14px] font-medium">{creating ? "Creating…" : "New project"}</span>
          </button>
          <button onClick={() => fileInput.current?.click()} disabled={uploading}
            className="min-h-[280px] rounded-lg border-2 border-dashed border-line-strong text-ink-2 hover:border-ink-2 hover:text-ink hover:bg-surface transition-colors flex flex-col items-center justify-center gap-2 disabled:opacity-50">
            <Upload size={28} strokeWidth={1.5} aria-hidden />
            <span className="text-[14px] font-medium">{uploading ? "Uploading…" : "Upload project"}</span>
          </button>
          <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" aria-hidden tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // so choosing the same file again still fires
              if (file) upload(file);
            }} />
          {projects.map((p) => <ProjectCard key={p.id} p={p} />)}
        </div>
      </div>
    </main>
  );
}
