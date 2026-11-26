import { configFolder, normalizeFolder, schemaFolderProblem } from '@obsigraph/core';

/** The tg CLI's committed project config, relative to the vault root. */
export const TG_CONFIG_PATH = '.tg/config.json';

/** How often the file is checked for changes while sync is on: Obsidian sends no vault events for dot folders. */
export const TG_CONFIG_POLL_MS = 3000;

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
  stat(path: string): Promise<{ mtime: number } | null>;
}

/**
 * Two-way sync of the plugin's schema folder with `schemaFolder` in `.tg/config.json`, so the plugin and the tg
 * CLI read the same folder: `pull` adopts the file's folder, `push` writes the setting into the file, and `poll`
 * pulls when the file changed on disk.
 */
// @tg: implements:: [[openspec:schema-notes#Schema folder from the project config]]
export class TgConfigSync {
  private mtime: number | null = null;

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
      const text = await this.adapter.read(TG_CONFIG_PATH);
      this.mtime = (await this.adapter.stat(TG_CONFIG_PATH))?.mtime ?? null;
      return text;
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
      this.mtime = (await this.adapter.stat(TG_CONFIG_PATH))?.mtime ?? null;
    } catch {
      // A read-only vault keeps the setting; the next change tries again.
    }
  }

  /** Pull when the file's modification time moved since it was last read or written. */
  async poll(): Promise<boolean> {
    let mtime: number | null = null;
    try {
      mtime = (await this.adapter.stat(TG_CONFIG_PATH))?.mtime ?? null;
    } catch {
      mtime = null;
    }
    if (mtime === null || mtime === this.mtime) return false;
    return this.pull();
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
