import { describe, test, expect } from 'bun:test';
import { encodePathSegment } from '../src/api.ts';

describe('encodePathSegment', () => {
  test('encodes special characters but preserves forward slashes', () => {
    expect(encodePathSegment('my project')).toBe('my%20project');
    expect(encodePathSegment('path/to/thing')).toBe('path/to/thing');
    expect(encodePathSegment('name with spaces/and/slashes')).toBe('name%20with%20spaces/and/slashes');
  });

  test('encodes other URI-unsafe characters', () => {
    expect(encodePathSegment('foo#bar')).toBe('foo%23bar');
    expect(encodePathSegment('a&b=c')).toBe('a%26b%3Dc');
  });

  test('leaves simple strings unchanged', () => {
    expect(encodePathSegment('simple')).toBe('simple');
  });
});
