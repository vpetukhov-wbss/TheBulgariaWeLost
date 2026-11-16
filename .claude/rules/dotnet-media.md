---
paths:
  - "apps/media/**/*.cs"
  - "apps/media/**/*.csproj"
  - "apps/media/**/*.json"
---
# .NET Media API

- Keep one deployable ASP.NET Core application. Use the existing module and place the endpoint, DTO and workflow in its owning vertical slice. Move shared file I/O to Storage and wire dependencies in Api.
- Authorize every transfer and each Range request through the NestJS client. Keep resource rights, job leases and state transitions in NestJS. File keys are server-generated, and profiles come from trusted configuration.
- Stream request and response bodies with cancellation. Preserve limits on bytes, disk use and concurrent transfers. Keep temporary files private and verify the published object before completion.
- Pin SSH host keys. Keep keys, connection strings, service credentials and transfer grants out of source and logs. Log safe outcomes and identifiers only.
- Exercise the file invariants at the HTTP boundary. Cover authorization failure, cancellation, wrong digest, duplicate completion and timeout when changing the relevant slice.
