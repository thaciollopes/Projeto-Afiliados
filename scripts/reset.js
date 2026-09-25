/**
 * Apaga o banco e recria do zero. Exige confirmacao explicita:
 *   node scripts/reset.js --sim
 */
import fs from 'node:fs';
import { config } from '../src/config/index.js';
import { createBackup } from '../src/core/services/maintenanceService.js';

if (!process.argv.includes('--sim')) {
  console.log('');
  console.log('  Isto APAGA todos os dados (produtos, campanhas, historico).');
  console.log('  Se tiver certeza, rode:  node scripts/reset.js --sim');
  console.log('');
  process.exit(1);
}

if (fs.existsSync(config.db.file)) {
  const backup = createBackup({ rotulo: 'antes-do-reset' });
  console.log(`  Backup de seguranca: ${backup.arquivo_db}`);
  for (const sufixo of ['', '-wal', '-shm']) {
    const arquivo = `${config.db.file}${sufixo}`;
    if (fs.existsSync(arquivo)) fs.rmSync(arquivo);
  }
}

console.log('  Banco apagado. Rode "npm run seed" para recriar os dados de exemplo.');
