# The Bulgaria We Lost · Angular

Чист Angular workspace за архива с Nebular 17.0.0, Eva Icons и стандартната светла тема `default`. Компонентите на Nebular се импортират във функционалностите, които ги използват. Основата включва начален изглед, профил, работен панел за проверка на достъпа и формите за акаунта.

## Локално стартиране

Нужен е Node.js 22.12+ от серия 22 или Node.js 24. Изпълни от `apps/web`:

```sh
npm ci
npm start
```

Angular показва архива с мок данни на `http://localhost:4200`. За работа със сесиите и NestJS използвай `npm run start:api`. Локалният proxy насочва `/api/**` към NestJS на `http://localhost:3000`. За мейлите на Brocoders задай `FRONTEND_DOMAIN=http://localhost:4200`. При публикуване обслужвай Angular и API от един origin, насочи `/api/` към NestJS и настрой SPA fallback към `index.html` за браузърните маршрути.

```sh
npm run format:check
npm run typecheck
npm run build
```

Проверките при pull request включват форматиране, ESLint, TypeScript typecheck, OpenAPI drift/compatibility и production build:

```sh
npm run format:check
npm run lint
npm run typecheck
npm run typecheck:e2e
npm run contract:validate
npm run api:check
npm run build
npm run test:e2e
```

Готовият браузърен build се намира в `dist/bulgaria-web/browser`.

## Типизиран API клиент

Клиентът в `src/app/api/generated/` се генерира от единния [`contracts/openapi/v1.yaml`](../../contracts/openapi/v1.yaml). Вътрешните service-to-service операции са изключени от browser клиента. Не редактирай генерираните файлове на ръка.

```sh
npm run contract:validate
npm run api:generate
npm run api:check
```

Angular добавя `X-Correlation-ID` към API заявките чрез централен interceptor. Сървърите връщат същата стойност в response header и като `traceId` в Problem Details при грешка.

## Преглед на екраните с мок данни

Стартирай от `apps/web/` с `npm start` или `npm run start:mock`. В горната лента на началната страница са връзките за редактора, администрацията и каталога за всички 190 [Figma изгледа](https://www.figma.com/design/3MmvkZFAq9ghZyQ3YU4w5O).

| Маршрут | Екран |
| --- | --- |
| `/` | Начало на архива |
| `/archive` | Търсене и материали |
| `/account` | Авторски профил |
| `/editor` | Редакторска зона |
| `/admin` | Административно табло |
| `/admin/users` | Потребители |
| `/admin/audit` | Одит |
| `/admin/storage` | Файлови хранилища |
| `/demo` | Каталог на всички изгледи и състояния |

Потребителските и административните потоци използват локални примерни записи и връзки между екраните. Входът, потвържденията, изборът на файлове, бановете и смяната на хранилище са симулации. Прегледът работи самостоятелно без API и база данни. За статичен преглед изпълни `npm run build:mock` и обслужвай `dist/bulgaria-web-mock/browser` със SPA fallback. Обичайният `npm run build` е за уеб приложението със сесии и NestJS интеграция.

Началната страница, картите и формата за търсене са в `src/app/mock/archive/`. Административното табло, показателите и навигацията са в `src/app/mock/management/`, а таблицата е в `src/app/mock/shared/`. Примерните данни и вариантите на екраните са в `src/app/mock/fixtures/`. [Източници на изображенията](src/mock-assets/README.md)

## Сесии и роли

- `NbAuthService` използва `NbPasswordAuthStrategy` с маршрутите на Brocoders под `/api/v1/auth/`. Вградените JWT модел и interceptor поставят access token само в подходящите API заявки. Адаптерът подава refresh token като `Authorization: Bearer` към `POST /api/v1/auth/refresh`. Паралелните заявки споделят един refresh, тъй като Brocoders ротира токена.
- Токените се пазят чрез `NbTokenStorage` в `sessionStorage`: директен маршрут и презареждане в същия таб запазват сесията, но затварянето на таба я премахва. За сесия без достъп на JavaScript до refresh token е необходим отделен договор с NestJS за `HttpOnly` cookie и CSRF защита.
- `NbSecurityModule` управлява видимостта на навигацията за `Guest`, `User`, `Editor` и `Administrator`. JWT claim `role` може да е име или обект с `name`. Стандартните числови роли на Brocoders нямат редакторски или административен достъп в Angular.
- `/admin` използва проектния договор `GET /api/admin/v1/me` още в route guard-а за актуална роля, разрешения и потвърдена администраторска MFA сесия. Кодът от JWT служи само за навигация. При `mfa_required` приложението отваря `/mfa`, където администраторът може да настрои TOTP, да потвърди код или да използва еднократен recovery код.
- Playwright сценарият в `e2e/` проверява refresh rotation, директен `/admin`, MFA връщане към разрешения маршрут, отказ на остарял Administrator claim и състояние при недостъпна услуга. CI инсталира Chromium и изпълнява теста при всеки pull request.

## Зависимости

Angular 21.2 и Nebular 17.0.0 са фиксирани в манифеста и lockfile. Angular CDK е фиксиран на 21.0.6, защото публикуваният Nebular 17 използва вътрешен CDK export, премахнат в 21.1. [Дискусия в Akveo](https://github.com/akveo/nebular/issues/3310)
