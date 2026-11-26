import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { typesIn } from '../src/new-note';
import { overrideOf, workspaceSchemaFolder } from '../src/schema-folder';
import { WorkspaceIndex } from '../src/workspace-index';
import { workspace } from './index.test';

const IDEA = '---\nschemas:\n  Idea: {}\n---\nIdeas.\n';

// @tg: verifies:: [[tests/vscode-extension#Creating notes#Schema folder from tg config]] {level: unit}
// @lat: [[tests/vscode-extension#Creating notes#Schema folder from tg config]]
// @tg: verifies:: [[openspec:typed-note-creation#Schema folder in VS Code#Config by default]]
it('reads the schema folder from .tg/config.json, again on every call, and Types/ without one', async () => {
  const dir = workspace({ '.tg/config.json': '{"notes": [], "schemaFolder": "Ontology"}', 'Ontology/Idea.md': IDEA });
  expect(workspaceSchemaFolder(dir, undefined)).toEqual({ folder: 'Ontology/', source: 'config', problem: null });
  // A blank setting is not an override.
  expect(workspaceSchemaFolder(dir, '  ')).toMatchObject({ folder: 'Ontology/', source: 'config' });
  const idx = new WorkspaceIndex({ workspace: dir, roots: ['.'], ignore: ['node_modules'] });
  await idx.load();
  expect(typesIn(idx, workspaceSchemaFolder(dir, undefined).folder).map((t) => t.type)).toEqual(['Idea']);

  writeFileSync(join(dir, '.tg/config.json'), '{"schemaFolder": "./Schemas/"}');
  expect(workspaceSchemaFolder(dir, undefined)).toMatchObject({ folder: 'Schemas/', source: 'config' });
  expect(workspaceSchemaFolder(workspace({}), undefined)).toEqual({ folder: 'Types/', source: 'default', problem: null });
});

// @tg: verifies:: [[tests/vscode-extension#Creating notes#Setting overrides the config]] {level: unit}
// @lat: [[tests/vscode-extension#Creating notes#Setting overrides the config]]
// @tg: verifies:: [[openspec:typed-note-creation#Schema folder in VS Code#Setting overrides]]
it('lets a typegraph.schemaFolder the user set override the config, and refuses values outside the workspace', () => {
  const dir = workspace({ '.tg/config.json': '{"schemaFolder": "Ontology"}' });
  expect(workspaceSchemaFolder(dir, 'Types')).toEqual({ folder: 'Types/', source: 'setting', problem: null });
  expect(workspaceSchemaFolder(dir, '../shared')).toEqual({ folder: 'Ontology/', source: 'config', problem: 'typegraph.schemaFolder must stay inside the project' });
  const broken = workspace({ '.tg/config.json': '{"schemaFolder": "/abs"}' });
  expect(workspaceSchemaFolder(broken, undefined)).toEqual({ folder: 'Types/', source: 'default', problem: '.tg/config.json: "schemaFolder" must be relative to the project root' });
  // The most specific scope the user set wins; the extension's own default is not an override.
  expect(overrideOf({ globalValue: 'A', workspaceValue: 'B', workspaceFolderValue: 'C' })).toBe('C');
  expect(overrideOf({ globalValue: 'A', workspaceValue: 'B' })).toBe('B');
  expect(overrideOf({ globalValue: 'A' })).toBe('A');
  expect(overrideOf({})).toBeUndefined();
  expect(overrideOf(undefined)).toBeUndefined();
});
