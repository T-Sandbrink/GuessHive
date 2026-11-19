import type { IncomingMessage } from 'node:http';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { rememberRouteTemplate } from './route-template.js';

/** Stores the matched route template on the request, for the request log line. */
@Injectable()
export class RouteTemplateInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      rememberRouteTemplate(context.switchToHttp().getRequest<IncomingMessage>());
    }
    return next.handle();
  }
}
