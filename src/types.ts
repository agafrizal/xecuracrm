import { Timestamp } from 'firebase/firestore';

export type DealStage = 'L0-closed-lost' | 'L1-prospecting' | 'L2-proposal' | 'L3-show-interest' | 'L4-negotiation' | 'L5-closed-won';
export type TaskStatus = 'pending' | 'completed';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: 'admin' | 'manager' | 'sales' | 'super_user' | 'finance' | 'procurement' | 'project_manager' | 'engineer';
  createdAt: Timestamp;
  notificationSettings?: {
    emailNotifications: boolean;
    taskReminders: boolean;
    newLeadAlerts: boolean;
  };
}

export type CompanyCategory = 'Single' | 'Group/Holding';

export interface Company {
  id: string;
  name: string;
  category?: CompanyCategory;
  groupCompanyIds?: string[];
  industry?: string;
  website?: string;
  address?: string;
  ownerId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type DefaultContactTag = 'Client' | 'Potential Client' | 'Internal';
export const DEFAULT_CONTACT_TAGS: DefaultContactTag[] = ['Client', 'Potential Client', 'Internal'];

export interface Contact {
  id: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  companyId?: string;
  tags?: string[];
  ownerId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ProposalStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';
export type ProposalRequirementType = 'commercial_only' | 'commercial_and_technical';

export interface DealProductSolution {
  id: string;
  category: string;
  brand: string;
  productType?: string;
}

export interface Deal {
  id: string;
  title: string;
  value: number;
  stage: DealStage;
  stageUpdatedAt: Timestamp;
  companyId?: string;
  contactId?: string;
  ownerId: string;
  expectedCloseDate?: string;
  expectedCloseQuarter?: string;
  potentialGrossProfit?: number;
  opportunityType?: 'Renewal' | 'New';
  productCategory?: string;
  productBrand?: string;
  productType?: string;
  productSolutions?: DealProductSolution[];
  poDocumentUrl?: string;
  poDocumentName?: string;
  proposalType?: ProposalRequirementType;
  technicalProposalUrl?: string;
  technicalProposalName?: string;
  commercialProposalUrl?: string;
  commercialProposalName?: string;
  proposalStatus?: ProposalStatus;
  proposalSubmittedAt?: Timestamp;
  proposalApprovedAt?: Timestamp;
  proposalApprovedBy?: string;
  proposalApproverName?: string;
  proposalRejectionReason?: string;
  proposalSentToCustomer?: boolean;
  proposalSentAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate?: Timestamp;
  status: TaskStatus;
  ownerId: string;
  relatedTo?: {
    type: 'contact' | 'deal' | 'company';
    id: string;
  };
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export type InteractionKind = 'Email' | 'Call' | 'Meeting' | 'Notes';

export interface Interaction {
  id: string;
  kind: InteractionKind;
  date: Timestamp;
  companyId: string;
  contactId: string;
  dealId?: string;
  subject: string;
  description: string;
  highlights?: string;
  findings?: string;
  ownerId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type POStatus = 'draft' | 'approved';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  title: string;
  companyId: string;
  contactId?: string;
  dealId?: string;
  amount: number;
  status: POStatus;
  issueDate: Timestamp;
  startDate?: Timestamp;
  endDate?: Timestamp;
  ownerId: string;
  poUrl?: string;
  poName?: string;
  bastUrl?: string;
  bastName?: string;
  msaUrl?: string;
  msaName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DigitalSignatureInfo {
  signedBy: string;
  signerRole: string;
  signerEmail?: string;
  signedAt: string;
  signatureId: string;
  provider: string;
  verificationUrl?: string;
  certificateHash?: string;
  status: 'PENDING' | 'SIGNED' | 'VERIFIED' | 'REJECTED';
  signatureImage?: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  title: string;
  companyId: string;
  contactId?: string;
  dealId?: string;
  poId?: string;
  amount: number;
  items?: InvoiceItem[];
  status: InvoiceStatus;
  issueDate: Timestamp;
  dueDate: Timestamp;
  ownerId: string;
  signatureInfo?: DigitalSignatureInfo;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SystemLog {
  id: string;
  event: string;
  userEmail: string;
  userId: string;
  details?: string;
  createdAt: Timestamp;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  read: boolean;
  relatedId?: string;
  relatedType?: 'invoice' | 'deal' | 'task';
  createdAt: Timestamp;
}

export type ImplementationStatus = 'Draft' | 'Scheduled' | 'In Progress' | 'On Hold' | 'Completed' | 'Cancelled';

export type ImplementorType = 'Internal' | 'Distributor' | 'Other';

export interface ImplementationInteractionLog {
  id: string;
  date: string;
  note: string;
  createdAt?: string;
  createdBy?: string;
}

export interface ImplementationPlan {
  id: string;
  dealId: string;
  poId?: string;
  companyId?: string;
  contactId?: string;
  title: string;
  value: number;
  status: ImplementationStatus;
  durationWeeks?: number;
  proposedDurationWeeks?: number;
  actualDurationWeeks?: number;
  startDate?: Timestamp;
  targetEndDate?: Timestamp;
  notes?: string;
  implementor?: ImplementorType;
  interactions?: ImplementationInteractionLog[];
  bastUrl?: string;
  bastName?: string;
  ownerId: string;
  assignedPmId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type PocStatus = 'Pending' | 'Required' | 'Not Required';

export interface PocRecord {
  id: string;
  dealId: string;
  companyId?: string;
  contactId?: string;
  title: string;
  value: number;
  status: PocStatus;
  durationWeeks?: number;
  startDate?: Timestamp;
  targetEndDate?: Timestamp;
  notes?: string;
  interactions?: ImplementationInteractionLog[];
  ownerId: string;
  updatedBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

