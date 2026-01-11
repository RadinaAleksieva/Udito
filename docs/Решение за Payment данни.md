# Решение за автоматично показване на Payment данни

## Проблем

След като поръчка се маркира като платена в Wix, информацията за плащането (карта, transaction ID) не се показваше автоматично в UDITO.

## Причини

### 1. Wix изпраща `payment_status_updated` event, не `order.updated`

Когато поръчка се маркира като платена, Wix изпраща webhook със slug `payment_status_updated`, а не `order.updated`. Този тип event не беше обработван.

### 2. `orderTransactions` не се извличаше винаги

Дори когато event-а беше обработен, системата не извличаше `orderTransactions` данните (където са детайлите за плащането), защото проверяваше дали вече има такива данни.

### 3. `extractTransactionRef` не използваше правилния transaction ID

Функцията `extractTransactionRef` извличаше `udito.transactionRef` в променлива `explicit`, но НИКОГА не я използваше в return statement-а. Това означаваше, че правилният payment ID (`gatewayTransactionId`) никога не се показваше.

## Решение

### Файл: `/app/api/webhooks/wix/orders/route.ts`

**Промяна 1:** Добавено обработване на `payment_status_updated` events:

```typescript
else if (slug === "payment_status_updated") {
  orderData = eventData.actionEvent?.body?.order ?? eventData.order ?? null;
  console.log("💳 Extracted order from payment_status_updated event");
}
```

**Промяна 2:** ВИНАГИ извличаме `orderTransactions` за payment events:

```typescript
const isPaymentStatusUpdate = event?.metadata?.eventType?.includes('payment_status');
const needsOrderTransactions = !orderRaw?.orderTransactions || isPaymentStatusUpdate;

if (needsOrderTransactions) {
  const orderTx = await fetchOrderTransactionsForOrder({...});
  // ... merge payment data
}
```

### Файл: `/lib/wix.ts` - функция `extractTransactionRef`

**Промяна:** Добавено `explicit ??` като ПЪРВИ приоритет:

```typescript
export function extractTransactionRef(raw: any): string | null {
  const explicit = raw?.udito?.transactionRef ?? null;
  // ... other extractions ...

  return (
    explicit ??  // <-- ТОВА БЕШЕ ПРОПУСНАТО! Сега udito.transactionRef е първи приоритет
    stripeFromExplicit ??
    stripeFromRaw ??
    // ... other fallbacks
  );
}
```

## Payment ID йерархия

Правилният Payment ID (този от Wix Payments dashboard) се намира в:
```
regularPaymentDetails.gatewayTransactionId
```

Той се запазва в:
```
raw.udito.transactionRef
```

И се извлича чрез `extractTransactionRef()` функцията.

## Backup механизъм за стари поръчки

### Endpoint: `/api/admin/enrich-old-orders`

Този endpoint обновява стари поръчки, които нямат payment данни:

1. Намира PAID поръчки без `orderTransactions`
2. Извлича `orderTransactions` от Wix API
3. Записва `gatewayTransactionId` в `udito.transactionRef`
4. Обновява базата данни

### Интеграция

- **AutoSync** (`/app/overview/auto-sync.tsx`) - автоматично извиква endpoint-а след backfill
- **ConnectionCheck** (`/app/overview/connection-check.tsx`) - бутонът "Провери връзката" също извиква endpoint-а

## Golden Point

Ако нещо се счупи, върнете се към commit:
```
d286657 feat: add payment enrichment to connection check
```

## Тестване

1. Направете тестова поръчка в Wix
2. Маркирайте я като платена
3. Проверете в UDITO дали:
   - Поръчката се появява автоматично
   - Payment status се обновява
   - Показва се правилният Payment ID (същият като в Wix Payments dashboard)

---

*Последна актуализация: 11 януари 2026*
