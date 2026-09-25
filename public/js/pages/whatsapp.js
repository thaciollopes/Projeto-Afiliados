import { api } from '../api.js';
import {
  el, escapar, dataHora, modal, formulario, confirmar, tentar, ok, erro,
  tabela, acoes, statusEtiqueta, etiqueta,
} from '../ui.js';

// -------------------------------------------------------- conexao WAHA --

export async function renderWhatsApp() {
  const tela = el('<div></div>');
  const area = el('<div></div>');
  tela.appendChild(area);

  async function carregar() {
    area.innerHTML = '<div class="carregando">Consultando WhatsApp…</div>';
    const status = await api.get('/whatsapp/status').catch((e) => ({ online: false, erro: e.message }));

    area.innerHTML = '';
    area.appendChild(el(`
      <div class="cartao">
        <div class="cartao-titulo">
          <div><h2>Conexão do WhatsApp</h2>
          <p>O sistema fala com o WhatsApp através do WAHA. Trocar de provider é mudar uma linha do .env.</p></div>
          <button class="btn" id="recarregar">↻ Verificar</button>
        </div>
        <div class="grade g3">
          <div class="kpi ${status.conectado ? 'ok' : 'erro'}">
            <div class="valor">${status.conectado ? '🟢' : '🔴'}</div>
            <div class="rotulo">${status.conectado ? 'Conectado' : 'Desconectado'}</div>
            <div class="extra">${escapar(status.status || status.erro || '')}</div>
          </div>
          <div class="kpi"><div class="valor" style="font-size:16px">${escapar(status.provider || '—')}</div>
            <div class="rotulo">Provider</div><div class="extra">${escapar(status.baseUrl || 'simulação local')}</div></div>
          <div class="kpi"><div class="valor" style="font-size:16px">${escapar(status.session || '—')}</div>
            <div class="rotulo">Sessão</div><div class="extra">${escapar(status.engine || '')}</div></div>
        </div>
        ${status.aviso ? `<p class="pequeno texto-fraco mt">ℹ️ ${escapar(status.aviso)}</p>` : ''}
        <div class="linha mt">
          <button class="btn" id="iniciar">▶️ Iniciar sessão</button>
          <button class="btn" id="qr">📱 Parear (QR Code)</button>
          <a class="btn" href="#/canais">👥 Gerenciar grupos</a>
        </div>
      </div>`));

    area.appendChild(el(`
      <div class="cartao mt">
        <h3>Como ligar no seu WhatsApp</h3>
        <ol class="pequeno texto-fraco" style="padding-left:18px;line-height:1.9">
          <li>Suba o WAHA (o <code>SUBIR-TUDO.bat</code> já faz isso na porta 3003).</li>
          <li>No <code>.env</code>, coloque <code>WHATSAPP_PROVIDER=waha</code> e confira <code>WAHA_BASE_URL</code>.</li>
          <li>Reinicie o app (<code>REINICIAR.bat</code>) e clique em <strong>Iniciar sessão</strong> aqui.</li>
          <li>Clique em <strong>Parear</strong> e leia o QR com o celular que vai divulgar.</li>
          <li>Vá em <strong>Grupos e canais</strong> e importe os grupos.</li>
          <li>Só desligue o <code>DRY_RUN</code> quando um teste sair do jeito que você quer.</li>
        </ol>
      </div>`));

    area.querySelector('#recarregar').onclick = carregar;
    area.querySelector('#iniciar').onclick = async () => {
      await tentar(() => api.post('/whatsapp/sessao/iniciar'), 'Sessão solicitada');
      carregar();
    };
    area.querySelector('#qr').onclick = async () => {
      const r = await tentar(() => api.get('/whatsapp/qr'));
      if (!r) return;
      modal({
        titulo: 'Parear WhatsApp',
        corpo: r.url
          ? `<p class="pequeno texto-fraco">${escapar(r.instrucoes)}</p>
             <img src="${escapar(r.url)}" alt="QR Code" style="width:100%;max-width:340px;display:block;margin:0 auto"
               onerror="this.replaceWith(document.createTextNode('Não consegui carregar o QR. Abra o painel do WAHA direto no navegador.'))">`
          : `<p>${escapar(r.instrucoes)}</p>`,
        acoes: [{ rotulo: 'Fechar' }],
      });
    };
  }

  await carregar();
  return tela;
}

// ---------------------------------------------------------------- canais --

export async function renderCanais() {
  const CAMPOS = [
    { nome: 'nome', rotulo: 'Nome do grupo/canal', obrigatorio: true, largura: 2 },
    { nome: 'identificador', rotulo: 'Identificador', obrigatorio: true, largura: 2, dica: 'ex.: 1203630000@g.us' },
    { nome: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: [{ valor: 'grupo', rotulo: 'Grupo' }, { valor: 'canal', rotulo: 'Canal' }, { valor: 'contato', rotulo: 'Contato' }] },
    { nome: 'sessao', rotulo: 'Sessão do WAHA', dica: 'normalmente "default"' },
    { nome: 'intervalo_minutos', rotulo: 'Intervalo (min)', tipo: 'number' },
    { nome: 'limite_diario', rotulo: 'Máximo por dia', tipo: 'number' },
    { nome: 'hora_inicio', rotulo: 'Hora inicial', dica: 'HH:MM' },
    { nome: 'hora_fim', rotulo: 'Hora final', dica: 'HH:MM' },
    { nome: 'status', rotulo: 'Status', tipo: 'select', opcoes: ['ativo', 'pausado'] },
    { nome: 'observacoes', rotulo: 'Observações', tipo: 'textarea', linhas: 2, largura: 2 },
  ];

  const tela = el('<div></div>');
  const cabecalho = el(`
    <div class="cartao">
      <div class="cartao-titulo">
        <div><h2>Grupos e canais</h2>
        <p>Cada destino tem o próprio ritmo: intervalo, janela de horário e teto diário.</p></div>
        <div class="linha">
          <button class="btn" id="importar">📲 Importar do WhatsApp</button>
          <button class="btn-primario" id="novo">+ Adicionar manual</button>
        </div>
      </div>
    </div>`);
  tela.appendChild(cabecalho);

  const area = el('<div class="mt"></div>');
  tela.appendChild(area);

  async function carregar() {
    area.innerHTML = '<div class="carregando">Carregando…</div>';
    const dados = await api.get('/canais', { limite: 200 });
    area.innerHTML = '';
    area.appendChild(tabela({
      vazio: 'Nenhum grupo cadastrado. Importe do WhatsApp ou adicione manualmente.',
      colunas: [
        { rotulo: 'Nome', render: (c) => `<strong>${escapar(c.nome)}</strong><br>
            <span class="pequeno texto-fraco">${escapar(c.identificador)}</span>` },
        { rotulo: 'Tipo', render: (c) => etiqueta(c.tipo) },
        { rotulo: 'Ritmo', render: (c) => `${c.intervalo_minutos}min · ${c.hora_inicio}–${c.hora_fim}` },
        { rotulo: 'Teto diário', render: (c) => c.limite_diario || '—' },
        { rotulo: 'Último envio', render: (c) => dataHora(c.ultimo_envio) },
        { rotulo: 'Agora', render: (c) => (c.janela?.aberto ? etiqueta('aceitando', 'ok') : etiqueta(rotuloJanela(c.janela?.motivo), 'alerta')) },
        { rotulo: 'Status', render: (c) => statusEtiqueta(c.status) },
        {
          rotulo: 'Ações', classe: 'acoes',
          render: (c) => acoes([
            { rotulo: '📤', titulo: 'Enviar mensagem de teste', aoClicar: () => testar(c) },
            {
              rotulo: c.status === 'ativo' ? '⏸️' : '▶️', titulo: c.status === 'ativo' ? 'Pausar' : 'Ativar',
              aoClicar: async () => {
                await tentar(() => api.put(`/canais/${c.id}`, { status: c.status === 'ativo' ? 'pausado' : 'ativo' }), 'Atualizado');
                carregar();
              },
            },
            { rotulo: '✏️', titulo: 'Editar', aoClicar: () => abrir(c) },
            {
              rotulo: '🗑️', titulo: 'Remover', classe: 'btn-perigo',
              aoClicar: () => confirmar(`Remover "${c.nome}"?`, async () => {
                await tentar(() => api.del(`/canais/${c.id}`), 'Removido');
                carregar();
              }),
            },
          ]),
        },
      ],
      linhas: dados.rows,
    }));
  }

  function abrir(canal) {
    const form = formulario(CAMPOS, canal || {
      tipo: 'grupo', sessao: 'default', status: 'ativo',
      intervalo_minutos: 30, limite_diario: 20, hora_inicio: '08:00', hora_fim: '22:00',
    });
    modal({
      titulo: canal ? 'Editar grupo' : 'Novo grupo',
      corpo: form,
      acoes: [
        { rotulo: 'Cancelar' },
        {
          rotulo: 'Salvar', classe: 'btn-primario', principal: true,
          aoClicar: async () => {
            const r = await tentar(() => (canal
              ? api.put(`/canais/${canal.id}`, form.ler())
              : api.post('/canais', form.ler())), 'Salvo');
            if (r) carregar();
          },
        },
      ],
    });
  }

  async function testar(canal) {
    const corpo = el(`
      <div>
        <p class="pequeno texto-fraco">Envia uma mensagem agora para <strong>${escapar(canal.nome)}</strong>.
        Em modo simulação nada sai de verdade.</p>
        <div class="campo"><label>Mensagem</label>
          <textarea id="txt" rows="4">Teste do sistema de ofertas ✅</textarea></div>
      </div>`);
    modal({
      titulo: 'Testar publicação',
      corpo,
      acoes: [
        { rotulo: 'Cancelar' },
        {
          rotulo: 'Enviar teste', classe: 'btn-primario', principal: true,
          aoClicar: async () => {
            const r = await tentar(() => api.post(`/canais/${canal.id}/testar`, { texto: corpo.querySelector('#txt').value }));
            if (r) ok(r.simulado ? 'Simulado (dry run ligado)' : 'Mensagem enviada');
          },
        },
      ],
    });
  }

  cabecalho.querySelector('#novo').onclick = () => abrir(null);
  cabecalho.querySelector('#importar').onclick = async () => {
    const corpo = el('<div class="carregando">Buscando grupos no WhatsApp…</div>');
    modal({ titulo: 'Importar do WhatsApp', corpo, acoes: [{ rotulo: 'Fechar' }] });

    let grupos;
    try {
      grupos = await api.get('/canais/disponiveis');
    } catch (e) {
      corpo.classList.remove('carregando');
      corpo.innerHTML = `<p style="color:var(--erro)">${escapar(e.message)}</p>
        <p class="pequeno texto-fraco">Confira a conexão em WHATSAPP > Conexão.</p>`;
      return;
    }

    corpo.classList.remove('carregando');
    corpo.innerHTML = `<p class="pequeno texto-fraco">${grupos.length} grupo(s) na sessão.</p>`;
    const lista = el('<div></div>');
    for (const grupo of grupos) {
      const item = el(`
        <label class="check" style="padding:6px 0;border-bottom:1px solid var(--borda)">
          <input type="checkbox" value="${escapar(grupo.identificador)}" ${grupo.ja_cadastrado ? 'disabled' : ''}>
          <span>${escapar(grupo.nome)}
            <span class="pequeno texto-fraco">${grupo.participantes ? `${grupo.participantes} membros` : ''}
            ${grupo.ja_cadastrado ? '· já cadastrado' : ''}</span>
          </span>
        </label>`);
      item.dataset.nome = grupo.nome;
      lista.appendChild(item);
    }
    corpo.appendChild(lista);

    const botao = el('<button class="btn-primario mt">Importar selecionados</button>');
    botao.onclick = async () => {
      const escolhidos = [...lista.querySelectorAll('input:checked')];
      if (!escolhidos.length) { erro('Selecione ao menos um grupo.'); return; }
      for (const input of escolhidos) {
        await api.post('/canais', {
          nome: input.closest('label').dataset.nome,
          identificador: input.value,
          tipo: 'grupo', provider: 'waha', status: 'ativo',
          intervalo_minutos: 30, limite_diario: 20, hora_inicio: '08:00', hora_fim: '22:00',
        }).catch(() => null);
      }
      ok(`${escolhidos.length} grupo(s) importados`);
      carregar();
    };
    corpo.appendChild(botao);
  };

  await carregar();
  return tela;
}

function rotuloJanela(motivo) {
  return {
    fora_do_horario: 'fora do horário',
    limite_diario: 'teto diário atingido',
    canal_pausado: 'pausado',
  }[motivo] || 'fechado';
}
