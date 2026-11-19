import type { IncomingMessage } from 'node:http';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { routeTemplate } from './logger.module.js';
import { RouteTemplateInterceptor } from './route-template.interceptor.js';

function context(type: string, req: IncomingMessage) {
  const switchToHttp = vi.fn(() => ({ getRequest: () => req }));
  const ctx = { getType: () => type, switchToHttp } as unknown as ExecutionContext;
  return { ctx, switchToHttp };
}

describe('RouteTemplateInterceptor', () => {
  it('records the route template for http requests and continues the chain', () => {
    const req = { route: { path: '/questions/:id' } } as unknown as IncomingMessage;
    const handled = of('result');
    const handle = vi.fn(() => handled);
    const next: CallHandler = { handle };

    const result = new RouteTemplateInterceptor().intercept(context('http', req).ctx, next);

    expect(result).toBe(handled);
    expect(handle).toHaveBeenCalledOnce();
    expect(routeTemplate(req)).toBe('/questions/:id');
  });

  it('does nothing for non-http contexts', () => {
    const req = { route: { path: '/questions/:id' } } as unknown as IncomingMessage;
    const { ctx, switchToHttp } = context('rpc', req);
    const handle = vi.fn(() => of(null));

    new RouteTemplateInterceptor().intercept(ctx, { handle });

    expect(switchToHttp).not.toHaveBeenCalled();
    expect(routeTemplate(req)).toBe('unmatched');
    expect(handle).toHaveBeenCalledOnce();
  });
});
