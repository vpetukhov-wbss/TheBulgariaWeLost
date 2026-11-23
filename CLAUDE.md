# България, която изгубихме

Общностен дигитален архив и издателска платформа. Потребителите създават материали и теми, а редакторите одобряват категории, управляват навигацията и обединяват дубликати.

## Текущо състояние

- [README.md](README.md) описва обхвата на първата версия и избраната инфраструктура.
- [docs/monetization.md](docs/monetization.md) описва рекламните кампании, спонсорствата и връзките към социалните канали.
- Стекът е NestJS и Mongoose за API, Angular и Nebular за уеб интерфейса, .NET и SFTP за файловата услуга. Основата на API е в `apps/api`. Редакционният и административният каталог от екрани е описан в документацията. [Архитектура](docs/architecture.md)

## Архитектура

- Организирай бизнес функционалността като модули в NestJS. Файловата услуга в .NET обслужва потоците от байтове, SFTP и обработката. Записвай бизнес промените и одита в NestJS. Файловата услуга получава необходимото през вътрешния API.
- Publishing управлява публикации, чернови и редакции. Taxonomy управлява теми, категории и идентичността им. Archive управлява медии и произход. Discovery поддържа търсенето. Monetization управлява рекламите и отчетите отделно от редакционното съдържание.
- MongoDB е източникът на истина. OpenSearch е възстановима проекция за търсене. Оригиналите са в частно SFTP хранилище, а публичните копия за преглед се поднасят по HTTPS.
- Пази идентификаторите стабилни при промени на име, URL или хранилище. Когато една промяна изисква надеждно асинхронно индексиране, запиши заявката за обработка с авторитетната промяна и направи обработката идемпотентна.

## Използване на съществуващите проекти

- API в `apps/api/` стъпва върху документирания commit на Brocoders и режима MongoDB/Mongoose. Приложи проектните роли, сесии и правила за достъп според [админ API договора](docs/admin/api.md).
- Уеб приложението е [чист Angular workspace в `apps/web/`](apps/web/README.md) със стандартната светла тема `default` на Akveo Nebular. При стартиране задавай `NbThemeModule.forRoot({ name: 'default' })` и зареждай стиловете за същата тема през Angular workspace конфигурацията. Провери peer dependencies, `package.json` и lockfile при интеграция. Файловата услуга е [модулен монолит в `apps/media/`](apps/media/README.md) с .NET 10 и C# 14.
- Пренеси само нужните за архива компоненти с потвърдени права за публично разпространение. Използвай отделна конфигурация за локалните и production среди.

## Инженерни сетъпи

- Правилата за NestJS, Angular и .NET в `.claude/rules/` се прилагат според засегнатите файлове. Проектната архитектура, базата и правилата за публикуване и права се определят от настоящия документ и правилата на архива.
- Използвай Angular конвенциите на workspace-а, типизиран API клиент и проверка на правата на сървъра. При промяна на договора провери API и Angular клиента поотделно и тествай засегнатия поток между тях.
- Правилата, уменията и агентите са адаптирани от [dotnet](https://github.com/vpetukhov-wbss/ai-engineering-setups/tree/f5c3583f91383240edf3710fc7f1168b7b11dfa7/setups/dotnet) и [angular](https://github.com/vpetukhov-wbss/ai-engineering-setups/tree/f5c3583f91383240edf3710fc7f1168b7b11dfa7/setups/angular) в AI Engineering Setups. [MIT известие](docs/licenses/ai-engineering-setups-MIT.txt)

## Команди за NestJS

- Изпълнявай от `apps/api`. Инсталация и локален старт с `npm ci`, `cp .env.example .env`, `docker compose up -d --wait` и `npm run start:dev`.
- Проверки с `npm run format:check`, `npm run lint`, `npm run typecheck` и `npm run build`. За HTTP интеграция използвай `npm run test:e2e` по указанията в [README на API](apps/api/README.md).
- За нов или променян NestJS endpoint използвай `/nestjs-feature`. Правилата в `.claude/rules/nestjs-api.md` са ограничени до API пакета.

## Команди за .NET Media API

- Изпълнявай от `apps/media`. Възстанови зависимостите с `dotnet restore --locked-mode`. Настрой локалните SFTP профили и служебните токени по [README](apps/media/README.md), след което стартирай с `dotnet run --project src/Media.Api`.
- Провери с `dotnet build --no-restore`, `dotnet test --no-build` и `dotnet format --no-restore --verify-no-changes`.
- За .NET промени използвай `/dotnet-feature`. Запази решенията за права и lease в NestJS и файловите операции в модулите на Media API.

## Работа и проверка

1. Прочети свързаните документи, съществуващия код и промените в работното дърво. Следвай реалните версии и команди от репото.
2. Направи най-малката завършена промяна. Запази съвместимостта на публичните URL, API и съществуващите документи. При промяна на тези договори опиши миграцията и проверките.
3. Проверявай права и бизнес правила на сървъра. За интеграции използвай ограничени timeout и retry, безопасни логове и ясни грешки. Използвай синтетични или изрично разрешени тестови материали.
4. За документация изпълни `git diff --check HEAD`. След създаване на приложение изпълнявай и наличните проверки за форматиране, build и засегнати тестове. В отчета посочи изпълнените команди и ограниченията.
5. Пази ключовете, production настройките, личните данни и оригиналните архивни файлове извън Git. Следвай [лиценза на кода](LICENSE) и отделните условия за всеки архивен материал.

## .NET engineering workflow

- Scope: Media API and its integration tests under `apps/media`. Preserve the NestJS, Angular and SFTP ownership boundaries defined above.
- Solution/project: `apps/media/Media.slnx`.
- SDK and targets: Use pinned SDK 10.0.404 (`apps/media/global.json`). Check project-specific and inherited build settings before changing target frameworks.
- Verification: From `apps/media`, run `dotnet restore --locked-mode`, `dotnet build --no-restore`, `dotnet test --no-build`, and `dotnet format --no-restore --verify-no-changes`.

- Follow the existing repository-specific instructions and work sequence first. Apply [C# rules](.claude/rules/dotnet-csharp.md), [async rules](.claude/rules/dotnet-async-concurrency.md), and the relevant test/contract procedures.
- For substantial changes, use [the .NET feature procedure](.claude/skills/dotnet-feature/SKILL.md) for implementation and [the code review procedure](.claude/skills/code-review/SKILL.md) before publication. Use the relevant specialist review criteria. Check method and constructor signatures, including ambiguous primitive and Boolean arguments.
- Run `python3 scripts/validate-setup.py` when changing the setup. Use the repository's build and test commands for application changes.
