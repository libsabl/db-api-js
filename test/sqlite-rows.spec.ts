// Copyright 2022 Joshua Honig. All rights reserved.
// Use of this source code is governed by a MIT
// license that can be found in the LICENSE file.

// const sqlite3 = require('sqlite3').verbose();
// const db = new sqlite3.Database(':memory:');

import { Database, Statement } from 'sqlite3';

function run(db: Database, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.exec(sql, function (err) {
      if (err != null) {
        return reject(err);
      }
      resolve();
    });
  });
}

function get(db: Database, sql: string, ...params: any[]): Promise<object> {
  return new Promise((resolve, reject) => {
    db.get(sql, ...params, function (this: Statement, err: Error, row: object) {
      if (err != null) {
        return reject(err);
      }
      resolve(row);
    });
  });
}

it('inserts and gets rows', async () => {
  const db = new Database(':memory:');

  await run(db, 'CREATE TABLE Info( Label text, Name text, Code text )');

  await run(db, "INSERT INTO Info VALUES ( 'Hello', 'Hi', 'HI' )");

  let row = await get(db, 'SELECT * FROM Info');
  expect(Object.keys(row)).toEqual(['Label', 'Name', 'Code']);

  row = await get(db, 'SELECT Code, Name, Label FROM Info');
  expect(Object.keys(row)).toEqual(['Code', 'Name', 'Label']);

  row = await get(db, 'SELECT Name, Code, Label FROM Info');
  expect(Object.keys(row)).toEqual(['Name', 'Code', 'Label']);

  db.close();
});
