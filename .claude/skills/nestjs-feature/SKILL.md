---
name: nestjs-feature
description: Implement or review a NestJS feature in apps/api, including controllers, DTOs, Mongoose persistence, authorization, and API tests.
---

1. Read `apps/api/README.md` and the relevant endpoint, policy, and data model in `docs/admin/`. Check the current implementation and its clients before changing a contract.
2. Work in the owning feature module. Keep controllers focused on transport. Validate DTOs before persistence and map explicit response fields. Extend existing modules where the ownership already fits.
3. Reuse the authenticated principal from Passport. Check the current account, session, permission and resource in NestJS. Apply the MFA requirement to every affected administrator endpoint.
4. Use a conditional MongoDB write for a single-document invariant. Use one transaction for a multi-document business write with its audit and outbox when the contract requires it. Define the result of duplicate, stale, and unauthorized requests before adding a command.
5. Update Swagger and the consumer contract with the endpoint. Test the route against an isolated MongoDB database. Cover success, invalid data and rejected access. Include concurrent requests when checking a single-use token, idempotent command, or version precondition.
6. Run the package checks in `apps/api`. Report the exact commands, which HTTP flows ran, and the infrastructure they used.
