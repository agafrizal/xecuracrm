import React, { useState, useEffect } from 'react';
import { Plus, Calendar, Edit2, Trash2, X, FileText, Building2, Users as UsersIcon, Briefcase, DollarSign, FilePlus, AlertTriangle, Upload, File, ExternalLink, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PurchaseOrder, POStatus, Contact, Company, Deal, InvoiceStatus, UserProfile } from '../types';
import { format } from 'date-fns';
import { addDoc, collection, db, updateDoc, doc, deleteDoc, getDocs, Timestamp, OperationType, handleFirestoreError, logEvent, storage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from '../firebase';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import { currencyService } from '../services/currencyService';
import { extractPoNumberFromFile } from '../utils/poExtractor';
import { generateNextInvoiceNumber } from '../utils/invoiceNumberGenerator';

import Autocomplete from './Autocomplete';
import { Search } from 'lucide-react';

interface PurchaseOrdersProps {
  purchaseOrders: PurchaseOrder[];
  contacts: Contact[];
  companies: Company[];
  deals: Deal[];
  userId: string;
  users: UserProfile[];
  userRole?: string;
}

const PurchaseOrders: React.FC<PurchaseOrdersProps> = ({ purchaseOrders, contacts, companies, deals, userId, users, userRole }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [poToDelete, setPoToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState<string | null>(null);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isExtractingPo, setIsExtractingPo] = useState(false);

  useEffect(() => {
    if (showSuccessToast) {
      const timer = setTimeout(() => setShowSuccessToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [showSuccessToast]);
  const [usdRate, setUsdRate] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    poNumber: '',
    title: '',
    companyId: '',
    contactId: '',
    dealId: '',
    amount: 0,
    status: 'approved' as POStatus,
    issueDate: format(new Date(), 'yyyy-MM-dd'),
    startDate: '',
    endDate: '',
    poUrl: '',
    poName: '',
    bastUrl: '',
    bastName: '',
    msaUrl: '',
    msaName: '',
  });

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
      const poOwnerId = selectedCompany?.ownerId || userId;

      const poData: any = {
        poNumber: formData.poNumber,
        title: formData.title,
        companyId: formData.companyId,
        contactId: formData.contactId || null,
        dealId: formData.dealId || null,
        amount: Number(formData.amount),
        status: 'approved',
        issueDate: Timestamp.fromDate(new Date(formData.issueDate)),
        startDate: formData.startDate ? Timestamp.fromDate(new Date(formData.startDate)) : null,
        endDate: formData.endDate ? Timestamp.fromDate(new Date(formData.endDate)) : null,
        ownerId: poOwnerId,
        poUrl: formData.poUrl || null,
        poName: formData.poName || null,
        bastUrl: formData.bastUrl || null,
        bastName: formData.bastName || null,
        msaUrl: formData.msaUrl || null,
        msaName: formData.msaName || null,
        updatedAt: Timestamp.now(),
      };

      if (editingPO) {
        const poRef = doc(db, 'purchaseOrders', editingPO.id);
        await updateDoc(poRef, poData);
        await logEvent('PO Updated', `PO: ${formData.poNumber} - ${formData.title}`);
      } else {
        poData.createdAt = Timestamp.now();
        const poDocRef = await addDoc(collection(db, 'purchaseOrders'), poData);
        await logEvent('PO Created', `PO: ${formData.poNumber} - ${formData.title}`);

        try {
          const planData = {
            dealId: formData.dealId || poDocRef.id,
            poId: poDocRef.id,
            companyId: formData.companyId || null,
            contactId: formData.contactId || null,
            title: formData.title || `PO ${formData.poNumber}`,
            value: Number(formData.amount) || 0,
            status: 'Draft',
            implementor: 'Internal',
            proposedDurationWeeks: 4,
            actualDurationWeeks: null,
            startDate: Timestamp.now(),
            targetEndDate: Timestamp.fromDate(new Date(Date.now() + 28 * 24 * 60 * 60 * 1000)),
            assignedPmId: poOwnerId,
            ownerId: poOwnerId,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          };
          await addDoc(collection(db, 'implementationPlans'), planData);
        } catch (planErr) {
          console.error('Error auto-creating implementation plan for PO:', planErr);
        }
      }
      setIsModalOpen(false);
      setEditingPO(null);
      setFormData({
        poNumber: '',
        title: '',
        companyId: '',
        contactId: '',
        dealId: '',
        amount: 0,
        status: 'approved',
        issueDate: format(new Date(), 'yyyy-MM-dd'),
        startDate: '',
        endDate: '',
        poUrl: '',
        poName: '',
        bastUrl: '',
        bastName: '',
      });
    } catch (error) {
      handleFirestoreError(error, editingPO ? OperationType.UPDATE : OperationType.CREATE, 'purchaseOrders');
    }
  };

  const handleDelete = async (id: string) => {
    setPoToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!poToDelete) return;
    const po = purchaseOrders.find(p => p.id === poToDelete);
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'purchaseOrders', poToDelete));
      if (po) {
        await logEvent('PO Deleted', `PO: ${po.poNumber}`);
      }
      setIsDeleteModalOpen(false);
      setPoToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `purchaseOrders/${poToDelete}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const openEditModal = (po: PurchaseOrder) => {
    setEditingPO(po);
    setFormData({
      poNumber: po.poNumber,
      title: po.title,
      companyId: po.companyId,
      contactId: po.contactId || '',
      dealId: po.dealId || '',
      amount: po.amount,
      status: po.status,
      issueDate: format(po.issueDate.toDate(), 'yyyy-MM-dd'),
      startDate: po.startDate ? format(po.startDate.toDate(), 'yyyy-MM-dd') : '',
      endDate: po.endDate ? format(po.endDate.toDate(), 'yyyy-MM-dd') : '',
      poUrl: po.poUrl || '',
      poName: po.poName || '',
      bastUrl: po.bastUrl || '',
      bastName: po.bastName || '',
      msaUrl: po.msaUrl || '',
      msaName: po.msaName || '',
    });
    setIsModalOpen(true);
  };

  const handleCreateInvoice = async (po: PurchaseOrder) => {
    try {
      const invoicesSnapshot = await getDocs(collection(db, 'invoices'));
      const existingInvoices = invoicesSnapshot.docs.map(doc => doc.data() as any);
      const generatedInvoiceNumber = generateNextInvoiceNumber(existingInvoices, new Date());

      const invoiceData: any = {
        invoiceNumber: generatedInvoiceNumber,
        title: `Invoice - ${po.title}`,
        companyId: po.companyId,
        contactId: po.contactId || null,
        dealId: po.dealId || null,
        poId: po.id,
        amount: po.amount,
        items: [
          {
            id: '1',
            description: po.title,
            qty: 1,
            unitPrice: po.amount,
            amount: po.amount,
          }
        ],
        status: 'draft' as InvoiceStatus,
        issueDate: Timestamp.now(),
        dueDate: Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)), // Default 30 days
        ownerId: userId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await addDoc(collection(db, 'invoices'), invoiceData);
      
      // Create notification
      await addDoc(collection(db, 'notifications'), {
        userId: userId,
        title: 'Invoice Created',
        message: `An instant invoice ${invoiceData.invoiceNumber} has been created from PO ${po.poNumber}.`,
        type: 'success',
        read: false,
        relatedId: po.id, // Or the new invoice ID? We don't have it yet easily without capturing the result of addDoc
        relatedType: 'invoice',
        createdAt: Timestamp.now()
      });

      await logEvent('Invoice Created from PO', `Invoice for PO: ${po.poNumber}`);
      setShowSuccessToast('Invoice created successfully! You can find it in the Invoices section.');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'invoices');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'po' | 'bast' | 'msa') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('Please upload PDF files only.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('File size exceeds 5MB limit.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    if (type === 'po') {
      setIsExtractingPo(true);
      extractPoNumberFromFile(file)
        .then((extractedPoNumber) => {
          if (extractedPoNumber) {
            setFormData(prev => ({
              ...prev,
              poNumber: extractedPoNumber
            }));
            setShowSuccessToast(`Auto-detected Customer PO Number from document: ${extractedPoNumber}`);
          }
        })
        .catch((err) => {
          console.warn('Extraction error:', err);
        })
        .finally(() => {
          setIsExtractingPo(false);
        });
    }

    try {
      let folder = 'poDocs';
      if (type === 'bast') folder = 'bast';
      if (type === 'msa') folder = 'msa';
      
      const storageRef = ref(storage, `${folder}/${userId}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`);
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
            message = 'Permission denied: Firebase Storage rules might be blocking the upload. Please ensure storage is enabled in your Firebase project.';
          } else if (error.code === 'storage/retry-limit-exceeded') {
            message = 'Upload timed out. Please check your internet connection.';
          }
          alert(message);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          if (type === 'po') {
            setFormData(prev => ({
              ...prev,
              poUrl: downloadURL,
              poName: file.name
            }));
          } else if (type === 'bast') {
            setFormData(prev => ({
              ...prev,
              bastUrl: downloadURL,
              bastName: file.name
            }));
          } else {
            setFormData(prev => ({
              ...prev,
              msaUrl: downloadURL,
              msaName: file.name
            }));
          }
          setIsUploading(false);
          setUploadProgress(0);
        }
      );
    } catch (error: any) {
      console.error('Error initiating upload:', error);
      setIsUploading(false);
      alert(`Error initiating upload: ${error.message}`);
    }
  };

  const handleRemoveFile = async (type: 'po' | 'bast' | 'msa') => {
    if (type === 'po') {
      setFormData(prev => ({
        ...prev,
        poUrl: '',
        poName: ''
      }));
    } else if (type === 'bast') {
      setFormData(prev => ({
        ...prev,
        bastUrl: '',
        bastName: ''
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        msaUrl: '',
        msaName: ''
      }));
    }
  };

  const getCompanyName = (id: string) => companies.find(c => c.id === id)?.name || 'Unknown Company';
  const getContactName = (id: string) => contacts.find(c => c.id === id)?.name || 'N/A';
  const getDealTitle = (id: string) => deals.find(d => d.id === id)?.title || 'N/A';

  const getStatusColor = (status: POStatus) => {
    switch (status) {
      case 'draft': return 'bg-slate-100 text-slate-600 border-slate-200';
      case 'approved': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const isExpiringSoon = (endDate?: Timestamp) => {
    if (!endDate) return false;
    const now = new Date();
    const end = endDate.toDate();
    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 60; // 2 months approx
  };

  const filteredPOs = purchaseOrders.filter(po => {
    const matchesSearch = po.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         po.poNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesOwner = selectedOwnerId === 'all' || po.ownerId === selectedOwnerId;
    return matchesSearch && matchesOwner;
  });

  const sortedPOs = [...filteredPOs].sort((a, b) => b.issueDate.toMillis() - a.issueDate.toMillis());

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row flex-1 items-stretch sm:items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" size={20} />
            <input
              type="text"
              placeholder="Search POs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-brand-card border border-white/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold/10 transition-all text-brand-text placeholder:text-brand-muted/50 font-medium"
            />
          </div>
          <div className="w-full sm:w-48 shrink-0">
            <select
              value={selectedOwnerId}
              onChange={(e) => setSelectedOwnerId(e.target.value)}
              className="w-full px-4 py-2.5 bg-brand-card border border-white/5 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/10 transition-all text-sm font-medium"
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
            setEditingPO(null);
            setFormData({
              poNumber: `PO-${format(new Date(), 'yyyyMMdd')}-${Math.floor(Math.random() * 1000)}`,
              title: '',
              companyId: '',
              contactId: '',
              dealId: '',
              amount: 0,
              status: 'approved',
              issueDate: format(new Date(), 'yyyy-MM-dd'),
              startDate: '',
              endDate: '',
              poUrl: '',
              poName: '',
              bastUrl: '',
              bastName: '',
              msaUrl: '',
              msaName: '',
            });
            setIsModalOpen(true);
          }}
          className="flex items-center justify-center gap-2 bg-gold-gradient text-brand-bg px-6 py-2.5 rounded-xl font-bold hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-brand-gold/20 shrink-0"
        >
          <Plus size={20} />
          New Incoming PO
        </button>
      </div>      <div className="bg-brand-card rounded-3xl border border-white/5 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/5">
                <th className="px-4 py-3 text-[10px] font-bold text-brand-muted uppercase tracking-widest !text-left whitespace-nowrap">
                  Company
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-brand-muted uppercase tracking-widest !text-left">
                  PO Details
                </th>
                <th className="px-4 py-3 text-[10px] font-bold text-brand-muted uppercase tracking-widest whitespace-nowrap">
                  Amount
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
              {sortedPOs.map((po) => (
                <tr key={po.id} className="group hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 !text-left whitespace-nowrap min-w-[140px]">
                    <div className="flex items-center justify-start gap-3 !text-left">
                      <div className="shrink-0 p-2 bg-white/5 rounded-lg border border-white/5">
                        <Building2 size={16} className="text-brand-gold/60" />
                      </div>
                      <span className="text-brand-text font-medium !text-left leading-snug">
                        {getCompanyName(po.companyId)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 !text-left min-w-[200px]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-gold/10 flex items-center justify-center text-brand-gold border border-brand-gold/20 shrink-0">
                        <FileText size={18} />
                      </div>
                      <div className="flex flex-col items-start !text-left">
                        <p className="font-bold text-brand-text !text-left leading-tight group-hover:text-brand-gold transition-colors">{po.title}</p>
                        <span className="text-[10px] font-mono text-brand-gold/60 mt-1">{po.poNumber}</span>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {po.poUrl && (
                            <a href={po.poUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/5 text-[10px] font-bold text-brand-gold hover:bg-brand-gold/10 transition-all border border-brand-gold/10 uppercase tracking-widest">
                              <File size={10} /> PO
                            </a>
                          )}
                          {po.bastUrl && (
                            <a href={po.bastUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/5 text-[10px] font-bold text-brand-text hover:bg-white/10 transition-all border border-white/10 uppercase tracking-widest">
                              <File size={10} /> BAST
                            </a>
                          )}
                          {po.msaUrl && (
                            <a href={po.msaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/5 text-[10px] font-bold text-brand-text hover:bg-white/10 transition-all border border-white/10 uppercase tracking-widest">
                              <File size={10} /> MSA
                            </a>
                          )}
                          {isExpiringSoon(po.endDate) && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-red/10 text-brand-red border border-brand-red/20 text-[10px] font-bold uppercase tracking-wider animate-pulse inline-flex">
                              <AlertTriangle size={10} />
                              Expiring Soon
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatCurrency(po.amount)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-col gap-1 text-[10px] font-medium text-brand-muted uppercase tracking-widest">
                      <span className="flex items-center gap-1.5"><Calendar size={12} className="text-brand-gold/40 shrink-0" /> Issued: {format(po.issueDate.toDate(), 'MMM d, yyyy')}</span>
                      {(po.startDate || po.endDate) && (
                        <span className="flex items-center gap-1.5">
                          <Calendar size={12} className="text-brand-gold/40 shrink-0" /> Dur: {po.startDate ? format(po.startDate.toDate(), 'MMM d, yy') : 'N/A'} - {po.endDate ? format(po.endDate.toDate(), 'MMM d, yy') : 'N/A'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleCreateInvoice(po)}
                        title="Create Invoice"
                        className="p-1.5 text-brand-gold hover:bg-brand-gold/10 rounded-lg transition-all border border-brand-gold/20"
                      >
                        <FilePlus size={14} />
                      </button>
                      {(userRole === 'admin' || userRole === 'manager' || userRole === 'super_user' || userRole === 'engineer' || userRole === 'finance' || userRole === 'procurement' || userRole === 'project_manager' || po.ownerId === userId) && (
                        <>
                          <button onClick={() => openEditModal(po)} className="p-1.5 text-brand-muted hover:text-brand-gold hover:bg-brand-gold/10 rounded-lg transition-all">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => handleDelete(po.id)} className="p-1.5 text-brand-muted hover:text-brand-red hover:bg-brand-red/10 rounded-lg transition-all">
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {purchaseOrders.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-brand-muted font-medium italic border-dashed border-white/10">
                    No incoming purchase orders found.
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
        title="Delete Purchase Order"
        message="Are you sure you want to delete this purchase order? This action cannot be undone."
        isDeleting={isDeleting}
      />      <AnimatePresence>
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
                <h3 className="text-xl font-bold text-brand-gold uppercase tracking-widest">{editingPO ? 'Edit Incoming PO' : 'New Incoming PO'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-brand-muted hover:text-brand-gold hover:bg-white/10 rounded-lg transition-colors">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-5 bg-brand-card max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Customer PO Number *</label>
                      {isExtractingPo && (
                        <span className="text-[10px] text-brand-gold font-bold flex items-center gap-1 animate-pulse">
                          <Loader2 size={12} className="animate-spin" /> Locating PO No...
                        </span>
                      )}
                    </div>
                    <input
                      required
                      type="text"
                      value={formData.poNumber}
                      onChange={(e) => setFormData({ ...formData, poNumber: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all font-medium placeholder:text-brand-muted/30"
                      placeholder="e.g., PO-123456"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">PO Title *</label>
                    <input
                      required
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all font-medium placeholder:text-brand-muted/30"
                      placeholder="e.g., Software Licenses Q1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Autocomplete
                    label="Company"
                    required
                    options={companies.map(c => ({ id: c.id, label: c.name }))}
                    value={formData.companyId}
                    onChange={(id) => setFormData({ ...formData, companyId: id, contactId: '', dealId: '' })}
                    placeholder="Select Company..."
                  />
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Amount (IDR) *</label>
                    <div className="relative">
                      <input
                        required
                        type="number"
                        step="1"
                        value={formData.amount || ''}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value === '' ? 0 : Number(e.target.value) })}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all font-medium placeholder:text-brand-muted/30"
                        placeholder="Enter amount in IDR"
                      />
                      {usdRate && formData.amount > 0 && (
                        <p className="text-[10px] text-brand-gold font-bold uppercase tracking-widest mt-2 ml-1">
                          ≈ {currencyService.formatUSD(formData.amount * usdRate)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Contact</label>
                    <select
                      disabled={!formData.companyId}
                      value={formData.contactId}
                      onChange={(e) => setFormData({ ...formData, contactId: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all disabled:opacity-50 font-medium"
                    >
                      <option value="">Select Contact...</option>
                      {contacts
                        .filter(c => c.companyId === formData.companyId)
                        .map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                      }
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Deal</label>
                    <select
                      value={formData.dealId}
                      onChange={(e) => {
                        const dealId = e.target.value;
                        const selectedDeal = deals.find(d => d.id === dealId);
                        if (selectedDeal) {
                          setFormData({
                            ...formData,
                            dealId,
                            companyId: selectedDeal.companyId,
                            title: selectedDeal.title,
                            amount: selectedDeal.value,
                            contactId: selectedDeal.contactId || formData.contactId,
                          });
                        } else {
                          setFormData({ ...formData, dealId });
                        }
                      }}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all font-medium"
                    >
                      <option value="">Select Deal...</option>
                      {deals
                        .filter(d => (!formData.companyId || d.companyId === formData.companyId) && d.stage === 'L5-closed-won')
                        .map(d => <option key={d.id} value={d.id}>{d.title}</option>)
                      }
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Issue Date *</label>
                  <input
                    required
                    type="date"
                    value={formData.issueDate}
                    onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Contract Start Date</label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all font-medium"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Contract End Date</label>
                    <input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">PO Document (PDF Only)</label>
                  <div className="relative">
                    {formData.poUrl ? (
                      <div className="flex items-center justify-between p-4 bg-brand-gold/10 border border-brand-gold/20 rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-brand-gold/10 flex items-center justify-center text-brand-gold">
                            <File size={20} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-brand-text truncate max-w-[200px]">{formData.poName}</p>
                            <p className="text-[10px] text-brand-gold uppercase tracking-widest font-bold">Document Uploaded</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href={formData.poUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-brand-muted hover:text-brand-gold hover:bg-white/10 rounded-lg transition-all"
                          >
                            <ExternalLink size={18} />
                          </a>
                          <button
                            type="button"
                            onClick={() => handleRemoveFile('po')}
                            className="p-2 text-brand-muted hover:text-brand-red hover:bg-brand-red/10 rounded-lg transition-all"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative group">
                        <input
                          type="file"
                          accept=".pdf"
                          onChange={(e) => handleFileUpload(e, 'po')}
                          disabled={isUploading}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                        />
                        <div className={`flex flex-col items-center justify-center p-8 border-2 border-dashed border-white/10 rounded-2xl bg-white/5 group-hover:bg-white/10 transition-all ${isUploading ? 'opacity-50' : ''}`}>
                          {isUploading ? (
                            <div className="flex flex-col items-center gap-3">
                              <Loader2 className="w-8 h-8 text-brand-gold animate-spin" />
                              <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <motion.div
                                  className="h-full bg-brand-gold"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${uploadProgress}%` }}
                                />
                              </div>
                              <p className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Uploading {Math.round(uploadProgress)}%</p>
                            </div>
                          ) : (
                            <>
                              <div className="w-12 h-12 rounded-xl bg-brand-gold/10 flex items-center justify-center text-brand-gold mb-3 border border-brand-gold/20">
                                <Upload size={24} />
                              </div>
                              <p className="text-sm font-bold text-brand-text mb-1">Click or drag to upload PO Document</p>
                              <p className="text-[10px] text-brand-muted uppercase tracking-widest font-bold">PDF Files Only (Max 5MB)</p>
                            </>
                          )}
                        </div>
                      </div>
                    )}
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
                    {editingPO ? 'Save Changes' : 'Create PO'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Success Toast */}
      <AnimatePresence>
        {showSuccessToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 right-8 z-50 bg-emerald-500 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-400/20"
          >
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <FileText size={18} />
            </div>
            <p className="font-bold">{showSuccessToast}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PurchaseOrders;
