import { configFolder, normalizeFolder, schemaFolderProblem } from '@obsigraph/core';
import { TExternalFile, type TAbstractFile, type TFile, type Vault } from 'obsidian';

/** The tg CLI's committed project config, relative to the vault root. */
export const TG_CONFIG_PATH = '.tg/config.json';

/** The schema folder `.tg/config.json` names, with a trailing slash; null when the file names none or an unusable one. */
export function schemaFolderOf(text: string | null): string | null {
  if (text === null) return null;
  try {
    const v: unknown = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const folder = (v as { schemaFolder?: unknown }).schemaFolder;
    return typeof folder === 'string' && schemaFolderProblem(folder) === null ? normalizeFolder(configFolder(folder)) : null;
  } catch {
    return null;
  }
}

/** The config text with `schemaFolder` set to `folder`, keeping every other key; null when the existing text is not a JSON object. */
export function withSchemaFolder(text: string | null, folder: string): string | null {
  let obj: Record<string, unknown> = {};
  if (text !== null) {
    try {
      const v: unknown = JSON.parse(text);
      if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
      obj = v as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return `${JSON.stringify({ ...obj, schemaFolder: configFolder(folder) }, null, 2)}\n`;
}

/** The part of Obsidian's `DataAdapter` the sync uses; it reaches dot folders, which the vault API does not. */
export interface ConfigAdapter {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

/**
 * Two-way sync of the plugin's schema folder with `schemaFolder` in `.tg/config.json`, so the plugin and the tg
 * CLI read the same folder: `pull` adopts the file's folder and `push` writes the setting into the file.
 * {@link TgConfigWatch} says when the file changed.
 */
// @tg: implements:: [[openspec:schema-notes#Schema folder from the project config]]
export class TgConfigSync {
  constructor(
    private readonly adapter: ConfigAdapter,
    private readonly getFolder: () => string,
    private readonly setFolder: (folder: string) => Promise<void>,
  ) {}

  exists(): Promise<boolean> {
    return this.adapter.exists(TG_CONFIG_PATH);
  }

  private async read(): Promise<string | null> {
    try {
      if (!(await this.adapter.exists(TG_CONFIG_PATH))) return null;
      return await this.adapter.read(TG_CONFIG_PATH);
    } catch {
      return null;
    }
  }

  /** The folder the file names, or null when there is no file or it names none. */
  async folder(): Promise<string | null> {
    return schemaFolderOf(await this.read());
  }

  /** Adopt the file's schema folder when it names one that differs from the setting; true when the setting changed. */
  async pull(): Promise<boolean> {
    const folder = await this.folder();
    if (folder === null || folder === normalizeFolder(this.getFolder())) return false;
    await this.setFolder(folder);
    return true;
  }

  /** Write the setting's folder into the file, keeping its other keys; nothing is written when the file already says so. */
  async push(): Promise<void> {
    const current = this.getFolder();
    if (schemaFolderProblem(current) !== null) return;
    const text = await this.read();
    if (schemaFolderOf(text) === normalizeFolder(configFolder(current))) return;
    const next = withSchemaFolder(text, current);
    // A file that is not a JSON object belongs to someone; it is left as it is.
    if (next === null) return;
    try {
      if (!(await this.adapter.exists('.tg'))) await this.adapter.mkdir('.tg');
      await this.adapter.write(TG_CONFIG_PATH, next);
    } catch {
      // A read-only vault keeps the setting; the next change tries again.
    }
  }
}

/**
 * Change monitoring for `.tg/config.json`. Obsidian does not index dot folders, so `Vault.getFileByPath` returns a
 * `TExternalFile` for it, which reports external changes as vault `modify` events only while it has a user. The
 * watch is that user, keyed by `user`, from `start` until `stop`.
 */
// @tg: implements:: [[openspec:schema-notes#Schema folder from the project config]]
export class TgConfigWatch {
  private file: TFile | null = null;

  constructor(
    private readonly vault: Pick<Vault, 'getFileByPath'>,
    private readonly user: unknown,
  ) {}

  /** Start monitoring the file when it exists and is not monitored yet; true while it is monitored. */
  start(): boolean {
    if (this.file) return true;
    const file = this.vault.getFileByPath(TG_CONFIG_PATH);
    if (!file) return false;
    // `TExternalFile` is missing from Obsidian versions before it, where `instanceof` would throw.
    typeof TExternalFile === 'function' && file instanceof TExternalFile && file.addUser(this.user);
    this.file = file;
    return true;
  }

  /** Stop monitoring; the last user's release also clears Obsidian's cached data for the file. */
  stop(): void {
    const file = this.file;
    if (!file) return;
    this.file = null;
    typeof TExternalFile === 'function' && file instanceof TExternalFile && file.removeUser(this.user);
  }

  /** True for a vault `modify` event about `.tg/config.json`. */
  matches(file: TAbstractFile): boolean {
    return file.path === TG_CONFIG_PATH;
  }
}

/**
 * Settings just loaded: a new configuration (`isNew`, no saved data yet) turns sync on when the vault has a
 * `.tg/config.json`, and with sync on the file's schema folder replaces the setting.
 */
// @tg: implements:: [[openspec:schema-notes#Schema folder from the project config]]
export async function syncOnLoad(settings: { syncTgConfig: boolean }, isNew: boolean, sync: Pick<TgConfigSync, 'exists' | 'pull'>): Promise<void> {
  if (isNew) settings.syncTgConfig = await sync.exists().catch(() => false);
  if (settings.syncTgConfig) await sync.pull();
}
