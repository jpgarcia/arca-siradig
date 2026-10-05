import type { ReceiptType } from "../types.js";

export const RECEIPT_TYPES: ReceiptType[] = [
  { id: "6", name: "Factura B" },
  { id: "7", name: "Nota de Débito B" },
  { id: "8", name: "Nota de Crédito B" },
  { id: "9", name: "Recibo B" },
  { id: "10", name: "Nota de Venta al contado B" },
  { id: "11", name: "Factura C" },
  { id: "12", name: "Nota de Débito C" },
  { id: "13", name: "Nota de Crédito C" },
  { id: "14", name: "Documento Aduanero" },
  { id: "15", name: "Recibo C" },
  { id: "16", name: "Nota de Venta al contado C" },
  { id: "40", name: "Otro comprobante B (RG 1415)" },
  { id: "41", name: "Otro comprobante C (RG 1415)" },
  { id: "82", name: "Tique-factura B" },
  { id: "88", name: "Otros comp. doc. exceptuados" },
];

export function listReceiptTypes(): ReceiptType[] {
  return RECEIPT_TYPES.map((receiptType) => ({ ...receiptType }));
}

export function resolveReceiptTypeId(label: string): string | null {
  const normalizedLabel = normalizeReceiptTypeLabel(label);

  for (const receiptType of RECEIPT_TYPES) {
    if (normalizeReceiptTypeLabel(receiptType.name) === normalizedLabel) {
      return receiptType.id;
    }
  }

  return RECEIPT_TYPE_LABEL_ALIASES[normalizedLabel] ?? null;
}

const RECEIPT_TYPE_LABEL_ALIASES: Record<string, string> = {
  [normalizeReceiptTypeLabel("Otros comprobantes documentos exceptuados")]: "88",
};

function normalizeReceiptTypeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
