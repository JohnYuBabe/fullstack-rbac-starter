/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASE?: string;
  readonly VITE_API_BASE?: string;
  readonly VITE_DEMO_ADMIN_EMAIL?: string;
  readonly VITE_DEMO_ADMIN_PASSWORD?: string;
  readonly VITE_DEMO_EDITOR_EMAIL?: string;
  readonly VITE_DEMO_EDITOR_PASSWORD?: string;
  readonly VITE_DEMO_VIEWER_EMAIL?: string;
  readonly VITE_DEMO_VIEWER_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
