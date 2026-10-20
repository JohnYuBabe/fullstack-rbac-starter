import { defineComponent, h, nextTick, withDirectives } from 'vue';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@rbac/shared';
import { permissionDirective } from './permission';

// 指令只依赖 store 里的 user；用真实 pinia 会把测试拖进 axios/localStorage。
// 用 reactive 包一层，和 Pinia setup store 一样把 ref 解包，
// 顺带能直接控制「权限晚到」的时机。
vi.mock('@/stores/auth', async () => {
  const { reactive } = await import('vue');
  const store = reactive<{ user: AuthUser | null }>({ user: null });
  return { useAuthStore: () => store };
});

import { useAuthStore } from '@/stores/auth';

const store = useAuthStore();

function grant(...permissions: AuthUser['permissions']): AuthUser {
  return {
    id: 'u-test',
    email: 'test@example.com',
    name: '测试用户',
    roles: ['editor'],
    permissions,
  };
}

const Button = defineComponent({
  props: {
    required: { type: [String, Array], default: undefined },
  },
  setup(props) {
    return () =>
      withDirectives(h('button', { 'data-test': 'target' }, '按钮'), [
        [permissionDirective, props.required],
      ]);
  },
});

function mountButton(required?: string | string[]) {
  return mount(Button, { props: { required } });
}

function display(wrapper: ReturnType<typeof mountButton>): string {
  const el = wrapper.get('[data-test="target"]').element as HTMLElement;
  return el.style.display;
}

beforeEach(() => {
  store.user = null;
});

describe('v-permission', () => {
  it('单权限命中时显示元素', () => {
    store.user = grant('article:create');

    expect(display(mountButton('article:create'))).toBe('');
  });

  it('权限未命中时用 display:none 隐藏，元素仍留在 DOM 里', () => {
    store.user = grant('article:read');

    const wrapper = mountButton('article:create');

    expect(display(wrapper)).toBe('none');
    expect(wrapper.find('[data-test="target"]').exists()).toBe(true);
  });

  it('未登录（user 为 null）时一律隐藏', () => {
    expect(display(mountButton('article:read'))).toBe('none');
  });

  it('多权限之间是「且」：只满足其中一个也隐藏', () => {
    store.user = grant('article:read');

    expect(display(mountButton(['article:read', 'article:update']))).toBe(
      'none',
    );
  });

  it('多权限全部满足时显示', () => {
    store.user = grant('article:read', 'article:update');

    expect(display(mountButton(['article:read', 'article:update']))).toBe('');
  });

  it('用户信息异步到达后，按钮自动出现', async () => {
    const wrapper = mountButton('article:create');
    expect(display(wrapper)).toBe('none');

    store.user = grant('article:create');
    await nextTick();

    expect(display(wrapper)).toBe('');
  });

  it('权限被收回后，按钮自动隐藏', async () => {
    store.user = grant('article:create');
    const wrapper = mountButton('article:create');
    expect(display(wrapper)).toBe('');

    store.user = grant('article:read');
    await nextTick();

    expect(display(wrapper)).toBe('none');
  });

  it('绑定值为空时恢复显示，不留在上一轮的隐藏状态', async () => {
    store.user = grant();
    const wrapper = mountButton('article:create');
    expect(display(wrapper)).toBe('none');

    await wrapper.setProps({ required: undefined });

    expect(display(wrapper)).toBe('');
  });

  it('绑定值变化时按新值重新判定', async () => {
    store.user = grant('article:read');
    const wrapper = mountButton('article:read');
    expect(display(wrapper)).toBe('');

    await wrapper.setProps({ required: 'article:update' });

    expect(display(wrapper)).toBe('none');
  });

  it('卸载后停止监听，不再改写已脱离文档的元素', async () => {
    const wrapper = mountButton('article:create');
    expect(display(wrapper)).toBe('none');
    const el = wrapper.get('[data-test="target"]').element as HTMLElement;

    wrapper.unmount();
    store.user = grant('article:create');
    await nextTick();

    expect(el.style.display).toBe('none');
  });
});
