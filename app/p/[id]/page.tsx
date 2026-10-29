"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { projectStore, useProjectStore } from "@/store/projectStore";
import Workspace from "@/components/Workspace";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const status = useProjectStore((s) => s.status);
  const openId = useProjectStore((s) => s.project?.id);

  useEffect(() => {
    projectStore.getState().openProject(id);
  }, [id]);

  useEffect(() => {
    // Save anything pending when the tab is hidden, closed, or we navigate away.
    const flush = () => { projectStore.getState().flush(); };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, []);

  if (status === "missing") {
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <div className="floating max-w-sm px-5 py-4 flex flex-col gap-3">
          <h1 className="text-[15px] font-semibold text-ink">Project not found</h1>
          <p className="text-[13px] text-ink-2">Projects are saved in the browser they were made in, so this one may be in a different browser or may have been deleted.</p>
          <Link href="/" className="btn self-start">Back to projects</Link>
        </div>
      </div>
    );
  }

  if (status !== "ready" || openId !== id) {
    return <div role="status" className="flex h-screen items-center justify-center text-[13px] text-muted">Loading project…</div>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Workspace />
    </div>
  );
}
