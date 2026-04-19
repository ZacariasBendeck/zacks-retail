import { hashPassword, verifyPassword } from '../../src/services/employees/passwordHash';

describe('passwordHash', () => {
  it('hash is not the plaintext', async () => {
    const h = await hashPassword('correct horse battery staple');
    expect(h).not.toBe('correct horse battery staple');
    expect(h).toMatch(/^\$argon2id\$/);
  });

  it('verify returns true for the right password', async () => {
    const h = await hashPassword('s3cret');
    await expect(verifyPassword('s3cret', h)).resolves.toBe(true);
  });

  it('verify returns false for the wrong password', async () => {
    const h = await hashPassword('s3cret');
    await expect(verifyPassword('wrong', h)).resolves.toBe(false);
  });

  it('verify returns false on malformed hash', async () => {
    await expect(verifyPassword('anything', 'not-a-hash')).resolves.toBe(false);
  });
});
