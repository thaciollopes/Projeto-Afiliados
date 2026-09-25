import { api } from '../api.js';
import { el, escapar, moeda, modal, tentar, ok, erro, etiqueta } from '../ui.js';

/** Onde pegar cada credencial — some da tela quando a loja já está ligada. */
const COMO_OBTER = {
  mercadolivre: {
    titulo: 'Mercado Livre',
    passos: [
      'Entre em <a href="https://developers.mercadolivre.com.br/devcenter" target="_blank" rel="noopener">developers.mercadolivre.com.br/devcenter</a> e clique em "Criar aplicação".',
'Em "URI de redirect" use uma URL <strong>https de domínio próprio</strong> — o Mercado Livre <strong>recusa</strong> URL do domínio dele ("O endereço deve ser válido").',
      'Tem domínio? Use <code>https://seudominio.com.br/oauth/mercadolivre/callback</code> e o retorno é automático. Não tem? Use <code>https://oauth.pstmn.io/v1/callback</code> e copie o código da tela.',
      'Marque as permissões de leitura (read).',
      'Copie <strong>App ID</strong> e <strong>Secret Key</strong> para o <code>.env</code>, nas linhas <code>MERCADOLIVRE_CLIENT_ID</code> e <code>MERCADOLIVRE_CLIENT_SECRET</code>.',
      'Rode <code>REINICIAR.bat</code> e volte aqui para clicar em <strong>Conectar</strong>.',
    ],
  },
  shopee: {
    titulo: 'Shopee',
    passos: [
      'Entre em <a href="https://affiliate.shopee.com.br" target="_blank" rel="noopener">affiliate.shopee.com.br</a> e cadastre-se no programa de afiliados (aprovação não é imediata).',
      'Já aprovado: em <strong>Open API</strong>, gere as credenciais.',
      'Copie <strong>App ID</strong> e <strong>Secret</strong> para o <code>.env</code>, em <code>SHOPEE_APP_ID</code> e <code>SHOPEE_APP_SECRET</code>.',
      'Rode <code>REINICIAR.bat</code>. A Shopee não precisa de autorização no navegador — já funciona.',
    ],
  },
};

export async function renderLojas() {
  const lojas = await api.get('/marketplaces');
  const tela = el('<div></div>');

  tela.appendChild(el(`
    <div class="cartao">
      <div class="cartao-titulo">
        <div><h2>Lojas conectadas</h2>
        <p>De onde os produtos são buscados. Loja sem credencial não devolve nada —
           o sistema nunca inventa produto ou preço.</p></div>
        <button class="btn" id="recarregar">↻ Verificar</button>
      </div>
    </div>`));

  const lista = el('<div class="mt"></div>');
  tela.appendChild(lista);

  for (const loja of lojas) {
    const pronta = loja.implementado && loja.online !== false;
    const precisaAutorizar = loja.implementado && loja.autorizado === false;

    const cartao = el(`
      <div class="cartao">
        <div class="linha" style="align-items:flex-start;gap:14px;flex-wrap:nowrap">
          <div style="font-size:22px;min-width:28px;text-align:center">
            ${pronta ? '🟢' : precisaAutorizar ? '🟡' : '⚪'}
          </div>
          <div style="flex:1;min-width:0">
            <div class="linha" style="gap:8px">
              <strong>${escapar(loja.rotulo)}</strong>
              ${loja.oficial === false ? etiqueta('navegação', 'alerta') : etiqueta('API oficial', 'info')}
              ${pronta ? etiqueta('funcionando', 'ok')
    : precisaAutorizar ? etiqueta('falta autorizar', 'alerta')
      : etiqueta('sem credencial')}
            </div>
            <p class="pequeno texto-fraco" style="margin:4px 0 0">
              ${escapar(loja.motivo || (pronta ? 'Pronta para buscar produtos.' : ''))}
            </p>
            ${loja.user_id ? `<p class="pequeno" style="margin:4px 0 0">Conta: ${escapar(String(loja.user_id))}</p>` : ''}
            ${loja.observacao ? `<p class="pequeno texto-fraco" style="margin:4px 0 0">⚠️ ${escapar(loja.observacao)}</p>` : ''}
          </div>
          <div class="linha" style="gap:6px;white-space:nowrap"></div>
        </div>
        <div class="ajuda" hidden></div>
      </div>`);

    const botoes = cartao.querySelector('.linha .linha');
    const ajuda = cartao.querySelector('.ajuda');

    if (COMO_OBTER[loja.nome] && !pronta) {
      botoes.appendChild(botao('Como conseguir', () => {
        ajuda.hidden = !ajuda.hidden;
        if (!ajuda.innerHTML) {
          ajuda.innerHTML = `
            <ol class="pequeno texto-fraco" style="padding-left:18px;line-height:1.9;margin:12px 0 0">
              ${COMO_OBTER[loja.nome].passos.map((p) => `<li>${p}</li>`).join('')}
            </ol>`;
        }
      }));
    }

    if (loja.nome === 'mercadolivre' && loja.implementado) {
      botoes.appendChild(botao(loja.autorizado ? 'Reconectar' : 'Conectar', () => conectarMercadoLivre(), 'btn-primario'));
      if (loja.autorizado) {
        botoes.appendChild(botao('Desconectar', async () => {
          await tentar(() => api.post('/marketplaces/mercadolivre/desconectar'), 'Desconectado');
          location.reload();
        }, 'btn-perigo'));
      }
    }

    if (loja.oficial === false && !loja.nome.endsWith('-painel')) {
      botoes.appendChild(botao(
        loja.com_sessao ? '🔐 Sessão ativa' : '🔐 Colar cookies',
        () => abrirSessao(loja),
        loja.com_sessao ? '' : 'btn-primario',
      ));
    }

    if (loja.implementado) {
      botoes.appendChild(botao('Testar busca', () => testar(loja)));
    }

    lista.appendChild(cartao);
  }

  tela.appendChild(el(`
    <div class="cartao mt">
      <h3>Duas fontes, e quando usar cada uma</h3>
      <p class="pequeno texto-fraco">
        <strong>API oficial</strong> — estável, link já com sua comissão, não bloqueia. É o que sustenta
        campanha rodando o dia todo.<br>
        <strong>Navegação</strong> — um navegador de verdade lê a página da loja. Resolve quando não há API,
        mas depende do layout e a loja pode bloquear. Nos testes: Amazon trouxe 48 produtos e bloqueou na
        4ª busca seguida; Mercado Livre e Shopee não deixaram passar. Use como complemento, com calma.
      </p>

      <h3 class="mt">Por que não dá para buscar sem credencial</h3>
      <p class="pequeno texto-fraco" style="margin:0">
        Mercado Livre e Shopee fecharam o acesso anônimo: as duas respondem <code>403</code> para
        quem não está autenticado. Existe a alternativa de raspar as páginas do site, mas ela
        quebra a cada mudança de layout e costuma violar os termos do programa de afiliados —
        que é justamente o que paga a comissão. Por isso aqui só entram as APIs oficiais.
      </p>
    </div>`));

  tela.querySelector('#recarregar').onclick = () => location.reload();
  return tela;
}

function botao(rotulo, aoClicar, classe = '') {
  const b = el(`<button class="btn-pequeno ${classe}">${escapar(rotulo)}</button>`);
  b.onclick = aoClicar;
  return b;
}

// ------------------------------------------- conectar Mercado Livre --

async function conectarMercadoLivre() {
  const dados = await tentar(() => api.get('/marketplaces/mercadolivre/autorizar'));
  if (!dados) return;

  const corpo = el(`
    <div>
      <p class="pequeno texto-fraco">
        O Mercado Livre exige que você autorize o aplicativo uma vez. Depois disso o sistema
        renova o acesso sozinho (a autorização vale meses).
      </p>

      <div class="cartao" style="box-shadow:none;background:var(--superficie-2)">
        <strong class="pequeno">1. Abra esta URL e autorize</strong>
        <div class="linha" style="margin-top:8px">
          <a class="btn btn-primario btn-pequeno" href="${escapar(dados.url)}" target="_blank" rel="noopener">
            Abrir autorização do Mercado Livre
          </a>
          <button class="btn-pequeno" id="copiar-url">copiar link</button>
        </div>
      </div>

      <div class="cartao mt" style="box-shadow:none;background:var(--superficie-2)">
        <strong class="pequeno">2. Cole aqui o código que veio na volta</strong>
        <p class="pequeno texto-fraco" style="margin:4px 0 8px">
          Depois de autorizar, o navegador vai para
          <code>${escapar(dados.redirect_uri || 'sua URL de retorno')}?code=<strong>TG-xxxxx</strong></code>.
          Copie o que vem depois de <code>code=</code>.
        </p>
        <input id="ml-code" placeholder="TG-0000000000000000000000-000000000" autocomplete="off">
      </div>

      <p class="pequeno texto-fraco mt">
        O código vale poucos minutos e só pode ser usado uma vez. Se der erro, repita o passo 1.
      </p>
    </div>`);

  corpo.querySelector('#copiar-url').onclick = async () => {
    try { await navigator.clipboard.writeText(dados.url); ok('Link copiado'); }
    catch { ok('Selecione o link e copie com Ctrl+C'); }
  };

  modal({
    titulo: 'Conectar o Mercado Livre',
    corpo,
    acoes: [
      { rotulo: 'Cancelar' },
      {
        rotulo: 'Conectar', classe: 'btn-primario', principal: true,
        aoClicar: async () => {
          const code = corpo.querySelector('#ml-code').value.trim();
          if (!code) { erro('Cole o código primeiro.'); return; }
          const r = await tentar(() => api.post('/marketplaces/mercadolivre/conectar', { code }));
          if (r?.conectado) {
            ok('Mercado Livre conectado!');
            setTimeout(() => location.reload(), 900);
          }
        },
      },
    ],
  });
}

// ------------------------------------------ sessão do navegador --

/**
 * Cookies da sua sessão: é o que faz o navegador entrar logado na loja.
 * O valor nunca volta para a tela — só nomes, quantidade e validade.
 */
async function abrirSessao(loja) {
  const chave = loja.nome.replace(/-web$/, '');
  const atual = await api.get(`/marketplaces/${chave}/sessao`).catch(() => ({ configurada: false }));

  const corpo = el(`
    <div>
      <div class="cartao" style="box-shadow:none;background:var(--alerta-suave);border-color:transparent">
        <strong class="pequeno">⚠️ Cookie de sessão é senha</strong>
        <p class="pequeno" style="margin:4px 0 0">
          Ele dá acesso à sua conta inteira na loja, não só ao painel de afiliado. Fica guardado
          só neste computador, no banco do sistema, e nunca aparece de volta nesta tela.
          Não compartilhe com ninguém.
        </p>
      </div>

      ${atual.configurada ? `
        <div class="cartao mt" style="box-shadow:none;background:var(--superficie-2)">
          <strong class="pequeno">Sessão atual</strong>
          <p class="pequeno texto-fraco" style="margin:4px 0 0">
            ${atual.total_cookies} cookies · salva em ${new Date(atual.salvo_em).toLocaleString('pt-BR')}
            ${atual.expira_em ? `<br>validade: ${new Date(atual.expira_em).toLocaleString('pt-BR')}
              ${atual.expirou ? '<strong style="color:var(--erro)"> (EXPIRADA)</strong>' : ''}` : ''}
            <br>cookies: ${escapar((atual.nomes || []).join(', '))}
          </p>
        </div>` : ''}

      <div class="cartao mt" style="box-shadow:none;background:var(--primaria-suave);border-color:transparent">
        <strong class="pequeno">🤖 Automático (recomendado)</strong>
        <p class="pequeno" style="margin:4px 0 8px">
          O sistema abre um navegador, <strong>você faz login</strong> nele, e ele lê os cookies daquela
          janela. Sem extensão, sem copiar nada.
        </p>
        <div class="linha">
          <button class="btn-pequeno" id="s-abrir">1. Abrir navegador</button>
          <button class="btn-pequeno btn-primario" id="s-capturar">2. Capturar sessão</button>
        </div>
        <p class="pequeno texto-fraco" id="s-auto-msg" style="margin:8px 0 0"></p>
      </div>

      <div class="cartao mt" style="box-shadow:none;background:var(--superficie-2)">
        <strong class="pequeno">✋ Manual (alternativa)</strong>
        <ol class="pequeno texto-fraco" style="padding-left:18px;line-height:1.9;margin:6px 0 0">
          <li>Instale a extensão <strong>Cookie Editor</strong> no Chrome.</li>
          <li>Abra a loja <strong>já logado</strong> (no seu caso, o painel de afiliado).</li>
          <li>Clique na extensão → botão <strong>Export</strong> → <strong>Export as JSON</strong>.</li>
          <li>Cole abaixo e salve.</li>
        </ol>
      </div>

      <div class="campo mt">
        <label>Cookies (JSON do Cookie Editor, ou "nome=valor; nome2=valor2")</label>
        <textarea id="s-cookies" rows="7" placeholder='[{"name":"ssid","value":"...","domain":".loja.com.br"}]'></textarea>
      </div>
    </div>`);

  const msg = (texto, cor = 'var(--texto-fraco)') => {
    const alvo = corpo.querySelector('#s-auto-msg');
    if (alvo) { alvo.textContent = texto; alvo.style.color = cor; }
  };

  corpo.querySelector('#s-abrir').onclick = async () => {
    msg('Abrindo o navegador…');
    const r = await tentar(() => api.post(`/marketplaces/${chave}/captura/abrir`, {}));
    if (r?.aberto) msg(`Navegador aberto (${r.navegador}). Faça login e deixe a janela aberta.`, 'var(--ok)');
  };

  corpo.querySelector('#s-capturar').onclick = async () => {
    msg('Lendo os cookies da janela…');
    const r = await tentar(() => api.post(`/marketplaces/${chave}/captura/capturar`, {}));
    if (r?.configurada) {
      ok(`${r.total_cookies} cookies capturados`);
      setTimeout(() => location.reload(), 900);
    } else {
      msg('Não consegui capturar. Confira se a janela está aberta e logada.', 'var(--erro)');
    }
  };

  modal({
    titulo: `Sessão — ${loja.rotulo}`,
    corpo,
    largura: 'min(720px, 100%)',
    acoes: [
      { rotulo: 'Fechar' },
      ...(atual.configurada ? [{
        rotulo: 'Remover sessão', classe: 'btn-perigo',
        aoClicar: async () => {
          await tentar(() => api.del(`/marketplaces/${chave}/sessao`), 'Sessão removida');
          setTimeout(() => location.reload(), 700);
        },
      }] : []),
      {
        rotulo: 'Salvar sessão', classe: 'btn-primario', principal: true,
        aoClicar: async () => {
          const cookies = corpo.querySelector('#s-cookies').value.trim();
          if (!cookies) { erro('Cole os cookies primeiro.'); return; }
          const r = await tentar(() => api.put(`/marketplaces/${chave}/sessao`, { cookies }));
          if (r?.configurada) {
            ok(`${r.total_cookies} cookies salvos — o navegador agora entra logado`);
            setTimeout(() => location.reload(), 900);
          }
        },
      },
    ],
  });
}

// --------------------------------------------------- teste de busca --

async function testar(loja) {
  const corpo = el('<div class="carregando">Buscando na loja…</div>');
  modal({ titulo: `Teste de busca — ${loja.rotulo}`, corpo, acoes: [{ rotulo: 'Fechar' }] });

  const r = await api.post(`/marketplaces/${loja.nome}/testar`, { termo: 'perfume feminino', limite: 3 })
    .catch((e) => ({ ok: false, erro: e.message }));

  corpo.classList.remove('carregando');

  if (!r.ok) {
    corpo.innerHTML = `
      <p style="color:var(--erro)"><strong>Não funcionou:</strong></p>
      <p class="pequeno">${escapar(r.erro)}</p>
      <p class="pequeno texto-fraco mt">
        Confira as credenciais no <code>.env</code> e rode <code>REINICIAR.bat</code>.
      </p>`;
    return;
  }

  corpo.innerHTML = `<p style="color:var(--ok)"><strong>Funcionou!</strong> ${r.encontrados} produto(s) encontrados.</p>`;
  for (const p of r.exemplos) {
    corpo.appendChild(el(`
      <div class="cartao" style="box-shadow:none;background:var(--superficie-2)">
        <strong class="pequeno">${escapar(p.titulo)}</strong>
        <div class="pequeno texto-fraco">
          ${p.preco_anterior ? `<s>${moeda(p.preco_anterior)}</s> ` : ''}${moeda(p.preco)}
          ${p.vendas ? ` · ${p.vendas} vendidos` : ''}${p.avaliacao ? ` · ⭐ ${p.avaliacao}` : ''}
        </div>
      </div>`));
  }
  corpo.appendChild(el('<p class="pequeno texto-fraco mt">Agora é só usar <strong>PRODUTOS → Procurar produtos</strong> escolhendo esta loja.</p>'));
}
