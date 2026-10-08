import React, { useState } from 'react';
import { Plus, Search, Globe, MapPin, Building2, Edit2, Trash2, X, ExternalLink, Users, Briefcase, CheckSquare, AlertTriangle, Layers, ChevronRight, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Company, CompanyCategory, Contact, Deal, Task, Interaction, PurchaseOrder, Invoice, UserProfile } from '../types';
import { format } from 'date-fns';
import { currencyService } from '../services/currencyService';
import { addDoc, collection, db, updateDoc, doc, deleteDoc, writeBatch, Timestamp, OperationType, handleFirestoreError, logEvent } from '../firebase';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import { getContactTagBadgeStyle } from './Contacts';

interface CompaniesProps {
  companies: Company[];
  contacts: Contact[];
  deals: Deal[];
  tasks: Task[];
  interactions: Interaction[];
  purchaseOrders: PurchaseOrder[];
  invoices: Invoice[];
  userId: string;
  users: UserProfile[];
  userRole?: string;
}

const Companies: React.FC<CompaniesProps> = ({ 
  companies, contacts, deals, tasks, interactions, purchaseOrders, invoices, userId, users, userRole 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [companyToAssign, setCompanyToAssign] = useState<Company | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    category: 'Single' as CompanyCategory,
    groupCompanyIds: [] as string[],
    industry: '',
    website: '',
    address: '',
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [groupSearchTerm, setGroupSearchTerm] = useState('');
  const [isGroupDropdownOpen, setIsGroupDropdownOpen] = useState(false);

  const filteredCompanies = companies.filter(company => {
    // Helper to get group member names for search matching
    const groupMemberNames = (company.groupCompanyIds || []).map(id => {
      const match = companies.find(c => c.id === id);
      return match ? match.name : id;
    }).join(' ');

    const matchesSearch = 
      company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (company.industry && company.industry.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (company.website && company.website.toLowerCase().includes(searchTerm.toLowerCase())) ||
      groupMemberNames.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesOwner = selectedOwnerId === 'all' || company.ownerId === selectedOwnerId;

    const isGroup = company.category === 'Group/Holding';
    const matchesCategory = categoryFilter === 'all' || 
      (categoryFilter === 'Group/Holding' ? isGroup : !isGroup);
    
    return matchesSearch && matchesOwner && matchesCategory;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!formData.name.trim()) {
      setValidationError('Company name is required.');
      return;
    }

    if (formData.category === 'Group/Holding' && formData.groupCompanyIds.length === 0) {
      setValidationError('For a Group/Holding category, you must specify at least one company inside the group.');
      return;
    }

    try {
      const payload = {
        name: formData.name.trim(),
        category: formData.category,
        groupCompanyIds: formData.category === 'Group/Holding' ? formData.groupCompanyIds : [],
        industry: formData.industry.trim() || null,
        website: formData.website.trim() || null,
        address: formData.address.trim() || null,
      };

      if (editingCompany) {
        const companyRef = doc(db, 'companies', editingCompany.id);
        await updateDoc(companyRef, {
          ...payload,
          updatedAt: Timestamp.now(),
        });
        await logEvent('Company Updated', `Company: ${formData.name}`);
      } else {
        await addDoc(collection(db, 'companies'), {
          ...payload,
          ownerId: userId,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
        await logEvent('Company Created', `Company: ${formData.name}`);
      }
      setIsModalOpen(false);
      setEditingCompany(null);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, editingCompany ? OperationType.UPDATE : OperationType.CREATE, 'companies');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      category: 'Single',
      groupCompanyIds: [],
      industry: '',
      website: '',
      address: '',
    });
    setValidationError(null);
    setGroupSearchTerm('');
    setIsGroupDropdownOpen(false);
  };

  const openEditModal = (company: Company) => {
    setEditingCompany(company);
    setFormData({
      name: company.name,
      category: company.category || 'Single',
      groupCompanyIds: company.groupCompanyIds || [],
      industry: company.industry || '',
      website: company.website || '',
      address: company.address || '',
    });
    setValidationError(null);
    setGroupSearchTerm('');
    setIsGroupDropdownOpen(false);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    setCompanyToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!companyToDelete) return;
    const company = companies.find(c => c.id === companyToDelete);
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'companies', companyToDelete));
      if (selectedCompany?.id === companyToDelete) setSelectedCompany(null);
      if (company) {
        await logEvent('Company Deleted', `Company: ${company.name}`);
      }
      setIsDeleteModalOpen(false);
      setCompanyToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `companies/${companyToDelete}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAssign = async () => {
    if (!companyToAssign || !selectedUserId) return;
    setIsAssigning(true);
    try {
      const batch = writeBatch(db);
      const targetUser = users.find(u => u.uid === selectedUserId);
      
      const companyRef = doc(db, 'companies', companyToAssign.id);
      batch.update(companyRef, { ownerId: selectedUserId, updatedAt: Timestamp.now() });

      const relatedContacts = contacts.filter(c => c.companyId === companyToAssign.id);
      relatedContacts.forEach(contact => {
        batch.update(doc(db, 'contacts', contact.id), { ownerId: selectedUserId, updatedAt: Timestamp.now() });
      });

      const relatedDeals = deals.filter(d => d.companyId === companyToAssign.id);
      relatedDeals.forEach(deal => {
        batch.update(doc(db, 'deals', deal.id), { ownerId: selectedUserId, updatedAt: Timestamp.now() });
      });

      const contactIds = relatedContacts.map(c => c.id);
      const dealIds = relatedDeals.map(d => d.id);
      const relatedTasks = tasks.filter(t => 
        t.relatedTo && (
          (t.relatedTo.type === 'company' && t.relatedTo.id === companyToAssign.id) ||
          (t.relatedTo.type === 'contact' && contactIds.includes(t.relatedTo.id)) ||
          (t.relatedTo.type === 'deal' && dealIds.includes(t.relatedTo.id))
        )
      );
      relatedTasks.forEach(task => {
        batch.update(doc(db, 'tasks', task.id), { ownerId: selectedUserId, updatedAt: Timestamp.now() });
      });

      const relatedInteractions = interactions.filter(i => 
        i.companyId === companyToAssign.id || (i.contactId && contactIds.includes(i.contactId))
      );
      relatedInteractions.forEach(interaction => {
        batch.update(doc(db, 'interactions', interaction.id), { ownerId: selectedUserId, updatedAt: Timestamp.now() });
      });

      const relatedPOs = purchaseOrders.filter(po => po.companyId === companyToAssign.id);
      relatedPOs.forEach(po => {
        batch.update(doc(db, 'purchaseOrders', po.id), { ownerId: selectedUserId, updatedAt: Timestamp.now() });
      });

      const relatedInvoices = invoices.filter(inv => inv.companyId === companyToAssign.id);
      relatedInvoices.forEach(inv => {
        batch.update(doc(db, 'invoices', inv.id), { ownerId: selectedUserId, updatedAt: Timestamp.now() });
      });

      await batch.commit();
      await logEvent('Company Assigned', `Company: ${companyToAssign.name} assigned to ${targetUser?.displayName || selectedUserId}`);
      
      setIsAssignModalOpen(false);
      setCompanyToAssign(null);
      setSelectedUserId('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `companies/${companyToAssign.id}/assign`);
    } finally {
      setIsAssigning(false);
    }
  };

  const getCompanyDetails = (company: Company) => {
    const isGroup = company.category === 'Group/Holding';
    const memberCompanyIds = company.groupCompanyIds || [];
    
    // Member companies objects
    const memberCompanies = companies.filter(c => memberCompanyIds.includes(c.id) || memberCompanyIds.includes(c.name));

    // Determine all company IDs in scope (itself + member companies if Group)
    const scopeCompanyIds = isGroup ? [company.id, ...memberCompanies.map(m => m.id)] : [company.id];

    const companyContacts = contacts.filter(c => c.companyId && scopeCompanyIds.includes(c.companyId));
    const companyDeals = deals.filter(d => d.companyId && scopeCompanyIds.includes(d.companyId));
    
    const contactIds = companyContacts.map(c => c.id);
    const dealIds = companyDeals.map(d => d.id);
    
    const companyTasks = tasks.filter(t => 
      t.relatedTo && (
        (t.relatedTo.type === 'company' && scopeCompanyIds.includes(t.relatedTo.id)) ||
        (t.relatedTo.type === 'contact' && contactIds.includes(t.relatedTo.id)) ||
        (t.relatedTo.type === 'deal' && dealIds.includes(t.relatedTo.id))
      )
    );

    // Parent group check if this company is a member of any Group/Holding
    const parentHoldingGroup = companies.find(c => 
      c.category === 'Group/Holding' && 
      c.id !== company.id && 
      c.groupCompanyIds?.some(id => id === company.id || id === company.name)
    );

    return { companyContacts, companyDeals, companyTasks, memberCompanies, parentHoldingGroup };
  };

  // Select/Deselect Group Member Company
  const toggleGroupCompany = (idOrName: string) => {
    if (formData.groupCompanyIds.includes(idOrName)) {
      setFormData({
        ...formData,
        groupCompanyIds: formData.groupCompanyIds.filter(id => id !== idOrName),
      });
    } else {
      setFormData({
        ...formData,
        groupCompanyIds: [...formData.groupCompanyIds, idOrName],
      });
    }
    setGroupSearchTerm('');
  };

  // Helper to resolve company name from ID or name string
  const getCompanyName = (idOrName: string) => {
    const found = companies.find(c => c.id === idOrName || c.name === idOrName);
    return found ? found.name : idOrName;
  };

  if (selectedCompany) {
    const { companyContacts, companyDeals, companyTasks, memberCompanies, parentHoldingGroup } = getCompanyDetails(selectedCompany);
    const isGroup = selectedCompany.category === 'Group/Holding';
    
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSelectedCompany(null)}
              className="p-2 text-brand-muted hover:bg-white/5 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-3xl font-bold text-brand-text tracking-tight">{selectedCompany.name}</h2>
                {isGroup ? (
                  <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-brand-gold/15 text-brand-gold border border-brand-gold/30 flex items-center gap-1.5 shadow-sm">
                    <Layers size={14} /> Group / Holding
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-white/5 text-brand-muted border border-white/10 flex items-center gap-1.5">
                    <Building2 size={14} /> Single Entity
                  </span>
                )}
              </div>
              {parentHoldingGroup && (
                <div className="mt-1 flex items-center gap-2 text-xs text-brand-gold">
                  <span>Part of Holding Group:</span>
                  <button 
                    onClick={() => setSelectedCompany(parentHoldingGroup)}
                    className="font-bold underline hover:opacity-80 flex items-center gap-1"
                  >
                    {parentHoldingGroup.name} <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
          {(userRole === 'admin' || userRole === 'manager' || userRole === 'super_user' || userRole === 'engineer' || userRole === 'finance' || userRole === 'procurement' || userRole === 'project_manager' || selectedCompany.ownerId === userId) && (
            <button 
              onClick={() => openEditModal(selectedCompany)} 
              className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-brand-text rounded-xl font-bold text-sm transition-all"
            >
              <Edit2 size={16} /> Edit Profile
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Company Info Card */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-brand-card p-6 rounded-3xl border border-white/5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-brand-gold uppercase tracking-wider text-sm">Company Profile</h3>
                <button onClick={() => openEditModal(selectedCompany)} className="p-2 text-brand-muted hover:text-brand-gold hover:bg-white/5 rounded-lg transition-colors">
                  <Edit2 size={18} />
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-brand-muted">
                  <Building2 size={16} className="text-brand-gold/40" />
                  <span className="font-medium">{selectedCompany.industry || 'No industry specified'}</span>
                </div>
                {selectedCompany.website && (
                  <div className="flex items-center gap-3 text-sm text-brand-muted">
                    <Globe size={16} className="text-brand-gold/40" />
                    <a href={selectedCompany.website.startsWith('http') ? selectedCompany.website : `https://${selectedCompany.website}`} target="_blank" rel="noopener noreferrer" className="text-brand-gold hover:underline flex items-center gap-1 font-medium">
                      {selectedCompany.website.replace(/^https?:\/\//, '')}
                      <ExternalLink size={12} />
                    </a>
                  </div>
                )}
                {selectedCompany.address && (
                  <div className="flex items-start gap-3 text-sm text-brand-muted font-medium">
                    <MapPin size={16} className="text-brand-gold/40 mt-0.5" />
                    <span>{selectedCompany.address}</span>
                  </div>
                )}
              </div>
              <div className="pt-4 border-t border-white/5">
                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">Added on</p>
                <p className="text-sm text-brand-text font-medium">{format(selectedCompany.createdAt.toDate(), 'MMMM d, yyyy')}</p>
              </div>
            </div>

            {/* If Group/Holding: Member Companies Card */}
            {isGroup && (
              <div className="bg-brand-card p-6 rounded-3xl border border-brand-gold/20 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-brand-gold uppercase tracking-wider text-sm flex items-center gap-2">
                    <Layers size={16} /> Group Member Companies ({selectedCompany.groupCompanyIds?.length || 0})
                  </h3>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {(selectedCompany.groupCompanyIds || []).map((idOrName) => {
                    const matchedCompany = companies.find(c => c.id === idOrName || c.name === idOrName);
                    return (
                      <div 
                        key={idOrName} 
                        className="p-3 bg-white/5 border border-white/5 rounded-xl flex items-center justify-between hover:bg-white/10 transition-colors group"
                      >
                        <div className="flex items-center gap-2.5">
                          <Building2 size={16} className="text-brand-gold shrink-0" />
                          <span className="text-sm font-bold text-brand-text">{matchedCompany ? matchedCompany.name : idOrName}</span>
                        </div>
                        {matchedCompany && (
                          <button 
                            onClick={() => setSelectedCompany(matchedCompany)}
                            className="p-1 text-brand-muted hover:text-brand-gold transition-colors"
                            title="View Member Company"
                          >
                            <ExternalLink size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {(!selectedCompany.groupCompanyIds || selectedCompany.groupCompanyIds.length === 0) && (
                    <p className="text-xs text-brand-muted italic">No member companies added to this group.</p>
                  )}
                </div>
              </div>
            )}

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-brand-card p-4 rounded-2xl border border-white/5 shadow-sm text-center">
                <p className="text-2xl font-bold text-brand-text">{companyContacts.length}</p>
                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest mt-1">
                  {isGroup ? 'Group Contacts' : 'Contacts'}
                </p>
              </div>
              <div className="bg-brand-card p-4 rounded-2xl border border-white/5 shadow-sm text-center">
                <p className="text-2xl font-bold text-brand-text">{companyDeals.length}</p>
                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest mt-1">
                  {isGroup ? 'Group Deals' : 'Deals'}
                </p>
              </div>
              <div className="bg-brand-card p-4 rounded-2xl border border-white/5 shadow-sm text-center">
                <p className="text-lg font-bold text-brand-gold">
                  {currencyService.formatIDR(companyDeals.reduce((acc, d) => acc + (d.value * ((d.potentialGrossProfit || 0) / 100)), 0))}
                </p>
                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest mt-1">Est. Total GP</p>
              </div>
              <div className="bg-brand-card p-4 rounded-2xl border border-white/5 shadow-sm text-center">
                <p className="text-2xl font-bold text-brand-gold">
                  {companyDeals.reduce((acc, d) => acc + d.value, 0) > 0 
                    ? (companyDeals.reduce((acc, d) => acc + (d.value * ((d.potentialGrossProfit || 0) / 100)), 0) / companyDeals.reduce((acc, d) => acc + d.value, 0) * 100).toFixed(1)
                    : '0.0'}%
                </p>
                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest mt-1">Blended GP</p>
              </div>
            </div>
          </div>

          {/* Activity/Related Data */}
          <div className="lg:col-span-2 space-y-8">
            {/* Contacts Section */}
            <div className="bg-brand-card rounded-3xl border border-white/5 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                <h3 className="font-bold text-brand-gold flex items-center gap-2 uppercase tracking-wider text-sm">
                  <Users size={18} className="text-brand-gold/60" />
                  Associated Contacts {isGroup && '(Across Group)'}
                </h3>
                <span className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">{companyContacts.length} Total</span>
              </div>
              <div className="divide-y divide-white/5">
                {companyContacts.map(contact => {
                  const contactCompany = companies.find(c => c.id === contact.companyId);
                  return (
                    <div key={contact.id} className="p-4 hover:bg-white/5 transition-colors flex items-center justify-between group">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-brand-text group-hover:text-brand-gold transition-colors">{contact.name}</p>
                          {contact.tags && contact.tags.map(tag => {
                            const style = getContactTagBadgeStyle(tag);
                            return (
                              <span
                                key={tag}
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${style.badge}`}
                              >
                                <span className={`w-1 h-1 rounded-full ${style.dot}`} />
                                {tag}
                              </span>
                            );
                          })}
                        </div>
                        <p className="text-xs text-brand-muted font-medium mt-0.5">{contact.email || 'No email'}</p>
                      </div>
                      {isGroup && contactCompany && (
                        <span className="text-xs text-brand-muted bg-white/5 px-2.5 py-1 rounded-lg border border-white/5 font-medium">
                          {contactCompany.name}
                        </span>
                      )}
                    </div>
                  );
                })}
                {companyContacts.length === 0 && (
                  <p className="p-8 text-center text-brand-muted text-sm italic">No contacts associated with this company.</p>
                )}
              </div>
            </div>

            {/* Deals Section */}
            <div className="bg-brand-card rounded-3xl border border-white/5 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                <h3 className="font-bold text-brand-gold flex items-center gap-2 uppercase tracking-wider text-sm">
                  <Briefcase size={18} className="text-brand-gold/60" />
                  Active Deals {isGroup && '(Across Group)'}
                </h3>
                <span className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">{companyDeals.length} Total</span>
              </div>
              <div className="divide-y divide-white/5">
                {companyDeals.map(deal => {
                  const dealCompany = companies.find(c => c.id === deal.companyId);
                  return (
                    <div key={deal.id} className="p-4 hover:bg-white/5 transition-colors flex items-center justify-between group">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-brand-text group-hover:text-brand-gold transition-colors">{deal.title}</p>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                        deal.stage === 'L5-closed-won' ? 'bg-brand-gold/10 text-brand-gold' : 'bg-white/5 text-brand-muted'
                      }`}>
                        {deal.stage.split('-')[0].toUpperCase()}
                      </span>
                    </div>
                  );
                })}
                {companyDeals.length === 0 && (
                  <p className="p-8 text-center text-brand-muted text-sm italic">No deals associated with this company.</p>
                )}
              </div>
            </div>

            {/* Tasks Section */}
            <div className="bg-brand-card rounded-3xl border border-white/5 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                <h3 className="font-bold text-brand-gold flex items-center gap-2 uppercase tracking-wider text-sm">
                  <CheckSquare size={18} className="text-brand-gold/60" />
                  Related Tasks
                </h3>
                <span className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">{companyTasks.length} Total</span>
              </div>
              <div className="divide-y divide-white/5">
                {companyTasks.map(task => (
                  <div key={task.id} className="p-4 hover:bg-white/5 transition-colors flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${task.status === 'completed' ? 'bg-brand-gold' : 'bg-brand-gold/20'}`} />
                      <div>
                        <p className={`font-bold text-sm ${task.status === 'completed' ? 'text-brand-muted line-through' : 'text-brand-text group-hover:text-brand-gold transition-colors'}`}>
                          {task.title}
                        </p>
                        <p className="text-[10px] text-brand-muted uppercase tracking-widest font-bold mt-0.5">
                          Related to {task.relatedTo?.type}
                        </p>
                      </div>
                    </div>
                    {task.dueDate && (
                      <span className="text-xs text-brand-muted font-medium">{format(task.dueDate.toDate(), 'MMM d')}</span>
                    )}
                  </div>
                ))}
                {companyTasks.length === 0 && (
                  <p className="p-8 text-center text-brand-muted text-sm italic">No tasks related to this company's contacts or deals.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Top Bar: Search, Category Filter, Owner Filter, Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-1 flex-wrap items-center gap-4 max-w-3xl">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" size={20} />
            <input
              type="text"
              placeholder="Search companies or group members..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-brand-card border border-white/5 rounded-xl text-brand-text placeholder:text-brand-muted/30 focus:outline-none focus:ring-2 focus:ring-brand-gold/10 transition-all font-medium text-sm"
            />
          </div>

          {/* Category Filter */}
          <div className="w-44">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-4 py-2.5 bg-brand-card border border-white/5 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/10 transition-all text-sm font-medium"
            >
              <option value="all">All Categories</option>
              <option value="Single">Single / Subsidiary</option>
              <option value="Group/Holding">Group / Holding</option>
            </select>
          </div>

          {/* User Owner Filter */}
          <div className="w-44">
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

        {(userRole === 'admin' || userRole === 'manager' || userRole === 'super_user' || userRole === 'engineer' || userRole === 'finance' || userRole === 'procurement' || userRole === 'sales' || userRole === 'project_manager') && (
          <button
            onClick={() => {
              setEditingCompany(null);
              resetForm();
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 bg-gold-gradient text-brand-bg px-6 py-2.5 rounded-xl font-bold hover:opacity-90 transition-all shadow-lg shadow-brand-gold/10 text-sm shrink-0"
          >
            <Plus size={20} />
            Add Company
          </button>
        )}
      </div>

      {/* Companies Table */}
      <div className="bg-brand-card rounded-2xl border border-white/5 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-white/5 text-left">
                <th className="px-4 py-3 text-[10px] font-bold text-brand-muted uppercase tracking-widest !text-left">Company Name</th>
                <th className="px-4 py-3 text-[10px] font-bold text-brand-muted uppercase tracking-widest !text-left">Category</th>
                <th className="px-4 py-3 text-[10px] font-bold text-brand-muted uppercase tracking-widest !text-left">Group Members</th>
                <th className="px-4 py-3 text-[10px] font-bold text-brand-muted uppercase tracking-widest !text-left">Industry</th>
                <th className="px-4 py-3 text-[10px] font-bold text-brand-muted uppercase tracking-widest !text-left">Website</th>
                <th className="px-4 py-3 text-[10px] font-bold text-brand-muted uppercase tracking-widest !text-left">Assigned To</th>
                <th className="px-4 py-3 text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredCompanies.map((company) => {
                const isGroup = company.category === 'Group/Holding';
                const memberCount = company.groupCompanyIds?.length || 0;

                return (
                  <tr key={company.id} className="hover:bg-white/5 transition-colors group text-left">
                    <td className="px-4 py-3 cursor-pointer !text-left" onClick={() => setSelectedCompany(company)}>
                      <div className="flex items-center justify-start gap-3 !text-left">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                          isGroup ? 'bg-brand-gold/10 text-brand-gold border-brand-gold/30' : 'bg-white/5 text-brand-muted border-white/5'
                        }`}>
                          {isGroup ? <Layers size={18} /> : <Building2 size={18} />}
                        </div>
                        <div className="flex flex-col items-start !text-left">
                          <span className="font-bold text-brand-text text-xs group-hover:text-brand-gold transition-colors !text-left flex items-center gap-2">
                            {company.name}
                          </span>
                          {company.address && (
                            <span className="text-[11px] text-brand-muted flex items-center gap-1 mt-0.5 !text-left font-medium">
                              <MapPin size={12} className="text-brand-gold/40" /> {company.address}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isGroup ? (
                        <span className="px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-brand-gold/15 text-brand-gold border border-brand-gold/30 inline-flex items-center gap-1">
                          <Layers size={12} /> Group / Holding
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/5 text-brand-muted border border-white/10 inline-flex items-center gap-1">
                          Single
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isGroup ? (
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-brand-gold flex items-center gap-1">
                            {memberCount} {memberCount === 1 ? 'Company' : 'Companies'}
                          </span>
                          <span className="text-[11px] text-brand-muted truncate max-w-[200px]">
                            {(company.groupCompanyIds || []).map(id => getCompanyName(id)).join(', ')}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-brand-muted font-medium">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-brand-muted font-medium">{company.industry || 'N/A'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {company.website ? (
                        <a 
                          href={company.website.startsWith('http') ? company.website : `https://${company.website}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-brand-gold hover:underline flex items-center gap-1 font-medium"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Globe size={13} className="text-brand-gold/40" />
                          {company.website.replace(/^https?:\/\//, '')}
                        </a>
                      ) : (
                        <span className="text-xs text-brand-muted font-medium">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-xs text-brand-text font-bold">
                          {users.find(u => u.uid === company.ownerId)?.displayName || 'Unknown User'}
                        </span>
                        <span className="text-[10px] text-brand-muted uppercase tracking-widest font-bold mt-0.5">
                          {users.find(u => u.uid === company.ownerId)?.email}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {(userRole === 'admin' || userRole === 'manager' || userRole === 'super_user' || userRole === 'engineer' || userRole === 'finance' || userRole === 'procurement' || userRole === 'project_manager') && (
                          <button 
                            onClick={() => {
                              setCompanyToAssign(company);
                              setSelectedUserId(company.ownerId);
                              setIsAssignModalOpen(true);
                            }} 
                            className="p-2 text-brand-muted hover:text-brand-gold hover:bg-brand-gold/10 rounded-lg transition-all"
                            title="Assign to User"
                          >
                            <Users size={18} />
                          </button>
                        )}
                        <button 
                          onClick={() => setSelectedCompany(company)} 
                          className="p-2 text-brand-muted hover:text-brand-gold hover:bg-brand-gold/10 rounded-lg transition-all"
                          title="View Details"
                        >
                          <ExternalLink size={18} />
                        </button>
                        {(userRole === 'admin' || userRole === 'manager' || userRole === 'super_user' || userRole === 'engineer' || userRole === 'finance' || userRole === 'procurement' || userRole === 'project_manager' || company.ownerId === userId) && (
                          <>
                            <button onClick={() => openEditModal(company)} className="p-2 text-brand-muted hover:text-brand-gold hover:bg-brand-gold/10 rounded-lg transition-all">
                              <Edit2 size={18} />
                            </button>
                            <button onClick={() => handleDelete(company.id)} className="p-2 text-brand-muted hover:text-brand-red hover:bg-brand-red/10 rounded-lg transition-all">
                              <Trash2 size={18} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredCompanies.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-brand-muted italic">
                    No companies found matching criteria. Add your first company to get started!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title="Delete Company"
        message="Are you sure you want to delete this company? All associated contacts and deals will lose their company reference. This action cannot be undone."
        isDeleting={isDeleting}
      />

      {/* Assign Modal */}
      <AnimatePresence>
        {isAssignModalOpen && (
          <div className="fixed inset-0 flex items-center justify-center z-[60] p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAssignModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-brand-card rounded-2xl shadow-2xl border border-brand-gold/20 overflow-hidden"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-brand-gold border border-white/5">
                    <Users size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-brand-gold uppercase tracking-wider">Assign Company</h3>
                    <p className="text-[10px] text-brand-muted uppercase tracking-widest font-bold">Reassign all related data</p>
                  </div>
                </div>
                <button onClick={() => setIsAssignModalOpen(false)} className="p-2 text-brand-muted hover:text-brand-gold hover:bg-white/10 rounded-lg transition-colors">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6 space-y-6 bg-brand-card">
                <div className="p-4 bg-brand-gold/5 border border-brand-gold/10 rounded-xl flex gap-3">
                  <AlertTriangle className="text-brand-gold shrink-0" size={20} />
                  <p className="text-[11px] text-brand-text/80 leading-relaxed font-medium">
                    Reassigning <span className="text-brand-gold font-bold">"{companyToAssign?.name}"</span> will also reassign all associated contacts, deals, tasks, interactions, POs, and invoices to the new user.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Select User</label>
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all font-medium"
                  >
                    <option value="" disabled>Select a user...</option>
                    {users.map(u => (
                      <option key={u.uid} value={u.uid}>
                        {u.displayName} ({u.email}) - {u.role ? u.role.replace('_', ' ').toUpperCase() : 'USER'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-4 flex gap-4">
                  <button
                    type="button"
                    onClick={() => setIsAssignModalOpen(false)}
                    className="flex-1 px-6 py-3 border border-white/10 text-brand-muted font-bold rounded-xl hover:bg-white/5 transition-all uppercase tracking-widest text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAssign}
                    disabled={!selectedUserId || isAssigning}
                    className="flex-1 px-6 py-3 bg-gold-gradient text-brand-bg font-bold rounded-xl hover:opacity-90 transition-all shadow-lg shadow-brand-gold/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 uppercase tracking-widest text-xs"
                  >
                    {isAssigning ? (
                      <>
                        <div className="w-4 h-4 border-2 border-brand-bg/20 border-t-brand-bg rounded-full animate-spin" />
                        Assigning...
                      </>
                    ) : (
                      'Confirm Assignment'
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Add/Edit Company Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 flex items-center justify-center z-[60] p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsModalOpen(false);
                resetForm();
              }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-xl bg-brand-card rounded-2xl shadow-2xl border border-brand-gold/20 overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5 shrink-0">
                <h3 className="text-xl font-bold text-brand-gold uppercase tracking-wider flex items-center gap-2">
                  <Building2 size={22} />
                  {editingCompany ? 'Edit Company' : 'Add New Company'}
                </h3>
                <button 
                  onClick={() => {
                    setIsModalOpen(false);
                    resetForm();
                  }} 
                  className="p-2 text-brand-muted hover:text-brand-gold hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-5 bg-brand-card overflow-y-auto flex-1">
                {validationError && (
                  <div className="p-4 bg-brand-red/10 border border-brand-red/30 rounded-xl flex items-center gap-3 text-brand-red text-xs font-bold">
                    <AlertTriangle size={18} className="shrink-0" />
                    <span>{validationError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-5">
                  {/* Category Selection */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Company Category *</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setFormData({ ...formData, category: 'Single' });
                          setValidationError(null);
                        }}
                        className={`p-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                          formData.category === 'Single'
                            ? 'bg-brand-gold/15 border-brand-gold text-brand-gold shadow-sm'
                            : 'bg-white/5 border-white/10 text-brand-muted hover:bg-white/10'
                        }`}
                      >
                        <Building2 size={16} />
                        Single / Subsidiary
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFormData({ ...formData, category: 'Group/Holding' });
                          setValidationError(null);
                        }}
                        className={`p-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                          formData.category === 'Group/Holding'
                            ? 'bg-brand-gold/15 border-brand-gold text-brand-gold shadow-sm'
                            : 'bg-white/5 border-white/10 text-brand-muted hover:bg-white/10'
                        }`}
                      >
                        <Layers size={16} />
                        Group / Holding
                      </button>
                    </div>
                  </div>

                  {/* Company Name */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Company Name *</label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. PT Nusantara Holding or Acme Corp"
                      value={formData.name}
                      onChange={(e) => {
                        setFormData({ ...formData, name: e.target.value });
                        if (validationError) setValidationError(null);
                      }}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all font-medium"
                    />
                  </div>

                  {/* Group / Holding Member Companies Selector (Mandatory if Group/Holding) */}
                  {formData.category === 'Group/Holding' && (
                    <div className="p-4 bg-brand-gold/5 border border-brand-gold/20 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest flex items-center gap-1.5">
                          <Layers size={14} /> Mandatory List of Companies in Group *
                        </label>
                        <span className="text-[10px] text-brand-gold/80 font-bold">
                          {formData.groupCompanyIds.length} Selected
                        </span>
                      </div>

                      {/* Selected Chips */}
                      <div className="flex flex-wrap gap-2 min-h-[36px] p-2 bg-white/5 border border-white/10 rounded-xl">
                        {formData.groupCompanyIds.map((idOrName) => (
                          <span
                            key={idOrName}
                            className="bg-brand-gold/20 border border-brand-gold/40 text-brand-gold text-xs font-bold px-3 py-1 rounded-lg flex items-center gap-1.5 group"
                          >
                            <Building2 size={12} />
                            {getCompanyName(idOrName)}
                            <button
                              type="button"
                              onClick={() => toggleGroupCompany(idOrName)}
                              className="hover:text-brand-red transition-colors ml-1"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                        {formData.groupCompanyIds.length === 0 && (
                          <span className="text-xs text-brand-muted/50 italic py-0.5">
                            No companies selected yet. Select or type companies below...
                          </span>
                        )}
                      </div>

                      {/* Multi-select input / dropdown */}
                      <div className="relative">
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <input
                              type="text"
                              placeholder="Search or type company name..."
                              value={groupSearchTerm}
                              onChange={(e) => {
                                setGroupSearchTerm(e.target.value);
                                setIsGroupDropdownOpen(true);
                              }}
                              onFocus={() => setIsGroupDropdownOpen(true)}
                              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-brand-text text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all font-medium"
                            />
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted/40" size={16} />
                          </div>
                          {groupSearchTerm.trim() && !formData.groupCompanyIds.includes(groupSearchTerm.trim()) && (
                            <button
                              type="button"
                              onClick={() => toggleGroupCompany(groupSearchTerm.trim())}
                              className="px-3 py-2.5 bg-brand-gold/20 border border-brand-gold/40 text-brand-gold font-bold text-xs rounded-xl hover:bg-brand-gold/30 transition-all shrink-0"
                            >
                              + Add "{groupSearchTerm.trim()}"
                            </button>
                          )}
                        </div>

                        {/* Dropdown list of available companies */}
                        <AnimatePresence>
                          {isGroupDropdownOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -5 }}
                              className="absolute z-50 w-full mt-1 bg-brand-card border border-brand-gold/30 rounded-xl shadow-2xl overflow-hidden max-h-48 overflow-y-auto divide-y divide-white/5"
                            >
                              {companies
                                .filter(c => c.id !== editingCompany?.id)
                                .filter(c => c.name.toLowerCase().includes(groupSearchTerm.toLowerCase()))
                                .map(c => {
                                  const isSelected = formData.groupCompanyIds.includes(c.id) || formData.groupCompanyIds.includes(c.name);
                                  return (
                                    <button
                                      key={c.id}
                                      type="button"
                                      onClick={() => toggleGroupCompany(c.id)}
                                      className="w-full px-4 py-2.5 text-left text-xs text-brand-text hover:bg-white/5 transition-colors flex items-center justify-between"
                                    >
                                      <div className="flex items-center gap-2">
                                        <Building2 size={14} className="text-brand-gold/60" />
                                        <span className="font-bold">{c.name}</span>
                                        {c.category === 'Group/Holding' && (
                                          <span className="text-[9px] bg-brand-gold/10 text-brand-gold px-1.5 py-0.5 rounded">Holding</span>
                                        )}
                                      </div>
                                      {isSelected && <Check size={14} className="text-brand-gold" />}
                                    </button>
                                  );
                                })}

                              {companies.filter(c => c.id !== editingCompany?.id && c.name.toLowerCase().includes(groupSearchTerm.toLowerCase())).length === 0 && (
                                <div className="p-3 text-xs text-brand-muted text-center italic">
                                  No existing company found. Type above to add as custom member company name.
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}

                  {/* Industry */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Industry</label>
                    <input
                      type="text"
                      placeholder="e.g. Telecommunications, Finance, Mining"
                      value={formData.industry}
                      onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all font-medium text-sm"
                    />
                  </div>

                  {/* Website */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Website</label>
                    <input
                      type="url"
                      placeholder="https://example.com"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all font-medium text-sm"
                    />
                  </div>

                  {/* Address */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Address</label>
                    <textarea
                      rows={2}
                      placeholder="Company location address..."
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all resize-none font-medium text-sm"
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-4 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      resetForm();
                    }}
                    className="flex-1 px-6 py-3 border border-white/10 text-brand-muted font-bold rounded-xl hover:bg-white/5 transition-all uppercase tracking-widest text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-6 py-3 bg-gold-gradient text-brand-bg font-bold rounded-xl hover:opacity-90 transition-all shadow-lg shadow-brand-gold/10 uppercase tracking-widest text-xs"
                  >
                    {editingCompany ? 'Save Changes' : 'Create Company'}
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

export default Companies;
