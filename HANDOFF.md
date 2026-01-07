# UDITO Handoff (Full Documentation)

## 1) Executive summary (2 sentences)

Проектът е Next.js приложение за Wix Stores + Stripe, което синхронизира поръчки, издава касови бележки и генерира месечни одиторски XML файлове. В момента UI и част от логиката работят, но **критични платежни детайли (уникален код на транзакцията `pi_...`, метод на плащане + last4) все още липсват или са грешни**, а **пълната автоматична синхронизация на всички стари поръчки не е стабилна**.

---

## 2) What was implemented (every concrete change)

### 2.1 Wix connection & context
- Добавен е механизъм за Wix контекст чрез cookies `udito_site_id` и `udito_instance_id`.
- `/api/instance` приема Wix instance token, опитва да извлече `siteId`, записва в DB и set-ва cookies.
- Възможно е да се влезе и без Wix акаунт чрез **код за достъп (instanceId)**.
- Активният магазин е кликаем домейн (за пряк вход към сайта).

### 2.2 Login с код за достъп (instanceId)
- `/login` има форма „Вход с код за достъп“.
- Успешният вход set-ва cookies и пренасочва към `/overview`.
- Добавен е `Logout` бутон (`/api/logout`) за смяна на магазин.
- Клиентът потвърди, че **входът с код работи**, след като копира правилния instanceId.

### 2.3 Sync и backfill
- `/api/backfill` синхронизира поръчки за активния сайт (paging + limit + cursor).
- В `lib/sync.ts` е добавена логика за enrichment: order details + payment lookup + delivery method.
- Подобрено извличане на cursor от Wix API (различни полета на paging).
- `/api/backfill` вече записва **новия cursor** в `sync_state` (преди се презаписваше със стар/нулев).
- `/api/sync/cron` (Vercel cron) има maxPages=10 (повече страници на run).
- Има client auto-sync в `app/overview/auto-sync.tsx` (повторни опити с delay).

### 2.4 Orders UI
- Показа суми: междинна, доставка, данъци, общо.
- Скри архивираните поръчки (да не се броят никъде).
- Cancelled поръчките са стилизирани различно.
- Клиентски данни + контакти се визуализират.
- Подреждане по дата.

### 2.5 Receipts (касови бележки)
- Номер на бележка: 10-цифрен (0000000001).
- Дата/час на издаване: стремеж към paidAt.
- Генерира QR по спецификацията от `/Users/mac/qr_instructions.txt`.
- FX: показва EUR/BGN равностойност (1 EUR = 1.95583 BGN).

### 2.6 Settings / Company Profile
- Премахнати лични данни по подразбиране, оставени placeholders.
- ЕИК и фирма са задължителни, ДДС номер optional.
- Премахнати IBAN и банка (излишни).
- Поле „Уникален код на магазина (в НАП)“.
- Домейн и име на магазина отделни.
- Лого качване; ако липсва лого → показвай името на магазина.

### 2.7 UI polish
- „Отвори в нов таб“ се вижда **само във Wix iframe**.
- Некликаемите бутони „Wix поръчки / Бележки / Одиторски файл“ са маркирани за премахване.
- Активният магазин е кликаем линк.

---

## 3) What is still NOT done / broken

### 3.1 Критични платежни детайли (blocker)
- **Уникален код на транзакцията (`pi_...`) липсва** за платени поръчки.
- **Метод на плащане (Visa/Mastercard + last4)** липсва.
- Плащането често се визуализира грешно за неплатени поръчки.
- Следствие: касовите бележки са невалидни по изисквания.

### 3.2 Пълна автоматична синхронизация (blocker)
- Старите поръчки **не се синхронизират докрай**; броят е 46 вместо очаквани 119+.
- Auto-sync работи частично, но реално не покрива всички страници в практиката (таймаути/частичен курсор).
- Клиентът иска **100% автоматичен sync**, без бутони.

### 3.3 Дати/часове
- Дати/часове в поръчки и бележки често не съвпадат с Wix (търси `paidAt` от Payments).

### 3.4 UI точност
- Подравняване на колони (артикул/кол./ед. цена/данък/общо) още е проблем.
- Методи за доставка и плащане липсват в UI.
- Поръчките понякога показват грешен статус (на неплатени пише платена).

---

## 4) What the user asked for (all requests, detailed)

### 4.1 Orders
- Само поръчки за текущия сайт.
- Архивираните поръчки **никога** да не се виждат/броят.
- Cancelled да са отделен цвят.
- Клиент: само име.
- Контакти: email + телефон (само един имейл).
- Доставка: адрес + **delivery method** (Box Now / Econt и др.).
- Плащане: „Наложен платеж“ (offline) или „Платено с карта“ + Visa/Mastercard + last4.
- Статус: „Платена“, „Очаква плащане“, „Cancelled“ (без „Approved“).
- Часът и датата да са реалните от Wix.
- Таблица артикули да е **перфектно подравнена**.

### 4.2 Receipts
- Номер на бележка: 10-цифрен, водещи нули.
- Дата/час на издаване: **момент на плащане**.
- Само платени поръчки.
- Подреждане по paidAt.
- Уникален код на транзакцията: **реалният `pi_...`**.
- Клиентски данни: име, телефон, адрес, email.
- Метод на доставка + метод на плащане.
- Ако няма лого → показвай името на магазина.
- Ед. цена без ДДС; ДДС 20%; общо = с ДДС.
- Отстъпка само ако има.
- FX: BGN→EUR и EUR→BGN с фиксиран курс.

### 4.3 QR
- Формат от `/Users/mac/qr_instructions.txt`.
- `store_id` = `companies.fiscal_store_id`.
- `transaction_ref` = `pi_...`.
- Дата/час = paidAt (Europe/Sofia).

### 4.4 Overview
- „Записани поръчки“ = всички (без архив).
- Брой за избран месец (dropdown).
- Одиторски файл само за изтекъл месец.
- „Следващи стъпки“ да се смени с текст „Какво прави UDITO“.
- Никакъв manual backfill бутон при стабилен auto-sync.

### 4.5 Access code / multi-tenant
- Всеки магазин има уникален код (instanceId).
- Кодът се вижда само при активен магазин.
- Счетоводител може да влезе с този код без Wix достъп.
- Нужен е „Изход“ за смяна на магазин.

### 4.6 Branding
- Логото: `/Users/mac/Downloads/ai-coding/UDITO.svg` (цветове от PNG, без фон).

---

## 5) What I failed to do

- **Не успях да осигуря реалния Stripe transactionRef (`pi_...`).**
- **Не успях да изведа метод на плащане + last4** от Wix API.
- **Не успях да доведа backfill до пълния брой поръчки** (119+).
- Дати/часове в поръчки/бележки са все още неточни.
- UI подравняване на колони остава проблем.

---

## 6) What was hard / root causes

- Wix Payments API връща 404/непълни данни за `paymentId`.
- Няма ясен endpoint от Wix за `pi_...` без допълнителни scopes.
- Backfill се връща частично (cursor/limit/timeout) и дава непълен брой.
- Синхронизацията е тежка и често таймаутва в браузер.

---

## 7) What the user pushed back on the most

- Липсващ **уникален код на транзакцията**.
- Липсващи/грешни плащания (method + last4).
- Синхронизацията на **старите поръчки**.
- Грешни дати/часове.
- Подравняване на таблиците с артикули.

---

## 8) What must be verified

- Проверка дали **transactionRef = `pi_...`** присъства за всяка платена поръчка.
- Проверка дали **payment method + last4** са коректни.
- Проверка дали **старите поръчки са напълно синхронизирани** (119+).
- Проверка на QR спрямо `/Users/mac/qr_instructions.txt`.
- Проверка на дати/часове (paidAt vs createdAt).

---

## 9) Next steps (actionable)

1) **Намери правилния Wix Payments endpoint / scope** за `pi_...` и `last4`.
2) **Стабилизирай backfill** (server-side job / pagination / no-timeout).
3) **Синхронизирай всички стари поръчки** до реалния брой.
4) **Коригирай payment status** за неплатени поръчки.
5) **Фиксирай подравняването на таблици**.

---

## 10) Prompt for the next developer

"You are taking over UDITO (Next.js + Wix). The critical blockers are: (1) missing Stripe transactionRef `pi_...` and payment method + last4 in orders/receipts, (2) incomplete backfill (46 vs expected 119+ orders). Fix Wix Payments data by finding the correct API endpoint/scope for transaction details. Stabilize backfill to sync all historical orders without manual buttons. Verify QR code format using /Users/mac/qr_instructions.txt, and ensure paidAt dates are correct. Align order/receipt columns, hide archived orders everywhere, and show delivery method + payment method for each order. Only report progress after verifying data in production (`https://udito.vercel.app`)."

---

## 11) Files changed (core)

- `lib/wix.ts`
- `lib/sync.ts`
- `app/api/backfill/route.ts`
- `app/api/sync/cron/route.ts`
- `app/orders/page.tsx`
- `app/receipts/[orderId]/page.tsx`
- `app/overview/page.tsx`
- `app/overview/auto-sync.tsx`
- `app/settings/company-form.tsx`
- `HANDOFF.md`

