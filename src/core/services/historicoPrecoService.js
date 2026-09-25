/**
 * Selo "menor preço que registramos": o gatilho que os concorrentes mais usam,
 * feito sem mentir.
 *
 * O risco real aqui é o selo virar propaganda enganosa: produto cadastrado
 * ontem, sem histórico, e o post dizendo "menor preço". Por isso ele só
 * aparece quando TODAS as condições valem:
 *   - o sistema observa o produto há pelo menos `minimoDias` (padrão 14);
 *   - houve preço MAIOR registrado na janela (senão não é queda, é só o preço);
 *   - o preço atual é o menor de tudo que foi registrado na janela.
 * E o texto diz "que registramos", não "menor preço da história".
 */
import { priceHistoryRepository } from '../repositories/index.js';

const DIA_MS = 86400000;

/**
 * @param {object} produto  precisa de id, preco_atual e data_coleta
 * @returns {{selo:string, menor:number, maior:number, dias:number}|null}
 */
export function seloMenorPreco(produto, { dias = 30, minimoDias = 14, reference = new Date() } = {}) {
  const atual = Number(produto?.preco_atual);
  if (!produto?.id || !Number.isFinite(atual) || atual <= 0) return null;

  const inicioObservacao = new Date(produto.data_coleta || produto.criado_em || reference);
  if (reference - inicioObservacao < minimoDias * DIA_MS) return null;

  const desde = new Date(reference.getTime() - dias * DIA_MS).toISOString();
  const registros = priceHistoryRepository.list({
    filters: { product_id: produto.id, criado_em: { gte: desde } },
    limit: 500,
  });

  const precos = registros
    .flatMap((r) => [Number(r.preco_anterior), Number(r.preco_novo)])
    .filter((p) => Number.isFinite(p) && p > 0);
  if (!precos.length) return null;

  const maior = Math.max(...precos);
  const menorAntes = Math.min(...precos);
  if (maior <= atual || atual > menorAntes) return null;

  return { selo: `Menor preço que registramos em ${dias} dias`, menor: atual, maior, dias };
}
