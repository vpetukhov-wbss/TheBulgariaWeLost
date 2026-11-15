# The Bulgaria We Lost · NestJS API

NestJS 11 и Mongoose 9. Имейл потоците, NestJS конфигурацията, Passport/JWT и шаблоните за имейл са адаптирани от [Brocoders на commit 9620f159](https://github.com/brocoders/nestjs-boilerplate/tree/9620f159eefe38f47747d02ab162852367c5472c). [MIT известие](LICENSE)

## Локално стартиране

Изпълни от `apps/api` с Node.js 22.12+ или 24 и Docker Compose v2.

```sh
cp .env.example .env
npm ci
docker compose up -d --wait
npm run start:dev
```

| Услуга | Адрес |
| --- | --- |
| API | http://localhost:3000/api/v1 |
| Swagger | http://localhost:3000/docs |
| OpenAPI JSON | http://localhost:3000/docs-json |
| Проверка на MongoDB | http://localhost:3000/api/v1/health |
| Mailpit | http://localhost:8025 |
| Angular | http://localhost:4200 |

Compose стартира MongoDB 8 като локален replica set с един възел и Mailpit. Хост портовете са вързани към loopback. Angular proxy обслужва `/api/**` през порт 3000. `FRONTEND_DOMAIN` определя къде сочат линковете за потвърждение и парола. За сървър използвай собствен MongoDB replica set с удостоверяване, мрежова изолация и реални SMTP настройки. NestJS изисква четири различни силни auth ключа в production. Swagger е включен в development и test.

## Потоци и достъп

- `/api/v1/auth` запазва маршрутите на Brocoders за вход, регистрация, потвърждаване на имейл, профил, възстановяване, refresh и изход. Refresh получава refresh JWT като Bearer. Останалите защитени заявки използват access JWT.
- Регистрацията създава `User` с чакащо потвърждение. Passport сверява активния профил и сесията при защитени заявки. Refresh ротира токена чрез атомарна промяна. Смяна на парола или потвърждение на нов имейл обезсилва старите сесии чрез версията на профила.
- `GET /api/admin/v1/me` връща текущата роля и права за `Editor`. Потребител получава `403 forbidden`, а администратор получава `403 mfa_required` до реализацията на MFA. Управлението на ролите, бановете и административният одит са описани в [админ договора](../../docs/admin/api.md).
- Възстановяването връща еднакъв статус за регистриран и непознат имейл. Локалните ограничения на честотата са на процес и IP. При повече инстанции осигури общо ограничаване през входния proxy или споделено хранилище. Задай `APP_TRUST_PROXY_HOPS` само когато достъпът до API е ограничен до известната верига от proxy сървъри.

## Проверки

```sh
npm run format:check
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

За интеграционните тестове държи Compose услугите стартирани. Тестът стартира отделен API процес с порт 3011, отделна база с генерирано име и синтетични акаунти. Използва реалния MongoDB и локалния Mailpit.
