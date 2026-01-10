
export enum LeaveType {
  ANNUAL = 'ANNUAL',
  SICK = 'SICK',
  UNPAID = 'UNPAID',
  EMERGENCY = 'EMERGENCY',
  RESET = 'RESET' // Special type for system reset
}

export interface EmployeeDocument {
  id: string;
  name: string;
  uploadDate: string;
  type: string;
  fileData?: string; // Base64 or Blob URL for mock downloads
  driveLink?: string; // Link if uploaded to Drive
}

export interface SalaryHistory {
  date: string;
  amount: number;
  reason: string;
}

export interface LeaveBalance {
  annual: number;
  sick: number;
  emergency: number;
  annualUsed: number;
  sickUsed: number;
  emergencyUsed: number;
}

export interface Employee {
  id: string;
  name: string;
  nric: string;
  position: string;
  basicSalary: number;
  joinDate: string;
  resignationDate?: string; // Track when they left
  status: 'ACTIVE' | 'RESIGNED';
  epfNumber: string;
  taxNumber: string;
  bankAccountNumber: string;
  isMalaysian: boolean;
  maritalStatus: 'SINGLE' | 'MARRIED_SPOUSE_WORKING' | 'MARRIED_SPOUSE_NOT_WORKING';
  children: number; // 0 to 10
  documents: EmployeeDocument[];
  salaryHistory: SalaryHistory[];
  leaveBalance: LeaveBalance;
}

export interface PayrollRecord {
  id: string;
  employeeId: string;
  month: number; // 1-12
  year: number;
  basicSalary: number;
  allowance: number;
  bonus: number; // Added
  overtime: number;
  otherDeductions: number; // Added
  unpaidLeaveDays: number;
  unpaidLeaveDeduction: number;
  grossSalary: number;
  epfEmployee: number;
  epfEmployer: number;
  socsoEmployee: number;
  socsoEmployer: number;
  eisEmployee: number;
  eisEmployer: number;
  pcb: number;
  netSalary: number;
  isPaid: boolean;
  workingDays: number;
}

export interface LeaveRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedBy?: string;
}

export interface ClaimRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  amount: number;
  description: string;
  status: 'APPLIED' | 'CLAIMED' | 'REJECTED';
  attachmentUrl?: string;
  attachmentName?: string;
}

export interface SystemSettings {
  companyName: string;
  registrationNumber: string;
  address: string;
  leaveApprover: string;
  supportedYears: number[];
  companyLogo?: string; // Base64 or URL for branding
  googleDriveClientId?: string; // For Drive Integration
}
