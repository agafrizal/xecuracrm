import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Users, Settings, Database, Activity, MoreVertical, UserCheck, UserMinus, Clock, Download, Upload, AlertTriangle, Tag, Sparkles } from 'lucide-react';
import { db, collection, onSnapshot, query, orderBy, limit, doc, updateDoc, addDoc, getDocs, deleteDoc, writeBatch, Timestamp, handleFirestoreError, OperationType, logEvent } from '../firebase';
import { UserProfile, SystemLog } from '../types';
import { backupService, BackupMetadata } from '../services/backupService';

interface AdminPanelProps {
  userId: string;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ userId }) => {
  console.log('AdminPanel rendering for user:', userId);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [counts, setCounts] = useState({
    contacts: 0,
    deals: 0,
    tasks: 0,
    companies: 0
  });
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isTaggingContacts, setIsTaggingContacts] = useState(false);
  const [backups, setBackups] = useState<BackupMetadata[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ title: string, message: string, onConfirm: () => void } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUsers(snapshot.docs.map(doc => {
        const data = doc.data() as UserProfile;
        return { ...data, uid: data.uid || doc.id };
      }));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'logs'), orderBy('createdAt', 'desc'), limit(5));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SystemLog)));
      setLogsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'logs');
      setLogsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const collections = ['contacts', 'deals', 'tasks', 'companies'];
    const unsubscribes = collections.map(col => 
      onSnapshot(collection(db, col), (snapshot) => {
        setCounts(prev => ({ ...prev, [col]: snapshot.size }));
      })
    );

    return () => unsubscribes.forEach(unsub => unsub());
  }, []);

  useEffect(() => {
    const fetchBackups = async () => {
      try {
        const data = await backupService.getBackups();
        setBackups(data);
      } catch (error) {
        console.error('Error fetching backups:', error);
      } finally {
        setBackupsLoading(false);
      }
    };

    fetchBackups();
    // Also check for auto backup on panel open
    backupService.checkAndTriggerAutoBackup(userId);
  }, [userId]);

  const handleCreateBackup = async () => {
    setIsBackingUp(true);
    setStatusMessage({ type: 'info', text: 'Creating system backup...' });
    try {
      const newBackup = await backupService.createBackup(userId);
      setBackups(prev => [newBackup, ...prev]);
      setStatusMessage({ type: 'success', text: 'Backup created successfully!' });
      await logEvent('Backup Created', `Manual backup created: ${newBackup.fileName}`);
    } catch (error) {
      console.error('Backup failed:', error);
      setStatusMessage({ type: 'error', text: 'Backup failed. Please try again.' });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleDeleteBackup = async (backup: BackupMetadata) => {
    setConfirmAction({
      title: 'Delete Backup',
      message: `Are you sure you want to delete the backup "${backup.fileName}"? This action cannot be undone.`,
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await backupService.deleteBackup(backup);
          setBackups(prev => prev.filter(b => b.id !== backup.id));
          setStatusMessage({ type: 'success', text: 'Backup deleted successfully.' });
          await logEvent('Backup Deleted', `Backup deleted: ${backup.fileName}`);
        } catch (error) {
          console.error('Delete backup failed:', error);
          setStatusMessage({ type: 'error', text: 'Failed to delete backup.' });
        }
      }
    });
  };

  const handleRestoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);
        
        setConfirmAction({
          title: 'Restore System Data',
          message: 'WARNING: This will overwrite current system data with the data from the backup file. This action is destructive and cannot be undone. Are you absolutely sure?',
          onConfirm: async () => {
            setConfirmAction(null);
            setIsRestoring(true);
            setStatusMessage({ type: 'info', text: 'Restoring system data... Please do not close the browser.' });
            try {
              await backupService.restoreFromBackup(data);
              setStatusMessage({ type: 'success', text: 'System data restored successfully! Please refresh the page.' });
              await logEvent('System Restored', `Data restored from file: ${file.name}`);
            } catch (error) {
              console.error('Restore failed:', error);
              setStatusMessage({ type: 'error', text: 'Restore failed. Data may be inconsistent.' });
            } finally {
              setIsRestoring(false);
            }
          }
        });
      } catch (error) {
        console.error('Invalid backup file:', error);
        setStatusMessage({ type: 'error', text: 'Invalid backup file format.' });
      }
    };
    reader.readAsText(file);
    // Reset input
    event.target.value = '';
  };

  const changeUserRole = async (user: UserProfile, newRole: UserProfile['role']) => {
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { role: newRole });
      await logEvent('Role Updated', `User ${user.email} role changed to ${newRole}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const toggleRole = async (user: UserProfile) => {
    let newRole: UserProfile['role'];
    if (user.role === 'sales') newRole = 'procurement';
    else if (user.role === 'procurement') newRole = 'finance';
    else if (user.role === 'finance') newRole = 'project_manager';
    else if (user.role === 'project_manager') newRole = 'manager';
    else if (user.role === 'manager') newRole = 'super_user';
    else if (user.role === 'super_user') newRole = 'engineer';
    else if (user.role === 'engineer') newRole = 'admin';
    else newRole = 'sales';

    await changeUserRole(user, newRole);
  };

  const deleteUser = async (user: UserProfile) => {
    console.log('Attempting to delete user:', user);
    
    if (!user.uid) {
      setStatusMessage({ type: 'error', text: "Error: User ID is missing." });
      return;
    }

    if (user.uid === userId) {
      setStatusMessage({ type: 'error', text: "You cannot delete your own account." });
      return;
    }

    setConfirmAction({
      title: 'Delete User',
      message: `Are you sure you want to delete user ${user.email}? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          console.log('Deleting document:', `users/${user.uid}`);
          await deleteDoc(doc(db, 'users', user.uid));
          console.log('Logging deletion event...');
          await logEvent('User Deleted', `Admin deleted user ${user.email}`);
          setStatusMessage({ type: 'success', text: `User ${user.email} deleted successfully.` });
        } catch (error) {
          console.error('Delete user failed:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          setStatusMessage({ type: 'error', text: `Failed to delete user: ${errorMessage}` });
          handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}`);
        } finally {
          setConfirmAction(null);
        }
      }
    });
  };

  const downloadLogsCSV = () => {
    if (logs.length === 0) return;

    const headers = ['Date', 'Event', 'User', 'Details'];
    const csvContent = [
      headers.join(','),
      ...logs.map(log => {
        const date = log.createdAt.toDate().toISOString();
        const event = `"${log.event.replace(/"/g, '""')}"`;
        const user = `"${log.userEmail.replace(/"/g, '""')}"`;
        const details = `"${(log.details || '').replace(/"/g, '""')}"`;
        return [date, event, user, details].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `system_logs_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleTagAllContactsAsClient = async () => {
    setIsTaggingContacts(true);
    try {
      const contactsSnap = await getDocs(collection(db, 'contacts'));
      const untaggedDocs = contactsSnap.docs.filter(d => {
        const data = d.data();
        return !data.tags || !data.tags.includes('Client');
      });

      if (untaggedDocs.length === 0) {
        setStatusMessage({ type: 'info', text: 'All contacts in database already have the "Client" tag.' });
        setIsTaggingContacts(false);
        return;
      }

      const BATCH_SIZE = 400;
      let totalTagged = 0;

      for (let i = 0; i < untaggedDocs.length; i += BATCH_SIZE) {
        const chunk = untaggedDocs.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        chunk.forEach(d => {
          const currentTags = d.data().tags || [];
          const updatedTags = currentTags.includes('Client') ? currentTags : [...currentTags, 'Client'];
          batch.update(d.ref, {
            tags: updatedTags,
            updatedAt: Timestamp.now(),
          });
        });

        await batch.commit();
        totalTagged += chunk.length;
      }

      await logEvent('Database Maintenance', `Admin batch tagged ${totalTagged} contacts with "Client"`);
      setStatusMessage({ type: 'success', text: `Successfully tagged ${totalTagged} contacts with "Client"!` });
    } catch (error) {
      console.error('Error tagging contacts:', error);
      handleFirestoreError(error, OperationType.UPDATE, 'contacts');
      setStatusMessage({ type: 'error', text: 'Failed to tag contacts in database.' });
    } finally {
      setIsTaggingContacts(false);
    }
  };

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const collections = ['users', 'contacts', 'deals', 'tasks', 'companies', 'logs'];
      const backupData: any = {};

      for (const colName of collections) {
        const snapshot = await getDocs(collection(db, colName));
        backupData[colName] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      }

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `xecura_crm_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      await logEvent('Database Backup', 'System database backup exported');
    } catch (error) {
      console.error('Backup failed:', error);
      setStatusMessage({ type: 'error', text: 'Backup failed. See console for details.' });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setConfirmAction({
      title: 'Restore Database',
      message: 'WARNING: This will overwrite existing data with the same IDs. Are you sure you want to proceed with the restoration?',
      onConfirm: async () => {
        setIsRestoring(true);
        try {
          const reader = new FileReader();
          reader.onload = async (e) => {
            try {
              const backupData = JSON.parse(e.target?.result as string);
              const collections = Object.keys(backupData);

              for (const colName of collections) {
                const docs = backupData[colName];
                for (let i = 0; i < docs.length; i += 500) {
                  const batch = writeBatch(db);
                  const chunk = docs.slice(i, i + 500);
                  
                  chunk.forEach((docData: any) => {
                    const { id, ...data } = docData;
                    Object.keys(data).forEach(key => {
                      if (data[key] && typeof data[key] === 'object' && 'seconds' in data[key]) {
                        data[key] = new Timestamp(data[key].seconds, data[key].nanoseconds);
                      }
                    });
                    
                    const docRef = doc(db, colName, id);
                    batch.set(docRef, data);
                  });
                  
                  await batch.commit();
                }
              }

              await logEvent('Database Restore', 'System database restored from backup');
              setStatusMessage({ type: 'success', text: 'Database restored successfully!' });
            } catch (err) {
              console.error('Restore processing failed:', err);
              setStatusMessage({ type: 'error', text: 'Failed to process backup file. Ensure it is a valid Xecura CRM backup.' });
            } finally {
              setIsRestoring(false);
              if (fileInputRef.current) fileInputRef.current.value = '';
              setConfirmAction(null);
            }
          };
          reader.readAsText(file);
        } catch (error) {
          console.error('Restore failed:', error);
          setStatusMessage({ type: 'error', text: 'Restore failed. See console for details.' });
          setIsRestoring(false);
          setConfirmAction(null);
        }
      }
    });
  };

  const totalRecords = counts.contacts + counts.deals + counts.tasks + counts.companies + users.length + logs.length;
  // Estimate size: ~1.2 KB per record + base overhead
  const estimatedSizeMB = (totalRecords * 1.2 / 1024) + 0.5;
  const sizeDisplay = estimatedSizeMB < 1 
    ? `${(estimatedSizeMB * 1024).toFixed(1)} KB`
    : `${estimatedSizeMB.toFixed(2)} MB`;

  const stats = [
    { label: 'Total Users', value: users.length.toString(), icon: Users, bg: 'bg-brand-gold/10' },
    { label: 'System Health', value: '99.9%', icon: Activity, bg: 'bg-brand-gold/10' },
    { label: 'Database Size', value: sizeDisplay, icon: Database, bg: 'bg-brand-gold/10' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-brand-gold tracking-tight uppercase">Administrator Panel</h2>
          <p className="text-brand-muted mt-1 font-bold">Manage system-wide settings, users, and monitor performance.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-5 py-3 bg-gold-gradient text-brand-bg rounded-xl text-sm font-bold uppercase tracking-[0.2em] shadow-xl shadow-brand-gold/10 border border-brand-card">
            <Shield size={18} />
            Secure Terminal
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-brand-card p-6 rounded-3xl border border-white/5 shadow-2xl group hover:border-brand-gold/20 transition-all relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-brand-gold/5 rounded-full -mr-12 -mt-12 blur-2xl transition-all group-hover:bg-brand-gold/10" />
            <div className={`relative z-10 w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center mb-4 border border-white/5 text-brand-gold shadow-lg shadow-brand-gold/5 group-hover:scale-110 group-hover:bg-gold-gradient group-hover:text-brand-bg transition-all`}>
              <stat.icon size={24} />
            </div>
            <p className="relative z-10 text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em] opacity-80">{stat.label}</p>
            <p className="relative z-10 text-2xl font-bold text-brand-text mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Database Management Section */}
      <div className="bg-brand-card rounded-3xl border border-white/5 shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-gold/10 rounded-xl flex items-center justify-center text-brand-gold border border-brand-gold/20">
              <Database size={20} />
            </div>
            <div>
              <h3 className="font-bold text-brand-text uppercase tracking-widest text-sm">System Database</h3>
              <p className="text-[10px] text-brand-muted uppercase font-bold tracking-widest mt-0.5">Control central repository nodes</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleBackup}
              disabled={isBackingUp || isRestoring}
              className="flex items-center gap-2 px-5 py-2.5 bg-white/5 text-brand-muted rounded-xl text-sm font-bold hover:bg-white/10 border border-white/10 transition-all disabled:opacity-50 uppercase tracking-widest text-xs"
            >
              {isBackingUp ? (
                <div className="w-4 h-4 border-2 border-brand-gold/20 border-t-brand-gold rounded-full animate-spin" />
              ) : (
                <Download size={16} />
              )}
              Export Archive
            </button>
            <label className="flex items-center gap-2 px-5 py-2.5 bg-gold-gradient text-brand-bg rounded-xl text-sm font-bold hover:opacity-90 transition-all cursor-pointer disabled:opacity-50 shadow-lg shadow-brand-gold/10 border border-brand-card uppercase tracking-widest text-xs">
              {isRestoring ? (
                <div className="w-4 h-4 border-2 border-brand-bg/20 border-t-brand-bg rounded-full animate-spin" />
              ) : (
                <Upload size={16} />
              )}
              Restore Node
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleRestore}
                accept=".json"
                className="hidden"
                disabled={isBackingUp || isRestoring}
              />
            </label>
          </div>
        </div>
        <div className="p-6 bg-brand-red/5 flex items-start gap-4 border-t border-brand-red/20">
          <div className="w-10 h-10 rounded-xl bg-brand-red/10 flex items-center justify-center text-brand-red border border-brand-red/20 shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div className="text-sm">
            <p className="font-bold mb-1 text-brand-red uppercase tracking-widest">Crucial Alert: Data Synchronization</p>
            <p className="text-brand-muted/80 font-medium">Restoring data will overwrite existing records with matching IDs. It is recommended to perform a backup before restoring any data. Ensure your backup file is from a trusted XECURA secure terminal.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-brand-card rounded-3xl border border-white/5 shadow-2xl overflow-hidden">
          <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
            <h3 className="font-bold text-brand-gold uppercase tracking-widest text-sm">Access Control</h3>
            <span className="text-[10px] font-bold text-brand-muted uppercase tracking-[0.2em]">{users.length} Active Nodes</span>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-gold"></div>
                </div>
              ) : (
                users.map((user) => (
                  <div key={user.uid} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-brand-gold/20 transition-all group">
                    <div className="flex items-center gap-4">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt={user.displayName} className="w-11 h-11 rounded-xl border border-white/10 shadow-lg object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-11 h-11 bg-brand-gold/10 rounded-xl flex items-center justify-center text-brand-gold font-bold border border-brand-gold/20">
                          {user.displayName.charAt(0)}
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-brand-text text-sm group-hover:text-brand-gold transition-colors uppercase tracking-wider">{user.displayName}</p>
                        <p className="text-[10px] text-brand-muted font-bold uppercase tracking-widest">{user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <select
                        value={user.role}
                        onChange={(e) => changeUserRole(user, e.target.value as UserProfile['role'])}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border cursor-pointer focus:outline-none transition-all ${
                          user.role === 'admin' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20 shadow-[0_0_10px_rgba(168,85,247,0.1)]' : 
                          user.role === 'finance' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]' :
                          user.role === 'procurement' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20 shadow-[0_0_10px_rgba(249,115,22,0.1)]' :
                          user.role === 'project_manager' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.1)]' :
                          user.role === 'manager' ? 'bg-brand-cyan/10 text-brand-cyan border-brand-cyan/20 shadow-[0_0_10px_rgba(0,188,212,0.1)]' :
                          user.role === 'super_user' ? 'bg-brand-gold/10 text-brand-gold border-brand-gold/20 shadow-[0_0_10px_rgba(255,183,77,0.1)]' :
                          user.role === 'engineer' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.1)]' :
                          'bg-white/5 text-brand-muted border-white/10'
                        }`}
                      >
                        <option value="sales" className="bg-brand-card text-brand-text">SALES</option>
                        <option value="procurement" className="bg-brand-card text-brand-text">PROCUREMENT</option>
                        <option value="finance" className="bg-brand-card text-brand-text">FINANCE</option>
                        <option value="project_manager" className="bg-brand-card text-brand-text">PROJECT MANAGER</option>
                        <option value="manager" className="bg-brand-card text-brand-text">MANAGER</option>
                        <option value="super_user" className="bg-brand-card text-brand-text">SUPER USER</option>
                        <option value="engineer" className="bg-brand-card text-brand-text">ENGINEER</option>
                        <option value="admin" className="bg-brand-card text-brand-text">ADMIN</option>
                      </select>
                      <div className="flex items-center gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => toggleRole(user)}
                          className="p-2 text-brand-muted hover:text-brand-gold hover:bg-white/10 rounded-lg transition-all"
                          title="Elevate/Cycle Node Permissions"
                        >
                          <UserCheck size={18} />
                        </button>
                        {user.uid !== userId && (
                          <button 
                            onClick={() => deleteUser(user)}
                            className="p-2 text-brand-muted hover:text-brand-red hover:bg-brand-red/10 rounded-lg transition-all"
                            title="Terminate Node"
                          >
                            <UserMinus size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="bg-brand-card rounded-3xl border border-white/5 shadow-2xl overflow-hidden">
          <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
            <div className="flex items-center gap-3">
              <Database className="text-brand-gold opacity-60" size={20} />
              <h3 className="font-bold text-brand-gold uppercase tracking-widest text-sm">System Backups</h3>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleRestoreBackup}
                accept=".json"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isRestoring || isBackingUp}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 text-brand-muted rounded-xl text-sm font-bold hover:bg-white/10 transition-all border border-white/10 disabled:opacity-50 uppercase tracking-widest text-xs"
              >
                <Upload size={16} />
                Load File
              </button>
              <button
                onClick={handleCreateBackup}
                disabled={isBackingUp || isRestoring}
                className="flex items-center gap-2 px-4 py-2 bg-gold-gradient text-brand-bg rounded-xl text-sm font-bold hover:opacity-90 transition-all shadow-lg shadow-brand-gold/10 border border-brand-card disabled:opacity-50 uppercase tracking-widest text-xs"
              >
                {isBackingUp ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand-bg"></div>
                ) : (
                  <Database size={16} />
                )}
                New Snapshot
              </button>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {backupsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-gold"></div>
                </div>
              ) : backups.length === 0 ? (
                <div className="text-center py-12 text-brand-muted/30">
                  <Database className="mx-auto mb-3 opacity-20" size={48} />
                  <p className="text-sm font-bold uppercase tracking-widest">No terminal snapshots found</p>
                  <p className="text-[10px] uppercase tracking-widest mt-1">Automatic protocols are active</p>
                </div>
              ) : (
                backups.map((backup) => (
                  <div key={backup.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-brand-gold/20 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-brand-gold/10 rounded-xl flex items-center justify-center text-brand-gold border border-brand-gold/20 transition-all group-hover:bg-gold-gradient group-hover:text-brand-bg">
                        <Database size={20} />
                      </div>
                      <div>
                        <p className="font-bold text-brand-text text-sm group-hover:text-brand-gold transition-colors">{backup.fileName}</p>
                        <p className="text-[10px] text-brand-muted uppercase font-bold tracking-widest mt-0.5">
                          {backup.createdAt.toDate().toLocaleString()} • {(backup.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                       <a 
                        href={backup.fileUrl} 
                        download={backup.fileName}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-brand-muted hover:text-brand-gold hover:bg-white/10 rounded-lg transition-all"
                        title="Extract Archive"
                      >
                        <Download size={18} />
                      </a>
                      <button 
                        onClick={() => handleDeleteBackup(backup)}
                        className="p-2 text-brand-muted hover:text-brand-red hover:bg-brand-red/10 rounded-lg transition-all"
                        title="Purge Archive"
                      >
                        <UserMinus size={18} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Database Tagging Maintenance */}
        <div className="bg-brand-card rounded-3xl border border-white/5 shadow-2xl overflow-hidden p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-brand-gold/10 rounded-2xl flex items-center justify-center text-brand-gold border border-brand-gold/20 flex-shrink-0">
              <Tag size={22} />
            </div>
            <div>
              <h4 className="font-bold text-brand-text text-sm uppercase tracking-wider">Contact Database Tagging</h4>
              <p className="text-xs text-brand-muted mt-0.5">
                Batch tag all existing contacts in the database with the <span className="text-brand-gold font-semibold">"Client"</span> tag.
              </p>
            </div>
          </div>
          <button
            onClick={handleTagAllContactsAsClient}
            disabled={isTaggingContacts}
            className="px-5 py-2.5 bg-brand-card hover:bg-white/10 text-brand-gold border border-brand-gold/30 rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-2 justify-center shadow-sm flex-shrink-0"
          >
            {isTaggingContacts ? (
              <>
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-brand-gold" />
                <span>Tagging Database...</span>
              </>
            ) : (
              <>
                <Sparkles size={15} />
                <span>Tag All as "Client"</span>
              </>
            )}
          </button>
        </div>

        <div className="bg-brand-card rounded-3xl border border-white/5 shadow-2xl overflow-hidden">
          <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
            <h3 className="font-bold text-brand-gold uppercase tracking-widest text-sm">Event Logs</h3>
            <button 
              onClick={downloadLogsCSV}
              disabled={logs.length === 0}
              className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-gold hover:text-brand-text disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Export Secure Logs
            </button>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {logsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-gold"></div>
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-12 text-brand-muted/30">
                  <Clock className="mx-auto mb-3 opacity-20" size={48} />
                  <p className="text-sm font-bold uppercase tracking-widest">Registry is empty</p>
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between py-4 border-b border-white/5 last:border-0 group">
                    <div className="flex-1 min-w-0 pr-4">
                      <p className="text-sm font-bold text-brand-text group-hover:text-brand-gold transition-colors uppercase tracking-wider truncate">{log.event}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <p className="text-[10px] text-brand-muted font-bold uppercase tracking-widest">User: {log.userEmail.split('@')[0]}</p>
                        {log.details && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-white/10" />
                            <p className="text-[10px] text-brand-muted group-hover:text-brand-text transition-colors italic truncate">{log.details}</p>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-brand-muted font-black uppercase tracking-widest shrink-0 whitespace-nowrap px-2 py-1 bg-white/5 rounded border border-white/5">
                      {log.createdAt.toDate().toLocaleDateString() === new Date().toLocaleDateString() 
                        ? log.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : log.createdAt.toDate().toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {statusMessage && (
        <div className={`fixed bottom-8 right-8 z-50 px-6 py-5 rounded-2xl shadow-2xl flex items-center gap-4 border transition-all animate-in slide-in-from-right-5 backdrop-blur-md ${
          statusMessage.type === 'success' ? 'bg-emerald-500/90 text-white border-emerald-400/20' :
          statusMessage.type === 'error' ? 'bg-brand-red/90 text-white border-brand-red/20' :
          'bg-brand-gold/90 text-brand-bg border-brand-gold/20'
        }`}>
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shadow-inner">
            {statusMessage.type === 'success' ? <UserCheck size={20} /> : <AlertTriangle size={20} />}
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">{statusMessage.type} ALERT</p>
            <p className="font-bold text-sm tracking-wide">{statusMessage.text}</p>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-brand-bg/80 backdrop-blur-md z-[100] flex items-center justify-center p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-brand-card rounded-[2rem] p-10 max-w-lg w-full shadow-2xl border border-brand-gold/20 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-brand-gold/5 rounded-full -mr-32 -mt-32 blur-3xl opacity-50" />
            
            <div className="flex items-center gap-4 mb-6 text-brand-gold relative z-10">
              <div className="w-14 h-14 bg-brand-gold/10 rounded-2xl flex items-center justify-center shadow-lg border border-brand-gold/20">
                <AlertTriangle size={32} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-1 opacity-60">System Security Check</p>
                <h3 className="text-2xl font-bold text-brand-text leading-tight">{confirmAction.title}</h3>
              </div>
            </div>
            
            <p className="text-brand-muted mb-10 leading-relaxed font-bold text-sm relative z-10 border-l-2 border-brand-gold/20 pl-4">{confirmAction.message}</p>
            
            <div className="flex items-center gap-4 relative z-10">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 px-8 py-4 bg-white/5 text-brand-muted rounded-xl font-bold hover:bg-white/10 transition-all border border-white/5 uppercase tracking-widest text-xs"
              >
                Abort Action
              </button>
              <button
                onClick={confirmAction.onConfirm}
                className="flex-1 px-8 py-4 bg-gold-gradient text-brand-bg rounded-xl font-bold hover:opacity-90 transition-all shadow-xl shadow-brand-gold/10 border border-brand-card uppercase tracking-widest text-xs"
              >
                Confirm Protocol
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
