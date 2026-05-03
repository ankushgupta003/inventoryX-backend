import { ItemType, Prisma, ProductionBatchStatus, ProductionBmrStatus, StockLedgerEntryType } from '@prisma/client';
import { Router } from 'express';
import { AppError } from '../../errors/AppError';
import { prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/permissions';
import {
  materialRequisitionCreateSchema,
  productionBatchCreateSchema,
  productionBmrSaveSchema,
  productionBmrSubmitSchema,
  productionListQuerySchema,
  productionQaSchema,
} from './production.schemas';
import {
  buildLedgerEntryData,
  formatDateOnly,
  formatProductionNo,
  normalizeBmrPayload,
  parseDateOnly,
  serializeMaterialRequisition,
  serializeProductionBatch,
  serializeProductionBmr,
  toQtyDecimal,
  type BmrPayload,
  type MaterialRequisitionRecord,
  type ProductionBatchRecord,
} from './production.utils';

export const productionRouter = Router();

async function getProductionBatchOrThrow(companyId: string, id: string) {
  const batch = await prisma.productionBatch.findFirst({
    where: {
      id,
      companyId,
    },
    include: {
      bmr: true,
      _count: {
        select: {
          materialRequisitions: true,
          stockMovements: true,
        },
      },
    },
  });

  if (!batch) {
    throw new AppError(404, 'Production batch not found');
  }

  return batch;
}

productionRouter.get('/', requirePermission('production.view'), async (req, res, next) => {
  try {
    const query = productionListQuerySchema.parse(req.query);
    const companyId = req.auth!.companyId!;
    const rows = await prisma.productionBatch.findMany({
      where: {
        companyId,
        ...(query.status !== 'all' ? { status: query.status } : {}),
        ...(query.search
          ? {
              OR: [
                { productionNo: { contains: query.search, mode: 'insensitive' } },
                { batchNo: { contains: query.search, mode: 'insensitive' } },
                { productName: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        bmr: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    const summary = rows.reduce(
      (acc, row) => {
        acc.total += 1;
        acc[row.status] += 1;
        return acc;
      },
      {
        total: 0,
        DRAFT: 0,
        IN_PROCESS: 0,
        QA_PENDING: 0,
        RELEASED: 0,
        BLOCKED: 0,
      },
    );

    res.json({
      data: rows.map((row) => serializeProductionBatch(row as ProductionBatchRecord)),
      meta: {
        summary,
      },
    });
  } catch (error) {
    next(error);
  }
});

productionRouter.get('/:id', requirePermission('production.view'), async (req, res, next) => {
  try {
    const batch = await getProductionBatchOrThrow(req.auth!.companyId!, String(req.params.id));

    res.json({
      data: {
        ...serializeProductionBatch(batch as ProductionBatchRecord),
        mrsCount: batch._count.materialRequisitions,
        movementCount: batch._count.stockMovements,
      },
    });
  } catch (error) {
    next(error);
  }
});

productionRouter.post('/', requirePermission('production.create'), async (req, res, next) => {
  try {
    const payload = productionBatchCreateSchema.parse(req.body);
    const companyId = req.auth!.companyId!;

    const item = await prisma.item.findFirst({
      where: {
        id: payload.itemId,
        companyId,
      },
    });

    if (!item || !item.isActive || item.itemType !== ItemType.FINISHED) {
      throw new AppError(400, 'Selected item must be an active finished item');
    }

    const created = await prisma.$transaction(async (tx) => {
      const sequenceState = await tx.company.update({
        where: { id: companyId },
        data: {
          productionSequence: {
            increment: 1,
          },
        },
        select: {
          productionSequence: true,
        },
      });

      const productionSequence = sequenceState.productionSequence;
      const productionNo = formatProductionNo(productionSequence);

      return tx.productionBatch.create({
        data: {
          companyId,
          itemId: item.id,
          productionNo,
          productionSequence,
          batchNo: payload.batchNo,
          productName: item.storeName,
          batchSize: payload.batchSize,
          startDate: parseDateOnly(payload.startDate ?? payload.mfgDate),
          mfgDate: parseDateOnly(payload.mfgDate),
          expDate: parseDateOnly(payload.expDate),
          status: ProductionBatchStatus.DRAFT,
        },
        include: {
          bmr: true,
        },
      });
    });

    res.status(201).json({ data: serializeProductionBatch(created as ProductionBatchRecord) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return next(new AppError(409, 'Batch no already exists'));
    }
    next(error);
  }
});

productionRouter.get('/:id/mrs', requirePermission('production.view'), async (req, res, next) => {
  try {
    const batch = await prisma.productionBatch.findFirst({
      where: {
        id: String(req.params.id),
        companyId: req.auth!.companyId!,
      },
      select: { id: true },
    });

    if (!batch) {
      throw new AppError(404, 'Production batch not found');
    }

    const records = await prisma.materialRequisition.findMany({
      where: {
        companyId: req.auth!.companyId!,
        productionBatchId: batch.id,
      },
      include: {
        productionBatch: {
          select: {
            id: true,
            batchNo: true,
            productionNo: true,
          },
        },
        items: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    res.json({
      data: records.map((record) => serializeMaterialRequisition(record as MaterialRequisitionRecord)),
    });
  } catch (error) {
    next(error);
  }
});

productionRouter.get('/:id/bmr', requirePermission('production.view'), async (req, res, next) => {
  try {
    const batch = await prisma.productionBatch.findFirst({
      where: {
        id: String(req.params.id),
        companyId: req.auth!.companyId!,
      },
      include: {
        bmr: true,
      },
    });

    if (!batch) {
      throw new AppError(404, 'Production batch not found');
    }

    res.json({ data: serializeProductionBmr(batch.bmr) });
  } catch (error) {
    next(error);
  }
});

productionRouter.put('/:id/bmr', requirePermission('production.edit'), async (req, res, next) => {
  try {
    const payload = productionBmrSaveSchema.parse(req.body);
    const batch = await prisma.productionBatch.findFirst({
      where: {
        id: String(req.params.id),
        companyId: req.auth!.companyId!,
      },
      include: {
        bmr: true,
      },
    });

    if (!batch) {
      throw new AppError(404, 'Production batch not found');
    }

    if (batch.bmr?.status === ProductionBmrStatus.SUBMITTED || batch.status === ProductionBatchStatus.RELEASED || batch.status === ProductionBatchStatus.BLOCKED) {
      throw new AppError(400, 'Submitted or completed BMR cannot be edited');
    }

    const normalizedPayload = normalizeBmrPayload(batch, payload.data as BmrPayload);

    const saved = await prisma.productionBmr.upsert({
      where: {
        productionBatchId: batch.id,
      },
      create: {
        productionBatchId: batch.id,
        status: ProductionBmrStatus.DRAFT,
        payload: normalizedPayload as Prisma.InputJsonValue,
      },
      update: {
        status: ProductionBmrStatus.DRAFT,
        payload: normalizedPayload as Prisma.InputJsonValue,
        submittedAt: null,
      },
    });

    res.json({ data: serializeProductionBmr(saved) });
  } catch (error) {
    next(error);
  }
});

productionRouter.post('/:id/bmr/submit', requirePermission('production.edit'), async (req, res, next) => {
  try {
    const payload = productionBmrSubmitSchema.parse(req.body);
    const batch = await prisma.productionBatch.findFirst({
      where: {
        id: String(req.params.id),
        companyId: req.auth!.companyId!,
      },
      include: {
        bmr: true,
      },
    });

    if (!batch) {
      throw new AppError(404, 'Production batch not found');
    }

    if (batch.bmr?.status === ProductionBmrStatus.SUBMITTED) {
      throw new AppError(400, 'BMR is already submitted');
    }

    if (batch.status === ProductionBatchStatus.RELEASED || batch.status === ProductionBatchStatus.BLOCKED) {
      throw new AppError(400, 'Completed batch cannot be resubmitted');
    }

    const issueCount = await prisma.stockMovement.count({
      where: {
        companyId: req.auth!.companyId!,
        productionBatchId: batch.id,
        type: 'ISSUE',
      },
    });

    if (issueCount === 0) {
      throw new AppError(400, 'Record stock issue before submitting BMR');
    }

    const normalizedPayload = normalizeBmrPayload(batch, payload.data as BmrPayload);

    const submitted = await prisma.$transaction(async (tx) => {
      const bmr = await tx.productionBmr.upsert({
        where: {
          productionBatchId: batch.id,
        },
        create: {
          productionBatchId: batch.id,
          status: ProductionBmrStatus.SUBMITTED,
          payload: normalizedPayload as Prisma.InputJsonValue,
          submittedAt: new Date(),
        },
        update: {
          status: ProductionBmrStatus.SUBMITTED,
          payload: normalizedPayload as Prisma.InputJsonValue,
          submittedAt: new Date(),
        },
      });

      await tx.productionBatch.update({
        where: { id: batch.id },
        data: {
          expectedQty: toQtyDecimal(normalizedPayload.finalOutput.expectedQty),
          actualQty: toQtyDecimal(normalizedPayload.finalOutput.actualQty),
          rejectedQty: toQtyDecimal(normalizedPayload.finalOutput.rejectedQty),
          status: ProductionBatchStatus.QA_PENDING,
        },
      });

      return bmr;
    });

    res.json({ data: serializeProductionBmr(submitted) });
  } catch (error) {
    next(error);
  }
});

productionRouter.post('/:id/qa', requirePermission('production.approve'), async (req, res, next) => {
  try {
    const payload = productionQaSchema.parse(req.body);
    const companyId = req.auth!.companyId!;
    const batch = await prisma.productionBatch.findFirst({
      where: {
        id: String(req.params.id),
        companyId,
      },
      include: {
        bmr: true,
      },
    });

    if (!batch) {
      throw new AppError(404, 'Production batch not found');
    }

    if (batch.bmr?.status !== ProductionBmrStatus.SUBMITTED) {
      throw new AppError(400, 'Submit BMR before QA decision');
    }

    if (batch.status === ProductionBatchStatus.RELEASED || batch.status === ProductionBatchStatus.BLOCKED) {
      throw new AppError(400, 'QA decision is already final');
    }

    const qaDate = new Date();
    const qaDateString = formatDateOnly(qaDate);

    await prisma.$transaction(async (tx) => {
      if (payload.status === 'APPROVED') {
        const existingLedger = await tx.stockLedgerEntry.findFirst({
          where: {
            companyId,
            productionBatchId: batch.id,
            type: StockLedgerEntryType.PRODUCTION,
          },
          select: { id: true },
        });

        if (existingLedger) {
          throw new AppError(400, 'Finished goods stock has already been released');
        }

        await tx.stockLedgerEntry.create({
          data: buildLedgerEntryData({
            companyId,
            itemId: batch.itemId,
            productionBatchId: batch.id,
            date: qaDateString,
            referenceNo: batch.productionNo,
            type: 'PRODUCTION',
            particulars: 'Production Release',
            itemName: batch.productName,
            itemCategory: 'FINISHED',
            batchNo: batch.batchNo,
            mfgDate: formatDateOnly(batch.mfgDate),
            expiryDate: formatDateOnly(batch.expDate),
            receiptQty: batch.actualQty ? Number(batch.actualQty) : 0,
            issueQty: 0,
            rate: 0,
            remarks: payload.remarks,
          }),
        });
      }

      await tx.productionBatch.update({
        where: { id: batch.id },
        data: {
          qaApprovedBy: payload.approvedBy,
          qaRemarks: payload.remarks,
          qaDecidedAt: qaDate,
          status:
            payload.status === 'APPROVED'
              ? ProductionBatchStatus.RELEASED
              : payload.status === 'REJECTED'
                ? ProductionBatchStatus.BLOCKED
                : ProductionBatchStatus.QA_PENDING,
        },
      });
    });

    const updated = await getProductionBatchOrThrow(companyId, batch.id);
    res.json({
      data: {
        ...serializeProductionBatch(updated as ProductionBatchRecord),
        mrsCount: updated._count.materialRequisitions,
        movementCount: updated._count.stockMovements,
      },
    });
  } catch (error) {
    next(error);
  }
});
