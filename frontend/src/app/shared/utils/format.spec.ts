import { formatSize, kindOf } from './format';

describe('format', () => {
  it('formate les tailles', () => {
    expect(formatSize(512)).toBe('512 o');
    expect(formatSize(1536)).toBe('1,5 Ko');
    expect(formatSize(5 * 1024 * 1024)).toBe('5,0 Mo');
    expect(formatSize(20 * 1024 * 1024)).toBe('20 Mo');
  });

  it('reconnaît le type', () => {
    expect(kindOf('application/pdf')).toBe('PDF');
    expect(kindOf('application/zip')).toBe('ZIP');
    expect(kindOf('image/png')).toBe('Fichier');
  });
});
