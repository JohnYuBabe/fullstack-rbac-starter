<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import {
  ROLE_LABELS,
  ROLE_NAMES,
  type AdminUser,
  type RoleName,
} from '@rbac/shared';
import { createUser, deleteUser, listUsers, updateUser } from '@/api/users';
import { useAuthStore } from '@/stores/auth';
import { readApiError } from '@/utils/api-error';
import { formatDateTime } from '@/utils/format';

const auth = useAuthStore();

const users = ref<AdminUser[]>([]);
const loading = ref(false);
const saving = ref(false);

const createVisible = ref(false);
const createFormRef = ref<FormInstance>();
const createForm = reactive({
  email: '',
  name: '',
  password: '',
  roles: ['viewer'] as string[],
});

const editVisible = ref(false);
const editTarget = ref<AdminUser | null>(null);
const editForm = reactive({
  name: '',
  roles: [] as string[],
});

const createRules: FormRules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
  ],
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入初始密码', trigger: 'blur' },
    { min: 8, message: '密码至少 8 位', trigger: 'blur' },
  ],
  roles: [{ required: true, message: '至少选择一个角色', trigger: 'change' }],
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role as RoleName] ?? role;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    users.value = await listUsers();
  } catch (value: unknown) {
    ElMessage.error(readApiError(value, '加载用户失败'));
  } finally {
    loading.value = false;
  }
}

function openCreate(): void {
  createForm.email = '';
  createForm.name = '';
  createForm.password = '';
  createForm.roles = ['viewer'];
  createVisible.value = true;
}

async function submitCreate(): Promise<void> {
  if (!createFormRef.value) {
    return;
  }
  const valid = await createFormRef.value.validate().catch(() => false);
  if (!valid) {
    return;
  }

  saving.value = true;
  try {
    await createUser({
      email: createForm.email,
      name: createForm.name,
      password: createForm.password,
      roles: createForm.roles,
    });
    ElMessage.success('已创建');
    createVisible.value = false;
    await load();
  } catch (value: unknown) {
    ElMessage.error(readApiError(value, '创建失败'));
  } finally {
    saving.value = false;
  }
}

function openEdit(user: AdminUser): void {
  editTarget.value = user;
  editForm.name = user.name;
  editForm.roles = [...user.roles];
  editVisible.value = true;
}

async function submitEdit(): Promise<void> {
  if (!editTarget.value) {
    return;
  }
  if (editForm.roles.length === 0) {
    ElMessage.warning('至少选择一个角色');
    return;
  }

  saving.value = true;
  try {
    await updateUser(editTarget.value.id, {
      name: editForm.name,
      roles: editForm.roles,
    });
    ElMessage.success('已保存，下一次请求即生效');
    editVisible.value = false;
    await load();
  } catch (value: unknown) {
    ElMessage.error(readApiError(value, '保存失败'));
  } finally {
    saving.value = false;
  }
}

async function remove(user: AdminUser): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除用户 ${user.email}？该账号的登录会立即失效。`,
      '删除用户',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }

  try {
    await deleteUser(user.id);
    ElMessage.success('已删除');
    await load();
  } catch (value: unknown) {
    ElMessage.error(readApiError(value, '删除失败'));
  }
}

onMounted(load);
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1>用户管理</h1>
        <p>
          改角色不写 JWT 快照：被改的用户不用重新登录，下一次请求就是新权限。
        </p>
      </div>
      <el-button type="primary" @click="openCreate">新建用户</el-button>
    </header>

    <el-card shadow="never" class="table-card">
      <el-table v-loading="loading" :data="users" row-key="id">
        <el-table-column label="用户" min-width="200">
          <template #default="{ row }">
            <div class="name">{{ row.name }}</div>
            <div class="email">{{ row.email }}</div>
          </template>
        </el-table-column>
        <el-table-column label="角色" width="180">
          <template #default="{ row }">
            <div class="tags">
              <el-tag
                v-for="role in row.roles"
                :key="role"
                size="small"
                effect="plain"
              >
                {{ roleLabel(role) }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="权限" width="90" align="center">
          <template #default="{ row }">{{ row.permissions.length }}</template>
        </el-table-column>
        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" align="right">
          <template #default="{ row }">
            <el-button text @click="openEdit(row as AdminUser)">改角色</el-button>
            <el-button
              v-if="row.id !== auth.user?.id"
              text
              type="danger"
              @click="remove(row as AdminUser)"
            >
              删除
            </el-button>
            <span v-else class="muted">当前账号</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="createVisible" title="新建用户" width="min(480px, 92vw)">
      <el-form
        ref="createFormRef"
        :model="createForm"
        :rules="createRules"
        label-position="top"
      >
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="createForm.email" autocomplete="off" />
        </el-form-item>
        <el-form-item label="姓名" prop="name">
          <el-input v-model="createForm.name" maxlength="40" />
        </el-form-item>
        <el-form-item label="初始密码" prop="password">
          <el-input v-model="createForm.password" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item label="角色" prop="roles">
          <el-select v-model="createForm.roles" multiple class="full">
            <el-option
              v-for="role in ROLE_NAMES"
              :key="role"
              :label="`${ROLE_LABELS[role]}（${role}）`"
              :value="role"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editVisible" title="修改角色" width="min(480px, 92vw)">
      <el-form label-position="top">
        <el-form-item label="姓名">
          <el-input v-model="editForm.name" maxlength="40" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="editForm.roles" multiple class="full">
            <el-option
              v-for="role in ROLE_NAMES"
              :key="role"
              :label="`${ROLE_LABELS[role]}（${role}）`"
              :value="role"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <p class="hint">
        保存后生效于对方的下一次请求。当前账号不能移除自己的管理员角色。
      </p>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.page-head h1 {
  margin: 0 0 4px;
  font-size: 22px;
  color: #14201d;
}

.page-head p {
  margin: 0;
  font-size: 12.5px;
  color: #6f807a;
}

.table-card {
  border: 1px solid #dfe7e3;
  border-radius: 14px;
}

.name {
  font-size: 13.5px;
  font-weight: 600;
  color: #14201d;
}

.email {
  font-size: 12px;
  color: #7a8a84;
}

.tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.muted {
  font-size: 12px;
  color: #a3b1ac;
}

.full {
  width: 100%;
}

.hint {
  margin: 4px 0 0;
  font-size: 12.5px;
  line-height: 1.8;
  color: #7a8a84;
}
</style>
