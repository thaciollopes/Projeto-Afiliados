import { api } from '../api.js';
import { el, escapar, tentar, ok, erro, etiqueta } from '../ui.js';

/**
 * CONECTAR LOJAS — uma área por loja: cola o cookie, cola a sua etiqueta,
 * testa. É o caminho mais direto para o sistema buscar produtos como você.
 */

const LOJAS = [
  {
    id: 'mercadolivre',
    nome: 'Mercado Livre',
    site: 'https://www.mercadolivre.com.br',
    painel: 'https://www.mercadolivre.com.br/afiliados/hub',
    // No ML a "tag" do link e o apelido da conta (cookie orgnickp) ou uma tag
    // criada no painel. Em branco, o sistema usa o apelido sozinho.
    etiqueta: { campo: 'Tag de afiliado (opcional)', exemplo: 'vazio = usa o apelido da conta' },
  },
  {
    id: 'shopee',
    nome: 'Shopee',
    site: 'https://shopee.com.br',
    painel: 'https://affiliate.shopee.com.br',
    etiqueta: { campo: 'ID de afiliado', exemplo: '18300000000' },
  },
  {
    id: 'amazon',
    nome: 'Amazon',
    site: 'https://www.amazon.com.br',
    painel: 'https://associados.amazon.com.br',
    etiqueta: { campo: 'Tag de associado', exemplo: 'seuid-20' },
  },
  {
    id: 'magalu',
    nome: 'Magazine Luiza',
    site: 'https://www.magazineluiza.com.br',
    painel: 'https://www.magazinevoce.com.br',
    etiqueta: { campo: 'ID do parceiro', exemplo: 'seu_id' },
  },
];

export async function renderConectar() {
  const [sessoes, afiliados] = await Promise.all([
    api.get('/marketplaces/sessoes/todas').catch(() => []),
    api.get('/afiliados', { limite: 100 }).catch(() => ({ rows: [] })),
  ]);

  const tela = el('<div></div>');

  tela.appendChild(el(`
    <div class="cartao">
      <div class="cartao-titulo">
        <div><h2>Conectar lojas</h2>
        <p>Cole o cookie da sua sessão e a sua etiqueta de afiliado. Com isso o sistema
           busca produtos como se fosse você, e os links saem com a sua comissão.</p></div>
      </div>
      <div class="cartao" style="box-shadow:none;background:var(--superficie-2)">
        <strong class="pequeno">Como pegar o cookie (1 minuto, por loja)</strong>
        <ol class="pequeno texto-fraco" style="padding-left:18px;line-height:1.9;margin:6px 0 0">
          <li>Instale a extensão <a href="https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm" target="_blank" rel="noopener"><strong>Cookie Editor</strong></a> no Chrome.</li>
          <li>Abra a loja e <strong>faça login</strong> com a conta de afiliado.</li>
          <li>Clique na extensão → <strong>Export</strong> → <strong>Export as JSON</strong>.</li>
          <li>Cole no campo da loja aqui embaixo e salve.</li>
        </ol>
        <p class="pequeno" style="margin:8px 0 0;color:var(--alerta)">
          ⚠️ Cookie é senha: dá acesso à sua conta na loja. Fica guardado só neste computador
          e nunca reaparece nesta tela. Ele envelhece — quando a busca falhar, capture de novo.
        </p>
      </div>
    </div>`));

  const lista = el('<div class="mt"></div>');
  tela.appendChild(lista);

  for (const loja of LOJAS) {
    const sessao = sessoes.find((s) => s.loja === loja.id) || { configurada: false };
    const programa = afiliados.rows?.find((a) => a.marketplace === loja.id);

    const cartao = el(`
      <div class="cartao">
        <div class="cartao-titulo" style="margin-bottom:10px">
          <div class="linha" style="gap:8px">
            <strong style="font-size:15px">${escapar(loja.nome)}</strong>
            ${sessao.configurada
    ? etiqueta(sessao.expirou ? 'cookie expirado' : `${sessao.total_cookies} cookies`, sessao.expirou ? 'erro' : 'ok')
    : etiqueta('sem cookie')}
            ${programa?.identificador ? etiqueta('etiqueta ok', 'ok') : etiqueta('sem etiqueta', 'alerta')}
          </div>
          <div class="linha">
            <a class="btn btn-pequeno" href="${loja.site}" target="_blank" rel="noopener">abrir loja</a>
            <a class="btn btn-pequeno" href="${loja.painel}" target="_blank" rel="noopener">painel de afiliado</a>
          </div>
        </div>

        <div class="campos">
          <div class="campo" style="grid-column:span 2">
            <label>Cookie (JSON do Cookie Editor)
              ${sessao.configurada ? `<span class="dica">— salvo em ${new Date(sessao.salvo_em).toLocaleString('pt-BR')}</span>` : ''}
            </label>
            <textarea rows="4" data-cookie="${loja.id}"
              placeholder='Cole aqui o JSON exportado: [{"name":"...","value":"...","domain":"..."}]'></textarea>
          </div>
          <div class="campo">
            <label>${escapar(loja.etiqueta.campo)} <span class="dica">sua comissão</span></label>
            <input data-etiqueta="${loja.id}" value="${escapar(programa?.identificador || '')}"
              placeholder="${escapar(loja.etiqueta.exemplo)}">
          </div>
          <div class="campo" style="display:flex;align-items:flex-end;gap:6px">
            <button class="btn-primario" data-salvar="${loja.id}">Salvar</button>
            <button class="btn" data-testar="${loja.id}">${loja.id === 'mercadolivre' ? 'Testar sessão' : 'Testar busca'}</button>
            ${sessao.configurada ? `<button class="btn-perigo btn-pequeno" data-remover="${loja.id}">Remover</button>` : ''}
          </div>
        </div>
        <div data-saida="${loja.id}" class="pequeno" style="margin-top:8px"></div>
        ${loja.id === 'mercadolivre' ? `
        <div class="cartao mt" style="box-shadow:none;background:var(--superficie-2)">
          <strong class="pequeno">🔗 Link de afiliado (meli.la)</strong>
          <p class="pequeno texto-fraco" style="margin:4px 0 8px">
            É isto que paga comissão no Mercado Livre. Com o cookie salvo, todo produto do ML que
            entra no sistema já é convertido sozinho. Aqui você testa um link ou converte os que faltam.
          </p>
          <div class="linha">
            <input data-link-teste placeholder="Cole o link de um produto do Mercado Livre" style="flex:1;min-width:220px">
            <button class="btn" data-converter-um>Converter</button>
            <button class="btn-primario" data-converter-todos>Converter todos os produtos</button>
          </div>
          <div data-saida-link class="pequeno" style="margin-top:8px"></div>
        </div>` : ''}
      </div>`);

    lista.appendChild(cartao);
  }

  // --- ações ---
  lista.addEventListener('click', async (evento) => {
    const botao = evento.target.closest('button');
    if (!botao) return;

    if (botao.hasAttribute('data-converter-um') || botao.hasAttribute('data-converter-todos')) {
      const saidaLink = lista.querySelector('[data-saida-link]');
      saidaLink.innerHTML = '<span class="texto-fraco">Convertendo…</span>';

      if (botao.hasAttribute('data-converter-um')) {
        const url = lista.querySelector('[data-link-teste]').value.trim();
        if (!url) { saidaLink.innerHTML = ''; erro('Cole um link de produto do Mercado Livre.'); return; }
        const r = await api.post('/marketplaces/mercadolivre/converter-link', { url })
          .catch((e) => ({ ok: false, erro: e.message }));
        saidaLink.innerHTML = r.ok
          ? `<span style="color:var(--ok)">✅ <a href="${escapar(r.link)}" target="_blank" rel="noopener">${escapar(r.link)}</a></span>
             <span class="texto-fraco"> · tag ${escapar(r.tag)}</span>`
          : `<span style="color:var(--erro)">❌ ${escapar(r.erro)}</span>`;
      } else {
        const r = await api.post('/marketplaces/mercadolivre/converter', {})
          .catch((e) => ({ erro: e.message }));
        saidaLink.innerHTML = r.erro
          ? `<span style="color:var(--erro)">❌ ${escapar(r.erro)}</span>`
          : r.mensagem
            ? `<span class="texto-fraco">${escapar(r.mensagem)}</span>`
            : `<span style="color:var(--ok)">✅ ${r.convertidos} convertidos</span>`
              + (r.falhas ? `<span class="texto-fraco"> · ${r.falhas} não elegíveis (propaganda/lista)</span>` : '');
      }
      return;
    }

    const salvar = botao.dataset.salvar;
    const testar = botao.dataset.testar;
    const remover = botao.dataset.remover;
    const lojaId = salvar || testar || remover;
    if (!lojaId) return;

    const loja = LOJAS.find((l) => l.id === lojaId);
    const saida = lista.querySelector(`[data-saida="${lojaId}"]`);
    const cookie = lista.querySelector(`[data-cookie="${lojaId}"]`).value.trim();
    const etiquetaValor = lista.querySelector(`[data-etiqueta="${lojaId}"]`).value.trim();

    if (remover) {
      await tentar(() => api.del(`/marketplaces/${lojaId}/sessao`), 'Cookie removido');
      setTimeout(() => location.reload(), 700);
      return;
    }

    if (salvar) {
      saida.innerHTML = '<span class="texto-fraco">Salvando…</span>';
      let mensagens = [];

      if (cookie) {
        const r = await api.put(`/marketplaces/${lojaId}/sessao`, { cookies: cookie })
          .catch((e) => ({ erro: e.message }));
        mensagens.push(r.erro
          ? `<span style="color:var(--erro)">❌ cookie: ${escapar(r.erro)}</span>`
          : `<span style="color:var(--ok)">✅ ${r.total_cookies} cookies salvos</span>`);
      }

      if (etiquetaValor) {
        const r = await salvarEtiqueta(loja, etiquetaValor).catch((e) => ({ erro: e.message }));
        mensagens.push(r.erro
          ? `<span style="color:var(--erro)">❌ etiqueta: ${escapar(r.erro)}</span>`
          : '<span style="color:var(--ok)">✅ etiqueta salva</span>');
      }

      if (!mensagens.length) { erro('Preencha o cookie ou a etiqueta.'); return; }
      saida.innerHTML = mensagens.join(' · ');
      ok('Salvo');
      setTimeout(() => location.reload(), 1200);
      return;
    }

    if (testar && lojaId === 'mercadolivre') {
      saida.innerHTML = '<span class="texto-fraco">Testando a sessão (gerando um link de afiliado)…</span>';
      const r = await api.post('/marketplaces/mercadolivre/converter-link', {
        url: 'https://www.mercadolivre.com.br/ofertas',
      }).catch((e) => ({ ok: false, erro: e.message }));
      saida.innerHTML = /cookie|sessão|csrf|expirou/i.test(r.erro || '')
        ? `<span style="color:var(--erro)">❌ ${escapar(r.erro)}</span>`
        : '<span style="color:var(--ok)">✅ Sessão aceita pelo Mercado Livre. Teste um produto no campo "Link de afiliado" abaixo.</span>';
      return;
    }

    if (testar) {
      saida.innerHTML = '<span class="texto-fraco">Buscando "perfume feminino" na loja…</span>';
      const r = await api.post(`/marketplaces/${lojaId}-cookie/testar`, { termo: 'perfume feminino', limite: 3 })
        .catch((e) => ({ ok: false, erro: e.message }));

      if (!r.ok) {
        saida.innerHTML = `<span style="color:var(--erro)">❌ ${escapar(r.erro)}</span>`;
        return;
      }
      saida.innerHTML = `<span style="color:var(--ok)">✅ ${r.encontrados} produtos</span><br>`
        + r.exemplos.map((p) => `<span class="texto-fraco">• ${escapar(String(p.titulo).slice(0, 44))} — R$ ${p.preco}</span>`).join('<br>');
    }
  });

  return tela;
}

/** A etiqueta mora no cadastro de afiliados; esta tela só é um atalho para ela. */
async function salvarEtiqueta(loja, identificador) {
  const atuais = await api.get('/afiliados', { limite: 100 });
  const existente = atuais.rows?.find((a) => a.marketplace === loja.id);

  if (existente) {
    return api.put(`/afiliados/${existente.id}`, { identificador });
  }
  return api.post('/afiliados', {
    nome: loja.nome,
    marketplace: loja.id,
    identificador,
    ativo: true,
  });
}
