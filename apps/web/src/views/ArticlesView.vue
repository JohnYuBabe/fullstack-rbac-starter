<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import type { Article } from '@rbac/shared';
import { createArticle, deleteArticle, listArticles } from '@/api/articles';
import { useAuthStore } from '@/stores/auth';
import { readApiError } from '@/utils/api-error';
import { excerpt, formatDateTime } from '@/utils/format';

const router = useRouter();
const auth = useAuthStore();

const articles = ref<Article[]>([]);
const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const formRef = ref<FormInstance>();

const form = reactive({
  title: '',
  content: '',
});

const rules: FormRules = {
  title: [
    { required: true, message: '请输入标题', trigger: 'blur' },
    { min: 2, message: '标题至少 2 个字符', trigger: 'blur' },
  ],
  content: [{ required: true, message: '请输入正文', trigger: 'blur' }],
};

async function load(): Promise<void> {
  loading.value = true;
  try {
    articles.value = await listArticles();
  } catch (value: unknown) {
    ElMessage.error(readApiError(value, '加载文章失败'));
  } finally {
    loading.value = false;
  }
}

function openCreate(): void {
  form.title = '';
  form.content = '';
  dialogVisible.value = true;
}

async function submit(): Promise<void> {
  if (!formRef.value) {
    return;
  }
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) {
    return;
  }

  saving.value = true;
  try {
    await createArticle({ title: form.title, content: form.content });
    ElMessage.success('已创建');
    dialogVisible.value = false;
    await load();
  } catch (value: unknown) {
    ElMessage.error(readApiError(value, '创建失败'));
  } finally {
    saving.value = false;
  }
}

async function remove(article: Article): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除《${article.title}》后不可恢复，确认删除？`,
      '删除文章',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }

  try {
    await deleteArticle(article.id);
    ElMessage.success('已删除');
    await load();
  } catch (value: unknown) {
    ElMessage.error(readApiError(value, '删除失败'));
  }
}

function open(article: Article): void {
  void router.push({ name: 'article-detail', params: { id: article.id } });
}

onMounted(load);
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1>文章</h1>
        <p>
          访客只能看这张表；新建、编辑与删除只对拥有对应权限的角色渲染。
        </p>
      </div>
      <el-button
        v-if="auth.hasPermission('article:create')"
        type="primary"
        @click="openCreate"
      >
        新建文章
      </el-button>
    </header>

    <el-card shadow="never" class="table-card">
      <el-table
        v-loading="loading"
        :data="articles"
        row-key="id"
        class="article-table"
        @row-click="open"
      >
        <el-table-column label="标题" min-width="220">
          <template #default="{ row }">
            <div class="title">{{ row.title }}</div>
            <div class="excerpt">{{ excerpt(row.content) }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="authorName" label="作者" width="120" />
        <el-table-column label="更新时间" width="160">
          <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button
                v-if="auth.hasPermission('article:update')"
                text
                type="primary"
                @click.stop="open(row as Article)"
              >
                编辑
              </el-button>
              <el-button
                v-if="auth.hasPermission('article:delete')"
                text
                type="danger"
                @click.stop="remove(row as Article)"
              >
                删除
              </el-button>
              <span
                v-if="
                  !auth.hasPermission('article:update') &&
                  !auth.hasPermission('article:delete')
                "
                class="muted"
              >
                只读
              </span>
            </div>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty">还没有文章。有 <code>article:create</code> 的账号可以新建。</div>
        </template>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" title="新建文章" width="min(640px, 92vw)">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="标题" prop="title">
          <el-input v-model="form.title" maxlength="120" show-word-limit />
        </el-form-item>
        <el-form-item label="正文" prop="content">
          <el-input v-model="form.content" type="textarea" :rows="10" maxlength="20000" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">创建</el-button>
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

.article-table :deep(.el-table__row) {
  cursor: pointer;
}

.title {
  font-size: 13.5px;
  font-weight: 600;
  color: #14201d;
}

.excerpt {
  margin-top: 2px;
  font-size: 12px;
  color: #7a8a84;
}

.muted {
  font-size: 12px;
  color: #a3b1ac;
}

.row-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 2px;
}

.row-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.empty {
  padding: 26px 0;
  font-size: 13px;
  color: #93a29c;
}
</style>
