import { matchesImageSignature } from './upload-policy';

const hex = (s: string) => Buffer.from(s.replace(/ /g, ''), 'hex');

describe('matchesImageSignature', () => {
  it.each([
    ['image/png', hex('89 50 4E 47 0D 0A 1A 0A 00 00 00 0D')],
    ['image/jpeg', hex('FF D8 FF E0 00 10 4A 46 49 46 00 01')],
    ['image/jpg', hex('FF D8 FF E1 00 10 45 78 69 66 00 00')],
    ['image/gif', Buffer.from('GIF89a\0\0\0\0\0\0')],
    ['image/webp', Buffer.from('RIFF\x10\0\0\0WEBP')],
  ])('accepts real %s content', (mime, header) => {
    expect(matchesImageSignature(header, mime)).toBe(true);
  });

  it('rejects HTML declared as image/png', () => {
    expect(matchesImageSignature(Buffer.from('<html><script>'), 'image/png')).toBe(false);
  });

  it('rejects a real GIF declared as image/png', () => {
    expect(matchesImageSignature(Buffer.from('GIF89a\0\0\0\0\0\0'), 'image/png')).toBe(false);
  });

  it('rejects a RIFF file that is not WebP', () => {
    expect(matchesImageSignature(Buffer.from('RIFF\x10\0\0\0WAVE'), 'image/webp')).toBe(false);
  });

  it('rejects MIME types it has no signature for', () => {
    expect(matchesImageSignature(Buffer.from('%PDF-1.7\n'), 'application/pdf')).toBe(false);
  });
});
