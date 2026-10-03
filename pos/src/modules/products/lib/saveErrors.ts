// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * A 409 here means the SKU or barcode is already on another variant of this
 * store — the one failure this design permits, and the only one the operator
 * can act on. Folding it into "Не вдалося зберегти" left her no way to know
 * she should simply generate another code.
 */
export function saveErrorMessage(err: unknown, fallback: string): string {
  const status =
    typeof err === 'object' && err && 'response' in err
      ? (err as { response?: { status?: number } }).response?.status
      : undefined;
  if (status === 409) {
    return 'Такий артикул або штрихкод уже є в цьому магазині — змініть його або згенеруйте новий';
  }
  return fallback;
}

/**
 * The server's own complaint, when it has one: a 409 from `addVariants` or
 * `updateVariant` says WHICH article or barcode was taken («Артикул «KZ-86» вже
 * є в магазині»), which is the one thing the owner needs to fix that row — the
 * generic 409 text above would send them hunting through a dozen rows.
 */
export function batchErrorMessage(err: unknown, fallback: string): string {
  const response =
    typeof err === 'object' && err && 'response' in err
      ? (err as { response?: { status?: number; data?: { error?: unknown } } }).response
      : undefined;
  if (response?.status === 409 && typeof response.data?.error === 'string' && response.data.error) {
    return response.data.error;
  }
  return saveErrorMessage(err, fallback);
}
