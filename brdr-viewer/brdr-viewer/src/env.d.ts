/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BRDR_API_BASE_URL?: string;
  readonly VITE_BRDR_ALLOWED_HOST_ORIGINS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
