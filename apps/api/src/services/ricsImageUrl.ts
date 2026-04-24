function getRicsImageBaseUrl(): string {
  const raw = process.env.RICS_IMAGE_BASE_URL?.trim();
  if (!raw) return '/rics-images';
  return raw.replace(/\/+$/, '');
}

export function buildRicsImageUrl(fileName: string | null | undefined): string | null {
  const trimmed = fileName?.trim();
  if (!trimmed) return null;
  return `${getRicsImageBaseUrl()}/${encodeURIComponent(trimmed)}`;
}
