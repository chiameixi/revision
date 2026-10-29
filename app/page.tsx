"use client";

import { useEffect } from "react";
import { projectStore, useProjectStore } from "@/store/projectStore";
import Workspace from "@/components/Workspace";

// Opens the most recently edited project, or creates one on first visit.
// Runs once per page load, even under React's double-invoked effects in dev.
// (A projects grid replaces this in phase 4.)
let booting: Promise<void> | null = null;
function boot() {
  booting ??= (async () => {
    const s = projectStore.getState();
    await s.loadProjects();
    const latest = projectStore.getState().projects[0];
    if (latest) await s.openProject(latest.id);
    else await s.createProject();
  })();
  return booting;
}

export default function WorkspacePage() {
  const status = useProjectStore((s) => s.status);

  useEffect(() => {
    boot();
    // Save anything pending when the tab is hidden or closed.
    const flush = () => { projectStore.getState().flush(); };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (status !== "ready") {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-[#aaa]">
        {status === "missing" ? "That project couldn't be found." : "Loading…"}
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f0eeea]">
      <Workspace />
    </div>
  );
}
