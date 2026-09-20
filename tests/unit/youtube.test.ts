import { describe, expect, it } from 'vitest';
import { extractYouTubeVideoId, getYouTubeThumbnailUrls, isYouTubeUrl } from '../../src/lib/youtube';

const id = 'dQw4w9WgXcQ';

describe('YouTube URLs', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${id}`, id],
    [`https://youtu.be/${id}?si=abc`, id],
    [`https://www.youtube.com/shorts/${id}`, id],
    [`https://www.youtube.com/embed/${id}`, id],
    [`https://www.youtube.com/live/${id}?feature=share`, id]
  ])('extracts a video id from %s', (url, expected) => {
    expect(extractYouTubeVideoId(url)).toBe(expected);
  });

  it('accepts a YouTube channel URL but returns no video id', () => {
    const url = 'https://www.youtube.com/@BrainframeIT';
    expect(isYouTubeUrl(url)).toBe(true);
    expect(extractYouTubeVideoId(url)).toBeNull();
  });

  it('rejects lookalike and non-http hosts', () => {
    expect(isYouTubeUrl('https://youtube.com.evil.example/watch?v=' + id)).toBe(false);
    expect(isYouTubeUrl('ftp://youtube.com/watch?v=' + id)).toBe(false);
  });

  it('derives maxres and hq thumbnails', () => {
    expect(getYouTubeThumbnailUrls(`https://youtu.be/${id}`)).toEqual({
      maxres: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
      hq: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
    });
  });
});
