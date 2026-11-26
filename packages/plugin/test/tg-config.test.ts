import { describe, expect, it, vi } from 'vitest';
import { schemaFolderOf, syncOnLoad, TG_CONFIG_PATH, TgConfigSync, withSchemaFolder, type ConfigAdapter } from '../src/tg-config';

vi.mock('obsidian', () => ({ App: class App {}, PluginSettingTab: class PluginSettingTab {}, Setting: class Setting {} }));

/** An in-memory vault adapter: `touch` bumps a file's modification time as an outside edit would. */
function memory(files: Record<string, string> = {}) {
  const data = new Map(Object.entries(files));
  const mtimes = new Map([...data.keys()].map((k) => [k, 1]));
  let clock = 1;
  const adapter: ConfigAdapter = {
    exists: async (p) => data.has(p) || [...data.keys()].some((k) => k.startsWith(`${p}/`)),
    read: async (p) => {
      const t = data.get(p);
      if (t === undefined) throw new Error(`no ${p}`);
      return t;
    },
    write: async (p, d) => {
      data.set(p, d);
      mtimes.set(p, ++clock);
    },
    mkdir: async () => {},
    stat: async (p) => (data.has(p) ? { mtime: mtimes.get(p)! } : null),
  };
  const touch = (p: string, text: string) => {
    data.set(p, text);
    mtimes.set(p, ++clock);
  };
  return { adapter, data, touch };
}

function sync(files: Record<string, string>, folder = 'Types/') {
  const vault = memory(files);
  const settings = { schemaFolder: folder, syncTgConfig: false };
  const setFolder = vi.fn(async (f: string) => void (settings.schemaFolder = f));
  return { ...vault, settings, setFolder, s: new TgConfigSync(vault.adapter, () => settings.schemaFolder, setFolder) };
}

describe('tg config sync', () => {
  // @tg: verifies:: [[tests/schema-notes#Schema folder from tg config#Config file values]] {level: unit}
  it('reads a usable schemaFolder and merges a new one keeping other keys', () => {
    expect(schemaFolderOf('{"schemaFolder": "Ontology"}')).toBe('Ontology/');
    expect(schemaFolderOf('{"schemaFolder": "./docs/types/"}')).toBe('docs/types/');
    expect(schemaFolderOf('{"schemaFolder": "../up"}')).toBeNull();
    expect(schemaFolderOf('{"notes": []}')).toBeNull();
    expect(schemaFolderOf('not json')).toBeNull();
    expect(schemaFolderOf(null)).toBeNull();
    expect(JSON.parse(withSchemaFolder('{"notes": ["a/**/*.adoc"]}', 'Ontology/')!)).toEqual({ notes: ['a/**/*.adoc'], schemaFolder: 'Ontology' });
    expect(withSchemaFolder('[1]', 'Ontology/')).toBeNull();
  });

  // @tg: verifies:: [[tests/schema-notes#Schema folder from tg config#New configuration follows the file]] {level: unit}
  // @tg: verifies:: [[openspec:schema-notes#Schema folder from the project config#New configuration]]
  it('turns sync on for a new configuration when the vault has the file, and starts from its folder', async () => {
    const withFile = sync({ [TG_CONFIG_PATH]: '{"schemaFolder": "Ontology"}' });
    await syncOnLoad(withFile.settings, true, withFile.s);
    expect(withFile.settings).toEqual({ schemaFolder: 'Ontology/', syncTgConfig: true });

    const without = sync({});
    await syncOnLoad(without.settings, true, without.s);
    expect(without.settings).toEqual({ schemaFolder: 'Types/', syncTgConfig: false });

    // A saved configuration keeps its own choice: off stays off, even with the file there.
    const saved = sync({ [TG_CONFIG_PATH]: '{"schemaFolder": "Ontology"}' });
    await syncOnLoad(saved.settings, false, saved.s);
    expect(saved.settings).toEqual({ schemaFolder: 'Types/', syncTgConfig: false });
  });

  // @tg: verifies:: [[tests/schema-notes#Schema folder from tg config#Setting change writes the file]] {level: unit}
  // @tg: verifies:: [[openspec:schema-notes#Schema folder from the project config#Two-way sync]]
  it('writes the setting into the file, keeping other keys, and writes nothing when the file already agrees', async () => {
    const { s, data, settings, adapter } = sync({ [TG_CONFIG_PATH]: '{\n  "notes": ["book/**/*.adoc"]\n}\n' }, 'Ontology/');
    await s.push();
    expect(JSON.parse(data.get(TG_CONFIG_PATH)!)).toEqual({ notes: ['book/**/*.adoc'], schemaFolder: 'Ontology' });
    const write = vi.spyOn(adapter, 'write');
    await s.push();
    expect(write).not.toHaveBeenCalled();
    settings.schemaFolder = 'Schemas/';
    await s.push();
    expect(JSON.parse(data.get(TG_CONFIG_PATH)!).schemaFolder).toBe('Schemas');

    // No file yet: one is created. A file that is not a JSON object is left alone.
    const fresh = sync({}, 'Ontology/');
    await fresh.s.push();
    expect(JSON.parse(fresh.data.get(TG_CONFIG_PATH)!)).toEqual({ schemaFolder: 'Ontology' });
    const broken = sync({ [TG_CONFIG_PATH]: 'oops' }, 'Ontology/');
    await broken.s.push();
    expect(broken.data.get(TG_CONFIG_PATH)).toBe('oops');
  });

  // @tg: verifies:: [[tests/schema-notes#Schema folder from tg config#File change updates the setting]] {level: unit}
  // @tg: verifies:: [[openspec:schema-notes#Schema folder from the project config#Two-way sync]]
  it('adopts an outside edit of the file when polled, and only once', async () => {
    const { s, touch, settings, setFolder } = sync({ [TG_CONFIG_PATH]: '{"schemaFolder": "Types"}' });
    expect(await s.pull()).toBe(false);
    expect(await s.poll()).toBe(false);
    touch(TG_CONFIG_PATH, '{"schemaFolder": "Ontology"}');
    expect(await s.poll()).toBe(true);
    expect(settings.schemaFolder).toBe('Ontology/');
    expect(await s.poll()).toBe(false);
    expect(setFolder).toHaveBeenCalledTimes(1);
    // Its own write is not mistaken for an outside edit.
    settings.schemaFolder = 'Schemas/';
    await s.push();
    expect(await s.poll()).toBe(false);
  });
});

describe('settings tab', () => {
  // @tg: verifies:: [[tests/schema-notes#Schema folder from tg config#Sync toggle in the settings]] {level: unit}
  it('offers "Sync .tg/config.json" beside the schema folder, off by default, and routes it through the plugin', async () => {
    const { ObsigraphSettingTab, DEFAULT_SETTINGS } = await import('../src/settings');
    const plugin = {
      settings: { ...DEFAULT_SETTINGS },
      saveSettings: vi.fn(async () => {}),
      setTgConfigSync: vi.fn(async () => {}),
      index: { invalidate: vi.fn() },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = new ObsigraphSettingTab({} as any, plugin as any);
    const items = t.getSettingDefinitions().flatMap((g) => ('items' in g ? g.items : [g]));
    const names = items.map((i) => (i && 'name' in i ? i.name : ''));
    expect(names.indexOf('Sync .tg/config.json')).toBe(names.indexOf('Schema folder') + 1);
    expect(items[names.indexOf('Sync .tg/config.json')]).toMatchObject({ control: { type: 'toggle', key: 'syncTgConfig' } });
    expect(DEFAULT_SETTINGS.syncTgConfig).toBe(false);
    await t.setControlValue('syncTgConfig', true);
    expect(plugin.setTgConfigSync).toHaveBeenCalledWith(true);
    expect(plugin.saveSettings).not.toHaveBeenCalled();
  });
});
