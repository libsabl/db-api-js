<!-- BEGIN:REMOVE_FOR_NPM -->
[![codecov](https://codecov.io/gh/libsabl/db-api-js/branch/main/graph/badge.svg?token=Il5Qqcc3M0)](https://app.codecov.io/gh/libsabl/db-api-js/branch/main)
<span class="badge-npmversion"><a href="https://npmjs.org/package/@sabl/db-api" title="View this project on NPM"><img src="https://img.shields.io/npm/v/@sabl/db-api.svg" alt="NPM version" /></a></span>

<!-- END:REMOVE_FOR_NPM -->

# @sabl/db-api

**db api** is a simple, [context](https://github.com/libsabl/patterns/blob/main/patterns/context.md)-aware pattern for interacting with relational databases. It was first demonstrated in the [golang](https://go.dev/doc/) standard library [`database/sql` package](https://pkg.go.dev/database/sql). This package makes the same pattern available in TypeScript and JavaScript projects.

This implementation builds on the following generic packages which describe connection pooling and transaction lifecycles, respectively:

|Package|Pattern docs|
|-|-|
|[`@sabl/storage-pool`](https://npmjs.org/package/@sabl/storage-pool)|[storage pool](https://github.com/libsabl/patterns/blob/main/patterns/storage-pool.md)|
|[`@sabl/txn`](https://npmjs.org/package/@sabl/txn)|[txn](https://github.com/libsabl/patterns/blob/main/patterns/txn.md)|
   
For more detail on the db api pattern, see sabl / [patterns](https://github.com/libsabl/patterns#patterns) / [db-api](https://github.com/libsabl/patterns/blob/main/patterns/db-api.md). 

<!-- BEGIN:REMOVE_FOR_NPM -->
> [**sabl**](https://github.com/libsabl/patterns) is an open-source project to identify, describe, and implement effective software patterns which solve small problems clearly, can be composed to solve big problems, and which work consistently across many programming languages.

## Developer orientation

See [SETUP.md](./docs/SETUP.md), [CONFIG.md](./docs/CONFIG.md).
<!-- END:REMOVE_FOR_NPM -->

## Basic Pooling and Transactions

As in the generic [`@sabl/storage-pool`](https://npmjs.org/package/@sabl/storage-pool) package, this package provides pool, connection, and transaction types which represent the generic concerns of connection pooling and transaction lifecycles. 

In most situations, clients should use the `exec`, `query`, and `queryRow` APIs directly on an `DbPool`. This ensures connections are returned to the pool as quickly as possible. Only use `DbConn` directly if it is important to maintain session state such as variables, temporary tables, or other settings between subsequent queries.

The relational-specific `query` and `exec` APIs are described in detail [below](#shared-sql-api).

### `DbTxn`

```ts
import { Txn } from '@sabl/txn';
import { StorageTxn  } from '@sabl/storage-pool';

interface DbTxn implements DbApi, StorageTxn, Txn {
  // StorageTxn, Txn:
  commit(ctx: IContext): Promise<void>;
  rollback(ctx: IContext): Promise<void>;

  // DbApi:
  exec(ctx: IContext, sql: string, ...params: ParamValue[]): Promise<Result>;
  queryRow(ctx: IContext, sql: string, ...params: ParamValue[]): Promise<Row | null>;
  query(ctx: IContext, sql: string, ...params: ParamValue[]): Promise<Rows>;
}
```

`DbTxn` represents an active relational database transaction.

It is based on the [`Tx` struct](https://pkg.go.dev/database/sql#Tx) from the golang `database/sql` package, and is a composition of
- The generic [`StorageTxn` interface](https://github.com/libsabl/txn-js#txn-interface) from [`@sabl/txn`](https://npmjs.org/package/@sabl/txn)
- The generic [`Txn` interface](https://github.com/libsabl/txn-js#txn-interface) from [`@sabl/txn`](https://npmjs.org/package/@sabl/txn)
- The relational-specific [`DbApi`](#dbapi).

### `DbConn`

```ts
import { Transactable } from '@sabl/txn';
import { StorageConn  } from '@sabl/storage-pool';

interface DbConn implements DbApi, StorageConn, Transactable<DbTxn> {
  // StorageConn, Transactable:
  beginTxn(ctx: IContext, opts?: TxnOptions): Promise<DbTxn>;

  // StorageConn:
  close(): Promise<void>;

  // DbApi:
  exec(ctx: IContext, sql: string, ...params: ParamValue[]): Promise<Result>;
  queryRow(ctx: IContext, sql: string, ...params: ParamValue[]): Promise<Row | null>;
  query(ctx: IContext, sql: string, ...params: ParamValue[]): Promise<Rows>;
}
```

`DbConn` represents an open connection to a relational database that remains active until it is explicitly closed. See also [storage pool pattern](https://github.com/libsabl/patterns/blob/main/patterns/storage-pool.md#basic-pattern---abstract-storage-pool).

It is based on the [`Conn` struct](https://pkg.go.dev/database/sql#Conn) from the golang `database/sql` package, and is a composition of:

- The generic [`StorageConn` interface](https://github.com/libsabl/storage-pool-js#storageconn) from [`@sabl/storage-pool`](https://npmjs.org/package/@sabl/storage-pool)
- The [`Transactable` interface](https://github.com/libsabl/txn-js#transactable-interface) from [`@sabl/txn`](https://npmjs.org/package/@sabl/txn), 
- The relational-specific [`DbApi`](#dbapi). 

### `DbPool`

```ts
interface DbPool
  implements DbApi, StoragePool, Transactable<DbTxn> { 
  // StoragePool, Transactable:
  beginTxn(ctx: IContext, opts?: TxnOptions): Promise<DbTxn>;

  // StoragePool
  conn(ctx: IContext): Promise<DbConn>; 
  close(): Promise<void>; 

  // DbApi:
  exec(ctx: IContext, sql: string, ...params: ParamValue[]): Promise<Result>;
  queryRow(ctx: IContext, sql: string, ...params: ParamValue[]): Promise<Row | null>;
  query(ctx: IContext, sql: string, ...params: ParamValue[]): Promise<Rows>;
}
```

`DbPool` represents a pool of database connections.

It is based on the [`DB` struct](https://pkg.go.dev/database/sql#DB) from the golang `database/sql` package, and is a composition of

- The generic [`StoragePool` interface](https://github.com/libsabl/storage-pool-js#storagepool) from [`@sabl/storage-pool`](https://npmjs.org/package/@sabl/storage-pool)
- The [`Transactable` interface](https://github.com/libsabl/txn-js#transactable-interface) from [`@sabl/txn`](https://npmjs.org/package/@sabl/txn), 
- The relational-specific [`DbApi`](#dbapi). 

## Shared SQL API
 
This package also includes a common interface that describes interacting with a relational database regardless of whether the context is a pool, a connection, or a transaction.

### `DbApi`

```ts
interface DbApi {
  exec(ctx: IContext, sql: string, ...params: ParamValue[]): Promise<Result>;
  queryRow(ctx: IContext, sql: string, ...params: ParamValue[]): Promise<Row | null>;
  query(ctx: IContext, sql: string, ...params: ParamValue[]): Promise<Rows>;
}
```

DbApi is the core interface which represents the basic operations of interacting with a relational database. It is based on the shared APIs on the `DB`, `Conn`, `Txn`, and `Stmt` types in the golang [`database/sql` package](https://pkg.go.dev/database/sql).

All three of its methods accept a context, a literal SQL statement, and an ordered list of parameters. Named parameters are also supported using the `NamedParam` type, which can be provided in any order to a an underlying implementation that supports named parameters.


|method|description|
|-|-|
|`exec`|Execute a statement which is not expected to return any rows, and resolve as soon as the database reports the number of rows affected. If executed directly on a Pool, waits until the connection has been closed and returned to the pool.|
|`queryRow`|Retrieves a single row. Resolves when the first row is received, or when the response is concluded indicating there are no rows. If executed directly on a Pool, waits until the connection has been closed and returned to the pool.|
|`query`|Opens a cursor for a result set that may contain multiple rows. Resolves as soon as the list of fields is received, possibly before any row data is received.|

### `Row`

Row is a simple interface that allows fetching field values either by name or by ordinal. 

```ts
interface Row {
  /** Retrieve a value by name */
  [key: string | symbol]: unknown;

  /** Retrieve a value by zero-based index */
  [index: number]: unknown;
}
```

Row is also exported as a class with several static utility methods:

```ts
class Row {
  static fromObject(data: PlainObject, cols: string[]): Row;
  static fromArray(data: unknown[], cols: string[]): Row;

  static toObject(row: Row): PlainObject;
  static toArray(row: Row): unknown[];
  static clone(row: Row): Row;
}
```

|method|description|
|-|-|
|`fromObject`|Wraps a plain object source row, using the provided array of column names to implement field lookup by index.|
|`fromArray`|Wraps a plain array source row, using the provided array of column names to implement field lookup by name.|
|`toObject`|Copies the values from an existing row to a plain object.|
|`toArray`|Copies the values from an existing row to a plain array of values.|
|`clone`|Copies the data from an existing row to a new object that also implements the `Row` interface.|

#### **Constructing rows**
Platform-specific client libraries usually return rows as either a plain object keyed by the field names, or as a plain array of field values. Both can be wrapped as a `Row` using the static `Row.fromObject` and `Row.fromArray` methods, which also require an array of field names to map between field names and indexes. 

Both methods use efficient implementations leveraging the [`Proxy`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) class, which do not copy the underlying field values.

```ts
// Wrapping a plain object as a Row:
const data = { id: 11, code: 'orange', label: 'Orange' };
const row = Row.fromObject(data, ['id', 'code', 'label']);
console.log(row[0])  // 11
console.log(row.id)  // 11
```

```ts
// Wrapping a plain array as a Row:
const data = [ 11, 'orange', 'Orange' ];
const row = Row.fromArray(data, ['id', 'code', 'label']);
console.log(row[0])  // 11
console.log(row.id)  // 11
```

#### **Volatility**
`Row` describes an interface, which could be implemented directly by a volatile cursor whose internal state changes as a query is advanced or closed. Clients should not store `Row` references obtained directly from `query` or `queryRow` APIs. If a client wishes to retain the data from a `Row` in a generic form, it should be copied using any of the static methods `Row.toObject`, `Row.toArray`, or `Row.clone`.

### `Rows`

```ts
export interface Rows extends AsyncIterable<Row> { 
  close(): Promise<void>; 
  next(): Promise<boolean>; 
  get columns(): string[];
  get columnTypes(): ColumnInfo[]; 
  get row(): Row;
  get err(): Error | null; 
}
```

`Rows` represents a set of Rows returned by a `query`, essentially a [cursor](https://en.wikipedia.org/wiki/Cursor_(databases)). Clients can manually iterate over the result set using `next()`, `row`, and `close()`, or can automatically advance, retrieve, and close a row set using [`for await...of`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of).

Advancing with `next()` and closing with `close()` are both asynchronous operations. Retrieving the column names, column types, current row, or current error are all synchronous operations using the properties `columns`, `columnTypes`, `row`, and `err`, respectively. Implementations of `query` should not resolve until the field information has been received from the server, so that `column` and `columnTypes` can be safely accessed.


|method|description|
|-|-|
|`close`|Closes the row set. Row sets must be closed to ensure the underlying cursor is released, but will be closed automatically if `next()` resolves to false or if the rows are iterated using `for await...of`. All implementations of `close` must be idempotent, so calling `close` multiple times is not a problem.|
|`next`|Advance to the next (or first) row. Resolves `true` if a row is available, or `false` if the end of the result set has been reached. Also automatically closes the cursor if there are no more rows.|
|`columns`|Retrieve an array of string column names.|
|`columnTypes`|Retrieve an array of column descriptors.|
|`row`|Get the current row. Always null before calling `next()` for the first time. May be [volatile](#volatility) implementation whose values change when the row set is advanced or closed.|
|`err`|The last error, if any, encountered while using the cursor.|

#### **Closing a `Rows`**

Only the client knows when it is done working with a cursor. Therefore rows **must** be closed by the client to ensure the cursor is released. 

All implementations of `Rows` should automatically close the row set in two situations:

- When a call to `next()` resolves to `false`, indicating there are no more rows
- Within a `finally` block in the implementation of an async iterator method

For clients either of the following are safe patterns:

1. Using `next()` and `row` directly

   If manually iterating using `next()` and `row`, client code should always use `try...finally` and call `rows.close()` in the finally block:

   ```ts
   const rows = await mydb.query(ctx, 'select * from my_table');
   try {
     while(await rows.next()) {
       const current row = rows.row;
       // .. do stuff ..
     }
   } finally {
     await rows.close()
   }
   ```
  
   Note that in this situation `close` may be called twice -- once automatically by the final call to `next()` if the entire result set is iterated, and once in the explicit call to `close()` in the `finally` block. This is not a problem, as all implementations of `close()` must be idempotent. 

2. Using `for await...of`

   Implementations of the async iterator for a `Rows` should internally use the `try...finally` pattern illustrated in option 1 above. The mechanics of async iteration then guarantee that `close()` will be called even if the loop is aborted due to an error or an explicit `break` or `return`.

   ```ts
   const rows = await mydb.query(ctx, 'select * from my_table');

   // Guarantees row set is closed when iteration completes or 
   // is canceled due to error, return, or break
   for await (const row of rows) {
     // .. do stuff
   }
   ```

## Differences from Go

Many of the APIs in this package are patterned on the golang [`database/sql` package](https://pkg.go.dev/database/sql). That go package implements many shared mechanics, such as connection pooling, directly in its core `Db`, `Conn`, `Rows`, and `Txn` types, which are defined as concrete `structs` that cannot be inherited or implemented. Instead, database client authors must implement a fairly complex and low-level set of related interfaces defined in the [`database/sql/driver` package](https://pkg.go.dev/database/sql/driver).

This is not a good fit for the Node ecosystem, where most relational database API packages implement higher-level APIs more similar to the public APIs of the `Db` and `Conn` types. Therefore in this library we opt to define top-level APIs such `DbTxn`, `DbConn`, `DbPool`, and `Rows` as interfaces. 

Adapter authors need only create thin wrappers around existing APIs in a target database client package. This often includes work to adapt legacy callback- and events-based processes into the Promise-based APIs in this package.
