/**
 * المُعين — multi-chat store. Each chat scopes its own research: the verses and
 * roots it has gathered (its «material») plus the message thread. localStorage,
 * reactive like settings/bookmarks/srs. No accounts — it's the reader's own device.
 *
 * A chat's «material» is the union of what its retrieval steps found; the compose
 * step draws ONLY on that, so a generated draft is always grounded in this chat.
 */
import { useSyncExternalStore } from "react";

export type ChatAyah = { ref: string; text: string; score?: number };
export type ChatRoot = { root: string; occ: number; gloss?: string };
export type ChatBook = { ref: string; text: string; source: string; href?: string }; // a cited book/tafsir/layer passage (+ its screen route)
export type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  ayahs?: ChatAyah[]; // verses this turn retrieved / used
  roots?: ChatRoot[]; // roots this turn retrieved
  books?: ChatBook[]; // book/tafsir passages this turn retrieved (server rag) — cited
  draft?: string; // a generated draft (خطبة/منشور/…), shown in a distinct block
  composed?: boolean;
  pending?: boolean; // placeholder while the assistant is working
  error?: boolean;
};
export type Chat = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMsg[];
};

const KEY = "quran-studio:chats";
export const rid = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function load(): Chat[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
let chats: Chat[] = load();
const listeners = new Set<() => void>();
const emit = () => {
  // keep storage bounded — newest 40 chats
  if (chats.length > 40) chats = chats.slice(0, 40);
  localStorage.setItem(KEY, JSON.stringify(chats));
  listeners.forEach((l) => l());
};

export function useChats(): Chat[] {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => chats,
  );
}
export const getChat = (id: string): Chat | undefined => chats.find((c) => c.id === id);

export function createChat(): string {
  const now = Date.now();
  const c: Chat = { id: rid(), title: "محادثة جديدة", createdAt: now, updatedAt: now, messages: [] };
  chats = [c, ...chats];
  emit();
  return c.id;
}
export function deleteChat(id: string): void {
  chats = chats.filter((c) => c.id !== id);
  emit();
}
export function renameChat(id: string, title: string): void {
  chats = chats.map((c) => (c.id === id ? { ...c, title: title.trim() || c.title } : c));
  emit();
}

/** Add a message; returns its id. Bumps the chat to the top. */
export function addMessage(chatId: string, msg: Omit<ChatMsg, "id"> & { id?: string }): string {
  const id = msg.id ?? rid();
  chats = chats.map((c) =>
    c.id === chatId
      ? { ...c, updatedAt: Date.now(), messages: [...c.messages, { ...msg, id }] }
      : c,
  );
  chats = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
  emit();
  return id;
}
/** Patch an existing message (e.g. fill a pending assistant turn). */
export function patchMessage(chatId: string, msgId: string, patch: Partial<ChatMsg>): void {
  chats = chats.map((c) =>
    c.id === chatId
      ? { ...c, updatedAt: Date.now(), messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)) }
      : c,
  );
  emit();
}

/** The chat's accumulated material — deduped verses + roots across the thread. */
export function chatMaterial(chat: Chat): { ayahs: ChatAyah[]; roots: ChatRoot[] } {
  const ayahs = new Map<string, ChatAyah>();
  const roots = new Map<string, ChatRoot>();
  for (const m of chat.messages) {
    for (const a of m.ayahs ?? []) if (!ayahs.has(a.ref)) ayahs.set(a.ref, a);
    for (const r of m.roots ?? []) if (!roots.has(r.root)) roots.set(r.root, r);
  }
  return { ayahs: [...ayahs.values()], roots: [...roots.values()] };
}
