"use client";

// Turns an image ID into a URL an <img> can show, loading the Blob from the
// image store once and caching an object URL for it.
//
// Object URLs are never revoked: images are immutable and shared by ID, and
// a session only touches a few hundred of them.

import { useEffect, useState } from "react";
import { repo } from "@/db";
import type { ImageId } from "@/domain/types";

const pending = new Map<ImageId, Promise<string | null>>();
const loaded = new Map<ImageId, string>();

export function loadImageUrl(id: ImageId): Promise<string | null> {
  let p = pending.get(id);
  if (!p) {
    p = repo().getImage(id).then((rec) => {
      if (!rec) return null;
      const url = URL.createObjectURL(rec.blob);
      loaded.set(id, url);
      return url;
    });
    pending.set(id, p);
  }
  return p;
}

export function useImageUrl(id: ImageId | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (id ? loaded.get(id) ?? null : null));
  useEffect(() => {
    if (!id) { setUrl(null); return; }
    const cached = loaded.get(id);
    if (cached) { setUrl(cached); return; }
    let alive = true;
    loadImageUrl(id).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [id]);
  return url;
}
