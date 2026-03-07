/**
 * Backup dos dados do Supabase via API (sem pg_dump/CLI)
 * Exporta tabelas para JSON na pasta backups/
 *
 * Requer: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env ou .env.local
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const BACKUPS_DIR = path.resolve(__dirname, '..', 'backups');
const TABLES = ['users', 'payments', 'credit_logs', 'user_creations', 'app_settings', 'user_active_task_items'];

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

async function fetchAll(supabase, table) {
  const all = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function main() {
  loadEnv();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (key === 'cole_sua_service_role_key_aqui' || !key?.trim()) key = '';
  if (!url || !key) {
    console.error('Erro: Adicione no .env.local:');
    console.error('  SUPABASE_URL=https://seu-projeto.supabase.co');
    console.error('  SUPABASE_SERVICE_ROLE_KEY=ou SUPABASE_ANON_KEY');
    console.error('(Service role: Dashboard > Project Settings > API > service_role)');
    process.exit(1);
  }

  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(BACKUPS_DIR, `backup-${ts}`);
  fs.mkdirSync(dir, { recursive: true });

  const supabase = createClient(url, key);
  const schema = { tables: [], exported_at: new Date().toISOString() };

  for (const table of TABLES) {
    try {
      const data = await fetchAll(supabase, table);
      const file = path.join(dir, `${table}.json`);
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
      schema.tables.push({ name: table, rows: data.length });
      console.log(`  ${table}: ${data.length} linhas`);
    } catch (e) {
      if (e.message?.includes('does not exist')) {
        console.log(`  ${table}: (tabela não existe, ignorando)`);
      } else {
        throw e;
      }
    }
  }

  fs.writeFileSync(path.join(dir, '_schema.json'), JSON.stringify(schema, null, 2), 'utf8');
  console.log(`\nBackup salvo em: ${dir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
