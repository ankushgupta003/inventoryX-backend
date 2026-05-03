import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';
import { requirePermission } from '../../middleware/permissions';
import { mapUniqueConstraintError } from '../shared/masterData';
import { itemCategoryOptionsQuerySchema, itemListQuerySchema, itemStatusSchema, itemUpsertSchema } from './items.schemas';
import {
  buildItemCreateData,
  buildItemOrderBy,
  buildItemWhere,
  serializeItemCategory,
  serializeItem,
  toItemType,
} from './items.utils';

export const itemsRouter = Router();

async function ensureItemCategory(companyId: string, payload: { categoryId?: string; itemType: 'raw' | 'finished' }) {
  if (!payload.categoryId) {
    return null;
  }

  const category = await prisma.itemCategory.findFirst({
    where: {
      id: payload.categoryId,
      companyId,
      itemType: toItemType(payload.itemType),
    },
  });

  if (!category) {
    throw new AppError(400, 'Selected category is invalid for this item type');
  }

  return category.id;
}

itemsRouter.get('/', requirePermission('items.view'), async (req, res, next) => {
  try {
    const query = itemListQuerySchema.parse(req.query);
    const companyId = req.auth!.companyId!;
    const where = buildItemWhere(companyId, query);
    const filteredTotalPromise = prisma.item.count({ where });
    const itemsPromise = prisma.item.findMany({
      where,
      include: {
        categoryMaster: {
          select: {
            id: true,
            name: true,
            isActive: true,
            itemType: true,
          },
        },
      },
      orderBy: buildItemOrderBy(query.sortBy, query.sortOrder),
      ...(query.paginate
        ? {
            skip: (query.page - 1) * query.limit,
            take: query.limit,
          }
        : {}),
    });

    const summaryPromises = Promise.all([
      prisma.item.count({ where: { companyId } }),
      prisma.item.count({ where: { companyId, isActive: true } }),
      prisma.item.count({ where: { companyId, isActive: false } }),
      prisma.item.count({ where: { companyId, itemType: 'RAW' } }),
      prisma.item.count({ where: { companyId, itemType: 'FINISHED' } }),
    ]);

    const [filteredTotal, items, [total, active, inactive, raw, finished]] = await Promise.all([
      filteredTotalPromise,
      itemsPromise,
      summaryPromises,
    ]);

    const totalPages = query.paginate ? Math.ceil(filteredTotal / query.limit) : 1;

    res.json({
      data: items.map(serializeItem),
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
          itemType: query.itemType,
          category: query.category || '',
          baseUnit: query.baseUnit || '',
        },
        sort: {
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
        },
        summary: {
          total,
          active,
          inactive,
          raw,
          finished,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

itemsRouter.get('/category-options', requirePermission('items.view'), async (req, res, next) => {
  try {
    const query = itemCategoryOptionsQuerySchema.parse(req.query);
    const companyId = req.auth!.companyId!;
    const categories = await prisma.itemCategory.findMany({
      where: {
        companyId,
        ...(query.itemType !== 'all' ? { itemType: toItemType(query.itemType) } : {}),
      },
      orderBy: [{ itemType: 'asc' }, { nameNormalized: 'asc' }],
    });

    res.json({ data: categories.map(serializeItemCategory) });
  } catch (error) {
    next(error);
  }
});

itemsRouter.get('/:id', requirePermission('items.view'), async (req, res, next) => {
  try {
    const itemId = String(req.params.id);
    const item = await prisma.item.findFirst({
      where: {
        id: itemId,
        companyId: req.auth!.companyId!,
      },
      include: {
        categoryMaster: {
          select: {
            id: true,
            name: true,
            isActive: true,
            itemType: true,
          },
        },
      },
    });

    if (!item) {
      throw new AppError(404, 'Item not found');
    }

    res.json({ data: serializeItem(item) });
  } catch (error) {
    next(error);
  }
});

itemsRouter.post('/', requirePermission('items.create'), async (req, res, next) => {
  try {
    const payload = itemUpsertSchema.parse(req.body);
    const companyId = req.auth!.companyId!;
    const categoryId = await ensureItemCategory(companyId, payload);
    const item = await prisma.item.create({
      data: buildItemCreateData(companyId, { ...payload, categoryId: categoryId ?? undefined }),
      include: {
        categoryMaster: {
          select: {
            id: true,
            name: true,
            isActive: true,
            itemType: true,
          },
        },
      },
    });

    res.status(201).json({ data: serializeItem(item) });
  } catch (error) {
    try {
      mapUniqueConstraintError(
        error,
        {
          storeNameNormalized: 'Store name already exists',
          tallyNameNormalized: 'Tally name already exists',
          skuNormalized: 'SKU already exists',
        },
        'Item already exists',
      );
    } catch (mappedError) {
      return next(mappedError);
    }

    next(error);
  }
});

itemsRouter.put('/:id', requirePermission('items.edit'), async (req, res, next) => {
  try {
    const payload = itemUpsertSchema.parse(req.body);
    const companyId = req.auth!.companyId!;
    const itemId = String(req.params.id);
    const item = await prisma.item.findFirst({
      where: {
        id: itemId,
        companyId,
      },
    });

    if (!item) {
      throw new AppError(404, 'Item not found');
    }

    const categoryId = await ensureItemCategory(companyId, payload);

    const updated = await prisma.item.update({
      where: { id: item.id },
      data: buildItemCreateData(companyId, { ...payload, categoryId: categoryId ?? undefined }),
      include: {
        categoryMaster: {
          select: {
            id: true,
            name: true,
            isActive: true,
            itemType: true,
          },
        },
      },
    });

    res.json({ data: serializeItem(updated) });
  } catch (error) {
    try {
      mapUniqueConstraintError(
        error,
        {
          storeNameNormalized: 'Store name already exists',
          tallyNameNormalized: 'Tally name already exists',
          skuNormalized: 'SKU already exists',
        },
        'Item already exists',
      );
    } catch (mappedError) {
      return next(mappedError);
    }

    next(error);
  }
});

itemsRouter.patch('/:id/status', requirePermission('items.edit'), async (req, res, next) => {
  try {
    const payload = itemStatusSchema.parse(req.body ?? {});
    const companyId = req.auth!.companyId!;
    const itemId = String(req.params.id);
    const item = await prisma.item.findFirst({
      where: {
        id: itemId,
        companyId,
      },
    });

    if (!item) {
      throw new AppError(404, 'Item not found');
    }

    const updated = await prisma.item.update({
      where: { id: item.id },
      data: {
        isActive: payload.isActive ?? !item.isActive,
      },
    });

    res.json({ data: serializeItem(updated) });
  } catch (error) {
    next(error);
  }
});
