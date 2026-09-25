import { api } from '../api.js';
import {
  el, escapar, dataHora, modal, confirmar, tentar, ok, erro,
  tabela, acoes, statusEtiqueta, etiqueta,
} from '../ui.js';

// ------------------------------------------------------------- status ---

export async function renderStatus() {
  const tela = el('<div></div>');
  const area = el('<div></div>');
  tela.appendChild(area);

  async function carregar() {
    area.innerHTML = '<div class="carregando">Consultando serviços…</div>';
    const [status, alertas] = await Promise.all([
      api.get('/sistema/status'),
      api.get('/sistema/alertas', { limite: 50 }),
    ]);

    area.innerHTML = '';
    area.appendChild(el(`
      <div class="cartao">
        <div class="cartao-titulo">
          <div><h2>Status do sistema</h2><p>Gerado em ${dataHora(status.gerado_em)}</p></div>
          <button class="btn" id="recarregar">↻ Atualizar</button>
        </div>
        <div class="grade g3">
          ${bloco('Aplicação', status.app.online, [
    ['Versão', status.app.versao], ['Node', status.app.node], ['Ambiente', status.app.ambiente],
    ['No ar há', status.app.uptime_legivel], ['Memória', `${status.app.memoria_mb} MB`],
    ['Modo', status.app.dry_run ? 'SIMULAÇÃO' : 'envio real'], ['Worker', status.app.worker ? 'ligado' : 'desligado'],
  ])}
          ${bloco('Banco de dados', status.banco.online, [
    ['Driver', status.banco.driver], ['Tamanho', `${status.banco.tamanho_mb} MB`],
    ['Produtos', status.banco.produtos], ['Arquivo', status.banco.arquivo],
  ])}
          ${bloco('WhatsApp', status.whatsapp.conectado || status.whatsapp.online, [
    ['Provider', status.whatsapp.provider], ['Sessão', status.whatsapp.session],
    ['Estado', status.whatsapp.status], ['Endereço', status.whatsapp.baseUrl || '—'],
    ['Erro', status.whatsapp.erro || '—'],
  ])}
          ${status.telegram?.em_uso === false ? '' : bloco('Telegram', status.telegram?.online, [
    ['Bot', status.telegram?.bot || '—'], ['Erro', status.telegram?.erro || '—'],
  ])}
          ${bloco('n8n', status.n8n.online, [
    ['Endereço', status.n8n.baseUrl], ['API key', status.n8n.temApiKey ? 'configurada' : 'ausente'],
    ['Workflows', status.n8n.workflows ?? '—'], ['Ativos', status.n8n.ativos ?? '—'],
    ['Erro', status.n8n.erro || '—'],
  ])}
          ${bloco('IA', status.ia.online, [
    ['Provider', status.ia.provider], ['Modelo', status.ia.modelo || '—'], ['Erro', status.ia.erro || '—'],
  ])}
        </div>
      </div>`));

    area.appendChild(el(`
      <div class="cartao mt">
        <h3>Lojas</h3>
        <div class="grade g3">
          ${status.marketplaces.map((m) => `
            <div class="linha">
              <span>${m.com_sessao ? '🟢' : '⚪'}</span>
              <div><strong>${escapar(m.rotulo)}</strong>
                <div class="pequeno texto-fraco">${m.com_sessao ? `cookie salvo (${m.total_cookies})` : 'sem cookie'}
                  · ${m.busca ? 'busca automática' : 'produtos pela extensão'}</div>
                <a class="pequeno" href="#/lojas">abrir em LOJAS</a>
              </div>
            </div>`).join('')}
        </div>
      </div>`));

    const caixaAlertas = el(`
      <div class="cartao mt">
        <div class="cartao-titulo"><h3>Alertas</h3>
          <button class="btn btn-pequeno" id="marcar">Marcar todos como lidos</button></div>
      </div>`);
    caixaAlertas.appendChild(tabela({
      vazio: 'Nenhum alerta.',
      colunas: [
        { rotulo: 'Quando', render: (a) => dataHora(a.criado_em) },
        { rotulo: 'Tipo', render: (a) => etiqueta(a.tipo) },
        { rotulo: 'Alerta', render: (a) => `<strong>${escapar(a.titulo)}</strong><br>
            <span class="pequeno texto-fraco">${escapar(a.detalhe || '')}</span>` },
        { rotulo: 'Nível', render: (a) => statusEtiqueta(a.severidade) },
        { rotulo: 'Lido', render: (a) => (a.lido ? '✔️' : '—') },
      ],
      linhas: alertas.rows,
    }));
    area.appendChild(caixaAlertas);

    caixaAlertas.querySelector('#marcar').onclick = async () => {
      await tentar(() => api.post('/sistema/alertas/marcar-todos'), 'Alertas marcados');
      carregar();
    };
    area.querySelector('#recarregar').onclick = carregar;
  }

  await carregar();
  return tela;
}

function bloco(titulo, online, linhas) {
  return `
    <div class="cartao" style="box-shadow:none">
      <div class="linha"><span style="font-size:17px">${online ? '🟢' : '🔴'}</span><strong>${titulo}</strong></div>
      <table style="background:transparent;margin-top:8px">
        ${linhas.map(([k, v]) => `<tr><td class="texto-fraco pequeno">${k}</td>
          <td class="pequeno" style="word-break:break-all">${escapar(String(v ?? '—'))}</td></tr>`).join('')}
      </table>
    </div>`;
}

// ------------------------------------------------------ configuracoes ---

export async function renderSistema() {
  const tela = el('<div></div>');

  const abas = el(`
    <div class="cartao">
      <div class="cartao-titulo"><div><h2>Sistema</h2>
      <p>Backup, limpeza, logs e ajustes gerais.</p></div></div>
      <div class="abas">
        <button class="aba ativa" data-aba="backup">Backup</button>
        <button class="aba" data-aba="limpeza">Limpeza</button>
        <button class="aba" data-aba="logs">Logs</button>
        <button class="aba" data-aba="ajustes">Ajustes</button>
      </div>
    </div>`);
  tela.appendChild(abas);

  const area = el('<div class="mt"></div>');
  tela.appendChild(area);

  const telas = {
    backup: abaBackup,
    limpeza: abaLimpeza,
    logs: abaLogs,
    ajustes: abaAjustes,
  };

  async function trocar(nome) {
    area.innerHTML = '<div class="carregando">Carregando…</div>';
    const conteudo = await telas[nome]();
    area.innerHTML = '';
    area.appendChild(conteudo);
  }

  for (const aba of abas.querySelectorAll('.aba')) {
    aba.onclick = () => {
      abas.querySelectorAll('.aba').forEach((a) => a.classList.remove('ativa'));
      aba.classList.add('ativa');
      trocar(aba.dataset.aba);
    };
  }

  await trocar('backup');
  return tela;
}

async function abaBackup() {
  const backups = await api.get('/sistema/backups');
  const caixa = el(`
    <div class="cartao">
      <div class="cartao-titulo">
        <div><h3>Backups</h3><p>Cópia do banco + um JSON legível. Guardamos os 15 mais recentes.</p></div>
        <div class="linha">
          <button class="btn" id="exportar">📊 Exportar Excel</button>
          <button class="btn-primario" id="novo">💾 Fazer backup agora</button>
        </div>
      </div>
    </div>`);

  caixa.appendChild(tabela({
    vazio: 'Nenhum backup ainda.',
    colunas: [
      { rotulo: 'Arquivo', render: (b) => `<code class="pequeno">${escapar(b.arquivo)}</code>` },
      { rotulo: 'Tamanho', render: (b) => `${b.tamanho_mb} MB` },
      { rotulo: 'Criado', render: (b) => dataHora(b.criado_em) },
      {
        rotulo: 'Ações', classe: 'acoes',
        render: (b) => acoes([{
          rotulo: '♻️ Restaurar', classe: 'btn-perigo',
          aoClicar: () => confirmar(
            'Restaurar este backup substitui os dados atuais (uma cópia de segurança é criada antes). Continuar?',
            async () => {
              await tentar(() => api.post('/sistema/backups/restaurar', { arquivo: b.arquivo }), 'Backup restaurado');
              location.reload();
            },
          ),
        }]),
      },
    ],
    linhas: backups,
  }));

  caixa.querySelector('#novo').onclick = async () => {
    const r = await tentar(() => api.post('/sistema/backups', { rotulo: 'manual' }));
    if (r) { ok(`Backup criado (${r.tamanho_mb} MB)`); location.hash = '#/sistema'; }
  };
  caixa.querySelector('#exportar').onclick = async () => {
    const r = await tentar(() => api.post('/sistema/exportar', {}));
    if (r) { ok('Planilha gerada'); window.open(r.download, '_blank'); }
  };

  return caixa;
}

async function abaLimpeza() {
  const dados = await api.get('/sistema/limpeza');
  const campos = [
    ['produtos_expirados_dias', 'Produtos expirados há mais de (dias)'],
    ['promocoes_expiradas_dias', 'Promoções expiradas há mais de (dias)'],
    ['cupons_expirados_dias', 'Cupons expirados há mais de (dias)'],
    ['publicacoes_dias', 'Publicações antigas (dias)'],
    ['logs_dias', 'Logs antigos (dias)'],
    ['alertas_lidos_dias', 'Alertas já lidos (dias)'],
  ];

  const caixa = el(`
    <div class="cartao">
      <div class="cartao-titulo">
        <div><h3>Limpeza automática</h3>
        <p>Zero desativa a regra. A prévia mostra quanto seria apagado agora.</p></div>
        <div class="linha">
          <button class="btn" id="salvar">Salvar regras</button>
          <button class="btn-perigo" id="executar">🧹 Limpar agora</button>
        </div>
      </div>
      <div class="campos">
        ${campos.map(([chave, rotulo]) => `
          <div class="campo"><label>${rotulo}</label>
            <input type="number" data-chave="${chave}" value="${dados.regras[chave] ?? 0}"></div>`).join('')}
      </div>
      <h4 class="mt">Prévia</h4>
      <div class="grade g4">
        ${Object.entries(dados.previa).map(([k, v]) => `
          <div class="kpi"><div class="valor">${typeof v === 'boolean' ? (v ? '✔️' : '—') : v}</div>
          <div class="rotulo">${k.replace(/_/g, ' ')}</div></div>`).join('')}
      </div>
    </div>`);

  caixa.querySelector('#salvar').onclick = async () => {
    const regras = {};
    for (const input of caixa.querySelectorAll('[data-chave]')) regras[input.dataset.chave] = Number(input.value) || 0;
    await tentar(() => api.put('/sistema/limpeza', regras), 'Regras salvas');
  };
  caixa.querySelector('#executar').onclick = () => confirmar('Executar a limpeza agora?', async () => {
    const r = await tentar(() => api.post('/sistema/limpeza/executar', {}));
    if (r) ok(`Limpeza feita: ${Object.entries(r.resultado).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  });

  return caixa;
}

async function abaLogs() {
  const caixa = el(`
    <div class="cartao">
      <div class="cartao-titulo">
        <div><h3>Logs</h3><p>Também gravados em <code>storage/logs</code>, um arquivo por dia.</p></div>
        <div class="linha">
          <select id="nivel" style="width:auto">
            <option value="">todos os níveis</option>
            <option value="error">error</option>
            <option value="warn">warn</option>
            <option value="info">info</option>
            <option value="debug">debug</option>
          </select>
          <button class="btn" id="recarregar">↻</button>
        </div>
      </div>
      <div id="lista"></div>
    </div>`);

  async function carregar() {
    const lista = caixa.querySelector('#lista');
    lista.innerHTML = '<div class="carregando">Carregando…</div>';
    const dados = await api.get('/sistema/logs', { level: caixa.querySelector('#nivel').value, limite: 150 });
    lista.innerHTML = '';
    lista.appendChild(tabela({
      vazio: 'Sem logs.',
      colunas: [
        { rotulo: 'Quando', render: (l) => `<span class="pequeno">${dataHora(l.timestamp)}</span>` },
        { rotulo: 'Nível', render: (l) => etiqueta(l.level, l.level === 'error' ? 'erro' : l.level === 'warn' ? 'alerta' : '') },
        { rotulo: 'Serviço', render: (l) => `<span class="pequeno">${escapar(l.service || '')}</span>` },
        { rotulo: 'Mensagem', render: (l) => `<span class="pequeno">${escapar(l.message)}</span>` },
      ],
      linhas: dados.rows,
    }));
  }

  caixa.querySelector('#recarregar').onclick = carregar;
  caixa.querySelector('#nivel').onchange = carregar;
  await carregar();
  return caixa;
}

async function abaAjustes() {
  const config = await api.get('/sistema/config');
  const pesos = config.configuracoes?.score_weights || { vendas: 0.3, avaliacao: 0.2, desconto: 0.3, novidade: 0.1, preco: 0.1 };

  const caixa = el(`
    <div class="cartao">
      <h3>Pesos do score</h3>
      <p class="pequeno texto-fraco">O score ordena os produtos nas campanhas. A soma não precisa dar 1.</p>
      <div class="campos">
        ${Object.entries(pesos).map(([chave, valor]) => `
          <div class="campo"><label>${chave}</label>
            <input type="number" step="0.05" data-peso="${chave}" value="${valor}"></div>`).join('')}
      </div>
      <div class="linha">
        <button class="btn-primario" id="salvar-pesos">Salvar e recalcular</button>
      </div>

      <h3 class="mt">Manutenção</h3>
      <p class="pequeno texto-fraco">Expira cupons/promoções vencidos, marca produtos parados e recalcula scores.</p>
      <button class="btn" id="manutencao">🩺 Rodar manutenção agora</button>

      <h3 class="mt">Configuração atual (do .env)</h3>
      <table style="background:transparent">
        <tr><td class="texto-fraco">Ambiente</td><td>${escapar(config.env)}</td></tr>
        <tr><td class="texto-fraco">Modo simulação (DRY_RUN)</td><td>${config.dryRun ? 'ligado' : 'desligado'}</td></tr>
        <tr><td class="texto-fraco">Worker interno</td><td>${config.workerEnabled ? 'ligado' : 'desligado'}</td></tr>
        <tr><td class="texto-fraco">WhatsApp</td><td>${escapar(config.whatsappProvider)}</td></tr>
        <tr><td class="texto-fraco">IA</td><td>${escapar(config.aiProvider)}</td></tr>
        <tr><td class="texto-fraco">Fuso</td><td>${escapar(config.timezone)}</td></tr>
      </table>
      <p class="pequeno texto-fraco">Esses valores vêm do arquivo <code>.env</code>. Depois de editar, rode <code>REINICIAR.bat</code>.</p>
    </div>`);

  caixa.querySelector('#salvar-pesos').onclick = async () => {
    const novos = {};
    for (const input of caixa.querySelectorAll('[data-peso]')) novos[input.dataset.peso] = Number(input.value) || 0;
    await tentar(() => api.put('/sistema/config', { score_weights: novos }), 'Pesos salvos');
    await tentar(() => api.post('/produtos/recalcular-score'), 'Scores recalculados');
  };
  caixa.querySelector('#manutencao').onclick = async () => {
    const r = await tentar(() => api.post('/sistema/manutencao', {}));
    if (r) ok(`Cupons expirados: ${r.cupons.expirados} · Promoções: ${r.promocoes.expiradas} · Produtos: ${r.produtos.expirados}`);
  };

  return caixa;
}

export { erro, modal };
