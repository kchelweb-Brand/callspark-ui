import { BEGINNER } from "./beginner";
import { INTERMEDIATE } from "./intermediate";
import { EXPERT } from "./expert";
import shotsJson from "./shots.generated.json";
import type { Level, ManualArticle, Shot } from "./types";

export * from "./types";

export const MANUAL: ManualArticle[] = [...BEGINNER, ...INTERMEDIATE, ...EXPERT];

const SHOTS = shotsJson as Record<string, Shot>;

export function getShot(id: string | undefined): (Shot & { id: string; src: string }) | null {
  if (!id) return null;
  const s = SHOTS[id];
  return s ? { ...s, id, src: `/manual-img/${id}.jpg` } : null;
}

export function getArticle(slug: string): ManualArticle | undefined {
  return MANUAL.find((a) => a.slug === slug);
}

export function articlesByLevel(level: Level): ManualArticle[] {
  return MANUAL.filter((a) => a.level === level);
}

/** Where a guide lives. */
export function articlePath(slug: string): string {
  return `/manual/${slug}`;
}

/** Splits **bold** markers into pieces so a screen can render them without raw HTML. */
export function inlinePieces(text: string): { text: string; bold: boolean }[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) => (part.startsWith("**") && part.endsWith("**") ? { text: part.slice(2, -2), bold: true } : { text: part, bold: false }));
}

/** The same text with the bold markers removed. */
export function plain(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1");
}
