const DEFAULT_RICS_IMAGE_BASE_URL = '/api/rics-images';

const baseUrl = (() => {
  const raw = import.meta.env.VITE_RICS_IMAGE_BASE_URL?.trim();
  if (!raw) return DEFAULT_RICS_IMAGE_BASE_URL;
  return raw.replace(/\/+$/, '');
})();

export function buildRicsImageUrl(fileName: string | null | undefined): string | null {
  const trimmed = fileName?.trim();
  if (!trimmed) return null;
  return `${baseUrl}/${encodeURIComponent(trimmed)}`;
}
