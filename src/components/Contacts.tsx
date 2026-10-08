import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, Mail, Phone, Building2, Edit2, Trash2, X, AlertTriangle, Tag, Check, Filter, Sparkles, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Contact, Company, UserProfile, DEFAULT_CONTACT_TAGS, DefaultContactTag } from '../types';
import { format } from 'date-fns';
import { addDoc, collection, db, updateDoc, doc, deleteDoc, writeBatch, Timestamp, OperationType, handleFirestoreError, logEvent } from '../firebase';
import DeleteConfirmationModal from './DeleteConfirmationModal';

interface ContactsProps {
  contacts: Contact[];
  companies: Company[];
  userId: string;
  users: UserProfile[];
  userRole?: string;
}

export const getContactTagBadgeStyle = (tag: string) => {
  switch (tag.toLowerCase()) {
    case 'client':
      return {
        badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        dot: 'bg-emerald-400',
        activeBtn: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50 shadow-sm shadow-emerald-500/20',
      };
    case 'potential client':
      return {
        badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        dot: 'bg-amber-400',
        activeBtn: 'bg-amber-500/20 text-amber-300 border-amber-400/50 shadow-sm shadow-amber-500/20',
      };
    case 'internal':
      return {
        badge: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
        dot: 'bg-sky-400',
        activeBtn: 'bg-sky-500/20 text-sky-300 border-sky-400/50 shadow-sm shadow-sky-500/20',
      };
    default:
      return {
        badge: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
        dot: 'bg-purple-400',
        activeBtn: 'bg-purple-500/20 text-purple-200 border-purple-400/50 shadow-sm shadow-purple-500/20',
      };
  }
};

const Contacts: React.FC<ContactsProps> = ({ contacts, companies, userId, users, userRole }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [customTagInput, setCustomTagInput] = useState('');
  const [isBatchTagging, setIsBatchTagging] = useState(false);
  const [batchTagSuccessMsg, setBatchTagSuccessMsg] = useState<string | null>(null);
  const hasAutoMigratedRef = useRef(false);

  const [formData, setFormData] = useState<{
    name: string;
    title: string;
    email: string;
    phone: string;
    companyId: string;
    tags: string[];
  }>({
    name: '',
    title: '',
    email: '',
    phone: '',
    companyId: '',
    tags: ['Client'],
  });
  const [companySearchTerm, setCompanySearchTerm] = useState('');
  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false);

  const contactsMissingClientTag = contacts.filter(
    c => !c.tags || !c.tags.includes('Client')
  );

  const handleBatchTagAllAsClient = async (isAuto = false) => {
    const targets = contacts.filter(c => !c.tags || !c.tags.includes('Client'));
    if (targets.length === 0) {
      if (!isAuto) {
        setBatchTagSuccessMsg('All contacts in database are already tagged with "Client".');
        setTimeout(() => setBatchTagSuccessMsg(null), 4000);
      }
      return;
    }

    setIsBatchTagging(true);
    try {
      const BATCH_SIZE = 400;
      let totalTagged = 0;

      for (let i = 0; i < targets.length; i += BATCH_SIZE) {
        const chunk = targets.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        chunk.forEach(contact => {
          const contactRef = doc(db, 'contacts', contact.id);
          const currentTags = contact.tags || [];
          const updatedTags = currentTags.includes('Client') ? currentTags : [...currentTags, 'Client'];
          batch.update(contactRef, {
            tags: updatedTags,
            updatedAt: Timestamp.now(),
          });
        });

        await batch.commit();
        totalTagged += chunk.length;
      }

      await logEvent('Database Tagging', `Tagged ${totalTagged} contacts with "Client"`);
      setBatchTagSuccessMsg(`Successfully tagged ${totalTagged} existing contact${totalTagged === 1 ? '' : 's'} with "Client"!`);
      setTimeout(() => setBatchTagSuccessMsg(null), 6000);
    } catch (error) {
      console.error('Error batch tagging contacts:', error);
      handleFirestoreError(error, OperationType.UPDATE, 'contacts (batch tagging)');
    } finally {
      setIsBatchTagging(false);
    }
  };

  // Auto-migrate on load for admins/managers if untagged contacts exist
  useEffect(() => {
    if (!hasAutoMigratedRef.current && contacts.length > 0 && contactsMissingClientTag.length > 0) {
      const canUpdateAll = userRole === 'admin' || userRole === 'manager' || userRole === 'super_user';
      if (canUpdateAll) {
        hasAutoMigratedRef.current = true;
        handleBatchTagAllAsClient(true);
      }
    }
  }, [contacts.length, contactsMissingClientTag.length, userRole]);

  const filteredCompanies = companies.filter(c => 
    c.name.toLowerCase().includes(companySearchTerm.toLowerCase())
  );

  const getCompanyName = (id?: string) => {
    if (!id) return 'N/A';
    return companies.find(c => c.id === id)?.name || 'Unknown Company';
  };

  // Collect all unique tags from contacts and default tags
  const allExistingTags = Array.from(
    new Set([
      ...DEFAULT_CONTACT_TAGS,
      ...contacts.flatMap(c => c.tags || [])
    ])
  );

  const filteredContacts = contacts.filter(contact => {
    const matchesSearch = 
      contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getCompanyName(contact.companyId).toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      Boolean(contact.tags && contact.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase())));
    
    const matchesOwner = selectedOwnerId === 'all' || contact.ownerId === selectedOwnerId;
    const matchesTag = selectedTag === 'all' || (contact.tags && contact.tags.includes(selectedTag));
    
    return matchesSearch && matchesOwner && matchesTag;
  }).sort((a, b) => a.name.localeCompare(b.name));

  const handleAddCustomTag = () => {
    const trimmed = customTagInput.trim();
    if (!trimmed) return;
    if (!formData.tags.includes(trimmed)) {
      setFormData({ ...formData, tags: [...formData.tags, trimmed] });
    }
    setCustomTagInput('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const selectedCompany = companies.find(c => c.id === formData.companyId);
      const contactOwnerId = selectedCompany?.ownerId || userId;

      const payload = {
        name: formData.name,
        title: formData.title || '',
        email: formData.email || '',
        phone: formData.phone || '',
        companyId: formData.companyId || '',
        tags: formData.tags || [],
        ownerId: contactOwnerId,
        updatedAt: Timestamp.now(),
      };

      if (editingContact) {
        const contactRef = doc(db, 'contacts', editingContact.id);
        await updateDoc(contactRef, payload);
        await logEvent('Contact Updated', `Contact: ${formData.name}`);
      } else {
        await addDoc(collection(db, 'contacts'), {
          ...payload,
          createdAt: Timestamp.now(),
        });
        await logEvent('Contact Created', `Contact: ${formData.name}`);
      }
      setIsModalOpen(false);
      setEditingContact(null);
      setFormData({ name: '', title: '', email: '', phone: '', companyId: '', tags: [] });
      setCustomTagInput('');
      setCompanySearchTerm('');
    } catch (error) {
      handleFirestoreError(error, editingContact ? OperationType.UPDATE : OperationType.CREATE, 'contacts');
    }
  };

  const handleDelete = async (id: string) => {
    setContactToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!contactToDelete) return;
    const contact = contacts.find(c => c.id === contactToDelete);
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'contacts', contactToDelete));
      if (contact) {
        await logEvent('Contact Deleted', `Contact: ${contact.name}`);
      }
      setIsDeleteModalOpen(false);
      setContactToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `contacts/${contactToDelete}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const openEditModal = (contact: Contact) => {
    setEditingContact(contact);
    const companyName = getCompanyName(contact.companyId);
    setFormData({
      name: contact.name,
      title: contact.title || '',
      email: contact.email || '',
      phone: contact.phone || '',
      companyId: contact.companyId || '',
      tags: contact.tags || [],
    });
    setCustomTagInput('');
    setCompanySearchTerm(companyName === 'N/A' || companyName === 'Unknown Company' ? '' : companyName);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Top Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-1 flex-wrap items-center gap-3 max-w-3xl">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" size={20} />
            <input
              type="text"
              placeholder="Search contacts, companies, tags..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-brand-card border border-white/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold/10 transition-all text-brand-text placeholder:text-brand-muted/50 font-medium"
            />
          </div>

          {/* Tag Filter Dropdown */}
          <div className="w-44">
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="w-full px-4 py-2.5 bg-brand-card border border-white/5 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/10 transition-all text-sm font-medium"
            >
              <option value="all">🏷️ All Tags ({contacts.length})</option>
              {allExistingTags.map(tag => {
                const count = contacts.filter(c => c.tags?.includes(tag)).length;
                return (
                  <option key={tag} value={tag}>
                    {tag} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Owner Filter Dropdown */}
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

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleBatchTagAllAsClient(false)}
            disabled={isBatchTagging}
            title="Tag all contacts in database with 'Client'"
            className="flex items-center justify-center gap-2 bg-brand-card hover:bg-white/10 text-brand-gold border border-brand-gold/30 px-4 py-2.5 rounded-xl font-bold text-xs transition-all disabled:opacity-50 shadow-sm"
          >
            {isBatchTagging ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Tagging Database...</span>
              </>
            ) : (
              <>
                <Sparkles size={14} />
                <span>Tag All as "Client"</span>
              </>
            )}
          </button>

          <button
            onClick={() => {
              setEditingContact(null);
              setFormData({ name: '', title: '', email: '', phone: '', companyId: '', tags: ['Client'] });
              setCustomTagInput('');
              setCompanySearchTerm('');
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 bg-gold-gradient text-brand-bg px-6 py-2.5 rounded-xl font-bold hover:opacity-90 transition-all shadow-lg shadow-brand-gold/10"
          >
            <Plus size={20} />
            Add Contact
          </button>
        </div>
      </div>

      {/* Success Feedback Toast/Banner */}
      <AnimatePresence>
        {batchTagSuccessMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 px-4 flex items-center justify-between text-xs text-emerald-400 font-medium shadow-sm"
          >
            <div className="flex items-center gap-2.5">
              <Check size={16} className="text-emerald-400 flex-shrink-0" />
              <span>{batchTagSuccessMsg}</span>
            </div>
            <button onClick={() => setBatchTagSuccessMsg(null)} className="text-emerald-400/60 hover:text-emerald-300 p-1">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Untagged Contacts Alert Notice */}
      {contactsMissingClientTag.length > 0 && !isBatchTagging && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-amber-200">
            <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
            <span>
              Found <strong>{contactsMissingClientTag.length}</strong> contact{contactsMissingClientTag.length === 1 ? '' : 's'} in the database missing the <span className="text-brand-gold font-bold">"Client"</span> tag.
            </span>
          </div>
          <button
            onClick={() => handleBatchTagAllAsClient(false)}
            className="px-3.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold rounded-lg border border-amber-500/40 text-xs transition-all uppercase tracking-wider flex items-center gap-1.5 justify-center flex-shrink-0"
          >
            <Tag size={13} />
            Tag All with "Client"
          </button>
        </div>
      )}

      {/* Quick Tag Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
        <span className="text-[11px] font-bold text-brand-muted uppercase tracking-wider flex items-center gap-1.5 mr-1 flex-shrink-0">
          <Tag size={13} className="text-brand-gold/70" />
          Tags:
        </span>
        <button
          onClick={() => setSelectedTag('all')}
          className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 flex-shrink-0 ${
            selectedTag === 'all'
              ? 'bg-brand-gold/20 text-brand-gold border-brand-gold/40'
              : 'bg-brand-card text-brand-muted border-white/5 hover:border-white/10 hover:text-brand-text'
          }`}
        >
          All
          <span className="text-[10px] px-1.5 py-0.2 bg-white/10 rounded-full font-bold">
            {contacts.length}
          </span>
        </button>
        {allExistingTags.map((tag) => {
          const count = contacts.filter(c => c.tags?.includes(tag)).length;
          const isSelected = selectedTag === tag;
          const style = getContactTagBadgeStyle(tag);
          return (
            <button
              key={tag}
              onClick={() => setSelectedTag(isSelected ? 'all' : tag)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 flex-shrink-0 ${
                isSelected
                  ? style.activeBtn
                  : 'bg-brand-card text-brand-muted border-white/5 hover:border-white/10 hover:text-brand-text'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
              {tag}
              <span className="text-[10px] px-1.5 py-0.2 bg-white/10 rounded-full font-bold">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="bg-brand-card rounded-2xl border border-white/5 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-white/5">
                <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-brand-muted uppercase tracking-widest">Contact Info</th>
                <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-brand-muted uppercase tracking-widest">Title</th>
                <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-brand-muted uppercase tracking-widest">Company</th>
                <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-brand-muted uppercase tracking-widest">Tags</th>
                <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-brand-muted uppercase tracking-widest">Created</th>
                <th className="px-4 py-3 whitespace-nowrap text-[10px] font-bold text-brand-muted uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {Object.entries(
                filteredContacts.reduce((acc, contact) => {
                  const owner = users.find(u => u.uid === contact.ownerId);
                  const ownerName = owner ? owner.displayName : 'Unknown Owner';
                  if (!acc[ownerName]) acc[ownerName] = [];
                  acc[ownerName].push(contact);
                  return acc;
                }, {} as Record<string, Contact[]>)
              ).map(([ownerName, ownerContacts]: [string, any]) => (
                <React.Fragment key={ownerName}>
                  <tr className="bg-white/5 border-b border-white/5">
                    <td colSpan={6} className="px-4 py-2.5 text-[10px] font-bold text-brand-gold uppercase tracking-widest">
                      {ownerName} ({ownerContacts.length} {ownerContacts.length === 1 ? 'contact' : 'contacts'})
                    </td>
                  </tr>
                  {ownerContacts.map((contact: Contact) => (
                    <tr key={contact.id} className="hover:bg-white/5 transition-colors group">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-bold text-brand-text text-xs">{contact.name}</span>
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-brand-muted font-medium">
                            {contact.email && <span className="flex items-center gap-1"><Mail size={13} className="text-brand-gold/40" /> {contact.email}</span>}
                            {contact.phone && <span className="flex items-center gap-1"><Phone size={13} className="text-brand-gold/40" /> {contact.phone}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-brand-muted font-medium">
                        {contact.title || <span className="text-brand-muted/30 italic">No title</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-brand-text font-medium text-xs">
                          <Building2 size={15} className="text-brand-gold/60" />
                          <span>{getCompanyName(contact.companyId)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5 max-w-[240px]">
                          {contact.tags && contact.tags.length > 0 ? (
                            contact.tags.map((tag) => {
                              const style = getContactTagBadgeStyle(tag);
                              return (
                                <span
                                  key={tag}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${style.badge}`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                                  {tag}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-[11px] text-brand-muted/40 italic">No tags</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-brand-muted font-medium">
                        {format(contact.createdAt.toDate(), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {(userRole === 'admin' || userRole === 'manager' || userRole === 'super_user' || userRole === 'engineer' || userRole === 'finance' || userRole === 'procurement' || userRole === 'project_manager' || contact.ownerId === userId) && (
                            <>
                              <button onClick={() => openEditModal(contact)} className="p-2 text-brand-muted hover:text-brand-gold hover:bg-brand-gold/10 rounded-lg transition-all" title="Edit Contact">
                                <Edit2 size={18} />
                              </button>
                              <button onClick={() => handleDelete(contact.id)} className="p-2 text-brand-muted hover:text-brand-red hover:bg-brand-red/10 rounded-lg transition-all" title="Delete Contact">
                                <Trash2 size={18} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {filteredContacts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-brand-muted italic">
                    {selectedTag !== 'all'
                      ? `No contacts found with tag "${selectedTag}".`
                      : 'No contacts found. Add your first contact to get started!'}
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
        title="Delete Contact"
        message="Are you sure you want to delete this contact? This action cannot be undone."
        isDeleting={isDeleting}
      />

      {/* Add / Edit Contact Modal */}
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
              className="relative w-full max-w-xl max-h-[92vh] flex flex-col bg-brand-card rounded-2xl shadow-2xl overflow-hidden border border-brand-gold/20"
            >
              <div className="p-5 px-6 border-b border-white/5 flex items-center justify-between bg-white/5 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-brand-gold uppercase tracking-wider">{editingContact ? 'Edit Contact' : 'Add New Contact'}</h3>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-brand-muted hover:text-brand-gold hover:bg-white/10 rounded-lg transition-colors">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-5 bg-brand-card overflow-y-auto flex-1">
                <div className="grid grid-cols-1 gap-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Full Name *</label>
                    <input
                      required
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all text-brand-text placeholder:text-brand-muted/30 font-medium"
                      placeholder="e.g. John Doe"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Job Title</label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all text-brand-text placeholder:text-brand-muted/30 font-medium"
                      placeholder="e.g. Chief Technology Officer / Sales Manager"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Email</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all text-brand-text font-medium"
                        placeholder="john@company.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Phone</label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all text-brand-text font-medium"
                        placeholder="+62 812..."
                      />
                    </div>
                  </div>

                  <div className="space-y-2 relative">
                    <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1">Company</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={companySearchTerm}
                        onChange={(e) => {
                          setCompanySearchTerm(e.target.value);
                          setIsCompanyDropdownOpen(true);
                          if (e.target.value === '') {
                            setFormData({ ...formData, companyId: '' });
                          }
                        }}
                        onFocus={() => setIsCompanyDropdownOpen(true)}
                        placeholder="Search for a company..."
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all text-brand-text placeholder:text-brand-muted/30 font-medium"
                      />
                      <Building2 className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-gold/30" size={18} />
                    </div>
                    
                    <AnimatePresence>
                      {isCompanyDropdownOpen && (
                        <>
                          <div 
                            className="fixed inset-0 z-[70]" 
                            onClick={() => setIsCompanyDropdownOpen(false)} 
                          />
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute left-0 right-0 top-full mt-2 bg-brand-card border border-brand-gold/20 rounded-xl shadow-2xl z-[80] max-h-48 overflow-y-auto divide-y divide-white/5 overflow-hidden"
                          >
                            {filteredCompanies.length > 0 ? (
                              filteredCompanies.map(company => (
                                <button
                                  key={company.id}
                                  type="button"
                                  onClick={() => {
                                    setFormData({ ...formData, companyId: company.id });
                                    setCompanySearchTerm(company.name);
                                    setIsCompanyDropdownOpen(false);
                                  }}
                                  className="w-full px-4 py-3 text-left hover:bg-white/5 transition-colors flex items-center justify-between group"
                                >
                                  <span className="text-brand-text group-hover:text-brand-gold transition-colors font-medium">{company.name}</span>
                                  {formData.companyId === company.id && (
                                    <div className="w-2 h-2 rounded-full bg-brand-gold" />
                                  )}
                                </button>
                              ))
                            ) : (
                              <div className="px-4 py-3 text-brand-muted text-sm italic">
                                No companies found
                              </div>
                            )}
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Contact Tags Section */}
                  <div className="space-y-2.5 pt-2 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest ml-1 flex items-center gap-1.5">
                        <Tag size={12} />
                        Contact Tags
                      </label>
                      <span className="text-[10px] text-brand-muted font-medium">Default tags & custom tags</span>
                    </div>

                    {/* Predefined Default Tags */}
                    <div className="flex flex-wrap gap-2">
                      {DEFAULT_CONTACT_TAGS.map((tag) => {
                        const isSelected = formData.tags.includes(tag);
                        const style = getContactTagBadgeStyle(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) });
                              } else {
                                setFormData({ ...formData, tags: [...formData.tags, tag] });
                              }
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                              isSelected
                                ? style.activeBtn
                                : 'bg-white/5 text-brand-muted border-white/10 hover:border-white/20 hover:text-brand-text'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${isSelected ? style.dot : 'bg-brand-muted/40'}`} />
                            {tag}
                            {isSelected && <Check size={13} className="ml-0.5" />}
                          </button>
                        );
                      })}
                    </div>

                    {/* Custom Tag Input */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={customTagInput}
                        onChange={(e) => setCustomTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomTag();
                          }
                        }}
                        placeholder="Add custom tag (e.g. Partner, Vendor)..."
                        className="flex-1 px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-brand-text placeholder:text-brand-muted/40 focus:outline-none focus:ring-2 focus:ring-brand-gold/20 font-medium"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomTag}
                        disabled={!customTagInput.trim()}
                        className="px-4 py-2 bg-white/10 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed text-brand-gold text-xs font-bold rounded-xl border border-white/10 transition-colors uppercase tracking-wider"
                      >
                        + Add
                      </button>
                    </div>

                    {/* Custom Tags Pills Display */}
                    {formData.tags.filter(t => !DEFAULT_CONTACT_TAGS.includes(t as any)).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {formData.tags
                          .filter(t => !DEFAULT_CONTACT_TAGS.includes(t as any))
                          .map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-500/10 text-purple-300 border border-purple-500/30"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                              {tag}
                              <button
                                type="button"
                                onClick={() => setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) })}
                                className="text-purple-400 hover:text-purple-200 ml-0.5 p-0.5 rounded hover:bg-purple-500/20"
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4 flex gap-4 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-3 border border-white/10 text-brand-muted font-bold rounded-xl hover:bg-white/5 transition-all uppercase tracking-widest text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-6 py-3 bg-gold-gradient text-brand-bg font-bold rounded-xl hover:opacity-90 transition-all shadow-lg shadow-brand-gold/10 uppercase tracking-widest text-xs"
                  >
                    {editingContact ? 'Save Changes' : 'Create Contact'}
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

export default Contacts;
