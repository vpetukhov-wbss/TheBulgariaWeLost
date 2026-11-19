# Локална среда за разработка

Репото предоставя възпроизводим Docker Compose стек за Angular, NestJS, .NET Media API, MongoDB replica set, Mailpit и SFTP. Всички публикувани портове слушат само на `127.0.0.1`. Локалните SSH ключове и Compose стойности се генерират в `.dev/` и не се записват в Git.

## Изисквания

- Docker с Compose v2;
- OpenSSH `ssh-keygen`;
- `curl` за крайната проверка;
- свободни локални портове `2222`, `3000`, `4200`, `5088`, `8025`, `1025` и `27017`.

## Стартиране с една команда

```sh
./scripts/dev-up.sh
```

Командата:

1. генерира отделни Ed25519 client и host ключове за локалния SFTP;
2. изгражда и стартира шестте услуги и изчаква Docker health checks;
3. прилага версираните MongoDB миграции и зарежда идемпотентни синтетични акаунти в `bulgaria_archive_dev`;
4. проверява Angular, NestJS + MongoDB, .NET, Mailpit и реален SFTP write/read/delete цикъл.

| Компонент                | Адрес                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------- |
| Angular                  | http://127.0.0.1:4200                                                                 |
| NestJS API / Swagger     | http://127.0.0.1:3000/api/v1 · http://127.0.0.1:3000/docs                             |
| .NET Media API / OpenAPI | http://127.0.0.1:5088/media/health/live · http://127.0.0.1:5088/media/openapi/v1.json |
| Mailpit                  | http://127.0.0.1:8025                                                                 |
| MongoDB                  | `mongodb://127.0.0.1:27017/bulgaria_archive_dev?replicaSet=rs0&directConnection=true` |
| SFTP                     | `media@127.0.0.1:2222`, root `/archive`, key `.dev/sftp/media_ed25519`                |

## Синтетични акаунти

Профилът `demo` използва една силна парола, генерирана отделно за checkout-а в игнорирания `.dev/compose.env`. `dev-up.sh` я показва след успешните проверки. Можеш да подадеш собствена локална парола само за текущото стартиране:

```sh
SEED_PASSWORD="$(openssl rand -hex 32)" ./scripts/dev-up.sh
```

| Имейл                   | Роля / състояние       |
| ----------------------- | ---------------------- |
| `admin@example.test`    | Administrator / Active |
| `editor@example.test`   | Editor / Active        |
| `user@example.test`     | User / Active          |
| `pending@example.test`  | User / Pending         |
| `disabled@example.test` | User / Disabled        |

Seed командата работи само при изрично `ALLOW_LOCAL_SEED=true`, development/test среда, local MongoDB host и отделно development/test име на базата. Тя никога не приема `mongodb+srv` или remote host. Адресите `example.test` не могат да доставят реална поща.

Локалният bootstrap генерира и отделен `AUTH_MFA_ENCRYPTION_KEY`. TOTP тайните се пазят криптирано, recovery кодовете се пазят само като keyed hashes, а пароли, токени, TOTP тайни и recovery кодове не се записват в приложните логове.

За минималния профил:

```sh
SEED_PROFILE=minimal ./scripts/dev-up.sh
```

За контролирана проверка на first-admin потока използвай отделна празна development/test база и командата `npm run bootstrap:admin`, описана в [`apps/api/README.md`](../apps/api/README.md). Командата отказва втори администратор и изисква MongoDB replica set.

Версирането на схемите, индексите, допустимите rollback стъпки и отделната процедура за синтетични staging данни са описани в [MongoDB миграции](mongodb-migrations.md).

## Ежедневни команди

```sh
# Повторна health и SFTP проверка
./scripts/dev-check.sh

# Логове
docker compose --env-file .dev/compose.env logs --follow

# Спиране без изтриване на данните
docker compose --env-file .dev/compose.env down
```

`docker compose --env-file .dev/compose.env down --volumes` изтрива само локалните MongoDB и SFTP volumes и се използва, когато искаш напълно чисто начало.

## Отделни test конфигурации

- NestJS: [`apps/api/.env.test.example`](../apps/api/.env.test.example). E2E suite създава база с уникално `archive_e2e_*` име, стартира API на порт `3011` и я изтрива накрая.
- Angular: `npm run start:mock` и `npm run build:mock` използват отделната `mock` конфигурация и синтетичните fixtures, без да изискват API.
- .NET: [`apps/media/appsettings.Testing.example.json`](../apps/media/appsettings.Testing.example.json). Интеграционните тестове използват in-memory storage и fake control plane, а не development SFTP.

## PR gate

Workflow-ът `.github/workflows/api-contract.yml` се изпълнява за всеки pull request:

| Приложение | Задължителни проверки                                                       |
| ---------- | --------------------------------------------------------------------------- |
| Angular    | Prettier, ESLint, OpenAPI validation/drift, typecheck, production build     |
| NestJS     | Prettier, ESLint, typecheck, build, безопасен seed, E2E с MongoDB и Mailpit |
| .NET       | locked restore, `dotnet format`, Release build, integration tests           |

При промяна на OpenAPI договора CI също сравнява с base branch и отказва несъвместима промяна.
