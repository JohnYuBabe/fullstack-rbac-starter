<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { Article } from '@rbac/shared';
import { deleteArticle, getArticle, updateArticle } from '@/api/articles';
import { useAuthStore } from '@/stores/auth';
import { readApiError } from '@/utils/api-error';
import { formatDateTime } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const article = ref<Article | null>(null);
const loading = ref(false);
const saving = ref(false);
const missing = ref(false);

const form = reactive({
  title: '',
  content: '',
});

const canEdit = computed(() => auth.hasPermission('article:update'));
const canDelete = computed(() => auth.hasPermission('article:delete'));
const dirty = computed(
  () =>
    article.value !== null &&
    (form.title !== article.value.title || form.content !== article.value.content),
);

function fill(value: Article): void {
  article.value = value;
  form.title = value.title;
  form.content = value.content;
}

async function load(id: string): Promise<void> {
  loading.value = true;
  missing.value = false;
  try {
    fill(await getArticle(id));
  } catch {
    missing.value = true;
    article.value = null;
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  if (!article.value) {
    return;
  }
  if (!form.title.trim() || !form.content.trim()) {
    ElMessage.warning('标题与正文都不能为空');
    return;
  }

  saving.value = true;
  try {
    fill(await updateArticle(article.value.id, {
      title: form.title,
      content: form.content,
    }));
    ElMessage.success('已保存');
  } catch (value: unknown) {
    ElMessage.error(readApiError(value, '保存失败'));
  } finally {
    saving.value = false;
  }
}

function reset(): void {
  if (article.value) {
    fill(article.value);
  }
}

async function remove(): Promise<void> {
  if (!article.value) {
    return;
  }
  try {
    await ElMessageBox.confirm(
      `删除《${article.value.title}》后不可恢复，确认删除？`,
      '删除文章',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }

  try {
    await deleteArticle(article.value.id);
    ElMessage.success('已删除');
    await router.push({ name: 'articles' });
  } catch (value: unknown) {
    ElMessage.error(readApiError(value, '删除失败'));
  }
}

watch(
  () => route.params.id,
  (id) => {
    if (typeof id === 'string') {
      void load(id);
    }
  },
  { immediate: true },
);

</script>

<template>
  <div class="page">
    <router-link to="/articles" class="back">← 返回文章列表</router-link>

    <div v-if="missing" class="panel">
      <h1>文章不存在</h1>
      <p>可能已被删除。</p>
    </div>

    <div v-else v-loading="loading" class="panel">
      <template v-if="article">
        <header class="head">
          <div>
            <h1>{{ canEdit ? '编辑文章' : article.title }}</h1>
            <p class="meta">
              {{ article.authorName }}
              <span class="sep">·</span>
              更新于 {{ formatDateTime(article.updatedAt) }}
            </p>
          </div>
          <el-tag v-if="!canEdit" size="small" effect="plain">只读</el-tag>
        </header>

        <div v-if="canEdit" class="form">
          <label class="field">
            <span>标题</span>
            <el-input v-model="form.title" maxlength="120" show-word-limit />
          </label>
          <label class="field">
            <span>正文</span>
            <el-input v-model="form.content" type="textarea" :rows="16" maxlength="20000" />
          </label>
          <div class="actions">
            <el-button type="primary" :loading="saving" :disabled="!dirty" @click="save">
              保存
            </el-button>
            <el-button :disabled="!dirty" @click="reset">还原</el-button>
            <el-button v-if="canDelete" text type="danger" @click="remove">删除</el-button>
          </div>
        </div>

        <div v-else class="reader">
          <h2>{{ article.title }}</h2>
          <p class="reader-body">{{ article.content }}</p>
          <p class="reader-note">
            当前账号有 <code>article:read</code>，没有 <code>article:update</code>，
            所以这里没有编辑框。
          </p>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.back {
  display: inline-block;
  margin-bottom: 14px;
  font-size: 13px;
  color: #135e54;
  text-decoration: none;
}

.panel {
  min-height: 220px;
  padding: 26px 28px;
  background: #fff;
  border: 1px solid #dfe7e3;
  border-radius: 14px;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.head h1 {
  margin: 0 0 4px;
  font-size: 20px;
  color: #14201d;
}

.meta {
  margin: 0;
  font-size: 12.5px;
  color: #6f807a;
}

.sep {
  margin: 0 6px;
  color: #c8d2cd;
}

.form {
  display: grid;
  gap: 16px;
}

.field {
  display: grid;
  gap: 6px;
}

.field > span {
  font-size: 12.5px;
  font-weight: 600;
  color: #46554f;
}

.actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.reader h2 {
  margin: 0 0 14px;
  font-size: 20px;
  color: #14201d;
}

.reader-body {
  margin: 0;
  white-space: pre-wrap;
  font-size: 14px;
  line-height: 2;
  color: #2c3a35;
}

.reader-note {
  margin-top: 24px;
  padding-top: 14px;
  border-top: 1px dashed #e6ece9;
  font-size: 12.5px;
  color: #7a8a84;
}
</style>
