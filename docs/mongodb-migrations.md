# MongoDB схеми, индекси и миграции

NestJS API използва последователни миграции от `apps/api/scripts/migrations/`. Всяка миграция има неизменни `id`, номер, описание и signature. Успешното изпълнение се записва в `_schemaMigrations`, а промяна на вече приложена миграция се отказва чрез checksum. Новите промени винаги се добавят като следваща миграция.

```sh
cd apps/api
DATABASE_URL='mongodb://127.0.0.1:27017/bulgaria_archive_dev?replicaSet=rs0&directConnection=true' npm run migrate
```

Runner-ът:

- изисква MongoDB replica set;
- взема lease в `_migrationLocks`, за да няма два едновременни deploy-а;
- проверява и създава индексите идемпотентно, без автоматично да изтрива несъвместим индекс;
- изпълнява промените по документите и migration marker-а в една majority transaction;
- проверява отново индексите и checksum-а при всяко повторно изпълнение.

`npm run start:prod`, first-admin bootstrap и seed командите изпълняват миграциите преди да работят с данните. За локален `npm run start:dev` изпълни `npm run migrate` предварително.

## Допустим rollback

Миграциите са forward-only. Преди production deploy се прави проверено backup/snapshot и се записват приложната версия и последната migration версия. При проблем:

1. спри записите към засегнатата среда;
2. ако промяната е само additive и старият код я разбира, върни предишната версия на приложението и добави коригираща forward миграция;
3. ако има несъвместима промяна на данните, възстанови snapshot-а в нова база, провери броя и целостта на документите, насочи предишната версия към нея и едва тогава отвори записите;
4. запази проблемната база за анализ до потвърдено възстановяване.

Не изтривай ръчно записи от `_schemaMigrations`, не редактирай checksum и не drop-вай индекс като автоматичен rollback. Неуспешната транзакция връща промените по документите и marker-а. Индекс, създаден преди такава грешка, е безопасно да остане и ще бъде проверен при повторение.

## Синтетични staging данни

Staging seed-ът управлява само фиксираните `example.test` профили и ги маркира с `syntheticSeed.source=managed-v1`. Той е идемпотентен, не изтрива други профили и прекратява само сесиите на управляваните синтетични акаунти.

```sh
cd apps/api
export NODE_ENV=staging
export DATABASE_URL='mongodb://staging-host:27017/bulgaria_archive_staging?replicaSet=rs0'
export SEED_PROFILE=demo
read -rsp 'Temporary synthetic password: ' SEED_PASSWORD
export SEED_PASSWORD
ALLOW_SYNTHETIC_STAGING=LOAD_EXAMPLE_TEST_DATA npm run seed:staging
unset SEED_PASSWORD
```

Командата отказва среда, различна от `staging`, база без `staging` в името, липсваща генерирана парола или липсващото точно потвърждение. Не използвай staging seed срещу production и не пренасочвай `example.test` поща към реални получатели.
