export interface ProjectState {
  rootPath: string;
  docs: DocFile[];
  languages: string[];
  validation: ProjectValidation;
}

export interface ProjectValidation {
  hasDocs: boolean;
  hasDocusaurusConfig: boolean;
  hasPackageJson: boolean;
  hasI18n: boolean;
  warnings: string[];
}

export interface DocFile {
  name: string;
  relativePath: string;
  absolutePath: string;
  extension: ".md" | ".mdx";
}

export interface TranslationBlock {
  key: string;
  origin: string;
  translate: string;
}

export interface LoadedDocument {
  projectRoot: string;
  language: string;
  relativePath: string;
  original: string;
  tomlPath: string;
  tomlExists: boolean;
  blocks: TranslationBlock[];
}

export interface RebuildResult {
  ok: boolean;
  output: string;
}

export interface SaveTranslationsPayload {
  projectRoot: string;
  language: string;
  relativePath: string;
  blocks: TranslationBlock[];
}

export interface RebuildPayload {
  projectRoot: string;
  language: string;
  relativePath: string;
}

export interface ApiError {
  message: string;
}
