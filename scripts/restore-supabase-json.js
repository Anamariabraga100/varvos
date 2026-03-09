/**
 * Restaura backup JSON no Supabase (nova conta/projeto)
 *
 * Uso:
 *   node scripts/restore-supabase-json.js [pasta-do-backup]
 *
 * Exemplo:
 *   node scripts/restore-supabase-json.js backups/backup-2026-03-09T05-01-39
 *
 * Se não passar pasta, usa o backup mais recente em backups/
 *
 * Requer no .env ou .env.local (credenciais da NOVA conta Supabase):
 *   SUPABASE_RESTORE_URL=https://novo-projeto.supabase.co
 *   SUPABASE_RESTORE_SERVICE_ROLE_KEY=sua-service-role-key
 *
 * Ou use SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY se preferir.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const BACKUPS_DIR = path.resolve(__dirname, '..', 'backups');
const ORDER = ['users', 'payments', 'credit_logs', 'user_creations', 'app_settings', 'user_active_task_items'];

function loadEnv() {
  const root = path.resolve(__dirname, '..');
  const cwd = process.cwd();
  const candidates = [
    path.resolve(root, '.env.local'),
    path.resolve(root, '.env'),
    path.resolve(cwd, '.env.local'),
    path.resolve(cwd, '.env'),
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
    }
  }
}

function getLatestBackup() {
  if (!fs.existsSync(BACKUPS_DIR)) return null;
  const dirs = fs.readdirSync(BACKUPS_DIR)
    .filter((d) => d.startsWith('backup-') && fs.statSync(path.join(BACKUPS_DIR, d)).isDirectory())
    .sort()
    .reverse();
  return dirs.length ? path.join(BACKUPS_DIR, dirs[0]) : null;
}

const TABLE_CONFLICT = {
  users: 'id',
  payments: 'id',
  credit_logs: 'id',
  user_creations: 'id',
  app_settings: 'key',
  user_active_task_items: 'user_id,task_id',
};

async function insertBatch(supabase, table, rows, batchSize = 100) {
  const onConflict = TABLE_CONFLICT[table] || 'id';
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).upsert(batch, { onConflict, ignoreDuplicates: false });
    if (error) throw new Error(`${table}: ${error.message}`);
    inserted += batch.length;
    process.stdout.write(`\r  ${table}: ${inserted}/${rows.length}`);
  }
  console.log('');
}

async function main() {
  loadEnv();

  const backupArg = process.argv[2];
  let backupDir = backupArg
    ? path.resolve(process.cwd(), backupArg)
    : getLatestBackup();

  if (!backupDir || !fs.existsSync(backupDir)) {
    console.error('Erro: Nenhum backup encontrado.');
    console.error('Uso: node scripts/restore-supabase-json.js [pasta-do-backup]');
    console.error('Ex:  node scripts/restore-supabase-json.js backups/backup-2026-03-09T05-01-39');
    process.exit(1);
  }

  const url = process.env.SUPABASE_RESTORE_URL || process.env.SUPABASE_URL;
  let key = process.env.SUPABASE_RESTORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (key === 'cole_sua_service_role_key_aqui' || !key?.trim()) key = '';

  if (!url || !key) {
    console.error('Erro: Configure as credenciais da NOVA conta Supabase:');
    console.error('  SUPABASE_RESTORE_URL=https://novo-projeto.supabase.co');
    console.error('  SUPABASE_RESTORE_SERVICE_ROLE_KEY=sua-service-role-key');
    console.error('');
    console.error('Ou use SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  console.log('Restaurando backup:', backupDir);
  console.log('Destino:', url);
  console.log('');

  const supabase = createClient(url, key);

  for (const table of ORDER) {
    const file = path.join(backupDir, `${table}.json`);
    if (!fs.existsSync(file)) {
      console.log(`  ${table}: (arquivo não existe, pulando)`);
      continue;
    }
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(rows) || rows.length === 0) {
      console.log(`  ${table}: 0 linhas`);
      continue;
    }
    await insertBatch(supabase, table, rows);
  }

  console.log('\nRestauração concluída.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
