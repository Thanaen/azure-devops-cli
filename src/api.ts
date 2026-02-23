import type { AdoConfig, AdoRequestOptions } from './types.ts';

export const API_VERSION = '7.0';
export const COMMENTS_API_VERSION = '7.0-preview.3';

export function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replaceAll('%2F', '/');
}

export async function adoRequest<T = unknown>(
  config: AdoConfig,
  path: string,
  {
    method = 'GET',
    body,
    contentType = 'application/json',
    apiVersion = API_VERSION,
  }: AdoRequestOptions = {},
): Promise<T | null> {
  const url = `${config.collectionUrl}${path}${path.includes('?') ? '&' : '?'}api-version=${apiVersion}`;
  const token = btoa(`:${config.pat}`);

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${token}`,
      'Content-Type': contentType,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    tls: config.insecureTls ? { rejectUnauthorized: false } : undefined,
  } as RequestInit);

  if (!res.ok) {
    const preview = (await res.text()).trim().slice(0, 350);
    throw new Error(
      `Azure DevOps API request failed (${res.status}). ${preview}`,
    );
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : null;
}
