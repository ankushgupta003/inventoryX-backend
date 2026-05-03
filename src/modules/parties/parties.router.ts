import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';
import { requirePermission } from '../../middleware/permissions';
import { mapUniqueConstraintError } from '../shared/masterData';
import {
  partyListQuerySchema,
  partyStatusSchema,
  partyUpsertSchema,
} from './parties.schemas';
import {
  buildPartyCreateData,
  buildPartyOrderBy,
  buildPartyWhere,
  createPartySummaryResponse,
  serializeParty,
} from './parties.utils';

export const partiesRouter = Router();

partiesRouter.get('/', requirePermission('parties.view'), async (req, res, next) => {
  try {
    const query = partyListQuerySchema.parse(req.query);
    const companyId = req.auth!.companyId!;
    const where = buildPartyWhere(companyId, query);
    const filteredTotalPromise = prisma.party.count({ where });
    const partiesPromise = prisma.party.findMany({
      where,
      orderBy: buildPartyOrderBy(query.sortBy, query.sortOrder),
      ...(query.paginate
        ? {
            skip: (query.page - 1) * query.limit,
            take: query.limit,
          }
        : {}),
    });

    const summaryPromises = Promise.all([
      prisma.party.count({ where: { companyId } }),
      prisma.party.count({ where: { companyId, isActive: true } }),
      prisma.party.count({ where: { companyId, isActive: false } }),
      prisma.party.count({ where: { companyId, partyType: 'VENDOR' } }),
      prisma.party.count({ where: { companyId, partyType: 'CUSTOMER' } }),
      prisma.party.count({ where: { companyId, partyType: 'BOTH' } }),
    ]);

    const [filteredTotal, parties, [total, active, inactive, vendors, customers, both]] = await Promise.all([
      filteredTotalPromise,
      partiesPromise,
      summaryPromises,
    ]);

    const totalPages = query.paginate ? Math.ceil(filteredTotal / query.limit) : 1;

    res.json({
      data: parties.map(serializeParty),
      meta: {
        pagination: {
          page: query.paginate ? query.page : 1,
          limit: query.paginate ? query.limit : filteredTotal,
          total: filteredTotal,
          totalPages,
          hasNextPage: query.paginate ? query.page < totalPages : false,
          hasPreviousPage: query.paginate ? query.page > 1 : false,
          paginate: query.paginate,
        },
        filters: {
          search: query.search,
          status: query.status,
          partyType: query.partyType,
        },
        sort: {
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
        },
        summary: createPartySummaryResponse({ total, active, inactive, vendors, customers, both }),
      },
    });
  } catch (error) {
    next(error);
  }
});

partiesRouter.get('/:id', requirePermission('parties.view'), async (req, res, next) => {
  try {
    const partyId = String(req.params.id);
    const party = await prisma.party.findFirst({
      where: {
        id: partyId,
        companyId: req.auth!.companyId!,
      },
    });

    if (!party) {
      throw new AppError(404, 'Party not found');
    }

    res.json({ data: serializeParty(party) });
  } catch (error) {
    next(error);
  }
});

partiesRouter.post('/', requirePermission('parties.create'), async (req, res, next) => {
  try {
    const payload = partyUpsertSchema.parse(req.body);
    const party = await prisma.party.create({
      data: buildPartyCreateData(req.auth!.companyId!, payload),
    });

    res.status(201).json({ data: serializeParty(party) });
  } catch (error) {
    try {
      mapUniqueConstraintError(
        error,
        {
          nameNormalized: 'Party name already exists',
          gstNumberNormalized: 'GST number already exists',
          panNumberNormalized: 'PAN number already exists',
        },
        'Party already exists',
      );
    } catch (mappedError) {
      return next(mappedError);
    }

    next(error);
  }
});

partiesRouter.put('/:id', requirePermission('parties.edit'), async (req, res, next) => {
  try {
    const payload = partyUpsertSchema.parse(req.body);
    const companyId = req.auth!.companyId!;
    const partyId = String(req.params.id);
    const party = await prisma.party.findFirst({
      where: {
        id: partyId,
        companyId,
      },
    });

    if (!party) {
      throw new AppError(404, 'Party not found');
    }

    const updated = await prisma.party.update({
      where: { id: party.id },
      data: buildPartyCreateData(companyId, payload),
    });

    res.json({ data: serializeParty(updated) });
  } catch (error) {
    try {
      mapUniqueConstraintError(
        error,
        {
          nameNormalized: 'Party name already exists',
          gstNumberNormalized: 'GST number already exists',
          panNumberNormalized: 'PAN number already exists',
        },
        'Party already exists',
      );
    } catch (mappedError) {
      return next(mappedError);
    }

    next(error);
  }
});

partiesRouter.patch('/:id/status', requirePermission('parties.edit'), async (req, res, next) => {
  try {
    const payload = partyStatusSchema.parse(req.body ?? {});
    const companyId = req.auth!.companyId!;
    const partyId = String(req.params.id);
    const party = await prisma.party.findFirst({
      where: {
        id: partyId,
        companyId,
      },
    });

    if (!party) {
      throw new AppError(404, 'Party not found');
    }

    const updated = await prisma.party.update({
      where: { id: party.id },
      data: {
        isActive: payload.isActive ?? !party.isActive,
      },
    });

    res.json({ data: serializeParty(updated) });
  } catch (error) {
    next(error);
  }
});
