import { ApiError } from './ApiError';

interface ErrorPayload {
  message?: unknown;
  error?: unknown;
  code?: unknown;
}

export interface HttpRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  token?: string;
}

export class HttpClient {
  private static readonly REQUEST_TIMEOUT_MS = 25_000;
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.trim().replace(/\/+$/, '');
  }

  async request<T>(path: string, options: HttpRequestOptions = {}): Promise<T> {
    const { body, token, ...requestOptions } = options;
    const headers = new Headers(requestOptions.headers);
    headers.set('Accept', 'application/json');

    if (body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const timeoutController = requestOptions.signal ? null : new AbortController();
    const timeoutId = timeoutController
      ? window.setTimeout(
          () => timeoutController.abort(),
          HttpClient.REQUEST_TIMEOUT_MS,
        )
      : null;

    let response: Response;
    try {
      response = await fetch(this.resolveUrl(path), {
        ...requestOptions,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: requestOptions.signal ?? timeoutController?.signal,
      });
    } catch {
      throw new ApiError(
        'Não foi possível conectar agora. Verifique sua internet e tente novamente.',
        0,
      );
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    }

    const payload = await this.readPayload(response);
    if (!response.ok) {
      const error = this.asErrorPayload(payload);
      const serverMessage = typeof error.message === 'string'
        ? error.message
        : error.error;
      throw new ApiError(
        typeof serverMessage === 'string' && serverMessage.trim()
          ? serverMessage
          : 'Não foi possível concluir agora. Tente novamente.',
        response.status,
        typeof error.code === 'string' ? error.code : undefined,
      );
    }

    return payload as T;
  }

  private resolveUrl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return this.baseUrl ? `${this.baseUrl}${normalizedPath}` : normalizedPath;
  }

  private async readPayload(response: Response): Promise<unknown> {
    if (response.status === 204) return undefined;

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return undefined;

    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }

  private asErrorPayload(payload: unknown): ErrorPayload {
    return payload !== null && typeof payload === 'object' ? (payload as ErrorPayload) : {};
  }
}
