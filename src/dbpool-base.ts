// Copyright 2022 Joshua Honig. All rights reserved.
// Use of this source code is governed by a MIT
// license that can be found in the LICENSE file.

import { StorageKind, StorageMode } from '@sabl/storage-pool';
import {
  AsyncFactory,
  AsyncPool,
  createPool,
  PoolOptions,
  PoolStats,
} from '@sabl/async';
import { QueueConn } from './queue-conn';

// Type-only imports:
import type { IContext } from '@sabl/context';
import type { TxnOptions } from '@sabl/txn';
import type { Row } from './row';
import type { DbConn, DbPool, DbTxn, Result, Rows } from './types';
import type { DriverConn } from './driver';

const defaultOptions: PoolOptions = {
  parallelCreate: true,
  maxOpenCount: 32,
  maxIdleCount: 16,
  maxIdleTime: 300_000,
  maxLifetime: -1,
};

/**
 * A default implementation of DbPool that uses an underlying {@link AsyncPool}
 * and wraps {@link DriverConn} instances from the pool with {@link QueueConn}
 */
export class DbPoolBase implements DbPool {
  readonly #pool: AsyncPool<DriverConn>;
  readonly #live: QueueConn[] = [];
  #nextId = 1;

  /** Default PoolOptions used for any new DbPool */
  static get defaultOptions(): PoolOptions {
    return defaultOptions;
  }

  constructor(factory: AsyncFactory<DriverConn>, opts?: PoolOptions) {
    const resolvedOptions = Object.assign({}, defaultOptions, opts || {});
    this.#pool = createPool(factory, resolvedOptions);
  }

  get mode(): StorageMode {
    return StorageMode.pool;
  }

  get kind(): string {
    return StorageKind.rdb;
  }

  stats(): PoolStats {
    return this.#pool.stats();
  }

  setOptions(opts: PoolOptions): void {
    this.#pool.setOptions(opts);
  }

  conn(ctx: IContext): Promise<DbConn> {
    return this.#conn(ctx, true);
  }

  async exec(
    ctx: IContext,
    sql: string,
    ...params: unknown[]
  ): Promise<Result> {
    const con = await this.#conn(ctx, false);
    return con.exec(ctx, sql, ...params);
  }

  async queryRow(
    ctx: IContext,
    sql: string,
    ...params: unknown[]
  ): Promise<Row | null> {
    const con = await this.#conn(ctx, false);
    return con.queryRow(ctx, sql, ...params);
  }

  async query(ctx: IContext, sql: string, ...params: unknown[]): Promise<Rows> {
    const con = await this.#conn(ctx, false);
    return con.query(ctx, sql, ...params);
  }

  async beginTxn(ctx: IContext, opts?: TxnOptions | undefined): Promise<DbTxn> {
    const con = await this.#conn(ctx, false);
    return con.beginTxn(ctx, opts);
  }

  async close(): Promise<void> {
    // Prevent any further connections
    const pClose = this.#pool.close();

    // Close any live connections
    for (const qc of this.#live) {
      qc.close();
    }

    // Return the promise that resolves
    // when all connections have been released
    return pClose;
  }

  async #conn(ctx: IContext, keepOpen: boolean): Promise<DbConn> {
    const driverCon = await this.#pool.get(ctx);
    const id = this.#nextId++;
    const qc = new QueueConn(driverCon, keepOpen);

    const live = this.#live;
    const pool = this.#pool;

    live[id] = qc;

    qc.on('complete', () => {
      delete live[id];
      pool.release(driverCon);
    });

    return qc;
  }
}
