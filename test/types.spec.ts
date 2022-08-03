// Copyright 2022 Joshua Honig. All rights reserved.
// Use of this source code is governed by a MIT
// license that can be found in the LICENSE file.

import { NamedParam, toParamArray } from '$';

describe('NamedParam', () => {
  it('creates a read-only name-value pair', () => {
    const p = new NamedParam('a', 'value');
    expect(p.name).toBe('a');
    expect(p.value).toBe('value');
  });
});

describe('toParamArray', () => {
  it('creates an array of NamedParams', () => {
    const data = {
      id: 11,
      code: 'foo',
      label: 'Bar',
    };
    const params = toParamArray(data);
    expect(params).toEqual([
      { name: 'id', value: 11 },
      { name: 'code', value: 'foo' },
      { name: 'label', value: 'Bar' },
    ]);
  });

  it('returns empty array for null input', () => {
    expect(toParamArray(null!)).toEqual([]);
  });
});
