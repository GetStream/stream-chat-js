import { describe, expect, it } from 'vitest';
import {
  CONSTRUCTION_ONLY_CONFIG_PATHS,
  INSTANCE_CONFIG_TREE_KEYS,
} from '../../../src/configuration/keys';
import {
  flattenConfigShape,
  INSTANCE_CONFIG_TREE_SHAPE,
} from '../../../src/configuration/shape';
import type { ConfigNode } from '../../../src/configuration/shape';

/**
 * `INSTANCE_CONFIG_TREE_SHAPE` is the answer to "what can I configure?" for every caller that cannot read
 * the TypeScript types at the moment they need to — a settings UI, a JavaScript caller, a docs generator.
 * That makes it useful exactly as long as it is complete and accurate.
 *
 * Completeness *within* a configuration type is already the compiler's job: each level is annotated
 * `Record<keyof SomeConfigType, ConfigNode>`, so a new field fails the build until it is described. These
 * tests cover what the annotations cannot see — that the shape's top level tracks the tree's key list,
 * that every node is actually usable by a caller, and that it agrees with the other runtime table
 * describing the same paths.
 */
describe('configuration tree shape', () => {
  const allNodes = flattenConfigShape();

  it('describes exactly the keys of the configuration tree', () => {
    // The `Record<keyof InstanceConfigTree, …>` annotation already forbids a missing or unknown key at
    // compile time. This is the runtime half: `INSTANCE_CONFIG_TREE_KEYS` is derived separately, and two
    // derivations of the same truth are worth pinning to each other.
    expect(Object.keys(INSTANCE_CONFIG_TREE_SHAPE).sort()).toEqual(
      [...INSTANCE_CONFIG_TREE_KEYS].sort(),
    );
  });

  it('describes `thread`, which no curated feature list remembered to include', () => {
    // Named explicitly because this is the defect that prompted the shape: the example app's settings UI
    // maintained its own list of what to show, and `thread` was simply absent from it. Anything reading
    // the shape gets the key whether or not a Thread has ever been constructed.
    expect(Object.keys(INSTANCE_CONFIG_TREE_SHAPE.thread.fields).sort()).toEqual([
      'messageOperations',
      'messagePaginator',
      'requestHandlers',
    ]);
    expect(INSTANCE_CONFIG_TREE_SHAPE.thread.fields.messagePaginator).toMatchObject<
      Partial<ConfigNode>
    >({ kind: 'group' });
  });

  it.each(allNodes)('$path is usable by a caller reading it', ({ node, path }) => {
    // A node without a description is a path a UI can render but nobody can understand — the same
    // dead end as not describing it at all, so an empty string is a failure rather than a gap.
    expect(node.description.trim().length, `${path} has no description`).toBeGreaterThan(
      0,
    );

    if (node.kind === 'group') {
      expect(
        Object.keys(node.fields).length,
        `${path} is an empty group`,
      ).toBeGreaterThan(0);
      return;
    }

    if (node.type === 'enum') {
      expect(
        node.enumValues?.length,
        `${path} is an enum with no values`,
      ).toBeGreaterThan(0);
    } else {
      // `enumValues` on a non-enum would be rendered as a choice list for a free value.
      expect(
        node.enumValues,
        `${path} is not an enum but lists enumValues`,
      ).toBeUndefined();
    }
  });

  it('agrees with the construction-only paths table', () => {
    // Two runtime tables describe the same paths from different angles: the shape says what exists, this
    // one says which of those are read only at construction. A path listed in one and absent from the
    // other means one of them is stale, and the UI would either warn about a path it cannot show or show
    // a path without the warning that makes it comprehensible.
    const described = new Set(allNodes.map(({ path }) => path));
    const missing: string[] = [];

    for (const [key, paths] of Object.entries(CONSTRUCTION_ONLY_CONFIG_PATHS)) {
      for (const path of paths) {
        if (!described.has(`${key}.${path}`)) missing.push(`${key}.${path}`);
      }
    }

    expect(missing).toEqual([]);
  });

  describe('flattenConfigShape', () => {
    it('reaches leaves under nested groups, not just the top level', () => {
      const paths = allNodes.map(({ path }) => path);

      expect(paths).toContain('thread.messagePaginator.pageSize');
      expect(paths).toContain('messageComposer.location.minShareDurationMs');
      expect(paths).toContain('client.threads.connectionRecoveryThrottleMs');
      // The shared keys carry the same fields as their per-parent overrides — both are real places to
      // write, so both are listed rather than the shared one being treated as an alias.
      expect(paths).toContain('messagePaginator.pageSize');
      expect(paths).toContain('channel.messagePaginator.pageSize');
    });

    it('emits every path once, sorted, so callers can diff two runs', () => {
      const paths = allNodes.map(({ path }) => path);

      expect(new Set(paths).size).toBe(paths.length);
      // Sorted per level rather than globally: a group is emitted before its own children, so a plain
      // sort of the whole list would not match.
      const topLevel = paths.filter((path) => !path.includes('.'));
      expect(topLevel).toEqual([...topLevel].sort());
    });

    it('descends into a subtree when given one', () => {
      const paths = flattenConfigShape(INSTANCE_CONFIG_TREE_SHAPE.client.fields).map(
        ({ path }) => path,
      );

      expect(paths).toContain('reminders.scheduledOffsetsMs');
      expect(paths).not.toContain('client.reminders.scheduledOffsetsMs');
    });
  });

  it('marks values the declarative tree cannot carry', () => {
    // JSON has no functions (**DV-1**), so these paths exist but are reachable only through a setup
    // function. A UI that does not distinguish them offers an edit box that silently does nothing.
    const functions = allNodes
      .filter(({ node }) => node.kind === 'value' && node.type === 'function')
      .map(({ path }) => path);

    expect(functions).toContain('channel.requestHandlers');
    expect(functions).toContain('messageComposer.attachments.fileUploadFilter');
    expect(functions).toContain('client.notifications.sortComparator');
  });
});
