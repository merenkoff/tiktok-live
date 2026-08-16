export class OfflineAuthError extends Error {
  constructor(
    message: string,
    readonly code: 'no_cache' | 'mismatch'
  ) {
    super(message);
    this.name = 'OfflineAuthError';
  }
}
