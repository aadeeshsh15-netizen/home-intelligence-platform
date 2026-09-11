import { NextResponse } from 'next/server';

export interface StandardApiError {
  code: string;
  message: string;
  correlationId?: string;
  details?: Record<string, any>;
}

export interface ApiErrorEnvelope {
  error: StandardApiError;
}

/**
 * Creates a standardized JSON success response.
 */
export function apiSuccess<T>(
  data: T,
  status: number = 200,
  headers: Record<string, string> = {}
): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

/**
 * Creates a standardized JSON error response.
 * Never leaks internal stack traces or database error details to clients in production.
 */
export function apiError(
  code: string,
  message: string,
  status: number = 500,
  options: {
    correlationId?: string;
    details?: Record<string, any>;
    headers?: Record<string, string>;
  } = {}
): NextResponse<ApiErrorEnvelope> {
  const isProduction = process.env.NODE_ENV === 'production';

  const errorPayload: StandardApiError = {
    code,
    message,
    ...(options.correlationId ? { correlationId: options.correlationId } : {}),
    ...(options.details && !isProduction ? { details: options.details } : {}),
  };

  return NextResponse.json(
    { error: errorPayload },
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...(options.correlationId ? { 'X-Correlation-ID': options.correlationId } : {}),
        ...(options.headers || {}),
      },
    }
  );
}
