/**
 * "Comece aqui": o sistema olha para si mesmo e diz o que já está pronto e o
 * que falta. Nada é marcado à mão — cada passo é uma checagem de verdade no
 * banco e nos serviços, então a lista nunca mente.
 */
import { config } from '../../config/index.js';
import {
  productRepository, channelRepository, campaignRepository,
  affiliateRepository, publicationRepository, couponRepository, promotionRepository,
} from '../repositories/index.js';
import { getWhatsAppProvider } from '../../integrations/whatsapp/index.js';
import { listaDeLojas } from '../../integrations/marketplaces/lojas.js';
import { resumoSessao } from './sessaoLojaService.js';

export async function firstSteps() {
  const canais = channelRepository.count();
  const produtos = productRepository.count();
  const campanhas = campaignRepository.count();
  const campanhasAtivas = campaignRepository.count({ status: 'ativa' });
  const testesFeitos = publicationRepository.count({ status: 'enviado' });

  // Loja pronta = tem a tag (Amazon/Shopee/Magalu) ou o cookie (Mercado Livre,
  // que gera o meli.la pela sessão e usa o apelido da conta como tag).
  const comTag = new Set(affiliateRepository.list({ limit: 200 })
    .filter((a) => a.identificador).map((a) => a.marketplace));
  const lojasProntas = listaDeLojas().filter((l) => (l.linkAfiliado === 'cookie'
    ? resumoSessao(l.id).configurada
    : comTag.has(l.id)));

  let whatsapp = { online: false, conectado: false, provider: config.whatsapp.provider };
  try {
    whatsapp = await getWhatsAppProvider().status();
  } catch { /* offline conta como não configurado */ }

  const usandoWahaDeVerdade = config.whatsapp.provider === 'waha';
  const whatsappPronto = usandoWahaDeVerdade && Boolean(whatsapp.conectado);

  const passos = [
    {
      id: 'instalacao',
      titulo: 'Sistema instalado e rodando',
      explicacao: 'Banco criado e painel no ar.',
      feito: true,
      obrigatorio: true,
      detalhe: `${produtos} produtos, ${couponRepository.count()} cupons e ${promotionRepository.count()} promoções.`,
    },
    {
      id: 'whatsapp',
      titulo: 'Conectar o WhatsApp',
      explicacao: 'Use um número dedicado à divulgação, nunca o pessoal.',
      feito: whatsappPronto,
      obrigatorio: true,
      rota: '#/whatsapp',
      acao: 'Ir para a conexão',
      detalhe: !usandoWahaDeVerdade
        ? 'Troque WHATSAPP_PROVIDER=waha no .env e rode REINICIAR.bat.'
        : whatsapp.conectado
          ? `Conectado na sessão "${whatsapp.session}".`
          : `WAHA respondeu "${whatsapp.status || 'sem resposta'}" — falta parear o QR code.`,
      comando: !usandoWahaDeVerdade ? 'docker compose -f docker-compose.waha.yml up -d' : null,
    },
    {
      id: 'grupos',
      titulo: 'Cadastrar seus grupos',
      explicacao: 'Os grupos onde as ofertas vão ser publicadas.',
      feito: canais > 0,
      obrigatorio: true,
      rota: '#/canais',
      acao: 'Gerenciar grupos',
      detalhe: canais ? `${canais} grupo(s) cadastrado(s).` : 'Nenhum grupo cadastrado ainda.',
    },
    {
      id: 'lojas',
      titulo: 'Colocar suas lojas (cookie e tag)',
      explicacao: 'É o que transforma o link do produto no seu link com comissão.',
      feito: lojasProntas.length > 0,
      obrigatorio: true,
      rota: '#/lojas',
      acao: 'Abrir LOJAS',
      detalhe: lojasProntas.length
        ? `${lojasProntas.map((l) => l.nome).join(', ')} pronta(s).`
        : 'Nenhuma loja com tag ou cookie ainda.',
    },
    {
      id: 'produtos',
      titulo: 'Colocar produtos de verdade',
      explicacao: 'Busque na Amazon, capture pela extensão, cadastre na mão ou importe planilha.',
      feito: produtos > 0,
      obrigatorio: true,
      rota: '#/buscar',
      acao: 'Procurar produtos',
      detalhe: produtos ? `${produtos} produto(s) na base.` : 'Nenhum produto ainda.',
    },
    {
      id: 'promocoes',
      titulo: 'Criar promoção ou cupom',
      explicacao: 'Opcional: dá para divulgar produto só pelo preço normal.',
      feito: promotionRepository.count() > 0 || couponRepository.count() > 0,
      obrigatorio: false,
      rota: '#/promocoes',
      acao: 'Criar promoção',
      detalhe: 'Promoção e cupom só entram no post quando estão válidos na hora do envio.',
    },
    {
      id: 'campanha',
      titulo: 'Criar sua campanha',
      explicacao: 'A regra automática: o que publicar, em quais grupos e de quanto em quanto tempo.',
      feito: campanhas > 0,
      obrigatorio: true,
      rota: '#/campanhas',
      acao: 'Criar campanha',
      detalhe: campanhas ? `${campanhas} campanha(s).` : 'Nenhuma campanha ainda.',
    },
    {
      id: 'teste',
      titulo: 'Mandar um teste e conferir o post',
      explicacao: 'Veja o texto, o preço e o cupom exatamente como vão sair no grupo.',
      feito: testesFeitos > 0,
      obrigatorio: true,
      rota: '#/produtos',
      acao: 'Testar em um produto',
      detalhe: testesFeitos
        ? `${testesFeitos} publicação(ões) no histórico.`
        : 'Abra um produto, clique em 👁️ e use "Enviar teste agora".',
    },
    {
      id: 'ativar',
      titulo: 'Ativar a campanha',
      explicacao: 'A partir daqui o sistema publica sozinho, respeitando horário e intervalo.',
      feito: campanhasAtivas > 0,
      obrigatorio: true,
      rota: '#/campanhas',
      acao: 'Ativar campanha',
      detalhe: campanhasAtivas
        ? `${campanhasAtivas} campanha(s) ativa(s).`
        : 'Nenhuma campanha ativa — nada será publicado automaticamente.',
    },
  ];

  const obrigatorios = passos.filter((p) => p.obrigatorio);
  const concluidos = obrigatorios.filter((p) => p.feito).length;
  const proximo = passos.find((p) => p.obrigatorio && !p.feito) || null;

  return {
    passos,
    total: obrigatorios.length,
    concluidos,
    percentual: Math.round((concluidos / obrigatorios.length) * 100),
    proximo_passo: proximo?.id || null,
    tudo_pronto: concluidos === obrigatorios.length,
    // Enquanto DRY_RUN estiver ligado a tela avisa: esconder isso faria parecer que o envio saiu.
    modo_simulacao: config.runtime.dryRun,
  };
}
