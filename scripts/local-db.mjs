import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function localDb(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(readFileSync('drizzle/0000_booking.sql','utf8'));
 const wrap=(query,args=[])=>{const stmt=sql.prepare(query);return {
   bind:(...values)=>wrap(query,values),first:async()=>stmt.get(...args)||null,
   all:async()=>({results:stmt.all(...args)}),run:async()=>({meta:stmt.run(...args)})
 };};
 return {prepare:query=>wrap(query)};
}
