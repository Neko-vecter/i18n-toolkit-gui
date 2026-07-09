/// <reference types="vite/client" />

import type { I18nToolkitApi } from "../preload/preload";

declare global {
  interface Window {
    i18nToolkit: I18nToolkitApi;
  }
}
