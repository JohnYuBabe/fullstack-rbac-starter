/**
 * 生产环境对 JWT_SECRET 的最低要求。
 *
 * 占位词要和 .env.example 的口径一致：模板里写的是 `CHANGE_ME_32_BYTES_OR_LONGER`，
 * 只匹配 `change-me` 会漏掉下划线写法，把占位串补到 32 位以上就能骗过长度检查。
 */
const WEAK_SECRET =
  /change[_-]?me|placeholder|your[_-]?password|dev-secret|example|test-secret|secret/i;

export function assertStrongJwtSecret(secret: string): void {
  if (secret.length < 32 || WEAK_SECRET.test(secret)) {
    throw new Error(
      '生产环境必须设置长度至少 32 位、且不含占位词的 JWT_SECRET（openssl rand -base64 48）',
    );
  }
}
