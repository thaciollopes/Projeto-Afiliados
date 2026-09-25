import { api } from '../api.js';
import { el, escapar, ok } from '../ui.js';

/**
 * COMECE AQUI — o roteiro de configuração.
 * Cada passo é verificado de verdade no servidor; nada é marcado à mão.
 */
export async function renderComece() {
  const dados = await api.get('/sistema/primeiros-passos');
  const tela = el('<div></div>');

  tela.appendChild(el(`
    <div class="cartao">
      <div class="cartao-titulo">
        <div>
          <h2>${dados.tudo_pronto ? '✅ Tudo configurado' : '👋 Vamos configurar seu sistema'}</h2>
          <p>${dados.tudo_pronto
    ? 'Seu sistema está pronto e publicando. Esta página continua aqui como conferência.'
    : 'Siga os passos abaixo na ordem. O sistema confere sozinho o que já está pronto.'}</p>
        </div>
        <button class="btn" id="reconferir">↻ Conferir de novo</button>
      </div>

      <div class="linha" style="gap:14px">
        <div style="flex:1">
          <div style="height:12px;background:var(--superficie-2);border-radius:999px;overflow:hidden">
            <div style="height:100%;width:${dados.percentual}%;background:var(--ok);transition:width .3s"></div>
          </div>
        </div>
        <strong style="white-space:nowrap">${dados.concluidos} de ${dados.total}</strong>
      </div>

      ${dados.modo_simulacao ? `
        <div class="cartao mt" style="background:var(--alerta-suave);border-color:transparent;box-shadow:none">
          <strong>🛡️ Envio real desligado (DRY_RUN=true no .env)</strong>
          <p class="pequeno" style="margin:4px 0 0">
            Nada é enviado no WhatsApp enquanto isso estiver ligado. Para enviar de verdade:
            <code>DRY_RUN=false</code> no .env e depois <code>REINICIAR.bat</code>.
          </p>
        </div>` : ''}
    </div>`));

  const lista = el('<div class="mt"></div>');
  tela.appendChild(lista);

  dados.passos.forEach((passo, indice) => {
    const proximo = passo.id === dados.proximo_passo;
    const cartao = el(`
      <div class="cartao" style="${proximo ? 'border-color:var(--primaria);box-shadow:0 0 0 2px var(--primaria-suave)' : ''}">
        <div class="linha" style="align-items:flex-start;gap:14px;flex-wrap:nowrap">
          <div style="font-size:22px;line-height:1.2;min-width:30px;text-align:center">
            ${passo.feito ? '✅' : proximo ? '👉' : '⬜'}
          </div>
          <div style="flex:1;min-width:0">
            <div class="linha" style="gap:8px">
              <strong style="${passo.feito ? 'color:var(--texto-fraco)' : ''}">
                ${indice + 1}. ${escapar(passo.titulo)}
              </strong>
              ${passo.obrigatorio ? '' : '<span class="tag">opcional</span>'}
              ${proximo ? '<span class="tag info">comece por aqui</span>' : ''}
            </div>
            <p class="pequeno texto-fraco" style="margin:3px 0 0">${escapar(passo.explicacao)}</p>
            ${passo.detalhe ? `<p class="pequeno" style="margin:6px 0 0">${escapar(passo.detalhe)}</p>` : ''}
            ${passo.comando ? `
              <div class="linha" style="margin-top:8px;gap:6px">
                <code class="pequeno" style="background:var(--superficie-2);padding:6px 10px;border-radius:7px;flex:1;overflow-x:auto">${escapar(passo.comando)}</code>
                <button class="btn-pequeno" data-copiar="${escapar(passo.comando)}">copiar</button>
              </div>` : ''}
          </div>
          <div style="white-space:nowrap">
            ${passo.rota && !passo.feito
    ? `<a class="btn ${proximo ? 'btn-primario' : ''}" href="${passo.rota}">${escapar(passo.acao || 'Abrir')}</a>`
    : passo.rota ? `<a class="btn btn-pequeno" href="${passo.rota}">rever</a>` : ''}
          </div>
        </div>
      </div>`);
    lista.appendChild(cartao);
  });

  tela.appendChild(el(`
    <div class="grade g2 mt">
      <div class="cartao">
        <h3>Se travar em alguma coisa</h3>
        <ul class="pequeno texto-fraco" style="padding-left:18px;line-height:1.9;margin:0">
          <li><strong>Passo a passo de cada função:</strong> <a href="#/manual">📖 Manual</a> (ou o botão 📖 Ajuda no topo de qualquer tela)</li>
          <li><strong>Deu erro:</strong> <code>docs/TROUBLESHOOTING.md</code> — está por sintoma</li>
          <li><strong>WhatsApp:</strong> <code>docs/WAHA.md</code></li>
          <li><strong>Ver o que o sistema registrou:</strong> <a href="#/sistema">SISTEMA → Logs</a> ou <code>VER-LOGS.bat</code></li>
          <li><strong>Conferir os serviços:</strong> <a href="#/status">SISTEMA → Status</a> ou <code>STATUS.bat</code></li>
        </ul>
      </div>
      <div class="cartao">
        <h3>Suas lojas</h3>
        <p class="pequeno texto-fraco">
          A tag de afiliado e o cookie de cada loja ficam num lugar só. É o que faz os links
          saírem com a sua comissão.
        </p>
        <div class="linha">
          <a class="btn btn-pequeno" href="#/lojas">Abrir LOJAS</a>
          <a class="btn btn-pequeno" href="#/buscar">Procurar produtos</a>
          <a class="btn btn-pequeno" href="#/produtos">Ver os produtos</a>
        </div>
      </div>
    </div>`));

  tela.querySelector('#reconferir').onclick = () => { location.reload(); };
  for (const botao of tela.querySelectorAll('[data-copiar]')) {
    botao.onclick = async () => {
      try {
        await navigator.clipboard.writeText(botao.dataset.copiar);
        ok('Copiado');
      } catch {
        ok('Selecione o texto e copie com Ctrl+C');
      }
    };
  }

  return tela;
}
