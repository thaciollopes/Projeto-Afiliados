# IA

## O que a IA pode e o que não pode

| Pode | Não pode |
|---|---|
| melhorar o título | inventar preço |
| reescrever a descrição | inventar desconto |
| criar a chamada do post | inventar cupom |
| criar CTA | inventar avaliação ou vendas |
| gerar variações do mesmo texto | inventar característica do produto |
| adaptar o texto para WhatsApp | prometer resultado |

A separação é dura: **a IA mexe em texto, o sistema calcula os números.** O preço
entra no post pelo template, vindo do `pricingService` — nunca do modelo.

---

## Como a trava funciona

Duas camadas, em `src/integrations/ai/`:

**1. Instrução (guards.js → SYSTEM_PROMPT)** — o modelo é orientado a não escrever
valores em R$ nem percentuais, porque o sistema insere os preços depois.

**2. Verificação (enforceFactualText)** — o texto que volta é varrido:

- todo valor em R$ é comparado com a lista de preços permitidos daquele produto;
- todo percentual é comparado com o desconto real;
- todo código de cupom é comparado com o cupom válido.

Achou algo fora da lista? **O trecho é removido** antes de chegar ao post, e a tentativa
vira um aviso na tela e uma linha no log. Não é confiança no modelo — é código.

Você vê isso funcionando: no botão ✨, se houver remoção, aparece
*"⚠️ A IA tentou inventar dados e o sistema removeu: …"*.

---

## Providers

```env
AI_PROVIDER=mock          # mock | anthropic | compatible
AI_API_KEY=
AI_MODEL=claude-opus-5
AI_BASE_URL=              # só para compatible
AI_MAX_TOKENS=800
```

### mock (padrão)

Regras locais: limpa o título (tira "frete grátis", "50% OFF", códigos, repetição),
ajusta maiúsculas e monta chamadas simples. **Sem custo, sem internet, sem chave.**
Já resolve o pior dos títulos de marketplace.

### anthropic

Usa o SDK oficial:

```bash
npm install @anthropic-ai/sdk
```

```env
AI_PROVIDER=anthropic
AI_API_KEY=sk-ant-...
AI_MODEL=claude-opus-5
```

Modelos e custo relativo: `claude-opus-5` (melhor texto), `claude-sonnet-5`
(equilíbrio), `claude-haiku-4-5` (mais barato). Para título de produto, Haiku ou Sonnet
já resolvem — a tarefa é simples e o volume costuma ser alto.

O provider usa `effort: low` (texto curto não precisa de raciocínio longo) e ativa o
*fallback* da API: se o modelo recusar a geração, a própria Anthropic refaz em outro
modelo, em vez de devolver nada.

### compatible

Qualquer endpoint no formato `/v1/chat/completions` — OpenAI, Groq, OpenRouter, Ollama
ou LM Studio local:

```env
AI_PROVIDER=compatible
AI_BASE_URL=http://localhost:11434    # exemplo: Ollama
AI_MODEL=llama3.1
AI_API_KEY=
```

---

## Usando no dia a dia

**Num produto:** botão ✨ → escolha a tarefa → **Gerar** → leia → **Salvar no produto**.
Nada é salvo antes de você aprovar. O original **nunca** é sobrescrito: a sugestão vai
para `titulo_publicacao` / `descricao_publicacao`, e o campo original fica intacto para
você restaurar quando quiser.

**Numa campanha:** marque **Melhorar textos com IA**. Aí a melhoria acontece na hora de
montar cada post.

> Com a IA ligada na campanha, cada publicação vira uma chamada à API. Em campanha que
> roda o dia todo, isso vira dinheiro. O caminho mais econômico: melhore os títulos uma
> vez, salve no produto, e deixe a campanha sem IA.

---

## Tarefas disponíveis

| Tarefa | O que gera |
|---|---|
| `titulo` | título curto (até 70 caracteres), sem código técnico nem preço |
| `descricao` | 1 a 2 frases sobre o produto |
| `post` | chamada de abertura (2–3 linhas) |
| `cta` | uma linha de chamada para ação |
| `variacoes` | 3 versões da abertura |

Via API:

```http
POST /api/produtos/:id/melhorar-ia
{ "tarefa": "titulo", "instrucao": "tom mais informal, foco em presente" }
```

---

## Se a IA falhar

A publicação **não para**. O sistema registra o erro no log e segue com o texto original
do produto. Um post com título cru é melhor do que post nenhum.
