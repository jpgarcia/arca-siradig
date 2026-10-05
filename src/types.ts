export type ArcaCredentials = {
  cuit: string;
  password: string;
};

export type ArcaSession = {
  close: () => Promise<void>;
};

export type Person = {
  id: string | null;
  name: string;
};

export type SelectedPerson = Person;

export type MenuItem = {
  label: string;
  enabled: boolean;
};

export type ReminderModalInfo = {
  title: string;
  description: string;
};

export type DataField = {
  label: string;
  value: string;
};

export type DataGroup = {
  title: string;
  fields: DataField[];
};

export type PersonalDataField = DataField;

export type PersonalDataGroup = DataGroup;

export type EmployeeSummary = {
  id: string;
  cuit: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  withholdingAgent: string | null;
};

export type StructuredPersonalData = {
  lastName?: string;
  firstName?: string;
  street?: string;
  streetNumber?: string;
  province?: string;
  zipCode?: string;
};

export type StructuredEmployeeData = {
  cuit?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  retentionAgent?: boolean;
};

export type ReceiptType = {
  id: string;
  name: string;
};

export type DeductionSummary = {
  type: string;
  id: string;
  cuit: string;
  name: string;
  period: string;
  amount: string;
};

export type DeductionMonthlyDetail = {
  month: number;
  monthlyAmount: string;
  receiptsTotalAmount: string;
};

export type DeductionReceipt = {
  month: number;
  date: string;
  typeId: string;
  type: string;
  id: string;
  amount: string;
};

export type StructuredDeductionReceipt = {
  month: number;
  date: string;
  type: string;
  id: string;
  amount: string;
};

export type DeductionDetailView = {
  heading: string;
  cuit: string;
  name: string;
  fromMonth: number;
  fromMonthLabel: string;
  toMonth: number;
  toMonthLabel: string;
  amount: string;
  monthlyDetail: DeductionMonthlyDetail[];
  receipts: DeductionReceipt[];
};

export type StructuredDeductionDetail = {
  cuit: string;
  name: string;
  fromMonth: number;
  toMonth: number;
  amount: string;
  monthlyDetail: DeductionMonthlyDetail[];
  receipts: StructuredDeductionReceipt[];
};
