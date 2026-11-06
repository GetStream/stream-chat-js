import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CORE_NOTIFICATION_TYPE,
  isPollComposerValidationError,
  POLL_COMPOSER_VALIDATION_CODE,
  pollComposerValidationError,
} from '../../../src';
import type {
  CoreNotificationType,
  PollComposerValidationCode,
  PollComposerValidationError,
} from '../../../src';

const SRC = join(__dirname, '../../../src');

/** Generated OpenAPI models and the offline-support error taxonomy are out of scope. */
const EXCLUDED_DIRS = ['gen', 'offline-support'];

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return EXCLUDED_DIRS.includes(entry) ? [] : sourceFiles(full);
    }
    return entry.endsWith('.ts') ? [full] : [];
  });

const files = sourceFiles(SRC).map((path) => ({
  path: relative(SRC, path),
  contents: readFileSync(path, 'utf8'),
}));

const allSource = files.map((f) => f.contents).join('\n');

describe('CORE_NOTIFICATION_TYPE', () => {
  it('is exported from the public barrel with its type', () => {
    const value: CoreNotificationType = CORE_NOTIFICATION_TYPE.pollCreateFailed;
    expect(value).toBe('api:poll:create:failed');
  });

  it('follows the domain:entity:operation:result convention', () => {
    for (const [key, type] of Object.entries(CORE_NOTIFICATION_TYPE)) {
      expect(type, `${key} must have 3 or 4 colon-separated segments`).toMatch(
        /^[a-z]+(:[a-zA-Z][\w-]*){2,3}$/,
      );
    }
  });

  it('has no duplicate identifiers', () => {
    const values = Object.values(CORE_NOTIFICATION_TYPE);
    expect(new Set(values).size).toBe(values.length);
  });

  /**
   * Guards against a dead identifier: one that UI SDKs still carry a translation for while nothing
   * emits it any more. That is how both UI SDKs ended up with entries for types no SDK emits.
   */
  it('emits every identifier it declares', () => {
    const unused = Object.keys(CORE_NOTIFICATION_TYPE).filter(
      (key) => !allSource.includes(`CORE_NOTIFICATION_TYPE.${key}`),
    );
    expect(unused, 'declared but never emitted — remove it or emit it').toEqual([]);
  });

  /**
   * Guards against the bypass: a raw string literal at a call site is invisible to the union, so it
   * cannot be renamed safely and a typo never fails the build.
   */
  it('is the only source of notification type literals in src/', () => {
    const offenders = files.flatMap(({ path, contents }) =>
      contents
        .split('\n')
        .map((line, i) => ({ line, lineNumber: i + 1 }))
        .filter(({ line }) => /\btype:\s*'[a-z]+:[a-zA-Z][\w-]*:/.test(line))
        .map(({ line, lineNumber }) => `${path}:${lineNumber} ${line.trim()}`),
    );
    expect(offenders, 'use CORE_NOTIFICATION_TYPE.<key> instead of a literal').toEqual(
      [],
    );
  });
});

describe('POLL_COMPOSER_VALIDATION_CODE', () => {
  it('is exported from the public barrel with its type and helpers', () => {
    const code: PollComposerValidationCode = POLL_COMPOSER_VALIDATION_CODE.nameRequired;
    const error: PollComposerValidationError = pollComposerValidationError(code);
    expect(error).toEqual({ code, message: 'Question is required' });
    expect(isPollComposerValidationError(error)).toBe(true);
  });

  it('follows the same convention and has no duplicates', () => {
    const values = Object.values(POLL_COMPOSER_VALIDATION_CODE);
    expect(new Set(values).size).toBe(values.length);
    for (const [key, code] of Object.entries(POLL_COMPOSER_VALIDATION_CODE)) {
      expect(code, `${key} must be validation:poll:<field>:<result>`).toMatch(
        /^validation:poll:[a-zA-Z][\w-]*:[a-zA-Z][\w-]*$/,
      );
    }
  });

  it('pairs every code with a non-empty English fallback', () => {
    for (const code of Object.values(POLL_COMPOSER_VALIDATION_CODE)) {
      expect(
        pollComposerValidationError(code).message,
        `${code} has no fallback`,
      ).toBeTruthy();
    }
  });

  it('emits every code it declares', () => {
    const unused = Object.keys(POLL_COMPOSER_VALIDATION_CODE).filter(
      (key) => !allSource.includes(`POLL_COMPOSER_VALIDATION_CODE.${key}`),
    );
    expect(unused, 'declared but never emitted').toEqual([]);
  });

  it('attaches metadata only when supplied', () => {
    expect(
      pollComposerValidationError(POLL_COMPOSER_VALIDATION_CODE.optionEmpty),
    ).not.toHaveProperty('metadata');
    expect(
      pollComposerValidationError(POLL_COMPOSER_VALIDATION_CODE.optionEmpty, {
        optionId: 'a',
      }).metadata,
    ).toEqual({ optionId: 'a' });
  });

  it('rejects non-errors in the narrowing guard', () => {
    expect(isPollComposerValidationError(undefined)).toBe(false);
    expect(isPollComposerValidationError('Option is empty')).toBe(false);
    // an `options` error record, which is the other shape a field error can take
    expect(
      isPollComposerValidationError({
        'option-1': pollComposerValidationError(
          POLL_COMPOSER_VALIDATION_CODE.optionEmpty,
        ),
      }),
    ).toBe(false);
  });
});
