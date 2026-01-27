export type TradeEventPayload = {
  intendedPrice?: unknown;
  price?: unknown;
  qty?: unknown;
};

export type TradeEventLike = {
  type?: string;
  payloadJson?: TradeEventPayload | null;
};

export const toNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const computeSlippageFromEvents = (
  events: TradeEventLike[],
  fallbackQty?: number
): number | null => {
  if (!events.length) return null;

  let total = 0;
  let hasData = false;

  for (const event of events) {
    if (event.type !== "FILLED" && event.type !== "CLOSED") continue;
    const payload = event.payloadJson;
    if (!payload) continue;

    const intendedPrice = toNumber(payload.intendedPrice);
    const price = toNumber(payload.price);
    if (intendedPrice === null || price === null) continue;

    const qty = toNumber(payload.qty) ?? (Number.isFinite(fallbackQty) ? fallbackQty : null);
    if (qty === null || qty <= 0) continue;

    total += Math.abs(price - intendedPrice) * qty;
    hasData = true;
  }

  return hasData ? total : null;
};
