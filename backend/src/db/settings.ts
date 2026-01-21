import db from "./knex.js";

type Row = {
  key: string;
  value: any;
  created_at?: string;
  updated_at?: string;
};

export async function getJsonSetting<T>(key: string, fallback: T): Promise<T> {
  const row = (await db<Row>("app_settings").where({ key }).first()) ?? null;
  if (!row) return fallback;
  return (row.value as T) ?? fallback;
}

export async function setJsonSetting<T>(key: string, value: T): Promise<void> {
  await db("app_settings")
    .insert({
      key,
      value,
      updated_at: db.fn.now(),
    })
    .onConflict("key")
    .merge({
      value,
      updated_at: db.fn.now(),
    });
}
