import TopNav from "../components/top-nav";
import { initDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HelpPage() {
  await initDb();

  return (
    <main>
      <TopNav title="Как работи UDITO" />
      <div className="container">
        <section className="hero">
          <div>
            <h1>Как работи UDITO</h1>
            <p>
              UDITO е софтуер за издаване на електронни бележки и генериране
              на месечни одиторски файлове за онлайн магазини, свързани с Wix.
            </p>
          </div>
          <div className="hero-card">
            <h2>Бърза навигация</h2>
            <ul className="help-nav">
              <li><a href="#connection">Свързване с Wix</a></li>
              <li><a href="#orders">Поръчки и плащания</a></li>
              <li><a href="#receipts">Електронни бележки</a></li>
              <li><a href="#audit">Одиторски файл</a></li>
              <li><a href="#settings">Настройки</a></li>
              <li><a href="#contact">Контакт и поддръжка</a></li>
            </ul>
          </div>
        </section>

        <section className="help-section" id="connection">
          <h2>Свързване с Wix магазин</h2>
          <div className="help-content">
            <p>
              UDITO се свързва автоматично с вашия Wix магазин, когато отворите
              приложението от Wix Dashboard. След свързването:
            </p>
            <ul>
              <li>Системата получава достъп до поръчките от вашия магазин</li>
              <li>Уебхуковете започват да изпращат информация за нови поръчки в реално време</li>
              <li>Можете да настроите фирмените данни за електронните бележки</li>
            </ul>
            <div className="help-note">
              <strong>Важно:</strong> За да работи системата правилно, трябва да имате
              активна връзка с Wix. Проверете статуса в таблото.
            </div>
          </div>
        </section>

        <section className="help-section" id="orders">
          <h2>Поръчки и плащания</h2>
          <div className="help-content">
            <p>
              UDITO следи поръчките от вашия Wix магазин и автоматично реагира
              при промяна на статуса на плащане.
            </p>
            <h3>Как работи синхронизацията</h3>
            <ul>
              <li><strong>Нова поръчка:</strong> Записва се в системата със статус &ldquo;Неплатена&rdquo;</li>
              <li><strong>Плащане получено:</strong> Статусът се обновява на &ldquo;Платена&rdquo;</li>
              <li><strong>Автоматична бележка:</strong> При маркиране като платена се издава електронна бележка</li>
            </ul>
            <h3>Датата на плащане е ключова</h3>
            <p>
              За целите на счетоводството и одита, важната дата е <strong>кога е получено плащането</strong>,
              а не кога е направена поръчката.
            </p>
            <div className="help-example">
              <strong>Пример:</strong> Поръчка, направена на 28 декември, но платена на 3 януари,
              ще влезе в одиторския файл за <em>януари</em>, защото плащането е получено през януари.
            </div>
          </div>
        </section>

        <section className="help-section" id="receipts">
          <h2>Електронни бележки</h2>
          <div className="help-content">
            <p>
              Електронните електронни бележки се издават автоматично при получаване на плащане.
            </p>
            <h3>Кога се издава бележка</h3>
            <ul>
              <li>Поръчката е маркирана като <strong>ПЛАТЕНА</strong></li>
              <li>Има валиден уникален код на магазина (Fiscal Store ID)</li>
              <li>Има уникален референтен номер на транзакцията</li>
              <li>Общата стойност е по-голяма от нула</li>
            </ul>
            <h3>Кога НЕ се издава бележка</h3>
            <ul>
              <li><strong>Продукти с нулева стойност</strong> — безплатни продукти не получават бележка</li>
              <li><strong>Наложен платеж (COD)</strong> — по подразбиране не се издава електронна бележка,
                защото бележката се издава от куриера. Можете да промените това в настройките.</li>
              <li><strong>Стари поръчки</strong> — поръчки отпреди регистрацията на магазина в системата</li>
              <li><strong>Отменени поръчки</strong> — няма бележка за отменени поръчки</li>
            </ul>
            <h3>Номерация на бележки</h3>
            <p>
              Бележките се номерират автоматично с 10-цифрен номер (например 0000000001).
              Ако мигрирате от друга система, можете да зададете начален номер в настройките,
              за да продължите своята номерация.
            </p>
            <h3>Връщания и сторно</h3>
            <p>
              При връщане на продукт се издава <strong>отрицателна (сторнираща) бележка</strong>,
              която анулира оригиналната.
            </p>
          </div>
        </section>

        <section className="help-section" id="audit">
          <h2>Одиторски файл (XML)</h2>
          <div className="help-content">
            <p>
              Одиторският файл е месечен XML експорт, който се използва за счетоводни цели.
            </p>
            <h3>Какво съдържа</h3>
            <ul>
              <li>Списък на всички поръчки <strong>с издадени електронни бележки</strong></li>
              <li>Данни за фирмата (ЕИК, ДДС номер, адрес)</li>
              <li>Суми, валути и дати на плащане</li>
            </ul>
            <div className="help-note">
              <strong>Важно:</strong> В одиторския файл влизат <strong>само</strong> поръчки,
              за които е издадена електронна бележка. Поръчки без бележка не се включват.
            </div>
            <h3>Период на файла</h3>
            <p>
              Файлът се генерира по <strong>дата на плащане</strong>. Поръчка, направена
              в един месец, но платена в друг, влиза в одиторския файл за месеца на плащане.
            </p>
            <h3>Кога е наличен</h3>
            <p>
              Одиторският файл е наличен само за <strong>приключени месеци</strong>.
              Не можете да изтеглите файл за текущия месец.
            </p>
          </div>
        </section>

        <section className="help-section" id="settings">
          <h2>Настройки</h2>
          <div className="help-content">
            <h3>Фирмени данни</h3>
            <p>
              В <a href="/settings">Настройки</a> можете да въведете данните на фирмата,
              които ще се отпечатват върху електронните бележки:
            </p>
            <ul>
              <li>Име на фирмата и ЕИК</li>
              <li>ДДС номер (ако е приложимо)</li>
              <li>Адрес и контактни данни</li>
              <li>Уникален код на магазина (Fiscal Store ID)</li>
              <li>Лого за бележките</li>
            </ul>
            <h3>Настройки на електронните бележки</h3>
            <p>
              В <a href="/receipts/settings">Настройки на бележки</a> можете да:
            </p>
            <ul>
              <li>Зададете начален номер на бележка (при миграция от друга система)</li>
              <li>Включите/изключите електронни бележки за наложен платеж</li>
            </ul>
          </div>
        </section>

        <section className="help-section">
          <h2>Често задавани въпроси</h2>
          <div className="help-content">
            <div className="help-faq">
              <h3>Защо няма бележка за моята поръчка?</h3>
              <p>
                Проверете дали поръчката е маркирана като ПЛАТЕНА и дали имате
                настроен уникален код на магазина в настройките.
              </p>
            </div>
            <div className="help-faq">
              <h3>Мога ли да издам бележка за стара поръчка?</h3>
              <p>
                Не. Електронни бележки се издават само за поръчки, създадени след
                регистрацията на магазина в UDITO.
              </p>
            </div>
            <div className="help-faq">
              <h3>Какво става при връщане на продукт?</h3>
              <p>
                Системата автоматично издава сторнираща (отрицателна) бележка,
                която анулира оригиналната.
              </p>
            </div>
            <div className="help-faq">
              <h3>Как да продължа номерацията от друга система?</h3>
              <p>
                Отидете в <a href="/receipts/settings">Настройки на бележки</a> и
                въведете началния номер, от който искате да продължите.
              </p>
            </div>
          </div>
        </section>

        <section className="help-section">
          <h2>Политики и правни документи</h2>
          <div className="help-content">
            <ul>
              <li><a href="/policies/privacy">Политика за поверителност</a></li>
              <li><a href="/policies/terms">Общи условия за ползване</a></li>
            </ul>
          </div>
        </section>

        <section className="help-section" id="contact">
          <h2>Контакт и поддръжка</h2>
          <div className="help-content">
            <p>
              За въпроси, техническа поддръжка или обратна връзка, свържете се с нас:
            </p>
            <div className="contact-card">
              <p>
                <strong>ДИЗАЙНС БАЙ ПО ЕООД</strong>
              </p>
              <ul>
                <li>
                  <strong>Уебсайт:</strong>{" "}
                  <a href="https://www.designedbypo.com" target="_blank" rel="noopener noreferrer">
                    www.designedbypo.com
                  </a>
                </li>
                <li>
                  <strong>Email:</strong>{" "}
                  <a href="mailto:office@designedbypo.com">office@designedbypo.com</a>
                </li>
                <li>
                  <strong>Телефон:</strong>{" "}
                  <a href="tel:+359877776119">0877 776 119</a>
                </li>
              </ul>
            </div>
            <div className="help-note">
              <strong>Работно време:</strong> Понеделник - Петък, 10:00 - 18:00 ч.
            </div>
          </div>
        </section>
      </div>
      <footer className="footer">UDITO от ДИЗАЙНС БАЙ ПО ЕООД</footer>
    </main>
  );
}
