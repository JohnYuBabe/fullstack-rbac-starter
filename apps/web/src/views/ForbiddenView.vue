<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <div class="forbidden">
    <div class="code">403</div>
    <h1>这个页面需要更高的权限</h1>
    <p>
      路由守卫在进入页面前检查了权限。就算绕过菜单直接输入地址，也会停在这里——
      服务端对同一个地址的接口仍然会返回 403。
    </p>
    <div class="actions">
      <el-button type="primary" @click="router.push('/')">回到概览</el-button>
      <el-button @click="router.back()">返回上一页</el-button>
    </div>
  </div>
</template>

<style scoped>
.forbidden {
  max-width: 560px;
  margin: 64px auto;
  padding: 40px 36px;
  background: #fff;
  border: 1px solid #dfe7e3;
  border-radius: 16px;
  text-align: center;
}

.code {
  font-size: 56px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.08em;
  color: #1d8b78;
  font-variant-numeric: tabular-nums;
}

h1 {
  margin: 18px 0 12px;
  font-size: 20px;
  color: #14201d;
}

p {
  margin: 0 auto 26px;
  max-width: 420px;
  font-size: 13.5px;
  line-height: 1.9;
  color: #5d6d67;
}

.actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}
</style>
