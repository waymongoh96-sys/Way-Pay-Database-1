
export const getDaysInMonth = (month: number, year: number) => {
  return new Date(year, month, 0).getDate();
};

/**
 * Extracts age from Malaysian NRIC (YYMMDD-XX-XXXX)
 */
export const getAgeFromNRIC = (nric: string): number => {
  if (!nric || nric.length < 6) return 30; // Default fallback for calculation
  const yearPart = parseInt(nric.substring(0, 2));
  const currentYear = new Date().getFullYear();
  const currentYearShort = currentYear % 100;
  
  // Approximate birth year logic for HR age calculation
  const birthYear = yearPart <= currentYearShort ? 2000 + yearPart : 1900 + yearPart;
  return currentYear - birthYear;
};

/**
 * Calculates EPF (KWSP) contributions based on the official Third Schedule.
 * Supports Part A (< 60 years) and Part E (>= 60 years).
 */
export const getEpfValues = (salary: number, age: number) => {
  if (salary <= 0) return { er: 0, ee: 0 };

  const isSenior = age >= 60;
  let epfEmployee = 0;
  let epfEmployer = 0;

  // EPF uses a bracket system for wages up to RM 20,000
  if (salary <= 20000) {
    let upperBound: number;
    if (salary <= 10) {
      return { er: 0, ee: 0 };
    } else if (salary <= 5000) {
      // RM 20 increments for salary up to 5000
      upperBound = Math.ceil(salary / 20) * 20;
    } else {
      // RM 100 increments for salary between 5001 and 20000
      upperBound = Math.ceil(salary / 100) * 100;
    }

    if (!isSenior) {
      // Under 60 (Part A)
      // EE is 11% of upper bound, rounded up
      epfEmployee = Math.ceil(upperBound * 0.11);
      // ER is 13% (<= 5000) or 12% (> 5000) of upper bound, rounded up
      const erRate = upperBound <= 5000 ? 0.13 : 0.12;
      epfEmployer = Math.ceil(upperBound * erRate);
    } else {
      // 60 and above (Part E)
      // Employee contribution is NIL
      epfEmployee = 0;
      // Employer contribution is 4% of upper bound, rounded up
      epfEmployer = Math.ceil(upperBound * 0.04);
    }
  } else {
    // Exceeding 20,000 (Calculated on actual wages, rounded up to next Ringgit)
    if (!isSenior) {
      epfEmployee = Math.ceil(salary * 0.11);
      epfEmployer = Math.ceil(salary * 0.12);
    } else {
      epfEmployee = 0;
      epfEmployer = Math.ceil(salary * 0.04);
    }
  }

  return {
    ee: epfEmployee,
    er: epfEmployer
  };
};

/**
 * Calculates SOCSO (PERKESO) Jenis Pertama contributions based on official table.
 */
export const getSocsoValues = (salary: number) => {
  if (salary <= 0) return { er: 0, ee: 0 };
  
  const s = Math.min(salary, 5000);

  if (s <= 30) return { er: 0.40, ee: 0.10 };
  if (s <= 50) return { er: 0.70, ee: 0.20 };
  if (s <= 70) return { er: 1.10, ee: 0.30 };
  if (s <= 100) return { er: 1.50, ee: 0.40 };
  if (s <= 140) return { er: 2.10, ee: 0.60 };
  if (s <= 200) return { er: 2.95, ee: 0.85 };
  if (s <= 300) return { er: 4.35, ee: 1.25 };
  
  let currentER = 4.35; 
  let currentEE = 1.25; 
  let bracketStart = 300;
  
  while (bracketStart < s && bracketStart < 5000) {
    currentEE += 0.50;
    const increment = (bracketStart / 100) % 2 === 1 ? 1.80 : 1.70;
    currentER += increment;
    bracketStart += 100;
  }
  
  return {
    er: parseFloat(currentER.toFixed(2)),
    ee: parseFloat(currentEE.toFixed(2))
  };
};

/**
 * Calculates EIS (SIP) contributions based on official table.
 */
export const getEisValue = (salary: number) => {
  if (salary <= 0) return 0;
  
  const s = Math.min(salary, 4000);
  if (s <= 10) return 0;
  if (s <= 1000) return 1.90;

  const bracketsAbove1000 = Math.ceil((s - 1000) / 100);
  const contribution = 1.90 + (bracketsAbove1000 * 0.20);
  
  return parseFloat(contribution.toFixed(2));
};

/**
 * Standard Statutory Calculation for Malaysia (EPF, SOCSO, EIS).
 */
export const calculateStatutory = (
  actualBasic: number, 
  allowance: number = 0,
  bonus: number = 0,
  overtime: number = 0,
  unpaidLeaveDays: number = 0,
  otherDeductions: number = 0,
  manualPcb: number = 0,
  daysInMonth: number = 30,
  nric: string = ""
) => {
  const unpaidLeaveDeduction = unpaidLeaveDays > 0 ? (actualBasic / daysInMonth) * unpaidLeaveDays : 0;
  const grossSalary = actualBasic + allowance + bonus + overtime - unpaidLeaveDeduction;
  
  const age = getAgeFromNRIC(nric);

  // 1. EPF Calculation using official Third Schedule logic
  const epfData = getEpfValues(grossSalary, age);
  const epfEmployee = epfData.ee;
  const epfEmployer = epfData.er;

  // 2. SOCSO Calculation (ceiling RM5000)
  const socsoData = getSocsoValues(grossSalary);
  const socsoEmployee = socsoData.ee;
  const socsoEmployer = socsoData.er;

  // 3. EIS (SIP) Calculation (ceiling RM4000)
  const eisValue = getEisValue(grossSalary);
  const eisEmployee = eisValue;
  const eisEmployer = eisValue;

  // 4. PCB is manual
  const pcb = manualPcb;
  
  const netSalary = parseFloat((grossSalary - epfEmployee - socsoEmployee - eisEmployee - otherDeductions - pcb).toFixed(2));

  return {
    grossSalary: parseFloat(grossSalary.toFixed(2)),
    unpaidLeaveDeduction: parseFloat(unpaidLeaveDeduction.toFixed(2)),
    epfEmployee,
    epfEmployer,
    socsoEmployee,
    socsoEmployer,
    eisEmployee,
    eisEmployer,
    pcb,
    netSalary
  };
};

export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(value);
};
