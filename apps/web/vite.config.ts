import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';

export default defineConfig(({ mode }) => {
  // 全仓只有根目录一份 .env：服务端 ConfigModule 读 ../../.env，
  // 前端同源读取，避免「部署时按文档改了根 .env，构建却没生效」。
  const rootDir = fileURLToPath(new URL('../..', import.meta.url));
  const env = loadEnv(mode, rootDir, '');

  return {
    base: env.VITE_BASE || '/',
    envDir: rootDir,
    plugins: [
      vue(),
      AutoImport({
        resolvers: [ElementPlusResolver()],
        dts: 'src/auto-imports.d.ts',
      }),
      Components({
        resolvers: [ElementPlusResolver()],
        dts: 'src/components.d.ts',
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    optimizeDeps: {
      include: ['@rbac/shared'],
    },
    build: {
      commonjsOptions: {
        include: [/node_modules/, /packages\/shared\//],
      },
    },
    server: {
      // 与同机 console 的 5173 错开
      port: 5174,
      proxy: {
        '/api': {
          target: 'http://localhost:3020',
          changeOrigin: true,
        },
      },
    },
  };
});
