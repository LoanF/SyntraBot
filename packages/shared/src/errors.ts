export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 500,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
  }
}
export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 'NOT_FOUND', 404);
  }
}
export class RateLimitedError extends AppError {
  constructor(public readonly retryAfterSec: number) {
    super('Rate limited', 'RATE_LIMITED', 429);
  }
}
export class CryptoError extends AppError {
  constructor(message: string) {
    super(message, 'CRYPTO_ERROR', 500);
  }
}
export class SsrfError extends AppError {
  constructor(message: string) {
    super(message, 'SSRF_BLOCKED', 400);
  }
}
export class ExternalServiceError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'EXTERNAL_SERVICE_ERROR', 502, details);
  }
}
