import React, { useState, useEffect } from 'react';
import { Shield, Bell, Lock, Eye, Save, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { UserProfile } from '../types';
import { doc, updateDoc, db, logEvent } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';

interface SettingsProps {
  userProfile: UserProfile | null;
}

const Settings: React.FC<SettingsProps> = ({ userProfile }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState({
    emailNotifications: userProfile?.notificationSettings?.emailNotifications ?? true,
    taskReminders: userProfile?.notificationSettings?.taskReminders ?? true,
    newLeadAlerts: userProfile?.notificationSettings?.newLeadAlerts ?? false,
  });
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (userProfile?.notificationSettings) {
      setSettings({
        emailNotifications: userProfile.notificationSettings.emailNotifications,
        taskReminders: userProfile.notificationSettings.taskReminders,
        newLeadAlerts: userProfile.notificationSettings.newLeadAlerts,
      });
    }
  }, [userProfile]);

  const handleToggle = (key: keyof typeof settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    if (!userProfile) return;
    setIsSaving(true);
    try {
      const userRef = doc(db, 'users', userProfile.uid);
      await updateDoc(userRef, {
        notificationSettings: settings
      });
      await logEvent('Settings Updated', 'User notification preferences updated');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const notificationItems = [
    { id: 'emailNotifications', label: 'Email Notifications', desc: 'Receive daily summaries of your leads and deals.' },
    { id: 'taskReminders', label: 'Task Reminders', desc: 'Get notified when a task is due or overdue.' },
    { id: 'newLeadAlerts', label: 'New Lead Alerts', desc: 'Instant notification when a new lead is assigned to you.' },
  ] as const;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="bg-brand-card rounded-3xl border border-white/5 shadow-2xl overflow-hidden">
        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/5">
          <div>
            <h2 className="text-2xl font-bold text-brand-gold uppercase tracking-widest">Settings</h2>
            <p className="text-brand-muted mt-1 font-bold">Manage your account preferences and security settings.</p>
          </div>
          <AnimatePresence>
            {showSuccess && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-2 text-brand-gold bg-brand-gold/10 px-4 py-2 rounded-xl border border-brand-gold/20"
              >
                <CheckCircle2 size={16} />
                <span className="text-sm font-bold uppercase tracking-widest">Saved!</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="p-8 space-y-8 bg-brand-card">
          <section className="space-y-5">
            <h3 className="text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em] flex items-center gap-2 opacity-80 ml-1">
              <Bell size={16} />
              Notifications
            </h3>
            <div className="space-y-4">
              {notificationItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-5 bg-white/5 rounded-2xl border border-white/5 hover:border-brand-gold/20 transition-all group">
                  <div>
                    <p className="font-bold text-brand-text group-hover:text-brand-gold transition-colors">{item.label}</p>
                    <p className="text-[10px] text-brand-muted uppercase tracking-widest font-bold mt-0.5">{item.desc}</p>
                  </div>
                  <button 
                    onClick={() => handleToggle(item.id)}
                    className={`w-14 h-7 rounded-full transition-all relative ${settings[item.id] ? 'bg-gold-gradient' : 'bg-white/10'}`}
                  >
                    <div className={`absolute top-1 w-5 h-5 rounded-full transition-all shadow-lg ${settings[item.id] ? 'left-8 bg-brand-bg' : 'left-1 bg-brand-muted/40'}`} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-5">
            <h3 className="text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em] flex items-center gap-2 opacity-80 ml-1">
              <Lock size={16} />
              Security
            </h3>
            <div className="p-5 bg-white/5 rounded-2xl border border-white/5 flex items-center gap-4 group hover:border-brand-gold/20 transition-all">
              <div className="w-12 h-12 bg-brand-gold/10 rounded-xl flex items-center justify-center text-brand-gold border border-brand-gold/20">
                <Shield size={24} />
              </div>
              <p className="text-sm text-brand-text font-bold uppercase tracking-wider">Your account is secured with Google Authentication.</p>
            </div>
          </section>
        </div>

        <div className="p-8 bg-white/5 border-t border-white/5 flex justify-end">
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 bg-gold-gradient text-brand-bg px-10 py-4 rounded-2xl font-bold hover:opacity-90 transition-all shadow-xl shadow-brand-gold/10 border border-brand-card disabled:opacity-50 uppercase tracking-[0.2em] text-xs"
          >
            {isSaving ? (
              <div className="w-5 h-5 border-2 border-brand-bg/20 border-t-brand-bg rounded-full animate-spin" />
            ) : (
              <Save size={20} />
            )}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
