# .NET Media API

Едно ASP.NET Core приложение на .NET 10 LTS и C# 14. Модулите са отделни проекти в една solution и се пускат в един процес.

| Модул                | Отговорност                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `Media.Api`          | Composition root, liveness и защитена диагностика на хранилищата                                  |
| `Media.Transfers`    | Vertical slices `Upload` и `Read`. HTTPS, лимити, карантина, checksum и HTTP Range                |
| `Media.Storage`      | SSH.NET, одобрени SFTP профили, проверка на SSH host key и операции с файлови обекти              |
| `Media.Processing`   | Vertical slice `Inspection`. BackgroundService обработва един lease наведнъж и докладва резултата |
| `Media.ControlPlane` | Типизиран HTTP клиент към NestJS и DTO на вътрешния договор                                       |

NestJS пази ролите, сесиите, решенията за достъп, маршрутите към хранилищата и състоянието на заданията. Media API чете и записва байтовете в указаното хранилище. Модулите използват явни зависимости чрез project references. [Архитектура на архива](../../docs/architecture.md#файлов-поток)

## Стартиране

Изпълни от `apps/media` с .NET SDK 10.0.404 или по-нов patch в същия feature band.

```sh
dotnet restore --locked-mode
cp appsettings.Development.example.json src/Media.Api/appsettings.Development.json
```

Настрой одобрения SFTP профил в локалния файл. `Root` е съществуваща частна директория. `HostKeySha256` е OpenSSH fingerprint във формат `SHA256:…`, получен по доверен канал. Инсталирай клиентския ключ със съответните права върху файла. Допустим е ключ с парола през `MediaStorage__Profiles__archive__PrivateKeyPassphrase`.

```sh
dotnet user-secrets --project src/Media.Api set MediaControl:ServiceToken '<token за .NET → NestJS>'
dotnet user-secrets --project src/Media.Api set MediaControl:ProbeToken '<друг token за NestJS → .NET>'
ASPNETCORE_ENVIRONMENT=Development dotnet run --project src/Media.Api --urls http://127.0.0.1:5088
```

`GET /media/health/live` проверява процеса. В Development OpenAPI е на `/media/openapi/v1.json`. В production използвай HTTPS към NestJS, подай ключовете чрез конфигурацията на средата и маршрутизирай `/media/` през HTTPS входа. `/internal/media/v1/` е достъпен по частния маршрут между услугите. Прокси и приложни логове трябва да изключват `Authorization` и query параметъра `grant` от записите. Проверки на SFTP се правят по конфигурирани профили чрез вътрешния endpoint.

Всеки отговор връща `X-Correlation-ID`. Грешките използват `application/problem+json` със стабилен `code` и същия идентификатор в `traceId`. Общият договор за NestJS, Angular и Media API е [`contracts/openapi/v1.yaml`](../../contracts/openapi/v1.yaml).

## HTTP договор

| .NET маршрут                                         | Действие                                                                                                                                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUT /media/v1/uploads/{uploadId}`                   | Bearer разрешение за качване и сурово тяло със съдържанието. Връща `204` след траен запис и потвърждение от NestJS                                                                           |
| `GET` / `HEAD /media/v1/assets/{assetId}/{variant}`  | `original` или `preview`. Bearer разрешение или единичен `?grant=…` при пренасочване от NestJS. Проверява разрешението за всяка заявка, включително Range, и връща `Cache-Control: no-store` |
| `POST /internal/media/v1/storage/{locationId}/probe` | Отделен служебен Bearer. Прави пробен запис, преименуване, четене и изтриване. Връща `204` при успех                                                                                         |

### Договор с NestJS

Следните NestJS endpoints са интеграционният договор на .NET клиента. Всички получават служебния `MediaControl:ServiceToken` като Bearer. Клиентът изпраща потребителското разрешение като `grant` в JSON само при claim и проверка за четене. Отговорите използват camelCase.

| NestJS маршрут                                            | Вход                                                              | Успешен резултат                                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `POST /internal/media/v1/uploads/{uploadId}/claim`        | `grant`                                                           | `200` с `attemptId, attemptVersion, object, length, sha256`                            |
| `POST /internal/media/v1/uploads/{uploadId}/complete`     | `attemptId, length, sha256, contentType`                          | `204`                                                                                  |
| `POST /internal/media/v1/assets/{assetId}/authorize-read` | `variant, grant`                                                  | `200` с `object, length, contentType`                                                  |
| `POST /internal/media/v1/inspections/lease`               | `{}`                                                              | `200` с `jobId, attemptId, object, previewObject, length, sha256` или `204` без задача |
| `POST /internal/media/v1/inspections/{jobId}/complete`    | `attemptId, outcome` и при успех оригиналните и preview метаданни | `204`                                                                                  |

`object` е `{ storageLocationId, fileKey }`. NestJS определя точната дължина и SHA-256 при създаването на качването. Ключът е 64-символен lowercase hex, генериран от сървъра, и остава фиксиран заедно с хранилището, дължината и checksum през всички опити. NestJS проверява текущата сесия, права, срока и предназначението на разрешението при всеки claim или read. Активният upload опит е атомарен lease. `409` означава активен или остарял опит. След запис и изгубено потвърждение следващият разрешен опит проверява вече записания обект и може да изпрати completion без повторно записване. NestJS приема повторно completion за същия резултат идемпотентно.

Worker-ът се включва чрез `MediaProcessing__Enabled=true`. Inspection lease трябва да е по-дълъг от 60-секундния срок на обработка. Резултатите са `inspected`, `missing`, `integrity_mismatch` и `unsupported_format`. При временна грешка NestJS връща незавършена задача в опашката след изтичане на lease. Стар опит може да остави неприет производен обект, но никога не може да смени записания активен preview; lifecycle cleanup ще премахва такива обекти. Логиката за lease и правата остава в NestJS.

### Граници на първия срез

- Поддържа JPEG, PNG и PDF с проверка по съдържание, точна дължина и SHA-256. PNG/JPEG структурата и размерите се проверяват с лимит от 50 000 пиксела по ос и 100 мегапиксела общо; PDF изисква валидна версия и краен marker. Това е техническа проверка за цялост. Разрешението за публичен преглед трябва да сочи към вече одобрен производен файл. Оригиналите и PDF отговорите се предлагат за изтегляне.
- Качването буферира на частен диск с ограничение на размер и брой едновременни трансфери. Прекъснатите, повредените и неподдържаните файлове остават с права `0600` в карантината до `QuarantineRetentionMinutes`; успешният запис ги премахва. Собствен worker чисти само разпознатите изтекли quarantine имена. В Compose карантината е отделен persistent volume.
- SFTP временните файлове имат строго име `<fileKey>.<attempt>.part`, а оригиналът се публикува с rename без презапис. След прекъсване worker изтрива само разпознати `.part`, по-стари от `MediaStorage:PartialRetentionMinutes`; други файлове не се засягат. Интервалите са `MediaTransfers:QuarantineCleanupIntervalSeconds` и `MediaStorage:CleanupIntervalSeconds`.
- Хранилището трябва да осигурява стандартно SFTP преименуване без презапис и трайност според своята конфигурация. Прочитането след запис проверява видимост и цялост на обекта. Файлът се проверява повторно от SFTP след записа. Transport и worker могат да ползват различни SFTP профили за различни обекти.
- Производен преглед никога не се публикува директно от непроверения вход. В този първи срез worker-ът проверява оригинала, публикува byte-for-byte preview под отделен ключ за конкретния опит и проверява повторно записания preview. Преоразмеряване, OCR и видео производни се добавят в следващи срезове, без промяна на lease договора.

## Проверки

```sh
dotnet restore --locked-mode
dotnet build --no-restore
dotnet test --no-build
dotnet format --no-restore --verify-no-changes
```

HTTP интеграционните тестове използват ограничени in-memory реализации. CI стартира и отделно частно SFTP с генерирани ключове, за да докаже pinned host key, отказ при недостъпна услуга, атомарно повторение и почистване на изтекли `.part`. [Приемателният протокол](../../docs/acceptance/media-vertical-slice.md) изпълнява PNG и PDF през целия NestJS → .NET → SFTP поток и проверява права, прекъсване, възстановяване, inspection, preview, Range read и correlation ID. Примерна отделна конфигурация за ръчно стартиране в `Testing` е в [`appsettings.Testing.example.json`](appsettings.Testing.example.json); в нея няма production достъпи и processing worker-ът е изключен.
