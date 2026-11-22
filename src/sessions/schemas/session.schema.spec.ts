import { SessionSchema } from './session.schema';

// A field with both `index: true` and a schema.index() gets two specs with the same auto name: Mongoose
// creates the plain one first and the TTL/unique one fails silently (production had neither).
const indexesOn = (field: string) =>
  SessionSchema.indexes().filter(([keys]) => Object.keys(keys).join() === field);

describe('SessionSchema indexes', () => {
  it('declares expiresAt once, as a TTL index', () => {
    const specs = indexesOn('expiresAt');
    expect(specs).toHaveLength(1);
    expect(specs[0][1]).toMatchObject({ expireAfterSeconds: 0 });
  });

  it('declares refreshTokenHash once, as a unique index', () => {
    const specs = indexesOn('refreshTokenHash');
    expect(specs).toHaveLength(1);
    expect(specs[0][1]).toMatchObject({ unique: true });
  });
});
