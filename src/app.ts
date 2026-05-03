import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { requireAuth, requireCompanyAdmin, requireSuperAdmin } from './middleware/auth';
import { requireCompanyMember } from './middleware/permissions';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth.routes';
import { superAdminRouter } from './routes/superAdmin.routes';
import { adminRouter } from './routes/admin.routes';
import { partiesRouter } from './modules/parties/parties.router';
import { itemsRouter } from './modules/items/items.router';
import { purchasesRouter } from './modules/purchases/purchases.router';
import { ledgerRouter } from './modules/ledger/ledger.router';
import { productionRouter } from './modules/production/production.router';
import { mrsRouter } from './modules/mrs/mrs.router';
import { stockMovementsRouter } from './modules/stockMovements/stockMovements.router';
import { proformaInvoicesRouter } from './modules/proformaInvoices/proformaInvoices.router';
import { invoicesRouter } from './modules/invoices/invoices.router';
import { qualityRequestsRouter } from './modules/qualityRequests/qualityRequests.router';

export function createApp() {
  const app = express();
  const allowedOrigins = env.FRONTEND_URL.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  app.use(cors({
    origin: (origin, callback) => {
      callback(null, !origin || allowedOrigins.includes(origin));
    },
    credentials: true,
  }));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ data: { status: 'ok' } });
  });

  app.use('/auth', authRouter);
  app.use('/super-admin', requireAuth, requireSuperAdmin, superAdminRouter);
  app.use('/admin', requireAuth, requireCompanyAdmin, adminRouter);
  app.use('/parties', requireAuth, requireCompanyMember, partiesRouter);
  app.use('/items', requireAuth, requireCompanyMember, itemsRouter);
  app.use('/purchases', requireAuth, requireCompanyMember, purchasesRouter);
  app.use('/production', requireAuth, requireCompanyMember, productionRouter);
  app.use('/mrs', requireAuth, requireCompanyMember, mrsRouter);
  app.use('/stock-movements', requireAuth, requireCompanyMember, stockMovementsRouter);
  app.use('/ledger', requireAuth, requireCompanyMember, ledgerRouter);
  app.use('/proforma-invoices', requireAuth, requireCompanyMember, proformaInvoicesRouter);
  app.use('/invoices', requireAuth, requireCompanyMember, invoicesRouter);
  app.use('/quality-requests', requireAuth, requireCompanyMember, qualityRequestsRouter);

  app.use(errorHandler);

  return app;
}
