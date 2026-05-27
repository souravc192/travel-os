// ============================================================
// Travel OS — Shared Types Package
// Single source of truth for all TypeScript interfaces
// Used by both apps/web and apps/api
// ============================================================

// ─── Enums ───────────────────────────────────────────────────

export enum UserRole {
  OWNER       = 'OWNER',       // Single portal owner (was SUPER_ADMIN)
  ADMIN       = 'ADMIN',       // Privileged operator (was FINANCE_ADMIN)
  TRAVEL_TEAM = 'TRAVEL_TEAM', // Internal travel ops (was TRAVEL_DESK)
  HOD         = 'HOD',         // Department head / approver (was L1/L2_APPROVER)
  USER        = 'USER',        // Standard signed-in employee (was EMPLOYEE)
}

// ─── Phase 3 — Travel Request enums ──────────────────────────
export enum UrgencyLevel {
  NORMAL = 'NORMAL', // After 3 days
  URGENT = 'URGENT', // Within 3 days
}

export enum RequestFor {
  PW_MEMBER  = 'PW_MEMBER',
  STUDENT    = 'STUDENT',
  GUEST      = 'GUEST',
  NEW_MEMBER = 'NEW_MEMBER',
  EVENT      = 'EVENT',
}

export enum RequestKind {
  NEW_REQUEST = 'NEW_REQUEST',
  EXTENSION   = 'EXTENSION',
}

export enum ReservationKind {
  TRAVEL          = 'TRAVEL',
  STAY            = 'STAY',
  TRAVEL_AND_STAY = 'TRAVEL_AND_STAY',
}

export enum TravelRequestStatus {
  AUTO_APPROVED = 'AUTO_APPROVED',
  PENDING_L1    = 'PENDING_L1',
  PENDING_L2    = 'PENDING_L2',
  PENDING_L3    = 'PENDING_L3',
  APPROVED      = 'APPROVED',
  REJECTED      = 'REJECTED',
  CANCELLED     = 'CANCELLED',
}

export const REASON_OF_TRAVEL_OPTIONS = [
  'Sudden planning','Immediate requirement','Urgent booking','Urgent travel','Business priority',
  'Event execution','Launch event','Batch launch','Category launch','Seminar','Workshop',
  'Shoot plan','Celebrations','Foundation day events','Exam centre visit','Board exam activities',
  'Result activities','Student meet-up','Paper analysis','Topper visits','Student interview',
  'Counselling issues','JEE-related travel','NEET-related travel','VP / centre visit',
  'Site readiness','Infra setup','Studio setup','Classroom setup','Safety audit',
  'On-ground execution','Client meetings','Government office visits','Vendor meets','Partner meetings',
  'Sales visits','New joining','Immediate joining','Faculty onboarding','Training','Recruitment',
  'Manpower requirement','Previous request expired','MMT technical issue','Hotel out of policy',
  'Sold-out hotels','Rebookings','Cancellations','Wrong approver','Form expired','Hotel extension',
  'Need room after 3 days','Stay extension','Hotel not available in MMT','Location mismatch',
  'Emergency extension','Audit visits','Internal audit','SOP adherence check','PS audit',
  'Investigation visits','YouTube shoot','Podcast recording','Camera crew requirements',
  'Marketing events','Transfer mail received','Relocation to another city','Emergency relocation',
  'Return to base location','Others',
] as const;

export type ReasonOfTravel = (typeof REASON_OF_TRAVEL_OPTIONS)[number];

// ─── Phase 4 — Booking enums ─────────────────────────────────
export enum BookingType {
  FLIGHT = 'FLIGHT',
  TRAIN  = 'TRAIN',
  BUS    = 'BUS',
  CAB    = 'CAB',
  HOTEL  = 'HOTEL',
  OTHER  = 'OTHER',
}

export enum BookingStatus {
  PENDING     = 'PENDING',
  CONFIRMED   = 'CONFIRMED',
  CANCELLED   = 'CANCELLED',
  RESCHEDULED = 'RESCHEDULED',
}

export interface BookingRow {
  id: string;
  travelRequestId: string;
  bookingType: BookingType;
  bookingStatus: BookingStatus;
  vendorName: string;
  amount: number;
  currency: string;
  bookingReference: string | null;
  bookingDate: string;
  departureAt: string | null;
  returnAt: string | null;
  checkInDate: string | null;
  checkOutDate: string | null;
  invoicePath: string | null;
  invoiceOriginalFilename: string | null;
  invoiceUploadedAt: string | null;
  notes: string | null;
  cancellationFee: number;
  cancelledAt: string | null;
  cancellationReason: string | null;
  consumedAmount: number;
  createdAt: string;
  updatedAt: string;
}

export enum GradeLevel {
  L1 = 'L1', // Junior
  L2 = 'L2',
  L3 = 'L3',
  L4 = 'L4',
  L5 = 'L5', // Senior / Executive
}

export enum TripStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  L1_PENDING = 'L1_PENDING',
  L1_APPROVED = 'L1_APPROVED',
  L1_REJECTED = 'L1_REJECTED',
  L2_PENDING = 'L2_PENDING',
  L2_APPROVED = 'L2_APPROVED',
  L2_REJECTED = 'L2_REJECTED',
  DESK_PENDING = 'DESK_PENDING',
  DESK_APPROVED = 'DESK_APPROVED',
  DESK_REJECTED = 'DESK_REJECTED',
  BOOKED = 'BOOKED',
  IN_TRANSIT = 'IN_TRANSIT',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  CLOSED = 'CLOSED',
}

export enum TravelMode {
  FLIGHT = 'FLIGHT',
  TRAIN = 'TRAIN',
  BUS = 'BUS',
  CAB = 'CAB',
  SELF_DRIVE = 'SELF_DRIVE',
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SENT_BACK = 'SENT_BACK',
  ESCALATED = 'ESCALATED',
}

export enum ExceptionType {
  EMERGENCY_TRAVEL = 'EMERGENCY_TRAVEL',
  BUSINESS_CRITICAL = 'BUSINESS_CRITICAL',
  CLIENT_REQUIREMENT = 'CLIENT_REQUIREMENT',
  LATE_BOOKING = 'LATE_BOOKING',
  COST_OVERRUN = 'COST_OVERRUN',
  MODE_UPGRADE = 'MODE_UPGRADE',
  BUDGET_OVERRIDE = 'BUDGET_OVERRIDE',
}

export enum InvoiceStatus {
  UPLOADED = 'UPLOADED',
  PENDING_VALIDATION = 'PENDING_VALIDATION',
  VALIDATED = 'VALIDATED',
  REJECTED = 'REJECTED',
  GST_MISMATCH = 'GST_MISMATCH',
  DUPLICATE = 'DUPLICATE',
}

export enum VendorType {
  AIRLINE = 'AIRLINE',
  HOTEL = 'HOTEL',
  TRAIN = 'TRAIN',
  BUS = 'BUS',
  CAB = 'CAB',
}

export enum AppTheme {
  CORPORATE_LIGHT = 'corporate-light',
  DEEP_SPACE_DARK = 'deep-space-dark',
  FOREST_PROFESSIONAL = 'forest-professional',
  SUNSET_WARM = 'sunset-warm',
  ARCTIC_BLUE = 'arctic-blue',
}

export enum ERPSyncStatus {
  PENDING = 'PENDING',
  SYNCED = 'SYNCED',
  FAILED = 'FAILED',
}

// ─── Core Entities ───────────────────────────────────────────

export interface Employee {
  id: string;
  userId: string;
  employeeCode: string;
  name: string;
  email: string;
  designation: string;
  department: Department;
  departmentId: string;
  gradeLevel: GradeLevel;
  costCentreId: string;
  costCentre: CostCentre;
  l1ApproverId: string | null;
  l2ApproverId: string | null;
  l1Approver?: Employee;
  l2Approver?: Employee;
  phone: string;
  avatarUrl: string | null;
  isActive: boolean;
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
  employeeId: string | null;
  employee?: Employee;
  theme: AppTheme;
  lastLoginAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  headId: string | null;
  costCentreId: string;
  isActive: boolean;
}

export interface CostCentre {
  id: string;
  code: string;
  name: string;
  departmentId: string;
  budgetMaster?: BudgetMaster;
}

export interface BudgetMaster {
  id: string;
  costCentreId: string;
  fiscalYear: string;
  allocated: number;
  consumed: number;
  remaining: number;
  supplementaryApproved: number;
  lastUpdatedAt: string;
  lastUpdatedBy: string;
}

export interface Trip {
  id: string;
  tripCode: string; // TRP-2024-ENG-00001
  employeeId: string;
  employee?: Employee;
  status: TripStatus;
  travelType: TravelMode;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string | null;
  isRoundTrip: boolean;
  purposeOfTravel: string;
  budgetCap: number;
  actualCost: number | null;
  exceptionTag: ExceptionType | null;
  additionalTravelers: string[];
  stayRequired: boolean;
  stayCheckIn: string | null;
  stayCheckOut: string | null;
  preferredHotelLocality: string | null;
  advanceBookingDays: number;
  policyCompliant: boolean;
  savings: number;
  missedSavings: number;
  createdAt: string;
  updatedAt: string;
  approvals?: Approval[];
  bookings?: Booking[];
}

export interface Approval {
  id: string;
  tripId: string;
  approverId: string;
  approver?: Employee;
  level: 1 | 2 | 3; // 1=L1, 2=L2, 3=TravelDesk
  status: ApprovalStatus;
  comment: string | null;
  conditions: string | null;
  slaDeadline: string;
  resolvedAt: string | null;
  createdAt: string;
}

export interface Booking {
  id: string;
  bookingCode: string;
  tripId: string;
  vendorId: string;
  vendor?: Vendor;
  bookingType: VendorType;
  amount: number;
  savingsVsCheapest: number;
  invoiceUploaded: boolean;
  gstValidated: boolean;
  erpSyncStatus: ERPSyncStatus;
  erpSyncAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export interface Vendor {
  id: string;
  name: string;
  type: VendorType;
  gstNumber: string;
  score: number;
  isActive: boolean;
  rcMaster?: VendorRCMaster[];
}

export interface VendorRCMaster {
  id: string;
  vendorId: string;
  route: string;
  vehicleType: string;
  rate: number;
  validity: string;
  gstNumber: string;
  fileUrl: string | null;
}

export interface VendorScrapedRate {
  id: string;
  source: string;
  travelType: TravelMode;
  origin: string;
  destination: string;
  travelDate: string;
  vendorName: string;
  rate: number;
  cabinClass: string | null;
  roomType: string | null;
  availabilityCount: number | null;
  scrapedAt: string;
  ttlExpiresAt: string;
  tripRequestId: string | null;
  isCheapest: boolean;
  isPolicyCompliant: boolean;
  priceDeltaVsPrev: number | null;
}

export interface Invoice {
  id: string;
  bookingId: string;
  fileUrl: string;
  gstNumber: string;
  amount: number;
  vendorName: string;
  invoiceDate: string;
  status: InvoiceStatus;
  validatedAt: string | null;
  validatorId: string | null;
  rejectionReason: string | null;
  isDuplicate: boolean;
  gstRecoverable: boolean;
  createdAt: string;
}

export interface Exception {
  id: string;
  tripId: string;
  type: ExceptionType;
  reason: string;
  documentUrl: string | null;
  loggedBy: string;
  approvedBy: string | null;
  createdAt: string;
}

export interface Feedback {
  id: string;
  tripId: string;
  vendorId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  issueType: string | null;
  comment: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  ticketId: string;
  resolvedAt: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ip: string;
  userAgent: string;
  timestamp: string;
}

// ─── API Request / Response Types ────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
  employee: Employee | null;
  requiresOnboarding: boolean;
}

export interface RefreshTokenResponse {
  accessToken: string;
}

export interface OnboardingRequest {
  designation: string;
  departmentId: string;
  costCentreId: string;
  phone: string;
  gradeLevel: GradeLevel;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ─── Policy Types ─────────────────────────────────────────────

export interface TravelPolicy {
  gradeLevel: GradeLevel;
  allowedModes: TravelMode[];
  flightClass: 'ECONOMY' | 'BUSINESS' | null;
  hotelBudgetPerNight: number;
  dailyAllowance: number;
  maxAdvanceBookingDays: number;
  requiresL2Approval: boolean;
}

export const TRAVEL_POLICIES: Record<GradeLevel, TravelPolicy> = {
  [GradeLevel.L1]: {
    gradeLevel: GradeLevel.L1,
    allowedModes: [TravelMode.BUS, TravelMode.TRAIN],
    flightClass: null,
    hotelBudgetPerNight: 2000,
    dailyAllowance: 500,
    maxAdvanceBookingDays: 14,
    requiresL2Approval: false,
  },
  [GradeLevel.L2]: {
    gradeLevel: GradeLevel.L2,
    allowedModes: [TravelMode.BUS, TravelMode.TRAIN, TravelMode.CAB],
    flightClass: null,
    hotelBudgetPerNight: 3000,
    dailyAllowance: 800,
    maxAdvanceBookingDays: 14,
    requiresL2Approval: false,
  },
  [GradeLevel.L3]: {
    gradeLevel: GradeLevel.L3,
    allowedModes: [TravelMode.TRAIN, TravelMode.CAB, TravelMode.FLIGHT],
    flightClass: 'ECONOMY',
    hotelBudgetPerNight: 4500,
    dailyAllowance: 1200,
    maxAdvanceBookingDays: 21,
    requiresL2Approval: false,
  },
  [GradeLevel.L4]: {
    gradeLevel: GradeLevel.L4,
    allowedModes: [TravelMode.CAB, TravelMode.FLIGHT, TravelMode.TRAIN],
    flightClass: 'ECONOMY',
    hotelBudgetPerNight: 6000,
    dailyAllowance: 1800,
    maxAdvanceBookingDays: 21,
    requiresL2Approval: true,
  },
  [GradeLevel.L5]: {
    gradeLevel: GradeLevel.L5,
    allowedModes: [TravelMode.FLIGHT, TravelMode.CAB, TravelMode.TRAIN],
    flightClass: 'BUSINESS',
    hotelBudgetPerNight: 10000,
    dailyAllowance: 3000,
    maxAdvanceBookingDays: 30,
    requiresL2Approval: true,
  },
};

// ─── Dashboard KPI Types ──────────────────────────────────────

export interface OrgKPIs {
  totalSpend: number;
  totalSavings: number;
  missedSavings: number;
  exceptionRate: number;
  lateBookingRate: number;
  avgVendorScore: number;
  budgetUtilization: number;
  gstRecovery: number;
  activeTrips: number;
  pendingApprovals: number;
}

export interface SparklinePoint {
  date: string;
  value: number;
}

export interface MetricCard {
  label: string;
  value: number;
  unit: 'currency' | 'percentage' | 'count';
  trend: 'up' | 'down' | 'flat';
  trendValue: number;
  sparkline: SparklinePoint[];
}
