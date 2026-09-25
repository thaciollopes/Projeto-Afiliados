import { api } from '../api.js';
import {
  el, escapar, moeda, dataHora, modal, confirmar, tentar, ok,
  tabela, acoes, statusEtiqueta, previewWhatsApp,
} from '../ui.js';

// ----------------------------------------------------------------- fila --

export async function renderFila() {
  const tela = el('<div></div>');

  const cabecalho = el(`
    <div class="cartao">
      <div class="cartao-titulo">
        <div><h2>Fila de publicação</h2>
        <p>Tudo que está esperando horário, tentativa ou envio. Nada sai daqui fora da janela do grupo.</p></div>
        <div class="linha">
          <button class="btn" id="processar">▶️ Processar agora</button>
          <button class="btn" id="forcar">⚡ Processar ignorando horário</button>
        </div>
      </div>
      <div id="resumo" class="grade g4"></div>
    </div>`);
  tela.appendChild(cabecalho);

  const area = el('<div class="mt"></div>');
  tela.appendChild(area);

  async function carregar() {
    area.innerHTML = '<div class="carregando">Carregando…</div>';
    const [fila, stats] = await Promise.all([
      api.get('/publicacoes/fila', { limite: 100 }),
      api.get('/publicacoes/estatisticas'),
    ]);

    cabecalho.querySelector('#resumo').innerHTML = `
      ${kpi('Aguardando', stats.na_fila)}
      ${kpi('Enviadas hoje', stats.enviadas_hoje, 'ok')}
      ${kpi('Erros', stats.erros, stats.erros ? 'erro' : '')}
      ${kpi('Próxima', stats.proxima_publicacao ? dataHora(stats.proxima_publicacao.agendado_para).slice(-5) : '—')}`;

    area.innerHTML = '';
    area.appendChild(tabelaPublicacoes(fila.rows, carregar, true));
  }

  cabecalho.querySelector('#processar').onclick = async () => {
    const r = await tentar(() => api.post('/publicacoes/processar', { limite: 20 }));
    if (r) ok(`${r.enviadas} enviada(s), ${r.erros} erro(s), ${r.adiadas} adiada(s)`);
    carregar();
  };
  cabecalho.querySelector('#forcar').onclick = async () => {
    const r = await tentar(() => api.post('/publicacoes/processar', { limite: 20, forcar: true }));
    if (r) ok(`${r.enviadas} enviada(s), ${r.erros} erro(s)`);
    carregar();
  };

  await carregar();
  return tela;
}

// ------------------------------------------------------------ historico --

export async function renderHistorico() {
  const tela = el('<div></div>');

  const cabecalho = el(`
    <div class="cartao">
      <div class="cartao-titulo">
        <div><h2>Histórico de publicações</h2>
        <p>O que foi publicado, com qual preço e qual cupom — do jeito que saiu no grupo.</p></div>
      </div>
      <div class="abas">
        <button class="aba ativa" data-status="">Tudo</button>
        <button class="aba" data-status="enviado">Enviadas</button>
        <button class="aba" data-status="erro">Erros</button>
        <button class="aba" data-status="cancelado">Canceladas</button>
      </div>
    </div>`);
  tela.appendChild(cabecalho);

  const area = el('<div class="mt"></div>');
  tela.appendChild(area);

  let status = '';

  async function carregar() {
    area.innerHTML = '<div class="carregando">Carregando…</div>';
    const dados = await api.get('/publicacoes', { status, limite: 150 });
    area.innerHTML = '';
    area.appendChild(tabelaPublicacoes(dados.rows, carregar, false));
  }

  for (const aba of cabecalho.querySelectorAll('.aba')) {
    aba.onclick = () => {
      cabecalho.querySelectorAll('.aba').forEach((a) => a.classList.remove('ativa'));
      aba.classList.add('ativa');
      status = aba.dataset.status;
      carregar();
    };
  }

  await carregar();
  return tela;
}

// ---------------------------------------------------------------- comum --

function tabelaPublicacoes(linhas, recarregar, ehFila) {
  return tabela({
    vazio: ehFila ? 'Fila vazia.' : 'Nenhuma publicação ainda.',
    colunas: [
      {
        rotulo: 'Mensagem',
        render: (p) => `<span class="pequeno">${escapar(String(p.mensagem || '').split('\n').filter(Boolean)[1] || p.mensagem || '').slice(0, 60)}…</span>`,
      },
      { rotulo: 'Destino', render: (p) => escapar(p.canal_nome) },
      { rotulo: 'Preço', render: (p) => `${moeda(p.preco_final_publicado)}${p.cupom_publicado ? `<br><span class="pequeno texto-fraco">cupom ${escapar(p.cupom_publicado)}</span>` : ''}` },
      { rotulo: ehFila ? 'Agendado' : 'Enviado', render: (p) => dataHora(ehFila ? p.agendado_para : p.enviado_em) },
      { rotulo: 'Tent.', render: (p) => p.tentativas || 0 },
      {
        rotulo: 'Status',
        render: (p) => `${statusEtiqueta(p.status)}${p.dry_run ? '<br><span class="pequeno texto-fraco">simulado</span>' : ''}
          ${p.erro ? `<br><span class="pequeno" style="color:var(--erro)" title="${escapar(p.erro)}">${escapar(p.erro).slice(0, 34)}…</span>` : ''}`,
      },
      {
        rotulo: 'Ações', classe: 'acoes',
        render: (p) => acoes([
          { rotulo: '👁️', titulo: 'Ver mensagem', aoClicar: () => verMensagem(p) },
          p.status !== 'enviado' ? {
            rotulo: '📤', titulo: 'Enviar agora',
            aoClicar: async () => {
              const r = await tentar(() => api.post(`/publicacoes/${p.id}/enviar`));
              if (r?.ok) ok(r.simulado ? 'Simulado (dry run)' : 'Enviado');
              recarregar();
            },
          } : null,
          p.status === 'erro' ? {
            rotulo: '🔁', titulo: 'Tentar de novo',
            aoClicar: async () => {
              await tentar(() => api.post(`/publicacoes/${p.id}/retry`), 'Recolocado na fila');
              recarregar();
            },
          } : null,
          p.status !== 'enviado' ? {
            rotulo: '✖️', titulo: 'Cancelar',
            aoClicar: async () => {
              await tentar(() => api.post(`/publicacoes/${p.id}/cancelar`), 'Cancelada');
              recarregar();
            },
          } : null,
          {
            rotulo: '🗑️', titulo: 'Excluir registro', classe: 'btn-perigo',
            aoClicar: () => confirmar('Excluir este registro?', async () => {
              await tentar(() => api.del(`/publicacoes/${p.id}`), 'Excluído');
              recarregar();
            }),
          },
        ]),
      },
    ],
    linhas,
  });
}

function verMensagem(pub) {
  const corpo = el('<div></div>');
  corpo.appendChild(previewWhatsApp(pub.mensagem, pub.imagem));
  corpo.appendChild(el(`
    <table class="mt" style="background:transparent">
      <tr><td class="texto-fraco">Destino</td><td>${escapar(pub.canal_nome)}</td></tr>
      <tr><td class="texto-fraco">Preço publicado</td><td>${moeda(pub.preco_publicado)} → <strong>${moeda(pub.preco_final_publicado)}</strong></td></tr>
      <tr><td class="texto-fraco">Cupom</td><td>${escapar(pub.cupom_publicado || '—')}</td></tr>
      <tr><td class="texto-fraco">Origem</td><td>${escapar(pub.origem)}</td></tr>
      <tr><td class="texto-fraco">Criado</td><td>${dataHora(pub.criado_em)}</td></tr>
      <tr><td class="texto-fraco">Enviado</td><td>${dataHora(pub.enviado_em)}</td></tr>
      ${pub.erro ? `<tr><td class="texto-fraco">Erro</td><td style="color:var(--erro)">${escapar(pub.erro)}</td></tr>` : ''}
    </table>`));
  modal({ titulo: 'Publicação', corpo, acoes: [{ rotulo: 'Fechar' }] });
}

function kpi(rotulo, valor, classe = '') {
  return `<div class="kpi ${classe}"><div class="valor">${valor}</div><div class="rotulo">${rotulo}</div></div>`;
}
