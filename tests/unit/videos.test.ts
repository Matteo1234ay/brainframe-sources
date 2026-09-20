import { describe, expect, it } from 'vitest';
import { parseVideos, sortClaimsByTime } from '../../src/lib/videos';

const base = {
  title: 'L’AI è davvero intelligente?',
  slug: 'ai-intelligente',
  category: 'filosofia',
  youtube: 'https://www.youtube.com/watch?v=demo',
  published: '2026-10-01',
  claims: [
    { time: '02:15', claim: 'Secondo claim', sources: [{ title: 'Fonte B', url: 'https://example.com/b' }] },
    { time: '00:42', claim: 'Primo claim', sources: [{ title: 'Fonte A', url: 'https://example.com/a' }] }
  ],
  corrections: []
};

describe('video data validation', () => {
  it('accepts valid records', () => expect(parseVideos([base])).toHaveLength(1));
  it('rejects unknown categories', () => expect(() => parseVideos([{ ...base, category: 'marketing' }])).toThrow(/category/i));
  it('rejects duplicate slugs', () => expect(() => parseVideos([base, base])).toThrow(/duplicate slug/i));
  it('sorts claims by timestamp', () => expect(sortClaimsByTime(base.claims).map((claim) => claim.time)).toEqual(['00:42', '02:15']));
  it('rejects non-YouTube video links', () => expect(() => parseVideos([{ ...base, youtube: 'https://example.com/video' }])).toThrow(/youtube/i));
  it('keeps the legacy Brainframe channel URL valid', () => expect(parseVideos([{ ...base, youtube: 'https://www.youtube.com/@BrainframeIT' }])).toHaveLength(1));
});
