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
      <div className="flex flex-col gap-3 h-screen items-center justify-center text-sm text-[#888]">
        <p>That project doesn&apos;t exist in this browser.</p>
        <Link href="/" className="underline text-black">Back to projects</Link>
      </div>
    );
  }

  if (status !== "ready" || openId !== id) {
    return <div className="flex h-screen items-center justify-center text-sm text-[#aaa]">Loading…</div>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f0eeea]">
      <Workspace />
    </div>
  );
}
