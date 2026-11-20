import { Body, Controller, Get, Param, Post, Query, type Type } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum.js';
import { ModulesContainer } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/** Request inputs that must declare a `schema` (AGENTS.md §7: validate every external input). */
const VALIDATED_INPUTS = new Set<number>([
  RouteParamtypes.BODY,
  RouteParamtypes.QUERY,
  RouteParamtypes.PARAM,
  RouteParamtypes.HEADERS,
  RouteParamtypes.RAW_BODY,
]);

interface RouteArg {
  index: number;
  schema?: unknown;
}

/** Lists `Controller.method#argIndex` for every body/query/param/header argument without a schema. */
function argsWithoutSchema(controllers: Type[]): string[] {
  const missing: string[] = [];
  for (const controller of controllers) {
    const proto = controller.prototype as Record<string, unknown>;
    for (const method of Object.getOwnPropertyNames(proto)) {
      if (method === 'constructor' || typeof proto[method] !== 'function') {
        continue;
      }
      const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, method) ?? {}) as Record<
        string,
        RouteArg
      >;
      for (const [key, arg] of Object.entries(args)) {
        const paramtype = Number(key.split(':')[0]);
        if (VALIDATED_INPUTS.has(paramtype) && arg.schema === undefined) {
          missing.push(`${controller.name}.${method}#${String(arg.index)}`);
        }
      }
    }
  }
  return missing;
}

@Controller('fixture')
class FixtureController {
  @Post(':id')
  withSchemas(
    @Param('id', { schema: z.uuid() }) id: string,
    @Body({ schema: z.object({}) }) body: object,
  ): unknown {
    return { id, body };
  }

  @Get()
  withoutSchema(@Query('limit') limit: string, @Body() body: unknown): unknown {
    return { limit, body };
  }
}

describe('route argument schemas', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('detects body, query and param arguments without a schema', () => {
    expect(argsWithoutSchema([FixtureController]).sort()).toEqual([
      'FixtureController.withoutSchema#0',
      'FixtureController.withoutSchema#1',
    ]);
  });

  it('every controller in the app declares a schema for each request input', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5440/guesshive');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    const controllers = [...moduleRef.get(ModulesContainer).values()].flatMap((module) =>
      [...module.controllers.values()].map((wrapper) => wrapper.metatype as Type),
    );
    expect(argsWithoutSchema(controllers)).toEqual([]);
    await moduleRef.close();
  });
});
