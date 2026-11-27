import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { ApiException } from '../common/api.exception.js';
import { AllowRestricted, Public, Roles } from './auth.decorators.js';
import { AuthGuard, RolesGuard } from './auth.guard.js';
import type { RequestUser, UserRole, UserStatus } from './request-user.js';

class OpenController {
  @Public()
  open(): void {
    return undefined;
  }

  @Public()
  @Roles('ADMIN')
  openAdmin(): void {
    return undefined;
  }

  closed(): void {
    return undefined;
  }

  @AllowRestricted()
  restricted(): void {
    return undefined;
  }

  @AllowRestricted()
  @Roles('ADMIN')
  restrictedAdmin(): void {
    return undefined;
  }

  @Roles('ADMIN')
  admin(): void {
    return undefined;
  }

  @Roles('MODERATOR', 'ADMIN')
  staff(): void {
    return undefined;
  }

  @Roles('USER')
  usersOnly(): void {
    return undefined;
  }
}

@Public()
class PublicController {
  anything(): void {
    return undefined;
  }
}

@AllowRestricted()
class RestrictedController {
  anything(): void {
    return undefined;
  }
}

@Roles('ADMIN')
class AdminController {
  inherited(): void {
    return undefined;
  }

  @Roles('USER', 'MODERATOR')
  overridden(): void {
    return undefined;
  }
}

type Handler = () => void;

/** A handler as Nest passes it to guards, looked up by name (no unbound method reference). */
function method<C extends object>(cls: new () => C, name: keyof C & string): () => void {
  const fn: unknown = Reflect.get(cls.prototype, name);
  if (typeof fn !== 'function') {
    throw new Error(`no method ${name}`);
  }
  return fn as () => void;
}

type ContextType = 'http' | 'rpc' | 'ws' | 'graphql';

/** A minimal ExecutionContext for `handler` on `controller`, with `user` on the request. */
function contextFor(
  controller: new () => object,
  handler: Handler,
  user?: RequestUser,
  type: ContextType = 'http',
): { context: ExecutionContext; getRequest: ReturnType<typeof vi.fn> } {
  const getRequest = vi.fn(() => (user === undefined ? {} : { user }));
  const context = {
    getType: () => type,
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest, getResponse: vi.fn(), getNext: vi.fn() }),
  } as unknown as ExecutionContext;
  return { context, getRequest };
}

function userWith(role: UserRole = 'USER', status: UserStatus = 'ACTIVE'): RequestUser {
  return { id: '019a0000-0000-7000-8000-000000000001', role, status, emailVerified: true };
}

/** Runs `fn` and returns the ApiException it threw (fails the test if it did not throw one). */
function thrown(fn: () => unknown): ApiException {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiException);
    return error as ApiException;
  }
  throw new Error('expected an ApiException');
}

function expectError(fn: () => unknown, status: number, code: string): void {
  const error = thrown(fn);
  expect(error.getStatus()).toBe(status);
  expect(error.getResponse()).toEqual({ code, message: expect.any(String) as unknown });
}

const reflector = new Reflector();

const NON_HTTP = ['rpc', 'ws', 'graphql'] as const;

describe('AuthGuard (task 2.8)', () => {
  const guard = new AuthGuard(reflector);
  const can = (context: ExecutionContext): boolean => guard.canActivate(context);

  describe('non-http contexts are refused', () => {
    it.each(NON_HTTP)('refuses %s on a protected route with 403 FORBIDDEN', (type) => {
      const { context, getRequest } = contextFor(
        OpenController,
        method(OpenController, 'closed'),
        userWith(),
        type,
      );
      expectError(() => can(context), 403, 'FORBIDDEN');
      expect(getRequest).not.toHaveBeenCalled();
    });

    it.each(NON_HTTP)('refuses %s on a @Public() handler too', (type) => {
      const { context } = contextFor(
        OpenController,
        method(OpenController, 'open'),
        undefined,
        type,
      );
      expectError(() => can(context), 403, 'FORBIDDEN');
    });

    it.each(NON_HTTP)('refuses %s on a @Public() controller too', (type) => {
      const { context } = contextFor(
        PublicController,
        method(PublicController, 'anything'),
        undefined,
        type,
      );
      expectError(() => can(context), 403, 'FORBIDDEN');
    });

    it.each(NON_HTTP)('refuses %s on an @AllowRestricted() route too', (type) => {
      const { context } = contextFor(
        OpenController,
        method(OpenController, 'restricted'),
        userWith(),
        type,
      );
      expectError(() => can(context), 403, 'FORBIDDEN');
    });
  });

  describe('@Public()', () => {
    it('lets a guest call a @Public() handler', () => {
      expect(can(contextFor(OpenController, method(OpenController, 'open')).context)).toBe(true);
    });

    it('lets a guest call any handler of a @Public() controller', () => {
      const { context } = contextFor(PublicController, method(PublicController, 'anything'));
      expect(can(context)).toBe(true);
    });

    it.each(['SUSPENDED', 'BANNED'] as const)('lets a %s user call a public route', (status) => {
      expect(
        can(
          contextFor(OpenController, method(OpenController, 'open'), userWith('USER', status))
            .context,
        ),
      ).toBe(true);
    });
  });

  describe('default deny', () => {
    it('answers a guest on a protected route with 401 UNAUTHORIZED', () => {
      expectError(
        () => can(contextFor(OpenController, method(OpenController, 'closed')).context),
        401,
        'UNAUTHORIZED',
      );
    });

    it('answers a guest on a @Roles route with 401, not 403', () => {
      expectError(
        () => can(contextFor(OpenController, method(OpenController, 'admin')).context),
        401,
        'UNAUTHORIZED',
      );
    });

    it.each(['USER', 'MODERATOR', 'ADMIN'] as const)('lets an ACTIVE %s through', (role) => {
      expect(
        can(contextFor(OpenController, method(OpenController, 'closed'), userWith(role)).context),
      ).toBe(true);
    });

    it.each(['USER', 'ADMIN'] as const)(
      'answers a SUSPENDED %s with 403 ACCOUNT_SUSPENDED',
      (role) => {
        const { context } = contextFor(
          OpenController,
          method(OpenController, 'closed'),
          userWith(role, 'SUSPENDED'),
        );
        expectError(() => can(context), 403, 'ACCOUNT_SUSPENDED');
      },
    );

    it.each(['USER', 'ADMIN'] as const)('answers a BANNED %s with 403 ACCOUNT_BANNED', (role) => {
      const { context } = contextFor(
        OpenController,
        method(OpenController, 'closed'),
        userWith(role, 'BANNED'),
      );
      expectError(() => can(context), 403, 'ACCOUNT_BANNED');
    });

    it('never puts user data in the error message', () => {
      const user = userWith('USER', 'BANNED');
      const error = thrown(() =>
        can(contextFor(OpenController, method(OpenController, 'closed'), user).context),
      );
      expect(JSON.stringify(error.getResponse())).not.toContain(user.id);
    });
  });

  describe('@AllowRestricted()', () => {
    it.each(['ACTIVE', 'SUSPENDED', 'BANNED'] as const)('lets a %s user through', (status) => {
      expect(
        can(
          contextFor(OpenController, method(OpenController, 'restricted'), userWith('USER', status))
            .context,
        ),
      ).toBe(true);
    });

    it('applies on the controller as well', () => {
      const handler = method(RestrictedController, 'anything');
      const user = userWith('USER', 'BANNED');
      expect(can(contextFor(RestrictedController, handler, user).context)).toBe(true);
    });

    it('still answers a guest with 401 UNAUTHORIZED', () => {
      expectError(
        () => can(contextFor(OpenController, method(OpenController, 'restricted')).context),
        401,
        'UNAUTHORIZED',
      );
      const { context } = contextFor(
        RestrictedController,
        method(RestrictedController, 'anything'),
      );
      expectError(() => can(context), 401, 'UNAUTHORIZED');
    });
  });
});

describe('RolesGuard (task 2.8)', () => {
  const guard = new RolesGuard(reflector);
  const can = (context: ExecutionContext): boolean => guard.canActivate(context);

  it.each(NON_HTTP)('refuses %s on a @Roles route with 403 FORBIDDEN', (type) => {
    const { context, getRequest } = contextFor(
      OpenController,
      method(OpenController, 'admin'),
      userWith('ADMIN'),
      type,
    );
    expectError(() => can(context), 403, 'FORBIDDEN');
    expect(getRequest).not.toHaveBeenCalled();
  });

  it('lets every signed-in user through a route without @Roles, without reading the request', () => {
    const { context, getRequest } = contextFor(
      OpenController,
      method(OpenController, 'closed'),
      userWith('USER'),
    );
    expect(can(context)).toBe(true);
    expect(getRequest).not.toHaveBeenCalled();
  });

  it('lets a guest through a public route without @Roles', () => {
    expect(can(contextFor(OpenController, method(OpenController, 'open')).context)).toBe(true);
  });

  it('@Roles("ADMIN"): ADMIN passes, USER and MODERATOR get 403 FORBIDDEN', () => {
    expect(
      can(contextFor(OpenController, method(OpenController, 'admin'), userWith('ADMIN')).context),
    ).toBe(true);
    for (const role of ['USER', 'MODERATOR'] as const) {
      const { context } = contextFor(
        OpenController,
        method(OpenController, 'admin'),
        userWith(role),
      );
      expectError(() => can(context), 403, 'FORBIDDEN');
    }
  });

  it('@Roles("MODERATOR", "ADMIN"): both pass, USER gets 403', () => {
    for (const role of ['MODERATOR', 'ADMIN'] as const) {
      expect(
        can(contextFor(OpenController, method(OpenController, 'staff'), userWith(role)).context),
      ).toBe(true);
    }
    const { context } = contextFor(
      OpenController,
      method(OpenController, 'staff'),
      userWith('USER'),
    );
    expectError(() => can(context), 403, 'FORBIDDEN');
  });

  it('has no hierarchy: @Roles("USER") refuses ADMIN', () => {
    expect(
      can(
        contextFor(OpenController, method(OpenController, 'usersOnly'), userWith('USER')).context,
      ),
    ).toBe(true);
    const { context } = contextFor(
      OpenController,
      method(OpenController, 'usersOnly'),
      userWith('ADMIN'),
    );
    expectError(() => can(context), 403, 'FORBIDDEN');
  });

  it("applies a controller's @Roles to handlers without their own", () => {
    const handler = method(AdminController, 'inherited');
    expect(can(contextFor(AdminController, handler, userWith('ADMIN')).context)).toBe(true);
    const { context } = contextFor(AdminController, handler, userWith('USER'));
    expectError(() => can(context), 403, 'FORBIDDEN');
  });

  it("lets a handler's @Roles replace the controller's", () => {
    const handler = method(AdminController, 'overridden');
    for (const role of ['USER', 'MODERATOR'] as const) {
      expect(can(contextFor(AdminController, handler, userWith(role)).context)).toBe(true);
    }
    const { context } = contextFor(AdminController, handler, userWith('ADMIN'));
    expectError(() => can(context), 403, 'FORBIDDEN');
  });

  it('answers a guest on a public @Roles route with 401 UNAUTHORIZED', () => {
    expectError(
      () => can(contextFor(OpenController, method(OpenController, 'openAdmin')).context),
      401,
      'UNAUTHORIZED',
    );
  });

  it('lets an ACTIVE ADMIN through a public @Roles("ADMIN") route', () => {
    expect(
      can(
        contextFor(OpenController, method(OpenController, 'openAdmin'), userWith('ADMIN')).context,
      ),
    ).toBe(true);
  });

  it.each([
    ['SUSPENDED', 'ACCOUNT_SUSPENDED'],
    ['BANNED', 'ACCOUNT_BANNED'],
  ] as const)(
    'answers a %s ADMIN on a @Roles("ADMIN") route with 403 %s, before the role check',
    (status, code) => {
      for (const handler of [
        method(OpenController, 'admin'),
        method(OpenController, 'openAdmin'),
        method(OpenController, 'restrictedAdmin'),
      ]) {
        const { context } = contextFor(OpenController, handler, userWith('ADMIN', status));
        expectError(() => can(context), 403, code);
      }
    },
  );

  it.each([
    ['SUSPENDED', 'ACCOUNT_SUSPENDED'],
    ['BANNED', 'ACCOUNT_BANNED'],
  ] as const)('answers a %s USER without the role with %s, not FORBIDDEN', (status, code) => {
    const { context } = contextFor(
      OpenController,
      method(OpenController, 'admin'),
      userWith('USER', status),
    );
    expectError(() => can(context), 403, code);
  });

  it('requires ACTIVE on @AllowRestricted() + @Roles, and lets an ACTIVE ADMIN in', () => {
    expect(
      can(
        contextFor(OpenController, method(OpenController, 'restrictedAdmin'), userWith('ADMIN'))
          .context,
      ),
    ).toBe(true);
    const { context } = contextFor(
      OpenController,
      method(OpenController, 'restrictedAdmin'),
      userWith('USER'),
    );
    expectError(() => can(context), 403, 'FORBIDDEN');
  });

  it('lets SUSPENDED users through @AllowRestricted() routes without @Roles', () => {
    const user = userWith('USER', 'SUSPENDED');
    expect(
      can(contextFor(OpenController, method(OpenController, 'restricted'), user).context),
    ).toBe(true);
  });
});
