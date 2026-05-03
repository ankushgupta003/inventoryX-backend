import { z } from 'zod';
import { optionalTrimmedString, requiredTrimmedString } from '../shared/masterData';

const dateStringSchema = z
  .string({ required_error: 'Required' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date');

const quantitySchema = z.coerce.number().min(0, 'Cannot be negative');

const rawMaterialSchema = z
  .object({
    id: z.string().trim().min(1, 'Row id is required'),
    materialName: requiredTrimmedString(200, 'Material name is required'),
    requiredQty: quantitySchema,
    issuedQty: quantitySchema,
    usedQty: quantitySchema,
    returnedQty: quantitySchema,
  })
  .superRefine((value, ctx) => {
    const delta = Math.abs((value.usedQty + value.returnedQty) - value.issuedQty);
    if (delta > 0.000001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['usedQty'],
        message: 'Used + Returned must equal Issued qty',
      });
    }
  });

const processStepSchema = z.object({
  id: z.string().trim().min(1, 'Row id is required'),
  stepName: requiredTrimmedString(200, 'Process step is required'),
  startTime: requiredTrimmedString(20, 'Start time is required'),
  endTime: requiredTrimmedString(20, 'End time is required'),
  operatorName: requiredTrimmedString(120, 'Operator name is required'),
  checkedBy: requiredTrimmedString(120, 'Checked by is required'),
  remarks: requiredTrimmedString(500, 'Remarks are required'),
});

export const productionBatchCreateSchema = z
  .object({
    itemId: z.string().trim().min(1, 'Finished item is required'),
    batchNo: requiredTrimmedString(120, 'Batch no is required'),
    batchSize: requiredTrimmedString(120, 'Batch size is required'),
    startDate: dateStringSchema.optional(),
    mfgDate: dateStringSchema,
    expDate: dateStringSchema,
  })
  .superRefine((value, ctx) => {
    if (value.expDate < value.mfgDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expDate'],
        message: 'EXP date cannot be before MFG date',
      });
    }

    if (value.startDate && value.startDate > value.mfgDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['startDate'],
        message: 'Start date cannot be after MFG date',
      });
    }
  });

export const productionQaSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
  remarks: requiredTrimmedString(1000, 'QA remarks are required'),
  approvedBy: requiredTrimmedString(120, 'Approved by is required'),
});

export const productionBmrSchema = z.object({
  batchInfo: z.object({
    productName: requiredTrimmedString(200, 'Product name is required'),
    batchNo: requiredTrimmedString(120, 'Batch no is required'),
    batchSize: requiredTrimmedString(120, 'Batch size is required'),
    mfgDate: dateStringSchema,
    expDate: dateStringSchema,
  }),
  rawMaterials: z.array(rawMaterialSchema).min(1, 'At least one raw material row is required'),
  processSteps: z.array(processStepSchema).min(1, 'At least one process step is required'),
  sterilization: z.object({
    date: dateStringSchema,
    quantity: quantitySchema,
    reference: requiredTrimmedString(120, 'Reference is required'),
  }),
  packing: z.object({
    packingType: requiredTrimmedString(120, 'Packing type is required'),
    quantity: quantitySchema,
    doneBy: requiredTrimmedString(120, 'Done by is required'),
  }),
  labelling: z.object({
    labelDetails: requiredTrimmedString(500, 'Label details are required'),
    checkedBy: requiredTrimmedString(120, 'Checked by is required'),
  }),
  finalOutput: z
    .object({
      expectedQty: z.coerce.number().min(1, 'Expected qty is required'),
      actualQty: quantitySchema,
      rejectedQty: quantitySchema,
    })
    .superRefine((value, ctx) => {
      const delta = Math.abs((value.actualQty + value.rejectedQty) - value.expectedQty);
      if (delta > 0.000001) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['actualQty'],
          message: 'Actual + Rejected must equal Expected qty',
        });
      }
    }),
  qa: productionQaSchema,
});

export const productionListQuerySchema = z.object({
  search: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().max(150).default('')),
  status: z.enum(['all', 'DRAFT', 'IN_PROCESS', 'QA_PENDING', 'RELEASED', 'BLOCKED']).default('all'),
});

export const productionBmrSaveSchema = z.object({
  data: productionBmrSchema,
});

export const productionBmrSubmitSchema = z.object({
  data: productionBmrSchema,
});

export const materialRequisitionCreateSchema = z
  .object({
    productionBatchId: z.string().trim().min(1, 'Production batch is required'),
    date: dateStringSchema,
    department: requiredTrimmedString(120, 'Department is required'),
    requisitionBy: requiredTrimmedString(120, 'Requisition by is required'),
    items: z
      .array(
        z.object({
          itemId: z.string().trim().min(1, 'Item is required'),
          qtyRequested: z.coerce.number().min(0.001, 'Qty requested is required'),
          remarks: optionalTrimmedString(500),
        }),
      )
      .min(1, 'At least one item is required'),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.items.forEach((item, index) => {
      if (seen.has(item.itemId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'itemId'],
          message: 'Duplicate items are not allowed in one MRS',
        });
      }
      seen.add(item.itemId);
    });
  });

export const materialRequisitionApproveSchema = z.object({
  approvedBy: optionalTrimmedString(120),
});

export const stockMovementListQuerySchema = z.object({
  type: z.enum(['all', 'issue', 'sampling', 'transfer']).default('all'),
  productionBatchId: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.string().max(100).default(''),
  ),
  materialRequisitionId: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.string().max(100).default(''),
  ),
});

export const stockMovementCreateSchema = z
  .object({
    type: z.enum(['issue', 'sampling', 'transfer']),
    productionBatchId: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() : value),
      z.string().max(100).default(''),
    ),
    materialRequisitionId: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() : value),
      z.string().max(100).default(''),
    ),
    date: dateStringSchema,
    fromLocation: optionalTrimmedString(120),
    toLocation: optionalTrimmedString(120),
    issuedBy: optionalTrimmedString(120),
    sampleDrawnBy: optionalTrimmedString(120),
    remarks: optionalTrimmedString(1000),
    items: z
      .array(
        z.object({
          itemId: z.string().trim().min(1, 'Item is required'),
          batchNo: requiredTrimmedString(120, 'Batch is required'),
          quantity: z.coerce.number().min(0.001, 'Quantity is required'),
          remarks: optionalTrimmedString(500),
        }),
      )
      .min(1, 'At least one movement row is required'),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'issue' && !value.materialRequisitionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['materialRequisitionId'],
        message: 'Material requisition is required for issue movements',
      });
    }

    if ((value.type === 'sampling' || value.type === 'transfer') && (!value.fromLocation || !value.toLocation)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fromLocation'],
        message: 'From and To locations are required',
      });
    }
  });

export type ProductionBatchCreateInput = z.infer<typeof productionBatchCreateSchema>;
export type ProductionQaInput = z.infer<typeof productionQaSchema>;
export type ProductionBmrInput = z.infer<typeof productionBmrSchema>;
export type ProductionListQuery = z.infer<typeof productionListQuerySchema>;
export type MaterialRequisitionCreateInput = z.infer<typeof materialRequisitionCreateSchema>;
export type StockMovementCreateInput = z.infer<typeof stockMovementCreateSchema>;
export type StockMovementListQuery = z.infer<typeof stockMovementListQuerySchema>;
