import React, { useState, useEffect } from 'react';
import { Rocket, Calendar, Clock, UserCheck, FileText, CheckCircle2, AlertCircle, Search, Filter, Edit2, Building2, ExternalLink, ShieldAlert, Lock, Check, X, Users, AlertTriangle, Trash2, Plus, MessageSquare, ChevronDown, ChevronUp, List, Upload, File, Loader2, Receipt } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Deal, PurchaseOrder, Company, Contact, UserProfile, ImplementationPlan, ImplementationStatus, ImplementorType, ImplementationInteractionLog, Invoice, InvoiceItem } from '../types';
import { format, addWeeks } from 'date-fns';
import { db, collection, addDoc, updateDoc, deleteDoc, doc, Timestamp, handleFirestoreError, OperationType, logEvent, storage, ref, uploadBytesResumable, getDownloadURL } from '../firebase';
import { currencyService } from '../services/currencyService';
import { generateNextInvoiceNumber } from '../utils/invoiceNumberGenerator';

interface ImplementationPlanProps {
  deals: Deal[];
  purchaseOrders: PurchaseOrder[];
  companies: Company[];
  contacts: Contact[];
  implementationPlans: ImplementationPlan[];
  invoices?: Invoice[];
  users: UserProfile[];
  userId: string;
  userRole?: string;
}

export const ImplementationPlanComponent: React.FC<ImplementationPlanProps> = ({
  deals,
  purchaseOrders,
  companies,
  contacts,
  implementationPlans,
  invoices = [],
  users,
  userId,
  userRole,
}) => {
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingItem, setEditingItem] = useState<{
    planId?: string;
    deal: Deal;
    po?: PurchaseOrder;
    company?: Company;
    existingPlan?: ImplementationPlan;
  } | null>(null);

  const [formData, setFormData] = useState<{
    dealId: string;
    status: ImplementationStatus;
    implementor: ImplementorType;
    proposedDurationWeeks: string;
    actualDurationWeeks: string;
    startDate: string;
    targetEndDate: string;
    assignedPmId: string;
    notes: string;
    bastUrl: string;
    bastName: string;
  }>({
    dealId: '',
    status: 'Draft',
    implementor: 'Internal',
    proposedDurationWeeks: '4',
    actualDurationWeeks: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    targetEndDate: format(addWeeks(new Date(), 4), 'yyyy-MM-dd'),
    assignedPmId: '',
    notes: '',
    bastUrl: '',
    bastName: '',
  });

  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [usdRate, setUsdRate] = useState<number | null>(null);
  const [deletedDealIds, setDeletedDealIds] = useState<string[]>([]);

  // Expanded interaction log state per line
  const [expandedRowDealId, setExpandedRowDealId] = useState<string | null>(null);
  const [newLogDates, setNewLogDates] = useState<Record<string, string>>({});
  const [newLogNotes, setNewLogNotes] = useState<Record<string, string>>({});
  const [isSubmittingLog, setIsSubmittingLog] = useState<Record<string, boolean>>({});

  const canEditStatus = userRole === 'admin' || userRole === 'project_manager' || userRole === 'super_user' || userRole === 'engineer';
  const isAdmin = userRole === 'admin';
  const canDelete = userRole === 'admin' || userRole === 'project_manager' || userRole === 'super_user' || userRole === 'engineer' || userRole === 'manager' || !userRole;

  useEffect(() => {
    const fetchRate = async () => {
      const rates = await currencyService.getRates();
      if (rates?.rates?.USD) {
        setUsdRate(rates.rates.USD);
      }
    };
    fetchRate();
  }, []);

  // Compute items for Implementation Plan:
  // Includes all Incoming Purchase Orders from purchaseOrders list as well as Deals in L5 stage
  const itemsMap = new Map<string, any>();

  // 1. Process all Purchase Orders (Incoming POs)
  purchaseOrders.forEach(po => {
    if (!po) return;

    // Find matching deal if exists
    const matchingDeal = deals.find(d =>
      d.id === po.dealId ||
      (po.companyId && d.companyId === po.companyId && d.value === po.amount)
    );

    const dealId = matchingDeal?.id || po.dealId || `po_${po.id}`;
    if (deletedDealIds.includes(dealId) || deletedDealIds.includes(po.id)) return;

    // Find associated Firestore implementation plan
    const plan = implementationPlans.find(p =>
      !p.isDeleted && (p.poId === po.id || (p.dealId && p.dealId === dealId))
    );

    if (plan?.isDeleted) return;

    const company = companies.find(c => c.id === (plan?.companyId || po.companyId || matchingDeal?.companyId));
    const contact = contacts.find(c => c.id === (plan?.contactId || po.contactId || matchingDeal?.contactId));
    const owner = users.find(u => u.uid === (plan?.assignedPmId || plan?.ownerId || po.ownerId || matchingDeal?.ownerId));

    const deal = matchingDeal || {
      id: dealId,
      title: po.title || po.poNumber || 'Incoming PO',
      value: po.amount || 0,
      stage: 'L5-closed-won' as const,
      companyId: po.companyId,
      contactId: po.contactId,
      ownerId: po.ownerId,
      createdAt: po.createdAt,
      updatedAt: po.updatedAt,
    };

    const itemKey = plan?.id || (po?.id ? `po_${po.id}` : dealId);

    itemsMap.set(itemKey, {
      itemKey,
      plan,
      planId: plan?.id,
      deal,
      po,
      company,
      contact,
      owner,
      status: (plan?.status || 'Draft') as ImplementationStatus,
      implementor: (plan?.implementor || 'Internal') as ImplementorType,
      durationWeeks: plan?.durationWeeks,
      proposedDurationWeeks: plan?.proposedDurationWeeks ?? plan?.durationWeeks,
      actualDurationWeeks: plan?.actualDurationWeeks,
      startDate: plan?.startDate,
      targetEndDate: plan?.targetEndDate,
      notes: plan?.notes,
      interactions: plan?.interactions || [],
      bastUrl: plan?.bastUrl || po?.bastUrl || '',
      bastName: plan?.bastName || po?.bastName || '',
    });
  });

  // 2. Process Deals in L5 stage that might not be linked to a PO in purchaseOrders yet
  deals.forEach(deal => {
    if (!deal) return;
    const isL5 = deal.stage === 'L5-closed-won' || deal.stage?.toLowerCase().startsWith('l5');
    if (!isL5) return;
    if (deletedDealIds.includes(deal.id)) return;

    // Check if deal is already covered by an entry in itemsMap
    const alreadyProcessed = Array.from(itemsMap.values()).some(
      item => item.deal?.id === deal.id || item.plan?.dealId === deal.id
    );
    if (alreadyProcessed) return;

    const matchingPO = purchaseOrders.find(po =>
      po.dealId === deal.id ||
      (deal.companyId && po.companyId === deal.companyId && po.amount === deal.value)
    );

    const plan = implementationPlans.find(p => p.dealId === deal.id && !p.isDeleted);
    if (plan?.isDeleted) return;

    const company = companies.find(c => c.id === (plan?.companyId || deal.companyId));
    const contact = contacts.find(c => c.id === (plan?.contactId || deal.contactId));
    const owner = users.find(u => u.uid === (plan?.assignedPmId || plan?.ownerId || deal.ownerId));

    const itemKey = plan?.id || (matchingPO?.id ? `po_${matchingPO.id}` : deal.id);

    itemsMap.set(itemKey, {
      itemKey,
      plan,
      planId: plan?.id,
      deal,
      po: matchingPO,
      company,
      contact,
      owner,
      status: (plan?.status || 'Draft') as ImplementationStatus,
      implementor: (plan?.implementor || 'Internal') as ImplementorType,
      durationWeeks: plan?.durationWeeks,
      proposedDurationWeeks: plan?.proposedDurationWeeks ?? plan?.durationWeeks,
      actualDurationWeeks: plan?.actualDurationWeeks,
      startDate: plan?.startDate,
      targetEndDate: plan?.targetEndDate,
      notes: plan?.notes,
      interactions: plan?.interactions || [],
      bastUrl: plan?.bastUrl || matchingPO?.bastUrl || '',
      bastName: plan?.bastName || matchingPO?.bastName || '',
    });
  });

  const qualifyingItems = Array.from(itemsMap.values());

  // Handler to add an interaction log (date + note) to a specific line
  const handleAddInteractionLog = async (dealId: string, planId?: string, currentPlan?: ImplementationPlan, dealObj?: Deal) => {
    const dateVal = newLogDates[dealId] || format(new Date(), 'yyyy-MM-dd');
    const noteVal = (newLogNotes[dealId] || '').trim();

    if (!noteVal) {
      alert('Please enter a note for the interaction log.');
      return;
    }

    setIsSubmittingLog(prev => ({ ...prev, [dealId]: true }));

    const newEntry: ImplementationInteractionLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      date: dateVal,
      note: noteVal,
      createdAt: new Date().toISOString(),
      createdBy: users.find(u => u.uid === userId)?.displayName || 'User',
    };

    const existingInteractions = currentPlan?.interactions || [];
    const updatedInteractions = [newEntry, ...existingInteractions];

    try {
      if (planId) {
        const planRef = doc(db, 'implementationPlans', planId);
        await updateDoc(planRef, {
          interactions: updatedInteractions,
          updatedAt: Timestamp.now(),
        });
      } else if (dealObj) {
        const newPlanData = {
          dealId: dealObj.id,
          companyId: dealObj.companyId || null,
          contactId: dealObj.contactId || null,
          title: dealObj.title,
          value: dealObj.value,
          status: 'Draft',
          interactions: updatedInteractions,
          ownerId: dealObj.ownerId || userId,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };
        await addDoc(collection(db, 'implementationPlans'), newPlanData);
      }
      await logEvent('Implementation Interaction Log Added', `Added interaction log for deal ${dealId}`);
      setNewLogNotes(prev => ({ ...prev, [dealId]: '' }));
    } catch (err) {
      console.error('Error adding interaction log:', err);
      handleFirestoreError(err, planId ? OperationType.UPDATE : OperationType.CREATE, 'implementationPlans');
    } finally {
      setIsSubmittingLog(prev => ({ ...prev, [dealId]: false }));
    }
  };

  // Handler to delete an interaction log from a line
  const handleDeleteInteractionLog = async (dealId: string, logId: string, planId?: string, currentPlan?: ImplementationPlan) => {
    if (!planId || !currentPlan) return;
    if (!window.confirm('Are you sure you want to delete this interaction log entry?')) return;

    const updatedInteractions = (currentPlan.interactions || []).filter(item => item.id !== logId);

    try {
      const planRef = doc(db, 'implementationPlans', planId);
      await updateDoc(planRef, {
        interactions: updatedInteractions,
        updatedAt: Timestamp.now(),
      });
      await logEvent('Implementation Interaction Log Deleted', `Deleted log ${logId}`);
    } catch (err) {
      console.error('Error deleting interaction log:', err);
      handleFirestoreError(err, OperationType.UPDATE, 'implementationPlans');
    }
  };

  // Filter items by status and search term
  const filteredItems = qualifyingItems.filter(item => {
    const matchesStatus = selectedStatusFilter === 'All' || item.status === selectedStatusFilter;
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      !searchTerm ||
      item.deal.title.toLowerCase().includes(searchLower) ||
      (item.company?.name || '').toLowerCase().includes(searchLower) ||
      (item.po?.poNumber || '').toLowerCase().includes(searchLower) ||
      (item.owner?.displayName || '').toLowerCase().includes(searchLower);

    return matchesStatus && matchesSearch;
  });

  const handleOpenEditModal = (item: typeof qualifyingItems[0]) => {
    setEditingItem({
      planId: item.plan?.id,
      deal: item.deal,
      po: item.po,
      company: item.company,
      existingPlan: item.plan,
    });

    const initStartDate = item.startDate 
      ? format(item.startDate.toDate(), 'yyyy-MM-dd') 
      : format(new Date(), 'yyyy-MM-dd');

    const proposed = item.proposedDurationWeeks ?? item.durationWeeks;
    const initProposed = proposed ? String(proposed) : '';
    const initActual = item.actualDurationWeeks ? String(item.actualDurationWeeks) : '';

    let initTargetEnd = '';
    if (item.targetEndDate) {
      initTargetEnd = format(item.targetEndDate.toDate(), 'yyyy-MM-dd');
    } else if (initProposed) {
      const calculatedEnd = addWeeks(new Date(initStartDate), Number(initProposed));
      initTargetEnd = format(calculatedEnd, 'yyyy-MM-dd');
    }

    const initBastUrl = item.plan?.bastUrl || item.po?.bastUrl || item.bastUrl || '';
    const initBastName = item.plan?.bastName || item.po?.bastName || item.bastName || (initBastUrl ? 'BAST_Document.pdf' : '');

    setFormData({
      dealId: item.deal.id,
      status: item.status,
      implementor: item.implementor || 'Internal',
      proposedDurationWeeks: initProposed,
      actualDurationWeeks: initActual,
      startDate: initStartDate,
      targetEndDate: initTargetEnd,
      assignedPmId: item.plan?.assignedPmId || item.deal.ownerId || userId,
      notes: item.notes || '',
      bastUrl: initBastUrl,
      bastName: initBastName,
    });
    setValidationError(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Only PDF files are allowed for BAST documents.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('File size exceeds 10MB limit.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const storageRef = ref(storage, `bast/${userId}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error: any) => {
          console.error('Upload failed:', error);
          setIsUploading(false);
          let message = `Upload failed: ${error.message || 'Please try again.'}`;
          if (error.code === 'storage/unauthorized') {
            message = 'Permission denied: Firebase Storage rules might be blocking the upload.';
          }
          alert(message);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setFormData(prev => ({
            ...prev,
            bastUrl: downloadURL,
            bastName: file.name
          }));
          setIsUploading(false);
          if (validationError && validationError.includes('BAST')) {
            setValidationError(null);
          }
        }
      );
    } catch (err: any) {
      console.error('File upload error:', err);
      setIsUploading(false);
      alert('Failed to start file upload.');
    }
  };

  const handleRemoveFile = () => {
    setFormData(prev => ({
      ...prev,
      bastUrl: '',
      bastName: ''
    }));
  };

  const handleProposedDurationOrStartChange = (proposedStr: string, startStr: string) => {
    let targetEnd = formData.targetEndDate;
    if (proposedStr && !isNaN(Number(proposedStr)) && Number(proposedStr) > 0 && startStr) {
      const calculated = addWeeks(new Date(startStr), Number(proposedStr));
      targetEnd = format(calculated, 'yyyy-MM-dd');
    }
    setFormData(prev => ({
      ...prev,
      proposedDurationWeeks: proposedStr,
      startDate: startStr,
      targetEndDate: targetEnd,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    if (!canEditStatus) {
      setValidationError('Only users with Project Manager or Admin privilege can update the implementation status.');
      return;
    }

    const targetDeal = deals.find(d => d.id === formData.dealId) || editingItem.deal;
    if (!targetDeal || !targetDeal.id) {
      setValidationError('Please select a valid deal.');
      return;
    }

    // MANDATORY FORM VALIDATION: proposed duration of implementation in weeks
    const numProposed = Number(formData.proposedDurationWeeks);
    if (!formData.proposedDurationWeeks || isNaN(numProposed) || numProposed <= 0) {
      setValidationError('Proposed Duration of implementation in weeks is mandatory and must be greater than 0.');
      return;
    }

    // MANDATORY BAST DOCUMENT VALIDATION FOR COMPLETED STATUS
    if (formData.status === 'Completed' && !formData.bastUrl.trim()) {
      setValidationError('BAST Document (PDF) is required when implementation status is set to Completed. Please upload the BAST document.');
      return;
    }

    let numActual: number | null = null;
    if (formData.actualDurationWeeks.trim()) {
      const parsedActual = Number(formData.actualDurationWeeks);
      if (isNaN(parsedActual) || parsedActual <= 0) {
        setValidationError('Actual Duration must be a positive number if specified.');
        return;
      }
      numActual = parsedActual;
    }

    setValidationError(null);
    setIsSubmitting(true);

    try {
      const startTimestamp = formData.startDate ? Timestamp.fromDate(new Date(formData.startDate)) : Timestamp.now();
      const endTimestamp = formData.targetEndDate 
        ? Timestamp.fromDate(new Date(formData.targetEndDate)) 
        : Timestamp.fromDate(addWeeks(new Date(formData.startDate), numProposed));

      const matchingPO = purchaseOrders.find(po => 
        po.dealId === targetDeal.id || 
        (po.companyId === targetDeal.companyId && po.amount === targetDeal.value)
      );

      const planData: any = {
        dealId: targetDeal.id,
        poId: matchingPO?.id || editingItem.po?.id || null,
        companyId: targetDeal.companyId || null,
        contactId: targetDeal.contactId || null,
        title: targetDeal.title,
        value: targetDeal.value,
        status: formData.status,
        implementor: formData.implementor || 'Internal',
        proposedDurationWeeks: numProposed,
        actualDurationWeeks: numActual,
        durationWeeks: numProposed,
        startDate: startTimestamp,
        targetEndDate: endTimestamp,
        assignedPmId: formData.assignedPmId || targetDeal.ownerId || userId,
        notes: formData.notes || '',
        bastUrl: formData.bastUrl || null,
        bastName: formData.bastName || null,
        ownerId: targetDeal.ownerId || userId,
        updatedAt: Timestamp.now(),
      };

      if (editingItem.planId) {
        const planRef = doc(db, 'implementationPlans', editingItem.planId);
        await updateDoc(planRef, planData);
        await logEvent('Implementation Plan Updated', `Plan for ${targetDeal.title}: Status set to ${formData.status}, Proposed: ${numProposed}w, Actual: ${numActual ? `${numActual}w` : 'Not set'}`);
      } else {
        planData.createdAt = Timestamp.now();
        await addDoc(collection(db, 'implementationPlans'), planData);
        await logEvent('Implementation Plan Created', `Plan for ${targetDeal.title}: Status set to ${formData.status}, Proposed: ${numProposed}w, Actual: ${numActual ? `${numActual}w` : 'Not set'}`);
      }

      // Sync BAST to matching Purchase Order if available
      const targetPoId = matchingPO?.id || editingItem.po?.id;
      if (targetPoId && (formData.bastUrl || formData.bastName)) {
        try {
          await updateDoc(doc(db, 'purchaseOrders', targetPoId), {
            bastUrl: formData.bastUrl || null,
            bastName: formData.bastName || null,
            updatedAt: Timestamp.now(),
          });
        } catch (poErr) {
          console.error('Error syncing BAST to purchaseOrders:', poErr);
        }
      }

      // AUTO-GENERATE INVOICE FOR COMPLETED IMPLEMENTATION PLAN
      if (formData.status === 'Completed') {
        try {
          const poObj = matchingPO || editingItem.po;
          const poIdToMatch = poObj?.id || targetPoId || null;
          const dealIdToMatch = targetDeal.id;

          // Check if invoice already exists for this PO or Deal
          const existingInv = invoices.find(inv => 
            (poIdToMatch && inv.poId === poIdToMatch) || 
            (inv.dealId === dealIdToMatch)
          );

          const poSubject = poObj?.title || targetDeal.title || 'Implementation Services';
          const poAmount = poObj?.amount || targetDeal.value || 0;
          const companyIdVal = targetDeal.companyId || poObj?.companyId || '';
          const contactIdVal = targetDeal.contactId || poObj?.contactId || null;

          const defaultItems: InvoiceItem[] = [
            {
              id: '1',
              description: poSubject,
              qty: 1,
              unitPrice: poAmount,
              amount: poAmount
            }
          ];

          if (!existingInv) {
            const nextInvoiceNum = generateNextInvoiceNumber(invoices, new Date());
            const newInvoiceData: any = {
              invoiceNumber: nextInvoiceNum,
              title: `Invoice - ${poSubject}`,
              companyId: companyIdVal,
              contactId: contactIdVal,
              dealId: dealIdToMatch,
              poId: poIdToMatch,
              amount: poAmount,
              items: defaultItems,
              status: 'draft',
              issueDate: Timestamp.now(),
              dueDate: Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
              ownerId: targetDeal.ownerId || userId,
              createdAt: Timestamp.now(),
              updatedAt: Timestamp.now(),
            };

            await addDoc(collection(db, 'invoices'), newInvoiceData);

            await addDoc(collection(db, 'notifications'), {
              userId: userId,
              title: 'Invoice Auto-Generated',
              message: `Invoice ${nextInvoiceNum} was automatically generated for completed implementation of "${targetDeal.title}".`,
              type: 'success',
              read: false,
              relatedType: 'invoice',
              createdAt: Timestamp.now()
            });

            await logEvent('Invoice Auto-Generated for Completed Implementation', `Invoice ${nextInvoiceNum} for ${targetDeal.title}`);
          }
        } catch (invErr) {
          console.error('Error auto-generating invoice on completion:', invErr);
        }
      }

      setEditingItem(null);
    } catch (error) {
      handleFirestoreError(error, editingItem.planId ? OperationType.UPDATE : OperationType.CREATE, 'implementationPlans');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePlan = async (item: {
    planId?: string;
    deal: Deal;
    company?: Company;
    contact?: Contact;
  }) => {
    if (!canDelete) {
      alert('You do not have permission to delete implementation plans.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete the implementation plan for "${item.deal.title}"?`)) return;

    // Immediately remove from local list for responsive UI
    setDeletedDealIds(prev => [...prev, item.deal.id]);

    try {
      if (item.planId) {
        // Soft delete / tombstone in Firestore so autoQualifyingDeals won't recreate it
        await updateDoc(doc(db, 'implementationPlans', item.planId), {
          isDeleted: true,
          status: 'Cancelled',
          updatedAt: Timestamp.now(),
        });
        await logEvent('Implementation Plan Deleted', `Deleted implementation plan for ${item.deal.title}`);
      } else {
        // Create tombstone doc in Firestore with isDeleted: true
        await addDoc(collection(db, 'implementationPlans'), {
          dealId: item.deal.id,
          companyId: item.company?.id || item.deal.companyId || null,
          contactId: item.contact?.id || item.deal.contactId || null,
          title: item.deal.title,
          value: item.deal.value,
          status: 'Cancelled',
          isDeleted: true,
          proposedDurationWeeks: 4,
          actualDurationWeeks: null,
          startDate: Timestamp.now(),
          targetEndDate: Timestamp.now(),
          assignedPmId: item.deal.ownerId || userId,
          ownerId: item.deal.ownerId || userId,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
        await logEvent('Implementation Plan Deleted', `Deleted implementation plan for ${item.deal.title}`);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `implementationPlans/${item.planId || item.deal.id}`);
    }
  };

  const formatCurrency = (amount: number) => {
    const idr = currencyService.formatIDR(amount);
    if (usdRate) {
      const usd = currencyService.formatUSD(amount * usdRate);
      return (
        <span className="font-bold text-brand-text">
          {idr} <span className="text-[11px] text-brand-muted font-normal">({usd})</span>
        </span>
      );
    }
    return <span className="font-bold text-brand-text">{idr}</span>;
  };

  const getStatusBadgeClass = (status: ImplementationStatus) => {
    switch (status) {
      case 'Draft':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]';
      case 'Scheduled':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.1)]';
      case 'In Progress':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.1)]';
      case 'On Hold':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/20 shadow-[0_0_10px_rgba(249,115,22,0.1)]';
      case 'Completed':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]';
      case 'Cancelled':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]';
      default:
        return 'bg-white/5 text-brand-muted border-white/10';
    }
  };

  // PM users filter for assignment dropdown
  const pmAndAdminUsers = users.filter(u => u.role === 'project_manager' || u.role === 'admin' || u.role === 'manager' || u.role === 'super_user' || u.role === 'engineer');

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-brand-card p-6 md:p-8 rounded-3xl border border-white/10 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-brand-gold/5 rounded-full blur-3xl pointer-events-none" />
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-brand-gold/10 text-brand-gold rounded-xl border border-brand-gold/20">
              <Rocket size={24} />
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-brand-text tracking-tight uppercase">Implementation Plan</h1>
          </div>
          <p className="text-brand-muted text-sm max-w-2xl">
            Tracking verified L5 deals with approved POs ready for project execution. Manage duration, schedules, and delivery milestones.
          </p>
        </div>

        {/* Access Role Tag */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {canEditStatus ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold uppercase tracking-wider">
              <UserCheck size={14} /> PM / Admin Access Granted
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold uppercase tracking-wider" title="Only PM & Admin can edit status">
              <Lock size={14} /> View Only (PM/Admin privileges needed to edit)
            </span>
          )}
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Ready Deals', count: qualifyingItems.length, color: 'text-brand-text', bg: 'bg-white/5' },
          { label: 'Draft Plans', count: qualifyingItems.filter(i => i.status === 'Draft').length, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          { label: 'In Progress', count: qualifyingItems.filter(i => i.status === 'In Progress').length, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
          { label: 'Completed', count: qualifyingItems.filter(i => i.status === 'Completed').length, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
        ].map((kpi, idx) => (
          <div key={idx} className="bg-brand-card p-5 rounded-2xl border border-white/10 flex flex-col justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-brand-muted">{kpi.label}</span>
            <div className="flex items-baseline justify-between mt-3">
              <span className={`text-3xl font-black ${kpi.color}`}>{kpi.count}</span>
              <span className={`p-2 rounded-lg ${kpi.bg}`}>
                <Rocket size={18} className={kpi.color} />
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Filters and Search Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted" size={18} />
          <input
            type="text"
            placeholder="Search deals, companies, PO numbers, PMs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-brand-card border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm text-brand-text placeholder-brand-muted focus:outline-none focus:border-brand-gold/50 transition-all"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
          <Filter size={16} className="text-brand-muted ml-1 hidden md:block" />
          {['All', 'Draft', 'Scheduled', 'In Progress', 'On Hold', 'Completed', 'Cancelled'].map(status => (
            <button
              key={status}
              onClick={() => setSelectedStatusFilter(status)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap uppercase tracking-wider border ${
                selectedStatusFilter === status
                  ? 'bg-brand-gold text-brand-bg border-brand-gold shadow-lg shadow-brand-gold/20'
                  : 'bg-brand-card text-brand-muted border-white/10 hover:border-white/20 hover:text-brand-text'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Implementation Items Table */}
      {filteredItems.length === 0 ? (
        <div className="bg-brand-card border border-white/10 rounded-3xl p-12 text-center space-y-4">
          <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto text-brand-muted border border-white/10">
            <Rocket size={32} />
          </div>
          <h3 className="text-lg font-bold text-brand-text">No Implementation Plans Found</h3>
          <p className="text-brand-muted text-sm max-w-md mx-auto">
            {qualifyingItems.length === 0 
              ? 'No deals are currently added to Implementation Plans. Click "Add Implementation Plan" above to create one manually or promote an L5 deal.'
              : 'No plans match the selected search or status filters.'}
          </p>
        </div>
      ) : (
        <div className="bg-brand-card rounded-3xl border border-white/5 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-white/5">
                  <th className="px-4 py-3.5 text-xs font-bold text-brand-muted uppercase tracking-wider !text-left whitespace-nowrap">
                    Company
                  </th>
                  <th className="px-4 py-3.5 text-xs font-bold text-brand-muted uppercase tracking-wider !text-left">
                    Deal Title
                  </th>
                  <th className="px-4 py-3.5 text-xs font-bold text-brand-muted uppercase tracking-wider whitespace-nowrap">
                    Status
                  </th>
                  <th className="px-4 py-3.5 text-xs font-bold text-brand-muted uppercase tracking-wider whitespace-nowrap">
                    Implementor
                  </th>
                  <th className="px-4 py-3.5 text-xs font-bold text-brand-muted uppercase tracking-wider whitespace-nowrap text-brand-gold">
                    Proposed Duration
                  </th>
                  <th className="px-4 py-3.5 text-xs font-bold text-brand-muted uppercase tracking-wider whitespace-nowrap text-emerald-400">
                    Actual Duration
                  </th>
                  <th className="px-4 py-3.5 text-xs font-bold text-brand-muted uppercase tracking-wider whitespace-nowrap">
                    Schedule Dates
                  </th>
                  <th className="px-4 py-3.5 text-xs font-bold text-brand-muted uppercase tracking-wider whitespace-nowrap">
                    PM / Owner
                  </th>
                  <th className="px-4 py-3.5 text-xs font-bold text-brand-muted uppercase tracking-wider text-right whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredItems.map(item => {
                  const isExpanded = expandedRowDealId === item.deal.id;
                  return (
                    <React.Fragment key={item.itemKey || item.planId || item.po?.id || item.deal.id}>
                      <tr
                        onClick={() => setExpandedRowDealId(isExpanded ? null : item.deal.id)}
                        className={`group cursor-pointer transition-colors ${
                          isExpanded ? 'bg-white/10' : 'hover:bg-white/5'
                        }`}
                      >
                        {/* Company */}
                        <td className="px-4 py-3.5 !text-left whitespace-nowrap min-w-[180px]">
                          <div className="flex items-center justify-start gap-2.5 !text-left whitespace-nowrap">
                            <div className="shrink-0 p-1.5 bg-white/5 rounded-lg border border-white/5">
                              <Building2 size={16} className="text-brand-gold/80" />
                            </div>
                            <span className="text-sm font-semibold text-brand-text leading-snug whitespace-nowrap">
                              {item.company?.name || 'N/A'}
                            </span>
                          </div>
                        </td>

                        {/* Deal Title */}
                        <td className="px-4 py-3.5 !text-left min-w-[200px]">
                          <div className="flex items-center justify-start gap-2.5 !text-left">
                            <div className="w-8 h-8 bg-brand-gold/10 rounded-lg flex items-center justify-center text-brand-gold shrink-0 border border-brand-gold/10">
                              <Rocket size={16} />
                            </div>
                            <div className="flex flex-col items-start !text-left min-w-0">
                              <span className="text-sm font-bold text-brand-text truncate max-w-[220px]">
                                {item.deal.title}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${getStatusBadgeClass(item.status)}`}>
                            {item.status}
                          </span>
                        </td>

                        {/* Implementor */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                            item.implementor === 'Internal'
                              ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                              : item.implementor === 'Distributor'
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}>
                            {item.implementor || 'Internal'}
                          </span>
                        </td>

                        {/* Proposed Duration */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-sm">
                          <div className="flex items-center gap-1.5">
                            <Clock size={15} className="text-brand-gold shrink-0" />
                            <span className={item.proposedDurationWeeks ? 'font-bold text-brand-gold text-sm' : 'text-amber-400/70 italic text-xs'}>
                              {item.proposedDurationWeeks ? `${item.proposedDurationWeeks} Wks` : 'Not set'}
                            </span>
                          </div>
                        </td>

                        {/* Actual Duration */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-sm">
                          <div className="flex items-center gap-1.5">
                            <Clock size={15} className={item.actualDurationWeeks ? 'text-emerald-400 shrink-0' : 'text-brand-muted/50 shrink-0'} />
                            {typeof item.actualDurationWeeks === 'number' && item.actualDurationWeeks > 0 ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-emerald-400 text-sm">
                                  {item.actualDurationWeeks} Wks
                                </span>
                                {item.proposedDurationWeeks && (
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                    item.actualDurationWeeks > item.proposedDurationWeeks
                                      ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                      : item.actualDurationWeeks === item.proposedDurationWeeks
                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                        : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                                  }`}>
                                    {item.actualDurationWeeks > item.proposedDurationWeeks
                                      ? `+${item.actualDurationWeeks - item.proposedDurationWeeks}w`
                                      : item.actualDurationWeeks === item.proposedDurationWeeks
                                        ? 'On target'
                                        : `-${item.proposedDurationWeeks - item.actualDurationWeeks}w`}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-brand-muted/60 italic text-xs">
                                Not set
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Schedule Dates */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-sm text-brand-muted">
                          <div className="flex flex-col text-xs leading-snug space-y-0.5">
                            {item.startDate ? (
                              <span>Start: <strong className="text-brand-text font-semibold">{format(item.startDate.toDate(), 'dd MMM yyyy')}</strong></span>
                            ) : (
                              <span className="italic">No start date</span>
                            )}
                            {item.targetEndDate && (
                              <span>End: <strong className="text-brand-text font-semibold">{format(item.targetEndDate.toDate(), 'dd MMM yyyy')}</strong></span>
                            )}
                          </div>
                        </td>

                        {/* PM / Owner */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-sm text-brand-text font-semibold">
                          {item.owner?.displayName || 'Unassigned'}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <div className={`flex items-center justify-end gap-1.5 transition-opacity ${
                            isExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}>
                            {item.po?.poUrl && (
                              <a
                                href={item.po.poUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-2 bg-white/5 hover:bg-white/10 text-brand-gold rounded-xl border border-white/10 transition-all"
                                title="View Verified PO Document"
                              >
                                <FileText size={15} />
                              </a>
                            )}
                            {/* Interaction Log Drop Down Toggle Button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedRowDealId(isExpanded ? null : item.deal.id);
                              }}
                              className={`p-2 rounded-xl transition-all flex items-center gap-1 text-xs font-semibold ${
                                isExpanded
                                  ? 'bg-brand-gold text-brand-bg shadow-sm font-bold'
                                  : 'bg-white/5 text-brand-muted border border-white/10 hover:border-brand-gold/30 hover:text-brand-text'
                              }`}
                              title={isExpanded ? 'Hide Interaction Logs' : 'Interaction Log Drop Down'}
                            >
                              <MessageSquare size={15} />
                              {item.interactions.length > 0 && (
                                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                                  isExpanded ? 'bg-brand-bg/30 text-brand-bg' : 'bg-brand-gold/20 text-brand-gold border border-brand-gold/30'
                                }`}>
                                  {item.interactions.length}
                                </span>
                              )}
                              {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </button>
                            {/* Edit / Manage Button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditModal(item);
                              }}
                              className={`p-2 rounded-xl transition-all ${
                                canEditStatus
                                  ? 'bg-brand-gold text-brand-bg hover:brightness-110 shadow-sm'
                                  : 'bg-white/5 text-brand-muted border border-white/10 hover:border-brand-gold/30 hover:text-brand-text'
                              }`}
                              title={canEditStatus ? 'Manage Implementation Plan' : 'View Implementation Plan'}
                            >
                              <Edit2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Interaction Log Drop Down Panel */}
                      {isExpanded && (
                        <tr className="bg-brand-bg/70 border-b border-white/10">
                          <td colSpan={9} className="p-4 md:p-5">
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 md:p-5 space-y-4">
                              {/* Drop Down Panel Header */}
                              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                                <div className="flex items-center gap-2.5">
                                  <div className="p-2 bg-brand-gold/10 rounded-xl text-brand-gold border border-brand-gold/20">
                                    <MessageSquare size={16} />
                                  </div>
                                  <div>
                                    <h4 className="text-sm font-bold text-brand-text flex items-center gap-2">
                                      Interaction Logs
                                      <span className="text-xs font-semibold px-2 py-0.5 bg-brand-gold/10 text-brand-gold rounded-full border border-brand-gold/20">
                                        {item.interactions.length} {item.interactions.length === 1 ? 'entry' : 'entries'}
                                      </span>
                                    </h4>
                                    <p className="text-xs text-brand-muted mt-0.5">
                                      Track date and note interactions for {item.deal.title}
                                    </p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedRowDealId(null);
                                  }}
                                  className="text-brand-muted hover:text-brand-text p-1.5 rounded-lg hover:bg-white/5 transition-all text-xs flex items-center gap-1"
                                >
                                  <span>Close</span>
                                  <X size={14} />
                                </button>
                              </div>

                              {/* Add Log Form */}
                              <div className="bg-black/30 p-3.5 rounded-2xl border border-white/5 space-y-2.5">
                                <span className="text-xs font-bold text-brand-gold uppercase tracking-wider block">
                                  Add Interaction Log
                                </span>
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
                                  <div className="shrink-0 sm:w-44 space-y-1">
                                    <label className="block text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                                      Date <span className="text-brand-gold">*</span>
                                    </label>
                                    <input
                                      type="date"
                                      value={newLogDates[item.deal.id] || format(new Date(), 'yyyy-MM-dd')}
                                      onChange={(e) => setNewLogDates(prev => ({ ...prev, [item.deal.id]: e.target.value }))}
                                      className="w-full bg-brand-bg border border-white/10 rounded-xl px-3 py-2 text-xs text-brand-text focus:outline-none focus:border-brand-gold/50 transition-all font-semibold"
                                    />
                                  </div>
                                  <div className="flex-1 space-y-1">
                                    <label className="block text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                                      Note <span className="text-brand-gold">*</span>
                                    </label>
                                    <input
                                      type="text"
                                      value={newLogNotes[item.deal.id] || ''}
                                      onChange={(e) => setNewLogNotes(prev => ({ ...prev, [item.deal.id]: e.target.value }))}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          handleAddInteractionLog(item.deal.id, item.planId, item.plan, item.deal);
                                        }
                                      }}
                                      placeholder="Enter interaction note or activity summary..."
                                      className="w-full bg-brand-bg border border-white/10 rounded-xl px-3.5 py-2 text-xs text-brand-text placeholder:text-brand-muted/50 focus:outline-none focus:border-brand-gold/50 transition-all"
                                    />
                                  </div>
                                  <div className="shrink-0">
                                    <button
                                      type="button"
                                      disabled={isSubmittingLog[item.deal.id]}
                                      onClick={() => handleAddInteractionLog(item.deal.id, item.planId, item.plan, item.deal)}
                                      className="w-full sm:w-auto px-4 py-2 bg-brand-gold text-brand-bg hover:brightness-110 font-black text-xs rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm uppercase tracking-wider"
                                    >
                                      <Plus size={14} />
                                      <span>{isSubmittingLog[item.deal.id] ? 'Saving...' : 'Add Log'}</span>
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* Interaction List */}
                              <div className="space-y-2">
                                <span className="text-xs font-bold text-brand-muted uppercase tracking-wider block">
                                  Recorded Interactions
                                </span>
                                {item.interactions.length === 0 ? (
                                  <div className="text-center py-6 border border-dashed border-white/10 rounded-2xl bg-black/10">
                                    <MessageSquare size={20} className="mx-auto text-brand-muted/40 mb-1.5" />
                                    <p className="text-xs text-brand-muted font-medium">No interaction logs recorded yet.</p>
                                    <p className="text-[11px] text-brand-muted/60 mt-0.5">Fill in the date and note above to save the first interaction log.</p>
                                  </div>
                                ) : (
                                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                    {item.interactions.map(log => (
                                      <div
                                        key={log.id}
                                        className="p-3 bg-black/20 hover:bg-white/5 border border-white/5 rounded-xl transition-colors flex items-start justify-between gap-3 group/log"
                                      >
                                        <div className="flex items-start gap-3 flex-1 min-w-0">
                                          <div className="shrink-0 px-2.5 py-1 bg-brand-gold/10 border border-brand-gold/20 rounded-lg text-brand-gold text-xs font-bold flex items-center gap-1.5 mt-0.5">
                                            <Calendar size={13} />
                                            <span>{log.date ? format(new Date(log.date), 'dd MMM yyyy') : 'No Date'}</span>
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-xs text-brand-text leading-relaxed font-normal whitespace-pre-wrap">
                                              {log.note}
                                            </p>
                                            {log.createdBy && (
                                              <span className="text-[10px] text-brand-muted/60 mt-1 block">
                                                Logged by {log.createdBy}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        {item.planId && (
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteInteractionLog(item.deal.id, log.id, item.planId, item.plan)}
                                            className="text-brand-muted/40 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 opacity-0 group-hover/log:opacity-100 transition-all shrink-0"
                                            title="Delete interaction log"
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit / Add Implementation Plan Modal */}
      <AnimatePresence>
        {editingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-brand-card border border-white/10 rounded-3xl p-6 md:p-8 max-w-xl w-full max-h-[90vh] overflow-y-auto space-y-6 shadow-2xl relative"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <h2 className="text-xl font-black text-brand-text uppercase tracking-tight flex items-center gap-2">
                    <Rocket className="text-brand-gold" size={22} />
                    Update Implementation Status
                  </h2>
                  <p className="text-xs text-brand-muted mt-1 truncate max-w-md">
                    {editingItem.deal.title} {editingItem.company ? `(${editingItem.company.name})` : ''}
                  </p>
                </div>
                <button
                  onClick={() => setEditingItem(null)}
                  className="p-2 text-brand-muted hover:text-brand-text hover:bg-white/10 rounded-xl transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              {!canEditStatus && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3 text-amber-300 text-xs">
                  <ShieldAlert size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold">Privilege Restriction:</strong>
                    <p className="mt-0.5">Only users with <strong>Project Manager</strong> or <strong>Admin</strong> privileges can modify implementation plans.</p>
                  </div>
                </div>
              )}

              {validationError && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-3 text-rose-300 text-xs">
                  <AlertTriangle size={18} className="shrink-0 mt-0.5 text-rose-400" />
                  <div>
                    <strong className="font-bold">Validation Error:</strong>
                    <p className="mt-0.5">{validationError}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Target Deal info */}
                <div className="p-3.5 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-brand-muted uppercase tracking-wider block">Target Deal</span>
                    <span className="text-sm font-bold text-brand-text">{editingItem.deal.title}</span>
                  </div>
                  {editingItem.company && (
                    <span className="text-xs text-brand-gold font-semibold bg-brand-gold/10 px-2.5 py-1 rounded-lg border border-brand-gold/20">
                      {editingItem.company.name}
                    </span>
                  )}
                </div>

                {/* Status Selection */}
                <div>
                  <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-2">
                    Implementation Status <span className="text-brand-gold">*</span>
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => {
                      const newStatus = e.target.value as ImplementationStatus;
                      setFormData(prev => ({
                        ...prev,
                        status: newStatus,
                        actualDurationWeeks: (newStatus === 'Completed' && !prev.actualDurationWeeks)
                          ? prev.proposedDurationWeeks
                          : prev.actualDurationWeeks
                      }));
                    }}
                    disabled={!canEditStatus || isSubmitting}
                    className="w-full bg-brand-bg border border-white/10 rounded-2xl p-3 text-sm text-brand-text focus:outline-none focus:border-brand-gold/50 disabled:opacity-60 font-semibold"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Scheduled">Scheduled</option>
                    <option value="In Progress">In Progress</option>
                    <option value="On Hold">On Hold</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>

                {/* Implementor Selection */}
                <div>
                  <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-2">
                    Implementor <span className="text-brand-gold">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {(['Internal', 'Distributor', 'Other'] as ImplementorType[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        disabled={!canEditStatus || isSubmitting}
                        onClick={() => setFormData(prev => ({ ...prev, implementor: type }))}
                        className={`px-3 py-2.5 rounded-2xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                          formData.implementor === type
                            ? 'bg-brand-gold text-brand-bg border-brand-gold shadow-md font-black'
                            : 'bg-brand-bg text-brand-muted border-white/10 hover:border-brand-gold/30 hover:text-brand-text'
                        } disabled:opacity-60`}
                      >
                        <span>{type}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Duration Fields Grid (Proposed vs Actual) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Proposed Duration */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-brand-gold uppercase tracking-wider">
                        Proposed Duration <span className="text-rose-400 font-bold">* MANDATORY</span>
                      </label>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="e.g. 4"
                        value={formData.proposedDurationWeeks}
                        onChange={(e) => handleProposedDurationOrStartChange(e.target.value, formData.startDate)}
                        disabled={!canEditStatus || isSubmitting}
                        required
                        className="w-full bg-brand-bg border-2 border-brand-gold/40 focus:border-brand-gold rounded-2xl p-3 pl-4 pr-16 text-sm font-bold text-brand-text focus:outline-none transition-all disabled:opacity-60"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-brand-gold">
                        Weeks
                      </span>
                    </div>
                    <p className="text-[11px] text-brand-muted mt-1">
                      Planned timeframe. Target end date will auto-calculate.
                    </p>
                  </div>

                  {/* Actual Duration */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-emerald-400 uppercase tracking-wider">
                        Actual Duration <span className="text-brand-muted font-normal">{formData.status === 'Completed' ? '(Optional)' : '(Completed status only)'}</span>
                      </label>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="e.g. 5"
                        value={formData.actualDurationWeeks}
                        onChange={(e) => setFormData({ ...formData, actualDurationWeeks: e.target.value })}
                        disabled={!canEditStatus || isSubmitting || formData.status !== 'Completed'}
                        className="w-full bg-brand-bg border border-white/10 focus:border-emerald-500/50 rounded-2xl p-3 pl-4 pr-16 text-sm font-bold text-brand-text focus:outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-400">
                        Weeks
                      </span>
                    </div>
                    <p className="text-[11px] text-brand-muted mt-1">
                      {formData.status === 'Completed'
                        ? 'Recorded actual time taken upon completion.'
                        : 'Editable when status is set to Completed.'}
                    </p>
                  </div>
                </div>

                {/* Dates Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-2">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => handleProposedDurationOrStartChange(formData.proposedDurationWeeks, e.target.value)}
                      disabled={!canEditStatus || isSubmitting}
                      className="w-full bg-brand-bg border border-white/10 rounded-2xl p-3 text-sm text-brand-text focus:outline-none focus:border-brand-gold/50 disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-2">
                      Target End Date
                    </label>
                    <input
                      type="date"
                      value={formData.targetEndDate}
                      onChange={(e) => setFormData({ ...formData, targetEndDate: e.target.value })}
                      disabled={!canEditStatus || isSubmitting}
                      className="w-full bg-brand-bg border border-white/10 rounded-2xl p-3 text-sm text-brand-text focus:outline-none focus:border-brand-gold/50 disabled:opacity-60"
                    />
                  </div>
                </div>

                {/* Assigned PM */}
                <div>
                  <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-2">
                    Assigned Project Manager / Owner
                  </label>
                  <select
                    value={formData.assignedPmId}
                    onChange={(e) => setFormData({ ...formData, assignedPmId: e.target.value })}
                    disabled={!canEditStatus || isSubmitting}
                    className="w-full bg-brand-bg border border-white/10 rounded-2xl p-3 text-sm text-brand-text focus:outline-none focus:border-brand-gold/50 disabled:opacity-60"
                  >
                    {users.map(u => (
                      <option key={u.uid} value={u.uid}>
                        {u.displayName} ({u.role.replace('_', ' ').toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>

                {/* BAST Document Upload Menu */}
                <div className="space-y-2 p-4 bg-white/5 border border-white/10 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-brand-gold uppercase tracking-wider flex items-center gap-1.5">
                      <File size={14} className="text-brand-gold" />
                      BAST Document (PDF)
                      {formData.status === 'Completed' ? (
                        <span className="text-rose-400 font-bold ml-1 text-[11px]">* MANDATORY FOR COMPLETED</span>
                      ) : (
                        <span className="text-brand-muted font-normal text-[11px] ml-1">(Required for Completion)</span>
                      )}
                    </label>
                  </div>

                  {formData.bastUrl ? (
                    <div className="flex items-center justify-between p-3.5 bg-brand-gold/10 border border-brand-gold/20 rounded-xl">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-brand-gold/20 flex items-center justify-center text-brand-gold shrink-0 border border-brand-gold/20">
                          <File size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-brand-text truncate max-w-[220px]">
                            {formData.bastName || 'BAST_Document.pdf'}
                          </p>
                          <p className="text-[10px] text-brand-gold font-bold uppercase tracking-wider">
                            BAST Uploaded & Verified
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          href={formData.bastUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-brand-muted hover:text-brand-gold hover:bg-white/10 rounded-lg transition-all"
                          title="View BAST Document"
                        >
                          <ExternalLink size={16} />
                        </a>
                        {canEditStatus && (
                          <button
                            type="button"
                            onClick={handleRemoveFile}
                            disabled={isSubmitting}
                            className="p-2 text-brand-muted hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                            title="Remove Document"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="relative group">
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={handleFileUpload}
                        disabled={!canEditStatus || isSubmitting || isUploading}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                      />
                      <div className={`flex flex-col items-center justify-center p-5 border-2 border-dashed rounded-xl bg-black/20 transition-all ${
                        formData.status === 'Completed'
                          ? 'border-rose-500/50 group-hover:border-rose-400 bg-rose-500/5'
                          : 'border-white/10 group-hover:border-brand-gold/40 group-hover:bg-white/5'
                      } ${isUploading ? 'opacity-50' : ''}`}>
                        {isUploading ? (
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="w-6 h-6 text-brand-gold animate-spin" />
                            <div className="w-36 h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <motion.div
                                className="h-full bg-brand-gold"
                                initial={{ width: 0 }}
                                animate={{ width: `${uploadProgress}%` }}
                              />
                            </div>
                            <p className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">
                              Uploading {Math.round(uploadProgress)}%
                            </p>
                          </div>
                        ) : (
                          <>
                            <div className="w-10 h-10 rounded-xl bg-brand-gold/10 flex items-center justify-center text-brand-gold mb-2 border border-brand-gold/20">
                              <Upload size={20} />
                            </div>
                            <p className="text-xs font-bold text-brand-text mb-0.5">
                              Click or drag to upload BAST PDF
                            </p>
                            <p className="text-[10px] text-brand-muted uppercase font-bold tracking-wider">
                              PDF Files Only (Max 10MB)
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-2">
                    Implementation Notes / Scope Details
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Add implementation scope, deliverables, or technical notes..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    disabled={!canEditStatus || isSubmitting}
                    className="w-full bg-brand-bg border border-white/10 rounded-2xl p-3 text-sm text-brand-text focus:outline-none focus:border-brand-gold/50 disabled:opacity-60 resize-none"
                  />
                </div>

                {/* Modal Footer Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-white/10">
                  <div>
                    {canDelete && editingItem && (
                      <button
                        type="button"
                        onClick={async () => {
                          await handleDeletePlan(editingItem);
                          setEditingItem(null);
                        }}
                        className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5"
                      >
                        <Trash2 size={15} />
                        <span>Delete Plan</span>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingItem(null)}
                      className="px-5 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-wider text-brand-muted hover:text-brand-text hover:bg-white/5 transition-all"
                    >
                      Cancel
                    </button>
                    {canEditStatus && (
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-6 py-2.5 bg-gold-gradient text-brand-bg rounded-2xl font-black text-xs uppercase tracking-wider hover:brightness-110 transition-all shadow-lg shadow-brand-gold/20 flex items-center gap-2"
                      >
                        {isSubmitting ? (
                          <>Saving...</>
                        ) : (
                          <>
                            <Check size={16} /> Save Plan
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ImplementationPlanComponent;

