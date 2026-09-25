import { api } from '../api.js';
import {
  el, escapar, moeda, dataCurta, modal, formulario, confirmar, tentar, ok, erro,
  tabela, acoes, statusEtiqueta, previewWhatsApp, etiqueta,
} from '../ui.js';

const CAMPOS_PRODUTO = [
  { nome: 'titulo_original', rotulo: 'Título', obrigatorio: true, largura: 2 },
  { nome: 'titulo_publicacao', rotulo: 'Título para publicação', dica: 'opcional', largura: 2 },
  { nome: 'marketplace', rotulo: 'Marketplace', obrigatorio: true },
  { nome: 'external_id', rotulo: 'ID na loja', dica: 'opcional' },
  { nome: 'categoria', rotulo: 'Categoria' },
  { nome: 'subcategoria', rotulo: 'Subcategoria' },
  { nome: 'preco_atual', rotulo: 'Preço atual (R$)', tipo: 'number', passo: '0.01' },
  { nome: 'preco_anterior', rotulo: 'Preço anterior (R$)', tipo: 'number', passo: '0.01', dica: 'o "de" riscado' },
  { nome: 'url_original', rotulo: 'Link original', largura: 2 },
  { nome: 'url_afiliado', rotulo: 'Link de afiliado', largura: 2 },
  { nome: 'imagem_principal', rotulo: 'Imagem (URL)', largura: 2 },
  { nome: 'avaliacao', rotulo: 'Avaliação', tipo: 'number', passo: '0.1' },
  { nome: 'quantidade_vendas', rotulo: 'Vendas', tipo: 'number' },
  { nome: 'status', rotulo: 'Status', tipo: 'select', opcoes: ['ativo', 'pausado', 'expirado', 'arquivado'] },
  { nome: 'disponibilidade', rotulo: 'Disponibilidade', tipo: 'select', opcoes: ['disponivel', 'indisponivel'] },
  { nome: 'frete_gratis', rotulo: 'Frete grátis', tipo: 'checkbox' },
  { nome: 'descricao_original', rotulo: 'Descrição', tipo: 'textarea', linhas: 4, largura: 2 },
];

// ----------------------------------------------------------- lista --

export async function renderProdutos() {
  const tela = el('<div></div>');

  const filtros = el(`
    <div class="cartao">
      <div class="cartao-titulo">
        <div><h2>Produtos cadastrados</h2><p>Base central usada por campanhas, promoções e publicações.</p></div>
        <div class="linha">
          <button class="btn-primario" id="novo">+ Novo produto</button>
          <a class="btn" href="#/buscar">🔍 Procurar em lojas</a>
        </div>
      </div>
      <div class="campos">
        <div class="campo"><label>Busca</label><input id="f-busca" placeholder="perfume, batom…"></div>
        <div class="campo"><label>Marketplace</label><input id="f-mkt" placeholder="amazon, mercadolivre…"></div>
        <div class="campo"><label>Categoria</label><input id="f-cat"></div>
        <div class="campo"><label>Status</label>
          <select id="f-status"><option value="">todos</option><option>ativo</option><option>pausado</option><option>expirado</option></select>
        </div>
        <div class="campo"><label>Preço máx.</label><input id="f-preco" type="number" step="0.01"></div>
        <div class="campo"><label>Desconto mín. (%)</label><input id="f-desc" type="number"></div>
        <div class="campo"><label>Ordenar</label>
          <select id="f-ord">
            <option value="score DESC">melhor score</option>
            <option value="quantidade_vendas DESC">mais vendidos</option>
            <option value="desconto_percentual DESC">maior desconto</option>
            <option value="preco_atual ASC">menor preço</option>
            <option value="avaliacao DESC">melhor avaliação</option>
            <option value="data_coleta DESC">mais recentes</option>
          </select>
        </div>
        <div class="campo" style="display:flex;align-items:flex-end"><button id="aplicar" class="btn">Aplicar filtros</button></div>
      </div>
    </div>`);
  tela.appendChild(filtros);

  const area = el('<div class="mt"></div>');
  tela.appendChild(area);

  const selecionados = new Set();

  async function carregar() {
    area.innerHTML = '<div class="carregando">Carregando…</div>';
    const dados = await api.get('/produtos', {
      busca: filtros.querySelector('#f-busca').value,
      marketplace: filtros.querySelector('#f-mkt').value,
      categoria: filtros.querySelector('#f-cat').value,
      status: filtros.querySelector('#f-status').value,
      preco_max: filtros.querySelector('#f-preco').value,
      desconto_min: filtros.querySelector('#f-desc').value,
      ordenar: filtros.querySelector('#f-ord').value,
      limite: 60,
    });

    area.innerHTML = '';
    area.appendChild(barraSelecao(selecionados, carregar));
    area.appendChild(el(`<p class="pequeno texto-fraco">${dados.total} produto(s) encontrados.</p>`));
    area.appendChild(gradeProdutos(dados.rows, {
      selecionados,
      aoMudar: () => { area.querySelector('#barra-sel').replaceWith(barraSelecao(selecionados, carregar)); },
      aoEditar: (produto) => abrirEditor(produto, carregar),
      aoRemover: (produto) => confirmar(`Remover "${produto.titulo_original}"?`, async () => {
        await tentar(() => api.del(`/produtos/${produto.id}`), 'Produto removido');
        carregar();
      }),
    }));
  }

  filtros.querySelector('#aplicar').onclick = carregar;
  filtros.querySelector('#f-busca').onkeydown = (e) => { if (e.key === 'Enter') carregar(); };
  filtros.querySelector('#novo').onclick = () => abrirEditor(null, carregar);

  await carregar();
  return tela;
}

function barraSelecao(selecionados, recarregar) {
  const barra = el(`
    <div class="cartao" id="barra-sel" style="${selecionados.size ? '' : 'display:none'}">
      <div class="linha">
        <strong>${selecionados.size} selecionado(s)</strong>
        <span class="espaco"></span>
        <button class="btn-pequeno" id="sel-publicar">📤 Publicar selecionados</button>
        <button class="btn-pequeno" id="sel-campanha">🚀 Criar campanha</button>
        <button class="btn-pequeno btn-perigo" id="sel-apagar">🗑️ Apagar selecionados</button>
        <button class="btn-pequeno" id="sel-limpar">Limpar seleção</button>
      </div>
    </div>`);

  barra.querySelector('#sel-limpar').onclick = () => { selecionados.clear(); recarregar(); };
  barra.querySelector('#sel-publicar').onclick = () => abrirPublicacaoEmLote([...selecionados]);
  barra.querySelector('#sel-campanha').onclick = () => criarCampanhaCom([...selecionados]);
  barra.querySelector('#sel-apagar').onclick = () => confirmar(
    `Apagar ${selecionados.size} produto(s) da base? O histórico de publicações continua.`,
    async () => {
      let apagados = 0;
      for (const id of [...selecionados]) {
        if (await api.del(`/produtos/${id}`).catch(() => null)) apagados += 1;
      }
      ok(`${apagados} produto(s) apagado(s)`);
      selecionados.clear();
      recarregar();
    },
  );
  return barra;
}

export function gradeProdutos(produtos, { selecionados, aoMudar, aoEditar, aoRemover, modoBusca = false } = {}) {
  if (!produtos.length) return el('<div class="cartao"><div class="vazio">Nenhum produto encontrado.</div></div>');

  const grade = el('<div class="produtos-grade"></div>');

  for (const produto of produtos) {
    const id = produto.id || produto.external_id;
    const desconto = Number(produto.desconto_percentual) || 0;
    const cartao = el(`
      <div class="produto ${selecionados?.has(id) ? 'escolhido' : ''}">
        ${selecionados ? `<input type="checkbox" class="selecionar" ${selecionados.has(id) ? 'checked' : ''}>` : ''}
        ${desconto >= 5 ? `<span class="selo">-${desconto}%</span>` : ''}
        <img src="${escapar(produto.imagem_principal || '/assets/sem-imagem.svg')}" alt="" loading="lazy"
             onerror="this.src='/assets/sem-imagem.svg'">
        <div class="corpo">
          <div class="titulo">${escapar(produto.titulo_publicacao || produto.titulo_original)}</div>
          <div class="preco">
            ${produto.preco_anterior ? `<s>${moeda(produto.preco_anterior)}</s>` : ''}
            ${moeda(produto.preco_atual)}
          </div>
          <div class="meta">
            <span>${escapar(produto.marketplace)}</span>
            ${produto.avaliacao ? `<span>⭐ ${produto.avaliacao}</span>` : ''}
            ${produto.quantidade_vendas ? `<span>🛒 ${produto.quantidade_vendas}</span>` : ''}
          </div>
          <div class="meta">
            ${produto.categoria ? etiqueta(produto.categoria) : ''}
            ${produto.ja_cadastrado ? etiqueta('já cadastrado', 'ok') : ''}
            ${produto.status && !modoBusca ? statusEtiqueta(produto.status) : ''}
          </div>
          <div class="linha" style="margin-top:auto;gap:5px"></div>
        </div>
      </div>`);

    const barraBotoes = cartao.querySelector('.linha');
    if (!modoBusca) {
      barraBotoes.appendChild(botao('👁️', 'Ver e testar publicação', () => abrirDetalhe(produto)));
      barraBotoes.appendChild(botao('✏️', 'Editar', () => aoEditar?.(produto)));
      barraBotoes.appendChild(botao('✨', 'Melhorar com IA', () => abrirIa(produto)));
      barraBotoes.appendChild(botao('🗑️', 'Remover', () => aoRemover?.(produto), 'btn-perigo'));
    }

    const check = cartao.querySelector('.selecionar');
    if (check) {
      check.onchange = () => {
        if (check.checked) selecionados.add(id); else selecionados.delete(id);
        cartao.classList.toggle('escolhido', check.checked);
        aoMudar?.();
      };
    }
    grade.appendChild(cartao);
  }
  return grade;
}

function botao(rotulo, titulo, aoClicar, classe = '') {
  const b = el(`<button class="btn-pequeno ${classe}" title="${escapar(titulo)}">${rotulo}</button>`);
  b.onclick = aoClicar;
  return b;
}

// ------------------------------------------------------- editor/detalhe --

function abrirEditor(produto, aoSalvar) {
  const form = formulario(CAMPOS_PRODUTO, produto || { status: 'ativo', disponibilidade: 'disponivel', marketplace: 'manual' });
  modal({
    titulo: produto ? 'Editar produto' : 'Novo produto',
    corpo: form,
    acoes: [
      { rotulo: 'Cancelar' },
      {
        rotulo: 'Salvar', classe: 'btn-primario', principal: true,
        aoClicar: async () => {
          const dados = form.ler();
          const r = await tentar(
            () => (produto ? api.put(`/produtos/${produto.id}`, dados) : api.post('/produtos', dados)),
            'Produto salvo',
          );
          if (r) aoSalvar?.();
        },
      },
    ],
  });
}

export async function abrirDetalhe(produto) {
  const corpo = el('<div><div class="carregando">Montando pré-visualização…</div></div>');
  modal({ titulo: produto.titulo_original, corpo, acoes: [{ rotulo: 'Fechar' }] });

  const [detalhe, canais, templates] = await Promise.all([
    api.get(`/produtos/${produto.id}`),
    api.get('/canais', { limite: 100 }),
    api.get('/templates', { limite: 50 }),
  ]);

  corpo.innerHTML = '';
  const precos = detalhe.precos;

  corpo.appendChild(el(`
    <div class="grade g2">
      <div>
        <img src="${escapar(detalhe.imagem_principal || '/assets/sem-imagem.svg')}" style="width:100%;border-radius:10px">
      </div>
      <div>
        <table style="background:transparent">
          <tr><td class="texto-fraco">Preço normal</td><td>${moeda(precos.preco_normal ?? detalhe.preco_anterior)}</td></tr>
          <tr><td class="texto-fraco">Preço atual</td><td>${moeda(precos.preco_base)}</td></tr>
          <tr><td class="texto-fraco">Cupom</td><td>${precos.cupom ? `<strong>${escapar(precos.cupom.codigo)}</strong> (−${moeda(precos.desconto_cupom)})` : '—'}</td></tr>
          <tr><td class="texto-fraco">Preço final</td><td><strong style="color:var(--ok)">${moeda(precos.preco_final)}</strong></td></tr>
          <tr><td class="texto-fraco">Desconto</td><td>${precos.desconto_percentual ? `${precos.desconto_percentual}% (${moeda(precos.desconto_valor)})` : '—'}</td></tr>
          <tr><td class="texto-fraco">Marketplace</td><td>${escapar(detalhe.marketplace)}</td></tr>
          <tr><td class="texto-fraco">Última publicação</td><td>${dataCurta(detalhe.data_ultima_publicacao)}</td></tr>
        </table>
      </div>
    </div>`));

  const controles = el(`
    <div class="campos mt">
      <div class="campo"><label>Template</label><select id="d-tpl">
        ${templates.rows.map((t) => `<option value="${t.id}" ${t.padrao ? 'selected' : ''}>${escapar(t.nome)}</option>`).join('')}
      </select></div>
      <div class="campo"><label>Grupo para teste</label><select id="d-canal">
        ${canais.rows.map((c) => `<option value="${c.id}">${escapar(c.nome)}</option>`).join('')}
      </select></div>
      <div class="campo"><label class="check"><input type="checkbox" id="d-ia"><span>Melhorar título com IA</span></label></div>
    </div>`);
  corpo.appendChild(controles);

  const areaPreview = el('<div class="mt"></div>');
  corpo.appendChild(areaPreview);

  const botoes = el(`<div class="linha mt">
      <button class="btn" id="d-atualizar">↻ Atualizar preview</button>
      <button class="btn" id="d-fila">📥 Colocar na fila</button>
      <button class="btn-primario" id="d-teste">📤 Enviar teste agora</button>
    </div>`);
  corpo.appendChild(botoes);

  async function preview() {
    areaPreview.innerHTML = '<div class="carregando">Montando…</div>';
    const dados = await api.post('/publicacoes/preview', {
      product_id: produto.id,
      template_id: controles.querySelector('#d-tpl').value,
      usar_ia: controles.querySelector('#d-ia').checked,
    });
    areaPreview.innerHTML = '';
    areaPreview.appendChild(previewWhatsApp(dados.mensagem, dados.produto.imagem_principal));
    if (dados.bloqueios.length) {
      areaPreview.appendChild(el(`<p class="pequeno" style="color:var(--erro)">⛔ ${dados.bloqueios.join(' · ')}</p>`));
    }
    if (dados.avisos.length) {
      areaPreview.appendChild(el(`<p class="pequeno texto-fraco">⚠️ ${dados.avisos.join(' · ')}</p>`));
    }
    return dados;
  }

  botoes.querySelector('#d-atualizar').onclick = preview;
  botoes.querySelector('#d-fila').onclick = async () => {
    await tentar(() => api.post('/publicacoes/enfileirar', {
      product_id: produto.id,
      channel_id: controles.querySelector('#d-canal').value,
      template_id: controles.querySelector('#d-tpl').value,
      usar_ia: controles.querySelector('#d-ia').checked,
    }), 'Adicionado à fila');
  };
  botoes.querySelector('#d-teste').onclick = async () => {
    const criado = await tentar(() => api.post('/publicacoes/enfileirar', {
      product_id: produto.id,
      channel_id: controles.querySelector('#d-canal').value,
      template_id: controles.querySelector('#d-tpl').value,
      usar_ia: controles.querySelector('#d-ia').checked,
      ignorar_duplicado: true,
      origem: 'teste',
    }));
    if (criado?.publicacoes?.length) {
      await tentar(() => api.post(`/publicacoes/${criado.publicacoes[0].id}/enviar`), 'Teste disparado');
    }
  };

  await preview();
}

// ------------------------------------------------------------------ IA --

export function abrirIa(produto) {
  const corpo = el(`
    <div>
      <div class="campos">
        <div class="campo"><label>O que melhorar</label>
          <select id="ia-tarefa">
            <option value="titulo">Título</option>
            <option value="descricao">Descrição</option>
            <option value="post">Chamada do post</option>
            <option value="cta">Chamada para ação</option>
            <option value="variacoes">3 variações</option>
          </select></div>
        <div class="campo" style="grid-column:span 2"><label>Instrução extra <span class="dica">opcional</span></label>
          <input id="ia-instrucao" placeholder="ex.: tom mais informal, foco em presente"></div>
      </div>
      <div class="cartao" style="background:var(--superficie-2)">
        <strong class="pequeno">Original</strong>
        <p class="pequeno" id="ia-original">${escapar(produto.titulo_original)}</p>
      </div>
      <div class="cartao mt"><strong class="pequeno">Sugestão da IA</strong>
        <p id="ia-saida" class="texto-fraco">Clique em "Gerar" para ver a sugestão.</p>
        <p class="pequeno texto-fraco" id="ia-nota"></p>
      </div>
    </div>`);

  let sugestao = '';

  modal({
    titulo: '✨ Melhorar com IA',
    corpo,
    acoes: [
      { rotulo: 'Fechar' },
      {
        rotulo: 'Gerar', fechar: false,
        aoClicar: async () => {
          const tarefa = corpo.querySelector('#ia-tarefa').value;
          corpo.querySelector('#ia-saida').textContent = 'Gerando…';
          const r = await tentar(() => api.post(`/produtos/${produto.id}/melhorar-ia`, {
            tarefa,
            instrucao: corpo.querySelector('#ia-instrucao').value,
          }));
          if (!r) return;
          sugestao = r.sugestao;
          corpo.querySelector('#ia-original').textContent = r.original || '—';
          corpo.querySelector('#ia-saida').textContent = sugestao || '(vazio)';
          corpo.querySelector('#ia-nota').textContent = r.violacoes?.length
            ? `⚠️ A IA tentou inventar dados e o sistema removeu: ${r.violacoes.join(', ')}`
            : `Gerado por: ${r.provider}. Preços e cupons nunca vêm da IA.`;
        },
      },
      {
        rotulo: 'Salvar no produto', classe: 'btn-primario',
        aoClicar: async () => {
          if (!sugestao) { erro('Gere uma sugestão antes de salvar.'); return; }
          const tarefa = corpo.querySelector('#ia-tarefa').value;
          const campo = tarefa === 'descricao' ? 'descricao_publicacao' : 'titulo_publicacao';
          await tentar(() => api.put(`/produtos/${produto.id}`, { [campo]: sugestao }), 'Texto salvo no produto');
        },
      },
    ],
  });
}

// ------------------------------------------------------ acoes em lote --

async function abrirPublicacaoEmLote(ids) {
  const canais = await api.get('/canais', { limite: 100 });
  const templates = await api.get('/templates', { limite: 50 });

  const corpo = el(`
    <div>
      <p class="pequeno texto-fraco">${ids.length} produto(s) selecionados.</p>
      <div class="campo"><label>Grupos de destino</label>
        <div id="lote-canais">${canais.rows.map((c) => `
          <label class="check"><input type="checkbox" value="${c.id}"><span>${escapar(c.nome)}</span></label>`).join('')}
        </div>
      </div>
      <div class="campos">
        <div class="campo"><label>Template</label><select id="lote-tpl">
          ${templates.rows.map((t) => `<option value="${t.id}" ${t.padrao ? 'selected' : ''}>${escapar(t.nome)}</option>`).join('')}
        </select></div>
        <div class="campo"><label class="check"><input type="checkbox" id="lote-ia"><span>Melhorar com IA</span></label></div>
      </div>
    </div>`);

  modal({
    titulo: 'Publicar selecionados',
    corpo,
    acoes: [
      { rotulo: 'Cancelar' },
      {
        rotulo: 'Colocar na fila', classe: 'btn-primario', principal: true,
        aoClicar: async () => {
          const escolhidos = [...corpo.querySelectorAll('#lote-canais input:checked')].map((i) => i.value);
          if (!escolhidos.length) { erro('Escolha ao menos um grupo.'); return; }
          const r = await tentar(() => api.post('/publicacoes/enfileirar', {
            produtos: ids,
            channel_ids: escolhidos,
            template_id: corpo.querySelector('#lote-tpl').value,
            usar_ia: corpo.querySelector('#lote-ia').checked,
          }));
          if (r) ok(`${r.criadas} na fila${r.erros.length ? `, ${r.erros.length} ignorados (duplicados/bloqueados)` : ''}`);
        },
      },
    ],
  });
}

function criarCampanhaCom(ids) {
  sessionStorage.setItem('campanha_produtos', JSON.stringify(ids));
  location.hash = '#/campanhas?novo=1';
}

// ------------------------------------------------------- buscar em loja --

/** Barra da busca: página lida, produtos encontrados e a espera entre buscas. */
function barraDeProgresso(nomeLoja) {
  const no = el(`
    <div class="cartao">
      <div class="linha" style="justify-content:space-between">
        <strong data-texto>Buscando em ${escapar(nomeLoja)}…</strong>
        <span class="pequeno texto-fraco" data-detalhe></span>
      </div>
      <div style="height:10px;background:var(--superficie-2);border-radius:999px;overflow:hidden;margin-top:10px">
        <div data-barra style="height:100%;width:4%;background:var(--primaria);transition:width .4s"></div>
      </div>
    </div>`);
  const texto = no.querySelector('[data-texto]');
  const detalhe = no.querySelector('[data-detalhe]');
  const barra = no.querySelector('[data-barra]');

  return {
    no,
    atualizar(p) {
      if (p.etapa === 'aguardando') {
        texto.textContent = `Aguardando ${p.espera_segundos}s para não ser bloqueado pela loja…`;
        return;
      }
      if (p.etapa === 'lendo' && p.total_paginas) {
        const pct = Math.max(4, Math.round(((p.pagina - 0.5) / p.total_paginas) * 100));
        barra.style.width = `${Math.min(pct, 97)}%`;
        texto.textContent = p.total_paginas > 1
          ? `Lendo página ${p.pagina} de ${p.total_paginas} das ofertas de ${nomeLoja}…`
          : `Lendo a busca de ${nomeLoja}…`;
        detalhe.textContent = p.total_paginas > 1 ? `${p.lidos} produtos lidos · ${p.achados} servem` : '';
      }
      if (p.fim) barra.style.width = '100%';
    },
  };
}

const BUSCA_NA_LOJA = {
  mercadolivre: (t) => `https://lista.mercadolivre.com.br/${encodeURIComponent(t).replace(/%20/g, '-')}`,
  shopee: (t) => `https://shopee.com.br/search?keyword=${encodeURIComponent(t)}`,
  magalu: (t) => `https://www.magazineluiza.com.br/busca/${encodeURIComponent(t).replace(/%20/g, '+')}/`,
};

/** Loja que barra busca automática: o caminho é você abrir a busca e capturar pela extensão. */
function comoTrazerPelaExtensao(loja, termo) {
  const link = termo && BUSCA_NA_LOJA[loja.nome] ? BUSCA_NA_LOJA[loja.nome](termo) : null;
  return el(`
    <div class="cartao">
      <h3>${escapar(loja.rotulo)}: pela extensão</h3>
      <p class="pequeno texto-fraco">
        ${escapar(loja.rotulo)} bloqueia busca feita por sistema (manda para um captcha, mesmo com o
        seu cookie). Com você navegando, funciona:
      </p>
      <ol class="pequeno" style="padding-left:18px;line-height:1.9">
        <li>${link
    ? `<a href="${escapar(link)}" target="_blank" rel="noopener"><strong>Abrir a busca "${escapar(termo)}" na loja</strong></a>`
    : 'Digite as palavras-chave acima e clique em Buscar de novo para abrir a busca na loja — ou abra a loja e pesquise.'}</li>
        <li>Clique no ícone da extensão <strong>Capturar Ofertas</strong> e em <strong>Capturar ofertas desta página</strong>.</li>
        <li>Os produtos entram em <a href="#/produtos">Todos os produtos</a>${loja.nome === 'mercadolivre' ? ' já com o seu link meli.la' : ''}.</li>
      </ol>
      <p class="pequeno texto-fraco">Extensão ainda não instalada? Rode <code>INSTALAR-EXTENSAO.bat</code>.</p>
    </div>`);
}

export async function renderBuscar() {
  const marketplaces = await api.get('/produtos/marketplaces');
  const tela = el('<div></div>');

  const painel = el(`
    <div class="cartao">
      <div class="cartao-titulo">
        <div><h2>Procurar produtos nas lojas</h2>
        <p>Busque, escolha o que interessa e importe para a sua base. Nada é gravado antes de você mandar.</p></div>
      </div>
      <div class="campos">
        <div class="campo" style="grid-column:span 2"><label>Palavras-chave</label>
          <input id="b-termo" placeholder="perfume feminino, body splash, batom…"></div>
        <div class="campo"><label>Loja</label>
          <select id="b-mkt">${[...marketplaces].sort((x, y) => y.implementado - x.implementado).map((m) => `
            <option value="${m.nome}">${escapar(m.rotulo)}${m.implementado ? '' : ' — pela extensão'}</option>`).join('')}
          </select></div>
        <div class="campo"><label>Categoria</label><input id="b-cat"></div>
        <div class="campo" id="b-cat-ml-campo" hidden><label>Categoria no Mercado Livre</label>
          <select id="b-cat-ml">${(marketplaces.find((m) => m.nome === 'mercadolivre')?.categorias || [])
    .map(([id, nome]) => `<option value="${id}">${escapar(nome)}</option>`).join('')}</select></div>
        <div class="campo"><label>Preço máx.</label><input id="b-max" type="number" step="0.01"></div>
        <div class="campo"><label>Desconto mín. (%)</label><input id="b-desc" type="number"></div>
        <div class="campo"><label>Ordenar</label>
          <select id="b-ord">
            <option value="vendas">mais vendidos</option>
            <option value="desconto">maior desconto</option>
            <option value="preco">menor preço</option>
            <option value="avaliacao">melhor avaliação</option>
          </select></div>
        <div class="campo"><label>Quantidade</label><input id="b-lim" type="number" value="20"></div>
      </div>
      <div class="linha">
        <button class="btn-primario" id="b-buscar">🔍 Buscar</button>
        <button class="btn" id="b-salvar-pesquisa">💾 Salvar esta pesquisa</button>
      </div>
      <p class="pequeno texto-fraco mt">
        Amazon: busca normal. Mercado Livre: o sistema varre as <strong>ofertas</strong> do ML
        (a busca comum deles cai em captcha) — escolha a categoria e, se quiser, uma palavra;
        em branco traz as ofertas do dia. Shopee e Magalu: pela extensão, navegando na loja.
        Tags e cookies ficam em <a href="#/lojas">LOJAS</a>.
      </p>
    </div>`);
  tela.appendChild(painel);

  const area = el('<div class="mt"></div>');
  tela.appendChild(area);

  const selecionados = new Set();
  let ultimos = [];

  function filtrosAtuais() {
    return {
      termo: painel.querySelector('#b-termo').value,
      marketplaces: [painel.querySelector('#b-mkt').value],
      categoria: painel.querySelector('#b-cat').value,
      categoria_loja: painel.querySelector('#b-mkt').value === 'mercadolivre'
        ? painel.querySelector('#b-cat-ml').value : undefined,
      precoMax: painel.querySelector('#b-max').value || undefined,
      descontoMin: painel.querySelector('#b-desc').value || undefined,
      ordenacao: painel.querySelector('#b-ord').value,
      limite: Number(painel.querySelector('#b-lim').value) || 20,
    };
  }

  // Mercado Livre busca pelas ofertas, que filtram por categoria da loja.
  const mostrarCategoriaMl = () => {
    painel.querySelector('#b-cat-ml-campo').hidden = painel.querySelector('#b-mkt').value !== 'mercadolivre';
  };
  painel.querySelector('#b-mkt').addEventListener('change', mostrarCategoriaMl);
  mostrarCategoriaMl();

  painel.querySelector('#b-buscar').onclick = async () => {
    const loja = marketplaces.find((m) => m.nome === painel.querySelector('#b-mkt').value);
    if (loja && !loja.implementado) {
      area.innerHTML = '';
      area.appendChild(comoTrazerPelaExtensao(loja, painel.querySelector('#b-termo').value.trim()));
      return;
    }
    const buscaId = `b${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    const progresso = barraDeProgresso(loja?.rotulo || 'loja');
    area.innerHTML = '';
    area.appendChild(progresso.no);
    const botao = painel.querySelector('#b-buscar');
    botao.disabled = true;

    // Pergunta o andamento enquanto a busca roda (o ML lê várias páginas).
    const acompanhar = setInterval(async () => {
      const p = await api.get(`/produtos/buscar/progresso/${buscaId}`).catch(() => null);
      if (p) progresso.atualizar(p);
    }, 600);

    let r;
    try {
      r = await tentar(() => api.post('/produtos/buscar', { ...filtrosAtuais(), busca_id: buscaId }));
    } finally {
      clearInterval(acompanhar);
      botao.disabled = false;
    }
    if (!r) { area.innerHTML = ''; return; }

    ultimos = r.produtos;
    selecionados.clear();
    area.innerHTML = '';

    if (r.erros.length) {
      area.appendChild(el(`<div class="cartao"><p class="pequeno" style="color:var(--erro)">
        ${r.erros.map((e) => `${e.marketplace}: ${escapar(e.erro)}`).join('<br>')}</p></div>`));
    }

    const barra = el(`
      <div class="cartao">
        <div class="linha">
          <strong>${r.produtos.length} encontrados</strong>
          <span class="espaco"></span>
          <button class="btn-pequeno" id="sel-todos">Selecionar todos</button>
          <button class="btn-primario btn-pequeno" id="importar">📥 Importar selecionados</button>
        </div>
      </div>`);
    area.appendChild(barra);

    const grade = gradeProdutos(r.produtos, {
      selecionados, modoBusca: true,
      aoMudar: () => { barra.querySelector('#importar').textContent = `📥 Importar ${selecionados.size || 'selecionados'}`; },
    });
    area.appendChild(grade);

    barra.querySelector('#sel-todos').onclick = () => {
      for (const p of r.produtos) selecionados.add(p.external_id);
      for (const c of grade.querySelectorAll('.selecionar')) { c.checked = true; c.closest('.produto').classList.add('escolhido'); }
      barra.querySelector('#importar').textContent = `📥 Importar ${selecionados.size}`;
    };

    barra.querySelector('#importar').onclick = async () => {
      const escolhidos = ultimos.filter((p) => selecionados.has(p.external_id));
      if (!escolhidos.length) { erro('Selecione ao menos um produto.'); return; }
      const res = await tentar(() => api.post('/produtos/importar', { produtos: escolhidos }));
      if (res) ok(`${res.criados} novos, ${res.atualizados} atualizados`);
    };
  };

  painel.querySelector('#b-salvar-pesquisa').onclick = () => {
    const form = formulario([{ nome: 'nome', rotulo: 'Nome da pesquisa', obrigatorio: true, largura: 2 }]);
    modal({
      titulo: 'Salvar pesquisa',
      corpo: form,
      acoes: [{ rotulo: 'Cancelar' }, {
        rotulo: 'Salvar', classe: 'btn-primario', principal: true,
        aoClicar: async () => {
          const f = filtrosAtuais();
          await tentar(() => api.post('/pesquisas', {
            nome: form.ler().nome,
            filtros: { termo: f.termo, categoria: f.categoria, preco_max: f.precoMax, desconto_min: f.descontoMin, ordenacao: f.ordenacao },
            ordenacao: f.ordenacao,
            quantidade: f.limite,
          }), 'Pesquisa salva');
        },
      }],
    });
  };

  return tela;
}

export { tabela, acoes };
