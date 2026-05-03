import { ItemType, ProductionBatchStatus, StockMovementType } from '@prisma/client';
import { Router } from 'express';
import { AppError } from '../../errors/AppError';
import { prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/permissions';
import { stockMovementCreateSchema, stockMovementListQuerySchema } from '../production/production.schemas';
import {
  buildLedgerEntryData,
  formatMovementNo,
  ledgerBatchKey,
  loadLedgerBatchSnapshots,
  parseDateOnly,
  serializeStockMovement,
  toQtyDecimal,
  type StockMovementRecord,
} from '../production/production.utils';

export const stockMovementsRouter = Router();

async function findStockMovementOrThrow(companyId: string, id: string) {
  const record = await prisma.stockMovement.findFirst({
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
      materialRequisition: {
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
      },
      items: true,
    },
  });

  if (!record) {
    throw new AppError(404, 'Stock movement not found');
  }

  return record;
}

stockMovementsRouter.get('/', requirePermission('stock_movement.view'), async (req, res, next) => {
  try {
    const query = stockMovementListQuerySchema.parse(req.query);
    const records = await prisma.stockMovement.findMany({
      where: {
        companyId: req.auth!.companyId!,
        ...(query.type !== 'all' ? { type: query.type.toUpperCase() as StockMovementType } : {}),
        ...(query.productionBatchId ? { productionBatchId: query.productionBatchId } : {}),
        ...(query.materialRequisitionId ? { materialRequisitionId: query.materialRequisitionId } : {}),
      },
      include: {
        productionBatch: {
          select: {
            id: true,
            batchNo: true,
            productionNo: true,
          },
        },
        materialRequisition: {
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
        },
        items: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    res.json({
      data: records.map((record) => serializeStockMovement(record as StockMovementRecord)),
    });
  } catch (error) {
    next(error);
  }
});

stockMovementsRouter.get('/:id', requirePermission('stock_movement.view'), async (req, res, next) => {
  try {
    const record = await findStockMovementOrThrow(req.auth!.companyId!, String(req.params.id));
    res.json({ data: serializeStockMovement(record as StockMovementRecord) });
  } catch (error) {
    next(error);
  }
});

stockMovementsRouter.post('/', requirePermission('stock_movement.create'), async (req, res, next) => {
  try {
    const payload = stockMovementCreateSchema.parse(req.body);
    const companyId = req.auth!.companyId!;

    const itemIds = Array.from(new Set(payload.items.map((item) => item.itemId)));
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
        throw new AppError(400, `Movement line ${index + 1} must reference an active raw item`);
      }
    });

    const materialRequisition = payload.materialRequisitionId
      ? await prisma.materialRequisition.findFirst({
          where: {
            id: payload.materialRequisitionId,
            companyId,
          },
          include: {
            productionBatch: true,
            items: true,
          },
        })
      : null;

    if (payload.type === 'issue') {
      if (!materialRequisition) {
        throw new AppError(400, 'Valid material requisition is required for issue movements');
      }
      if (materialRequisition.status === 'PENDING') {
        throw new AppError(400, 'Approve MRS before issuing materials');
      }
      if (
        materialRequisition.productionBatch.status === ProductionBatchStatus.QA_PENDING ||
        materialRequisition.productionBatch.status === ProductionBatchStatus.RELEASED ||
        materialRequisition.productionBatch.status === ProductionBatchStatus.BLOCKED
      ) {
        throw new AppError(400, 'Issue movements are not allowed after BMR submission');
      }
    }

    const productionBatch =
      materialRequisition?.productionBatch ??
      (payload.productionBatchId
        ? await prisma.productionBatch.findFirst({
            where: {
              id: payload.productionBatchId,
              companyId,
            },
          })
        : null);

    if (payload.productionBatchId && !productionBatch) {
      throw new AppError(400, 'Invalid production batch');
    }

    const pairTotals = new Map<string, number>();
    const requestedTotalsByItem = new Map<string, number>();

    payload.items.forEach((line) => {
      const pairKey = ledgerBatchKey(line.itemId, line.batchNo);
      pairTotals.set(pairKey, (pairTotals.get(pairKey) ?? 0) + line.quantity);
      requestedTotalsByItem.set(line.itemId, (requestedTotalsByItem.get(line.itemId) ?? 0) + line.quantity);
    });

    const stockSnapshotMap = await loadLedgerBatchSnapshots(
      prisma,
      companyId,
      payload.items.map((line) => ({
        itemId: line.itemId,
        batchNo: line.batchNo,
      })),
    );

    payload.items.forEach((line, index) => {
      const snapshot = stockSnapshotMap.get(ledgerBatchKey(line.itemId, line.batchNo));
      const requestedOnPair = pairTotals.get(ledgerBatchKey(line.itemId, line.batchNo)) ?? 0;
      if (!snapshot || snapshot.availableQty <= 0) {
        throw new AppError(400, `Movement line ${index + 1} has no available stock for the selected batch`);
      }
      if (requestedOnPair > snapshot.availableQty + 0.000001) {
        throw new AppError(400, `Movement line ${index + 1} quantity exceeds available stock`);
      }
    });

    if (payload.type === 'issue' && materialRequisition) {
      const requisitionItemMap = new Map(materialRequisition.items.map((item) => [item.itemId, item]));

      requestedTotalsByItem.forEach((totalQty, itemId) => {
        const requisitionItem = requisitionItemMap.get(itemId);
        if (!requisitionItem) {
          const itemName = itemMap.get(itemId)?.storeName ?? 'Selected item';
          throw new AppError(400, `${itemName} is not part of the selected MRS`);
        }

        const remainingQty = Number(requisitionItem.qtyRequested) - Number(requisitionItem.qtyIssued);
        if (totalQty > remainingQty + 0.000001) {
          throw new AppError(400, `${requisitionItem.itemName} quantity exceeds remaining MRS quantity`);
        }
      });
    }

    const created = await prisma.$transaction(async (tx) => {
      const sequenceState = await tx.company.update({
        where: { id: companyId },
        data: {
          stockMovementSequence: {
            increment: 1,
          },
        },
        select: {
          stockMovementSequence: true,
        },
      });

      const movementSequence = sequenceState.stockMovementSequence;
      const movementNo = formatMovementNo(movementSequence);
      const movementType = payload.type.toUpperCase() as StockMovementType;

      const movement = await tx.stockMovement.create({
        data: {
          companyId,
          productionBatchId: productionBatch?.id ?? null,
          materialRequisitionId: materialRequisition?.id ?? null,
          movementNo,
          movementSequence,
          type: movementType,
          date: parseDateOnly(payload.date),
          fromLocation: payload.fromLocation ?? null,
          toLocation: payload.toLocation ?? null,
          issuedBy: payload.issuedBy ?? req.auth!.fullName,
          sampleDrawnBy: payload.sampleDrawnBy ?? null,
          remarks: payload.remarks ?? null,
          items: {
            create: payload.items.map((line, index) => {
              const snapshot = stockSnapshotMap.get(ledgerBatchKey(line.itemId, line.batchNo))!;
              const item = itemMap.get(line.itemId)!;
              return {
                itemId: item.id,
                lineNo: index + 1,
                itemName: item.storeName,
                unit: item.baseUnit,
                batchNo: line.batchNo,
                availableQty: toQtyDecimal(snapshot.availableQty),
                quantity: toQtyDecimal(line.quantity),
                mfgDate: parseDateOnly(snapshot.mfgDate),
                expiryDate: parseDateOnly(snapshot.expiryDate),
                requestedQty: materialRequisition
                  ? toQtyDecimal(Number(materialRequisition.items.find((mrsItem) => mrsItem.itemId === item.id)?.qtyRequested ?? 0))
                  : null,
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
          materialRequisition: {
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
          },
          items: true,
        },
      });

      if (movementType === 'ISSUE' && materialRequisition) {
        for (const [itemId, totalQty] of requestedTotalsByItem.entries()) {
          const currentItem = materialRequisition.items.find((item) => item.itemId === itemId)!;
          await tx.materialRequisitionItem.update({
            where: {
              id: currentItem.id,
            },
            data: {
              qtyIssued: toQtyDecimal(Number(currentItem.qtyIssued) + totalQty),
            },
          });
        }

        const refreshedItems = await tx.materialRequisitionItem.findMany({
          where: {
            materialRequisitionId: materialRequisition.id,
          },
        });

        const isFullyIssued = refreshedItems.every((item) => Number(item.qtyIssued) >= Number(item.qtyRequested));

        await tx.materialRequisition.update({
          where: {
            id: materialRequisition.id,
          },
          data: {
            status: isFullyIssued ? 'ISSUED' : 'APPROVED',
          },
        });
      }

      if (productionBatch?.status === ProductionBatchStatus.DRAFT) {
        await tx.productionBatch.update({
          where: { id: productionBatch.id },
          data: {
            status: ProductionBatchStatus.IN_PROCESS,
          },
        });
      }

      if (movementType === 'ISSUE' || movementType === 'SAMPLING' || movementType === 'TRANSFER') {
        await tx.stockLedgerEntry.createMany({
          data: payload.items.map((line) => {
            const snapshot = stockSnapshotMap.get(ledgerBatchKey(line.itemId, line.batchNo))!;
            const item = itemMap.get(line.itemId)!;
            return buildLedgerEntryData({
              companyId,
              itemId: item.id,
              productionBatchId: productionBatch?.id,
              stockMovementId: movement.id,
              date: payload.date,
              referenceNo: movementNo,
              type: movementType,
              particulars:
                movementType === 'ISSUE'
                  ? materialRequisition?.mrsNo ?? 'Material Issue'
                  : `${payload.fromLocation ?? 'Store'} -> ${payload.toLocation ?? (movementType === 'TRANSFER' ? 'Store' : 'QC')}`,
              itemName: item.storeName,
              itemCategory: 'RAW',
              batchNo: line.batchNo,
              mfgDate: snapshot.mfgDate,
              expiryDate: snapshot.expiryDate,
              receiptQty: 0,
              issueQty: movementType === 'TRANSFER' ? 0 : line.quantity,
              rate: snapshot.rate,
              remarks: line.remarks ?? payload.remarks ?? '',
            });
          }),
        });
      }

      return movement;
    });

    const hydrated = await findStockMovementOrThrow(companyId, created.id);
    res.status(201).json({ data: serializeStockMovement(hydrated as StockMovementRecord) });
  } catch (error) {
    next(error);
  }
});
