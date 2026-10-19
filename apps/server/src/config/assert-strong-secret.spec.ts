import { assertStrongJwtSecret } from './assert-strong-secret';

describe('assertStrongJwtSecret', () => {
  it('接受 32 位以上的随机值', () => {
    expect(() =>
      assertStrongJwtSecret('Zx9Kp2Vt7Qm4Lr8Ws6Nb3Hc5Jd1Fg0TaQw3Er'),
    ).not.toThrow();
  });

  it('拒绝不足 32 位的值', () => {
    expect(() => assertStrongJwtSecret('Zx9Kp2Vt7Qm4Lr8Ws6Nb3Hc5Jd1Fg0T')).toThrow(
      /至少 32 位/,
    );
  });

  it.each([
    'CHANGE_ME_THIS_IS_LONG_ENOUGH_1234567890',
    'change-me-this-is-long-enough-1234567890',
    'changeme-this-is-long-enough-1234567890',
    'PLACEHOLDER-value-that-is-long-enough-1234',
    'YOUR_PASSWORD_value_long_enough_123456789',
    'dev-secret-value-that-is-long-enough-123',
    'example-value-that-is-long-enough-123456',
    'test-secret-value-that-is-long-enough-123',
  ])('拒绝占位值 %s', (secret) => {
    expect(() => assertStrongJwtSecret(secret)).toThrow(/占位词/);
  });
});
