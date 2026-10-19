import { watch } from 'vue';
import type { Directive } from 'vue';
import { hasAllPermissions, type PermissionString } from '@rbac/shared';
import { useAuthStore } from '@/stores/auth';

type PermissionValue = PermissionString | PermissionString[];

function apply(el: HTMLElement, value: PermissionValue | undefined): void {
  // 值被清空时恢复显示：binding 可能来自响应式表达式，
  // 早退会让元素停在上一轮的 display 上。
  if (!value) {
    el.style.display = '';
    return;
  }

  const auth = useAuthStore();
  const required = Array.isArray(value) ? value : [value];
  // 用 display 而不是 removeChild：后者不可逆，
  // 用户信息异步到达时元素不会回来，会出现「刷新后才出现按钮」的假 bug。
  el.style.display = hasAllPermissions(auth.user?.permissions ?? [], required)
    ? ''
    : 'none';
}

interface PermissionState {
  value: PermissionValue | undefined;
  stop: () => void;
}

const states = new WeakMap<HTMLElement, PermissionState>();

/**
 * v-permission="'article:create'"
 * v-permission="['article:read', 'article:update']"   // 多权限为「且」
 *
 * 只控制「看不看得见」。真正的拦截在服务端：绕过前端直接调接口依然返回 403。
 */
export const permissionDirective: Directive<HTMLElement, PermissionValue> = {
  mounted(el, binding) {
    const state: PermissionState = {
      value: binding.value,
      stop: () => undefined,
    };
    states.set(el, state);

    apply(el, state.value);

    const auth = useAuthStore();
    // watch 的回调读 state.value，而不是闭包里的 binding：
    // binding 对象在更新时会被复用/替换，闭包必须始终看到最新值。
    state.stop = watch(
      () => auth.user,
      () => apply(el, state.value),
    );
  },
  updated(el, binding) {
    const state = states.get(el);
    if (state) {
      state.value = binding.value;
    }
    apply(el, binding.value);
  },
  unmounted(el) {
    states.get(el)?.stop();
    states.delete(el);
  },
};
