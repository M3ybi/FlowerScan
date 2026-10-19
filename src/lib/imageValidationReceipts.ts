// A tiny, session-only cache bounds retained encoded photos. Backend verification
// binds receipts to the authenticated user, exact content, action and expiry.
const receipts = new Map<string, { token: string; expiresAt: number }>();
export const clearImageValidationReceipts = () => receipts.clear();
export const forgetImageValidationReceipt = (image: string) => receipts.delete(image);
export const rememberImageValidationReceipt = (image: string, value: unknown) => {
  if (!value || typeof value !== "object") return;
  const receipt = value as { token?: unknown; expiresAt?: unknown };
  if (typeof receipt.token !== "string" || receipt.token.length > 2048 || typeof receipt.expiresAt !== "number"
    || !Number.isFinite(receipt.expiresAt) || receipt.expiresAt <= Date.now()) return;
  if (receipts.size >= 2) receipts.delete(receipts.keys().next().value!);
  receipts.set(image, { token: receipt.token, expiresAt: receipt.expiresAt });
};
export const imageValidationReceipt = (image: string) => {
  const receipt = receipts.get(image);
  if (!receipt || receipt.expiresAt <= Date.now() + 10_000) { receipts.delete(image); return undefined; }
  return receipt.token;
};
