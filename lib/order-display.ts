type MoneyResult = { amount: number | null; currency: string | null };

const parseNumeric = (input: unknown) => {
  if (typeof input === "number") {
    return Number.isFinite(input) ? input : null;
  }
  if (typeof input === "string") {
    const normalized = input.replace(",", ".").replace(/[^0-9.-]+/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const readMoney = (value: any): MoneyResult => {
  if (value == null) return { amount: null, currency: null };
  if (typeof value === "number" || typeof value === "string") {
    return { amount: parseNumeric(value), currency: null };
  }
  if (typeof value === "object") {
    const amountValue =
      value?.amount ??
      value?.value ??
      value?.money ??
      value?.total ??
      value?.totalAmount ??
      null;
    const currencyValue = value?.currency ?? value?.currencyCode ?? null;
    if (typeof amountValue === "object") {
      const nestedAmount =
        amountValue?.value ?? amountValue?.amount ?? amountValue?.total ?? null;
      const nestedCurrency =
        amountValue?.currency ?? amountValue?.currencyCode ?? currencyValue;
      return {
        amount: parseNumeric(nestedAmount),
        currency: nestedCurrency ?? null,
      };
    }
    return { amount: parseNumeric(amountValue), currency: currencyValue ?? null };
  }
  return { amount: null, currency: null };
};

export function deriveOrderMoney(
  raw: any,
  fallbackTotal: unknown,
  fallbackCurrency: string | null
) {
  const totals = raw?.priceSummary ?? raw?.totals ?? raw?.price ?? {};
  const totalMoney = readMoney(
    totals?.total ??
      totals?.totalAmount ??
      totals?.amount ??
      totals?.grandTotal ??
      totals?.totalPrice ??
      totals
  );
  const currency =
    totals?.currency ??
    totalMoney.currency ??
    fallbackCurrency ??
    raw?.currency ??
    raw?.buyerCurrency ??
    null;
  const totalAmount =
    totalMoney.amount ?? parseNumeric(fallbackTotal) ?? null;
  return { totalAmount, currency };
}

export function deriveOrderNumber(raw: any, fallback: string | null) {
  return (
    raw?.number ??
    raw?.orderNumber?.number ??
    raw?.orderNumber?.displayNumber ??
    raw?.displayId ??
    raw?.orderNumber ??
    raw?.sequenceNumber ??
    fallback ??
    null
  );
}

export function deriveOrderCreatedAt(raw: any, fallback: string | null) {
  const value =
    raw?.createdDate ??
    raw?.createdAt ??
    raw?.creationDate ??
    raw?.createdOn ??
    null;
  if (!value) return fallback;
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "object") {
    const candidate =
      value?.value ??
      value?.date ??
      value?.timestamp ??
      value?.formattedDate ??
      null;
    return candidate ? String(candidate) : fallback;
  }
  return fallback;
}

export function isArchivedOrder(raw: any) {
  if (!raw) return false;
  const archivedFlag =
    raw?.archived ??
    raw?.isArchived ??
    raw?.archivedAt ??
    raw?.archivedDate ??
    raw?.archiveDate ??
    null;
  if (archivedFlag) return true;
  const statusText = String(raw?.status ?? "").toLowerCase();
  return statusText.includes("archived");
}
