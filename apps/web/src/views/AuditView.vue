<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { ROLE_LABELS, type AuditLogEntry } from '@rbac/shared';
import { listAuditLogs, type AuditQuery } from '@/api/audit';
import { readApiError } from '@/utils/api-error';
import { formatDateTime } from '@/utils/format';

const ACTION_OPTIONS = [
  { value: 'article.create', label: 'article.create · 新建文章' },
  { value: 'article.update', label: 'article.update · 编辑文章' },
  { value: 'article.delete', label: 'article.delete · 删除文章' },
  { value: 'user.create', label: 'user.create · 新建用户' },
  { value: 'user.update', label: 'user.update · 修改用户' },
  { value: 'user.delete', label: 'user.delete · 删除用户' },
];

const entries = ref<AuditLogEntry[]>([]);
const total = ref(0);
const loading = ref(false);

const filters = reactive<{
  resourceType: string;
  action: string;
  actorEmail: string;
  page: number;
  pageSize: number;
}>({
  resourceType: '',
  action: '',
  actorEmail: '',
  page: 1,
  pageSize: 20,
});

function roleLabel(role: string): string {
  if (!role) {
    return '—';
  }
  return role
    .split(',')
    .map((name) => ROLE_LABELS[name as keyof typeof ROLE_LABELS] ?? name)
    .join(' / ');
}

function pretty(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  return JSON.stringify(value, null, 2);
}

async function load(): Promise<void> {
  loading.value = true;
  const query: AuditQuery = {
    page: filters.page,
    pageSize: filters.pageSize,
  };
  if (filters.resourceType) {
    query.resourceType = filters.resourceType;
  }
  if (filters.action) {
    query.action = filters.action;
  }
  if (filters.actorEmail) {
    query.actorEmail = filters.actorEmail;
  }

  try {
    const result = await listAuditLogs(query);
    entries.value = result.items;
    total.value = result.total;
  } catch (value: unknown) {
    ElMessage.error(readApiError(value, '加载审计日志失败'));
  } finally {
    loading.value = false;
  }
}

function search(): void {
  filters.page = 1;
  void load();
}

function reset(): void {
  filters.resourceType = '';
  filters.action = '';
  filters.actorEmail = '';
  filters.page = 1;
  void load();
}

function onPageChange(page: number): void {
  filters.page = page;
  void load();
}

onMounted(load);
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1>审计日志</h1>
        <p>
          写操作与审计记录在同一个事务里提交；这里能看到操作人、当时的角色、
          改了哪个对象，以及改动前后的值。
        </p>
      </div>
    </header>

    <div class="filters">
      <el-select
        v-model="filters.resourceType"
        placeholder="对象类型"
        clearable
        class="filter"
        @change="search"
      >
        <el-option label="全部" value="" />
        <el-option label="文章" value="article" />
        <el-option label="用户" value="user" />
      </el-select>

      <el-select
        v-model="filters.action"
        placeholder="动作"
        clearable
        class="filter wide"
        @change="search"
      >
        <el-option label="全部" value="" />
        <el-option
          v-for="option in ACTION_OPTIONS"
          :key="option.value"
          :label="option.label"
          :value="option.value"
        />
      </el-select>

      <el-input
        v-model="filters.actorEmail"
        placeholder="操作人邮箱"
        clearable
        class="filter wide"
        @keyup.enter="search"
        @clear="search"
      />

      <el-button type="primary" @click="search">筛选</el-button>
      <el-button @click="reset">重置</el-button>
    </div>

    <el-card shadow="never" class="table-card">
      <el-table v-loading="loading" :data="entries" row-key="id">
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="diff">
              <div class="diff-col">
                <div class="diff-title">before</div>
                <pre>{{ pretty(row.before) }}</pre>
              </div>
              <div class="diff-col">
                <div class="diff-title">after</div>
                <pre>{{ pretty(row.after) }}</pre>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="150">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作人" min-width="170">
          <template #default="{ row }">
            <div class="actor">{{ row.actorEmail }}</div>
            <div class="roles">{{ roleLabel(row.roleNames) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="动作" width="150">
          <template #default="{ row }">
            <code class="action">{{ row.action }}</code>
          </template>
        </el-table-column>
        <el-table-column label="描述" min-width="240">
          <template #default="{ row }">{{ row.summary }}</template>
        </el-table-column>
        <el-table-column label="来源 IP" width="130">
          <template #default="{ row }">{{ row.ip ?? '—' }}</template>
        </el-table-column>
        <template #empty>
          <div class="empty">还没有审计记录。新建或编辑一篇文章后回来看看。</div>
        </template>
      </el-table>

      <div class="pager">
        <span class="total">共 {{ total }} 条</span>
        <el-pagination
          layout="prev, pager, next"
          :total="total"
          :page-size="filters.pageSize"
          :current-page="filters.page"
          @current-change="onPageChange"
        />
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.page-head {
  margin-bottom: 18px;
}

.page-head h1 {
  margin: 0 0 4px;
  font-size: 22px;
  color: #14201d;
}

.page-head p {
  margin: 0;
  max-width: 760px;
  font-size: 12.5px;
  line-height: 1.8;
  color: #6f807a;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.filter {
  width: 130px;
}

.filter.wide {
  width: 220px;
}

.table-card {
  border: 1px solid #dfe7e3;
  border-radius: 14px;
}

.actor {
  font-size: 12.5px;
  color: #14201d;
}

.roles {
  font-size: 11.5px;
  color: #7a8a84;
}

.action {
  font-size: 11.5px;
}

.diff {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  padding: 6px 16px 14px;
}

.diff-title {
  margin-bottom: 6px;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #7a8a84;
}

.diff pre {
  margin: 0;
  max-height: 220px;
  overflow: auto;
  padding: 12px 14px;
  border-radius: 10px;
  background: #f6f9f8;
  border: 1px solid #eef2f0;
  font-size: 12px;
  line-height: 1.7;
  color: #2c3a35;
  white-space: pre-wrap;
  word-break: break-word;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
}

.total {
  font-size: 12.5px;
  color: #7a8a84;
}

.empty {
  padding: 26px 0;
  font-size: 13px;
  color: #93a29c;
}

@media (max-width: 720px) {
  .diff {
    grid-template-columns: 1fr;
  }
}
</style>
