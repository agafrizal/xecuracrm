import React, { useState, useEffect } from 'react';
import { Bell, X, Check, Trash2, Info, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Notification } from '../types';
import { collection, db, query, where, onSnapshot, updateDoc, doc, deleteDoc, orderBy, limit, Timestamp } from '../firebase';
import { format } from 'date-fns';

interface NotificationCenterProps {
  userId: string;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ userId }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Notification[];
      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.read).length);
    });

    return () => unsubscribe();
  }, [userId]);

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadNotifs = notifications.filter(n => !n.read);
      await Promise.all(unreadNotifs.map(n => updateDoc(doc(db, 'notifications', n.id), { read: true })));
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'warning': return <AlertTriangle size={18} className="text-amber-400" />;
      case 'error': return <AlertCircle size={18} className="text-red-400" />;
      case 'success': return <CheckCircle2 size={18} className="text-emerald-400" />;
      default: return <Info size={18} className="text-blue-400" />;
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2.5 rounded-xl transition-all duration-300 group ${isOpen ? 'text-brand-gold bg-brand-gold/10 shadow-lg shadow-brand-gold/5' : 'text-brand-muted hover:text-brand-gold hover:bg-white/5'}`}
      >
        <Bell size={24} className={isOpen ? 'animate-bounce' : ''} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-gold-gradient text-brand-bg text-[10px] font-black rounded-full flex items-center justify-center border border-brand-card shadow-sm">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-40 bg-brand-bg/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-3 w-80 sm:w-96 bg-brand-card border border-brand-gold/20 rounded-2xl shadow-2xl z-50 overflow-hidden"
            >
              <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-brand-gold/10 rounded-lg flex items-center justify-center text-brand-gold">
                    <Bell size={16} />
                  </div>
                  <h3 className="font-bold text-brand-text uppercase tracking-widest text-xs">Registry Alerts</h3>
                </div>
                <div className="flex items-center gap-3">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-[10px] font-bold uppercase tracking-widest text-brand-gold hover:text-brand-text transition-colors"
                    >
                      Clear All
                    </button>
                  )}
                  <button onClick={() => setIsOpen(false)} className="text-brand-muted hover:text-brand-gold transition-colors">
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="max-h-[450px] overflow-y-auto custom-scrollbar">
                {notifications.length > 0 ? (
                  <div className="divide-y divide-white/5">
                    {notifications.map((notif) => (
                      <div
                        key={notif.id}
                        className={`p-5 flex gap-4 transition-all duration-300 border-l-2 ${notif.read ? 'bg-transparent border-transparent' : 'bg-brand-gold/[0.03] border-brand-gold/40'}`}
                      >
                        <div className="mt-1 shadow-lg ring-1 ring-white/5 rounded-lg p-1.5 bg-white/5">
                          {notif.type === 'warning' && <AlertTriangle size={16} className="text-amber-400" />}
                          {notif.type === 'error' && <AlertCircle size={16} className="text-brand-red" />}
                          {notif.type === 'success' && <CheckCircle2 size={16} className="text-brand-gold" />}
                          {notif.type === 'info' && <Info size={16} className="text-brand-cyan" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <h4 className={`text-sm font-bold uppercase tracking-wider truncate mb-1 ${notif.read ? 'text-brand-text/60' : 'text-brand-text'}`}>
                              {notif.title}
                            </h4>
                            <span className="text-[10px] font-black text-brand-muted/40 uppercase tracking-widest whitespace-nowrap pt-0.5">
                              {format(notif.createdAt.toDate(), 'HH:mm')}
                            </span>
                          </div>
                          <p className={`text-xs leading-relaxed font-medium ${notif.read ? 'text-brand-muted/50' : 'text-brand-muted'}`}>
                            {notif.message}
                          </p>
                          <div className="mt-4 flex items-center gap-4">
                            {!notif.read && (
                              <button
                                onClick={() => markAsRead(notif.id)}
                                className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.15em] text-brand-gold hover:text-brand-text transition-colors"
                              >
                                <Check size={12} strokeWidth={3} />
                                Validate
                              </button>
                            )}
                            <button
                              onClick={() => deleteNotification(notif.id)}
                              className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.15em] text-brand-red/60 hover:text-brand-red transition-colors"
                            >
                              <Trash2 size={12} strokeWidth={3} />
                              Purge
                            </button>
                            <span className="ml-auto text-[9px] text-brand-muted/30 uppercase font-black tracking-widest">
                              {format(notif.createdAt.toDate(), 'MMM d')}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-16 text-center">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/5">
                      <Bell size={32} className="text-brand-muted opacity-20" />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-muted opacity-40">Zero active alerts</p>
                    <p className="text-[9px] uppercase tracking-widest text-brand-muted/20 mt-1">Registry state is synchronized</p>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationCenter;
