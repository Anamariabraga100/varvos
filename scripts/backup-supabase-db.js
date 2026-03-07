/**
 * Backup do banco de dados Supabase
 *
 * Requisitos:
 * - Supabase CLI instalado: npm install -g supabase
 *   OU PostgreSQL (pg_dump) no PATH
 *
 * Configuração:
 * - Crie SUPABASE_DB_URL no .env com a connection string:
 *   postgresql://postgres.[PROJECT-REF]:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
 *
 * Obtenha em: Supabase Dashboard > Connect > Direct connection
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BACKUPS_DIR = path.join(__dirname, '..', 'backups');

function loadEnv() {
  const root = path.join(__dirname, '..');
  const cwd = process.cwd();
  const candidates = [
    path.join(root, '.env.local'),
    path.join(root, '.env'),
    path.join(cwd, '.env.local'),
    path.join(cwd, '.env'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf8');
      for (const line of content.split('\n')) {
        const m = line.match(/^\s*([^#=]+)=(.*)$/);
        if (m) {
          const key = m[1].trim();
          const val = m[2].trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) process.env[key] = val;
        }
      }
      break;
    }
  }
}

function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

function getTimestamp() {
  const d = new Date();
  return d.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: opts.silent ? 'pipe' : 'inherit',
      shell: true,
      ...opts,
    });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Exit ${code}`))));
  });
}

async function backupWithSupabaseCli(dbUrl) {
  const ts = getTimestamp();
  const base = path.join(BACKUPS_DIR, `supabase-backup-${ts}`);
  ensureBackupsDir();

  console.log('Usando Supabase CLI...');
  await run('npx', ['supabase', 'db', 'dump', '--db-url', dbUrl, '-f', `${base}-roles.sql`, '--role-only']);
  await run('npx', ['supabase', 'db', 'dump', '--db-url', dbUrl, '-f', `${base}-schema.sql`]);
  await run('npx', ['supabase', 'db', 'dump', '--db-url', dbUrl, '-f', `${base}-data.sql`, '--use-copy', '--data-only']);

  console.log(`\nBackup salvo em:\n  ${base}-roles.sql\n  ${base}-schema.sql\n  ${base}-data.sql`);
}

async function backupWithPgDump(dbUrl) {
  const ts = getTimestamp();
  const outFile = path.join(BACKUPS_DIR, `supabase-backup-${ts}.sql`);
  ensureBackupsDir();

  console.log('Usando pg_dump...');
  const proc = spawn('pg_dump', [dbUrl], {
    stdio: ['ignore', 'pipe', 'inherit'],
    shell: true,
  });
  const write = fs.createWriteStream(outFile);
  proc.stdout.pipe(write);
  await new Promise((resolve, reject) => {
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`pg_dump exit ${code}`))));
  });
  await new Promise((r) => write.end(r));

  console.log(`\nBackup salvo em: ${outFile}`);
}

async function main() {
  loadEnv();
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error('Erro: SUPABASE_DB_URL não definido.');
    console.error('Adicione no .env ou .env.local:');
    console.error('  SUPABASE_DB_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres');
    console.error('\nObtenha em: Supabase Dashboard > Connect > Direct connection');
    process.exit(1);
  }

  try {
    await run('npx', ['supabase', '--version'], { stdio: 'pipe' });
    await backupWithSupabaseCli(dbUrl);
  } catch {
    try {
      await run('pg_dump', ['--version'], { stdio: 'pipe' });
      await backupWithPgDump(dbUrl);
    } catch {
      console.error('Erro: Supabase CLI ou pg_dump não encontrado.');
      console.error('Instale um dos dois:');
      console.error('  - Supabase CLI: npm install -g supabase');
      console.error('  - PostgreSQL: https://www.postgresql.org/download/');
      process.exit(1);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
