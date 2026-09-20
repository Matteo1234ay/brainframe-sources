const VIDEO_ID = /^[A-Za-z0-9_-]{6,}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);

function parse(url: string) {
  try {
    const value = new URL(url);
    if (!['http:', 'https:'].includes(value.protocol) || !HOSTS.has(value.hostname.toLowerCase())) return null;
    return value;
  } catch {
    return null;
  }
}

export function isYouTubeUrl(url: string) {
  return parse(url) !== null;
}

export function extractYouTubeVideoId(url: string) {
  const value = parse(url);
  if (!value) return null;

  let candidate: string | null = null;
  if (value.hostname.toLowerCase() === 'youtu.be') candidate = value.pathname.split('/').filter(Boolean)[0] ?? null;
  else if (value.pathname === '/watch') candidate = value.searchParams.get('v');
  else {
    const parts = value.pathname.split('/').filter(Boolean);
    if (['shorts', 'embed', 'live'].includes(parts[0] ?? '')) candidate = parts[1] ?? null;
  }

  return candidate && VIDEO_ID.test(candidate) ? candidate : null;
}

export function getYouTubeThumbnailUrls(url: string) {
  const id = extractYouTubeVideoId(url);
  return id ? {
    maxres: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    hq: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
  } : null;
}
