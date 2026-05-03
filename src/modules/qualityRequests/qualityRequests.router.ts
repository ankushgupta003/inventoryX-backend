import {
  Prisma,
  QualityClosureDecision,
  QualityIssueType,
  QualityRequestSourceType,
  QualityRequestStatus,
  QualityTestResult,
} from '@prisma/client';
import { Router } from 'express';
import { AppError } from '../../errors/AppError';
import { prisma } from '../../lib/prisma';
import { requirePermission } from '../../middleware/permissions';
import { parseDateOnly, toQtyDecimal } from '../production/production.utils';
import {
  qualityRequestApproveSchema,
  qualityRequestCloseSchema,
  qualityRequestCreateSchema,
  qualityRequestListQuerySchema,
  qualityRequestReportSchema,
} from './qualityRequests.schemas';
import { formatQualityRequestNo, serializeQualityRequest } from './qualityRequests.utils';

export const qualityRequestsRouter = Router();

const qualityRequestInclude = {
  item: {
    select: {
      itemType: true,
    },
  },
  stockMovement: {
    select: {
      movementNo: true,
    },
  },
  productionBatch: {
    select: {
      batchNo: true,
      productionNo: true,
    },
  },
} as const;

async function findQualityRequestOrThrow(companyId: string, id: string) {
  const record = await prisma.qualityRequest.findFirst({
    where: {
      id,
      companyId,
    },
    include: qualityRequestInclude,
  });

  if (!record) {
    throw new AppError(404, 'Quality request not found');
  }

  return record;
}

qualityRequestsRouter.get('/', requirePermission('quality_requests.view'), async (req, res, next) => {
  try {
    const query = qualityRequestListQuerySchema.parse(req.query);
    const companyId = req.auth!.companyId!;
    const records = await prisma.qualityRequest.findMany({
      where: {
        companyId,
        ...(query.status !== 'all' ? { status: query.status.toUpperCase() as QualityRequestStatus } : {}),
        ...(query.sourceType !== 'all' ? { sourceType: query.sourceType.toUpperCase() as QualityRequestSourceType } : {}),
        ...(query.stockMovementId ? { stockMovementId: query.stockMovementId } : {}),
        ...(query.search
          ? {
              OR: [
                { requestNo: { contains: query.search, mode: 'insensitive' } },
                { itemName: { contains: query.search, mode: 'insensitive' } },
                { batchNo: { contains: query.search, mode: 'insensitive' } },
                { requestedBy: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: qualityRequestInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    res.json({ data: records.map(serializeQualityRequest) });
  } catch (error) {
    next(error);
  }
});

qualityRequestsRouter.get('/:id', requirePermission('quality_requests.view'), async (req, res, next) => {
  try {
    const record = await findQualityRequestOrThrow(req.auth!.companyId!, String(req.params.id));
    res.json({ data: serializeQualityRequest(record) });
  } catch (error) {
    next(error);
  }
});

qualityRequestsRouter.post('/', requirePermission('quality_requests.create'), async (req, res, next) => {
  try {
    const payload = qualityRequestCreateSchema.parse(req.body);
    const companyId = req.auth!.companyId!;

    const created = await prisma.$transaction(async (tx) => {
      const sequenceState = await tx.company.update({
        where: { id: companyId },
        data: {
          qualityRequestSequence: {
            increment: 1,
          },
        },
        select: {
          qualityRequestSequence: true,
        },
      });

      const requestSequence = sequenceState.qualityRequestSequence;
      const requestNo = payload.requestNo || formatQualityRequestNo(requestSequence);

      return tx.qualityRequest.create({
        data: {
          companyId,
          requestNo,
          requestSequence,
          date: parseDateOnly(payload.date),
          itemName: payload.itemName,
          batchNo: payload.batchNo,
          quantity: payload.quantity === undefined ? null : toQtyDecimal(payload.quantity),
          issueType: payload.issueType.toUpperCase() as QualityIssueType,
          description: payload.description,
          remarks: payload.remarks ?? null,
          requestedBy: payload.requestedBy ?? req.auth!.fullName,
          status: QualityRequestStatus.PENDING,
          attachments: [],
        },
      });
    });

    res.status(201).json({ data: serializeQualityRequest(created) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return next(new AppError(409, 'Quality request number already exists'));
    }
    next(error);
  }
});

qualityRequestsRouter.patch('/:id/approve', requirePermission('quality_requests.approve'), async (req, res, next) => {
  try {
    const payload = qualityRequestApproveSchema.parse(req.body);
    const companyId = req.auth!.companyId!;
    const record = await findQualityRequestOrThrow(companyId, String(req.params.id));

    if (record.status !== QualityRequestStatus.PENDING) {
      throw new AppError(400, 'Only pending quality requests can be approved');
    }

    const updated = await prisma.qualityRequest.update({
      where: { id: record.id },
      data: {
        status: QualityRequestStatus.APPROVED,
        approvedBy: payload.approvedBy ?? req.auth!.fullName,
        approvalRemarks: payload.approvalRemarks ?? null,
      },
      include: qualityRequestInclude,
    });

    res.json({ data: serializeQualityRequest(updated) });
  } catch (error) {
    next(error);
  }
});

qualityRequestsRouter.post('/:id/report', requirePermission('quality_requests.approve'), async (req, res, next) => {
  try {
    const payload = qualityRequestReportSchema.parse(req.body);
    const companyId = req.auth!.companyId!;
    const record = await findQualityRequestOrThrow(companyId, String(req.params.id));

    if (record.status !== QualityRequestStatus.APPROVED && record.status !== QualityRequestStatus.UNDER_TESTING) {
      throw new AppError(400, 'Only approved quality requests can receive a test report');
    }

    const updated = await prisma.qualityRequest.update({
      where: { id: record.id },
      data: {
        status: QualityRequestStatus.COMPLETED,
        testParameters: payload.testParameters,
        observations: payload.observations,
        testResult: payload.result.toUpperCase() as QualityTestResult,
        attachments: payload.attachments,
      },
      include: qualityRequestInclude,
    });

    res.json({ data: serializeQualityRequest(updated) });
  } catch (error) {
    next(error);
  }
});

qualityRequestsRouter.patch('/:id/close', requirePermission('quality_requests.approve'), async (req, res, next) => {
  try {
    const payload = qualityRequestCloseSchema.parse(req.body);
    const companyId = req.auth!.companyId!;
    const record = await findQualityRequestOrThrow(companyId, String(req.params.id));

    if (record.status !== QualityRequestStatus.COMPLETED) {
      throw new AppError(400, 'Only completed quality requests can be closed');
    }

    const updated = await prisma.qualityRequest.update({
      where: { id: record.id },
      data: {
        status: QualityRequestStatus.CLOSED,
        closureDecision: payload.decision.toUpperCase() as QualityClosureDecision,
        closureRemarks: payload.remarks ?? null,
      },
      include: qualityRequestInclude,
    });

    res.json({ data: serializeQualityRequest(updated) });
  } catch (error) {
    next(error);
  }
});
