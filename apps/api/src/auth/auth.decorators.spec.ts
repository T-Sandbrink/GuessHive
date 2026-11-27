import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import {
  ALLOW_RESTRICTED_KEY,
  AllowRestricted,
  IS_PUBLIC_KEY,
  Public,
  ROLES_KEY,
  Roles,
} from './auth.decorators.js';

const reflector = new Reflector();

@Public()
@Roles('ADMIN')
class ClassLevel {
  plain(): void {
    return undefined;
  }

  @Roles('MODERATOR', 'ADMIN')
  overridden(): void {
    return undefined;
  }
}

@AllowRestricted()
class RestrictedLevel {
  plain(): void {
    return undefined;
  }
}

class HandlerLevel {
  @AllowRestricted()
  restricted(): void {
    return undefined;
  }

  @Public()
  open(): void {
    return undefined;
  }

  @Roles('USER')
  users(): void {
    return undefined;
  }

  bare(): void {
    return undefined;
  }
}

/** A handler as Nest passes it to guards, looked up by name (no unbound method reference). */
function method<C extends object>(cls: new () => C, name: keyof C & string): () => void {
  const fn: unknown = Reflect.get(cls.prototype, name);
  if (typeof fn !== 'function') {
    throw new Error(`no method ${name}`);
  }
  return fn as () => void;
}

/** What the guards read: handler first, then the controller. */
function resolved(key: string, target: new () => object, handler: () => void): unknown {
  return reflector.getAllAndOverride<unknown, string>(key, [handler, target]);
}

describe('auth decorators (task 2.8)', () => {
  it('uses stable, distinct metadata keys', () => {
    expect(IS_PUBLIC_KEY).toBe('auth:isPublic');
    expect(ROLES_KEY).toBe('auth:roles');
    expect(ALLOW_RESTRICTED_KEY).toBe('auth:allowRestricted');
    expect(new Set([IS_PUBLIC_KEY, ROLES_KEY, ALLOW_RESTRICTED_KEY]).size).toBe(3);
  });

  it('@AllowRestricted() sets its own key on a handler or a class, nothing else', () => {
    expect(reflector.get<boolean>(ALLOW_RESTRICTED_KEY, method(HandlerLevel, 'restricted'))).toBe(
      true,
    );
    expect(
      reflector.get<unknown>(IS_PUBLIC_KEY, method(HandlerLevel, 'restricted')),
    ).toBeUndefined();
    expect(reflector.get<unknown>(ROLES_KEY, method(HandlerLevel, 'restricted'))).toBeUndefined();
    expect(resolved(ALLOW_RESTRICTED_KEY, RestrictedLevel, method(RestrictedLevel, 'plain'))).toBe(
      true,
    );
    expect(
      resolved(ALLOW_RESTRICTED_KEY, HandlerLevel, method(HandlerLevel, 'bare')),
    ).toBeUndefined();
  });

  it('@Public() on a class sets isPublic = true on the class only', () => {
    expect(reflector.get<boolean>(IS_PUBLIC_KEY, ClassLevel)).toBe(true);
    expect(reflector.get<unknown>(IS_PUBLIC_KEY, method(ClassLevel, 'plain'))).toBeUndefined();
    expect(resolved(IS_PUBLIC_KEY, ClassLevel, method(ClassLevel, 'plain'))).toBe(true);
  });

  it('@Public() on a handler sets isPublic = true on that handler only', () => {
    expect(reflector.get<boolean>(IS_PUBLIC_KEY, method(HandlerLevel, 'open'))).toBe(true);
    expect(reflector.get<unknown>(IS_PUBLIC_KEY, HandlerLevel)).toBeUndefined();
    expect(resolved(IS_PUBLIC_KEY, HandlerLevel, method(HandlerLevel, 'bare'))).toBeUndefined();
  });

  it('@Roles() stores the explicit list, in order, without implied roles', () => {
    expect(reflector.get<string[]>(ROLES_KEY, ClassLevel)).toEqual(['ADMIN']);
    expect(reflector.get<string[]>(ROLES_KEY, method(ClassLevel, 'overridden'))).toEqual([
      'MODERATOR',
      'ADMIN',
    ]);
    expect(reflector.get<string[]>(ROLES_KEY, method(HandlerLevel, 'users'))).toEqual(['USER']);
  });

  it("a handler's @Roles replaces its controller's", () => {
    expect(resolved(ROLES_KEY, ClassLevel, method(ClassLevel, 'overridden'))).toEqual([
      'MODERATOR',
      'ADMIN',
    ]);
    expect(resolved(ROLES_KEY, ClassLevel, method(ClassLevel, 'plain'))).toEqual(['ADMIN']);
  });

  it('leaves routes without decorators unmarked', () => {
    expect(resolved(ROLES_KEY, HandlerLevel, method(HandlerLevel, 'bare'))).toBeUndefined();
    expect(resolved(IS_PUBLIC_KEY, HandlerLevel, method(HandlerLevel, 'bare'))).toBeUndefined();
  });
});
