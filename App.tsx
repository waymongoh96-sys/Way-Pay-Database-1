
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Users, CreditCard, Calendar, FileText, LayoutDashboard, Plus, MessageSquare, AlertCircle, Menu, X, TrendingUp, Clock, Printer, Download, Info, Edit, Upload, CheckCircle, DollarSign, Settings as SettingsIcon, ArrowUpRight, History, Check, RefreshCw, FileUp, Trash, Filter, ReceiptText, Ban, Activity, PieChart, ImageIcon, LogOut, Lock, User, ChevronRight, ShieldCheck, Briefcase, RotateCcw, Search, CalendarClock, DownloadCloud, UploadCloud, File, Save, Eye, HardDrive, Link as LinkIcon, Image as ImageIconLucide, AlertTriangle
} from 'lucide-react';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  doc, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  orderBy,
  Timestamp
} from 'firebase/firestore';

import { Employee, LeaveRecord, PayrollRecord, LeaveType, EmployeeDocument, SystemSettings, ClaimRecord } from './types';
import { calculateStatutory, formatCurrency, getDaysInMonth } from './payrollUtils';
import { askHRAssistant } from './geminiService';
import { initDriveApi, authenticateDrive, uploadToDrive, isDriveConnected } from './googleDriveService';

// Firebase Configuration Placeholder
// REPLACE THIS WITH YOUR REAL KEYS FROM FIREBASE CONSOLE
const firebaseConfig = {
  apiKey: "AIzaSyCK4f5NiYZ4WAcErl1-Ts4J-Pit1abl748",
  authDomain: "hr-system-46e00.firebaseapp.com",
  projectId: "hr-system-46e00",
  storageBucket: "hr-system-46e00.firebasestorage.app",
  messagingSenderId: "868038807384",
  appId: "1:868038807384:web:6ece4c7400c7f7f72e5f2d",
  measurementId: "G-M74HXBGK63"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const STORAGE_KEYS = {
  AUTH: 'waypay_current_user'
};

const INITIAL_SETTINGS: SystemSettings = {
  companyName: 'Way-Pay HR',
  registrationNumber: '202401012345 (1234567-T)',
  address: 'No. 12, Jalan Education 1, 47100 Puchong, Selangor',
  leaveApprover: 'Management Board',
  supportedYears: [2023, 2024, 2025]
};

// Robust State Loader for Auth only
const loadState = <T,>(key: string, fallback: T): T => {
  try {
    const saved = localStorage.getItem(key);
    if (!saved || saved === "undefined" || saved === "null") return fallback;
    return JSON.parse(saved);
  } catch (e) {
    return fallback;
  }
};

type UserRole = 'SUPER_ADMIN' | 'TEACHER';
type StaffFilter = 'ALL' | 'ACTIVE' | 'RESIGNED';

interface CurrentUser {
  id: string;
  name: string;
  role: UserRole;
}

const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Helper to add ordinal suffix to numbers (1st, 2nd, 3rd, etc.)
 */
const getOrdinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const NavItem = ({ active, onClick, icon, label, collapsed }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, collapsed: boolean }) => (
  <button type="button" onClick={onClick} className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all duration-300 group ${active ? 'bg-indigo-600 shadow-lg shadow-indigo-900/20' : 'hover:bg-slate-900 dark:hover:bg-slate-800'}`}>
    <div className={`transition-colors ${active ? 'text-white' : 'text-slate-500 group-hover:text-indigo-400'}`}>{icon}</div>
    {!collapsed && <span className={`font-black tracking-wide text-sm ${active ? 'text-white' : 'text-slate-400 group-hover:text-white'}`}>{label}</span>}
  </button>
);

const StatCard = ({ title, value, subValue, icon, color }: { title: string, value: string, subValue?: string, icon: React.ReactNode, color: string }) => (
  <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-[24px] md:rounded-[32px] border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow h-full flex flex-col justify-between">
    <div>
        <div className={`h-10 w-10 md:h-12 md:w-12 rounded-2xl ${color} flex items-center justify-center mb-3 md:mb-4`}>
            <div className="scale-75 md:scale-90">{icon}</div>
        </div>
        <p className="text-[9px] md:text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 md:mb-2 truncate">{title}</p>
        <h4 className="text-base md:text-2xl font-black text-slate-800 dark:text-white tracking-tight break-words">{value}</h4>
    </div>
    {subValue && <p className="text-[8px] md:text-xs font-bold text-slate-400 dark:text-slate-50 mt-1 md:mt-2 truncate">{subValue}</p>}
  </div>
);

const BalanceBar = ({ label, current, total, color }: { label: string, current: number, total: number, color: string }) => (
  <div>
    <div className="flex justify-between mb-2">
      <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-50 tracking-widest">{label}</span>
      <span className="text-[10px] font-black text-slate-600 dark:text-slate-300">{current} / {total} Days</span>
    </div>
    <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min((current / total) * 100, 100)}%` }}></div>
    </div>
  </div>
);

export default function App() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => loadState(STORAGE_KEYS.AUTH, null));

  const [activeTab, setActiveTab] = useState<'dashboard' | 'employees' | 'payroll' | 'leaves' | 'claims' | 'ai' | 'settings'>('dashboard');
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [settings, setSettings] = useState<SystemSettings>(INITIAL_SETTINGS);

  // Firestore Listeners
  useEffect(() => {
    // Listen for Employees
    const unsubscribeEmployees = onSnapshot(collection(db, "employees"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));
      setEmployees(data);
    });

    // Listen for Requests (Leaves and Claims)
    const unsubscribeRequests = onSnapshot(query(collection(db, "requests"), orderBy("date", "desc")), (snapshot) => {
      const allRequests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const leaveData = allRequests.filter(r => r.category === 'leave') as unknown as LeaveRecord[];
      const claimData = allRequests.filter(r => r.category === 'claim') as unknown as ClaimRecord[];
      setLeaves(leaveData);
      setClaims(claimData);
    });

    // Listen for Payroll
    const unsubscribePayroll = onSnapshot(collection(db, "payroll"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PayrollRecord));
      setPayrollRecords(data);
    });

    // Listen for Settings
    const unsubscribeSettings = onSnapshot(doc(db, "system", "settings"), (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data() as SystemSettings);
      } else {
        setDoc(doc(db, "system", "settings"), INITIAL_SETTINGS);
      }
    });

    return () => {
      unsubscribeEmployees();
      unsubscribeRequests();
      unsubscribePayroll();
      unsubscribeSettings();
    };
  }, []);

  const [tempSettings, setTempSettings] = useState<SystemSettings>(settings);
  const [driveConnected, setDriveConnected] = useState(false);
  
  const [newYearInput, setNewYearInput] = useState('');

  useEffect(() => {
    if (currentUser) localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(currentUser));
    else localStorage.removeItem(STORAGE_KEYS.AUTH);
  }, [currentUser]);

  useEffect(() => {
    setTempSettings(settings);
    if (settings.googleDriveClientId) {
      initDriveApi(settings.googleDriveClientId).then(() => {}).catch(err => console.error("Drive Init Error", err));
    }
  }, [settings]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [aiQuery, setAiQuery] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [showAddLeaveModal, setShowAddLeaveModal] = useState(false);
  const [showAddClaimModal, setShowAddClaimModal] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState<PayrollRecord | null>(null);
  const [selectedEmployeeProfile, setSelectedEmployeeProfile] = useState<Employee | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [staffFilter, setStaffFilter] = useState<StaffFilter>('ACTIVE');

  const [showEAModal, setShowEAModal] = useState(false);
  const [selectedEAEmployee, setSelectedEAEmployee] = useState<Employee | null>(null);
  const [eaYear, setEaYear] = useState(new Date().getFullYear());

  const [processMonth, setProcessMonth] = useState(new Date().getMonth() + 1);
  const [processYear, setProcessYear] = useState(new Date().getFullYear());
  const [payrollInputs, setPayrollInputs] = useState<Record<string, { allowance: number, bonus: number, overtime: number, otherDeductions: number, pcb: number, daysWorked: number, unpaidDays: number }>>({});

  const [newEmp, setNewEmp] = useState<Partial<Employee>>({
    name: '', nric: '', password: '', position: '', basicSalary: 0, status: 'ACTIVE', epfNumber: '', taxNumber: '', bankAccountNumber: '',
    maritalStatus: 'SINGLE', children: 0, joinDate: new Date().toISOString().split('T')[0], leaveBalance: { annual: 12, sick: 14, emergency: 3, annualUsed: 0, sickUsed: 0, emergencyUsed: 0 }
  });

  const [newClaim, setNewClaim] = useState<{ amount: number, description: string, attachmentUrl?: string, attachmentName?: string }>({
    amount: 0, description: '', attachmentUrl: '', attachmentName: ''
  });

  const calculateAge = (nric: string) => {
    if (!nric || nric.length < 2) return 0;
    const yearPart = parseInt(nric.substring(0, 2));
    const currentYearShort = new Date().getFullYear() % 100;
    const birthYear = yearPart <= currentYearShort ? 2000 + yearPart : 1900 + yearPart;
    return new Date().getFullYear() - birthYear;
  };

  const filteredEmployees = useMemo(() => {
    if (staffFilter === 'ALL') return employees;
    return employees.filter(e => e.status === staffFilter);
  }, [employees, staffFilter]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const role = formData.get('role') as UserRole;
    const identifier = formData.get('identifier') as string;
    const password = formData.get('password') as string;

    if (role === 'SUPER_ADMIN') {
      // Default admin login: ID "admin", Password "admin123"
      if (identifier === 'admin' && password === 'admin123') {
        setCurrentUser({ id: '0', name: 'Super Admin', role: 'SUPER_ADMIN' });
        setLoginError('');
      } else {
        setLoginError('Invalid Admin ID or Password.');
      }
    } else {
      const emp = employees.find(e => e.nric === identifier && (e.password || e.nric) === password && e.status === 'ACTIVE');
      if (emp) {
        setCurrentUser({ id: emp.id, name: emp.name, role: 'TEACHER' });
        setLoginError('');
      } else {
        setLoginError('Invalid NRIC or Password.');
      }
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setActiveTab('dashboard');
  };

  const visiblePayroll = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'SUPER_ADMIN') return payrollRecords;
    return payrollRecords.filter(r => r.employeeId === currentUser.id);
  }, [payrollRecords, currentUser]);

  const visibleLeaves = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'SUPER_ADMIN') return leaves;
    return leaves.filter(l => l.employeeId === currentUser.id);
  }, [leaves, currentUser]);

  const visibleClaims = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'SUPER_ADMIN') return claims;
    return claims.filter(c => c.employeeId === currentUser.id);
  }, [claims, currentUser]);

  const todayLeaves = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return leaves.filter(l => l.status === 'APPROVED' && todayStr >= l.startDate && todayStr <= l.endDate);
  }, [leaves]);

  const upcomingLeaves = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return leaves.filter(l => l.status === 'APPROVED' && l.startDate > todayStr).sort((a,b) => a.startDate.localeCompare(b.startDate)).slice(0, 5);
  }, [leaves]);

  const myProfile = useMemo(() => {
    if (!currentUser || currentUser.role === 'SUPER_ADMIN') return null;
    return employees.find(e => e.id === currentUser.id);
  }, [employees, currentUser]);

  const handleConnectDrive = async () => {
    if (!settings.googleDriveClientId) {
      alert("Please enter a Google Cloud Client ID in settings first.");
      return;
    }
    try {
      await authenticateDrive();
      setDriveConnected(true);
      alert("Connected to Google Drive successfully!");
    } catch (e) {
      alert("Failed to connect to Drive. Check popup blocker or Client ID.");
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const employeeData = {
        ...newEmp,
        password: newEmp.password || newEmp.nric, // Default to NRIC if no password set
        salaryHistory: [{ date: new Date().toISOString(), amount: newEmp.basicSalary || 0, reason: 'Joined' }],
        documents: [],
        isMalaysian: true,
      };
      await addDoc(collection(db, "employees"), employeeData);
      setNewEmp({
        name: '', nric: '', password: '', position: '', basicSalary: 0, status: 'ACTIVE', epfNumber: '', taxNumber: '', bankAccountNumber: '',
        maritalStatus: 'SINGLE', children: 0, joinDate: new Date().toISOString().split('T')[0], leaveBalance: { annual: 12, sick: 14, emergency: 3, annualUsed: 0, sickUsed: 0, emergencyUsed: 0 }
      });
      setShowAddEmployee(false);
    } catch (err) {
      alert("Error adding employee: " + err);
    }
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;

    try {
      const original = employees.find(emp => emp.id === editingEmployee.id);
      let updatedData = { ...editingEmployee };

      if (original && original.basicSalary !== editingEmployee.basicSalary) {
        const diff = editingEmployee.basicSalary - original.basicSalary;
        const type = diff > 0 ? 'Salary Appraisal' : 'Salary Adjustment';
        
        updatedData = {
          ...updatedData,
          salaryHistory: [
            ...updatedData.salaryHistory, 
            { 
              date: new Date().toISOString(), 
              amount: updatedData.basicSalary, 
              reason: type 
            }
          ]
        };
      }

      const { id, ...cleanData } = updatedData;
      await updateDoc(doc(db, "employees", id), cleanData as any);
      setEditingEmployee(null);
    } catch (err) {
      alert("Error updating employee: " + err);
    }
  };

  const handleProcessPayroll = async () => {
    try {
      const activeEmployees = employees.filter(e => e.status === 'ACTIVE');
      const totalDays = getDaysInMonth(processMonth, processYear);
      
      for (const emp of activeEmployees) {
        const inputs = payrollInputs[emp.id] || { allowance: 0, bonus: 0, overtime: 0, otherDeductions: 0, pcb: 0, daysWorked: totalDays, unpaidDays: 0 };
        const actualBasic = (emp.basicSalary / totalDays) * (inputs.daysWorked || totalDays);
        const statutory = calculateStatutory(actualBasic, inputs.allowance, inputs.bonus, inputs.overtime, inputs.unpaidDays || 0, inputs.otherDeductions, inputs.pcb, totalDays, emp.nric);
        
        const record = { 
          employeeId: emp.id, 
          month: processMonth, 
          year: processYear, 
          basicSalary: actualBasic, 
          allowance: inputs.allowance,
          bonus: inputs.bonus, 
          overtime: inputs.overtime, 
          otherDeductions: inputs.otherDeductions,
          unpaidLeaveDays: inputs.unpaidDays || 0, 
          isPaid: false, 
          workingDays: inputs.daysWorked || totalDays,
          ...statutory 
        };

        const existing = payrollRecords.find(r => r.employeeId === emp.id && r.month === processMonth && r.year === processYear);
        if (existing) {
          await updateDoc(doc(db, "payroll", existing.id), record);
        } else {
          await addDoc(collection(db, "payroll"), record);
        }
      }
      setShowProcessModal(false);
      setActiveTab('payroll');
    } catch (err) {
      alert("Error processing payroll: " + err);
    }
  };

  const handleTogglePaidStatus = async (recordId: string) => {
    const rec = payrollRecords.find(r => r.id === recordId);
    if (rec) {
      await updateDoc(doc(db, "payroll", recordId), { isPaid: !rec.isPaid });
    }
  };
  
  const handleDeletePayrollRecord = async (recordId: string) => {
    if (window.confirm("Are you sure you want to PERMANENTLY delete this payslip?")) {
      await deleteDoc(doc(db, "payroll", recordId));
    }
  };

  const handleResetLeaveCycle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (window.confirm("ADMIN RESET: You are about to reset ALL employee leave balances. Are you sure?")) {
      for (const emp of employees) {
        await updateDoc(doc(db, "employees", emp.id), {
          "leaveBalance.annualUsed": 0,
          "leaveBalance.sickUsed": 0,
          "leaveBalance.emergencyUsed": 0
        });
      }

      await addDoc(collection(db, "requests"), {
        category: 'leave',
        employeeId: 'SYSTEM',
        employeeName: 'System Admin',
        type: LeaveType.RESET,
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        date: new Date().toISOString(),
        days: 0,
        reason: 'Annual Leave Cycle Reset',
        status: 'APPROVED',
        approvedBy: currentUser?.name
      });
      
      alert("Success: All staff leave balances have been reset.");
    }
  };

  const handleAddLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    
    let empId = (currentUser?.role === 'SUPER_ADMIN') ? formData.get('employeeId') as string : currentUser?.id || '';
    const emp = employees.find(e => e.id === empId);
    
    if (!emp) return;

    const newRequest = {
      category: 'leave',
      employeeId: emp.id, 
      employeeName: emp.name,
      type: formData.get('type') as LeaveType,
      startDate: formData.get('startDate') as string,
      endDate: formData.get('endDate') as string,
      date: new Date().toISOString(),
      days: parseFloat(formData.get('days') as string) || 0,
      reason: formData.get('reason') as string,
      status: 'PENDING'
    };
    
    await addDoc(collection(db, "requests"), newRequest);
    setShowAddLeaveModal(false);
  };

  const handleApproveLeave = async (leaveId: string) => {
    const leave = leaves.find(l => l.id === leaveId);
    if (!leave) return;
    
    await updateDoc(doc(db, "requests", leaveId), { status: 'APPROVED', approvedBy: currentUser?.name });
    
    const emp = employees.find(e => e.id === leave.employeeId);
    if (emp) {
      const balance = { ...emp.leaveBalance };
      if (leave.type === LeaveType.ANNUAL) balance.annualUsed += leave.days;
      else if (leave.type === LeaveType.SICK) balance.sickUsed += leave.days;
      else if (leave.type === LeaveType.EMERGENCY) balance.emergencyUsed += leave.days;
      await updateDoc(doc(db, "employees", emp.id), { leaveBalance: balance });
    }
  };

  const handleRejectLeave = async (leaveId: string) => {
    await updateDoc(doc(db, "requests", leaveId), { status: 'REJECTED', approvedBy: currentUser?.name });
  };

  const handleAddClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    
    let empId = (currentUser?.role === 'SUPER_ADMIN') ? formData.get('employeeId') as string : currentUser?.id || '';
    const emp = employees.find(e => e.id === empId);
    
    if (!emp || !newClaim.amount) return;

    const claim = {
      category: 'claim',
      employeeId: emp.id, 
      employeeName: emp.name, 
      amount: newClaim.amount, 
      description: newClaim.description, 
      date: new Date().toISOString(), 
      status: 'APPLIED',
      attachmentUrl: newClaim.attachmentUrl,
      attachmentName: newClaim.attachmentName
    };
    
    await addDoc(collection(db, "requests"), claim);
    setShowAddClaimModal(false);
    setNewClaim({ amount: 0, description: '', attachmentUrl: '', attachmentName: '' });
  };

  const handleClaimFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const base64 = await readFileAsBase64(file);
      setNewClaim(prev => ({ ...prev, attachmentUrl: base64, attachmentName: file.name }));
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const base64 = await readFileAsBase64(file);
      setTempSettings(prev => ({ ...prev, companyLogo: base64 }));
    }
  };

  const handleProfileFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (selectedEmployeeProfile && e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      let fileData = "";
      let driveLink = "";

      if (isDriveConnected()) {
        try {
          const driveFile = await uploadToDrive(file, selectedEmployeeProfile.name);
          driveLink = driveFile.webViewLink;
          alert("File uploaded to Google Drive successfully.");
        } catch (err) {
          fileData = await readFileAsBase64(file);
        }
      } else {
        if (file.size > 2000000) {
           alert("File too large for local storage (Max 2MB).");
           return;
        }
        fileData = await readFileAsBase64(file);
      }

      const newDoc: EmployeeDocument = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        type: 'General',
        uploadDate: new Date().toISOString().split('T')[0],
        fileData: fileData,
        driveLink: driveLink
      };
      
      const updatedDocs = [...selectedEmployeeProfile.documents, newDoc];
      await updateDoc(doc(db, "employees", selectedEmployeeProfile.id), { documents: updatedDocs });
      setSelectedEmployeeProfile({ ...selectedEmployeeProfile, documents: updatedDocs });
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (selectedEmployeeProfile && confirm("Delete this document record?")) {
      const updatedDocs = selectedEmployeeProfile.documents.filter(d => d.id !== docId);
      await updateDoc(doc(db, "employees", selectedEmployeeProfile.id), { documents: updatedDocs });
      setSelectedEmployeeProfile({ ...selectedEmployeeProfile, documents: updatedDocs });
    }
  };

  const handleMarkClaimed = async (claimId: string) => {
    await updateDoc(doc(db, "requests", claimId), { status: 'CLAIMED' });
  };

  const calculateEAData = (employeeId: string, year: number) => {
    const records = payrollRecords.filter(r => r.employeeId === employeeId && r.year === year && r.isPaid);
    return records.reduce((acc, r) => ({
      gross: acc.gross + r.grossSalary,
      epf: acc.epf + r.epfEmployee,
      socso: acc.socso + r.socsoEmployee,
      eis: acc.eis + r.eisEmployee,
      pcb: acc.pcb + r.pcb,
    }), { gross: 0, epf: 0, socso: 0, eis: 0, pcb: 0 });
  };

  const handleSaveSettings = async () => {
    await setDoc(doc(db, "system", "settings"), tempSettings);
    alert("System settings have been saved successfully.");
  };

  const handleAddYear = () => {
    if (!newYearInput) return;
    const y = parseInt(newYearInput);
    if (!isNaN(y) && !tempSettings.supportedYears.includes(y)) {
      setTempSettings(prev => ({ ...prev, supportedYears: [...prev.supportedYears, y].sort((a, b) => a - b) }));
      setNewYearInput('');
    }
  };

  const handleDeleteYear = (year: number) => {
    if (confirm(`Remove year ${year}?`)) {
      setTempSettings(prev => ({ ...prev, supportedYears: prev.supportedYears.filter(y => y !== year) }));
    }
  };

  const handleExportData = () => {
    const data = { employees, leaves, claims, payrollRecords, settings };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WayPay_Export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        alert("Import logic detected. Manual firestore import recommended.");
      } catch (err) {
        alert("Error reading file.");
      }
    };
    reader.readAsText(file);
  };

  const handleAskAI = async () => {
    if (!aiQuery.trim()) return;
    setIsAiLoading(true);
    setAiResponse('');
    try {
      const response = await askHRAssistant(aiQuery);
      setAiResponse(response || 'No response found.');
    } catch (error) {
      setAiResponse('Error contacting AI Assistant.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const claimStats = useMemo(() => {
    const total = visibleClaims.reduce((s, c) => s + c.amount, 0);
    const successful = visibleClaims.filter(c => c.status === 'CLAIMED').reduce((s, c) => s + c.amount, 0);
    const pending = visibleClaims.filter(c => c.status === 'APPLIED').reduce((s, c) => s + c.amount, 0);
    const rejected = visibleClaims.filter(c => c.status === 'REJECTED').reduce((s, c) => s + c.amount, 0);
    return { total, successful, pending, rejected };
  }, [visibleClaims]);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in">
          <div className="bg-indigo-600 p-10 text-white text-center">
            <div className="h-20 w-20 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner backdrop-blur-md">
              <ShieldCheck size={40} className="text-white" />
            </div>
            <h1 className="text-3xl font-black tracking-tight">Way-Pay HR</h1>
            <p className="opacity-80 text-sm font-bold uppercase tracking-widest mt-2">Center Management Portal</p>
          </div>
          <form onSubmit={handleLogin} className="p-10 space-y-6">
            {loginError && <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-xs font-bold border border-red-100 flex items-center gap-3"><AlertCircle size={18}/> {loginError}</div>}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Role Type</label>
              <select name="role" className="w-full border-2 border-slate-100 rounded-2xl p-4 font-bold bg-white focus:border-indigo-500 outline-none transition-all cursor-pointer">
                <option value="TEACHER">Teacher / Academic Staff</option>
                <option value="SUPER_ADMIN">System Administrator</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Access Credential (NRIC / ID)</label>
              <div className="relative">
                 <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400"><User size={20}/></div>
                 <input name="identifier" type="text" placeholder="NRIC or Admin ID" className="w-full border-2 border-slate-100 rounded-2xl p-4 pl-12 font-bold focus:border-indigo-500 outline-none transition-all" required />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Password</label>
              <div className="relative">
                 <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400"><Lock size={20}/></div>
                 <input name="password" type="password" placeholder="••••••••" className="w-full border-2 border-slate-100 rounded-2xl p-4 pl-12 font-bold focus:border-indigo-500 outline-none transition-all" required />
              </div>
            </div>
            <button type="submit" className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black uppercase shadow-xl hover:bg-indigo-700 transition-all">Secure Login</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden print:bg-white text-slate-900">
      <aside className={`bg-slate-950 text-white transition-all duration-500 ${isSidebarOpen ? 'w-72' : 'w-24'} flex flex-col print:hidden shadow-2xl z-50`}>
        <div className="p-8 flex items-center justify-between">
          {isSidebarOpen ? <div className="flex items-center gap-3"><div className="h-10 w-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg"><Briefcase size={24} className="text-white" /></div><span className="text-2xl font-black tracking-tight">Way-Pay</span></div> : <Briefcase size={24} className="mx-auto" />}
          <button type="button" onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-800 rounded-xl transition-colors">{isSidebarOpen ? <X size={20} /> : <Menu size={20} />}</button>
        </div>
        <nav className="flex-1 px-4 space-y-2 mt-4 overflow-y-auto custom-scrollbar">
          <NavItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={22}/>} label="Dashboard" collapsed={!isSidebarOpen} />
          {currentUser.role === 'SUPER_ADMIN' && <NavItem active={activeTab === 'employees'} onClick={() => setActiveTab('employees')} icon={<Users size={22}/>} label="Staff Directory" collapsed={!isSidebarOpen} />}
          <NavItem active={activeTab === 'payroll'} onClick={() => setActiveTab('payroll')} icon={<CreditCard size={22}/>} label={currentUser.role === 'SUPER_ADMIN' ? 'Payroll Control' : 'My Payslips'} collapsed={!isSidebarOpen} />
          <NavItem active={activeTab === 'leaves'} onClick={() => setActiveTab('leaves')} icon={<Calendar size={22}/>} label={currentUser.role === 'SUPER_ADMIN' ? 'Leave Management' : 'My Leaves'} collapsed={!isSidebarOpen} />
          <NavItem active={activeTab === 'claims'} onClick={() => setActiveTab('claims')} icon={<ReceiptText size={22}/>} label={currentUser.role === 'SUPER_ADMIN' ? 'Claim Approvals' : 'My Claims'} collapsed={!isSidebarOpen} />
          {currentUser.role === 'SUPER_ADMIN' && (
            <div className="pt-4 mt-4 border-t border-slate-800">
              <NavItem active={activeTab === 'ai'} onClick={() => setActiveTab('ai')} icon={<MessageSquare size={22}/>} label="AI HR Assistant" collapsed={!isSidebarOpen} />
              <NavItem active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<SettingsIcon size={22}/>} label="Settings" collapsed={!isSidebarOpen} />
            </div>
          )}
        </nav>
        <div className="p-6 border-t border-slate-900">
          <button type="button" onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-all font-bold text-sm"><LogOut size={20}/> {isSidebarOpen && <span>Logout</span>}</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden print:overflow-visible print:block print:p-0">
        <header className="h-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b dark:border-slate-800 flex items-center justify-between px-6 md:px-10 sticky top-0 z-40 print:hidden">
          <h2 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white capitalize tracking-tight">{activeTab.replace('-', ' ')}</h2>
          <div className="flex items-center gap-6">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-slate-400 dark:text-slate-50">{new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
              <p className="text-[10px] text-indigo-600 font-black uppercase tracking-tighter">{currentUser.name}</p>
            </div>
            <div className="h-10 w-10 md:h-12 md:w-12 rounded-2xl bg-indigo-50 dark:bg-slate-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-sm"><User size={20} /></div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-10 print:p-0 print:overflow-visible">
          {activeTab === 'dashboard' && (
            <div className="space-y-10 animate-fade-in max-w-7xl mx-auto">
              <div className={`grid gap-3 md:gap-8 ${currentUser.role === 'TEACHER' ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'}`}>
                {currentUser.role === 'SUPER_ADMIN' ? (
                  <>
                    <StatCard title="Active Staff" value={employees.filter(e => e.status === 'ACTIVE').length.toString()} subValue={`Gross: ${formatCurrency(employees.reduce((s, e) => s + e.basicSalary, 0))}`} icon={<Users className="text-blue-500" />} color="bg-blue-50 dark:bg-blue-900/20" />
                    <StatCard title="Employer Statutory" value={formatCurrency(payrollRecords.filter(r => r.month === processMonth && r.year === processYear).reduce((s, r) => s + r.epfEmployer + r.socsoEmployer + r.eisEmployer, 0) || employees.reduce((s, e) => s + (e.basicSalary * 0.13), 0))} icon={<TrendingUp className="text-emerald-500" />} color="bg-emerald-50 dark:bg-emerald-900/20" />
                    <StatCard title="Leave Requests" value={leaves.filter(l => l.status === 'PENDING').length.toString()} icon={<Calendar className="text-rose-500" />} color="bg-rose-50 dark:bg-rose-900/20" />
                    <StatCard title="Pending Claims" value={claims.filter(c => c.status === 'APPLIED').length.toString()} icon={<ReceiptText className="text-amber-500" />} color="bg-amber-50 dark:bg-amber-900/20" />
                  </>
                ) : (
                  <>
                    <StatCard title="Annual Balance" value={`${(myProfile?.leaveBalance.annual || 0) - (myProfile?.leaveBalance.annualUsed || 0)} Days`} icon={<Calendar className="text-blue-500" />} color="bg-blue-50 dark:bg-blue-900/20" />
                    <StatCard title="Sick Leave" value={`${(myProfile?.leaveBalance.sick || 0) - (myProfile?.leaveBalance.sickUsed || 0)} Days`} icon={<Clock className="text-rose-500" />} color="bg-rose-50 dark:bg-rose-900/20" />
                    <StatCard title="Claims Pending" value={visibleClaims.filter(c => c.status === 'APPLIED').length.toString()} icon={<ReceiptText className="text-amber-500" />} color="bg-amber-50 dark:bg-amber-900/20" />
                    <StatCard title="Join Date" value={myProfile?.joinDate || '-'} icon={<ShieldCheck className="text-emerald-500" />} color="bg-emerald-50 dark:bg-emerald-900/20" />
                  </>
                )}
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                   <h3 className="text-lg font-black text-slate-800 dark:text-white mb-6 flex items-center gap-3"><CalendarClock size={22} className="text-indigo-600" /> Today's Absence</h3>
                   <div className="space-y-4">
                     {todayLeaves.length > 0 ? todayLeaves.map(l => (
                       <div key={l.id} className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-between border border-slate-100 dark:border-slate-700">
                         <div><p className="font-black text-slate-800 dark:text-white">{l.employeeName}</p><p className="text-[10px] text-slate-400 dark:text-slate-50 font-bold uppercase">{l.type}</p></div>
                         <span className="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 px-3 py-1 rounded-lg text-[10px] font-black uppercase">Away</span>
                       </div>
                     )) : <p className="text-sm text-slate-400 dark:text-slate-500 italic font-medium">No one is away today.</p>}
                   </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                   <h3 className="text-lg font-black text-slate-800 dark:text-white mb-6 flex items-center gap-3"><History size={22} className="text-indigo-600" /> Upcoming Absences</h3>
                   <div className="space-y-4">
                     {upcomingLeaves.length > 0 ? upcomingLeaves.map(l => (
                       <div key={l.id} className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-between border border-slate-100 dark:border-slate-700">
                         <div><p className="font-black text-slate-800 dark:text-white">{l.employeeName}</p><p className="text-[10px] text-slate-400 dark:text-slate-50 font-bold uppercase">{l.startDate}</p></div>
                         <span className="text-[10px] font-bold text-slate-400 dark:text-slate-50">{l.days} Days</span>
                       </div>
                     )) : <p className="text-sm text-slate-400 dark:text-slate-500 italic font-medium">No upcoming leaves scheduled.</p>}
                   </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'employees' && currentUser.role === 'SUPER_ADMIN' && (
            <div className="space-y-10 animate-fade-in max-7xl mx-auto">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 md:p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm gap-4">
                <div>
                  <h3 className="text-2xl font-black text-slate-800 dark:text-white">Staff Management</h3>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {['ALL', 'ACTIVE', 'RESIGNED'].map(status => (
                      <button 
                        type="button"
                        key={status} 
                        onClick={() => setStaffFilter(status as StaffFilter)} 
                        className={`text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-wider transition-all ${staffFilter === status ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
                <button type="button" onClick={() => setShowAddEmployee(true)} className="w-full md:w-auto bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black flex items-center justify-center gap-3 shadow-xl hover:bg-indigo-700 transition-all"><Plus size={22}/> Add New Teacher</button>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden overflow-x-auto">
                <table className="w-full text-left min-w-[800px]">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b dark:border-slate-700 text-slate-400 text-[10px] uppercase font-black tracking-widest">
                    <tr><th className="px-10 py-6">Teacher / NRIC</th><th className="px-10 py-6">Position</th><th className="px-10 py-6 text-right">Basic Salary</th><th className="px-10 py-6 text-center">Age</th><th className="px-10 py-6 text-center">Status</th><th className="px-10 py-6"></th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredEmployees.map(emp => (
                      <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-10 py-6"><div className="font-black text-slate-800 dark:text-white text-lg">{emp.name}</div><div className="text-[10px] text-slate-400 font-bold uppercase mt-1">{emp.nric}</div></td>
                        <td className="px-10 py-6 text-sm font-bold text-slate-600 dark:text-slate-300">{emp.position}</td>
                        <td className="px-10 py-6 text-right font-black text-slate-800 dark:text-white">{formatCurrency(emp.basicSalary)}</td>
                        <td className="px-10 py-6 text-center text-sm font-black text-slate-400">{calculateAge(emp.nric)}</td>
                        <td className="px-10 py-6 text-center">
                          <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${emp.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                            {emp.status}
                          </span>
                        </td>
                        <td className="px-10 py-6 text-right">
                          <div className="flex justify-end gap-3">
                            <button type="button" onClick={() => setEditingEmployee(emp)} className="p-3 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-colors"><Edit size={18}/></button>
                            <button type="button" onClick={() => setSelectedEmployeeProfile(emp)} className="p-3 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"><Info size={18}/></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'payroll' && (
             <div className="space-y-10 animate-fade-in max-w-7xl mx-auto">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 md:p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm gap-4">
                <div>
                   <h3 className="text-2xl font-black text-slate-800 dark:text-white">{currentUser.role === 'SUPER_ADMIN' ? 'Monthly Payroll Control' : 'Pay History'}</h3>
                   {currentUser.role === 'SUPER_ADMIN' && <div className="mt-2 flex gap-4 text-sm text-slate-50">
                      <span onClick={() => setShowEAModal(true)} className="flex items-center gap-1 cursor-pointer hover:text-indigo-600 font-bold"><FileText size={16}/> EA Form Generator</span>
                   </div>}
                </div>
                {currentUser.role === 'SUPER_ADMIN' && <button type="button" onClick={() => setShowProcessModal(true)} className="w-full md:w-auto bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3"><History size={20}/> Generate Monthly Payroll</button>}
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden overflow-x-auto">
                <table className={`w-full text-left ${currentUser.role === 'TEACHER' ? '' : 'min-w-[700px]'}`}>
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b dark:border-slate-700 text-slate-400 text-[10px] uppercase font-black tracking-widest">
                    <tr>
                        <th className="px-10 py-6">Period / Teacher</th>
                        <th className={`px-10 py-6 text-right ${currentUser.role === 'TEACHER' ? 'hidden md:table-cell' : ''}`}>Net Payable RM</th>
                        <th className={`px-10 py-6 text-center ${currentUser.role === 'TEACHER' ? 'hidden md:table-cell' : ''}`}>Status</th>
                        <th className={`px-10 py-6 ${currentUser.role === 'TEACHER' ? 'hidden md:table-cell' : ''}`}></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {visiblePayroll.map(rec => (
                      <tr key={rec.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-10 py-6">
                            <div className="flex items-center gap-3 flex-wrap md:block">
                                <div>
                                    <div className="font-black text-slate-800 dark:text-white">{currentUser.role === 'SUPER_ADMIN' ? employees.find(e => e.id === rec.employeeId)?.name : `${new Date(rec.year, rec.month-1).toLocaleString('default', { month: 'long' })} ${rec.year}`}</div>
                                </div>
                                {currentUser.role === 'TEACHER' && (
                                    <button 
                                        type="button" 
                                        onClick={() => setSelectedPayslip(rec)} 
                                        className="md:hidden text-[10px] font-black uppercase tracking-widest bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-800"
                                    >
                                        View Payslip
                                    </button>
                                )}
                            </div>
                        </td>
                        <td className={`px-10 py-6 text-right font-black text-indigo-600 dark:text-indigo-400 text-lg ${currentUser.role === 'TEACHER' ? 'hidden md:table-cell' : ''}`}>{formatCurrency(rec.netSalary)}</td>
                        <td className={`px-10 py-6 text-center ${currentUser.role === 'TEACHER' ? 'hidden md:table-cell' : ''}`}>
                          <button type="button"
                            onClick={() => currentUser.role === 'SUPER_ADMIN' ? handleTogglePaidStatus(rec.id) : null} 
                            className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase transition-all ${rec.isPaid ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'} ${currentUser.role !== 'SUPER_ADMIN' && 'cursor-default'}`}
                          >
                             {rec.isPaid ? 'PAID' : 'PROCESSING'}
                          </button>
                        </td>
                        <td className={`px-10 py-6 text-right ${currentUser.role === 'TEACHER' ? 'hidden md:table-cell' : ''}`}>
                          <div className="flex justify-end gap-2">
                             <button type="button" onClick={() => setSelectedPayslip(rec)} className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 text-xs font-black uppercase tracking-widest bg-indigo-50 dark:bg-indigo-900/30 px-4 py-2 rounded-xl transition-all">View Payslip</button>
                             {currentUser.role === 'SUPER_ADMIN' && (
                                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeletePayrollRecord(rec.id); }} className="text-rose-500 hover:text-rose-700 bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-100 p-2 rounded-xl transition-all">
                                   <Trash size={16} className="pointer-events-none"/>
                                </button>
                             )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
             </div>
          )}

          {activeTab === 'leaves' && (
            <div className="space-y-10 animate-fade-in max-w-7xl mx-auto">
              {currentUser.role === 'SUPER_ADMIN' && (
                <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-8">
                  <h3 className="text-xl font-black text-slate-800 dark:text-white">Teacher Leave Balances</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {employees.filter(e => e.status === 'ACTIVE').map(emp => (
                      <div key={emp.id} className="p-6 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                         <p className="font-black text-slate-800 dark:text-white mb-4">{emp.name}</p>
                         <div className="space-y-3">
                           <BalanceBar label="Annual" current={(emp.leaveBalance.annual - emp.leaveBalance.annualUsed)} total={emp.leaveBalance.annual} color="bg-indigo-500" />
                           <BalanceBar label="Sick" current={(emp.leaveBalance.sick - emp.leaveBalance.sickUsed)} total={emp.leaveBalance.sick} color="bg-rose-500" />
                           <BalanceBar label="Emergency" current={(emp.leaveBalance.emergency - emp.leaveBalance.emergencyUsed)} total={emp.leaveBalance.emergency} color="bg-amber-500" />
                         </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 md:p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm gap-4">
                <div className="flex items-center gap-6 flex-wrap">
                   <h3 className="text-2xl font-black text-slate-800 dark:text-white">{currentUser.role === 'SUPER_ADMIN' ? 'Approval Queue' : 'My Requests'}</h3>
                   {currentUser.role === 'SUPER_ADMIN' && <button type="button" onClick={(e) => handleResetLeaveCycle(e)} className="flex items-center gap-2 text-rose-500 font-black text-xs uppercase bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-100 px-4 py-2 rounded-lg transition-all border border-rose-100 dark:border-rose-900/50"><RotateCcw size={16}/> Reset Cycle</button>}
                </div>
                <button type="button" onClick={() => setShowAddLeaveModal(true)} className="w-full md:w-auto bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black flex items-center justify-center gap-3 shadow-xl hover:bg-indigo-700 transition-all"><Plus size={22}/> New Request</button>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden overflow-x-auto">
                <table className="w-full text-left min-w-[800px]">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b dark:border-slate-700 text-slate-400 text-[10px] uppercase font-black tracking-widest">
                    <tr>
                        <th className="px-10 py-6">Type / Staff</th>
                        <th className="px-10 py-6">Dates</th>
                        <th className={`px-10 py-6 text-center ${currentUser.role === 'TEACHER' ? 'hidden md:table-cell' : ''}`}>Days</th>
                        <th className="px-10 py-6">Status</th>
                        <th className={`px-10 py-6 ${currentUser.role === 'TEACHER' ? 'hidden md:table-cell' : ''}`}></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {visibleLeaves.map(l => (
                      <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-10 py-6"><div className="font-black text-slate-800 dark:text-white">{currentUser.role === 'SUPER_ADMIN' ? l.employeeName : l.type}</div>{currentUser.role === 'SUPER_ADMIN' && <div className="text-[10px] text-slate-400 font-bold uppercase">{l.type}</div>}</td>
                        <td className="px-10 py-6 font-bold text-slate-600 dark:text-slate-300 text-sm">{l.startDate} <ChevronRight className="inline mx-1 text-slate-300" size={14} /> {l.endDate}</td>
                        <td className={`px-10 py-6 text-center font-black text-slate-800 dark:text-white ${currentUser.role === 'TEACHER' ? 'hidden md:table-cell' : ''}`}>{l.days}</td>
                        <td className="px-10 py-6"><span className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${l.status === 'APPROVED' || l.type === LeaveType.RESET ? 'bg-emerald-100 text-emerald-600' : l.status === 'REJECTED' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>{l.type === LeaveType.RESET ? 'APPROVED' : l.status}</span></td>
                        <td className={`px-10 py-6 text-right ${currentUser.role === 'TEACHER' ? 'hidden md:table-cell' : ''}`}>
                          {currentUser.role === 'SUPER_ADMIN' && l.status === 'PENDING' && (
                            <div className="flex justify-end gap-2">
                              <button type="button" onClick={() => handleApproveLeave(l.id)} className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-black text-xs hover:bg-emerald-700 transition-all">Approve</button>
                              <button type="button" onClick={() => handleRejectLeave(l.id)} className="bg-rose-50 text-rose-600 px-4 py-2 rounded-xl font-black text-xs hover:bg-rose-100 transition-all">Reject</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'claims' && (
            <div className="space-y-10 animate-fade-in max-w-7xl mx-auto">
              <div className={`grid gap-3 md:gap-8 ${currentUser.role === 'TEACHER' ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 md:grid-cols-4'}`}>
                <StatCard title="Total Claim Amt" value={formatCurrency(claimStats.total)} icon={<ReceiptText className="text-slate-500" />} color="bg-slate-50 dark:bg-slate-800" />
                <StatCard title="Successful Amt" value={formatCurrency(claimStats.successful)} icon={<CheckCircle className="text-emerald-500" />} color="bg-emerald-50 dark:bg-emerald-900/20" />
                <StatCard title="Pending Amt" value={formatCurrency(claimStats.pending)} icon={<Clock className="text-amber-500" />} color="bg-amber-50 dark:bg-amber-900/20" />
                <StatCard title="Rejected Amt" value={formatCurrency(claimStats.rejected)} icon={<Ban className="text-rose-500" />} color="bg-rose-50 dark:bg-rose-900/20" />
              </div>

              <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-slate-900 p-6 md:p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm gap-4">
                <h3 className="text-2xl font-black text-slate-800 dark:text-white">Claim Management</h3>
                <button type="button" onClick={() => setShowAddClaimModal(true)} className="w-full md:w-auto bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black flex items-center justify-center gap-3 shadow-xl hover:bg-indigo-700 transition-all"><Plus size={22}/> Submit New Claim</button>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden overflow-x-auto">
                <table className="w-full text-left min-w-[700px]">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b dark:border-slate-700 text-slate-400 text-[10px] uppercase font-black tracking-widest">
                    <tr><th className="px-10 py-6">Description / Staff</th><th className="px-10 py-6 text-right">Amount RM</th><th className="px-10 py-6 text-center">Status</th><th className="px-10 py-6"></th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {visibleClaims.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-10 py-6">
                          <div className="font-black text-slate-800 dark:text-white">{c.description}</div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase">{c.employeeName}</div>
                          {c.attachmentUrl && (
                            <a href={c.attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-indigo-500 hover:underline">
                              <File size={10} /> View Receipt
                            </a>
                          )}
                        </td>
                        <td className="px-10 py-6 text-right font-black text-indigo-700 dark:text-indigo-400 text-lg">{formatCurrency(c.amount)}</td>
                        <td className="px-10 py-6 text-center"><span className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${c.status === 'CLAIMED' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>{c.status === 'CLAIMED' ? 'Paid' : c.status}</span></td>
                        <td className="px-10 py-6 text-right">{currentUser.role === 'SUPER_ADMIN' && c.status === 'APPLIED' && <div className="flex gap-2 justify-end"><button type="button" onClick={() => setClaims(prev => prev.map(cl => cl.id === c.id ? {...cl, status: 'REJECTED'} : cl))} className="bg-rose-50 text-rose-600 px-4 py-2 rounded-xl font-black text-xs">Reject</button><button type="button" onClick={() => handleMarkClaimed(c.id)} className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-black text-xs">Mark Paid</button></div>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="max-w-4xl mx-auto animate-fade-in"><div className="bg-white dark:bg-slate-900 p-10 rounded-[40px] border border-slate-100 dark:border-slate-800 shadow-xl overflow-hidden relative"><div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div><div className="text-center mb-10"><h3 className="text-4xl font-black text-slate-800 dark:text-white tracking-tight">AI HR Policy Advisor</h3><p className="text-slate-500 font-medium">Instant guidance on Malaysian labor law and HR policies.</p></div><div className="space-y-6"><textarea value={aiQuery} onChange={(e) => setAiQuery(e.target.value)} placeholder="Ask about labor laws or policies..." className="w-full border-2 border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-white rounded-3xl p-8 text-lg font-bold min-h-[150px] outline-none focus:border-indigo-500" /><button type="button" onClick={handleAskAI} className="w-full bg-slate-900 dark:bg-slate-800 text-white py-5 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2">{isAiLoading ? <RefreshCw className="animate-spin" /> : 'Ask Assistant'}</button>{aiResponse && <div className="bg-slate-50 dark:bg-slate-800 dark:text-slate-200 p-10 rounded-[32px] border border-slate-200/50 dark:border-slate-700/50 mt-6 whitespace-pre-wrap font-medium">{aiResponse}</div>}</div></div></div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-5xl mx-auto animate-fade-in space-y-10">
              <div className="bg-white dark:bg-slate-900 p-12 rounded-[40px] border border-slate-100 dark:border-slate-800 shadow-sm space-y-12">
                <div className="flex justify-between items-center">
                  <h3 className="text-3xl font-black text-slate-800 dark:text-white">System Management</h3>
                  <button type="button" onClick={handleSaveSettings} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase flex items-center gap-2 shadow-xl hover:bg-indigo-700 transition-all"><Save size={16}/> Save Changes</button>
                </div>
                
                <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                  <h4 className="font-black text-slate-800 dark:text-white mb-2 flex items-center gap-2"><ImageIconLucide size={18}/> Company Branding</h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Upload your company logo for payslips and official documents.</p>
                  <div className="flex gap-4 items-center">
                    {tempSettings.companyLogo && (
                      <div className="h-16 w-16 bg-white dark:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-600 flex items-center justify-center overflow-hidden">
                        <img src={tempSettings.companyLogo} alt="Logo" className="max-h-full max-w-full object-contain" />
                      </div>
                    )}
                    <label className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:border-indigo-200 px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 cursor-pointer transition-all">
                      <Upload size={16}/> Upload Logo
                      <input type="file" hidden accept="image/*" onChange={handleLogoUpload} />
                    </label>
                  </div>
                </div>

                <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-2xl border border-red-100 dark:border-red-900/30">
                  <h4 className="font-black text-red-800 dark:text-red-400 mb-2 flex items-center gap-2"><AlertTriangle size={18}/> Administrative Actions</h4>
                  <p className="text-sm text-red-600/80 dark:text-red-400/80 mb-4 font-medium">Danger Zone: These actions affect all employees and cannot be undone.</p>
                  <div className="flex justify-between items-center">
                    <div>
                        <p className="font-black text-red-900 dark:text-red-300 text-sm uppercase tracking-wider">Annual Leave Cycle Reset</p>
                        <p className="text-xs text-red-700 dark:text-red-400 mt-1">Resets "Annual Used", "Sick Used", and "Emergency Used" to 0 for ALL staff.</p>
                    </div>
                    <button type="button" onClick={(e) => handleResetLeaveCycle(e)} className="bg-red-600 text-white px-6 py-3 rounded-xl font-black text-xs uppercase hover:bg-red-700 transition-all shadow-lg flex items-center gap-2">
                        <RotateCcw size={16}/> Reset All Balances
                    </button>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                  <h4 className="font-black text-slate-800 dark:text-white mb-2 flex items-center gap-2"><HardDrive size={18}/> Google Drive Storage Integration</h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Connect to your Google Drive to store employee documents and large files.</p>
                  <div className="flex gap-4 items-end">
                    <div className="flex-1 space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-400">Google Cloud Client ID</label>
                      <input className="w-full border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-white rounded-xl p-3 font-bold" placeholder="123456789-abcdef.apps.googleusercontent.com" value={tempSettings.googleDriveClientId || ''} onChange={e => setTempSettings({...tempSettings, googleDriveClientId: e.target.value})} />
                    </div>
                    <button type="button" onClick={handleConnectDrive} className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:border-indigo-200 px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2">
                      <LinkIcon size={16}/> {driveConnected ? 'Re-Connect' : 'Connect Drive'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="p-8 bg-indigo-50 dark:bg-indigo-900/20 rounded-3xl border border-indigo-100 dark:border-indigo-900/30 flex flex-col items-center text-center">
                    <DownloadCloud size={48} className="text-indigo-600 dark:text-indigo-400 mb-4" />
                    <p className="font-black text-indigo-900 dark:text-indigo-300 mb-2 uppercase tracking-widest">Export All Data</p>
                    <p className="text-sm text-indigo-400 dark:text-indigo-400/80 mb-6">Download a complete JSON backup of your center's data.</p>
                    <button type="button" onClick={handleExportData} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase shadow-lg">Download Backup</button>
                  </div>
                  <div className="p-8 bg-emerald-50 dark:bg-emerald-900/20 rounded-3xl border border-emerald-100 dark:border-emerald-900/30 flex flex-col items-center text-center">
                    <UploadCloud size={48} className="text-emerald-600 dark:text-emerald-400 mb-4" />
                    <p className="font-black text-emerald-900 dark:text-emerald-300 mb-2 uppercase tracking-widest">Import All Data</p>
                    <p className="text-sm text-emerald-400 dark:text-emerald-400/80 mb-6">Restore data from a previously downloaded backup file.</p>
                    <label className="bg-emerald-600 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase shadow-lg cursor-pointer">
                      Select File <input type="file" hidden accept=".json" onChange={handleImportData} />
                    </label>
                  </div>
                </div>

                <div className="pt-10 border-t border-slate-100 dark:border-slate-800 space-y-4">
                  <h4 className="font-black uppercase text-xs text-slate-400 tracking-widest">Center Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <input className="border-2 p-4 rounded-2xl font-bold dark:bg-slate-900 dark:border-slate-700 dark:text-white" placeholder="Center Name" value={tempSettings.companyName || ''} onChange={e => setTempSettings({...tempSettings, companyName: e.target.value})} />
                    <input className="border-2 p-4 rounded-2xl font-bold dark:bg-slate-900 dark:border-slate-700 dark:text-white" placeholder="SSM Number" value={tempSettings.registrationNumber || ''} onChange={e => setTempSettings({...tempSettings, registrationNumber: e.target.value})} />
                    <textarea className="border-2 p-4 rounded-2xl font-bold md:col-span-2 dark:bg-slate-900 dark:border-slate-700 dark:text-white" placeholder="Address" value={tempSettings.address || ''} onChange={e => setTempSettings({...tempSettings, address: e.target.value})} />
                  </div>
                </div>

                <div className="pt-10 border-t border-slate-100 dark:border-slate-800 space-y-4">
                   <div className="flex justify-between items-center">
                      <h4 className="font-black uppercase text-xs text-slate-400 tracking-widest">Manage Financial Years</h4>
                      <div className="flex gap-2">
                        <input className="border-2 rounded-lg p-2 font-bold text-xs w-24 dark:bg-slate-900 dark:border-slate-700 dark:text-white" placeholder="Year" value={newYearInput} onChange={e => setNewYearInput(e.target.value)} type="number" />
                        <button type="button" onClick={handleAddYear} className="text-[10px] font-black uppercase text-white bg-indigo-600 px-3 py-1 rounded-lg hover:bg-indigo-700">Add</button>
                      </div>
                   </div>
                   <div className="flex gap-3 flex-wrap mt-2">
                      {tempSettings.supportedYears && tempSettings.supportedYears.map(year => (
                        <div key={year} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-xl font-bold flex items-center gap-3 dark:text-white">
                           {year}
                           <button type="button" onClick={() => handleDeleteYear(year)} className="text-slate-400 hover:text-rose-500"><X size={14}/></button>
                        </div>
                      ))}
                   </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* MODALS */}
      {showEAModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[9999] flex items-center justify-center p-6">
           <div className="bg-white dark:bg-slate-900 rounded-[40px] w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl p-10 custom-scrollbar animate-fade-in relative">
              <button type="button" onClick={() => setShowEAModal(false)} className="absolute top-8 right-8 text-slate-400"><X size={28}/></button>
              <div className="mb-8">
                 <h2 className="text-3xl font-black text-slate-800 dark:text-white">EA Form Generator</h2>
                 <p className="text-slate-500 font-medium">Statement of Remuneration from Employment</p>
              </div>
              <div className="flex gap-4 mb-8">
                 <select className="p-4 border-2 border-slate-100 dark:border-slate-700 rounded-2xl font-bold bg-white dark:bg-slate-900 dark:text-white" value={eaYear} onChange={e => setEaYear(parseInt(e.target.value))}>
                    {settings.supportedYears.map(y => <option key={y} value={y}>{y}</option>)}
                 </select>
                 <select className="flex-1 p-4 border-2 border-slate-100 dark:border-slate-700 rounded-2xl font-bold bg-white dark:bg-slate-900 dark:text-white" onChange={e => setSelectedEAEmployee(employees.find(emp => emp.id === e.target.value) || null)}>
                    <option value="">Select Employee</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                 </select>
              </div>

              {selectedEAEmployee && (
                <div className="bg-slate-50 p-10 rounded-3xl border border-slate-100 print:bg-white print:border-none" id="ea-form-print">
                   <div className="text-center border-b-2 border-slate-200 pb-6 mb-8">
                      <h1 className="text-2xl font-black uppercase text-slate-900">EA Form {eaYear}</h1>
                      <p className="text-sm font-bold text-slate-500">{settings.companyName} ({settings.registrationNumber})</p>
                   </div>
                   
                   <div className="grid grid-cols-2 gap-8 mb-8">
                      <div><p className="text-[10px] font-black uppercase text-slate-400">Employee Name</p><p className="font-bold text-lg">{selectedEAEmployee.name}</p></div>
                      <div><p className="text-[10px] font-black uppercase text-slate-400">NRIC</p><p className="font-bold text-lg">{selectedEAEmployee.nric}</p></div>
                      <div><p className="text-[10px] font-black uppercase text-slate-400">Tax Number</p><p className="font-bold text-lg">{selectedEAEmployee.taxNumber || 'N/A'}</p></div>
                      <div><p className="text-[10px] font-black uppercase text-slate-400">EPF Number</p><p className="font-bold text-lg">{selectedEAEmployee.epfNumber}</p></div>
                   </div>

                   <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
                      {(() => {
                         const data = calculateEAData(selectedEAEmployee.id, eaYear);
                         return (
                           <>
                             <div className="flex justify-between items-center border-b pb-4"><span className="font-black text-slate-700">Total Gross Remuneration</span><span className="font-black text-xl text-indigo-600">{formatCurrency(data.gross)}</span></div>
                             <div className="flex justify-between items-center"><span className="font-bold text-slate-500">Total EPF (Employee Share)</span><span className="font-bold text-slate-700">{formatCurrency(data.epf)}</span></div>
                             <div className="flex justify-between items-center"><span className="font-bold text-slate-500">Total SOCSO (Employee Share)</span><span className="font-bold text-slate-700">{formatCurrency(data.socso)}</span></div>
                             <div className="flex justify-between items-center"><span className="font-bold text-slate-500">Total EIS (Employee Share)</span><span className="font-bold text-slate-700">{formatCurrency(data.eis)}</span></div>
                             <div className="flex justify-between items-center pt-4 border-t mt-4"><span className="font-black text-slate-700">Total PCB (MTD) Deducted</span><span className="font-black text-xl text-slate-900">{formatCurrency(data.pcb)}</span></div>
                           </>
                         )
                      })()}
                   </div>
                   <div className="mt-8 text-center print:hidden">
                      <button type="button" onClick={() => window.print()} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-black text-sm uppercase flex items-center gap-2 mx-auto"><Printer size={16}/> Print EA Form</button>
                   </div>
                </div>
              )}
           </div>
        </div>
      )}

      {(showAddEmployee || editingEmployee) && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[9999] flex items-center justify-center p-6">
          <div className="bg-white dark:bg-slate-900 rounded-[40px] w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-10 custom-scrollbar animate-fade-in">
             <div className="flex justify-between items-center mb-10"><h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">{editingEmployee ? 'Update Profile' : 'New Teacher'}</h2><button type="button" onClick={() => { setShowAddEmployee(false); setEditingEmployee(null); }} className="dark:text-white"><X size={28}/></button></div>
             <form onSubmit={editingEmployee ? handleUpdateEmployee : handleAddEmployee} className="space-y-8">
                <div className="grid grid-cols-2 gap-8">
                   <div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-400">Full Name</label><input required className="w-full border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-2xl p-4 font-bold" value={editingEmployee?.name || newEmp.name} onChange={e => editingEmployee ? setEditingEmployee({...editingEmployee, name: e.target.value}) : setNewEmp({...newEmp, name: e.target.value})} /></div>
                   <div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-400">NRIC / IC</label><input required className="w-full border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-2xl p-4 font-bold" value={editingEmployee?.nric || newEmp.nric} onChange={e => editingEmployee ? setEditingEmployee({...editingEmployee, nric: e.target.value}) : setNewEmp({...newEmp, nric: e.target.value})} /></div>
                   
                   <div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-400">Assign Password</label><input className="w-full border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-2xl p-4 font-bold" type="text" placeholder="Default is NRIC" value={editingEmployee?.password || newEmp.password} onChange={e => editingEmployee ? setEditingEmployee({...editingEmployee, password: e.target.value}) : setNewEmp({...newEmp, password: e.target.value})} /></div>

                   <div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-400">Tax Category</label>
                     <select className="w-full border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-2xl p-4 font-bold bg-white dark:bg-slate-800" value={editingEmployee?.maritalStatus || newEmp.maritalStatus} onChange={e => editingEmployee ? setEditingEmployee({...editingEmployee, maritalStatus: e.target.value as any}) : setNewEmp({...newEmp, maritalStatus: e.target.value as any})}>
                        <option value="SINGLE">Single / Widow / Widower</option>
                        <option value="MARRIED_SPOUSE_WORKING">Married (Spouse Working)</option>
                        <option value="MARRIED_SPOUSE_NOT_WORKING">Married (Spouse Not Working)</option>
                     </select>
                   </div>
                   <div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-400">No. of Children</label><input type="number" className="w-full border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-2xl p-4 font-bold" value={editingEmployee?.children || newEmp.children} onChange={e => editingEmployee ? setEditingEmployee({...editingEmployee, children: parseInt(e.target.value) || 0}) : setNewEmp({...newEmp, children: parseInt(e.target.value) || 0})} /></div>

                   <div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-400">Status</label>
                     <select className="w-full border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-2xl p-4 font-bold bg-white dark:bg-slate-800" value={editingEmployee?.status || newEmp.status} onChange={e => {
                         const val = e.target.value as 'ACTIVE' | 'RESIGNED';
                         const today = new Date().toISOString().split('T')[0];
                         if (editingEmployee) {
                             setEditingEmployee({
                                 ...editingEmployee, 
                                 status: val,
                                 resignationDate: val === 'RESIGNED' && !editingEmployee.resignationDate ? today : editingEmployee.resignationDate
                             });
                         } else {
                             setNewEmp({
                                 ...newEmp, 
                                 status: val,
                                 resignationDate: val === 'RESIGNED' && !newEmp.resignationDate ? today : newEmp.resignationDate
                             });
                         }
                     }}>
                        <option value="ACTIVE">Active</option>
                        <option value="RESIGNED">Resigned</option>
                     </select>
                   </div>

                   {(editingEmployee?.status === 'RESIGNED' || newEmp.status === 'RESIGNED') && (
                     <div className="space-y-2 animate-fade-in"><label className="text-[10px] font-black uppercase text-slate-400 text-rose-500 tracking-widest ml-1">Resignation Date</label><input type="date" required className="w-full border-2 border-rose-100 dark:border-rose-900/50 rounded-2xl p-4 font-bold text-rose-600 dark:bg-slate-800 dark:text-rose-400" value={editingEmployee?.resignationDate || newEmp.resignationDate || ''} onChange={e => editingEmployee ? setEditingEmployee({...editingEmployee, resignationDate: e.target.value}) : setNewEmp({...newEmp, resignationDate: e.target.value})} /></div>
                   )}

                   <div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-400">EPF No.</label><input required className="w-full border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-2xl p-4 font-bold" value={editingEmployee?.epfNumber || newEmp.epfNumber} onChange={e => editingEmployee ? setEditingEmployee({...editingEmployee, epfNumber: e.target.value}) : setNewEmp({...newEmp, epfNumber: e.target.value})} /></div>
                   <div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-400">Bank Account No.</label><input required className="w-full border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-2xl p-4 font-bold" value={editingEmployee?.bankAccountNumber || newEmp.bankAccountNumber} onChange={e => editingEmployee ? setEditingEmployee({...editingEmployee, bankAccountNumber: e.target.value}) : setNewEmp({...newEmp, bankAccountNumber: e.target.value})} /></div>
                   <div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-400">Position</label><input required className="w-full border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-2xl p-4 font-bold" value={editingEmployee?.position || newEmp.position} onChange={e => editingEmployee ? setEditingEmployee({...editingEmployee, position: e.target.value}) : setNewEmp({...newEmp, position: e.target.value})} /></div>
                   <div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-400">Basic Salary (RM)</label><input required type="number" className="w-full border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-2xl p-4 font-black" value={editingEmployee?.basicSalary || newEmp.basicSalary} onChange={e => editingEmployee ? setEditingEmployee({...editingEmployee, basicSalary: parseFloat(e.target.value) || 0}) : setNewEmp({...newEmp, basicSalary: parseFloat(e.target.value) || 0})} /></div>
                </div>

                <div className="pt-8 border-t border-slate-100 dark:border-slate-800">
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-6">Annual Leave Entitlement</h4>
                  <div className="grid grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Annual</label>
                      <input type="number" className="w-full border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl p-3 font-bold text-center" value={editingEmployee?.leaveBalance.annual || newEmp.leaveBalance?.annual} onChange={e => {
                        const val = parseInt(e.target.value) || 0;
                        editingEmployee ? setEditingEmployee({...editingEmployee, leaveBalance: {...editingEmployee.leaveBalance, annual: val}}) : setNewEmp({...newEmp, leaveBalance: {...newEmp.leaveBalance!, annual: val}});
                      }} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Sick</label>
                      <input type="number" className="w-full border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl p-3 font-bold text-center" value={editingEmployee?.leaveBalance.sick || newEmp.leaveBalance?.sick} onChange={e => {
                        const val = parseInt(e.target.value) || 0;
                        editingEmployee ? setEditingEmployee({...editingEmployee, leaveBalance: {...editingEmployee.leaveBalance, sick: val}}) : setNewEmp({...newEmp, leaveBalance: {...newEmp.leaveBalance!, sick: val}});
                      }} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Emergency</label>
                      <input type="number" className="w-full border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl p-3 font-bold text-center" value={editingEmployee?.leaveBalance.emergency || newEmp.leaveBalance?.emergency} onChange={e => {
                        const val = parseInt(e.target.value) || 0;
                        editingEmployee ? setEditingEmployee({...editingEmployee, leaveBalance: {...editingEmployee.leaveBalance, emergency: val}}) : setNewEmp({...newEmp, leaveBalance: {...newEmp.leaveBalance!, emergency: val}});
                      }} />
                    </div>
                  </div>
                </div>

                <button type="submit" className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black uppercase shadow-xl hover:bg-indigo-700 transition-all">{editingEmployee ? 'Save Changes' : 'Confirm Registration'}</button>
             </form>
          </div>
        </div>
      )}

      {selectedEmployeeProfile && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[9999] flex items-center justify-center p-6">
          <div className="bg-white dark:bg-slate-900 rounded-[40px] w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl p-10 animate-fade-in relative custom-scrollbar">
            <button type="button" onClick={() => setSelectedEmployeeProfile(null)} className="absolute top-8 right-8 text-slate-400"><X size={28}/></button>
            <div className="text-center space-y-4 mb-10">
              <div className="h-24 w-24 bg-indigo-100 rounded-3xl flex items-center justify-center text-indigo-600 mx-auto"><User size={48} /></div>
              <h2 className="text-3xl font-black text-slate-800 dark:text-white">{selectedEmployeeProfile.name}</h2>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">{selectedEmployeeProfile.position} • {selectedEmployeeProfile.status}</p>
            </div>
            
            <div className="grid grid-cols-2 gap-6 bg-slate-50 dark:bg-slate-800 p-8 rounded-3xl border border-slate-100 dark:border-slate-700 mb-8">
              <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">NRIC</p><p className="font-bold dark:text-white">{selectedEmployeeProfile.nric}</p></div>
              <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Calculated Age</p><p className="font-bold dark:text-white">{calculateAge(selectedEmployeeProfile.nric)} Years</p></div>
              <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">EPF No.</p><p className="font-bold dark:text-white">{selectedEmployeeProfile.epfNumber}</p></div>
              <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bank Account</p><p className="font-bold dark:text-white">{selectedEmployeeProfile.bankAccountNumber}</p></div>
              <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Join Date</p><p className="font-bold dark:text-white">{selectedEmployeeProfile.joinDate}</p></div>
              <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Basic Salary</p><p className="font-black text-indigo-600 dark:text-indigo-400">{formatCurrency(selectedEmployeeProfile.basicSalary)}</p></div>
              {selectedEmployeeProfile.status === 'RESIGNED' && (
                <div className="col-span-2"><p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Resignation Date</p><p className="font-black text-rose-600">{selectedEmployeeProfile.resignationDate || 'N/A'}</p></div>
              )}
            </div>

            <div className="space-y-4 mb-8">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Salary History Log</h4>
              <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 rounded-2xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-[9px] uppercase font-black text-slate-400">
                    <tr><th className="p-4">Date</th><th className="p-4">Reason</th><th className="p-4 text-right">Amount</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm font-bold text-slate-600 dark:text-slate-300">
                    {selectedEmployeeProfile.salaryHistory.map((h, i) => (
                      <tr key={i}>
                        <td className="p-4">{new Date(h.date).toLocaleDateString()}</td>
                        <td className="p-4">{h.reason}</td>
                        <td className="p-4 text-right text-indigo-600 dark:text-indigo-400">{formatCurrency(h.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Documents</h4>
                <label className="cursor-pointer bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1 rounded-lg text-[10px] font-black uppercase flex items-center gap-2">
                  <Upload size={12}/> Upload File
                  <input type="file" hidden onChange={handleProfileFileUpload} />
                </label>
              </div>
              <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 rounded-2xl overflow-hidden">
                {selectedEmployeeProfile.documents.length === 0 ? (
                  <p className="p-6 text-center text-slate-400 text-sm italic">No documents uploaded.</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedEmployeeProfile.documents.map(doc => (
                      <div key={doc.id} className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg flex items-center justify-center"><FileText size={16}/></div>
                          <div><p className="text-sm font-bold text-slate-700 dark:text-white">{doc.name}</p><p className="text-[9px] font-bold text-slate-400">{doc.uploadDate}</p></div>
                        </div>
                        <div className="flex gap-2">
                          {doc.driveLink ? (
                             <a href={doc.driveLink} target="_blank" rel="noopener noreferrer" className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors flex items-center gap-1"><HardDrive size={16}/></a>
                          ) : (
                             doc.fileData && <a href={doc.fileData} target="_blank" rel="noopener noreferrer" className="p-2 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"><Eye size={16}/></a>
                          )}
                          
                          {doc.fileData && !doc.driveLink && (
                            <a href={doc.fileData} download={doc.name} className="p-2 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"><Download size={16}/></a>
                          )}
                          <button type="button" onClick={() => handleDeleteDocument(doc.id)} className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"><Trash size={16}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showProcessModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[9999] flex items-center justify-center p-6">
          <div className="bg-white dark:bg-slate-900 rounded-[40px] w-full max-w-7xl max-h-[85vh] overflow-y-auto shadow-2xl p-10 custom-scrollbar animate-fade-in text-slate-900 dark:text-white">
             <div className="flex justify-between items-center mb-10 sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm pb-6 z-10">
                <h2 className="text-3xl font-black text-slate-800 dark:text-white">Process Monthly Payroll</h2>
                <button type="button" onClick={() => setShowProcessModal(false)}><X size={32}/></button>
             </div>
             <div className="space-y-8">
               <div className="flex gap-4 p-6 bg-slate-50 dark:bg-slate-800 rounded-3xl">
                  <select className="flex-1 p-4 border-2 border-white dark:border-slate-700 bg-white dark:bg-slate-900 rounded-2xl font-black" value={processMonth} onChange={e => setProcessMonth(parseInt(e.target.value))}>{[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>)}</select>
                  <select className="flex-1 p-4 border-2 border-white dark:border-slate-700 bg-white dark:bg-slate-900 rounded-2xl font-black" value={processYear} onChange={e => setProcessYear(parseInt(e.target.value))}>{settings.supportedYears.map(y => <option key={y} value={y}>{y}</option>)}</select>
               </div>
               <div className="space-y-4">
                  {employees.filter(e => e.status === 'ACTIVE').map(emp => {
                    const daysInSelectedMonth = getDaysInMonth(processMonth, processYear);
                    return (
                      <div key={emp.id} className="grid grid-cols-8 gap-4 p-6 bg-slate-50 dark:bg-slate-800 rounded-2xl items-center border border-slate-100 dark:border-slate-700">
                          <div className="font-black col-span-8 md:col-span-1">{emp.name}</div>
                          <div className="space-y-1"><label className="text-[9px] font-black uppercase text-slate-400">Days Worked</label><input type="number" step="0.5" className="w-full p-3 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-600 dark:bg-slate-700" placeholder={daysInSelectedMonth.toString()} onChange={(e) => setPayrollInputs(prev => ({ ...prev, [emp.id]: { ...(prev[emp.id] || { allowance: 0, bonus: 0, overtime: 0, otherDeductions: 0, pcb: 0, unpaidDays: 0 }), daysWorked: parseFloat(e.target.value) || daysInSelectedMonth } }))} /></div>
                          <div className="space-y-1"><label className="text-[9px] font-black uppercase text-slate-400">Bonus RM</label><input type="number" className="w-full p-3 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-600 dark:bg-slate-700" onChange={(e) => setPayrollInputs(prev => ({ ...prev, [emp.id]: { ...(prev[emp.id] || { allowance: 0, overtime: 0, otherDeductions: 0, pcb: 0, daysWorked: daysInSelectedMonth, unpaidDays: 0 }), bonus: parseFloat(e.target.value) || 0 } }))} /></div>
                          <div className="space-y-1"><label className="text-[9px] font-black uppercase text-slate-400">Allowance RM</label><input type="number" className="w-full p-3 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-600 dark:bg-slate-700" onChange={(e) => setPayrollInputs(prev => ({ ...prev, [emp.id]: { ...(prev[emp.id] || { bonus: 0, overtime: 0, otherDeductions: 0, pcb: 0, daysWorked: daysInSelectedMonth, unpaidDays: 0 }), allowance: parseFloat(e.target.value) || 0 } }))} /></div>
                          <div className="space-y-1"><label className="text-[9px] font-black uppercase text-slate-400">Overtime RM</label><input type="number" className="w-full p-3 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-600 dark:bg-slate-700" onChange={(e) => setPayrollInputs(prev => ({ ...prev, [emp.id]: { ...(prev[emp.id] || { allowance: 0, bonus: 0, otherDeductions: 0, pcb: 0, daysWorked: daysInSelectedMonth, unpaidDays: 0 }), overtime: parseFloat(e.target.value) || 0 } }))} /></div>
                          <div className="space-y-1"><label className="text-[9px] font-black uppercase text-slate-400">Unpaid Days</label><input type="number" step="0.5" className="w-full p-3 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-600 dark:bg-slate-700" onChange={(e) => setPayrollInputs(prev => ({ ...prev, [emp.id]: { ...(prev[emp.id] || { overtime: 0, bonus: 0, otherDeductions: 0, pcb: 0, daysWorked: daysInSelectedMonth, allowance: 0 }), unpaidDays: parseFloat(e.target.value) || 0 } }))} /></div>
                          <div className="space-y-1"><label className="text-[9px] font-black uppercase text-slate-400">Other Deduct.</label><input type="number" className="w-full p-3 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-600 dark:bg-slate-700" onChange={(e) => setPayrollInputs(prev => ({ ...prev, [emp.id]: { ...(prev[emp.id] || { allowance: 0, bonus: 0, overtime: 0, pcb: 0, daysWorked: daysInSelectedMonth, unpaidDays: 0 }), otherDeductions: parseFloat(e.target.value) || 0 } }))} /></div>
                          <div className="space-y-1"><label className="text-[9px] font-black uppercase text-slate-400">PCB (MTD) RM</label><input type="number" className="w-full p-3 rounded-xl text-sm font-bold border border-slate-200 dark:border-slate-600 dark:bg-slate-700" onChange={(e) => setPayrollInputs(prev => ({ ...prev, [emp.id]: { ...(prev[emp.id] || { allowance: 0, bonus: 0, overtime: 0, otherDeductions: 0, daysWorked: daysInSelectedMonth, unpaidDays: 0 }), pcb: parseFloat(e.target.value) || 0 } }))} /></div>
                      </div>
                    );
                  })}
               </div>
               <button type="button" onClick={handleProcessPayroll} className="w-full bg-indigo-600 text-white py-6 rounded-2xl font-black uppercase shadow-2xl hover:bg-indigo-700 transition-all">Confirm & Generate Batch</button>
             </div>
          </div>
        </div>
      )}

      {selectedPayslip && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[9999] flex items-center justify-center p-4 md:p-6">
           <div className="bg-white rounded-[40px] w-full max-w-5xl shadow-2xl overflow-hidden print:shadow-none animate-fade-in relative h-full md:h-auto max-h-[90vh] flex flex-col">
              <div className="p-6 md:p-8 border-b flex justify-between items-center bg-white z-20 shrink-0">
                 <h3 className="font-black text-xl text-slate-900">Pay Advice</h3>
                 <div className="flex gap-3">
                    <button type="button" onClick={() => window.print()} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-indigo-700 transition-all"><Printer size={20}/> <span className="hidden md:inline">Print</span></button>
                    <button type="button" onClick={() => setSelectedPayslip(null)} className="p-3 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors border border-slate-200"><X size={24} className="text-slate-600"/></button>
                 </div>
              </div>

              <div className="p-6 md:p-16 space-y-8 bg-white print:p-0 overflow-y-auto custom-scrollbar flex-1" id="payslip-to-print">
                 <div className="flex flex-col md:flex-row justify-between items-start border-b-2 border-slate-900 pb-8 gap-6">
                    <div className="flex gap-6 items-start">
                       {settings.companyLogo && (
                         <div className="h-24 w-24 shrink-0 bg-white rounded-xl border border-slate-100 flex items-center justify-center p-2">
                           <img src={settings.companyLogo} alt="Logo" className="max-h-full max-w-full object-contain" />
                         </div>
                       )}
                       <div>
                          <h1 className="text-2xl md:text-3xl font-black text-slate-900 uppercase">{settings.companyName}</h1>
                          <p className="text-sm font-bold text-slate-500 mt-1">{settings.registrationNumber}</p>
                          <p className="text-sm font-medium text-slate-500 max-w-sm mt-2 whitespace-pre-line">{settings.address}</p>
                       </div>
                    </div>
                    <div className="text-left md:text-right w-full md:w-auto">
                       <h2 className="text-4xl font-black uppercase tracking-tighter text-slate-900">PAYSLIP</h2>
                       <p className="text-indigo-600 font-black text-lg uppercase mt-2">{new Date(selectedPayslip.year, selectedPayslip.month-1).toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
                       <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest border-t pt-2 border-slate-100">
                         Pay Period: {getOrdinal(1)} {new Date(selectedPayslip.year, selectedPayslip.month-1).toLocaleString('default', { month: 'short' })} {selectedPayslip.year} - {getOrdinal(Math.max(1, Math.floor(selectedPayslip.workingDays)))} {new Date(selectedPayslip.year, selectedPayslip.month-1).toLocaleString('default', { month: 'short' })} {selectedPayslip.year}
                       </p>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 py-6 border-b border-slate-200">
                    <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Employee Name</p><p className="font-bold text-slate-900 text-lg uppercase">{employees.find(e => e.id === selectedPayslip.employeeId)?.name}</p></div>
                    <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">NRIC</p><p className="font-bold text-slate-900 text-lg">{employees.find(e => e.id === selectedPayslip.employeeId)?.nric}</p></div>
                    <div className="md:text-right"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Position</p><p className="font-bold text-slate-900 text-lg">{employees.find(e => e.id === selectedPayslip.employeeId)?.position}</p></div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div className="space-y-12">
                       <div className="space-y-4">
                          <h4 className="font-black text-slate-900 uppercase tracking-widest border-b pb-2 mb-4">Earnings</h4>
                          <div className="flex justify-between font-bold text-slate-600"><span>Basic Salary</span><span>{formatCurrency(selectedPayslip.basicSalary)}</span></div>
                          <div className="flex justify-between font-bold text-slate-600"><span>Bonus</span><span>{formatCurrency(selectedPayslip.bonus)}</span></div>
                          <div className="flex justify-between font-bold text-slate-600"><span>Allowance</span><span>{formatCurrency(selectedPayslip.allowance)}</span></div>
                          <div className="flex justify-between font-bold text-slate-600"><span>Overtime / Extra</span><span>{formatCurrency(selectedPayslip.overtime)}</span></div>
                          <div className="border-t pt-4 flex justify-between font-black text-slate-800"><span>Total Gross Pay</span><span>{formatCurrency(selectedPayslip.grossSalary)}</span></div>
                       </div>
                       <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
                          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest border-b pb-2">Employer Statutory Contributions</p>
                          <div className="flex justify-between text-sm font-bold text-slate-600"><span>EPF (Employer)</span><span>{formatCurrency(selectedPayslip.epfEmployer)}</span></div>
                          <div className="flex justify-between text-sm font-bold text-slate-600"><span>SOCSO (Employer)</span><span>{formatCurrency(selectedPayslip.socsoEmployer)}</span></div>
                          <div className="flex justify-between text-sm font-bold text-slate-600"><span>EIS (Employer)</span><span>{formatCurrency(selectedPayslip.eisEmployer)}</span></div>
                       </div>
                    </div>
                    <div className="space-y-12">
                       <div className="space-y-4">
                          <h4 className="font-black text-slate-900 uppercase tracking-widest border-b pb-2 mb-4">Deductions</h4>
                          <div className="flex justify-between font-bold text-rose-600"><span>EPF (Employee)</span><span>-{formatCurrency(selectedPayslip.epfEmployee)}</span></div>
                          <div className="flex justify-between font-bold text-rose-600"><span>SOCSO (Employee)</span><span>-{formatCurrency(selectedPayslip.socsoEmployee)}</span></div>
                          <div className="flex justify-between font-bold text-rose-600"><span>EIS (Employee)</span><span>-{formatCurrency(selectedPayslip.eisEmployee)}</span></div>
                          <div className="flex justify-between font-bold text-rose-600"><span>PCB (Tax)</span><span>-{formatCurrency(selectedPayslip.pcb)}</span></div>
                          <div className="flex justify-between font-bold text-rose-600"><span>Unpaid Leave</span><span>-{formatCurrency(selectedPayslip.unpaidLeaveDeduction)}</span></div>
                       </div>
                       <div className="border-t-4 border-indigo-600 pt-8 flex flex-col items-end gap-2">
                          <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Total Net Pay</p>
                          <h2 className="text-5xl font-black text-indigo-700 tracking-tighter">{formatCurrency(selectedPayslip.netSalary)}</h2>
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {showAddLeaveModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[9999] flex items-center justify-center p-6"><div className="bg-white dark:bg-slate-900 rounded-[40px] w-full max-w-xl p-10 shadow-2xl animate-fade-in"><div className="flex justify-between items-center mb-8"><h2 className="text-2xl font-black text-slate-800 dark:text-white">Apply Leave</h2><button type="button" onClick={() => setShowAddLeaveModal(false)} className="dark:text-white"><X/></button></div><form onSubmit={handleAddLeave} className="space-y-6">{currentUser.role === 'SUPER_ADMIN' && <select name="employeeId" className="w-full border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-2xl p-4 font-bold bg-white dark:bg-slate-800" required>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>}<select name="type" className="w-full border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-2xl p-4 font-bold bg-white dark:bg-slate-800"><option value={LeaveType.ANNUAL}>Annual</option><option value={LeaveType.SICK}>Sick</option><option value={LeaveType.EMERGENCY}>Emergency</option></select><div className="grid grid-cols-2 gap-4"><div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-900 dark:text-white ml-1">Start Date</label><input name="startDate" type="date" className="w-full p-4 border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-2xl font-bold bg-white dark:bg-slate-800" required /></div><div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-900 dark:text-white ml-1">End Date</label><input name="endDate" type="date" className="w-full p-4 border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-2xl font-bold bg-white dark:bg-slate-800" required /></div></div><input name="days" type="number" step="0.5" placeholder="Total Days" className="w-full border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-2xl p-4 font-bold bg-white dark:bg-slate-800" required /><textarea name="reason" placeholder="Reason" className="w-full border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-2xl p-4 font-bold h-32 bg-white dark:bg-slate-800" required /><button type="submit" className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black shadow-xl">Submit Application</button></form></div></div>
      )}

      {showAddClaimModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[9999] flex items-center justify-center p-6">
          <div className="bg-white dark:bg-slate-900 rounded-[40px] w-full max-w-lg p-10 shadow-2xl animate-fade-in">
            <div className="flex justify-between items-center mb-8"><h2 className="text-2xl font-black text-slate-800 dark:text-white">Submit Reimbursement</h2><button type="button" onClick={() => setShowAddClaimModal(false)} className="dark:text-white"><X/></button></div>
            <form onSubmit={handleAddClaim} className="space-y-6">
              {currentUser.role === 'SUPER_ADMIN' && <select name="employeeId" className="w-full border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-2xl p-4 font-bold bg-white dark:bg-slate-800" required>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>}
              <input required type="number" step="0.01" placeholder="Amount RM" className="w-full border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-2xl p-4 font-black text-2xl bg-white dark:bg-slate-800" value={newClaim.amount || ''} onChange={e => setNewClaim({...newClaim, amount: parseFloat(e.target.value) || 0})} />
              <textarea required placeholder="Description" className="w-full border-2 border-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-2xl p-4 font-bold h-32 bg-white dark:bg-slate-800" value={newClaim.description} onChange={e => setNewClaim({...newClaim, description: e.target.value})} />
              
              <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-6 text-center">
                <input type="file" id="claim-receipt" className="hidden" accept="image/*,.pdf" onChange={handleClaimFileUpload} />
                <label htmlFor="claim-receipt" className="cursor-pointer block">
                   <div className="h-12 w-12 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-2"><Upload size={20}/></div>
                   <p className="font-bold text-sm text-slate-500 dark:text-slate-400">{newClaim.attachmentName ? newClaim.attachmentName : "Upload Receipt / Proof"}</p>
                </label>
              </div>

              <button type="submit" className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black shadow-xl">Confirm Submission</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
