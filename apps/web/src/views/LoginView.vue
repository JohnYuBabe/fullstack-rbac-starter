<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { FormInstance, FormRules } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { readApiError } from '@/utils/api-error';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const formRef = ref<FormInstance>();
const loading = ref(false);
const error = ref('');

const form = reactive({
  email: '',
  password: '',
});

interface DemoAccount {
  role: string;
  label: string;
  email: string;
  password: string;
}

// 本地开发账号与 prisma/seed.ts 的 DEV_ACCOUNTS 保持一致。
// `import.meta.env.DEV` 在生产构建时被替换成 false，这一段会被 tree-shaking 去掉。
const DEV_ACCOUNTS: DemoAccount[] = [
  { role: 'admin', label: '管理员', email: 'admin@example.com', password: 'admin123' },
  { role: 'editor', label: '编辑', email: 'editor@example.com', password: 'editor123' },
  { role: 'viewer', label: '访客', email: 'viewer@example.com', password: 'viewer123' },
];

const env = import.meta.env;

// 线上只暴露构建时注入的公开 demo 账号；私有管理员的密码永远不进 bundle。
const PROD_DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: 'admin',
    label: '管理员',
    email: env.VITE_DEMO_ADMIN_EMAIL ?? '',
    password: env.VITE_DEMO_ADMIN_PASSWORD ?? '',
  },
  {
    role: 'editor',
    label: '编辑',
    email: env.VITE_DEMO_EDITOR_EMAIL ?? '',
    password: env.VITE_DEMO_EDITOR_PASSWORD ?? '',
  },
  {
    role: 'viewer',
    label: '访客',
    email: env.VITE_DEMO_VIEWER_EMAIL ?? '',
    password: env.VITE_DEMO_VIEWER_PASSWORD ?? '',
  },
].filter((account) => account.email && account.password);

const demoAccounts = computed<DemoAccount[]>(() =>
  env.DEV ? DEV_ACCOUNTS : PROD_DEMO_ACCOUNTS,
);

const rules: FormRules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' },
  ],
};

function fillDemo(account: DemoAccount): void {
  form.email = account.email;
  form.password = account.password;
  error.value = '';
}

async function submit(): Promise<void> {
  if (!formRef.value) {
    return;
  }

  error.value = '';
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) {
    return;
  }

  loading.value = true;
  try {
    await auth.login(form.email, form.password);

    const redirect = route.query.redirect;
    const target =
      typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/';
    await router.push(target);
  } catch (value: unknown) {
    error.value = readApiError(value, '登录失败，请稍后重试。');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <section class="brand">
      <div class="wordmark">rbac<span>/</span>starter</div>

      <div class="brand-copy">
        <p class="eyebrow">权限体系起手式</p>
        <h1>同一个权限串，<br />三个地方生效。</h1>
        <p class="lede">
          菜单决定看得到什么，路由决定进得去哪个页面，按钮决定能不能操作。
          三处判断的是同一个 <code>资源:动作</code>，不是三套各写一遍的规则。
        </p>
      </div>

      <ul class="level-list">
        <li>
          <span class="level-index">01</span>
          <span><b>菜单</b>：没有 <code>user:manage</code> 的用户看不到「用户管理」入口。</span>
        </li>
        <li>
          <span class="level-index">02</span>
          <span><b>路由</b>：直接输入地址也会被守卫拦下，落到 403 页。</span>
        </li>
        <li>
          <span class="level-index">03</span>
          <span><b>按钮</b>：访客看得到文章列表，看不到新建与删除。</span>
        </li>
      </ul>

      <p class="brand-foot">
        前端只负责隐藏，服务端才是判定方 · 写操作全部留痕
      </p>
    </section>

    <section class="form-side">
      <el-card class="login-card" shadow="never">
        <div class="card-head">
          <h2>登录</h2>
          <p>三个账号对应三种权限组合，可随时切换对比。</p>
        </div>

        <el-alert
          v-if="error"
          :title="error"
          type="error"
          :closable="false"
          show-icon
          class="login-alert"
        />

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          @submit.prevent="submit"
        >
          <el-form-item label="邮箱" prop="email">
            <el-input
              v-model="form.email"
              placeholder="邮箱地址"
              autocomplete="username"
              size="large"
            />
          </el-form-item>

          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="至少 6 位"
              autocomplete="current-password"
              show-password
              size="large"
              @keyup.enter="submit"
            />
          </el-form-item>

          <el-button
            type="primary"
            size="large"
            class="submit"
            :loading="loading"
            native-type="submit"
          >
            进入
          </el-button>
        </el-form>

        <div v-if="demoAccounts.length > 0" class="demo-block">
          <div class="demo-title">一键填入</div>
          <div class="demo-grid">
            <button
              v-for="account in demoAccounts"
              :key="account.role"
              type="button"
              class="demo-item"
              @click="fillDemo(account)"
            >
              <span class="demo-role">{{ account.label }}</span>
              <span class="demo-email">{{ account.email }}</span>
            </button>
          </div>
          <p class="demo-hint">点击填入后再点「进入」。</p>
        </div>
      </el-card>

      <p class="side-foot">fullstack-rbac-starter · 权限演示</p>
    </section>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(380px, 0.95fr);
}

.brand {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 32px;
  padding: 56px 64px;
  color: #eef7f4;
  background:
    radial-gradient(circle at 16% 10%, rgba(45, 160, 140, 0.32), transparent 44%),
    radial-gradient(circle at 84% 90%, rgba(19, 94, 84, 0.5), transparent 50%),
    #0f2b26;
  overflow: hidden;
}

.brand::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: linear-gradient(to bottom, black, transparent 85%);
  pointer-events: none;
}

.wordmark {
  position: relative;
  z-index: 1;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.wordmark span {
  color: #6fd3bf;
  padding: 0 2px;
}

.brand-copy {
  position: relative;
  z-index: 1;
  max-width: 540px;
}

.eyebrow {
  margin: 0 0 14px;
  font-size: 12px;
  letter-spacing: 0.24em;
  color: #7fd6c4;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: clamp(32px, 4vw, 54px);
  line-height: 1.18;
  letter-spacing: -0.02em;
}

.lede {
  margin: 22px 0 0;
  max-width: 460px;
  font-size: 15px;
  line-height: 1.9;
  color: #b6cfc8;
}

.lede code,
.level-list code {
  background: rgba(255, 255, 255, 0.09);
  color: #9fe4d5;
}

.level-list {
  position: relative;
  z-index: 1;
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 10px;
  max-width: 560px;
}

.level-list li {
  display: flex;
  gap: 14px;
  align-items: baseline;
  padding: 12px 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  font-size: 13px;
  line-height: 1.7;
  color: #d8e9e4;
}

.level-index {
  font-size: 11px;
  letter-spacing: 0.12em;
  color: #6fd3bf;
  font-variant-numeric: tabular-nums;
}

.brand-foot {
  position: relative;
  z-index: 1;
  margin: 0;
  font-size: 12px;
  color: #7fa39a;
}

.form-side {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 40px 28px;
  background: #f5f7f6;
}

.login-card {
  width: min(100%, 420px);
  border: 1px solid #dfe7e3;
  border-radius: 16px;
  box-shadow: 0 18px 50px rgba(15, 43, 38, 0.08);
}

.card-head {
  margin-bottom: 22px;
}

.card-head h2 {
  margin: 0 0 6px;
  font-size: 24px;
  letter-spacing: -0.01em;
  color: #14201d;
}

.card-head p {
  margin: 0;
  font-size: 13px;
  color: #6f807a;
}

.login-alert {
  margin-bottom: 18px;
}

.submit {
  width: 100%;
  margin-top: 4px;
}

.demo-block {
  margin-top: 26px;
  padding-top: 20px;
  border-top: 1px dashed #dfe7e3;
}

.demo-title {
  margin-bottom: 10px;
  font-size: 12px;
  letter-spacing: 0.12em;
  color: #6f807a;
  text-transform: uppercase;
}

.demo-grid {
  display: grid;
  gap: 8px;
}

.demo-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border: 1px solid #dfe7e3;
  border-radius: 8px;
  background: #fbfcfc;
  color: #46554f;
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.demo-item:hover {
  border-color: #a8c8c3;
  background: #f0f8f6;
}

.demo-role {
  font-weight: 600;
  color: #135e54;
  letter-spacing: 0.04em;
  font-size: 12px;
}

.demo-email {
  color: #6f807a;
}

.demo-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: #93a29c;
}

.side-foot {
  margin: 0;
  font-size: 12px;
  color: #93a29c;
}

@media (max-width: 900px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .brand {
    padding: 36px 26px 30px;
    gap: 22px;
  }

  .brand-copy h1 {
    font-size: 32px;
  }

  .lede {
    margin-top: 14px;
    font-size: 14px;
  }

  .level-list,
  .brand-foot {
    display: none;
  }

  .form-side {
    padding: 26px 18px 40px;
    justify-content: flex-start;
  }
}
</style>
