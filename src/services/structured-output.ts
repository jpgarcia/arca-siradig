import type {
  DataGroup,
  DeductionDetailView,
  StructuredDeductionDetail,
  StructuredDeductionReceipt,
  StructuredEmployeeData,
  StructuredPersonalData,
} from "../types.js";

const personalDataFieldMap: Record<string, keyof StructuredPersonalData> = {
  Apellido: "lastName",
  Nombre: "firstName",
  Calle: "street",
  "Nro.": "streetNumber",
  Provincia: "province",
  "Código Postal": "zipCode",
};

const employeeDataFieldMap: Record<string, keyof StructuredEmployeeData> = {
  "CUIT del Empleador": "cuit",
  "Razón Social o Apellido y Nombre": "name",
  "Fecha de Inicio de Relación": "startDate",
  "Fecha de Fin de Relación": "endDate",
  "¿Es su agente de retención?": "retentionAgent",
};

export function toStructuredPersonalData(groups: DataGroup[]): StructuredPersonalData[] {
  const record: StructuredPersonalData = {};

  for (const group of groups) {
    for (const field of group.fields) {
      const key = personalDataFieldMap[field.label];
      if (!key || !field.value) {
        continue;
      }

      record[key] = field.value;
    }
  }

  return Object.keys(record).length > 0 ? [record] : [];
}

export function toStructuredEmployeeData(groups: DataGroup[]): StructuredEmployeeData[] {
  const record: StructuredEmployeeData = {};

  for (const group of groups) {
    for (const field of group.fields) {
      const key = employeeDataFieldMap[field.label];
      if (!key || !field.value) {
        continue;
      }

      if (key === "startDate" || key === "endDate") {
        const normalizedDate = normalizeArcaDate(field.value);
        if (normalizedDate) {
          record[key] = normalizedDate;
        }
        continue;
      }

      if (key === "retentionAgent") {
        const retentionAgent = normalizeRetentionAgent(field.value);
        if (retentionAgent !== null) {
          record.retentionAgent = retentionAgent;
        }
        continue;
      }

      record[key] = field.value;
    }
  }

  return Object.keys(record).length > 0 ? [record] : [];
}

export function toStructuredDeductionDetail(
  detail: DeductionDetailView,
): StructuredDeductionDetail {
  return {
    cuit: detail.cuit,
    name: detail.name,
    fromMonth: detail.fromMonth,
    toMonth: detail.toMonth,
    amount: detail.amount,
    monthlyDetail: detail.monthlyDetail,
    receipts: detail.receipts.map(toStructuredDeductionReceipt),
  };
}

function toStructuredDeductionReceipt(
  receipt: DeductionDetailView["receipts"][number],
): StructuredDeductionReceipt {
  return {
    month: receipt.month,
    date: receipt.date,
    type: receipt.typeId,
    id: receipt.id,
    amount: receipt.amount,
  };
}

function normalizeArcaDate(value: string): string | null {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function normalizeRetentionAgent(value: string): boolean | null {
  if (value === "Sí" || value === "Si") {
    return true;
  }

  if (value === "No") {
    return false;
  }

  return null;
}
