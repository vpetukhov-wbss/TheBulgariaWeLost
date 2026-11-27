import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { parse } from 'yaml';

const methods = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options'];
const [firstPath, secondPath] = process.argv.slice(2);

if (!firstPath) {
  throw new Error('Usage: node check-openapi-compatibility.mjs <current> or <base> <current>');
}

const load = async (path) => parse(await readFile(path, 'utf8'));
const current = await load(secondPath ?? firstPath);
const errors = validate(current);

if (secondPath) {
  const base = await load(firstPath);
  errors.push(...breakingChanges(base, current));
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    secondPath
      ? 'OpenAPI contract is valid and backward compatible.'
      : 'OpenAPI contract is valid.',
  );
}

function validate(document) {
  const failures = [];
  const operationIds = new Set();
  const prefixes = [
    '/api/v1',
    '/api/admin/v1',
    '/internal/media/v1',
    '/internal/operations/v1',
    '/media/v1',
  ];

  for (const prefix of prefixes) {
    if (!Object.keys(document.paths ?? {}).some((path) => path.startsWith(prefix))) {
      failures.push(`Missing required route prefix ${prefix}.`);
    }
  }

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    if (!prefixes.some((prefix) => path.startsWith(prefix))) {
      failures.push(`Route ${path} is outside the versioned API prefixes.`);
    }
    for (const method of methods) {
      const operation = pathItem?.[method];
      if (!operation) continue;
      if (!operation.operationId)
        failures.push(`${method.toUpperCase()} ${path} has no operationId.`);
      else if (operationIds.has(operation.operationId))
        failures.push(`Duplicate operationId ${operation.operationId}.`);
      else operationIds.add(operation.operationId);

      const parameters = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])];
      const hasCorrelationId = parameters.some((parameter) => {
        const value = resolve(document, parameter);
        return value?.in === 'header' && value?.name?.toLowerCase() === 'x-correlation-id';
      });
      if (!hasCorrelationId)
        failures.push(`${method.toUpperCase()} ${path} has no X-Correlation-ID parameter.`);

      const problem = resolve(document, operation.responses?.default);
      if (!problem?.content?.['application/problem+json'])
        failures.push(`${method.toUpperCase()} ${path} has no default Problem Details response.`);
    }
  }
  return failures;
}

function breakingChanges(base, currentDocument) {
  const failures = [];
  for (const [path, basePathItem] of Object.entries(base.paths ?? {})) {
    const currentPathItem = currentDocument.paths?.[path];
    if (!currentPathItem) {
      failures.push(`Removed path ${path}.`);
      continue;
    }
    for (const method of methods) {
      const baseOperation = basePathItem?.[method];
      if (!baseOperation) continue;
      const currentOperation = currentPathItem?.[method];
      if (!currentOperation) {
        failures.push(`Removed operation ${method.toUpperCase()} ${path}.`);
        continue;
      }
      if (baseOperation.operationId !== currentOperation.operationId) {
        failures.push(`Changed operationId for ${method.toUpperCase()} ${path}.`);
      }
      for (const status of Object.keys(baseOperation.responses ?? {})) {
        if (!(status in (currentOperation.responses ?? {})))
          failures.push(`Removed response ${status} from ${method.toUpperCase()} ${path}.`);
      }

      const baseParameters = operationParameters(base, basePathItem, baseOperation);
      const currentParameters = operationParameters(
        currentDocument,
        currentPathItem,
        currentOperation,
      );
      for (const parameter of baseParameters) {
        if (!currentParameters.some((candidate) => sameParameter(candidate, parameter))) {
          failures.push(
            `Removed parameter ${parameter.in}:${parameter.name} from ${method.toUpperCase()} ${path}.`,
          );
        }
      }
      for (const parameter of currentParameters.filter((value) => value.required)) {
        const previous = baseParameters.find((candidate) => sameParameter(candidate, parameter));
        if (!previous || !previous.required) {
          failures.push(
            `Added required parameter ${parameter.in}:${parameter.name} to ${method.toUpperCase()} ${path}.`,
          );
        }
      }
      const baseBody = resolve(base, baseOperation.requestBody);
      const currentBody = resolve(currentDocument, currentOperation.requestBody);
      if (!baseBody?.required && currentBody?.required) {
        failures.push(`Made the request body required for ${method.toUpperCase()} ${path}.`);
      }
    }
  }

  for (const [name, baseSchema] of Object.entries(base.components?.schemas ?? {})) {
    const currentSchema = currentDocument.components?.schemas?.[name];
    if (!currentSchema) {
      failures.push(`Removed schema ${name}.`);
      continue;
    }
    for (const property of Object.keys(baseSchema.properties ?? {})) {
      if (!(property in (currentSchema.properties ?? {})))
        failures.push(`Removed property ${name}.${property}.`);
      else if (
        schemaIdentity(baseSchema.properties[property]) !==
        schemaIdentity(currentSchema.properties[property])
      )
        failures.push(`Changed the type or format of ${name}.${property}.`);
    }
    const baseEnum = new Set(baseSchema.enum ?? []);
    for (const value of baseEnum) {
      if (!(currentSchema.enum ?? []).includes(value))
        failures.push(`Removed enum value ${JSON.stringify(value)} from ${name}.`);
    }
    const baseRequired = new Set(baseSchema.required ?? []);
    for (const property of currentSchema.required ?? []) {
      if (!baseRequired.has(property)) failures.push(`Made ${name}.${property} newly required.`);
    }
  }
  return failures;
}

function operationParameters(document, pathItem, operation) {
  return [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])].map((parameter) =>
    resolve(document, parameter),
  );
}

function sameParameter(first, second) {
  return first?.in === second?.in && first?.name === second?.name;
}

function schemaIdentity(schema) {
  return JSON.stringify({
    ref: schema?.$ref,
    type: schema?.type,
    format: schema?.format,
    items: schema?.items?.$ref ?? schema?.items?.type,
  });
}

function resolve(document, value) {
  if (!value?.$ref) return value;
  return value.$ref
    .replace(/^#\//, '')
    .split('/')
    .reduce((cursor, segment) => cursor?.[segment], document);
}
