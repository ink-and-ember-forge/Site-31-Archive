import type { AuthorApi } from '../../src/shared/api';

declare global {
  interface Window {
    /** Provided by the preload script. */
    author: AuthorApi;
  }
}
export {};
