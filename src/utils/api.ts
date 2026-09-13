/**
 * Safe API communication utility.
 * Prevents JSON parse errors ("Unexpected token '<'" or "Unexpected token 'T'")
 * when an endpoint returns an HTML or plain text error page (like Vercel 404/502).
 */

export async function parseApiResponse<T = any>(
  response: Response,
  endpointName: string
): Promise<T> {
  const text = await response.text();
  let data: any;

  try {
    data = text ? JSON.parse(text) : {};
  } catch (_err) {
    // Non-JSON response received (HTML 404, 502, plain text, etc.)
    const preview = text.slice(0, 100).trim().replace(/\s+/g, ' ');
    throw new Error(
      `HTTP ${response.status} from ${endpointName}: Server returned non-JSON response (${preview || 'empty response'})`
    );
  }

  if (!response.ok) {
    const errorMsg =
      data?.error ||
      data?.message ||
      `HTTP ${response.status} from ${endpointName}: Request failed`;
    const error = new Error(errorMsg);
    (error as any).status = response.status;
    (error as any).code = data?.code;
    (error as any).data = data;
    throw error;
  }

  return data as T;
}

export async function apiFetch<T = any>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const endpointName = url.split('?')[0];
  const response = await fetch(url, options);
  return parseApiResponse<T>(response, endpointName);
}
