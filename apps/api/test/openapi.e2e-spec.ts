import { Body, Controller, type INestApplication, Param, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { type App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';
import { createOpenApiDocument, OPENAPI_PATH, setupOpenApi } from '../src/openapi.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const createThingSchema = z.object({
  title: z.string().min(3).max(200),
  tags: z.array(z.string()),
});
// Stand-ins for the shared schemas (one zod version, so behaviour is identical). `limit` is the
// coerce + default shape every paginated list uses.
const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const thingSchema = z.object({ id: z.uuid(), title: z.string() });

@Controller('things')
class ThingsController {
  @Post(':id')
  @ApiCreatedResponse({ standardSchema: thingSchema })
  create(
    @Param('id', { schema: z.uuid() }) id: string,
    @Query({ schema: listQuerySchema }) _query: z.infer<typeof listQuerySchema>,
    @Body({ schema: createThingSchema }) body: z.infer<typeof createThingSchema>,
  ): { id: string; title: string } {
    return { id, title: body.title };
  }
}

async function createApp(
  setup?: (app: INestApplication<App>) => void,
): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [ThingsController],
  })
    .overrideProvider(PrismaService)
    .useValue({ onModuleInit: () => undefined, onApplicationShutdown: () => undefined })
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  // Like main.ts: docs are mounted before the app initialises.
  setup?.(app);
  await app.init();
  return app;
}

/** Follows a `$ref` into components, or returns the schema itself. */
function resolve(
  doc: Record<string, unknown>,
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const ref = schema['$ref'];
  if (typeof ref !== 'string') {
    return schema;
  }
  return ref
    .replace(/^#\//, '')
    .split('/')
    .reduce<Record<string, unknown>>((node, key) => node[key] as Record<string, unknown>, doc);
}

describe('OpenAPI (task 1.6)', () => {
  let app: INestApplication<App> | undefined;

  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5440/guesshive');
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    vi.unstubAllEnvs();
  });

  it('describes zod body, query and param schemas without DTO classes', async () => {
    app = await createApp();
    const doc = createOpenApiDocument(app) as unknown as Record<string, unknown>;
    const paths = doc['paths'] as Record<string, Record<string, Record<string, unknown>>>;
    const operation = paths['/things/{id}']?.['post'];
    expect(operation).toBeDefined();

    const parameters = operation?.['parameters'] as {
      name: string;
      in: string;
      required?: boolean;
      schema?: Record<string, unknown>;
    }[];
    const param = (name: string) => parameters.find((p) => p.name === name);
    expect(param('id')).toMatchObject({
      in: 'path',
      required: true,
      schema: { type: 'string', format: 'uuid' },
    });
    expect(param('cursor')).toMatchObject({ in: 'query', schema: { type: 'string' } });
    expect(param('cursor')?.required).not.toBe(true);
    expect(param('limit')).toMatchObject({
      in: 'query',
      schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
    });
    expect(param('limit')?.required).not.toBe(true);

    const created = (
      operation?.['responses'] as Record<
        string,
        Record<string, Record<string, Record<string, Record<string, unknown>>>>
      >
    )['201']?.['content']?.['application/json']?.['schema'];
    expect(resolve(doc, created ?? {})).toMatchObject({
      type: 'object',
      required: expect.arrayContaining(['id', 'title']) as unknown,
      properties: { id: { type: 'string', format: 'uuid' } },
    });

    const content = (operation?.['requestBody'] as Record<string, Record<string, unknown>>)[
      'content'
    ];
    const bodySchema = resolve(
      doc,
      (content?.['application/json'] as Record<string, Record<string, unknown>>)['schema'] ?? {},
    );
    expect(bodySchema).toMatchObject({
      type: 'object',
      required: expect.arrayContaining(['title', 'tags']) as unknown,
      properties: { title: { type: 'string', minLength: 3, maxLength: 200 } },
    });
  });

  it('documents the shared error body on 400 and 500', async () => {
    app = await createApp();
    const doc = createOpenApiDocument(app) as unknown as Record<string, unknown>;
    const paths = doc['paths'] as Record<string, Record<string, Record<string, unknown>>>;
    const responses = paths['/things/{id}']?.['post']?.['responses'] as Record<
      string,
      Record<string, Record<string, Record<string, Record<string, unknown>>>>
    >;
    for (const status of ['400', '500']) {
      const schema = resolve(
        doc,
        responses[status]?.['content']?.['application/json']?.['schema'] ?? {},
      );
      expect(schema, status).toMatchObject({
        type: 'object',
        required: expect.arrayContaining(['code', 'message']) as unknown,
      });
    }
  });

  // Unset or empty must stay closed: the env schema would default those to development.
  it.each(['test', 'production', undefined, '', ' Development'])(
    'does not serve /docs when NODE_ENV=%j',
    async (nodeEnv) => {
      let mounted: boolean | undefined;
      app = await createApp((a) => {
        mounted = setupOpenApi(a, nodeEnv);
      });
      expect(mounted).toBe(false);
      await request(app.getHttpServer()).get(`/${OPENAPI_PATH}`).expect(404);
      await request(app.getHttpServer()).get(`/${OPENAPI_PATH}-json`).expect(404);
    },
  );

  it('serves Swagger UI and the JSON document in development', async () => {
    let mounted: boolean | undefined;
    app = await createApp((a) => {
      mounted = setupOpenApi(a, 'development');
    });
    expect(mounted).toBe(true);
    const res = await request(app.getHttpServer()).get(`/${OPENAPI_PATH}-json`).expect(200);
    expect((res.body as { info: { title: string } }).info.title).toBe('GuessHive API');
    await request(app.getHttpServer()).get(`/${OPENAPI_PATH}`).expect(200);
  });
});
