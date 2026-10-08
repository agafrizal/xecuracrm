import React, { useState, useEffect } from 'react';
import { Plus, Calendar, Edit2, Trash2, X, Receipt, Building2, Users as UsersIcon, Briefcase, DollarSign, FileText, AlertTriangle, File, Printer, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Invoice, InvoiceStatus, Contact, Company, Deal, PurchaseOrder, UserProfile } from '../types';
import { format } from 'date-fns';
import { addDoc, collection, db, updateDoc, doc, deleteDoc, Timestamp, OperationType, handleFirestoreError, logEvent } from '../firebase';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import { currencyService } from '../services/currencyService';
import { generateNextInvoiceNumber } from '../utils/invoiceNumberGenerator';

import Autocomplete from './Autocomplete';
import { Search } from 'lucide-react';
import InvoicePreview from './InvoicePreview';

interface InvoicesProps {
  invoices: Invoice[];
  purchaseOrders: PurchaseOrder[];
  contacts: Contact[];
  companies: Company[];
  deals: Deal[];
  userId: string;
  users: UserProfile[];
  userRole?: string;
}

const Invoices: React.FC<InvoicesProps> = ({ invoices, purchaseOrders, contacts, companies, deals, userId, users, userRole }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [selectedPoForView, setSelectedPoForView] = useState<PurchaseOrder | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [usdRate, setUsdRate] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    invoiceNumber: '',
    title: '',
    companyId: '',
    contactId: '',
    dealId: '',
    poId: '',
    amount: 0,
    items: [] as any[], // Using any[] here, but will cast later to avoid import issues if not present
    status: 'draft' as InvoiceStatus,
    issueDate: format(new Date(), 'yyyy-MM-dd'),
    dueDate: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'), // Default 30 days
  });

  const isPrivileged = userRole === 'admin' || userRole === 'manager' || userRole === 'super_user' || userRole === 'engineer' || userRole === 'finance' || userRole === 'procurement' || userRole === 'project_manager';

  useEffect(() => {
    const fetchRate = async () => {
      const rates = await currencyService.getRates();
      if (rates && rates.rates.USD) {
        setUsdRate(rates.rates.USD);
      }
    };
    fetchRate();
  }, []);

  const formatCurrency = (amount: number) => {
    const idr = currencyService.formatIDR(amount);
    if (usdRate) {
      const usd = currencyService.formatUSD(amount * usdRate);
      return (
        <div className="flex flex-col">
          <span className="font-bold text-brand-text">{idr}</span>
          <span className="text-[10px] text-brand-muted font-normal">≈ {usd}</span>
        </div>
      );
    }
    return <span className="font-bold text-brand-text">{idr}</span>;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const selectedCompany = companies.find(c => c.id === formData.companyId);
      const invoiceOwnerId = selectedCompany?.ownerId || userId;

      const invoiceData: any = {
        invoiceNumber: formData.invoiceNumber,
        title: formData.title,
        companyId: formData.companyId,
        contactId: formData.contactId || null,
        dealId: formData.dealId || null,
        poId: formData.poId || null,
        amount: Number(formData.amount),
        items: formData.items || [],
        status: formData.status,
        issueDate: Timestamp.fromDate(new Date(formData.issueDate)),
        dueDate: Timestamp.fromDate(new Date(formData.dueDate)),
        ownerId: invoiceOwnerId,
        updatedAt: Timestamp.now(),
      };

      if (editingInvoice) {
        const invoiceRef = doc(db, 'invoices', editingInvoice.id);
        await updateDoc(invoiceRef, invoiceData);
        await logEvent('Invoice Updated', `Invoice: ${formData.invoiceNumber} - ${formData.title}`);
      } else {
        invoiceData.createdAt = Timestamp.now();
        await addDoc(collection(db, 'invoices'), invoiceData);
        
        // Create notification
        await addDoc(collection(db, 'notifications'), {
          userId: userId,
          title: 'Invoice Created',
          message: `Invoice ${formData.invoiceNumber} has been created successfully.`,
          type: 'success',
          read: false,
          relatedType: 'invoice',
          createdAt: Timestamp.now()
        });

        await logEvent('Invoice Created', `Invoice: ${formData.invoiceNumber} - ${formData.title}`);
      }
      setIsModalOpen(false);
      setEditingInvoice(null);
      setFormData({
        invoiceNumber: '',
        title: '',
        companyId: '',
        contactId: '',
        dealId: '',
        poId: '',
        amount: 0,
        items: [],
        status: 'draft',
        issueDate: format(new Date(), 'yyyy-MM-dd'),
        dueDate: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
      });
    } catch (error) {
      handleFirestoreError(error, editingInvoice ? OperationType.UPDATE : OperationType.CREATE, 'invoices');
    }
  };

  const handleDelete = async (id: string) => {
    setInvoiceToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!invoiceToDelete) return;
    const invoice = invoices.find(i => i.id === invoiceToDelete);
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'invoices', invoiceToDelete));
      if (invoice) {
        await logEvent('Invoice Deleted', `Invoice: ${invoice.invoiceNumber}`);
      }
      setIsDeleteModalOpen(false);
      setInvoiceToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `invoices/${invoiceToDelete}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const openEditModal = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    const matchingPo = purchaseOrders.find(p => p.id === invoice.poId);
    const defaultTitle = matchingPo ? matchingPo.title : invoice.title;
    const defaultAmount = matchingPo ? matchingPo.amount : invoice.amount;
    const defaultItems = (invoice.items && invoice.items.length > 0)
      ? invoice.items.map(item => ({
          ...item,
          description: matchingPo ? (matchingPo.title || item.description) : item.description,
          unitPrice: matchingPo ? (invoice.items.length === 1 ? matchingPo.amount : item.unitPrice) : item.unitPrice,
          amount: matchingPo ? (invoice.items.length === 1 ? matchingPo.amount : item.amount) : item.amount,
        }))
      : [
          {
            id: Math.random().toString(36).substr(2, 9),
            description: defaultTitle || 'Service',
            qty: 1,
            unitPrice: defaultAmount,
            amount: defaultAmount
          }
        ];

    setFormData({
      invoiceNumber: invoice.invoiceNumber,
      title: defaultTitle,
      companyId: invoice.companyId,
      contactId: invoice.contactId || '',
      dealId: invoice.dealId || '',
      poId: invoice.poId || '',
      amount: defaultAmount,
      items: defaultItems,
      status: invoice.status,
      issueDate: format(invoice.issueDate.toDate(), 'yyyy-MM-dd'),
      dueDate: format(invoice.dueDate.toDate(), 'yyyy-MM-dd'),
    });
    setIsModalOpen(true);
  };

  const getCompanyName = (id: string) => companies.find(c => c.id === id)?.name || 'Unknown Company';
  const getPONumber = (id: string) => purchaseOrders.find(p => p.id === id)?.poNumber || 'N/A';

  const getStatusColor = (status: InvoiceStatus) => {
    switch (status) {
      case 'draft': return 'bg-white/5 text-brand-muted border-white/10';
      case 'sent': return 'bg-brand-gold/10 text-brand-gold border-brand-gold/20';
      case 'paid': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'overdue': return 'bg-brand-red/10 text-brand-red border-brand-red/20';
      case 'cancelled': return 'bg-white/5 text-brand-muted/40 border-white/10 line-through opacity-50';
      default: return 'bg-white/5 text-brand-muted border-white/10';
    }
  };

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = invoice.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesOwner = selectedOwnerId === 'all' || invoice.ownerId === selectedOwnerId;
    return matchesSearch && matchesOwner;
  });

  const sortedInvoices = [...filteredInvoices].sort((a, b) => b.issueDate.toMillis() - a.issueDate.toMillis());

  const isOverdue = (dueDate: Timestamp, status: InvoiceStatus) => {
    return status !== 'paid' && status !== 'cancelled' && dueDate.toDate() < new Date();
  };

  const isNearingDue = (dueDate: Timestamp, status: InvoiceStatus) => {
    if (status === 'paid' || status === 'cancelled') return false;
    const now = new Date();
    const due = dueDate.toDate();
    const diffTime = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 14;
  };

  const handleAddItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [
        ...prev.items,
        { id: Math.random().toString(36).substr(2, 9), description: '', qty: 1, unitPrice: 0, amount: 0 }
      ]
    }));
  };

  const handleRemoveItem = (id: string) => {
    setFormData(prev => {
      const newItems = prev.items.filter(item => item.id !== id);
      const newAmount = newItems.reduce((sum, item) => sum + item.amount, 0);
      return { ...prev, items: newItems, amount: newAmount };
    });
  };

  const handleItemChange = (id: string, field: string, value: string | number) => {
    setFormData(prev => {
      const newItems = prev.items.map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value };
          if (field === 'qty' || field === 'unitPrice') {
            updatedItem.amount = Number(updatedItem.qty) * Number(updatedItem.unitPrice);
          }
          return updatedItem;
        }
        return item;
      });
      const newAmount = newItems.reduce((sum, item) => sum + item.amount, 0);
      return { ...prev, items: newItems, amount: newAmount };
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-4 max-w-2xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted/40" size={20} />
            <input
              type="text"
              placeholder="Search invoices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-brand-card border border-white/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold/10 transition-all text-brand-text placeholder:text-brand-muted/30"
            />
          </div>
          <div className="w-48">
            <select
              value={selectedOwnerId}
              onChange={(e) => setSelectedOwnerId(e.target.value)}
              className="w-full px-4 py-2.5 bg-brand-card border border-white/5 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/10 transition-all text-sm font-bold uppercase tracking-wider"
            >
              <option value="all">All Users</option>
              {users.map(u => (
                <option key={u.uid} value={u.uid}>{u.displayName} ({u.role ? u.role.replace('_', ' ').toUpperCase() : 'USER'})</option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={() => {
            setEditingInvoice(null);
            const initialDate = new Date();
            setFormData({
              invoiceNumber: generateNextInvoiceNumber(invoices, initialDate),
              title: '',
              companyId: '',
              contactId: '',
              dealId: '',
              poId: '',
              amount: 0,
              items: [
                { id: Math.random().toString(36).substr(2, 9), description: '', qty: 1, unitPrice: 0, amount: 0 }
              ],
              status: 'draft',
              issueDate: format(new Date(), 'yyyy-MM-dd'),
              dueDate: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
            });
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 bg-gold-gradient text-brand-bg px-6 py-2.5 rounded-xl font-bold hover:opacity-90 transition-all shadow-lg shadow-brand-gold/10 uppercase tracking-widest text-sm"
        >
          <Plus size={20} />
          New Invoice
        </button>
      </div>

      <div className="bg-brand-card rounded-3xl border border-white/5 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/5">
                <th className="px-4 py-3 text-[10px] font-bold text-brand-muted uppercase tracking-widest !text-left whitespace-nowrap">
                  Company
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-brand-muted uppercase tracking-widest !text-left">
                  Invoice Details
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-brand-muted uppercase tracking-widest whitespace-nowrap">
                  Amount
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-brand-muted uppercase tracking-widest whitespace-nowrap">
                  Status
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-brand-muted uppercase tracking-widest whitespace-nowrap">
                  Date
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sortedInvoices.map((invoice) => (
                <tr key={invoice.id} className="group hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 !text-left whitespace-nowrap min-w-[140px]">
                    <div className="flex items-center justify-start gap-3 !text-left">
                      <div className="shrink-0 p-2 bg-white/5 rounded-lg border border-white/5">
                        <Building2 size={16} className="text-brand-gold/60" />
                      </div>
                      <span className="text-brand-text font-medium !text-left leading-snug">
                        {getCompanyName(invoice.companyId)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 !text-left min-w-[200px]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-gold/10 flex items-center justify-center text-brand-gold border border-brand-gold/20 shrink-0">
                        <Receipt size={18} />
                      </div>
                      <div className="flex flex-col items-start !text-left">
                        <p className="font-bold text-brand-text !text-left leading-tight group-hover:text-brand-gold transition-colors">{invoice.title}</p>
                        <span className="text-[10px] font-mono text-brand-muted/60 mt-1">{invoice.invoiceNumber}</span>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {invoice.poId && (() => {
                            const matchingPo = purchaseOrders.find(p => p.id === invoice.poId);
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (matchingPo) {
                                    setSelectedPoForView(matchingPo);
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-brand-gold/10 text-brand-gold hover:bg-brand-gold/20 hover:text-white border border-brand-gold/30 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer group/pobtn"
                                title="Click to view Purchase Order details"
                              >
                                <FileText size={11} className="text-brand-gold group-hover/pobtn:scale-110 transition-transform" />
                                <span>PO: {matchingPo ? matchingPo.poNumber : getPONumber(invoice.poId)}</span>
                                <ExternalLink size={10} className="ml-0.5 opacity-70 group-hover/pobtn:opacity-100" />
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatCurrency(invoice.amount)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-col items-start gap-1">
                      {(() => {
                        const overdue = isOverdue(invoice.dueDate, invoice.status);
                        const displayStatus = overdue ? 'overdue' : invoice.status;
                        return (
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider inline-block ${getStatusColor(displayStatus)}`}>
                            {displayStatus}
                          </span>
                        );
                      })()}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-col gap-1 text-[10px] font-medium text-brand-muted uppercase tracking-widest">
                      <span className="flex items-center gap-1.5"><Calendar size={12} className="text-brand-gold/40 shrink-0" /> Issued: {format(invoice.issueDate.toDate(), 'MMM d, yyyy')}</span>
                      <span className="flex items-center gap-1.5 font-bold">
                        <Calendar size={12} className={invoice.status === 'overdue' ? 'text-brand-red shrink-0' : 'text-brand-gold/60 shrink-0'} />
                        Due: {format(invoice.dueDate.toDate(), 'MMM d, yyyy')}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewInvoice(invoice);
                        }}
                        className="p-1.5 text-brand-muted hover:text-brand-gold hover:bg-brand-gold/10 rounded-lg transition-all"
                        title="Generate PDF"
                      >
                        <Printer size={14} />
                      </button>
                      {(userRole === 'admin' || userRole === 'manager' || userRole === 'super_user' || userRole === 'engineer' || userRole === 'finance' || userRole === 'procurement' || userRole === 'project_manager' || invoice.ownerId === userId) && (
                        <>
                          <button onClick={() => openEditModal(invoice)} className="p-1.5 text-brand-muted hover:text-brand-gold hover:bg-brand-gold/10 rounded-lg transition-all">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => handleDelete(invoice.id)} className="p-1.5 text-brand-muted hover:text-brand-red hover:bg-brand-red/10 rounded-lg transition-all">
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-brand-muted font-medium italic border-dashed border-white/10">
                    No invoices found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title="Delete Invoice"
        message="Are you sure you want to delete this invoice? This action cannot be undone."
        isDeleting={isDeleting}
      />

      {/* PO Detail View Modal */}
      <AnimatePresence>
        {selectedPoForView && (
          <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPoForView(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-xl bg-brand-card rounded-2xl shadow-2xl border border-brand-gold/20 overflow-hidden text-brand-text"
            >
              {/* Header */}
              <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-gold/10 flex items-center justify-center text-brand-gold border border-brand-gold/20 shrink-0">
                    <FileText size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-brand-gold px-2 py-0.5 rounded bg-brand-gold/10 border border-brand-gold/20">
                        {selectedPoForView.poNumber}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {selectedPoForView.status}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-brand-text mt-1">{selectedPoForView.title}</h3>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPoForView(null)}
                  className="p-2 text-brand-muted hover:text-brand-text hover:bg-white/10 rounded-xl transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
                {/* Key Metrics */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                    <span className="text-[10px] font-bold text-brand-muted uppercase tracking-wider block mb-1">
                      Total Amount
                    </span>
                    <span className="text-lg font-mono font-bold text-brand-gold">
                      Rp {currencyService.formatIDR(selectedPoForView.amount)}
                    </span>
                  </div>
                  <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                    <span className="text-[10px] font-bold text-brand-muted uppercase tracking-wider block mb-1">
                      Company
                    </span>
                    <span className="text-sm font-bold text-brand-text truncate block">
                      {getCompanyName(selectedPoForView.companyId)}
                    </span>
                  </div>
                </div>

                {/* PO Info Grid */}
                <div className="space-y-3 bg-black/20 p-4 rounded-xl border border-white/5 text-xs">
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-brand-muted">Issue Date:</span>
                    <span className="font-bold text-brand-text">
                      {selectedPoForView.issueDate ? format(selectedPoForView.issueDate.toDate(), 'MMMM d, yyyy') : '-'}
                    </span>
                  </div>
                  {(selectedPoForView.startDate || selectedPoForView.endDate) && (
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-brand-muted">Period / Duration:</span>
                      <span className="font-bold text-brand-text">
                        {selectedPoForView.startDate ? format(selectedPoForView.startDate.toDate(), 'MMM d, yyyy') : 'N/A'}
                        {' s/d '}
                        {selectedPoForView.endDate ? format(selectedPoForView.endDate.toDate(), 'MMM d, yyyy') : 'N/A'}
                      </span>
                    </div>
                  )}
                  {selectedPoForView.dealId && (
                    <div className="flex justify-between py-1">
                      <span className="text-brand-muted">Linked Deal:</span>
                      <span className="font-bold text-brand-gold">
                        {deals.find(d => d.id === selectedPoForView.dealId)?.title || selectedPoForView.dealId}
                      </span>
                    </div>
                  )}
                </div>

                {/* Documents Section */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-brand-gold uppercase tracking-wider flex items-center gap-1.5">
                    <File size={14} /> Attached PO Documents
                  </h4>
                  <div className="grid grid-cols-1 gap-2.5">
                    {selectedPoForView.poUrl ? (
                      <a
                        href={selectedPoForView.poUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-3.5 bg-brand-gold/10 hover:bg-brand-gold/20 border border-brand-gold/30 rounded-xl transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-brand-gold/20 rounded-lg text-brand-gold">
                            <FileText size={18} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-brand-text group-hover:text-brand-gold transition-colors">
                              {selectedPoForView.poName || 'Purchase_Order_Document.pdf'}
                            </p>
                            <p className="text-[10px] text-brand-gold font-bold uppercase tracking-wider">
                              Official PO Document
                            </p>
                          </div>
                        </div>
                        <span className="flex items-center gap-1 text-xs font-bold text-brand-gold px-3 py-1.5 rounded-lg bg-brand-gold/20 border border-brand-gold/30">
                          Open File <ExternalLink size={12} />
                        </span>
                      </a>
                    ) : (
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5 text-xs text-brand-muted italic">
                        No main PO PDF document attached to this PO record.
                      </div>
                    )}

                    {selectedPoForView.bastUrl && (
                      <a
                        href={selectedPoForView.bastUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all group"
                      >
                        <div className="flex items-center gap-2.5">
                          <File size={16} className="text-brand-gold" />
                          <span className="text-xs font-bold text-brand-text">
                            {selectedPoForView.bastName || 'BAST_Document.pdf'}
                          </span>
                        </div>
                        <span className="flex items-center gap-1 text-[11px] font-bold text-brand-gold">
                          View BAST <ExternalLink size={11} />
                        </span>
                      </a>
                    )}

                    {selectedPoForView.msaUrl && (
                      <a
                        href={selectedPoForView.msaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all group"
                      >
                        <div className="flex items-center gap-2.5">
                          <File size={16} className="text-brand-gold" />
                          <span className="text-xs font-bold text-brand-text">
                            {selectedPoForView.msaName || 'MSA_Document.pdf'}
                          </span>
                        </div>
                        <span className="flex items-center gap-1 text-[11px] font-bold text-brand-gold">
                          View MSA <ExternalLink size={11} />
                        </span>
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 bg-white/5 border-t border-white/10 flex justify-end">
                <button
                  onClick={() => setSelectedPoForView(null)}
                  className="px-5 py-2 bg-white/10 hover:bg-white/20 text-brand-text text-xs font-bold rounded-xl transition-all uppercase tracking-wider"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {previewInvoice && (
        <InvoicePreview 
          invoice={previewInvoice}
          company={companies.find(c => c.id === previewInvoice.companyId)}
          po={purchaseOrders.find(p => p.id === previewInvoice.poId)}
          userRole={userRole}
          onClose={() => setPreviewInvoice(null)}
          onInvoiceUpdated={(updatedInv) => {
            setPreviewInvoice(updatedInv);
          }}
        />
      )}

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 flex items-center justify-center z-[60] p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl bg-brand-card rounded-2xl shadow-2xl border border-brand-gold/20 overflow-hidden"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                <h3 className="text-xl font-bold text-brand-gold uppercase tracking-widest">{editingInvoice ? 'Edit Invoice' : 'New Invoice'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-brand-muted hover:text-brand-gold hover:bg-white/10 rounded-lg transition-colors">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-5 bg-brand-card">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Invoice Number *</label>
                    <input
                      required
                      type="text"
                      value={formData.invoiceNumber}
                      onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all font-medium"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Title *</label>
                    <input
                      required
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all font-medium placeholder:text-brand-muted/30"
                      placeholder="e.g., Monthly Service Fee - March"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Autocomplete
                    label="Company"
                    required
                    options={companies.map(c => ({ id: c.id, label: c.name }))}
                    value={formData.companyId}
                    onChange={(id) => setFormData({ ...formData, companyId: id, contactId: '', dealId: '', poId: '' })}
                    placeholder="Select Company..."
                  />
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Total Amount (IDR)</label>
                    <div className="relative">
                      <div className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-brand-text font-medium flex flex-col justify-center h-12">
                        {currencyService.formatIDR(formData.amount)}
                        {usdRate && formData.amount > 0 && (
                          <span className="text-[9px] text-brand-gold font-bold uppercase tracking-widest mt-0.5">
                            ≈ {currencyService.formatUSD(formData.amount * usdRate)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Incoming Purchase Order</label>
                    <select
                      disabled={!formData.companyId}
                      value={formData.poId}
                      onChange={(e) => {
                        const selectedPoId = e.target.value;
                        const selectedPo = purchaseOrders.find(p => p.id === selectedPoId);
                        if (selectedPo) {
                          setFormData(prev => ({
                            ...prev,
                            poId: selectedPoId,
                            title: selectedPo.title,
                            amount: selectedPo.amount,
                            dealId: selectedPo.dealId || prev.dealId,
                            items: [
                              {
                                id: Math.random().toString(36).substr(2, 9),
                                description: selectedPo.title,
                                qty: 1,
                                unitPrice: selectedPo.amount,
                                amount: selectedPo.amount,
                              }
                            ]
                          }));
                        } else {
                          setFormData(prev => ({ ...prev, poId: selectedPoId }));
                        }
                      }}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all disabled:opacity-50 font-medium"
                    >
                      <option value="">Select Incoming PO...</option>
                      {purchaseOrders
                        .filter(p => p.companyId === formData.companyId)
                        .map(p => <option key={p.id} value={p.id}>{p.poNumber} - {p.title}</option>)
                      }
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Deal</label>
                    <select
                      disabled={!formData.companyId}
                      value={formData.dealId}
                      onChange={(e) => {
                        const selectedDealId = e.target.value;
                        const selectedDeal = deals.find(d => d.id === selectedDealId);
                        const matchingPo = purchaseOrders.find(p => p.dealId === selectedDealId || (formData.poId && p.id === formData.poId));
                        if (matchingPo) {
                          setFormData(prev => ({
                            ...prev,
                            dealId: selectedDealId,
                            poId: matchingPo.id,
                            title: matchingPo.title,
                            amount: matchingPo.amount,
                            items: [
                              {
                                id: Math.random().toString(36).substr(2, 9),
                                description: matchingPo.title,
                                qty: 1,
                                unitPrice: matchingPo.amount,
                                amount: matchingPo.amount,
                              }
                            ]
                          }));
                        } else if (selectedDeal) {
                          setFormData(prev => ({
                            ...prev,
                            dealId: selectedDealId,
                            title: selectedDeal.title,
                            amount: selectedDeal.value,
                            items: [
                              {
                                id: Math.random().toString(36).substr(2, 9),
                                description: selectedDeal.title,
                                qty: 1,
                                unitPrice: selectedDeal.value,
                                amount: selectedDeal.value,
                              }
                            ]
                          }));
                        } else {
                          setFormData(prev => ({ ...prev, dealId: selectedDealId }));
                        }
                      }}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all disabled:opacity-50 font-medium"
                    >
                      <option value="">Select Deal...</option>
                      {deals
                        .filter(d => d.companyId === formData.companyId)
                        .map(d => <option key={d.id} value={d.id}>{d.title}</option>)
                      }
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Invoice Items</label>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="text-[10px] font-bold text-brand-gold bg-brand-gold/10 hover:bg-brand-gold/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 uppercase tracking-widest"
                    >
                      <Plus size={12} /> Add Item
                    </button>
                  </div>
                  
                  <div className="space-y-2">
                    {formData.items.map((item, index) => (
                      <div key={item.id} className="flex gap-2 items-start bg-white/5 p-3 rounded-xl border border-white/5">
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            required
                            placeholder="Description"
                            value={item.description}
                            onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                            className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-brand-text focus:outline-none focus:border-brand-gold/50"
                          />
                          <div className="flex gap-2">
                            <div className="w-24">
                              <input
                                type="number"
                                required
                                min="1"
                                placeholder="Qty"
                                value={item.qty || ''}
                                onChange={(e) => handleItemChange(item.id, 'qty', Number(e.target.value))}
                                className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-brand-text focus:outline-none focus:border-brand-gold/50"
                              />
                            </div>
                            <div className="flex-1">
                              <input
                                type="number"
                                required
                                placeholder="Unit Price (IDR)"
                                value={item.unitPrice || ''}
                                onChange={(e) => handleItemChange(item.id, 'unitPrice', Number(e.target.value))}
                                className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-brand-text focus:outline-none focus:border-brand-gold/50"
                              />
                            </div>
                            <div className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-medium text-brand-gold text-right flex items-center justify-end">
                              {currencyService.formatIDR(item.amount)}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="p-2 text-brand-muted hover:text-brand-red hover:bg-brand-red/10 rounded-lg transition-colors shrink-0"
                          title="Remove Item"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {formData.items.length === 0 && (
                      <div className="text-center p-4 bg-white/5 border border-white/10 rounded-xl border-dashed">
                        <p className="text-sm text-brand-muted italic">No items added. Please add at least one item.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Status *</label>
                    <select
                      required
                      disabled={!isPrivileged}
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as InvoiceStatus })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all disabled:opacity-50 font-medium"
                    >
                      <option value="draft">Draft</option>
                      <option value="sent">Sent</option>
                      <option value="paid">Paid</option>
                      <option value="overdue">Overdue</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                    {!isPrivileged && (
                      <p className="text-[10px] text-brand-muted/60 italic ml-1 mt-1">Only Finance can change status from Draft</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Issue Date *</label>
                    <input
                      required
                      type="date"
                      value={formData.issueDate}
                      onChange={(e) => {
                        const newDateStr = e.target.value;
                        if (!editingInvoice) {
                          const updatedInvoiceNum = generateNextInvoiceNumber(invoices, newDateStr);
                          setFormData({ ...formData, issueDate: newDateStr, invoiceNumber: updatedInvoiceNum });
                        } else {
                          setFormData({ ...formData, issueDate: newDateStr });
                        }
                      }}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all font-medium"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Due Date *</label>
                    <input
                      required
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="pt-6 flex gap-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-4 border border-white/10 text-brand-muted font-bold rounded-xl hover:bg-white/5 transition-all uppercase tracking-widest text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-6 py-4 bg-gold-gradient text-brand-bg font-bold rounded-xl hover:opacity-90 transition-all shadow-lg shadow-brand-gold/10 uppercase tracking-widest text-xs"
                  >
                    {editingInvoice ? 'Save Changes' : 'Create Invoice'}
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

export default Invoices;
