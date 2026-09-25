# Arquivo

Código retirado do sistema em 24/09/2026 a pedido do dono: tudo que dependia de
API oficial (Mercado Livre OAuth, Shopee Open API), a loja de demonstração, o modo
de coleta por navegador e a leitura de tela. Fica aqui só para consulta; nada nesta
pasta é carregado pelo sistema.

Motivo técnico do Mercado Livre: a busca da API foi fechada para aplicações comuns
em abril de 2025 e o programa de afiliados nunca teve API — o link de afiliado
(meli.la) é gerado pela sessão (cookie), em src/core/services/mercadoLivreLinkService.js.
