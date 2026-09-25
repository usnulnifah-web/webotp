import "dotenv/config";
import { mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { URL } from "node:url";

const execFileAsync = promisify(execFile);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const parsed = new URL(databaseUrl);
if (!parsed.hostname || !parsed.pathname.slice(1)) throw new Error("DATABASE_URL must include a MySQL database");

const backupDir = process.env.BACKUP_DIR ?? "backups";
await mkdir(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = `${backupDir}/webotp-${stamp}.sql`;
const args = ["--single-transaction", "--routines", "--triggers", "--set-gtid-purged=OFF", "--no-tablespaces", "--host", parsed.hostname, "--port", String(parsed.port || 3306), "--user", decodeURIComponent(parsed.username), "--result-file", output, decodeURIComponent(parsed.pathname.slice(1))];
if (parsed.password) args.splice(args.indexOf("--result-file"), 0, `--password=${decodeURIComponent(parsed.password)}`);
await execFileAsync("mysqldump", args, { env: { ...process.env, MYSQL_PWD: undefined } });
console.log(`Database backup created: ${output}`);
