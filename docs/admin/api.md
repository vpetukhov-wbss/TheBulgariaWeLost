# Административен API

Свързани документи: [модели и правила](models.md) · [Angular екрани](screens.md) · [модел за приходи](../monetization.md)

## Достъп

Ролите на платформата са `User`, `Editor` и `Administrator`. Посетителят без акаунт има публичен достъп. Всеки активен акаунт управлява собствени чернови, изпраща материали за преглед и подава сигнали през API за потребители. Административният API е под `/api/admin/v1`.

| Политика | Роли | Обхват |
| --- | --- | --- |
| `BackOffice.Access` | Editor, Administrator | Профил в панела и табло |
| `Editorial.Manage` | Editor, Administrator | Материали, ревизии, сигнали, каталог и медии |
| `Users.Manage` | Administrator | Профили, роли, санкции, сесии и иницииране на ресет |
| `Storage.Manage` | Administrator | SFTP хранилища и справки за файлове |
| `Operations.Manage` | Administrator | Фонови задачи и състояние на резервните копия |
| `Audit.Read` | Administrator | Четене на одитния журнал |
| `Advertising.Manage` | Administrator | Рекламодатели, кампании и отчети |
| `SiteSettings.Manage` | Administrator | Настройки на сайта |

Всяка заявка проверява актуалната роля, статуса на профила и валидността на сесията. Редакторът има достъп до своите чернови и до съдържанието, изпратено за редакторски преглед поне веднъж. Администраторът има достъп до всички материали. Админ сесията изисква MFA. Смяната на роля, ресет на парола, архивиране на SFTP чернова и активиране на ново изискват потвърдена MFA през последните 10 минути. Това е начална продуктова настройка. Политиките се прилагат в ASP.NET Core и за пряк достъп по ID. При сесия с cookie мутиращите заявки изискват CSRF защита. [ASP.NET Core authorization policies](https://learn.microsoft.com/en-us/aspnet/core/security/authorization/policies) · [OWASP MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)

## Общ договор

- Идентификатори UUID v7, JSON с `camelCase`, дати и часове в UTC. Интервалите `fromUtc` и `toUtc` са с включено начало и изключен край.
- Списъците приемат `limit` между 1 и 100, по подразбиране 25, и непрозрачен `cursor`. Връщат `Page<T> { items, nextCursor }`. Курсорът е обвързан с филтрите и сортирането. Всеки списък има стабилна подредба, например `updatedAtUtc DESC, id DESC` за материали и `occurredAtUtc DESC, id DESC` за одит.
- `GET` на редактируем детайл и успешната му редакция връщат силен `ETag`, обвързан с версията и представянето на самия ресурс. Версионираните `PATCH` и `PUT` изискват конкретния `If-Match`. Липсващ заглавен ред дава `428`, остарял ETag дава `412`. Свързани справки с независимо обновяване се четат отделно. [RFC 9110, If-Match](https://www.rfc-editor.org/rfc/rfc9110.html#name-if-match)
- Командите `POST` за съществуващ версиониран агрегат приемат `expectedVersion` в JSON и връщат `409 version_conflict` при остаряла версия. Това включва команди, при които потребителят потвърждава конкретно състояние. Merge приема и `targetExpectedVersion`. Командите `POST` изискват `Idempotency-Key`, включително създаване. Липсващ ключ дава `400`. Повторение от същия оператор със същата команда и съдържание връща запазения резултат, след проверка на текущия достъп. Същият ключ с различно съдържание дава `409 idempotency_key_reused`. Ако първата заявка още се обработва, отговорът е `409 request_in_progress` с указание за повторение.
- Команди за санкция, смяна на роля, прекратяване на сесии, ресет, искане за корекция, сваляне и възстановяване на съдържание, решения по сигнали, сливане и превключване на хранилище изискват `reason`. Стандартните полета на командата са `expectedVersion` и, когато е приложимо, `reason`. Таблиците посочват специфичните полета.
- Създаване връща `201` и `Location`. Синхронна промяна връща `200` и обновения ресурс, или `204` за изрично отбелязано действие. Фоновата команда връща `202` с `{ operationId, statusUrl }` и `Location` към операцията. `202` означава, че заявката е приета за изпълнение.
- Грешките са `application/problem+json` със стабилен `code`, `traceId` и при нужда `errors` по поле. `401` означава липсваща или невалидна сесия, `403` недостатъчни права или `mfa_required`, `404` липсващ запис, `409` конфликт на състояние, `422` невалидна команда, `429` лимит с `Retry-After`. Приложими кодове са `last_active_admin`, `publication_rights_missing` и `storage_not_ready`. [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html)
- Частните отговори и прегледи използват `Cache-Control: no-store`. Действията с външни услуги имат ограничен timeout и лимит. В отговорите и одита се използват изрично избрани полета.

В таблиците всеки маршрут е относителен спрямо `/api/admin/v1`. `{id}` е идентификаторът на показания ресурс. `GET` връща `200`, освен ако е посочено друго.

## Табло и потребители

| Метод и маршрут | Политика | Вход и резултат |
| --- | --- | --- |
| `GET /me` | BackOffice.Access | `BackOfficePrincipal` с текущата роля, разрешения и статус на потвърждението с MFA |
| `GET /dashboard` | BackOffice.Access | `DashboardSummary` с броячи и връзки според политиките. Редакторът вижда редакторската част |
| `GET /users` | Users.Manage | `q, role, status` → `Page<AdminUserSummary>` |
| `GET /users/{id}` | Users.Manage | `AdminUserDetail` с текущи роля, статус и активна санкция |
| `PATCH /users/{id}` | Users.Manage | `displayName, bio` → `AdminUserDetail`. Ролята и удостоверените данни за вход се управляват през специализираните потоци |
| `POST /users/{id}/role-changes` | Users.Manage | `role` и причина → `AdminUserDetail`. Прекратява сесиите, издадени с предишните права |
| `GET /users/{id}/sanctions` | Users.Manage | `Page<AccountSanction>` с историята на ограниченията |
| `POST /users/{id}/sanctions` | Users.Manage | `expiresAtUtc` или `null` за безсрочен бан, плюс причина → `201 AccountSanction`. `Location` сочи към създадения запис |
| `GET /users/{id}/sanctions/{sanctionId}` | Users.Manage | `AccountSanction` за конкретния профил |
| `POST /users/{id}/sanctions/{sanctionId}/revoke` | Users.Manage | Причина и `expectedVersion` на профила → `AdminUserDetail` |
| `POST /users/{id}/session-revocations` | Users.Manage | Причина и `expectedVersion` на профила → `204`, прекратява всички сесии |
| `POST /users/{id}/password-reset-requests` | Users.Manage | Причина и `expectedVersion` на профила → `202`. Изпраща линк през установения канал за възстановяване. Потребителят задава нова парола |
| `GET /operations/{id}` | Политика на операцията | `AdminOperation`. Операторът може да види собствена операция, ако още има нужната политика. Админ с `Operations.Manage` вижда общия оперативен статус, без лични данни и тайни |

## Материали, сигнали и архивен каталог

Всички маршрути в секцията изискват `Editorial.Manage`.

| Метод и маршрут | Вход и резултат |
| --- | --- |
| `GET /materials` | `q, status, workingStatus, type, authorId, rightsStatus, updatedFromUtc, updatedToUtc` → `Page<MaterialSummary>` |
| `POST /materials` | `type, language, title` → `201 MaterialDetail` с работен статус `Draft`. Създава чернова на името на оператора |
| `GET /materials/{id}` | `MaterialDetail`, включително справка за текущата работна и публикувана ревизия |
| `PATCH /materials/{id}` | Частична промяна на полета от `MaterialDraftInput` → `MaterialDetail`. Записва работна ревизия |
| `POST /materials/{id}/transitions` | `action` → `MaterialDetail`. Действия `SubmitForReview`, `StartReview`, `RequestChanges`, `Publish`, `Withdraw`, `Archive` и `RestoreFromArchive` |
| `GET /materials/{id}/revisions` | `Page<MaterialRevisionSummary>`, подредени по `revisionNumber DESC` |
| `GET /materials/{id}/revisions/{number}` | `MaterialRevisionDetail` за сравнение и преглед |
| `POST /materials/{id}/revision-restorations` | `revisionNumber` и причина → `MaterialDetail` с нова работна ревизия |
| `GET /moderation-cases` | `status, caseType, priority, assigneeId, targetType, targetId` → `Page<ModerationCaseSummary>` |
| `GET /moderation-cases/{id}` | `ModerationCaseDetail` с решение и връзка към обекта |
| `GET /moderation-cases/{id}/reports` | `Page<ModerationReport>`, без контакти на подателите |
| `PATCH /moderation-cases/{id}` | `assigneeId, priority, status` → `ModerationCaseDetail`. Разрешен преход `Open → UnderReview`. При приключен сигнал детайлът е само за четене |
| `POST /moderation-cases/{id}/decisions` | `decision, reason` и при действие върху обекта `targetExpectedVersion` → `ModerationCaseDetail` |
| `GET /catalog/{kind}` | `q, status` и при категории `parentId` → `Page<CatalogSummary>` |
| `POST /catalog/{kind}` | Полетата на съответния вид → `201 CatalogDetail` |
| `GET /catalog/{kind}/{id}` | `CatalogDetail` |
| `PATCH /catalog/{kind}/{id}` | Редакция на полетата за вида → `CatalogDetail` |
| `POST /catalog/{kind}/{id}/transitions` | `action, reason` → `CatalogDetail`. Допустимите преходи са по вид |
| `POST /catalog/{kind}/{id}/merges` | `targetId, targetExpectedVersion, reason` → `202`. Поддържа `topics` и `categories`. Каноничният запис се фиксира веднага, а препратките се обновяват фоново |
| `GET /media-assets` | `q, status, type, rightsStatus` → `Page<MediaAssetSummary>` |
| `GET /media-assets/{id}` | `MediaAssetDetail` с права, произход, използване и статус на обработката |
| `PATCH /media-assets/{id}` | `creditLine, rights, accessibilityText` → `MediaAssetDetail`. Промяната на правата преоценява публичния достъп |
| `GET /media-assets/{id}/preview` | Защитен HTTPS преглед на производно копие с текуща проверка на правата на оператора |
| `POST /media-assets/{id}/access-restrictions` | `action = Restrict / LiftRestriction`, `reason` → `MediaAssetDetail`. Публичният достъп остава обусловен от правата и статуса на файла |

`kind` е затворен списък: `topics`, `categories`, `entities`, `places`, `sources`, `archive-institutions`. ASP.NET Core валидира вида и приема само DTO за него. Качването на медия ползва общия поток за качване и проверка на файлове. Оригиналът се чете през защитен HTTPS поток с отделна проверка при реализация на админ преглед на оригинали.

## Хранилища, задачи и одит

| Метод и маршрут | Политика | Вход и резултат |
| --- | --- | --- |
| `GET /storage-locations` | Storage.Manage | `status = Draft / ActiveForNewWrites / ReadOnly / Archived` → `Page<StorageLocationSummary>` |
| `GET /storage-connection-profiles` | Storage.Manage | `Page<StorageConnectionProfileSummary>` с одобрени за средата профили |
| `POST /storage-locations` | Storage.Manage | `label, profileId` → `201 StorageLocationDetail` в `Draft` |
| `GET /storage-locations/{id}` | Storage.Manage | `StorageLocationDetail` с настройки и версия |
| `GET /storage-locations/{id}/health` | Storage.Manage | `StorageHealth` с резултат от последната проверка, използван обем, квота когато е налична и последно резервно копие |
| `PATCH /storage-locations/{id}` | Storage.Manage | `label` и при `Draft` `profileId` → `StorageLocationDetail` |
| `POST /storage-locations/{id}/connection-checks` | Storage.Manage | `expectedVersion` → `202`. Проверява одобрения профил и нужните права за четене и запис |
| `POST /storage-locations/{id}/transitions` | Storage.Manage | `action = ActivateForNewWrites / ArchiveDraft` и причина. Активирането изисква и `expectedRoutingVersion` → `StorageLocationDetail` |
| `GET /storage-locations/{id}/asset-issues` | Storage.Manage | `kind = Missing / FailedUpload / IntegrityMismatch` → `Page<StorageAssetIssue>` |
| `GET /jobs` | Operations.Manage | `type, status, fromUtc, toUtc` → `Page<AdminJobSummary>` |
| `GET /jobs/{id}` | Operations.Manage | `AdminJobDetail` със статус, опити и безопасен код за грешка |
| `POST /jobs/{id}/retries` | Operations.Manage | `expectedVersion` и причина → `202` само за допустима задача със статус `Failed` |
| `GET /backups` | Operations.Manage | `scope, status, fromUtc, toUtc` → `Page<BackupRun>` |
| `GET /audit-events` | Audit.Read | `actorId, action, targetType, targetId, outcome, fromUtc, toUtc` → `Page<AuditEventSummary>` |
| `GET /audit-events/{id}` | Audit.Read | `AuditEventDetail` със защитени подробности и корелация |

## Реклама и настройки

| Метод и маршрут | Политика | Вход и резултат |
| --- | --- | --- |
| `GET /advertisers` | Advertising.Manage | `q, status` → `Page<AdvertiserSummary>` |
| `POST /advertisers` | Advertising.Manage | `name, contact` → `201 AdvertiserDetail` |
| `GET /advertisers/{id}` | Advertising.Manage | `AdvertiserDetail` |
| `PATCH /advertisers/{id}` | Advertising.Manage | `name, contact, status` → `AdvertiserDetail` |
| `GET /ad-campaigns` | Advertising.Manage | `status, advertiserId, placement` → `Page<AdCampaignSummary>` |
| `POST /ad-campaigns` | Advertising.Manage | `advertiserId, placement, startsAtUtc, endsAtUtc` → `201 AdCampaignDetail` |
| `GET /ad-campaigns/{id}` | Advertising.Manage | `AdCampaignDetail` с работен банер и текущ статус |
| `PATCH /ad-campaigns/{id}` | Advertising.Manage | `placement, topicId?, episodeMaterialId?, startsAtUtc, endsAtUtc, agreedAmount?, currency?, creative?` → `AdCampaignDetail` |
| `POST /ad-campaigns/{id}/transitions` | Advertising.Manage | `action = SubmitForReview / Approve / Stop` → `AdCampaignDetail` |
| `GET /ad-campaigns/{id}/metrics` | Advertising.Manage | `fromUtc, toUtc, placement` → `Page<AdDailyMetric>`. Интервал до 366 дни |
| `GET /site-settings` | SiteSettings.Manage | `SiteSettings` с ETag |
| `PUT /site-settings` | SiteSettings.Manage | `SiteSettingsInput` с `If-Match` → `SiteSettings` |

## Примери

### Временен бан

```http
POST /api/admin/v1/users/019a6e9c-181d-73c8-93d8-bbe6e398034e/sanctions
Content-Type: application/json
Idempotency-Key: 10aad14c-b535-4a25-b1cf-19dd4da56703

{
  "expectedVersion": 7,
  "expiresAtUtc": "2026-11-17T10:00:00Z",
  "reason": "Повторно публикуване на спам след предупреждение."
}
```

### Конфликт при публикуване

```json
{
  "type": "about:blank",
  "title": "Материалът е променен",
  "status": 409,
  "code": "version_conflict",
  "detail": "Заредете последната версия и прегледайте промените.",
  "traceId": "01JCB70H1XMXBRT9M70CVGTSXF"
}
```
