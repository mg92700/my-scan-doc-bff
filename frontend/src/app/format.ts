export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0).replace('.', ',')} ${units[i]}`;
}

export function kindOf(contentType: string): string {
  if (contentType === 'application/pdf') return 'PDF';
  if (contentType === 'application/zip') return 'ZIP';
  return 'Fichier';
}
