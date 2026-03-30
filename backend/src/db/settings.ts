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
  if (typeof row.value === "string") {
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return (row.value as T) ?? fallback;
    }
  }
  return (row.value as T) ?? fallback;
}

export function serializeJsonSettingValue<T>(value: T): string {
  if (value === undefined) return "null";
  return JSON.stringify(value);
}

export async function setJsonSetting<T>(key: string, value: T): Promise<void> {
  const serialized = serializeJsonSettingValue(value);
  await db("app_settings")
    .insert({
      key,
      value: serialized,
      updated_at: db.fn.now(),
    })
    .onConflict("key")
    .merge({
      value: serialized,
      updated_at: db.fn.now(),
    });
}
