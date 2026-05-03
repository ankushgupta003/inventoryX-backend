import { ItemType, ProductionBatchStatus } from '@prisma/client';
import { Router } from 'express';
import { AppError } from '../../errors/AppError';
import { prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/permissions';
import {
  materialRequisitionApproveSchema,
  materialRequisitionCreateSchema,
} from '../production/production.schemas';
import {
  formatMrsNo,
  parseDateOnly,
  serializeMaterialRequisition,
  toQtyDecimal,
  type MaterialRequisitionRecord,
} from '../production/production.utils';

export const mrsRouter = Router();

async function findMaterialRequisitionOrThrow(companyId: string, id: string) {
  const record = await prisma.materialRequisition.findFirst({
    where: {
      id,
      companyId,
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
  });

  if (!record) {
    throw new AppError(404, 'Material requisition not found');
  }

  return record;
}

mrsRouter.get('/', requirePermission('mrs.view'), async (req, res, next) => {
  try {
    const records = await prisma.materialRequisition.findMany({
      where: {
        companyId: req.auth!.companyId!,
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

mrsRouter.get('/:id', requirePermission('mrs.view'), async (req, res, next) => {
  try {
    const record = await findMaterialRequisitionOrThrow(req.auth!.companyId!, String(req.params.id));
    res.json({ data: serializeMaterialRequisition(record as MaterialRequisitionRecord) });
  } catch (error) {
    next(error);
  }
});

mrsRouter.post('/', requirePermission('mrs.create'), async (req, res, next) => {
  try {
    const payload = materialRequisitionCreateSchema.parse(req.body);
    const companyId = req.auth!.companyId!;

    const batch = await prisma.productionBatch.findFirst({
      where: {
        id: payload.productionBatchId,
        companyId,
      },
    });

    if (!batch) {
      throw new AppError(400, 'Invalid production batch');
    }

    if (
      batch.status === ProductionBatchStatus.QA_PENDING ||
      batch.status === ProductionBatchStatus.RELEASED ||
      batch.status === ProductionBatchStatus.BLOCKED
    ) {
      throw new AppError(400, 'MRS can only be created before BMR submission');
    }

    const itemIds = payload.items.map((item) => item.itemId);
    const items = await prisma.item.findMany({
      where: {
        id: { in: itemIds },
        companyId,
      },
    });
    const itemMap = new Map(items.map((item) => [item.id, item]));

    payload.items.forEach((line, index) => {
      const item = itemMap.get(line.itemId);
      if (!item || !item.isActive || item.itemType !== ItemType.RAW) {
        throw new AppError(400, `MRS line ${index + 1} must reference an active raw item`);
      }
    });

    const created = await prisma.$transaction(async (tx) => {
      const sequenceState = await tx.company.update({
        where: { id: companyId },
        data: {
          mrsSequence: {
            increment: 1,
          },
        },
        select: {
          mrsSequence: true,
        },
      });

      const mrsSequence = sequenceState.mrsSequence;
      const mrsNo = formatMrsNo(mrsSequence);

      const record = await tx.materialRequisition.create({
        data: {
          companyId,
          productionBatchId: batch.id,
          mrsNo,
          mrsSequence,
          date: parseDateOnly(payload.date),
          department: payload.department,
          requisitionBy: payload.requisitionBy,
          status: 'PENDING',
          items: {
            create: payload.items.map((line, index) => {
              const item = itemMap.get(line.itemId)!;
              return {
                itemId: item.id,
                lineNo: index + 1,
                itemName: item.storeName,
                unit: item.baseUnit,
                qtyRequested: toQtyDecimal(line.qtyRequested),
                qtyIssued: toQtyDecimal(0),
                remarks: line.remarks ?? null,
              };
            }),
          },
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
      });

      if (batch.status === ProductionBatchStatus.DRAFT) {
        await tx.productionBatch.update({
          where: { id: batch.id },
          data: {
            status: ProductionBatchStatus.IN_PROCESS,
          },
        });
      }

      return record;
    });

    res.status(201).json({ data: serializeMaterialRequisition(created as MaterialRequisitionRecord) });
  } catch (error) {
    next(error);
  }
});

mrsRouter.post('/:id/approve', requirePermission('mrs.approve'), async (req, res, next) => {
  try {
    const payload = materialRequisitionApproveSchema.parse(req.body ?? {});
    const record = await findMaterialRequisitionOrThrow(req.auth!.companyId!, String(req.params.id));

    if (record.status !== 'PENDING') {
      throw new AppError(400, 'Only pending MRS can be approved');
    }

    const updated = await prisma.materialRequisition.update({
      where: { id: record.id },
      data: {
        approvedBy: payload.approvedBy ?? req.auth!.fullName,
        approvedAt: new Date(),
        status: 'APPROVED',
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
    });

    res.json({ data: serializeMaterialRequisition(updated as MaterialRequisitionRecord) });
  } catch (error) {
    next(error);
  }
});
