export const CATEGORY_IDS = ['filosofia', 'design', 'economia', 'ingegneria'] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];
export type Source = { title: string; author?: string; url: string };
export type Claim = { time: string; claim: string; note?: string; sources: Source[] };
export type Correction = { date: string; text: string; sourceUrl?: string };
export type VideoRecord = { title: string; slug: string; category: CategoryId; youtube: string; published: string; description?: string; claims: Claim[]; corrections?: Correction[] };

export const NO_EXTERNAL_SOURCES_MESSAGE = 'Per questo video non sono state utilizzate fonti esterne.';

export const CATEGORIES = [
  { id: 'filosofia', label: 'Filosofia', prompt: 'Che cosa significa essere intelligenti?' },
  { id: 'design', label: 'Design', prompt: 'Come l’interfaccia cambia il modo in cui percepiamo l’AI?' },
  { id: 'economia', label: 'Economia', prompt: 'Chi paga, chi guadagna, quanto costa?' },
  { id: 'ingegneria', label: 'Ingegneria informatica', prompt: 'Come funziona davvero?' }
] as const satisfies readonly { id: CategoryId; label: string; prompt: string }[];

const TIMESTAMP = /^\d{2,}:\d{2}$/;
function assertUrl(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string') throw new Error(`${field} must be a URL`);
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${field} must use http(s)`);
}
function seconds(time: string) { const [m, s] = time.split(':').map(Number); return m * 60 + s; }
export function sortClaimsByTime<T extends { time: string }>(claims: T[]) { return [...claims].sort((a,b) => seconds(a.time)-seconds(b.time)); }
function validateVideo(raw: any): VideoRecord {
  if (!raw || typeof raw !== 'object') throw new Error('video must be an object');
  if (typeof raw.title !== 'string' || !raw.title.trim()) throw new Error('title is required');
  if (typeof raw.slug !== 'string' || !/^[a-z0-9-]+$/.test(raw.slug)) throw new Error('slug is invalid');
  if (!CATEGORY_IDS.includes(raw.category)) throw new Error('category is invalid');
  assertUrl(raw.youtube, 'youtube');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.published)) throw new Error('published must be YYYY-MM-DD');
  if (!Array.isArray(raw.claims)) throw new Error('claims must be an array');
  for (const claim of raw.claims) {
    if (!TIMESTAMP.test(claim.time)) throw new Error(`invalid timestamp: ${claim.time}`);
    if (typeof claim.claim !== 'string' || !claim.claim.trim()) throw new Error('claim text is required');
    if (!Array.isArray(claim.sources) || claim.sources.length === 0) throw new Error('each claim needs at least one source');
    for (const source of claim.sources) { if (!source.title?.trim()) throw new Error('source title is required'); assertUrl(source.url, 'source.url'); }
  }
  return { ...raw, claims: sortClaimsByTime(raw.claims) } as VideoRecord;
}
export function parseVideos(records: unknown[]) {
  const parsed = records.map(validateVideo); const seen = new Set<string>();
  for (const video of parsed) { if (seen.has(video.slug)) throw new Error(`duplicate slug: ${video.slug}`); seen.add(video.slug); }
  return parsed;
}
const modules = import.meta.glob('../data/videos/*.json', { eager: true, import: 'default' });
const VIDEOS = parseVideos(Object.values(modules));
export function getAllVideos() { return [...VIDEOS].sort((a,b) => b.published.localeCompare(a.published)); }
export function getVideosByCategory(category: CategoryId) { return getAllVideos().filter(v => v.category === category); }
