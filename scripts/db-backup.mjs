import "dotenv/config";
import { createConnection } from "mysql2/promise";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, link, mkdir, rm, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createGunzip, createGzip } from "node:zlib";
import { createInterface } from "node:readline";
import path from "node:path";

const FORMAT = Buffer.from("WOTPBAK1");
const PREFIX_BYTES = FORMAT.length + 12;
const TAG_BYTES = 16;
const TABLES = ["users", "wallets", "wallet_transactions", "deposits", "refunds", "suppliers", "services", "activations", "activation_events", "api_keys", "webhook_endpoints", "webhook_deliveries"];

function encryptionKey() {
  const keyText = process.env.BACKUP_ENCRYPTION_KEY;
  if (!keyText) throw new Error("BACKUP_ENCRYPTION_KEY is required (base64-encoded 32-byte key)");
  const key = Buffer.from(keyText, "base64");
  if (key.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return key;
}

function safeJson(value) {
  return JSON.stringify(value, (_key, item) => Buffer.isBuffer(item) ? { $type: "Buffer", base64: item.toString("base64") } : item);
}

function restoreJson(value) {
  return JSON.parse(value, (_key, item) => item && item.$type === "Buffer" && typeof item.base64 === "string" ? Buffer.from(item.base64, "base64") : item);
}

function databaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is required");
  const url = new URL(raw);
  url.searchParams.set("timezone", "Z");
  return url.toString();
}

async function withDatabase(callback) {
  const connection = await createConnection(databaseUrl());
  try { return await callback(connection); }
  finally { await connection.end(); }
}

async function* exportRecords(connection) {
  yield `${safeJson({ type: "manifest", format: 1, createdAt: new Date().toISOString(), tables: TABLES, passwordHandling: "passwords are stored only as salted scrypt hashes; no plaintext passwords are present" })}\n`;
  for (const table of TABLES) {
    const [columns] = await connection.query(`SHOW COLUMNS FROM \`${table}\``);
    const names = columns.map(column => column.Field);
    yield `${safeJson({ type: "table", name: table, columns: names })}\n`;
    const query = connection.query({ sql: `SELECT * FROM \`${table}\``, rowsAsArray: false });
    for await (const row of query.stream({ highWaterMark: 64 })) yield `${safeJson({ type: "row", name: table, data: row })}\n`;
  }
}

async function createBackup(destination) {
  const key = encryptionKey();
  const absolute = path.resolve(destination);
  const temporary = `${absolute}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await mkdir(path.dirname(absolute), { recursive: true, mode: 0o700 });
    await withDatabase(async connection => {
      await connection.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
      try {
        const iv = randomBytes(12);
        const aad = Buffer.concat([FORMAT, iv]);
        const cipher = createCipheriv("aes-256-gcm", key, iv);
        cipher.setAAD(aad);
        const output = createWriteStream(temporary, { flags: "wx", mode: 0o600 });
        output.write(aad);
        await pipeline(Readable.from(exportRecords(connection)), createGzip({ level: 9 }), cipher, output);
        await appendFile(temporary, cipher.getAuthTag());
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    });
    await link(temporary, absolute);
    await rm(temporary, { force: true });
    console.log(`Encrypted database backup written: ${absolute}`);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function readBytes(file, start, end) {
  const chunks = [];
  for await (const chunk of createReadStream(file, { start, end })) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function authenticatedJsonLines(file, key) {
  const info = await stat(file);
  if (info.size <= PREFIX_BYTES + TAG_BYTES) throw new Error("Backup file is empty or malformed");
  const prefix = await readBytes(file, 0, PREFIX_BYTES - 1);
  if (prefix.length !== PREFIX_BYTES || !prefix.subarray(0, FORMAT.length).equals(FORMAT)) throw new Error("Unknown backup format");
  const tag = await readBytes(file, info.size - TAG_BYTES, info.size - 1);
  if (tag.length !== TAG_BYTES) throw new Error("Backup authentication tag is truncated");
  const decipher = createDecipheriv("aes-256-gcm", key, prefix.subarray(FORMAT.length));
  decipher.setAAD(prefix);
  decipher.setAuthTag(tag);
  const ciphertext = createReadStream(file, { start: PREFIX_BYTES, end: info.size - TAG_BYTES - 1 });
  // No plaintext files are created. If GCM authentication fails, the stream errors and the DB transaction is rolled back.
  const decoded = ciphertext.pipe(decipher).pipe(createGunzip());
  return createInterface({ input: decoded, crlfDelay: Infinity });
}

function validateIdentifier(value) {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]*$/.test(value);
}

async function restoreBackup(source) {
  const key = encryptionKey();
  const absolute = path.resolve(source);
  const info = await stat(absolute);
  if (info.size <= PREFIX_BYTES + TAG_BYTES) throw new Error("Backup file is empty or malformed");
  const prefix = await readBytes(absolute, 0, PREFIX_BYTES - 1);
  if (prefix.length !== PREFIX_BYTES || !prefix.subarray(0, FORMAT.length).equals(FORMAT)) throw new Error("Unknown backup format");
  const tag = await readBytes(absolute, info.size - TAG_BYTES, info.size - 1);
  if (tag.length !== TAG_BYTES) throw new Error("Backup authentication tag is truncated");
  const decipher = createDecipheriv("aes-256-gcm", key, prefix.subarray(FORMAT.length));
  decipher.setAAD(prefix);
  decipher.setAuthTag(tag);
  let manifest = null;
  let activeTable = null;
  let columns = [];
  const columnMap = new Map();
  let rowCount = 0;
  let lines;

  await withDatabase(async connection => {
    await connection.beginTransaction();
    try {
      // Never merge an archive into live data. A target DB must be empty in every app table.
      for (const table of TABLES) {
        const [rows] = await connection.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
        if (Number(rows[0].count) !== 0) throw new Error(`Target table ${table} is not empty. Restore to a fresh database; existing records were not changed.`);
      }
      const ciphertext = createReadStream(absolute, { start: PREFIX_BYTES, end: info.size - TAG_BYTES - 1 });
      const decoded = ciphertext.pipe(decipher).pipe(createGunzip());
      lines = createInterface({ input: decoded, crlfDelay: Infinity });
      for await (const line of lines) {
        if (!line) continue;
        const record = restoreJson(line);
        if (record.type === "manifest") {
          if (manifest || record.format !== 1 || !Array.isArray(record.tables) || record.tables.length !== TABLES.length || TABLES.some(table => !record.tables.includes(table))) throw new Error("Invalid backup manifest");
          manifest = record;
        } else if (record.type === "table") {
          if (!manifest || !TABLES.includes(record.name) || !Array.isArray(record.columns) || record.columns.some(column => !validateIdentifier(column))) throw new Error("Invalid backup table header");
          activeTable = record.name;
          columns = record.columns;
          columnMap.set(record.name, record.columns);
        } else if (record.type === "row") {
          if (!manifest || !TABLES.includes(record.name) || record.name !== activeTable || !record.data || typeof record.data !== "object" || columns.some(column => !(column in record.data))) throw new Error("Invalid backup row");
          const fields = columns.map(column => `\`${column}\``).join(",");
          const placeholders = columns.map(() => "?").join(",");
          const values = columns.map(column => record.data[column] ?? null);
          await connection.execute(`INSERT INTO \`${activeTable}\` (${fields}) VALUES (${placeholders})`, values);
          rowCount++;
        } else throw new Error("Unknown record in backup");
      }
      if (!manifest || columnMap.size !== TABLES.length) throw new Error("Backup manifest or table definitions are incomplete");
      await connection.commit();
    } catch (error) {
      lines?.close();
      await connection.rollback();
      throw error;
    }
  });
  console.log(`Restored encrypted backup ${absolute} (created ${manifest.createdAt})`);
  console.log(`Restored ${rowCount} rows across ${manifest.tables.length} tables.`);
}

const [command, file] = process.argv.slice(2);
if (!file || !["backup", "restore"].includes(command)) {
  console.error("Usage: node scripts/db-backup.mjs <backup|restore> <file.webotp.enc>");
  process.exit(2);
}
try {
  if (command === "backup") await createBackup(file);
  else await restoreBackup(file);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
