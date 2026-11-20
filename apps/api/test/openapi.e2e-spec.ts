import { Body, Controller, type INestApplication, Param, Post, Query } from '@nestjs/common';
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
const listQuerySchema = z.object({ cursor: z.string().optional() });

@Controller('things')
class ThingsController {
  @Post(':id')
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

    const parameters = operation?.['parameters'] as { name: string; in: string }[];
    expect(parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'id', in: 'path' }),
        expect.objectContaining({ name: 'cursor', in: 'query' }),
      ]),
    );

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

  it.each(['test', 'production'] as const)(
    'does not serve /docs when NODE_ENV=%s',
    async (nodeEnv) => {
      let mounted: boolean | undefined;
      app = await createApp((a) => {
        mounted = setupOpenApi(a, { NODE_ENV: nodeEnv });
      });
      expect(mounted).toBe(false);
      await request(app.getHttpServer()).get(`/${OPENAPI_PATH}`).expect(404);
      await request(app.getHttpServer()).get(`/${OPENAPI_PATH}-json`).expect(404);
    },
  );

  it('serves Swagger UI and the JSON document in development', async () => {
    let mounted: boolean | undefined;
    app = await createApp((a) => {
      mounted = setupOpenApi(a, { NODE_ENV: 'development' });
    });
    expect(mounted).toBe(true);
    const res = await request(app.getHttpServer()).get(`/${OPENAPI_PATH}-json`).expect(200);
    expect((res.body as { info: { title: string } }).info.title).toBe('GuessHive API');
    await request(app.getHttpServer()).get(`/${OPENAPI_PATH}`).expect(200);
  });
});
