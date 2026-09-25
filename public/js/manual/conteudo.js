/**
 * Conteúdo do MANUAL do painel. Só dados: a tela (pages/manual.js) monta o
 * índice, a busca e os botões "Abrir tela" a partir daqui.
 *
 * Escrito para quem USA o sistema, não para quem programa. Passo que depende
 * do servidor (arquivo .env) vai marcado com `admin: true` — num plano por
 * assinatura, quem faz é o administrador, não o assinante.
 *
 * Mudou uma tela? Mude o passo aqui junto. O teste do painel confere que toda
 * `rota` citada existe no menu.
 */

export const SECOES = [
  {
    id: 'visao-geral',
    icone: '🧭',
    titulo: 'Como o sistema funciona',
    resumo: 'O caminho de uma oferta, do produto até o grupo.',
    blocos: [
      {
        passos: [
          '<strong>Lojas:</strong> você conecta suas contas de afiliado (Mercado Livre, Shopee, Amazon, Magalu). É isso que faz cada link sair com a <em>sua</em> comissão.',
          '<strong>Produtos:</strong> você traz ofertas para a base — pela busca, pela extensão do navegador, cadastrando na mão ou por planilha.',
          '<strong>Campanhas:</strong> você define a regra (quais produtos, em quais grupos, de quanto em quanto tempo).',
          '<strong>Fila:</strong> o sistema monta cada post, confere preço, cupom e link, e publica sozinho respeitando horário e limite de cada grupo.',
        ],
      },
      {
        titulo: 'Três garantias que o sistema dá',
        itens: [
          'Preço, desconto e cupom vêm <strong>sempre do cadastro</strong>. A IA só mexe no texto; se tentar escrever um número, ele é apagado.',
          'Link de afiliado de <strong>outra conta</strong> não é publicado: o sistema abre o link e confere o ID antes.',
          'Cupom vencido ou promoção expirada <strong>não entram</strong> no post — a linha some sozinha.',
        ],
      },
    ],
  },

  {
    id: 'primeiros-passos',
    icone: '🚀',
    titulo: 'Primeiros passos',
    resumo: 'A ordem certa para deixar tudo pronto.',
    rota: 'comece',
    blocos: [
      {
        passos: [
          'Abra <strong>Comece aqui</strong> no menu. Cada passo é conferido pelo próprio sistema — não precisa marcar nada.',
          'Siga na ordem: WhatsApp → grupos → lojas → produtos → campanha → teste → ativar.',
          'Enquanto aparecer <strong>MODO SIMULAÇÃO</strong> no topo, nada é enviado de verdade. É o jeito seguro de aprender.',
        ],
      },
    ],
  },

  {
    id: 'whatsapp',
    icone: '🟢',
    titulo: 'Conectar o WhatsApp',
    resumo: 'Parear o número que vai divulgar as ofertas.',
    rota: 'whatsapp',
    blocos: [
      {
        passos: [
          'Menu <strong>WhatsApp → Conexão</strong>.',
          'Clique em <strong>▶️ Iniciar sessão</strong> e depois em <strong>📱 Parear (QR Code)</strong>.',
          'No celular: WhatsApp → <em>Aparelhos conectados</em> → <em>Conectar aparelho</em> → leia o QR.',
          'Quando aparecer <strong>conectado</strong>, vá para <strong>Grupos e canais</strong>.',
        ],
      },
      {
        tipo: 'atencao',
        itens: ['Use um número <strong>só para divulgação</strong>, nunca o seu pessoal. Se o WhatsApp restringir o número, você não perde suas conversas.'],
      },
      {
        tipo: 'admin',
        itens: ['Se a tela mostrar "provider mock", o servidor ainda não está ligado ao WhatsApp: no <code>.env</code>, <code>WHATSAPP_PROVIDER=waha</code> e reiniciar.'],
      },
    ],
  },

  {
    id: 'lojas',
    icone: '🏬',
    titulo: 'Lojas: tag e conexão',
    resumo: 'O que faz o link sair com a sua comissão.',
    rota: 'lojas',
    blocos: [
      {
        titulo: 'Jeito mais fácil: pela extensão',
        passos: [
          'Instale a extensão <strong>Capturar Ofertas</strong> (veja "Extensão do navegador" neste manual).',
          'Abra a loja no Chrome e <strong>faça login</strong> com a sua conta de afiliado.',
          'Clique na extensão → <strong>Conectar loja ao painel</strong>. Pronto: a sessão vai direto para o seu painel.',
          'Em <strong>Minhas lojas</strong>, confira se a loja aparece como <strong>pronta</strong>.',
        ],
      },
      {
        titulo: 'Alternativa: Cookie Editor',
        passos: [
          'Instale a extensão <strong>Cookie Editor</strong> no Chrome.',
          'Com a loja aberta e logada: Cookie Editor → <strong>Export → Export as JSON</strong>.',
          'Em <strong>Minhas lojas</strong>, cole no campo "Cookie da sessão" da loja e clique em <strong>Salvar cookie</strong>.',
        ],
      },
      {
        tipo: 'atencao',
        itens: [
          'O cookie é como uma senha: dá acesso à sua conta. Ele fica só no seu painel e nunca volta a aparecer na tela.',
          'O cookie <strong>vence</strong>. Quando a loja parar de aceitar, o sistema avisa — é só conectar de novo.',
        ],
      },
    ],
  },

  {
    id: 'mercado-livre',
    icone: '🟡',
    titulo: 'Mercado Livre',
    resumo: 'Link meli.la gerado pela sua conta.',
    rota: 'lojas',
    blocos: [
      {
        passos: [
          'Faça login e abra o painel de afiliados do ML (<em>mercadolivre.com.br/afiliados/linkbuilder</em>) antes de conectar — o cookie precisa sair dali.',
          'Conecte a loja (extensão ou Cookie Editor).',
          '<strong>Tag de afiliado:</strong> opcional. Em branco, vale o apelido da sua conta.',
          'Teste em <strong>Minhas lojas → Mercado Livre → Gerar o link de afiliado</strong>: cole um produto e veja sair um link <em>meli.la</em> com ✅.',
        ],
      },
      {
        tipo: 'dica',
        itens: [
          'O sistema <strong>busca ofertas do ML sozinho</strong> (Procurar produtos), por categoria e palavra.',
          'Trocou a tag? Os links antigos são refeitos com a tag nova automaticamente.',
        ],
      },
    ],
  },

  {
    id: 'shopee',
    icone: '🟠',
    titulo: 'Shopee',
    resumo: 'Link s.shopee.com.br gerado pela sua conta.',
    rota: 'lojas',
    blocos: [
      {
        passos: [
          'Faça login em <em>affiliate.shopee.com.br</em> (página "Link personalizado").',
          'Conecte a loja (extensão ou Cookie Editor) estando nessa página.',
          'Preencha o <strong>ID de afiliado</strong> (o número do seu painel Shopee). Ele serve para <strong>conferir</strong>: se um link sair com outro ID, o sistema não usa.',
          'Teste em <strong>Minhas lojas → Shopee → Gerar o link de afiliado</strong>.',
        ],
      },
      {
        tipo: 'dica',
        itens: [
          'Produtos da Shopee entram pela <strong>extensão</strong> (a loja não deixa buscar automaticamente).',
          'Cada grupo recebe um link com o <strong>Sub ID</strong> do grupo — veja "Qual grupo vende mais".',
        ],
      },
    ],
  },

  {
    id: 'amazon',
    icone: '🔵',
    titulo: 'Amazon',
    resumo: 'A sua tag entra em todos os links.',
    rota: 'lojas',
    blocos: [
      {
        passos: [
          'Em <strong>Minhas lojas → Amazon</strong>, preencha a <strong>tag de associado</strong> (ex.: <code>seuid-20</code>) e salve.',
          'Todos os produtos da Amazon passam a sair com <code>?tag=seuid-20</code> — inclusive os que já estavam na base.',
          'O cookie é opcional na Amazon.',
        ],
      },
    ],
  },

  {
    id: 'magalu',
    icone: '🔴',
    titulo: 'Magazine Luiza',
    resumo: 'Link da sua loja Parceiro Magalu.',
    rota: 'lojas',
    blocos: [
      {
        passos: [
          'Produtos entram pela extensão.',
          'O link que paga comissão é o da sua loja Parceiro Magalu: cole no campo <strong>Link de afiliado</strong> do produto (✏️ Editar).',
        ],
      },
    ],
  },

  {
    id: 'conferir-id',
    icone: '🔗',
    titulo: 'Conferir se o seu ID chega na loja',
    resumo: 'A prova de que a comissão é sua.',
    rota: 'lojas',
    blocos: [
      {
        passos: [
          'Em <strong>Minhas lojas</strong>, no bloco <strong>Conferir se o ID de afiliado é o seu</strong>, cole um link e clique em <strong>Conferir link</strong>.',
          'O sistema abre o link como o cliente abriria e lê o ID que chega na loja.',
          'Use <strong>Conferir os produtos</strong> para checar até 30 de uma vez.',
        ],
      },
      {
        titulo: 'O que cada etiqueta significa (na lista de produtos)',
        itens: [
          '<strong>🔗 seu ID confirmado</strong> — tudo certo.',
          '<strong>🔗 ID de outra conta</strong> — o post fica <strong>bloqueado</strong>. Confira a conexão e a tag da loja.',
          '<strong>🔗 sem comissão</strong> — a loja exige link gerado pela conta e ele ainda não foi gerado. Conecte a loja.',
          '<strong>🔗 link de afiliado (não conferido)</strong> — ainda não foi aberto; a fila confere sozinha antes de publicar.',
        ],
      },
    ],
  },

  {
    id: 'extensao',
    icone: '🧩',
    titulo: 'Extensão do navegador',
    resumo: 'Capturar ofertas da página que você está vendo.',
    blocos: [
      {
        titulo: 'Instalar (uma vez)',
        passos: [
          'No Chrome, abra <code>chrome://extensions</code>.',
          'Ligue o <strong>Modo do desenvolvedor</strong> (canto superior direito).',
          'Clique em <strong>Carregar sem compactação</strong> e escolha a pasta <code>extensao</code>.',
          'Fixe a extensão na barra (ícone do quebra-cabeça).',
        ],
      },
      {
        titulo: 'Usar',
        passos: [
          'Abra uma busca ou página de ofertas no Mercado Livre, Shopee, Amazon ou Magalu.',
          'Clique na extensão → <strong>Capturar ofertas desta página</strong>.',
          'Os produtos entram em <strong>Todos os produtos</strong>, já com o link de afiliado gerado (ML e Shopee conectados).',
        ],
      },
    ],
  },

  {
    id: 'produtos',
    icone: '📦',
    titulo: 'Colocar produtos',
    resumo: 'Busca, extensão, cadastro manual e planilha.',
    rota: 'produtos',
    blocos: [
      {
        passos: [
          '<strong>Procurar produtos:</strong> escolha a loja (Mercado Livre ou Amazon), a palavra e os filtros, selecione e clique em <strong>📥 Importar selecionados</strong>.',
          '<strong>Extensão:</strong> para Shopee e Magalu (e qualquer página que você esteja vendo).',
          '<strong>Na mão:</strong> Todos os produtos → <strong>+ Novo produto</strong>.',
          '<strong>Planilha:</strong> Configurações → Backup → <strong>📥 Importar planilha de produtos</strong>. Colunas: <code>titulo, preco, preco_anterior, url, imagem, categoria</code>. A loja é reconhecida pelo link.',
        ],
      },
      {
        tipo: 'dica',
        itens: [
          'Clique em 👁️ num produto para ver o post exatamente como vai sair e mandar um teste.',
          '<strong>Pesquisas salvas</strong> viram campanha em dois cliques.',
        ],
      },
    ],
  },

  {
    id: 'promocoes',
    icone: '🏷️',
    titulo: 'Promoções e cupons',
    resumo: 'Opcional: preço promocional e cupom no post.',
    rota: 'promocoes',
    blocos: [
      {
        passos: [
          '<strong>Promoções → + Nova promoção:</strong> produto, preço normal e promocional, validade e cupom (se houver).',
          '<strong>Cupons → + Novo cupom:</strong> código, tipo (% ou R$), compra mínima, teto, validade e onde vale.',
          'O preço final é calculado sozinho: normal → promoção → cupom.',
        ],
      },
      {
        tipo: 'dica',
        itens: ['Cupom que venceu some do post sozinho e você recebe um aviso no sino 🔔.'],
      },
    ],
  },

  {
    id: 'templates',
    icone: '✍️',
    titulo: 'Templates e IA',
    resumo: 'O formato do post e as variáveis.',
    rota: 'templates',
    blocos: [
      {
        passos: [
          'Em <strong>Templates e IA → + Novo template</strong>, escreva o post usando variáveis entre chaves, como <code>{titulo}</code>, <code>{preco_final}</code>, <code>{cupom}</code> e <code>{link}</code>.',
          'Linha cuja variável ficar vazia <strong>some sozinha</strong> (sem cupom, a linha do cupom não aparece).',
          'Para blocos inteiros: <code>[[se:cupom]] ... [[/se]]</code>.',
          'Marque um template como <strong>padrão</strong> — é o que as campanhas usam quando nenhum é escolhido.',
        ],
      },
      {
        titulo: 'Selo "menor preço"',
        itens: [
          'Coloque a linha <code>📉 {menor_preco}</code> no template.',
          'Ela só aparece quando o sistema <strong>tem prova</strong>: acompanha o produto há 14 dias ou mais e o preço atual é o menor registrado em 30 dias. O texto diz "que registramos" — nunca promete "menor preço da história".',
          'Templates criados antes dessa função não têm a linha: acrescente à mão.',
        ],
      },
      {
        titulo: 'IA',
        itens: ['Em um produto, clique em ✨ para sugerir título ou descrição. A IA nunca mexe em preço, desconto ou cupom.'],
      },
    ],
  },

  {
    id: 'grupos',
    icone: '👥',
    titulo: 'Grupos e canais',
    resumo: 'Onde as ofertas são publicadas: WhatsApp e Telegram.',
    rota: 'canais',
    blocos: [
      {
        titulo: 'Grupos e canais do WhatsApp',
        passos: [
          'Em <strong>Grupos e canais</strong>, clique em <strong>📲 Importar do WhatsApp</strong>.',
          'Aparecem os grupos e os <strong>canais do WhatsApp</strong> (📢) em que você é dono ou admin. Marque e importe.',
          'Em cada um, ajuste <strong>intervalo</strong>, <strong>horário</strong> e <strong>máximo por dia</strong>.',
          'Use 📤 para mandar uma mensagem de teste.',
        ],
      },
      {
        titulo: 'Telegram',
        passos: [
          'No Telegram, crie um bot com o <strong>@BotFather</strong> e guarde o token.',
          'Adicione o bot como <strong>administrador</strong> do seu canal ou grupo.',
          'Em <strong>Grupos e canais → + Adicionar manual</strong>: "Onde publica" = <strong>Telegram</strong>, identificador = <code>@seucanal</code> (ou o número do grupo, começando com <code>-100</code>).',
          'Mande um teste com 📤.',
        ],
      },
      {
        tipo: 'admin',
        itens: ['O token do bot vai no servidor: <code>TELEGRAM_BOT_TOKEN</code> no <code>.env</code>. O estado aparece em <strong>Status</strong>.'],
      },
    ],
  },

  {
    id: 'sub-id',
    icone: '📊',
    titulo: 'Qual grupo vende mais (Shopee)',
    resumo: 'Cada grupo com o seu Sub ID no relatório da Shopee.',
    rota: 'canais',
    blocos: [
      {
        passos: [
          'Não precisa fazer nada: cada grupo ganha um <strong>Sub ID</strong> tirado do nome (ex.: "Ofertas VIP" → <code>OfertasVIP</code>).',
          'Quer outro nome? Edite o grupo e preencha <strong>Sub ID (Shopee)</strong> — só letras e números.',
          'No painel de afiliados da Shopee, abra o relatório de conversões e filtre por <strong>Sub ID</strong>: cada venda mostra de qual grupo veio.',
        ],
      },
      {
        tipo: 'dica',
        itens: ['Grupo que nunca vende é candidato a sair — ou a receber outro tipo de oferta.'],
      },
    ],
  },

  {
    id: 'campanhas',
    icone: '🗓️',
    titulo: 'Campanhas',
    resumo: 'A regra automática: o que publicar, onde e quando.',
    rota: 'campanhas',
    blocos: [
      {
        passos: [
          '<strong>Campanhas → + Nova campanha</strong>.',
          'Escolha o <strong>modo</strong>: lista fixa, por filtros, por pesquisa salva, por categoria, por palavras, só em promoção, só com cupom ou ofertas do dia.',
          'Defina template, grupos, intervalo, horário e <strong>não repetir por</strong> (dias até o mesmo produto voltar no mesmo grupo).',
          'Salve <strong>pausada</strong>. Clique em 👁️ para ver os produtos que ela pegaria e em ▶️ para rodar uma rodada de teste.',
          'Conferiu na Fila? Ative a campanha.',
        ],
      },
    ],
  },

  {
    id: 'fila',
    icone: '⏱️',
    titulo: 'Fila, histórico e erros',
    resumo: 'Acompanhar o que saiu e o que falhou.',
    rota: 'fila',
    blocos: [
      {
        passos: [
          '<strong>Fila:</strong> o que está esperando. Clique em 👁️ para ler o post.',
          '<strong>Histórico e erros:</strong> o que foi enviado e o que falhou.',
          'Falhou? O sistema tenta de novo sozinho (30 s, 2 min, 5 min). O botão 🔁 força outra tentativa.',
        ],
      },
      {
        tipo: 'atencao',
        itens: ['Se o sistema cair no meio de um envio, o post vira erro com o aviso <strong>"confira no grupo"</strong>. Ele não reenvia sozinho porque a mensagem pode ter saído — olhe o grupo antes de clicar em 🔁.'],
      },
    ],
  },

  {
    id: 'conversor',
    icone: '📲',
    titulo: 'Converter link pelo WhatsApp',
    resumo: 'Mande um link no privado e receba o post pronto.',
    blocos: [
      {
        passos: [
          'Do seu celular, mande um link de produto (Mercado Livre, Shopee ou Amazon) para o <strong>número de divulgação</strong>, no privado.',
          'Pode ser link curto de outra pessoa (meli.la, s.shopee, amzn.to): o sistema abre, descarta o rastreio dela e gera o <strong>seu</strong>.',
          'Você recebe de volta o post pronto — se o produto estiver cadastrado — ou o seu link, com a conferência do ID (✅).',
        ],
      },
      {
        tipo: 'atencao',
        itens: [
          'Só números autorizados recebem resposta. Mensagens de grupos e de outras pessoas são ignoradas.',
          'Produto fora do cadastro volta <strong>sem preço</strong>: o sistema não inventa preço. Capture pela extensão para ter o post completo.',
          'No modo simulação a resposta não é enviada.',
        ],
      },
      {
        tipo: 'admin',
        itens: ['Ligar no servidor: <code>WHATSAPP_WEBHOOK_CHAVE</code>, <code>WHATSAPP_NUMEROS_AUTORIZADOS</code> e <code>WAHA_HOOK_URL</code> no <code>.env</code>, e subir de novo a WAHA.'],
      },
    ],
  },

  {
    id: 'anti-bloqueio',
    icone: '🛡️',
    titulo: 'Boas práticas para não perder o número',
    resumo: 'O que o sistema já faz e o que depende de você.',
    blocos: [
      {
        titulo: 'O sistema já faz',
        itens: [
          'Mostra <strong>"digitando..."</strong> por alguns segundos antes de cada post.',
          'Envia <strong>um post por vez</strong>, com pausa sorteada entre eles (não dispara tudo no mesmo segundo).',
          'Respeita o horário, o intervalo e o máximo por dia de cada grupo.',
        ],
      },
      {
        titulo: 'Depende de você',
        itens: [
          'Número <strong>só para divulgação</strong>, com foto e nome.',
          'Intervalos de <strong>30 minutos ou mais</strong> por grupo; menos posts por dia nas primeiras semanas.',
          'Não adicione pessoas em massa nos grupos. Prefira link de convite.',
          'Varie os templates: o mesmo texto repetido o dia todo parece robô.',
        ],
      },
    ],
  },

  {
    id: 'sistema',
    icone: '⚙️',
    titulo: 'Backup, limpeza e status',
    resumo: 'Manutenção do dia a dia.',
    rota: 'sistema',
    blocos: [
      {
        itens: [
          '<strong>Configurações → Backup:</strong> gerar, restaurar e exportar para Excel.',
          '<strong>Configurações → Limpeza:</strong> apagar dados velhos (histórico, logs).',
          '<strong>Configurações → Logs:</strong> tudo o que o sistema registrou.',
          '<strong>Status:</strong> se WhatsApp, Telegram, lojas e IA estão no ar.',
        ],
      },
    ],
  },

  {
    id: 'envio-real',
    icone: '🔓',
    titulo: 'Sair do modo simulação',
    resumo: 'Quando começar a enviar de verdade.',
    blocos: [
      {
        passos: [
          'Mande um teste para um grupo seu e confira o post (texto, preço, cupom e link).',
          'Confira o ID de afiliado dos seus produtos (etiquetas 🔗 na lista).',
          'Só então peça para ligar o envio real.',
        ],
      },
      {
        tipo: 'admin',
        itens: ['No <code>.env</code>, <code>DRY_RUN=false</code> e reiniciar. O aviso MODO SIMULAÇÃO some do topo.'],
      },
    ],
  },

  {
    id: 'problemas',
    icone: '❓',
    titulo: 'Problemas comuns',
    resumo: 'Sintoma → o que fazer.',
    blocos: [
      {
        itens: [
          '<strong>Nada é enviado:</strong> está em MODO SIMULAÇÃO? A campanha está ativa? O grupo está dentro do horário?',
          '<strong>"sem comissão" nos produtos do ML/Shopee:</strong> conecte a loja de novo (o cookie venceu).',
          '<strong>"ID de outra conta":</strong> o cookie conectado é de outra conta, ou a tag/ID em Minhas lojas está errada.',
          '<strong>O post saiu sem imagem:</strong> a imagem da loja falhou; o sistema manda só o texto para a oferta não se perder.',
          '<strong>A busca diz que a loja bloqueou:</strong> espere alguns minutos. Buscas seguidas demais fazem a loja barrar.',
          '<strong>Não recebo resposta no privado:</strong> seu número está autorizado? O modo simulação está ligado?',
        ],
      },
    ],
  },
];
