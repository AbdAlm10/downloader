import { randomUUID } from "crypto";

export interface DownloadSession {
  url: string;
  formatId: string;
  merge: boolean;
  title: string;
  ext: string;
  tmpPath: string;
  createdAt: number;
}

const TTL_MS = 15 * 60 * 1000;
const sessions = new Map<string, DownloadSession>();

function prune() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > TTL_MS) sessions.delete(id);
  }
}

export function createDownloadSession(data: Omit<DownloadSession, "createdAt">): string {
  prune();
  const id = randomUUID();
  sessions.set(id, { ...data, createdAt: Date.now() });
  return id;
}

export function getDownloadSession(id: string): DownloadSession | null {
  prune();
  return sessions.get(id) ?? null;
}

export function consumeDownloadSession(id: string): DownloadSession | null {
  const session = getDownloadSession(id);
  if (!session) return null;
  sessions.delete(id);
  return session;
}
