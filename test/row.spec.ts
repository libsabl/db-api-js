// Copyright 2022 Joshua Honig. All rights reserved.
// Use of this source code is governed by a MIT
// license that can be found in the LICENSE file.

import { Row } from '$';

const ASymbol = Symbol('ASymbol');

describe('fromObject', () => {
  it('wraps an object as a row', () => {
    const data = { a: 'b', c: 'D', e: 'f' };
    const row = Row.fromObject(data, ['a', 'c', 'e']);
    expect(row.a).toBe('b');
    expect(row.c).toBe('D');
    expect(row.e).toBe('f');

    expect(row[0]).toBe('b');
    expect(row[1]).toBe('D');
    expect(row[2]).toBe('f');
  });

  it('respects columns', () => {
    const data = {
      id: 11,
      label: 'Orange',
      description: 'Orange citrus fruit',
      code: 'orange',
      otherData: 'ignored',
      [ASymbol]: 12345,
    };
    const row = Row.fromObject(data, ['id', 'code', 'label', 'description']);

    // Returns in defined column order
    expect(Row.toArray(row)).toEqual([
      11,
      'orange',
      'Orange',
      'Orange citrus fruit',
    ]);

    // Only copies defined columns
    expect(Row.toObject(row)).toEqual({
      id: 11,
      label: 'Orange',
      description: 'Orange citrus fruit',
      code: 'orange',
    });

    // Only clones defined columns
    expect(Row.clone(row)).toEqual({
      id: 11,
      label: 'Orange',
      description: 'Orange citrus fruit',
      code: 'orange',
    });
  });
});

describe('fromArray', () => {
  it('wraps an array as a row', () => {
    const data = [11, 'orange', 'Orange', 'Orange citrus fruit', 'extra'];
    const row = Row.fromArray(data, ['id', 'code', 'label', 'description']);

    expect(row.id).toBe(11);
    expect(row.code).toBe('orange');
    expect(row.label).toBe('Orange');
    expect(row.description).toBe('Orange citrus fruit');

    expect(row[0]).toBe(11);
    expect(row[1]).toBe('orange');
    expect(row[2]).toBe('Orange');
    expect(row[3]).toBe('Orange citrus fruit');
  });

  it('respects columns', () => {
    const data = [11, 'orange', 'Orange', 'Orange citrus fruit', 'extra'];
    const row = Row.fromArray(data, ['id', 'code', 'label', 'description']);

    // Only defined columns
    expect(Row.toArray(row)).toEqual([
      11,
      'orange',
      'Orange',
      'Orange citrus fruit',
    ]);

    // Only copies defined columns
    expect(Row.toObject(row)).toEqual({
      id: 11,
      label: 'Orange',
      description: 'Orange citrus fruit',
      code: 'orange',
    });

    // Only clones defined columns
    expect(Row.clone(row)).toEqual([
      11,
      'orange',
      'Orange',
      'Orange citrus fruit',
    ]);
  });
});
