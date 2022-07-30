// Copyright 2022 Joshua Honig. All rights reserved.
// Use of this source code is governed by a MIT
// license that can be found in the LICENSE file.

import { ColumnInfo, DriverRows, PlainObject, Row } from '$';
import { EventEmitter } from 'events';
import { CallbackPromise } from '@sabl/async';
import { Canceler, CancelFunc } from '@sabl/context';

export interface RowController {
  pushRow(row: PlainObject): void;
  end(): void;
}

export class SqliteRows extends EventEmitter implements DriverRows {
  #row: Row | null = null;
  #columns: ColumnInfo[] | null = null;
  #fieldNames: string[] | null = null;
  #err: Error | null = null;
  #ready = false;
  #done = false;
  #canceling = false;
  #waitNext: CallbackPromise<boolean> | null = null;
  #waitClose: CallbackPromise<void> | null = null;
  #waitReady: CallbackPromise<Error | null> | null = null;

  readonly #buf: PlainObject[] = [];
  #onCancel: CancelFunc | null = null;

  static create(clr?: Canceler): [SqliteRows, RowController] {
    const rows = new SqliteRows(clr);
    const controller: RowController = {
      end: rows.#end.bind(rows),
      pushRow: rows.#pushRow.bind(rows),
    };
    return [rows, controller];
  }

  private constructor(clr?: Canceler) {
    super();

    if (clr != null) {
      clr.onCancel((this.#onCancel = this.#cancel.bind(this)));
    }
  }

  #cancel(): void {
    this.#canceling = true;
  }

  #onFields(row: PlainObject) {
    this.#fieldNames = Object.keys(row);
    if (!this.#ready) {
      this.#resolveReady(null);
    }
  }

  #resolveReady(err: Error | null) {
    this.#ready = true;
    const wReady = this.#waitReady;
    if (wReady != null) {
      this.#waitReady = null;
      wReady.resolve(err);
    }
  }

  #pushRow(row: PlainObject) {
    if (this.#canceling) {
      // Ignore the row. Query is canceling
      return;
    }

    if (!this.#ready) {
      this.#onFields(row);
    }

    if (this.#waitNext) {
      if (this.#buf.length) {
        throw new Error('Invalid state: waiting on non-empty buffer');
      }
      // Already waiting for a row. Load
      // it and resolve next() promise
      this.#row = Row.fromObject(row, this.#fieldNames!);
      return this.#resolveNext(true);
    }
  }

  #end() {
    this.#done = true;
    if (this.#waitNext) {
      return this.#resolveNext(false);
    }

    const pClose = this.#waitClose;
    if (pClose != null) {
      this.#waitClose = null;
      pClose.resolve();
    }

    this.emit('complete', null, [this]);
  }

  #resolveNext(ok: boolean): void {
    const pNext = this.#waitNext!;
    this.#waitNext = null;
    pNext.resolve(ok);
  }

  async close(): Promise<void> {
    this.#end();
  }

  async next(): Promise<boolean> {
    if (this.#done) {
      return false;
    }

    return true;
  }

  get columns(): string[] {
    throw new Error('Method not implemented.');
  }

  get columnTypes(): ColumnInfo[] {
    throw new Error('Method not implemented.');
  }

  get err(): Error | null {
    throw new Error('Method not implemented.');
  }

  get row(): Row {
    if (this.#row == null) {
      throw new Error('No row loaded. Call next()');
    }

    return this.#row;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<Row, any, undefined> {
    try {
      while (await this.next()) {
        yield this.row;
      }
    } finally {
      await this.close();
    }
  }
}
