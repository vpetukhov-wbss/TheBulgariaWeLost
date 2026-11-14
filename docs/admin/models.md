# Модели и правила за админ панела

Свързани документи: [API договор](api.md) · [Angular екрани](screens.md) · [архитектура](../../README.md#архитектура)

Модулният NestJS backend управлява бизнес данните в MongoDB чрез Mongoose. Файловата услуга в .NET получава задания и връща резултати през вътрешния API. Панелът получава DTO за конкретния екран. OpenSearch е възстановима проекция. SFTP пази оригиналите, а MongoDB пази местоположението, правата и техническите метаданни. [Архитектура](../architecture.md)

## Акаунти и сесии

| Модел | Полета и правила |
| --- | --- |
| `User` → `users` | `id, identitySubject, displayName, bio, role, accountStatus, trustLevel, activeSanctionId?, authVersion, version, updatedAtUtc`. `role` е една от `User`, `Editor` или `Administrator`. `accountStatus` е `Active` или `Disabled`. Ефективният статус `Banned` се изчислява от активна, неизтекла санкция |
| `AccountSanction` → `account_sanctions` | `id, userId, issuedByUserId, reason, startsAtUtc, expiresAtUtc?, revokedAtUtc?, revokedByUserId?, revokeReason?`. Потребителят има най-много една действаща санкция. Изтичането се оценява спрямо часовника при всяка проверка на достъпа |
| `BackOfficePrincipal` | `id, displayName, role, permissions[], mfaVerifiedAtUtc?`. Angular използва `permissions` за менюто и бутоните |
| `AdminUserSummary / AdminUserDetail` | Редът показва `id, displayName, role, status, createdAtUtc`. Детайлът добавя `bio, verifiedContactMasked?, activeSanction?, version`. Поддържа се търсене по точен нормализиран имейл за админи с ограничение на заявките |

При бан, смяна на роля или принудително прекратяване на сесии транзакцията сменя `authVersion` и записва одит. Всяка защитена заявка, включително подновяване на сесия, сверява сесийната версия и актуалния статус с авторитетния запис. За административните команди проверката на оператора и промяната се ограждат от същата транзакция. Паралелна отмяна на правата на оператора предизвиква конфликт чрез обща версия на записа за достъп, която и двата потока проверяват и променят. Тази версия е отделна от `authVersion`, за да пази сесиите валидни при обичайна работа. Изтичането на бан позволява нов вход. Старите сесии остават невалидни. Банът и видимостта на публикуваните материали са отделни решения.

При промени, които могат да намалят броя на достъпните админи, транзакцията обновява общ защитен запис за тези промени. След придобиването му проверява броя на активните администратори в същата транзакция и пази поне един. Това покрива две конкурентни заявки към различни админ профили. Операторът може да сменя роля или да санкционира друг профил. Първият админ се създава чрез контролиран начален процес.

Заявките за ресет имат лимит по оператор и профил. Ресетът се обработва от доставчика на идентичност или от модула за идентичност чрез установения канал за възстановяване. Линкът е с еднократна употреба и изтича. След успешно задаване на новата парола се прекратяват старите сесии. Одитът записва инициирането, техническия резултат и идентификатор на операцията. Тайната и адресът на линка остават в потока за възстановяване. [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)

За seed данни от стария проект на схемата `Reader`, `Contributor` и `TrustedContributor` се преобразуват в `User` със запазен `trustLevel`. `Editor` и `Administrator` запазват ролята си. Профилите с `Moderator` или с противоречиви роли се преглеждат изрично преди предоставяне на редакторски права.

## Публикуване и модериране

| Модел | Полета и правила |
| --- | --- |
| `MaterialSummary` | `id, slug, type, language, title, author, status, workingStatus?, rightsStatus, updatedAtUtc, version` |
| `MaterialDetail` | Редът плюс `draft, workingRevisionNumber?, publishedRevisionNumber?, publicVisibility, allowedActions[], publicationBlockers[]`. `status` е `Unpublished, Published, Withdrawn` или `Archived`. `workingStatus` е `Draft, Submitted, InReview, ChangesRequested` или `null`. `draft` е `MaterialDraftInput` на текущата работна ревизия или `null` |
| `MaterialDraftInput` | `title, subtitle?, summary?, body, chronology, categoryIds[], topicIds[], entityIds[], placeIds[], mediaRefs[], sourceIds[], provenance, rights, seo?, episode?`. `mediaRefs` съдържа ID, роля, ред и кредит. `episode` съдържа номер на епизод, транскрипция и проверени адреси към YouTube, Facebook, Instagram и TikTok |
| `MaterialRevisionSummary / MaterialRevisionDetail` | `materialId, revisionNumber, createdAtUtc, createdByUserId, changeSummary?, restoredFromRevisionNumber?`. Детайлът съдържа реконструирано съдържание и метаданни за сравнение |
| `ModerationCaseSummary / ModerationCaseDetail` | `id, target, caseType, priority, status, assigneeId?, reportCount, updatedAtUtc, version`. Детайлът добавя `resolution?, allowedDecisions[]` и кратка справка за обекта |
| `ModerationReport` | `id, caseId, reasonCode, reason, sourceRefs[], createdAtUtc`. Показва сведенията по сигнала. Личните контакти са извън DTO |
| `MediaAssetSummary / MediaAssetDetail` | Редът показва `id, originalFileName, type, status, rightsStatus, updatedAtUtc`. Детайлът добавя `creditLine, rights, accessibilityText, provenance, publicAccess, usageCount, linkedMaterialIds, integrityStatus, processingStatus, version`. Връзките в детайла са ограничена справка |

| Действие | Правило |
| --- | --- |
| Първа публикация | `Draft → Submitted → InReview → Published`. Авторът подава `Draft` през потребителския поток. В панела авторът може да подаде собствената чернова чрез `SubmitForReview`, а админ може да изпрати и чужда чернова с причина. `StartReview` премества `Submitted` в `InReview`. `Publish` от `InReview` изисква категория, тема, посочен източник и разрешение за публично показване на всяка включена медия |
| Корекция | `RequestChanges` от `InReview` връща работата в `ChangesRequested` с бележка. След поправка авторът може да я подаде отново. Редакция на вече публикуван материал създава отделна работна ревизия в `InReview`. Публичната версия сочи към последната одобрена ревизия |
| Сваляне и кошче | `Withdraw` скрива публикуван материал и го премества в `Withdrawn`. `Archive` прибира материал в кошчето и сваля публичния достъп. `RestoreFromArchive` възстановява работна чернова в `InReview` за повторна проверка. Публичният статус е `Withdrawn` при налична предишна публикация и `Unpublished` при първа публикация. `revision-restorations` създава нова работна ревизия от стара версия. Възстановяването на ревизия е достъпно след изваждане на материала от кошчето. За непубликуван или свален материал командата поставя ревизията в `InReview`, а за публикуван материал запазва отделната публична ревизия |
| Решение по сигнал | `Open → UnderReview → Resolved`. Решения `Dismiss`, `RequestCorrection`, `WithdrawMaterial`, `RestrictMedia` и `HideComment`. Допустимите решения зависят от вида на обекта и неговото състояние. `RequestCorrection` изисква корекция и уведомява автора. Сваляне на материал, ограничаване на файл и скриване на коментар проверяват и версията на засегнатия обект |
| Възстановяване на медия | `LiftRestriction` премахва редакторското ограничение. Публично показване изисква текущо разрешение, `Ready` файл и публикуван материал. Права за изтегляне на оригинал се проверяват отделно |

Материалът пази указатели към работната и публикуваната ревизия. Изходните документи, статусът на преглед, ревизията, одитът и необходимите outbox събития се записват атомарно в рамките на конкретната команда. При решение по сигнал с незабавно действие MongoDB транзакцията включва сигнала и засегнатия агрегат.

Публичните детайли, резултатите от търсене и достъпът до медия проверяват актуалната видимост. Докато OpenSearch и кешовете се обновят, публичният API филтрира вече спрени резултати, а публичният HTTPS маршрут за медия прилага текущия достъп. Медии, които подлежат на отнемане на разрешение, използват контролирано кеширане. Outbox обновява индекса и кешовете с идемпотентни задачи, обвързани с версията.

## Каталог и архивни институции

`CatalogSummary` съдържа `id, kind, name, slug?, status, updatedAtUtc, version`. `CatalogDetail` добавя `allowedActions[]` и полетата на конкретния вид. Всеки вид използва своя съществуваща колекция. Институциите имат отделна колекция `archive_institutions`.

| Вид | Основни редактируеми полета | Статуси и действия |
| --- | --- | --- |
| `topics` | `name, slug, aliases, summary, categoryIds[], coverAssetId?` | `Draft, Proposed, Published, Restricted, Rejected, Merged`. `Publish, Restrict, Reject` и merge |
| `categories` | `name, slug, description, parentId?, sortOrder, icon?, isVisible` | `Proposed, Approved, Hidden, Rejected, Merged`. `Approve, Hide, Reject` и merge. Само одобрена категория може да влезе в навигацията |
| `entities` | `name, slug, entityType, aliases, summary, lifeSpan, placeIds[]` | `Draft, Published, Hidden`. `Publish, Hide` |
| `places` | `name, slug, placeType, parentId?, location?, historicalNames[]` | `Draft, Published, Hidden`. `Publish, Hide` |
| `sources` | `title, sourceType, url?, rights, verification, archiveInstitutionId?, archiveReference?` | `Active, Archived`. `Archive, Restore` |
| `archive-institutions` | `name, aliases, location?, website?` | `Active, Archived`. `Archive, Restore` |

Архивната сигнатура остава на източника като `fund, inventory, archiveUnit, pageOrFrame`. За стар източник се запазва оригиналното текстово име на институцията, докато редактор свърже устойчив идентификатор. Когато тема или категория се обединява, транзакцията проверява версиите и на двата записа, поставя каноничен ID и пази стария slug. При категории се проверяват цикли, наследници и максималната дълбочина. Старите адреси продължават да водят към каноничния запис, докато фоновата задача обнови препратките.

## SFTP, операции и бекъп

| Модел | Полета и правила |
| --- | --- |
| `StorageConnectionProfileSummary` | `id, label`. Идентификатор към одобрен за средата профил. Сървърната конфигурация пази host, root, SSH host key и референция към секрет |
| `StorageLocationSummary / StorageLocationDetail` → `storage_locations` | `id, label, provider = Sftp, profileId, status, version, updatedAtUtc`. Детайлът добавя `routingVersion` и допустими действия. Статуси `Draft, ActiveForNewWrites, ReadOnly, Archived` |
| `StorageHealth` | `locationId, status, checkedAtUtc, usedBytes?, capacityBytes?, lastSuccessfulBackupAtUtc?, lastVerifiedRestoreAtUtc?, errorCode?`. Липсваща метрика се представя като `null` |
| `MediaAsset.storage` | `storageLocationId, objectKey`. Ключът се генерира от системата. Всеки оригинал се чете от записаното към него хранилище |
| `StorageAssetIssue` | `assetId?, uploadId?, kind, detectedAtUtc, status`. Справката се захранва от грешки при качване и ограничени проверки за цялост |
| `AdminOperation` → `admin_operations` | `id, kind, requestedByUserId, requiredPolicy, target, status, requestedAtUtc, finishedAtUtc?, resultCode?, traceId`. Статуси `Queued, Running, Succeeded, Failed` |
| `AdminJobSummary / AdminJobDetail` | Четящ модел върху наличните outbox и worker записи. `id, type, target, status, attemptCount, updatedAtUtc, version`. Детайлът добавя `lastErrorCode?, canRetry, traceId` |
| `BackupRun` | `id, scope, storageLocationId?, status, startedAtUtc, finishedAtUtc?, verifiedAtUtc?, restoreTestedAtUtc?`. `scope` различава `MongoDb` и `SftpOriginals` |

Тестът на връзката използва одобрения профил и потвърден SSH host key. Пробният запис е в отделна служебна директория. Активиране изисква успешна скорошна проверка на същия профил и същата версия. Атомарен запис `StorageRouting` с `activeLocationId` и `version` гарантира една активна цел за нови качвания. При превключване предишната става `ReadOnly`. `ArchiveDraft` е допустима само за чернова без обвързани файлове или качвания. При първоначална настройка качванията стават достъпни след активиране на първата цел. Вече започнати качвания използват записаната цел до приключване или изтичане на сесията. Панелът показва последните бекъпи и тестове за възстановяване. Преместване на оригинали и възстановяване на цяла среда са отделен оперативен етап.

Ръчният retry проверява терминален статус и версия. Работниците придобиват атомарен lease, а обработката дедупликира ефекта по логическия идентификатор на задачата и версията на агрегата. Външни ефекти като имейл и SFTP проверка стартират от записана операция. Повторен имейл се ограничава чрез дедупликация по операция и доставчик, когато последният я поддържа.

## Одит и повторени заявки

`AuditEvent` пази `id, occurredAtUtc, actorId, actorRole, action, targetType, targetId, outcome, reason?, changeSummary?, traceId, operationId?`. `changeSummary` съдържа подбран списък от променени полета, безопасни стойности и идентификатори на ревизии. `AuditEventSummary` показва основните полета, а `AuditEventDetail` добавя причината, промените и корелацията. Журналът допуска само добавяне на събития и админски прочит. Прегледът на журнал се отчита като събитие за сигурност. Тайните, токените и суровите заявки се изключват от одита. Защитените логове регистрират отказани и неуспешни действия. [OWASP Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)

`CommandReceipt` пази `actorId, route, key, requestHash, status, responseStatus?, responseSnapshotOrImmutableRef?, operationId?, expiresAtUtc?`. Ключът е уникален по оператор и маршрут с конкретните идентификатори. Същата MongoDB транзакция записва ефекта и резултата или създава фоновата операция. Завършените записи се пазят поне 24 часа. Запис за изпълняваща се команда не изтича. Полетата за възстановяване и секретите са извън резултата за повторение.

## Реклама, настройки и табло

- `AdvertiserSummary / AdvertiserDetail` включва `id, name, status, version` и в детайла `contact`. Рекламодател може да бъде деактивиран, което спира показването на кампаниите му.
- `AdCampaignSummary / AdCampaignDetail` включва `id, advertiserId, placement, topicId?, episodeMaterialId?, startsAtUtc, endsAtUtc, reviewStatus, deliveryStatus, version`. Детайлът добавя `creative`, `approvedCreativeVersion?` и договорени сума и валута. `creative` съдържа `mediaAssetId, text, destinationUrl`. `reviewStatus` е `Draft, InReview, Approved, Stopped`. `deliveryStatus` се изчислява спрямо времето, одобрения банер и рекламодателя. Промяна на снимка или целеви адрес връща кампанията в `InReview` и преустановява показването до одобрение. Подаденият банер и датите са задължителни за одобрение. Кампанията се показва само в активния интервал и в одобрената позиция. [Модел за приходи](../monetization.md)
- `AdDailyMetric` използва `dateUtc, campaignId, placement, impressions, clicks`. Един запис за ден, кампания и позиция.
- `SiteSettings / SiteSettingsInput` включва `siteName, footerLinks[], socialLinks[], featuredMaterialIds[], supportContact`. Версията се връща в `SiteSettings`. Настройките се валидират по предназначение на връзката, а акцентите сочат към публикувани материали. Данните за вход и тайните се управляват през инфраструктурната конфигурация.
- `DashboardSummary` включва редакторски броячи `pendingMaterials, openCases, restrictedMedia`. За админ добавя `failedJobs, storageHealth, backupFreshness, activeCampaigns`. Картите връщат `measuredAtUtc` и дълбока връзка към филтриран списък.

## Индекси и проверки преди пускане

| Данни | Индекси или ограничения |
| --- | --- |
| `users` | Уникален `identitySubject`. Индекси за `role, accountStatus, id` и нормализиран контакт, когато се пази локално |
| `account_sanctions` и `material_revisions` | `userId, startsAtUtc DESC, id DESC`. Уникален `materialId, revisionNumber` |
| `audit_events` | `occurredAtUtc DESC, id DESC` и вторични индекси по `actorId` и `targetType, targetId` със същата подредба |
| `storage_locations` и `command_receipts` | Уникални `profileId` и `actorId, route, key`. TTL за приключени заявки през `expiresAtUtc` |
| `moderation_cases` и задачи | Индекси по `status, priority, updatedAtUtc, id` и `status, updatedAtUtc, id` според справката. Репорти по `caseId, createdAtUtc, id` |

Критичните сценарии за приемане включват пряк достъп на редактор до админ endpoint, два едновременни опита за блокиране на последните админи, незабавна отмяна на стара сесия, повторен бан или ресет със същия ключ, конфликт между две редакции (`412` или `409 version_conflict` според операцията), спиране на медия по сигнал, конкурентно превключване на SFTP и повторен retry. Проверява се отделно, че старата SFTP цел обслужва записаните към нея оригинали, а новите качвания отиват в активната цел.
