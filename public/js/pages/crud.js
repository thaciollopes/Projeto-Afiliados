/** Pagina de cadastro simples (lista + novo + editar + remover) reaproveitavel. */
import { api } from '../api.js';
import { el, tabela, acoes, modal, formulario, confirmar, tentar } from '../ui.js';

/**
 * @param {{titulo:string, descricao:string, rota:string, campos:Array,
 *          colunas:Array, padrao?:object, extras?:Function}} config
 */
export function paginaCrud(config) {
  return async function render() {
    const tela = el('<div></div>');

    const cabecalho = el(`
      <div class="cartao">
        <div class="cartao-titulo">
          <div><h2>${config.titulo}</h2><p>${config.descricao || ''}</p></div>
          <div class="linha"><button class="btn-primario" id="novo">+ Novo</button></div>
        </div>
      </div>`);
    tela.appendChild(cabecalho);

    const area = el('<div class="mt"></div>');
    tela.appendChild(area);

    async function carregar() {
      area.innerHTML = '<div class="carregando">Carregando…</div>';
      const dados = await api.get(config.rota, { limite: 200 });
      area.innerHTML = '';

      const colunas = [
        ...config.colunas,
        {
          rotulo: 'Ações', classe: 'acoes',
          render: (linha) => acoes([
            { rotulo: '✏️', titulo: 'Editar', aoClicar: () => abrir(linha) },
            ...(config.acoesExtras?.(linha, carregar) || []),
            {
              rotulo: '🗑️', titulo: 'Remover', classe: 'btn-perigo',
              aoClicar: () => confirmar('Remover este registro?', async () => {
                await tentar(() => api.del(`${config.rota}/${linha.id}`), 'Removido');
                carregar();
              }),
            },
          ]),
        },
      ];
      area.appendChild(tabela({ colunas, linhas: dados.rows, vazio: config.vazio }));
    }

    function abrir(registro) {
      const form = formulario(config.campos, registro || config.padrao || {});
      modal({
        titulo: registro ? `Editar ${config.singular || 'registro'}` : `Novo ${config.singular || 'registro'}`,
        corpo: form,
        acoes: [
          { rotulo: 'Cancelar' },
          {
            rotulo: 'Salvar', classe: 'btn-primario', principal: true,
            aoClicar: async () => {
              const dados = config.aoSalvar ? config.aoSalvar(form.ler()) : form.ler();
              const r = await tentar(
                () => (registro ? api.put(`${config.rota}/${registro.id}`, dados) : api.post(config.rota, dados)),
                'Salvo',
              );
              if (r) carregar();
            },
          },
        ],
      });
    }

    cabecalho.querySelector('#novo').onclick = () => abrir(null);
    await carregar();
    return tela;
  };
}
