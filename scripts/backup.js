/** Backup por linha de comando (BACKUP.bat). Nao precisa do servidor ligado. */
import { createBackup, listBackups } from '../src/core/services/maintenanceService.js';

const info = createBackup({ rotulo: process.argv[2] || 'manual' });

console.log('');
console.log('  Backup criado:');
console.log(`    arquivo : ${info.arquivo_db}`);
console.log(`    tamanho : ${info.tamanho_mb} MB`);
console.log('    registros:');
for (const [tabela, total] of Object.entries(info.registros)) {
  console.log(`      ${tabela.padEnd(18)} ${total}`);
}
console.log('');
console.log(`  Backups guardados: ${listBackups().length}`);
console.log('');
