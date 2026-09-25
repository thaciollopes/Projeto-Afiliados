import { api } from '../api.js';
import { el, moeda, dataHora, graficoBarras, listaProporcional, etiqueta } from '../ui.js';

export async function renderDashboard() {
  const [dados, status] = await Promise.all([
    api.get('/sistema/dashboard'),
    api.get('/sistema/status').catch(() => null),
  ]);

  const p = dados.produtos;
  const pub = dados.publicacoes;

  const tela = el('<div></div>');

  tela.appendChild(el(`
    <div class="grade g4">
      ${kpi('Produtos ativos', p.ativos, `${p.total} no total · ${p.coletados_hoje} hoje`)}
      ${kpi('Promoções ativas', dados.promocoes.ativas, `${dados.promocoes.expiradas} expiradas`)}
      ${kpi('Cupons ativos', dados.cupons.ativos, `${dados.cupons.expirados} expirados`)}
      ${kpi('Campanhas ativas', dados.campanhas.ativas, `${dados.campanhas.pausadas} pausadas`, dados.campanhas.ativas ? 'ok' : '')}
      ${kpi('Publicado hoje', pub.enviadas_hoje, `${pub.enviadas} no total`, 'ok')}
      ${kpi('Na fila', pub.na_fila, pub.proxima_publicacao ? `próxima: ${dataHora(pub.proxima_publicacao.agendado_para)}` : 'fila vazia')}
      ${kpi('Erros', pub.erros, `${pub.erros_hoje} hoje`, pub.erros ? 'erro' : '')}
      ${kpi('Grupos ativos', dados.canais.ativos, `${dados.canais.total} cadastrados`)}
    </div>`));

  // --- status dos servicos ---
  if (status) {
    const servicos = [
      ['Backend', status.app.online, `${status.app.uptime_legivel} no ar`],
      ['Banco', status.banco.online, `${status.banco.driver} · ${status.banco.tamanho_mb} MB`],
      ['WhatsApp', status.whatsapp.conectado || status.whatsapp.online, `${status.whatsapp.provider} · ${status.whatsapp.status || ''}`],
      ['n8n', status.n8n.online, status.n8n.online ? `${status.n8n.workflows ?? '?'} workflows` : (status.n8n.erro || 'offline')],
      ['IA', status.ia.online, status.ia.modelo || status.ia.provider],
    ];
    tela.appendChild(el(`
      <div class="cartao mt">
        <div class="cartao-titulo"><div><h2>Status dos serviços</h2>
        <p>${status.config.dryRun ? 'Modo simulação ligado: nada é enviado de verdade.' : 'Envio real ligado.'}</p></div>
        <a class="btn btn-pequeno" href="#/status">Ver detalhes</a></div>
        <div class="grade g3">
          ${servicos.map(([nome, online, extra]) => `
            <div class="linha">
              <span style="font-size:18px">${online ? '🟢' : '🔴'}</span>
              <div><strong>${nome}</strong><div class="pequeno texto-fraco">${extra || ''}</div></div>
            </div>`).join('')}
        </div>
      </div>`));
  }

  // --- graficos ---
  const graficos = el(`
    <div class="grade g2 mt">
      <div class="cartao"><h3>Publicações por dia (14 dias)</h3><div id="g-pub"></div></div>
      <div class="cartao"><h3>Erros por dia (14 dias)</h3><div id="g-err"></div></div>
      <div class="cartao"><h3>Produtos por marketplace</h3><div id="g-mkt"></div></div>
      <div class="cartao"><h3>Produtos por categoria</h3><div id="g-cat"></div></div>
    </div>`);
  tela.appendChild(graficos);
  graficos.querySelector('#g-pub').appendChild(graficoBarras(dados.graficos.publicacoes_por_dia));
  graficos.querySelector('#g-err').appendChild(graficoBarras(dados.graficos.erros_por_dia));
  graficos.querySelector('#g-mkt').appendChild(listaProporcional(dados.graficos.produtos_por_marketplace));
  graficos.querySelector('#g-cat').appendChild(listaProporcional(dados.graficos.produtos_por_categoria));

  // --- atalhos + alertas ---
  const alertas = await api.get('/sistema/alertas', { lido: 'false', limite: 6 }).catch(() => ({ rows: [] }));
  tela.appendChild(el(`
    <div class="grade g2 mt">
      <div class="cartao">
        <h3>Começar agora</h3>
        <div class="linha">
          <a class="btn" href="#/buscar">🔍 Procurar produtos</a>
          <a class="btn" href="#/promocoes">🏷️ Criar promoção</a>
          <a class="btn" href="#/campanhas">🚀 Criar campanha</a>
          <a class="btn" href="#/canais">👥 Adicionar grupo</a>
          <a class="btn" href="#/templates">✍️ Editar template</a>
        </div>
        <p class="pequeno texto-fraco mt">
          ${p.nunca_publicados} produto(s) nunca publicados — bom material para a próxima campanha.
        </p>
      </div>
      <div class="cartao">
        <h3>Alertas recentes ${dados.alertas.nao_lidos ? etiqueta(`${dados.alertas.nao_lidos} não lidos`, 'alerta') : ''}</h3>
        ${alertas.rows?.length ? alertas.rows.map((a) => `
          <div class="linha" style="border-bottom:1px solid var(--borda);padding:7px 0">
            <span>${a.severidade === 'erro' ? '🔴' : a.severidade === 'atencao' ? '🟡' : 'ℹ️'}</span>
            <div><div>${a.titulo}</div><div class="pequeno texto-fraco">${dataHora(a.criado_em)}</div></div>
          </div>`).join('') : '<p class="texto-fraco pequeno">Nenhum alerta. Tudo tranquilo.</p>'}
      </div>
    </div>`));

  return tela;
}

function kpi(rotulo, valor, extra, classe = '') {
  return `<div class="kpi ${classe}">
    <div class="valor">${valor ?? 0}</div>
    <div class="rotulo">${rotulo}</div>
    ${extra ? `<div class="extra">${extra}</div>` : ''}
  </div>`;
}

export { moeda };
