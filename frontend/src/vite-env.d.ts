/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Адрес API трекера, например /api. Без него данные хранятся в браузере. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
