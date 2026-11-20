import { describe, expect, it } from 'vitest';
import { assertSeedAllowed } from './guard.js';

const LOCAL_URL = 'postgresql://guesshive:guesshive@localhost:5440/guesshive';
const ADMIN = 'admin@guesshive.test';

describe('assertSeedAllowed', () => {
  it.each([
    'postgresql://u:p@localhost:5440/db',
    'postgresql://u:p@127.0.0.1:5441/db',
    'postgresql://u:p@[::1]:5440/db',
    'postgres://u:p@LOCALHOST/db',
  ])('allows the local database %s', (url) => {
    expect(() => {
      assertSeedAllowed({ DATABASE_URL: url }, 'development', ADMIN);
    }).not.toThrow();
  });

  it.each(['admin@guesshive.example', 'me@dev.localhost', 'Admin@GuessHive.TEST'])(
    'allows the reserved admin email %s',
    (email) => {
      expect(() => {
        assertSeedAllowed({ DATABASE_URL: LOCAL_URL }, 'test', email);
      }).not.toThrow();
    },
  );

  it.each([undefined, '', '  '])('refuses an unset NODE_ENV (%j)', (nodeEnv) => {
    expect(() => {
      assertSeedAllowed({ DATABASE_URL: LOCAL_URL }, nodeEnv, ADMIN);
    }).toThrow(/NODE_ENV explicitly/);
  });

  it('refuses NODE_ENV=production', () => {
    expect(() => {
      assertSeedAllowed({ DATABASE_URL: LOCAL_URL }, 'production', ADMIN);
    }).toThrow(/production/);
  });

  it.each([
    'postgresql://u:secret@db.example.com:5432/db',
    'postgresql://u:secret@10.0.0.5/db',
    'postgresql://u:secret@localhost.evil.com/db',
    'postgresql://u:secret@localhost/db?host=db.example.com',
    'postgresql://u:secret@localhost/db?sslmode=disable&hostaddr=10.0.0.5',
  ])('refuses a remote database without leaking the URL', (url) => {
    expect(() => {
      assertSeedAllowed({ DATABASE_URL: url }, 'development', ADMIN);
    }).toThrow(/^Refusing to seed: DATABASE_URL does not point to localhost\.$/);
  });

  it.each(['admin@gmail.com', 'admin@guesshive.com', 'admin@test', 'admin@nottest'])(
    'refuses a deliverable admin email %s',
    (email) => {
      expect(() => {
        assertSeedAllowed({ DATABASE_URL: LOCAL_URL }, 'development', email);
      }).toThrow(/reserved domain/);
    },
  );
});
