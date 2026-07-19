/// <reference types="vite/client" />

import type { I18nToolkitApi } from "../preload/preload";

declare global {
  const __VERSION__: string;
  const __GIT_COMMIT__: string;

  interface Window {
    i18nToolkit: I18nToolkitApi;
  }
}
