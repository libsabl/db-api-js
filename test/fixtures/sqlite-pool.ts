// Copyright 2022 Joshua Honig. All rights reserved.
// Use of this source code is governed by a MIT
// license that can be found in the LICENSE file.

import { DbPoolBase, DriverConn } from '$';
import { AsyncFactory } from '@sabl/async';

class SqliteFactory implements AsyncFactory<DriverConn> {
  readonly #filename;

  create(): Promise<DriverConn> {
    throw new Error('Method not implemented.');
  }
  destroy(item: DriverConn): Promise<void> {
    throw new Error('Method not implemented.');
  }
}

export class SqlitePool extends DbPoolBase {
  constructor() {
    super({}, {});
  }
}
