// Copyright 2022 Joshua Honig. All rights reserved.
// Use of this source code is governed by a MIT
// license that can be found in the LICENSE file.

import EventEmitter from 'events';
import { StorageKind, StorageMode } from '@sabl/storage-pool';
import { FnResolve, CallbackPromise, promise, isCanceled } from '@sabl/async';

// Type-only imports:
import type { IContext } from '@sabl/context';
import type { TxnOptions } from '@sabl/txn';
import type { CompleteEmitter, DbConn, DbTxn, Result, Rows } from './types';
import type { Row } from './row';
import type { DriverConn } from './driver';

interface ConnOpBase {
  ctx: IContext;
  reject(reason: unknown): void;
}

interface BeginTxnOperation extends ConnOpBase {
  type: 'beginTxn';
  opts: TxnOptions | undefined;
  resolve(txn: DbTxn): void;
}

interface SqlOperationBase extends ConnOpBase {
  sql: string;
  params: unknown[];
}

interface QueryOperation extends SqlOperationBase {
  type: 'query';
  resolve(rows: Rows): void;
}

interface QueryRowOperation extends SqlOperationBase {
  type: 'queryRow';
  resolve(row: Row | null): void;
}

interface ExecOperation extends SqlOperationBase {
  type: 'exec';
  resolve(result: Result): void;
}

type ConnOperation =
  | BeginTxnOperation
  | QueryOperation
  | QueryRowOperation
  | ExecOperation;

/**
 * A generic implementation of a database connection wrapper that
 * implements DbConn. Handles queueing, resolution, and cancellation
 * for all DbConn actions.
 */
export class QueueConn
  extends EventEmitter
  implements DbConn, CompleteEmitter<DbConn>
{
  readonly #keepOpen: boolean;
  #con: DriverConn;

  #closed = false;
  #closing = false;
  #busy = false;
  #waitClose: CallbackPromise<void> | null = null;

  readonly #opQueue: ConnOperation[] = [];

  /** Check the size of the queue of a {@link QueueConn} */
  static size(con: QueueConn): number {
    return con.#opQueue.length;
  }

  constructor(con: DriverConn, keepOpen: boolean) {
    super();
    this.#keepOpen = keepOpen;
    this.#con = con;
  }

  get mode(): StorageMode {
    return StorageMode.conn;
  }

  get kind(): string {
    return StorageKind.rdb;
  }

  #checkStatus() {
    if (this.#closed) {
      throw new Error('Connection is already closed');
    }
  }

  close(): Promise<void> {
    if (this.#closed) {
      return Promise.resolve();
    }
    if (this.#closing) {
      return this.#waitClose!;
    }
    this.#closing = true;

    // First create the promise
    const wc = (this.#waitClose = promise<void>());

    // Now flush / check the queue,
    // which resolve and clear #waitClose
    this.#start();

    // Return the promise
    return wc;
  }

  exec(ctx: IContext, sql: string, ...params: unknown[]): Promise<Result> {
    this.#checkStatus();

    const ph = promise<Result>(ctx);
    return this.#enqueue(ph, {
      type: 'exec',
      ctx,
      sql,
      params,
      resolve: ph.resolve,
      reject: ph.reject,
    });
  }

  queryRow(
    ctx: IContext,
    sql: string,
    ...params: unknown[]
  ): Promise<Row | null> {
    this.#checkStatus();

    const ph = promise<Row | null>(ctx);
    return this.#enqueue(ph, {
      type: 'queryRow',
      ctx,
      sql,
      params,
      resolve: ph.resolve,
      reject: ph.reject,
    });
  }

  query(ctx: IContext, sql: string, ...params: unknown[]): Promise<Rows> {
    this.#checkStatus();

    const ph = promise<Rows>(ctx);
    return this.#enqueue(ph, {
      type: 'query',
      ctx,
      sql,
      params,
      resolve: ph.resolve,
      reject: ph.reject,
    });
  }

  beginTxn(ctx: IContext, opts?: TxnOptions | undefined): Promise<DbTxn> {
    this.#checkStatus();

    const ph = promise<DbTxn>(ctx);
    return this.#enqueue(ph, {
      type: 'beginTxn',
      ctx,
      opts,
      resolve: <FnResolve<DbTxn>>ph.resolve,
      reject: ph.reject,
    });
  }

  #enqueue<T>(ph: Promise<T>, req: ConnOperation): Promise<T> {
    const queue = this.#opQueue;
    queue.push(req);

    const wrapped = ph.catch((reason) => {
      if (isCanceled(reason)) {
        // If the request was canceled,
        // remove the request from the queue
        queue.splice(queue.indexOf(req), 1);
      }
      throw reason;
    });
    this.#start();

    return wrapped;
  }

  #start(): void {
    if (this.#busy) return;
    this.#busy = true;
    this.#next();
  }

  /**
   * Start the next queued operation.
   * Will emit 'complete' if there are no more
   * operations and #keepOpen is false
   */
  async #next(): Promise<void> {
    const nextOp = this.#opQueue.shift();
    if (nextOp == null) {
      this.#busy = false;

      if (this.#closing) {
        this.#done();
      } else if (!this.#keepOpen) {
        // No more work to do. Close the connection
        this.close();
      }

      return;
    }

    const { type, ctx } = nextOp;

    if (type === 'exec') {
      try {
        const result = await this.#con.exec(ctx, nextOp.sql, ...nextOp.params);
        nextOp.resolve(result);
      } catch (e) {
        nextOp.reject(e);
      }
    } else if (type === 'queryRow') {
      try {
        const row = await this.#con.queryRow(ctx, nextOp.sql, ...nextOp.params);
        nextOp.resolve(row);
      } catch (e) {
        nextOp.reject(e);
      }
    } else if (type === 'query') {
      try {
        const rows = await this.#con.query(ctx, nextOp.sql, ...nextOp.params);

        // Don't begin the next operation until rows are closed.
        rows.on('complete', () => {
          this.#next();
        });

        nextOp.resolve(rows);

        return;
      } catch (e) {
        nextOp.reject(e);
      }
    } else if (type === 'beginTxn') {
      try {
        const txn = await this.#con.beginTxn(ctx, nextOp.opts);

        // Don't begin the next operation until this transaction is completely done.
        txn.on('complete', () => {
          this.#next();
        });

        nextOp.resolve(txn);

        return;
      } catch (e) {
        nextOp.reject(e);
      }
    }

    setTimeout(() => this.#next(), 0);
  }

  #done(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;

    this.#con = <DriverConn>null!;

    const wc = this.#waitClose;
    if (wc != null) {
      this.#waitClose = null;
      wc.resolve();
    }

    this.emit('complete', this);
  }
}
