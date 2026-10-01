import { api } from '../api.js';
import { el, escapar, tentar, ok, erro } from '../ui.js';

const LOJAS = [
  ['amazon', 'Amazon', '(recomendado: a Amazon pede um site seu)'],
  ['mercadolivre', 'Mercado Livre', '(desmarcado = vai direto para o meli.la)'],
  ['shopee', 'Shopee', ''],
  ['magalu', 'Magazine Luiza', ''],
];

/**
 * VITRINE — o seu site dos posts. O post leva para a página do produto aqui;
 * só o botão "Ir para a loja" tem o link de afiliado (regra da Amazon).
 */
export async function renderVitrine() {
  const [cfg, cliques] = await Promise.all([api.get('/vitrine'), api.get('/vitrine/cliques')]);
  const tela = el('<div></div>');

  const pronta = cfg.ativa && cfg.url_publica;
  tela.appendChild(el(`
    <div class="cartao">
      <div class="cartao-titulo">
        <div>
          <h2>Vitrine (meu site)</h2>
          <p>A Amazon não quer o link de associado direto no WhatsApp/Telegram. Com a vitrine, o post
             leva para a página do produto no <strong>seu site</strong>, e o botão "Ir para a loja" leva
             para a Amazon com a sua tag.</p>
        </div>
        <div class="linha">
          ${cfg.endereco_local ? `<a class="btn" href="${escapar(cfg.endereco_local)}" target="_blank" rel="noopener">👀 Ver a vitrine</a>` : ''}
        </div>
      </div>
      <p class="pequeno" style="margin:0">${pronta
    ? (cfg.lojas?.length
      ? `✅ Posts de <strong>${cfg.lojas.map((l) => LOJAS.find(([id]) => id === l)?.[1] || l).join(', ')}</strong> saem com <code>${escapar(cfg.url_publica)}p/…</code>. As outras lojas vão direto.`
      : '✅ Nenhuma loja marcada: todos os posts vão direto para a loja.')
    : '⚠️ Enquanto a vitrine não estiver ligada <strong>e</strong> com endereço público, os posts saem com o link direto da loja.'}</p>
    </div>`));

  const form = el(`
    <div class="cartao mt">
      <h3>Configuração</h3>
      <div class="campos">
        <div class="campo" style="grid-column:span 2"><label>Endereço público (https, com a barra no final)</label>
          <input id="v-url" value="${escapar(cfg.url_publica)}" placeholder="https://loja.seudominio.com.br/"></div>
        <div class="campo"><label>Título do site</label><input id="v-titulo" value="${escapar(cfg.titulo)}"></div>
        <div class="campo"><label>Cor do tema</label><input id="v-cor" type="color" value="${escapar(cfg.cor)}"></div>
        <div class="campo" style="grid-column:span 2"><label>Logo (endereço https de uma imagem quadrada)</label>
          <input id="v-logo" value="${escapar(cfg.logo_url)}" placeholder="https://…/logo.png"></div>
        <div class="campo"><label>Google Analytics <span class="dica">(opcional)</span></label>
          <input id="v-ga" value="${escapar(cfg.ga_tag)}" placeholder="G-XXXXXXX"></div>
      </div>
      <details class="mt" ${cfg.sync_url ? 'open' : ''}>
        <summary><strong>Vitrine hospedada em outro site</strong> <span class="dica">(ex.: awaydev.com.br/ofertas)</span></summary>
        <p class="pequeno texto-fraco" style="margin:8px 0">O sistema envia os produtos para o site a cada 10 minutos e
          quando você salva. Não precisa de túnel nem de porta aberta.</p>
        <button class="btn btn-pequeno" id="v-awaydev" type="button">Usar awaydev.com.br/ofertas</button>
        <div class="campos mt">
          <div class="campo" style="grid-column:span 2"><label>Endereço de sincronização</label>
            <input id="v-sync-url" value="${escapar(cfg.sync_url || '')}" placeholder="https://awaydev.com.br/ofertas/api/sincronizar"></div>
          <div class="campo" style="grid-column:span 2"><label>Senha da sincronização (OFERTAS_TOKEN do site)</label>
            <input id="v-sync-token" type="password" autocomplete="new-password"
              placeholder="${cfg.sync_configurado ? 'Senha salva — em branco mantém' : 'cole a senha'}"></div>
        </div>
        <p class="pequeno" id="v-sync-status">${cfg.sync ? (cfg.sync.ok
    ? `✅ Último envio ${new Date(cfg.sync.em).toLocaleString('pt-BR')}: ${cfg.sync.enviados} produtos${cfg.sync.cliques ? `, ${cfg.sync.cliques} cliques recebidos` : ''}`
    : `❌ Último envio falhou (${new Date(cfg.sync.em).toLocaleString('pt-BR')}): ${escapar(cfg.sync.erro || '')}`) : ''}</p>
        ${cfg.sync_configurado ? '<button class="btn btn-pequeno" id="v-sync-agora" type="button">🔄 Sincronizar agora</button>' : ''}
      </details>
      <div class="mt" style="display:grid;gap:8px">
        <label><input type="checkbox" id="v-ativa" ${cfg.ativa ? 'checked' : ''}> <strong>Vitrine ligada</strong></label>
        <div><strong>Quais lojas levam para o seu site</strong>
          <span class="dica">as não marcadas vão direto para a loja, com o seu link de afiliado</span></div>
        ${LOJAS.map(([id, nome, dica]) => `
        <label><input type="checkbox" class="v-loja" value="${id}" ${cfg.lojas?.includes(id) ? 'checked' : ''}>
          <strong>${nome}</strong> <span class="pequeno texto-fraco">${dica}</span></label>`).join('')}
      </div>
      <div class="linha mt"><button class="btn-primario" id="v-salvar">💾 Salvar</button></div>
    </div>`);
  tela.appendChild(form);

  tela.appendChild(el(`
    <div class="cartao mt">
      <h3>Como colocar no ar com o seu domínio</h3>
      <ol class="pequeno" style="padding-left:18px;line-height:1.9">
        <li>A vitrine roda neste computador na porta <code>${escapar(cfg.porta_local || 3011)}</code>
            (separada do painel — só ela vai para a internet).</li>
        <li>Publique essa porta com um endereço https pelo túnel do Cloudflare, apontando
            <code>loja.seudominio.com.br</code> para
            <code>http://afiliados:${escapar(cfg.porta_local || 3011)}</code> (na VPS) ou
            <code>http://host.docker.internal:${escapar(cfg.porta_local || 3011)}</code> (neste PC).</li>
        <li>Cole o endereço acima, marque <strong>Vitrine ligada</strong> e salve.</li>
        <li>Abra o endereço no celular (fora do Wi-Fi) para conferir.</li>
      </ol>
      <p class="pequeno texto-fraco">O rodapé já traz o aviso "Como Associado da Amazon, recebo por compras qualificadas".</p>
    </div>`));

  tela.appendChild(el(`
    <div class="cartao mt">
      <h3>Cliques nos últimos ${cliques.dias} dias: ${cliques.total}</h3>
      ${cliques.top.length ? `<ol class="pequeno">${cliques.top.map((c) => `<li>${escapar(String(c.titulo || c.product_id).slice(0, 70))} — <strong>${c.cliques}</strong></li>`).join('')}</ol>`
    : '<p class="pequeno texto-fraco">Ainda sem cliques.</p>'}
    </div>`));

  form.querySelector('#v-salvar').onclick = async () => {
    const valor = (id) => form.querySelector(id).value.trim();
    const r = await tentar(() => api.put('/vitrine', {
      url_publica: valor('#v-url'),
      titulo: valor('#v-titulo'),
      cor: valor('#v-cor'),
      logo_url: valor('#v-logo'),
      ga_tag: valor('#v-ga'),
      sync_url: valor('#v-sync-url'),
      sync_token: valor('#v-sync-token'),
      ativa: form.querySelector('#v-ativa').checked,
      lojas: [...form.querySelectorAll('.v-loja:checked')].map((i) => i.value),
    }));
    if (r) {
      ok('Vitrine salva');
      if (r.sync_agora && !r.sync_agora.pulado) {
        if (r.sync_agora.ok) ok(`${r.sync_agora.enviados} produtos enviados para o site`);
        else erro(`Envio para o site falhou: ${r.sync_agora.erro}`);
      }
      setTimeout(() => window.dispatchEvent(new HashChangeEvent('hashchange')), 400);
    }
  };

  form.querySelector('#v-awaydev').onclick = () => {
    form.querySelector('#v-url').value = 'https://awaydev.com.br/ofertas/';
    form.querySelector('#v-sync-url').value = 'https://awaydev.com.br/ofertas/api/sincronizar';
    form.querySelector('#v-sync-token').focus();
  };
  const botaoSync = form.querySelector('#v-sync-agora');
  if (botaoSync) {
    botaoSync.onclick = async () => {
      const r = await tentar(() => api.post('/vitrine/sincronizar', {}));
      if (r?.ok) ok(`${r.enviados} produtos enviados${r.cliques ? `, ${r.cliques} cliques recebidos` : ''}`);
      else if (r) erro(`Falhou: ${r.erro || 'vitrine desligada ou sem senha'}`);
    };
  }

  return tela;
}
