import { api } from '../api.js';
import { el, escapar, tentar, ok, erro, etiqueta, confirmar } from '../ui.js';

/**
 * LOJAS — o único lugar onde você coloca suas lojas: a tag de afiliado (o que
 * paga a sua comissão) e o cookie da sua sessão. Tudo o que a tela diz sobre
 * cada loja vem do servidor (`lojas.js`), para não prometer o que não funciona.
 */

const COMO_VIRA_LINK = {
  cookie: 'O sistema gera o seu link curto (meli.la / s.shopee.com.br) usando o cookie.',
  tag: 'A sua tag entra no link de cada produto automaticamente.',
  painel: 'Só o link gerado no painel da loja paga comissão — cole-o no produto.',
};

function situacao(loja) {
  const temCookie = loja.sessao.configurada && !loja.sessao.expirou;
  if (loja.link_afiliado === 'cookie') {
    return temCookie ? { texto: 'pronta', tipo: 'ok' } : { texto: 'falta o cookie', tipo: 'alerta' };
  }
  return loja.tag ? { texto: 'pronta', tipo: 'ok' } : { texto: 'falta a tag', tipo: 'alerta' };
}

function blocoCookie(loja) {
  const s = loja.sessao;
  const estado = !s.configurada
    ? etiqueta('sem cookie')
    : s.expirou
      ? etiqueta('cookie expirado', 'erro')
      : etiqueta(`${s.total_cookies} cookies · salvo em ${new Date(s.salvo_em).toLocaleDateString('pt-BR')}`, 'ok');
  const obrigatorio = loja.link_afiliado === 'cookie';

  return `
    <div class="loja-passo">
      <div class="linha" style="justify-content:space-between">
        <strong>2. Cookie da sessão ${obrigatorio ? '' : '<span class="dica">(opcional)</span>'}</strong>
        ${estado}
      </div>
      <p class="pequeno texto-fraco" style="margin:4px 0 8px">${escapar(loja.dica_cookie)}</p>
      <textarea rows="3" data-cookie="${loja.id}"
        placeholder='Cole aqui o JSON do Cookie Editor: [{"name":"...","value":"..."}]'></textarea>
      <div class="linha" style="margin-top:8px">
        <button class="btn-primario btn-pequeno" data-salvar-cookie="${loja.id}">Salvar cookie</button>
        ${s.configurada ? `<button class="btn-perigo btn-pequeno" data-remover-cookie="${loja.id}">Remover cookie</button>` : ''}
      </div>
    </div>`;
}

function blocoTag(loja) {
  const cfg = loja.tag_config;
  const valorProprio = loja.link_afiliado === 'cookie' && !loja.tag_propria ? '' : (loja.tag || '');
  const usandoApelido = loja.link_afiliado === 'cookie' && loja.tag && !loja.tag_propria;

  return `
    <div class="loja-passo">
      <div class="linha" style="justify-content:space-between">
        <strong>1. ${escapar(cfg.rotulo)} ${cfg.obrigatoria ? '' : '<span class="dica">(opcional)</span>'}</strong>
        ${loja.tag ? etiqueta(usandoApelido ? `usando o apelido: ${loja.tag}` : 'tag salva', 'ok') : etiqueta('sem tag', cfg.obrigatoria ? 'alerta' : '')}
      </div>
      <p class="pequeno texto-fraco" style="margin:4px 0 8px">${escapar(COMO_VIRA_LINK[loja.link_afiliado])}</p>
      <div class="linha">
        <input data-tag="${loja.id}" value="${escapar(valorProprio)}" placeholder="${escapar(cfg.exemplo)}"
          style="flex:1;min-width:180px">
        <button class="btn-primario btn-pequeno" data-salvar-tag="${loja.id}">Salvar tag</button>
      </div>
    </div>`;
}

const EXEMPLO_LINK = {
  mercadolivre: { curto: 'meli.la', produto: 'https://www.mercadolivre.com.br/...' },
  shopee: { curto: 's.shopee.com.br', produto: 'https://shopee.com.br/...-i.123.456' },
};

function blocoLinkCookie(loja, passo) {
  const ex = EXEMPLO_LINK[loja.id] || { curto: 'link curto', produto: 'https://...' };
  return `
    <div class="loja-passo">
      <strong>${passo}. Gerar o link de afiliado (${escapar(ex.curto)})</strong>
      <p class="pequeno texto-fraco" style="margin:4px 0 8px">
        Cole um link de produto (${escapar(loja.nome)}): o sistema gera o link e já confere se o ID
        de afiliado no destino é o seu. Produtos que entram no sistema são convertidos sozinhos.
      </p>
      <div class="linha">
        <input data-link-teste="${loja.id}" placeholder="${escapar(ex.produto)}" style="flex:1;min-width:200px">
        <button class="btn btn-pequeno" data-converter-um="${loja.id}">Converter</button>
        <button class="btn btn-pequeno" data-converter-todos="${loja.id}">Converter todos os produtos</button>
      </div>
      <div data-saida-link="${loja.id}" class="pequeno" style="margin-top:8px"></div>
    </div>`;
}

function blocoConferir(loja, passo) {
  return `
    <div class="loja-passo">
      <strong>${passo}. Conferir se o ID de afiliado é o seu</strong>
      <p class="pequeno texto-fraco" style="margin:4px 0 8px">
        Abre o link como o cliente abriria e lê o ID que chega na loja. Link de outra conta
        fica bloqueado na fila.
      </p>
      <div class="linha">
        <input data-link-conferir="${loja.id}" placeholder="cole um link já publicado" style="flex:1;min-width:200px">
        <button class="btn btn-pequeno" data-conferir-um="${loja.id}">Conferir link</button>
        <button class="btn btn-pequeno" data-conferir-todos="${loja.id}">Conferir os produtos</button>
      </div>
      <div data-saida-conferir="${loja.id}" class="pequeno" style="margin-top:8px"></div>
    </div>`;
}

function textoConferencia(c) {
  if (!c) return '';
  if (c.confere === true) return `<span style="color:var(--ok)">✅ ${escapar(c.motivo)}</span>`;
  if (c.confere === false) return `<span style="color:var(--erro)">❌ ${escapar(c.motivo)}</span>`;
  return `<span style="color:var(--alerta)">⚠️ ${escapar(c.motivo)}</span>`;
}

function blocoBusca(loja, passo) {
  return `
    <div class="loja-passo">
      <strong>${passo}. Testar a busca</strong>
      <p class="pequeno texto-fraco" style="margin:4px 0 8px">
        O sistema procura produtos aqui sozinho. Buscas seguidas demais fazem a loja bloquear
        por alguns minutos — o sistema já espera entre uma e outra.
      </p>
      <button class="btn btn-pequeno" data-testar="${loja.id}">Buscar "perfume feminino"</button>
    </div>`;
}

/** Passos depois de tag e cookie: numerados conforme o que a loja tem. */
function passosExtras(loja) {
  const blocos = [
    loja.converte_por_cookie && blocoLinkCookie,
    loja.busca && blocoBusca,
    loja.conferivel && blocoConferir,
  ].filter(Boolean);
  return blocos.map((bloco, i) => bloco(loja, i + 3)).join('');
}

function cartaoLoja(loja) {
  const sit = situacao(loja);
  return `
    <div class="cartao loja" id="loja-${loja.id}">
      <div class="cartao-titulo" style="margin-bottom:8px">
        <div class="linha" style="gap:8px">
          <h2 style="margin:0">${escapar(loja.nome)}</h2>
          ${etiqueta(sit.texto, sit.tipo)}
        </div>
        <div class="linha">
          <a class="btn btn-pequeno" href="${escapar(loja.site)}" target="_blank" rel="noopener">abrir loja</a>
          <a class="btn btn-pequeno" href="${escapar(loja.painel)}" target="_blank" rel="noopener">painel de afiliado</a>
        </div>
      </div>

      <div class="pequeno loja-resumo">
        <span>${loja.busca ? '🔍 O sistema busca produtos sozinho' : '🧩 Produtos entram pela extensão'}</span>
        <span class="texto-fraco">${escapar(loja.como_entram_produtos)}</span>
      </div>

      <div class="grade g2 mt">
        ${blocoTag(loja)}
        ${blocoCookie(loja)}
      </div>
      ${passosExtras(loja)}
      <div data-saida="${loja.id}" class="pequeno" style="margin-top:8px"></div>
    </div>`;
}

export async function renderLojas() {
  const lojas = await api.get('/marketplaces');
  const prontas = lojas.filter((l) => situacao(l).tipo === 'ok').length;

  const tela = el('<div></div>');
  tela.appendChild(el(`
    <style>
      .loja-passo { background: var(--superficie-2); border-radius: 10px; padding: 12px 14px; margin-top: 12px; }
      .grade .loja-passo { margin-top: 0; }
      .loja-passo textarea, .loja-passo input { width: 100%; box-sizing: border-box; }
      .loja-resumo { display: flex; flex-direction: column; gap: 2px; }
      .lojas-indice a { text-decoration: none; }
    </style>`));

  tela.appendChild(el(`
    <div class="cartao">
      <div class="cartao-titulo">
        <div>
          <h2>Lojas</h2>
          <p>Coloque aqui a sua <strong>tag de afiliado</strong> e o <strong>cookie</strong> de cada loja.
             É isso que faz os links saírem com a sua comissão. ${prontas} de ${lojas.length} prontas.</p>
        </div>
      </div>
      <div class="linha lojas-indice">
        ${lojas.map((l) => {
    const sit = situacao(l);
    return `<a href="#/lojas" data-ir="${l.id}">${etiqueta(`${l.nome}: ${sit.texto}`, sit.tipo)}</a>`;
  }).join('')}
      </div>
      <details class="mt">
        <summary><strong class="pequeno">Como pegar o cookie (1 minuto por loja)</strong></summary>
        <ol class="pequeno texto-fraco" style="padding-left:18px;line-height:1.9;margin:6px 0 0">
          <li>Instale a extensão <a href="https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm" target="_blank" rel="noopener"><strong>Cookie Editor</strong></a> no Chrome.</li>
          <li>Abra a loja (ou o painel de afiliado dela) e <strong>faça login</strong>.</li>
          <li>Clique na extensão → <strong>Export</strong> → <strong>Export as JSON</strong>.</li>
          <li>Cole no campo "Cookie" da loja e clique em <strong>Salvar cookie</strong>.</li>
        </ol>
        <p class="pequeno" style="margin:8px 0 0;color:var(--alerta)">
          ⚠️ Cookie é como senha: dá acesso à sua conta. Fica só neste computador e nunca
          reaparece nesta tela. Ele vence — quando a loja parar de aceitar, cole de novo.
        </p>
      </details>
    </div>`));

  const lista = el(`<div>${lojas.map(cartaoLoja).join('')}</div>`);
  tela.appendChild(lista);

  const recarregar = () => setTimeout(() => window.dispatchEvent(new HashChangeEvent('hashchange')), 600);

  tela.addEventListener('click', async (evento) => {
    const ir = evento.target.closest('[data-ir]');
    if (ir) {
      evento.preventDefault();
      tela.querySelector(`#loja-${ir.dataset.ir}`)?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    const botao = evento.target.closest('button');
    if (!botao) return;
    const d = botao.dataset;

    if (d.salvarTag) {
      const tag = tela.querySelector(`[data-tag="${d.salvarTag}"]`).value.trim();
      const r = await tentar(() => api.put(`/marketplaces/${d.salvarTag}/tag`, { tag }),
        tag ? 'Tag salva' : 'Tag removida');
      if (r?.reaplicados) ok(`${r.reaplicados} produto(s) com o link atualizado`);
      if (r?.links_para_refazer) ok(`${r.links_para_refazer} link(s) meli.la serão gerados de novo com a tag nova`);
      if (r) recarregar();
      return;
    }

    if (d.salvarCookie) {
      const cookies = tela.querySelector(`[data-cookie="${d.salvarCookie}"]`).value.trim();
      if (!cookies) { erro('Cole o cookie primeiro.'); return; }
      const r = await tentar(() => api.put(`/marketplaces/${d.salvarCookie}/sessao`, { cookies }), 'Cookie salvo');
      if (r) recarregar();
      return;
    }

    if (d.removerCookie) {
      confirmar('Remover o cookie desta loja?', async () => {
        await tentar(() => api.del(`/marketplaces/${d.removerCookie}/sessao`), 'Cookie removido');
        recarregar();
      });
      return;
    }

    if (d.testar) {
      const saida = tela.querySelector(`[data-saida="${d.testar}"]`);
      saida.innerHTML = '<span class="texto-fraco">Buscando…</span>';
      const r = await api.post(`/marketplaces/${d.testar}/testar`, { termo: 'perfume feminino', limite: 3 })
        .catch((e) => ({ ok: false, erro: e.message }));
      saida.innerHTML = r.ok
        ? `<span style="color:var(--ok)">✅ ${r.encontrados} produtos encontrados</span><br>`
          + r.exemplos.map((p) => `<span class="texto-fraco">• ${escapar(String(p.titulo).slice(0, 50))} — R$ ${escapar(p.preco)}</span>`).join('<br>')
        : `<span style="color:var(--erro)">❌ ${escapar(r.erro)}</span>`;
      return;
    }

    if (d.converterUm || d.converterTodos) {
      const lojaId = d.converterUm || d.converterTodos;
      const saida = tela.querySelector(`[data-saida-link="${lojaId}"]`);
      saida.innerHTML = '<span class="texto-fraco">Convertendo…</span>';

      if (d.converterUm) {
        const url = tela.querySelector(`[data-link-teste="${lojaId}"]`).value.trim();
        if (!url) { saida.innerHTML = ''; erro('Cole um link de produto.'); return; }
        const r = await api.post(`/marketplaces/${lojaId}/converter-link`, { url })
          .catch((e) => ({ ok: false, erro: e.message }));
        const quem = r.tag ? ` · tag ${escapar(r.tag)}` : r.affiliate_id ? ` · ID ${escapar(r.affiliate_id)}` : '';
        saida.innerHTML = r.ok
          ? `<span style="color:var(--ok)">✅ <a href="${escapar(r.link)}" target="_blank" rel="noopener">${escapar(r.link)}</a></span>
             <span class="texto-fraco">${quem}</span><br>${textoConferencia(r.conferencia)}`
          : `<span style="color:var(--erro)">❌ ${escapar(r.erro)}</span>`;
        return;
      }

      const r = await api.post(`/marketplaces/${lojaId}/converter`, {}).catch((e) => ({ erro: e.message }));
      saida.innerHTML = r.erro
        ? `<span style="color:var(--erro)">❌ ${escapar(r.erro)}</span>`
        : r.mensagem
          ? `<span class="texto-fraco">${escapar(r.mensagem)}</span>`
          : `<span style="color:var(--ok)">✅ ${r.convertidos} convertidos</span>`
            + (r.falhas ? `<span class="texto-fraco"> · ${r.falhas} não elegíveis</span>` : '');
      return;
    }

    if (d.conferirUm || d.conferirTodos) {
      const lojaId = d.conferirUm || d.conferirTodos;
      const saida = tela.querySelector(`[data-saida-conferir="${lojaId}"]`);

      if (d.conferirUm) {
        const url = tela.querySelector(`[data-link-conferir="${lojaId}"]`).value.trim();
        if (!url) { erro('Cole um link.'); return; }
        saida.innerHTML = '<span class="texto-fraco">Abrindo o link…</span>';
        const r = await api.post(`/marketplaces/${lojaId}/verificar-link`, { url })
          .catch((e) => ({ confere: null, motivo: e.message }));
        saida.innerHTML = textoConferencia(r)
          + (r.destino ? `<br><span class="texto-fraco">destino: ${escapar(String(r.destino).slice(0, 120))}</span>` : '');
        return;
      }

      saida.innerHTML = '<span class="texto-fraco">Conferindo (1 link por segundo)…</span>';
      const r = await api.post(`/marketplaces/${lojaId}/verificar`, { limite: 30 })
        .catch((e) => ({ erro: e.message }));
      if (r.erro) { saida.innerHTML = `<span style="color:var(--erro)">❌ ${escapar(r.erro)}</span>`; return; }
      saida.innerHTML = `<span style="color:var(--ok)">✅ ${r.confere} com o seu ID</span>`
        + (r.outra_conta ? ` · <span style="color:var(--erro)">❌ ${r.outra_conta} de outra conta</span>` : '')
        + (r.nao_conferido ? ` · <span style="color:var(--alerta)">⚠️ ${r.nao_conferido} não conferidos</span>` : '')
        + ` <span class="texto-fraco">de ${r.total}</span>`
        + r.problemas.slice(0, 8).map((p) => `<br><span class="texto-fraco">• ${escapar(String(p.produto).slice(0, 40))}: ${escapar(p.motivo)}</span>`).join('');
    }
  });

  return tela;
}
