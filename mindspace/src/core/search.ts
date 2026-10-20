/**
 * Fast, dependency-free search tolerant of Arabic spelling variants
 * (diacritics, hamza forms, taa marbuta, alef maqsura) and mixed Arabic/English text.
 */
import type { Entity, Snapshot } from "./model";

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[ً-ٰٟـ]/g, "") // harakat, superscript alef, tatweel
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

export interface SearchHit {
  entity: Entity;
  score: number;
}

export function searchEntities(s: Snapshot, query: string, limit = 30): SearchHit[] {
  const q = normalizeText(query);
  if (!q) return [];
  const terms = q.split(" ");
  const hits: SearchHit[] = [];
  for (const e of Object.values(s.entities)) {
    const title = normalizeText(e.title);
    const rest = normalizeText(`${e.description} ${e.tags.join(" ")} ${e.content}`);
    let score = 0;
    let all = true;
    for (const t of terms) {
      if (title.startsWith(t)) score += 6;
      else if (title.includes(t)) score += 4;
      else if (rest.includes(t)) score += 1;
      else {
        all = false;
        break;
      }
    }
    if (all) hits.push({ entity: e, score: score + (title === q ? 10 : 0) });
  }
  return hits.sort((a, b) => b.score - a.score || a.entity.title.localeCompare(b.entity.title, "ar")).slice(0, limit);
}
