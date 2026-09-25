# Afiliados e marketplaces

## Como cada loja entra no sistema

Cada marketplace é um **adapter** independente em `src/integrations/marketplaces/`.
Nenhuma regra de negócio conhece "Mercado Livre" ou "Shopee" pelo nome — todas falam
com a interface `MarketplaceAdapter`.

---

## Situação atual

| Marketplace | Status | O que falta |
|---|---|---|
| **Loja Demo** | funcionando | nada — catálogo fictício de testes |
| **Mercado Livre** | **implementado** | suas credenciais + autorizar uma vez |
| **Shopee** | **implementado** | credenciais do programa de afiliados |
| **Amazon (navegação)** | **funcionando** | nada — mas bloqueia em uso intenso |
| AliExpress | adapter pendente | conta no AliExpress Portals + app key/secret |
| Amazon (API) | adapter pendente | Amazon Associates + PA-API 5 |
| SHEIN | adapter pendente | normalmente via rede (Awin/Rakuten) |
| Magalu | adapter pendente | Parceiro Magalu / rede de afiliados |
| Awin (rede) | adapter pendente | token da API + publisher id |

"Pendente" significa exatamente isso: o adapter existe, aparece no painel como
*integração pendente* e **não devolve nenhum dado**. O sistema não inventa produto,
preço ou link.

> **As duas lojas fecharam o acesso anônimo.** Testado: `api.mercadolibre.com` e a
> busca da Shopee respondem **403** para quem não está autenticado. Não existe atalho
> — a alternativa seria raspar as páginas, que quebra a cada mudança de layout e
> costuma violar os termos do programa de afiliados, ou seja, arrisca justamente a
> conta que paga a comissão.

---

## Mercado Livre — passo a passo

A busca exige `Authorization: Bearer`. Os grant types aceitos são `authorization_code`
e `refresh_token` — **não existe client_credentials**. Por isso você autoriza uma vez
no navegador e o sistema renova sozinho a partir daí.

### 1. Criar a aplicação

1. Entre em <https://developers.mercadolivre.com.br/devcenter> → **Criar aplicação**.
2. Preencha nome e descrição.
3. Em **URI de redirect**, coloque uma URL **https de domínio próprio**.

   > ⚠️ O Mercado Livre **recusa URL do domínio dele**. Cadastrar
   > `https://www.mercadolivre.com.br/` devolve *"O endereço deve ser válido"*.

   | Situação | Use | Retorno |
   |---|---|---|
   | Tem domínio próprio | `https://afiliados.seudominio.com.br/oauth/mercadolivre/callback` | **automático** |
   | Tem domínio, sem túnel | `https://seudominio.com.br/callback` | manual (code na barra) |
   | Não tem domínio | `https://oauth.pstmn.io/v1/callback` | manual (a página mostra o code) |

   Nas duas últimas, a página de destino nem precisa existir: o código aparece na
   barra de endereços de qualquer jeito.
4. Marque as permissões de **leitura** (read).
5. Anote **App ID** e **Secret Key**.

### 2. Colocar no `.env`

```env
MERCADOLIVRE_CLIENT_ID=seu_app_id
MERCADOLIVRE_CLIENT_SECRET=sua_secret_key
MERCADOLIVRE_REDIRECT_URI=https://www.mercadolivre.com.br/
```

`MERCADOLIVRE_REDIRECT_URI` precisa ser **idêntica** à cadastrada na aplicação.
Depois de salvar, rode `REINICIAR.bat`.

### 3. Autorizar

No painel: **PRODUTOS → Lojas conectadas → Mercado Livre → Conectar**.

1. Clique em **Abrir autorização do Mercado Livre** e autorize.
2. O navegador volta para a sua URL de retorno com `?code=TG-xxxxx` no endereço.
3. Copie o que vem depois de `code=` e cole no campo do painel.
4. **Conectar**.

O código vale poucos minutos e só serve uma vez. Se expirar, repita.

### 4. Pronto

O sistema guarda `access_token` e `refresh_token` e renova sozinho (o access dura ~6h,
o refresh ~6 meses). Teste em **Lojas conectadas → Testar busca**, e depois use
**PRODUTOS → Procurar produtos** escolhendo Mercado Livre.

**Filtros que a API entende:** palavra-chave, categoria, faixa de preço, frete grátis
e desconto mínimo. Ordenação por preço é nativa; por vendas e desconto o sistema
ordena o resultado depois, com os dados que vieram.

---

## Shopee — passo a passo

Não tem OAuth: cada requisição é assinada com
`SHA256(appId + timestamp + payload + secret)`, no cabeçalho
`Authorization: SHA256 Credential=..., Timestamp=..., Signature=...`.

### 1. Entrar no programa

1. Cadastre-se em <https://affiliate.shopee.com.br>.
2. **A aprovação não é imediata** — a Shopee analisa o cadastro.
3. Aprovado: em **Open API**, gere as credenciais (App ID e Secret).

### 2. Colocar no `.env`

```env
SHOPEE_APP_ID=seu_app_id
SHOPEE_APP_SECRET=seu_secret
```

`REINICIAR.bat` e pronto — sem autorização no navegador.

### 3. Testar

**PRODUTOS → Lojas conectadas → Shopee → Testar busca.**

Erros comuns e o que significam:

| Mensagem | Significado |
|---|---|
| `10035 ... do not have access to the Shopee Affiliate Open API` | as credenciais existem mas a conta ainda não tem acesso liberado à Open API |
| `Invalid Signature` | App ID ou Secret errados no `.env` |
| `HTTP 401` | credenciais inválidas |

O link que a Shopee devolve (`offerLink`) **já vem com o seu rastreio** — o sistema não
reescreve esse link.


---

## Mercado Livre pelo cookie (o jeito que funciona hoje)

**Por que não é pela API:** a busca pública da API do ML está fechada para aplicações
comuns desde abril de 2025, e o programa de afiliados **nunca teve API oficial**
(testado: token de app dá 403 na busca). As plataformas de afiliado (DivulgaLinks,
Promium e outras) usam a sessão do usuário — e é o que este sistema faz.

**O que o cookie faz:** gera o link de afiliado `meli.la/...` — o único que paga comissão
no ML. É a mesma chamada que a página *linkbuilder* do seu painel faz quando você clica
em "Gerar link" (cookie da sessão + token `_csrf`). Validado: devolveu
`https://meli.la/18qrG5t` para um produto real.

**Como usar:**

1. Instale o **Cookie Editor** no Chrome.
2. Entre em `mercadolivre.com.br/afiliados/linkbuilder` **logado** (o cookie `_csrf`
   precisa vir junto — por isso exporte estando nessa página).
3. Cookie Editor → Export → Export as JSON.
4. **PRODUTOS → Conectar lojas → Mercado Livre** → cole e salve.
5. Teste com o campo **"Link de afiliado"** colando qualquer produto do ML.

A tag do link é o **apelido da conta** (cookie `orgnickp`). Se você criou uma tag no
painel de afiliados, coloque-a no campo de tag.

**A partir daí, sozinho:**
- todo produto do ML que entra (extensão, importação) já é convertido;
- na hora de publicar, se algum ainda estiver sem `meli.la`, o sistema tenta converter;
- se não conseguir, o preview avisa **SEM COMISSÃO** em vez de publicar calado.

**Quando parar de funcionar:** o cookie envelhece. A mensagem será
*"O Mercado Livre recusou a sessão… o cookie expirou"* — é só exportar e colar de novo.

**Busca de produtos no ML:** a busca pelo site cai em captcha quando feita pelo sistema.
Os produtos entram pela **extensão** (você navega, ela captura) e a conversão para
`meli.la` acontece na chegada.

---

## O segundo jeito: coleta por navegação (scraping)

Além das APIs oficiais, existe o coletor por navegação: um navegador de verdade
(Chromium headless) abre a página da loja e lê os produtos da tela. Serve para loja
sem API, ou enquanto a credencial não sai.

### O que os testes mostraram (medido, não suposto)

| Loja | Resultado |
|---|---|
| **Amazon BR** | ✅ **48 produtos** na 1ª busca — e **bloqueio na 4ª** ("Algo deu errado") |
| Mercado Livre | ❌ redireciona para `/account-verification` e exige login |
| Shopee | ❌ carrega a casca da página; a lista não renderiza para automação |
| Magazine Luiza | ❌ "Não é possível acessar a página" |

Ou seja: **funciona, mas é instável por natureza.** O que derrubou a Amazon no teste
foi a rajada de buscas seguidas do mesmo IP — por isso o coletor tem intervalo mínimo,
cache e detecção de bloqueio.

Para Mercado Livre e Shopee, o caminho que funciona de verdade continua sendo a API
oficial. Insistir na navegação ali exigiria logar com uma conta real no navegador
automatizado — que é justamente a conta de afiliado que você não quer arriscar.

### Ligar

```bat
SUBIR-NAVEGADOR.bat
```

No `.env`:

```env
SCRAPER_ENABLED=true
BROWSERLESS_URL=http://localhost:3004
SCRAPER_INTERVALO_SEGUNDOS=30    # intervalo mínimo entre buscas na mesma loja
SCRAPER_CACHE_MINUTOS=30         # não repete a mesma busca dentro da janela
```

`REINICIAR.bat`. As lojas aparecem na busca com o sufixo **(navegação)** —
`amazon-web`, `mercadolivre-web`, `shopee-web`, `magalu-web` — separadas das oficiais,
para você sempre saber de onde veio cada produto.

### Os três freios (e por que existem)

1. **Intervalo mínimo por loja** (30s): rajada é o que causa bloqueio. Zero cai no padrão.
2. **Cache** (30 min): a mesma busca não vai duas vezes à loja.
3. **Detecção de bloqueio**: se a página virou login, captcha ou erro, o sistema **diz
   isso** em vez de devolver lista vazia fingindo que a busca não achou nada.

E um cuidado no preço: o "de/por" só é aceito se for plausível (maior que o preço atual
e no máximo 5x). Coleta por navegação erra de cartão às vezes, e um desconto inventado
no post é pior do que nenhum desconto.

### Quando o layout da loja mudar

Vai mudar — é a natureza da coisa. Quando acontecer, a busca passa a devolver
"não devolveu nenhum produto". O conserto é ajustar os seletores em
`src/integrations/marketplaces/scraper.js`, no objeto `RECEITAS`:

```javascript
amazon: {
  busca: (termo) => `https://www.amazon.com.br/s?k=${encodeURIComponent(termo)}`,
  cartao: '[data-component-type="s-search-result"]',   // o cartão de cada produto
  campos: {
    titulo: { seletor: 'h2' },
    preco: { seletor: '.a-price .a-offscreen', numero: true },
    imagem: { seletor: 'img.s-image', propriedade: 'src' },
    url: { seletor: 'a[href*="/dp/"]', propriedade: 'href' },
  },
}
```

Loja nova = um objeto novo aqui. Nenhum código a mais.

### O que isso significa na prática

Use a navegação como **complemento**, não como base: para descobrir produto e ter ideia
de preço. Para campanha que roda o dia todo, API oficial — ela não bloqueia, não muda de
layout e o link já sai com sua comissão.

---

## Cadastrar o programa no painel

**CONTEÚDO → Afiliados → + Novo**

| Campo | Exemplo |
|---|---|
| Nome | Amazon Associates |
| Marketplace | `amazon` |
| ID de afiliado / tracking | `meusite-20` |
| Parâmetro na URL | `tag` |

Isso serve para as lojas onde o link de afiliado é montado por parâmetro
(`https://…/produto?tag=meusite-20`). Mercado Livre e Shopee não precisam disso quando
conectados por API — o link já sai correto.

O identificador aparece **mascarado** na tela. As chaves de API ficam só no `.env`.

---

## Links: nada é perdido

| Campo | O que é |
|---|---|
| `url_original` | link da loja, **nunca apagado** |
| `url_afiliado` | seu link com comissão |
| `url_final` | o que vai no post (afiliado; cai no original se não houver) |

---

## Implementar outro marketplace

1. Crie `src/integrations/marketplaces/minhaloja.js`:

```javascript
import { MarketplaceAdapter } from './base.js';

export class MinhaLojaAdapter extends MarketplaceAdapter {
  constructor(credenciais) {
    super({
      nome: 'minhaloja',
      rotulo: 'Minha Loja',
      implementado: Boolean(credenciais.apiKey),   // sem chave = pendente, sem inventar dado
      motivo: 'Falta MINHALOJA_API_KEY no .env.',
    });
    this.credenciais = credenciais;
  }

  async search(filtros) {
    const resposta = await fetch(/* API oficial da loja */);
    const dados = await resposta.json();
    return dados.items.map((item) => this.normalize({
      external_id: item.id,
      titulo: item.title,
      preco: item.price,
      preco_anterior: item.original_price,
      url: item.url,
      imagem: item.image,
      vendas: item.sales,
      avaliacao: item.rating,
    }));
  }
}
```

2. Registre em `src/integrations/marketplaces/index.js`.
3. Acrescente as credenciais em `src/config/index.js` e no `.env.example`.

Ele aparece sozinho na busca, nas campanhas, no status e na tela de Lojas conectadas.

**Regra:** use a documentação oficial da loja. Sem API pública, deixe o adapter como
pendente em vez de raspar a página.
