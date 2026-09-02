import type { TranslationBlock } from "./types.js";

export const TRANSLATION_KEY_LENGTH = 16;

/**
 * Translation TOML keys are the first 16 hexadecimal characters of a SHA-256
 * digest. Accepting a longer stored digest here keeps reference lookup
 * compatible with files that contain the full digest.
 */
export function sha256KeyPrefix(key: string) {
  return key.trim().toLowerCase().slice(0, TRANSLATION_KEY_LENGTH);
}

export function findTranslationBlockByKey(
  blocks: TranslationBlock[],
  key: string,
) {
  const targetKey = sha256KeyPrefix(key);
  if (!targetKey) {
    return undefined;
  }

  return blocks.find((block) => sha256KeyPrefix(block.key) === targetKey);
}
