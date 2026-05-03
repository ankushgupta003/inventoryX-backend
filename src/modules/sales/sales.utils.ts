import {
  InvoiceStatus,
  ProformaInvoiceStatus,
  type Invoice,
  type InvoiceItem,
  type Party,
  type ProformaInvoice,
  type ProformaInvoiceItem,
  type Prisma,
} from '@prisma/client';
import { formatDateOnly } from '../production/production.utils';
import { decimalToNumber, toNullableString } from '../shared/masterData';

type QtyValue = Prisma.Decimal | number | string;

type ProformaInvoiceRecord = ProformaInvoice & {
  items: ProformaInvoiceItem[];
};

type InvoiceRecord = Invoice & {
  items: InvoiceItem[];
  proformaInvoice?: Pick<ProformaInvoice, 'id' | 'piNo'> | null;
};

export function formatProformaInvoiceNo(sequence: number) {
  return `PI-${String(sequence).padStart(5, '0')}`;
}

export function formatInvoiceNo(sequence: number) {
  return `INV-${String(sequence).padStart(5, '0')}`;
}

export function buildCustomerSnapshot(customer: Party) {
  return {
    customerId: customer.id,
    customerName: customer.name,
    customerContactPerson: toNullableString(customer.contactPerson ?? undefined),
    customerPhone: toNullableString(customer.phone ?? undefined),
    customerEmail: toNullableString(customer.email ?? undefined),
    customerAddress1: toNullableString(customer.address1 ?? undefined),
    customerAddress2: toNullableString(customer.address2 ?? undefined),
    customerCity: toNullableString(customer.city ?? undefined),
    customerState: toNullableString(customer.state ?? undefined),
    customerPincode: toNullableString(customer.pincode ?? undefined),
    customerGstNumber: toNullableString(customer.gstNumber ?? undefined),
    customerPanNumber: toNullableString(customer.panNumber ?? undefined),
  };
}

function compact(values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim() ?? '').filter(Boolean);
}

export function formatCustomerAddress(input: {
  customerAddress1?: string | null;
  customerAddress2?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
  customerPincode?: string | null;
}) {
  const addressLine = compact([input.customerAddress1, input.customerAddress2]).join(', ');
  const locationLine = compact([input.customerCity, input.customerState, input.customerPincode]).join(', ');

  return compact([addressLine, locationLine]).join('\n');
}

export function toRemainingQty(quantity: QtyValue, invoicedQty: QtyValue) {
  const remaining = Math.max(0, decimalToNumber(quantity) - decimalToNumber(invoicedQty));
  return Number(remaining.toFixed(3));
}

export function hasInvoicingStarted(items: Array<{ invoicedQty: QtyValue }>) {
  return items.some((item) => decimalToNumber(item.invoicedQty) > 0);
}

export function computeProformaInvoiceStatus(
  items: Array<{ quantity: QtyValue; invoicedQty: QtyValue }>,
  currentStatus?: ProformaInvoiceStatus,
) {
  if (currentStatus === ProformaInvoiceStatus.CLOSED) {
    return ProformaInvoiceStatus.CLOSED;
  }

  const metrics = items.map((item) => ({
    invoicedQty: decimalToNumber(item.invoicedQty),
    remainingQty: toRemainingQty(item.quantity, item.invoicedQty),
  }));

  if (metrics.every((item) => item.invoicedQty <= 0)) {
    return ProformaInvoiceStatus.PENDING;
  }

  if (metrics.every((item) => item.remainingQty <= 0)) {
    return ProformaInvoiceStatus.COMPLETED;
  }

  return ProformaInvoiceStatus.PARTIAL;
}

export function serializeProformaInvoiceStatus(status: ProformaInvoiceStatus) {
  return status.toLowerCase();
}

export function serializeInvoiceStatus(status: InvoiceStatus) {
  return status.toLowerCase();
}

function serializeProformaInvoiceItem(item: ProformaInvoiceItem) {
  const quantity = decimalToNumber(item.quantity);
  const invoicedQty = decimalToNumber(item.invoicedQty);

  return {
    id: item.id,
    itemId: item.itemId,
    itemName: item.itemName,
    unit: item.unit,
    quantity,
    invoicedQty,
    remainingQty: toRemainingQty(item.quantity, item.invoicedQty),
    rate: decimalToNumber(item.rate),
    amount: decimalToNumber(item.amount),
    remarks: item.remarks ?? '',
  };
}

export function serializeProformaInvoice(record: ProformaInvoiceRecord) {
  const items = record.items
    .slice()
    .sort((a, b) => a.lineNo - b.lineNo)
    .map(serializeProformaInvoiceItem);

  return {
    id: record.id,
    piNo: record.piNo,
    date: formatDateOnly(record.date),
    customerId: record.customerId,
    customerName: record.customerName,
    customerContactPerson: record.customerContactPerson ?? '',
    customerPhone: record.customerPhone ?? '',
    customerEmail: record.customerEmail ?? '',
    customerGstNumber: record.customerGstNumber ?? '',
    customerPanNumber: record.customerPanNumber ?? '',
    customerAddress: formatCustomerAddress(record),
    items,
    totalQuantity: decimalToNumber(record.totalQuantity),
    totalAmount: decimalToNumber(record.totalAmount),
    status: serializeProformaInvoiceStatus(record.status),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializeInvoiceItem(item: InvoiceItem) {
  return {
    id: item.id,
    proformaInvoiceItemId: item.proformaInvoiceItemId,
    itemId: item.itemId,
    itemName: item.itemName,
    unit: item.unit,
    batchNo: item.batchNo,
    quantity: decimalToNumber(item.quantity),
    rate: decimalToNumber(item.rate),
    taxPercent: decimalToNumber(item.taxPercent),
    amount: decimalToNumber(item.amount),
  };
}

export function serializeInvoice(record: InvoiceRecord) {
  const items = record.items
    .slice()
    .sort((a, b) => a.lineNo - b.lineNo)
    .map(serializeInvoiceItem);

  return {
    id: record.id,
    invoiceNo: record.invoiceNo,
    date: formatDateOnly(record.date),
    customerId: record.customerId,
    customerName: record.customerName,
    customerContactPerson: record.customerContactPerson ?? '',
    customerPhone: record.customerPhone ?? '',
    customerEmail: record.customerEmail ?? '',
    customerGstNumber: record.customerGstNumber ?? '',
    customerPanNumber: record.customerPanNumber ?? '',
    customerAddress: formatCustomerAddress(record),
    piId: record.proformaInvoiceId,
    piNo: record.proformaInvoice?.piNo ?? '',
    items,
    totalQuantity: decimalToNumber(record.totalQuantity),
    totalAmount: decimalToNumber(record.totalAmount),
    taxAmount: decimalToNumber(record.taxAmount),
    grandTotal: Number((decimalToNumber(record.totalAmount) + decimalToNumber(record.taxAmount)).toFixed(2)),
    status: serializeInvoiceStatus(record.status),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
