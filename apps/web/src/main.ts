import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { ElLoading } from 'element-plus';
import App from './App.vue';
import router from './router';
import { permissionDirective } from './directives/permission';
import 'element-plus/es/components/message/style/css';
import 'element-plus/es/components/message-box/style/css';
import './styles/main.css';

const app = createApp(App);

app.use(createPinia());
app.use(router);
// v-loading 是按需引入的指令，AutoImport 不会替它注册，需要显式装一次
app.use(ElLoading);
app.directive('permission', permissionDirective);

app.mount('#app');
