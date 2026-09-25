import { Router } from 'express';
import { auth } from './middleware/index.js';
import { produtosRouter } from './routes/produtos.js';
import {
  categoriasRouter, cuponsRouter, promocoesRouter, templatesRouter,
  afiliadosRouter, pesquisasRouter,
} from './routes/catalogo.js';
import {
  canaisRouter, campanhasRouter, publicacoesRouter, whatsappRouter, n8nRouter,
} from './routes/operacao.js';
import { sistemaRouter, iaRouter } from './routes/sistema.js';
import { marketplacesRouter } from './routes/marketplaces.js';
import { publicConfig } from '../config/index.js';

export const apiRouter = Router();

apiRouter.use(auth);

apiRouter.get('/health', (_req, res) => res.json({ ok: true, em: new Date().toISOString() }));
apiRouter.get('/config', (_req, res) => res.json(publicConfig()));

apiRouter.use('/produtos', produtosRouter);
apiRouter.use('/categorias', categoriasRouter);
apiRouter.use('/cupons', cuponsRouter);
apiRouter.use('/promocoes', promocoesRouter);
apiRouter.use('/templates', templatesRouter);
apiRouter.use('/afiliados', afiliadosRouter);
apiRouter.use('/marketplaces', marketplacesRouter);
apiRouter.use('/pesquisas', pesquisasRouter);
apiRouter.use('/canais', canaisRouter);
apiRouter.use('/campanhas', campanhasRouter);
apiRouter.use('/publicacoes', publicacoesRouter);
apiRouter.use('/whatsapp', whatsappRouter);
apiRouter.use('/n8n', n8nRouter);
apiRouter.use('/sistema', sistemaRouter);
apiRouter.use('/ia', iaRouter);
