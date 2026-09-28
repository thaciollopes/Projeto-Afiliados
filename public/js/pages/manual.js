import { el } from '../ui.js';
import { SECOES } from '../manual/conteudo.js';

/**
 * MANUAL — o passo a passo de cada função, dentro do próprio painel.
 * O conteúdo mora em manual/conteudo.js; aqui é só índice, busca e leitura.
 * `#/manual/<secao>` abre direto numa seção (é o que o botão 📖 Ajuda usa).
 */

const ROTULO_BLOCO = {
  atencao: { icone: '⚠️', titulo: 'Atenção', classe: 'manual-atencao' },
  dica: { icone: '💡', titulo: 'Dica', classe: 'manual-dica' },
  admin: { icone: '🛠️', titulo: 'Configuração do servidor (administrador)', classe: 'manual-admin' },
};

/** A seção do manual que explica uma tela do painel (para o botão Ajuda). */
export function secaoDaRota(rota) {
  const alvo = APELIDOS[rota] ?? rota;
  return SECOES.find((s) => s.rota === alvo)?.id || null;
}

/** Telas sem seção própria caem na seção que as explica. */
const APELIDOS = {
  historico: 'fila',
  cupons: 'promocoes',
  buscar: 'produtos',
  pesquisas: 'produtos',
  categorias: 'produtos',
  status: 'sistema',
};

function bloco(b) {
  const especial = ROTULO_BLOCO[b.tipo];
  const lista = b.passos
    ? `<ol class="manual-passos">${b.passos.map((p) => `<li>${p}</li>`).join('')}</ol>`
    : `<ul class="manual-itens">${(b.itens || []).map((p) => `<li>${p}</li>`).join('')}</ul>`;
  if (especial) {
    return `<div class="manual-caixa ${especial.classe}">
      <strong>${especial.icone} ${b.titulo || especial.titulo}</strong>${lista}</div>`;
  }
  return `${b.titulo ? `<h4>${b.titulo}</h4>` : ''}${lista}`;
}

function secao(s) {
  return `
    <section class="cartao manual-secao" id="manual-${s.id}" data-texto="${textoBusca(s)}">
      <div class="cartao-titulo">
        <div>
          <h2>${s.icone} ${s.titulo}</h2>
          <p>${s.resumo}</p>
        </div>
        ${s.rota !== undefined ? `<a class="btn btn-pequeno" href="#/${s.rota}">Abrir esta tela →</a>` : ''}
      </div>
      ${s.blocos.map(bloco).join('')}
    </section>`;
}

/** Texto sem HTML e sem acento, para a busca achar "promocao" em "Promoção". */
function textoBusca(s) {
  const tudo = [s.titulo, s.resumo, ...s.blocos.flatMap((b) => [b.titulo, ...(b.passos || []), ...(b.itens || [])])]
    .filter(Boolean).join(' ');
  return normalizar(tudo.replace(/<[^>]+>/g, ' ')).replace(/"/g, '');
}

function normalizar(texto) {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export async function renderManual({ params = [] } = {}) {
  const tela = el('<div class="manual"></div>');

  tela.appendChild(el(`
    <style>
      .manual { display: grid; grid-template-columns: 240px 1fr; gap: 16px; align-items: start; }
      .manual-indice { position: sticky; top: 80px; max-height: calc(100vh - 100px); overflow: auto; }
      .manual-indice a { display: block; padding: 5px 8px; border-radius: 8px; text-decoration: none; color: inherit; font-size: .9rem; }
      .manual-indice a:hover, .manual-indice a.ativo { background: var(--superficie-2); }
      .manual-indice input { width: 100%; box-sizing: border-box; margin-bottom: 8px; }
      .manual-secao { scroll-margin-top: 80px; }
      .manual-secao h4 { margin: 14px 0 6px; }
      .manual-passos, .manual-itens { margin: 6px 0 0; padding-left: 22px; line-height: 1.75; }
      .manual-passos li::marker { font-weight: 700; color: var(--primaria, var(--ok)); }
      .manual-caixa { border-radius: 10px; padding: 10px 14px; margin-top: 12px; }
      .manual-caixa ul, .manual-caixa ol { margin-top: 4px; }
      .manual-atencao { background: var(--alerta-suave); }
      .manual-dica { background: var(--ok-suave); }
      .manual-admin { background: var(--superficie-2); border: 1px dashed var(--borda); }
      .manual-vazio { display: none; }
      @media (max-width: 860px) {
        .manual { grid-template-columns: 1fr; }
        .manual-indice { position: static; max-height: none; }
      }
    </style>`));

  const indice = el(`
    <div class="cartao manual-indice">
      <input type="search" id="manual-busca" placeholder="🔎 Buscar no manual…">
      ${SECOES.map((s) => `<a href="#/manual/${s.id}" data-ir="${s.id}">${s.icone} ${s.titulo}</a>`).join('')}
    </div>`);

  const conteudo = el(`
    <div>
      <div class="cartao">
        <h2>📖 Manual</h2>
        <p class="texto-fraco" style="margin:4px 0 0">
          O passo a passo de cada função. Em qualquer tela, o botão <strong>📖 Ajuda</strong> no topo
          abre a parte do manual daquela tela. Caixas <strong>🛠️</strong> são configurações do
          servidor, feitas pelo administrador.
        </p>
      </div>
      ${SECOES.map(secao).join('')}
      <div class="cartao manual-vazio" id="manual-nada">Nada encontrado. Tente outra palavra.</div>
    </div>`);

  tela.appendChild(indice);
  tela.appendChild(conteudo);

  // Clicar no índice rola até a seção sem recarregar a página inteira.
  indice.addEventListener('click', (evento) => {
    const link = evento.target.closest('[data-ir]');
    if (!link) return;
    evento.preventDefault();
    irPara(link.dataset.ir);
    history.replaceState(null, '', `#/manual/${link.dataset.ir}`);
  });

  function irPara(id) {
    tela.querySelector(`#manual-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    for (const a of indice.querySelectorAll('[data-ir]')) a.classList.toggle('ativo', a.dataset.ir === id);
  }

  indice.querySelector('#manual-busca').addEventListener('input', (evento) => {
    const termos = normalizar(evento.target.value).split(/\s+/).filter(Boolean);
    let visiveis = 0;
    for (const s of tela.querySelectorAll('.manual-secao')) {
      const mostra = termos.every((t) => s.dataset.texto.includes(t));
      // style, nao `hidden`: o CSS do .cartao define display e venceria o atributo.
      s.style.display = mostra ? '' : 'none';
      indice.querySelector(`[data-ir="${s.id.replace('manual-', '')}"]`).style.display = mostra ? '' : 'none';
      if (mostra) visiveis += 1;
    }
    tela.querySelector('#manual-nada').style.display = visiveis ? 'none' : 'block';
  });

  if (params[0]) setTimeout(() => irPara(params[0]), 50);
  return tela;
}
