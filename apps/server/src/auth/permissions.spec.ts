import {
  hasAllPermissions,
  PERMISSION_LIST,
  ROLE_PRESETS,
  type PermissionString,
} from '@rbac/shared';

describe('hasAllPermissions', () => {
  it('没有声明权限要求时视为通过', () => {
    expect(hasAllPermissions(['article:read'], [])).toBe(true);
  });

  it('拥有声明的权限时通过', () => {
    expect(hasAllPermissions(['article:read'], ['article:read'])).toBe(true);
  });

  it('多个权限之间是「且」：缺任意一个都拒绝', () => {
    const granted: PermissionString[] = ['article:read', 'article:create'];
    expect(
      hasAllPermissions(granted, ['article:read', 'article:create']),
    ).toBe(true);
    // 如果是「或」语义，这一条会错误地通过
    expect(
      hasAllPermissions(granted, ['article:read', 'article:delete']),
    ).toBe(false);
  });

  it('凭空多出的权限不算数', () => {
    expect(hasAllPermissions([], ['article:read'])).toBe(false);
  });
});

describe('ROLE_PRESETS', () => {
  it('每个预设只引用 PERMISSION_LIST 里存在的权限', () => {
    const known = new Set<string>(PERMISSION_LIST);
    for (const [role, permissions] of Object.entries(ROLE_PRESETS)) {
      for (const permission of permissions) {
        expect(known.has(permission)).toBe(true);
      }
      expect(permissions.length).toBeGreaterThan(0);
      expect(role.length).toBeGreaterThan(0);
    }
  });

  it('admin 拥有全部权限', () => {
    expect([...ROLE_PRESETS.admin].sort()).toEqual([...PERMISSION_LIST].sort());
  });

  it('viewer 只有只读权限', () => {
    expect([...ROLE_PRESETS.viewer]).toEqual(['article:read']);
  });
});
