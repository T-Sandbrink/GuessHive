import type { INestApplication } from '@nestjs/common';
import {
  type ApiResponseSchemaHost,
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { apiErrorBodySchema } from '@guesshive/shared';
import { z } from 'zod';

/** Swagger UI path; the JSON document is served at `${OPENAPI_PATH}-json`. */
export const OPENAPI_PATH = 'docs';

/**
 * The OpenAPI document of the api. Request schemas come straight from the zod schemas in
 * `@Body({ schema })`, `@Query({ schema })` and `@Param(…, { schema })` (Standard Schema,
 * ADR 0003); no DTO classes. Every route may answer with the shared error body.
 */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  // Global responses are cloned by @nestjs/swagger 12.1, which breaks its Standard Schema
  // conversion there, so the error body goes in as plain JSON Schema (same target Nest uses).
  const errorBody = z.toJSONSchema(apiErrorBodySchema, {
    target: 'openapi-3.0',
    io: 'output',
  }) as ApiResponseSchemaHost['schema'];
  const config = new DocumentBuilder()
    .setTitle('GuessHive API')
    .setVersion('0.1')
    .addGlobalResponse(
      {
        status: 400,
        description: 'Invalid input (code VALIDATION_FAILED with issues, or BAD_REQUEST)',
        schema: errorBody,
      },
      {
        status: 500,
        description: 'Unexpected error (code INTERNAL_ERROR)',
        schema: errorBody,
      },
    )
    .build();
  return SwaggerModule.createDocument(app, config);
}

/**
 * Serves Swagger UI on `/docs` in development only (task 1.6). Takes the raw NODE_ENV, so only an
 * explicit `development` mounts the docs (an unset value parses as production anyway). These routes bypass Nest
 * guards, so this check is their only protection. Returns whether the docs were mounted.
 */
export function setupOpenApi(app: INestApplication, rawNodeEnv: string | undefined): boolean {
  if (rawNodeEnv?.trim() !== 'development') {
    return false;
  }
  SwaggerModule.setup(OPENAPI_PATH, app, () => createOpenApiDocument(app));
  return true;
}
