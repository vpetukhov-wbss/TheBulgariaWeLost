# API contracts

[`openapi/v1.yaml`](openapi/v1.yaml) is the versioned source of truth for the public Angular API, the administrative API, the private NestJS/.NET control plane and the .NET byte-transfer routes.

The four stable route roots are:

- `/api/v1` — public and authenticated NestJS operations;
- `/api/admin/v1` — editor and administrator operations;
- `/internal/media/v1` — private service-to-service operations;
- `/media/v1` — upload and authorized media delivery.

Every operation accepts `X-Correlation-ID`, returns it in the response, and uses `application/problem+json` with stable `code` and `traceId` fields for errors. Internal operations are tagged `Internal media`; the Angular generator excludes that tag so service credentials and private operations cannot leak into browser code.

From `apps/web` run:

```sh
npm run contract:validate
npm run api:generate
npm run api:check
```

`api:generate` writes the typed Angular client to `apps/web/src/app/api/generated`. CI regenerates it, checks that it is committed, rejects removed routes/responses/schemas and runs example requests against the NestJS and .NET test hosts.
