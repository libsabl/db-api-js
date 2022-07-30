// Copyright 2022 Joshua Honig. All rights reserved.
// Use of this source code is governed by a MIT
// license that can be found in the LICENSE file.

import {
  DriverConn,
  DriverRows,
  DriverTxn,
  QueueConn,
  Result,
  Row,
  SqlTxn,
} from '$';
import { IContext } from '@sabl/context';
import { TxnOptions } from '@sabl/txn';

import { Database } from 'sqlite3';

export class SqliteConn implements DriverConn {
  readonly #con: Database;

  constructor(con: Database) {
    this.#con = con;
  }

  exec(ctx: IContext, sql: string, ...params: unknown[]): Promise<Result> {
    return new Promise<Result>((resolve, reject) => {
      this.#con.run(sql, params, function (err) {
        if (err != null) {
          return reject(err);
        }
        resolve({
          rowsAffected: this.changes,
          lastId: this.lastID,
        });
      });
    });
  }

  queryRow(
    ctx: IContext,
    sql: string,
    ...params: unknown[]
  ): Promise<Row | null> {
    return new Promise<Row | null>((resolve, reject) => {
      this.#con.get(sql, params, function (err, data) {
        if (err != null) {
          return reject(err);
        }
        if (data == null) {
          return resolve(null);
        }
        const row = Row.fromObject(data, Object.keys(data));
        resolve(row);
      });
    });
  }

  query(ctx: IContext, sql: string, ...params: unknown[]): Promise<DriverRows> {
    throw new Error('Method not implemented.');
  }

  beginTxn(ctx: IContext, opts?: TxnOptions | undefined): Promise<DriverTxn> {
    const txnCon = new QueueConn(this, false);
    return SqlTxn.start(ctx, txnCon, opts);
  }
}
