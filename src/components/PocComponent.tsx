import React, { useState, useEffect } from 'react';
import { FlaskConical, Calendar, Clock, UserCheck, Search, Filter, Edit2, Building2, Check, X, AlertTriangle, Plus, Trash2, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Deal, Company, Contact, UserProfile, PocRecord, PocStatus, ImplementationInteractionLog } from '../types';
import { format, addWeeks } from 'date-fns';
import { db, collection, addDoc, updateDoc, deleteDoc, doc, Timestamp, handleFirestoreError, OperationType, logEvent } from '../firebase';
import { currencyService } from '../services/currencyService';

interface PocComponentProps {
  deals: Deal[];
  companies: Company[];
  contacts: Contact[];
  pocs: PocRecord[];
  users: UserProfile[];
  userId: string;
  userRole?: string;
}

export const PocComponent: React.FC<PocComponentProps> = ({
  deals,
  companies,
  contacts,
  pocs,
  users,
  userId,
  userRole,
}) => {
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal State for Add / Edit POC
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPocId, setEditingPocId] = useState<string | null>(null);
  const [modalDealSearch, setModalDealSearch] = useState('');

  const [formData, setFormData] = useState<{
    dealId: string;
    status: PocStatus;
    durationWeeks: string;
    startDate: string;
    targetEndDate: string;
    notes: string;
  }>({
    dealId: '',
    status: 'Required',
    durationWeeks: '2',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    targetEndDate: format(addWeeks(new Date(), 2), 'yyyy-MM-dd'),
    notes: '',
  });

  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [usdRate, setUsdRate] = useState<number | null>(null);

  const [expandedRowDealId, setExpandedRowDealId] = useState<string | null>(null);
  const [newLogDates, setNewLogDates] = useState<Record<string, string>>({});
  const [newLogNotes, setNewLogNotes] = useState<Record<string, string>>({});
  const [isSubmittingLog, setIsSubmittingLog] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchRate = async () => {
      const rates = await currencyService.getRates();
      if (rates?.rates?.USD) {
        setUsdRate(rates.rates.USD);
      }
    };
    fetchRate();
  }, []);

  // Filter deals at stage L3 and L4 (L3-show-interest, L4-negotiation) as the source for creating POCs
  const l3L4Deals = deals.filter(deal => {
    const stage = deal.stage;
    return stage === 'L3-show-interest' || stage === 'L4-negotiation';
  });

  const filteredL3L4Deals = l3L4Deals.filter(deal => {
    if (!modalDealSearch.trim()) return true;
    const searchLower = modalDealSearch.toLowerCase();
    const company = companies.find(c => c.id === deal.companyId);
    const companyName = company?.name || '';
    const stageDisplay = deal.stage || '';
    return (
      deal.title.toLowerCase().includes(searchLower) ||
      companyName.toLowerCase().includes(searchLower) ||
      stageDisplay.toLowerCase().includes(searchLower)
    );
  });

  // Map only explicitly listed POC records from Firestore
  const listPocItems = pocs.map(poc => {
    const deal = deals.find(d => d.id === poc.dealId);
    const company = companies.find(c => c.id === (poc.companyId || deal?.companyId));
    const contact = contacts.find(c => c.id === (poc.contactId || deal?.contactId));
    const owner = users.find(u => u.uid === (poc.ownerId || deal?.ownerId));

    return {
      poc,
      deal,
      company,
      contact,
      owner,
      status: poc.status,
      durationWeeks: poc.durationWeeks,
      startDate: poc.startDate,
      targetEndDate: poc.targetEndDate,
      notes: poc.notes,
    };
  });

  // Filter POC items by search & status
  const filteredItems = listPocItems.filter(item => {
    const matchesStatus = selectedStatusFilter === 'All' || item.status === selectedStatusFilter;
    const searchLower = searchTerm.toLowerCase();
    const dealTitle = item.deal?.title || item.poc.title || '';
    const companyName = item.company?.name || '';
    const ownerName = item.owner?.displayName || '';

    const matchesSearch =
      !searchTerm ||
      dealTitle.toLowerCase().includes(searchLower) ||
      companyName.toLowerCase().includes(searchLower) ||
      ownerName.toLowerCase().includes(searchLower);

    return matchesStatus && matchesSearch;
  });

  const handleOpenAddModal = () => {
    setModalDealSearch('');
    setEditingPocId(null);
    const firstDeal = l3L4Deals.length > 0 ? l3L4Deals[0].id : '';
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const defaultEndStr = format(addWeeks(new Date(), 2), 'yyyy-MM-dd');

    setFormData({
      dealId: firstDeal,
      status: 'Required',
      durationWeeks: '2',
      startDate: todayStr,
      targetEndDate: defaultEndStr,
      notes: '',
    });
    setValidationError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: typeof listPocItems[0]) => {
    setEditingPocId(item.poc.id);

    const initStartDate = item.startDate
      ? format(item.startDate.toDate(), 'yyyy-MM-dd')
      : format(new Date(), 'yyyy-MM-dd');

    const duration = item.durationWeeks ? String(item.durationWeeks) : '2';

    let initTargetEnd = '';
    if (item.targetEndDate) {
      initTargetEnd = format(item.targetEndDate.toDate(), 'yyyy-MM-dd');
    } else {
      const calculatedEnd = addWeeks(new Date(initStartDate), Number(duration) || 2);
      initTargetEnd = format(calculatedEnd, 'yyyy-MM-dd');
    }

    setFormData({
      dealId: item.poc.dealId,
      status: item.status,
      durationWeeks: duration,
      startDate: initStartDate,
      targetEndDate: initTargetEnd,
      notes: item.notes || '',
    });
    setValidationError(null);
    setIsModalOpen(true);
  };

  const handleDurationOrStartChange = (durationStr: string, startStr: string) => {
    let targetEnd = formData.targetEndDate;
    if (durationStr && !isNaN(Number(durationStr)) && Number(durationStr) > 0 && startStr) {
      const calculated = addWeeks(new Date(startStr), Number(durationStr));
      targetEnd = format(calculated, 'yyyy-MM-dd');
    }
    setFormData(prev => ({
      ...prev,
      durationWeeks: durationStr,
      startDate: startStr,
      targetEndDate: targetEnd,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingPocId && !formData.dealId) {
      setValidationError('Please select a deal from L3 or L4 stage.');
      return;
    }

    // MANDATORY FORM VALIDATION: duration in weeks is mandatory
    const numWeeks = Number(formData.durationWeeks);
    if (!formData.durationWeeks || isNaN(numWeeks) || numWeeks <= 0) {
      setValidationError('Duration of POC in weeks is mandatory and must be greater than 0.');
      return;
    }

    setValidationError(null);
    setIsSubmitting(true);

    try {
      const startTimestamp = formData.startDate ? Timestamp.fromDate(new Date(formData.startDate)) : Timestamp.now();
      const endTimestamp = formData.targetEndDate
        ? Timestamp.fromDate(new Date(formData.targetEndDate))
        : Timestamp.fromDate(addWeeks(new Date(formData.startDate), numWeeks));

      if (editingPocId) {
        // Update existing POC
        const pocRef = doc(db, 'pocs', editingPocId);
        await updateDoc(pocRef, {
          status: formData.status,
          durationWeeks: numWeeks,
          startDate: startTimestamp,
          targetEndDate: endTimestamp,
          notes: formData.notes || '',
          updatedBy: userId,
          updatedAt: Timestamp.now(),
        });
        await logEvent('POC Updated', `Updated POC: Status ${formData.status}, Duration ${numWeeks} weeks`);
      } else {
        // Create new POC
        const selectedDeal = deals.find(d => d.id === formData.dealId);
        if (!selectedDeal) {
          setValidationError('Selected deal not found.');
          setIsSubmitting(false);
          return;
        }

        const pocData: any = {
          dealId: selectedDeal.id,
          companyId: selectedDeal.companyId || null,
          contactId: selectedDeal.contactId || null,
          title: selectedDeal.title,
          value: selectedDeal.value,
          status: formData.status,
          durationWeeks: numWeeks,
          startDate: startTimestamp,
          targetEndDate: endTimestamp,
          notes: formData.notes || '',
          ownerId: selectedDeal.ownerId || userId,
          updatedBy: userId,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };

        await addDoc(collection(db, 'pocs'), pocData);
        await logEvent('POC Created', `Created POC for deal ${selectedDeal.title}: Status ${formData.status}, Duration ${numWeeks} weeks`);
      }

      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, editingPocId ? OperationType.UPDATE : OperationType.CREATE, 'pocs');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePoc = async (pocId: string, title: string) => {
    if (!window.confirm(`Are you sure you want to remove the POC for "${title}"?`)) return;
    try {
      await deleteDoc(doc(db, 'pocs', pocId));
      await logEvent('POC Deleted', `Deleted POC for ${title}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'pocs');
    }
  };

  const handleAddInteractionLog = async (dealId: string, pocId: string, poc: PocRecord, deal: Deal) => {
    const note = newLogNotes[dealId]?.trim();
    const dateStr = newLogDates[dealId] || format(new Date(), 'yyyy-MM-dd');

    if (!note) return;

    setIsSubmittingLog(prev => ({ ...prev, [dealId]: true }));
    try {
      const newLog: ImplementationInteractionLog = {
        id: crypto.randomUUID(),
        date: dateStr,
        note: note,
        createdAt: new Date().toISOString(),
        createdBy: users.find(u => u.uid === userId)?.displayName || 'Unknown User'
      };

      const updatedInteractions = [...(poc.interactions || []), newLog].sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      const pocRef = doc(db, 'pocs', pocId);
      await updateDoc(pocRef, {
        interactions: updatedInteractions,
        updatedAt: Timestamp.now()
      });

      await logEvent('POC Log Added', `Added interaction log for POC ${deal.title}`);
      
      setNewLogNotes(prev => ({ ...prev, [dealId]: '' }));
    } catch (error) {
      console.error('Error adding log:', error);
      handleFirestoreError(error, OperationType.UPDATE, 'pocs');
    } finally {
      setIsSubmittingLog(prev => ({ ...prev, [dealId]: false }));
    }
  };

  const handleDeleteInteractionLog = async (dealId: string, logId: string, pocId: string, poc: PocRecord) => {
    if (!window.confirm('Are you sure you want to delete this interaction log?')) return;

    try {
      const updatedInteractions = (poc.interactions || []).filter(log => log.id !== logId);

      const pocRef = doc(db, 'pocs', pocId);
      await updateDoc(pocRef, {
        interactions: updatedInteractions,
        updatedAt: Timestamp.now()
      });

      await logEvent('POC Log Deleted', `Deleted interaction log from POC for ${poc.title}`);
    } catch (error) {
      console.error('Error deleting log:', error);
      handleFirestoreError(error, OperationType.UPDATE, 'pocs');
    }
  };

  const formatCurrency = (amount: number) => {
    const idr = currencyService.formatIDR(amount);
    if (usdRate) {
      const usd = currencyService.formatUSD(amount * usdRate);
      return (
        <span className="font-bold text-sm text-brand-text">
          {idr} <span className="text-xs text-brand-muted font-normal">({usd})</span>
        </span>
      );
    }
    return <span className="font-bold text-sm text-brand-text">{idr}</span>;
  };

  const getStatusBadgeClass = (status: PocStatus) => {
    switch (status) {
      case 'Required':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.1)]';
      case 'Not Required':
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
      case 'Pending':
      default:
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]';
    }
  };

  const getStageDisplay = (stage?: string) => {
    switch (stage) {
      case 'L3-show-interest': return 'L3 - Show Interest';
      case 'L4-negotiation': return 'L4 - Negotiation';
      case 'L5-closed-won': return 'L5 - Closed Won';
      default: return stage || 'N/A';
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-brand-card p-6 md:p-8 rounded-3xl border border-white/10 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
              <FlaskConical size={24} />
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-brand-text tracking-tight uppercase">POC (Proof of Concept)</h1>
          </div>
          <p className="text-brand-muted text-sm max-w-2xl">
            Track and manage Proof of Concept requirements for active deals at L3 and L4 stages.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleOpenAddModal}
            className="px-5 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-2xl text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition-all hover:scale-105 active:scale-95"
          >
            <Plus size={18} /> Add New POC
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total POCs', count: pocs.length, color: 'text-brand-text', bg: 'bg-white/5' },
          { label: 'POC Required', count: pocs.filter(i => i.status === 'Required').length, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
          { label: 'POC Pending', count: pocs.filter(i => i.status === 'Pending').length, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          { label: 'Not Required', count: pocs.filter(i => i.status === 'Not Required').length, color: 'text-slate-400', bg: 'bg-slate-500/10' },
        ].map((kpi, idx) => (
          <div key={idx} className="bg-brand-card p-5 rounded-2xl border border-white/10 flex flex-col justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-brand-muted">{kpi.label}</span>
            <div className="flex items-baseline justify-between mt-3">
              <span className={`text-3xl font-black ${kpi.color}`}>{kpi.count}</span>
              <span className={`p-2 rounded-lg ${kpi.bg}`}>
                <FlaskConical size={18} className={kpi.color} />
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
            placeholder="Search deals, companies, sales owner..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-brand-card border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm text-brand-text placeholder-brand-muted focus:outline-none focus:border-cyan-500/50 transition-all"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
          <Filter size={16} className="text-brand-muted ml-1 hidden md:block" />
          {['All', 'Pending', 'Required', 'Not Required'].map(status => (
            <button
              key={status}
              onClick={() => setSelectedStatusFilter(status)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap uppercase tracking-wider border ${
                selectedStatusFilter === status
                  ? 'bg-cyan-500 text-slate-950 border-cyan-500 shadow-lg shadow-cyan-500/20'
                  : 'bg-brand-card text-brand-muted border-white/10 hover:border-white/20 hover:text-brand-text'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* POC Items Table */}
      {filteredItems.length === 0 ? (
        <div className="bg-brand-card border border-white/10 rounded-3xl p-12 text-center space-y-4">
          <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto text-brand-muted border border-white/10">
            <FlaskConical size={32} />
          </div>
          <h3 className="text-lg font-bold text-brand-text">No POC Records Found</h3>
          <p className="text-brand-muted text-sm max-w-md mx-auto">
            {pocs.length === 0
              ? 'No Proof of Concept records have been created yet. Click "Add New POC" above to create one from deals in stage L3 or L4.'
              : 'No POC records match the selected search or status filters.'}
          </p>
          {pocs.length === 0 && (
            <button
              onClick={handleOpenAddModal}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 rounded-xl font-bold text-xs uppercase tracking-wider transition-all"
            >
              <Plus size={16} /> Add First POC
            </button>
          )}
        </div>
      ) : (
        <div className="bg-brand-card rounded-3xl border border-white/5 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-white/5">
                  <th className="px-4 py-3.5 text-xs font-bold text-brand-muted uppercase tracking-wider !text-left">
                    Company
                  </th>
                  <th className="px-4 py-3.5 text-xs font-bold text-brand-muted uppercase tracking-wider !text-left">
                    Deal Title & Stage
                  </th>
                  <th className="px-4 py-3.5 text-xs font-bold text-brand-muted uppercase tracking-wider whitespace-nowrap text-brand-gold">
                    Value
                  </th>
                  <th className="px-4 py-3.5 text-xs font-bold text-brand-muted uppercase tracking-wider whitespace-nowrap">
                    POC Status
                  </th>
                  <th className="px-4 py-3.5 text-xs font-bold text-brand-muted uppercase tracking-wider whitespace-nowrap">
                    Duration
                  </th>
                  <th className="px-4 py-3.5 text-xs font-bold text-brand-muted uppercase tracking-wider whitespace-nowrap">
                    Target Dates
                  </th>
                  <th className="px-4 py-3.5 text-xs font-bold text-brand-muted uppercase tracking-wider whitespace-nowrap">
                    Sales Owner
                  </th>
                  <th className="px-4 py-3.5 text-xs font-bold text-brand-muted uppercase tracking-wider text-right whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredItems.map(item => {
                  const dealTitle = item.deal?.title || item.poc.title || 'Untitled Deal';
                  const dealValue = item.deal?.value ?? item.poc.value ?? 0;
                  const dealStage = item.deal?.stage;
                  const hasDuration = typeof item.durationWeeks === 'number' && item.durationWeeks > 0;

                  return (
                    <React.Fragment key={item.poc.id}>
                      <tr
                        className={`group hover:bg-white/5 transition-colors ${
                          expandedRowDealId === item.deal?.id ? 'bg-white/5' : ''
                        }`}
                      >
                      {/* Company */}
                      <td className="px-4 py-3.5 !text-left min-w-[140px]">
                        <div className="flex items-center justify-start gap-2.5 !text-left">
                          <div className="shrink-0 p-1.5 bg-white/5 rounded-lg border border-white/5">
                            <Building2 size={16} className="text-cyan-400" />
                          </div>
                          <span className="text-sm font-semibold text-brand-text leading-snug">
                            {item.company?.name || 'N/A'}
                          </span>
                        </div>
                      </td>

                      {/* Deal Title & Stage */}
                      <td className="px-4 py-3.5 !text-left min-w-[200px]">
                        <div className="flex items-center justify-start gap-2.5 !text-left">
                          <div className="w-8 h-8 bg-cyan-500/10 rounded-lg flex items-center justify-center text-cyan-400 shrink-0 border border-cyan-500/10">
                            <FlaskConical size={16} />
                          </div>
                          <div className="flex flex-col items-start !text-left min-w-0">
                            <span className="text-sm font-bold text-brand-text truncate max-w-[220px]">
                              {dealTitle}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Value */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-sm">
                        {formatCurrency(dealValue)}
                      </td>

                      {/* POC Status */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${getStatusBadgeClass(item.status)}`}>
                          {item.status}
                        </span>
                      </td>

                      {/* Duration */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-1.5">
                          <Clock size={15} className="text-cyan-400 shrink-0" />
                          <span className={hasDuration ? 'font-bold text-cyan-400 text-sm' : 'text-amber-400 italic text-xs'}>
                            {hasDuration ? `${item.durationWeeks} Wks` : 'Not set'}
                          </span>
                        </div>
                      </td>

                      {/* Target Dates */}
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

                      {/* Sales Owner */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-sm text-brand-text font-semibold">
                        {item.owner?.displayName || 'Unassigned'}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className={`flex items-center justify-end gap-1.5 transition-opacity ${
                          expandedRowDealId === item.deal?.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}>
                          {item.deal && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedRowDealId(expandedRowDealId === item.deal?.id ? null : item.deal!.id);
                              }}
                              className={`p-2 rounded-xl transition-all flex items-center gap-1.5 ${
                                expandedRowDealId === item.deal?.id ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-white/5 text-brand-muted border border-white/10 hover:border-cyan-500/30 hover:text-cyan-400'
                              }`}
                              title={expandedRowDealId === item.deal?.id ? 'Close interactions' : 'View interactions'}
                            >
                              {expandedRowDealId !== item.deal?.id && item.poc.interactions && item.poc.interactions.length > 0 && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                  expandedRowDealId === item.deal?.id ? 'bg-cyan-500/30 text-cyan-300' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                                }`}>
                                  {item.poc.interactions.length}
                                </span>
                              )}
                              {expandedRowDealId === item.deal?.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenEditModal(item)}
                            className="p-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all"
                            title="Edit POC"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeletePoc(item.poc.id, dealTitle)}
                            className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all"
                            title="Delete POC"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Interaction Log Drop Down Panel */}
                    {expandedRowDealId === item.deal?.id && item.deal && (
                      <tr className="bg-brand-bg/70 border-b border-white/10">
                        <td colSpan={8} className="p-4 md:p-5">
                          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 md:p-5 space-y-4">
                            {/* Drop Down Panel Header */}
                            <div className="flex items-center justify-between pb-3 border-b border-white/10">
                              <div className="flex items-center gap-2.5">
                                <div className="p-2 bg-cyan-500/10 rounded-xl text-cyan-400 border border-cyan-500/20">
                                  <MessageSquare size={16} />
                                </div>
                                <div>
                                  <h4 className="text-sm font-bold text-brand-text flex items-center gap-2">
                                    Interaction Logs
                                    <span className="text-xs font-semibold px-2 py-0.5 bg-cyan-500/10 text-cyan-400 rounded-full border border-cyan-500/20">
                                      {(item.poc.interactions || []).length} {(item.poc.interactions || []).length === 1 ? 'entry' : 'entries'}
                                    </span>
                                  </h4>
                                  <p className="text-xs text-brand-muted mt-0.5">
                                    Track date and note interactions for {dealTitle}
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
                              <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider block">
                                Add Interaction Log
                              </span>
                              <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
                                <div className="shrink-0 sm:w-44 space-y-1">
                                  <label className="block text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                                    Date <span className="text-cyan-400">*</span>
                                  </label>
                                  <input
                                    type="date"
                                    value={newLogDates[item.deal.id] || format(new Date(), 'yyyy-MM-dd')}
                                    onChange={(e) => setNewLogDates(prev => ({ ...prev, [item.deal!.id]: e.target.value }))}
                                    className="w-full bg-brand-bg border border-white/10 rounded-xl px-3 py-2 text-xs text-brand-text focus:outline-none focus:border-cyan-500/50 transition-all font-semibold"
                                  />
                                </div>
                                <div className="flex-1 space-y-1">
                                  <label className="block text-[11px] font-bold text-brand-muted uppercase tracking-wider">
                                    Note <span className="text-cyan-400">*</span>
                                  </label>
                                  <input
                                    type="text"
                                    value={newLogNotes[item.deal.id] || ''}
                                    onChange={(e) => setNewLogNotes(prev => ({ ...prev, [item.deal!.id]: e.target.value }))}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddInteractionLog(item.deal!.id, item.poc.id, item.poc, item.deal!);
                                      }
                                    }}
                                    placeholder="Enter interaction note or activity summary..."
                                    className="w-full bg-brand-bg border border-white/10 rounded-xl px-3.5 py-2 text-xs text-brand-text placeholder:text-brand-muted/50 focus:outline-none focus:border-cyan-500/50 transition-all"
                                  />
                                </div>
                                <div className="shrink-0">
                                  <button
                                    type="button"
                                    disabled={isSubmittingLog[item.deal.id]}
                                    onClick={() => handleAddInteractionLog(item.deal!.id, item.poc.id, item.poc, item.deal!)}
                                    className="w-full sm:w-auto px-4 py-2 bg-cyan-500 text-brand-bg hover:brightness-110 font-black text-xs rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm uppercase tracking-wider"
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
                              {!(item.poc.interactions?.length) ? (
                                <div className="text-center py-6 border border-dashed border-white/10 rounded-2xl bg-black/10">
                                  <MessageSquare size={20} className="mx-auto text-brand-muted/40 mb-1.5" />
                                  <p className="text-xs text-brand-muted font-medium">No interaction logs recorded yet.</p>
                                  <p className="text-[11px] text-brand-muted/60 mt-0.5">Fill in the date and note above to save the first interaction log.</p>
                                </div>
                              ) : (
                                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                  {item.poc.interactions.map(log => (
                                    <div
                                      key={log.id}
                                      className="p-3 bg-black/20 hover:bg-white/5 border border-white/5 rounded-xl transition-colors flex items-start justify-between gap-3 group/log"
                                    >
                                      <div className="flex items-start gap-3 flex-1 min-w-0">
                                        <div className="shrink-0 px-2.5 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-400 text-xs font-bold flex items-center gap-1.5 mt-0.5">
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
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteInteractionLog(item.deal!.id, log.id, item.poc.id, item.poc)}
                                        className="text-brand-muted/40 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 opacity-0 group-hover/log:opacity-100 transition-all shrink-0"
                                        title="Delete interaction log"
                                      >
                                        <Trash2 size={13} />
                                      </button>
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

      {/* Add / Edit POC Modal */}
      <AnimatePresence>
        {isModalOpen && (
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
                    <FlaskConical className="text-cyan-400" size={22} />
                    {editingPocId ? 'Update POC Details' : 'Add New POC'}
                  </h2>
                  <p className="text-xs text-brand-muted mt-1">
                    {editingPocId
                      ? 'Modify Proof of Concept requirements or status.'
                      : 'Select a deal from stage L3 or L4 to create a POC record.'}
                  </p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 text-brand-muted hover:text-brand-text hover:bg-white/10 rounded-xl transition-all"
                >
                  <X size={20} />
                </button>
              </div>

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
                {/* Select Deal (only shown when creating new) */}
                {!editingPocId ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider">
                        Source Deal (L3 & L4 Stages) <span className="text-cyan-400">*</span>
                      </label>
                      <span className="text-[11px] text-brand-muted font-medium">
                        {filteredL3L4Deals.length} deal{filteredL3L4Deals.length !== 1 ? 's' : ''} found
                      </span>
                    </div>

                    {/* Search Input inside New POC Modal */}
                    <div className="relative">
                      <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none" />
                      <input
                        type="text"
                        value={modalDealSearch}
                        onChange={(e) => {
                          const query = e.target.value;
                          setModalDealSearch(query);
                          const matches = l3L4Deals.filter(d => {
                            if (!query.trim()) return true;
                            const sLower = query.toLowerCase();
                            const comp = companies.find(c => c.id === d.companyId);
                            return (
                              d.title.toLowerCase().includes(sLower) ||
                              (comp?.name || '').toLowerCase().includes(sLower) ||
                              (d.stage || '').toLowerCase().includes(sLower)
                            );
                          });
                          if (matches.length > 0 && !matches.some(m => m.id === formData.dealId)) {
                            setFormData(prev => ({ ...prev, dealId: matches[0].id }));
                          }
                        }}
                        placeholder="Search deal title, company name, or stage..."
                        className="w-full bg-brand-bg border border-white/10 rounded-2xl pl-9 pr-8 py-2.5 text-xs text-brand-text placeholder:text-brand-muted/60 focus:outline-none focus:border-cyan-500/50 transition-all"
                      />
                      {modalDealSearch && (
                        <button
                          type="button"
                          onClick={() => {
                            setModalDealSearch('');
                            if (l3L4Deals.length > 0 && !l3L4Deals.some(d => d.id === formData.dealId)) {
                              setFormData(prev => ({ ...prev, dealId: l3L4Deals[0].id }));
                            }
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-text p-0.5"
                          title="Clear search"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    {l3L4Deals.length === 0 ? (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-xs text-amber-300 font-medium">
                        No active deals found at stage L3 (Show Interest) or L4 (Negotiation).
                      </div>
                    ) : filteredL3L4Deals.length === 0 ? (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-xs text-amber-300 font-medium">
                        No deals match "{modalDealSearch}". Try a different search term.
                      </div>
                    ) : (
                      <select
                        value={formData.dealId}
                        onChange={(e) => setFormData({ ...formData, dealId: e.target.value })}
                        disabled={isSubmitting}
                        required
                        className="w-full bg-brand-bg border border-white/10 rounded-2xl p-3 text-sm text-brand-text focus:outline-none focus:border-cyan-500/50 cursor-pointer font-semibold"
                      >
                        {filteredL3L4Deals.map(deal => {
                          const company = companies.find(c => c.id === deal.companyId);
                          const stageLabel = deal.stage === 'L3-show-interest' ? 'L3' : 'L4';
                          return (
                            <option key={deal.id} value={deal.id}>
                              [{stageLabel}] {deal.title} {company ? `— ${company.name}` : ''}
                            </option>
                          );
                        })}
                      </select>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-xs space-y-1">
                    <span className="font-bold text-brand-muted uppercase text-[10px]">Deal Title:</span>
                    <p className="text-sm font-bold text-brand-text">
                      {pocs.find(p => p.id === editingPocId)?.title || 'Deal'}
                    </p>
                  </div>
                )}

                {/* POC Status Selection */}
                <div>
                  <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-2">
                    POC Status <span className="text-cyan-400">*</span>
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as PocStatus })}
                    disabled={isSubmitting}
                    className="w-full bg-brand-bg border border-white/10 rounded-2xl p-3 text-sm text-brand-text focus:outline-none focus:border-cyan-500/50"
                  >
                    <option value="Required">Required</option>
                    <option value="Pending">Pending</option>
                    <option value="Not Required">Not Required</option>
                  </select>
                </div>

                {/* Duration in Weeks (MANDATORY FIELD) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-cyan-400 uppercase tracking-wider">
                      POC Duration (in weeks) <span className="text-rose-400 font-bold">* MANDATORY</span>
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="e.g. 2"
                      value={formData.durationWeeks}
                      onChange={(e) => handleDurationOrStartChange(e.target.value, formData.startDate)}
                      disabled={isSubmitting}
                      required
                      className="w-full bg-brand-bg border-2 border-cyan-500/40 focus:border-cyan-400 rounded-2xl p-3 pl-4 pr-16 text-sm font-bold text-brand-text focus:outline-none transition-all"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-cyan-400">
                      Weeks
                    </span>
                  </div>
                  <p className="text-[11px] text-brand-muted mt-1">
                    Specify duration in weeks. Target end date is automatically calculated.
                  </p>
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
                      onChange={(e) => handleDurationOrStartChange(formData.durationWeeks, e.target.value)}
                      disabled={isSubmitting}
                      className="w-full bg-brand-bg border border-white/10 rounded-2xl p-3 text-sm text-brand-text focus:outline-none focus:border-cyan-500/50"
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
                      disabled={isSubmitting}
                      className="w-full bg-brand-bg border border-white/10 rounded-2xl p-3 text-sm text-brand-text focus:outline-none focus:border-cyan-500/50"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-2">
                    POC Scope / Deliverables / Requirements
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Add technical requirements, scope of work, or criteria for POC success..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    disabled={isSubmitting}
                    className="w-full bg-brand-bg border border-white/10 rounded-2xl p-3 text-sm text-brand-text focus:outline-none focus:border-cyan-500/50 resize-none"
                  />
                </div>

                {/* Modal Footer Buttons */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-wider text-brand-muted hover:text-brand-text hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || (!editingPocId && l3L4Deals.length === 0)}
                    className="px-6 py-2.5 bg-cyan-500 text-slate-950 rounded-2xl font-black text-xs uppercase tracking-wider hover:brightness-110 transition-all shadow-lg shadow-cyan-500/20 flex items-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>Saving...</>
                    ) : (
                      <>
                        <Check size={16} /> {editingPocId ? 'Save POC Status' : 'Create POC Record'}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PocComponent;

