import React from 'react';
import { User as UserIcon, Mail, Shield, Calendar } from 'lucide-react';
import { UserProfile } from '../types';
import { format } from 'date-fns';

interface ProfileProps {
  user: UserProfile;
}

const Profile: React.FC<ProfileProps> = ({ user }) => {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="bg-brand-card p-8 rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-gold/5 rounded-full -mr-16 -mt-16 blur-2xl font-bold" />
        <div className="flex flex-col items-center text-center relative z-10">
          <div className="relative mb-6">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName} className="w-32 h-32 rounded-3xl object-cover border-4 border-white/5 shadow-2xl" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-32 h-32 rounded-3xl bg-white/5 flex items-center justify-center text-brand-gold/40 border-4 border-white/5 shadow-2xl">
                <UserIcon size={48} />
              </div>
            )}
            <div className="absolute -bottom-2 -right-2 bg-gold-gradient text-brand-bg p-2 rounded-xl shadow-lg border border-brand-card">
              <Shield size={20} />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-brand-text tracking-tight uppercase">{user.displayName}</h2>
          <p className="text-brand-gold font-black tracking-[0.2em] text-[10px] mt-2 uppercase">{user.role} ACCOUNT</p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 relative z-10">
          <div className="flex items-center gap-4 p-5 bg-white/5 rounded-2xl border border-white/5 hover:border-brand-gold/20 transition-all group">
            <div className="w-12 h-12 bg-brand-card rounded-xl flex items-center justify-center text-brand-gold shadow-lg border border-white/5 group-hover:bg-gold-gradient group-hover:text-brand-bg transition-all">
              <Mail size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em] mb-0.5">Email Address</p>
              <p className="text-brand-text font-bold">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-5 bg-white/5 rounded-2xl border border-white/5 hover:border-brand-gold/20 transition-all group">
            <div className="w-12 h-12 bg-brand-card rounded-xl flex items-center justify-center text-brand-gold shadow-lg border border-white/5 group-hover:bg-gold-gradient group-hover:text-brand-bg transition-all">
              <Calendar size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-brand-gold uppercase tracking-[0.2em] mb-0.5">Member Since</p>
              <p className="text-brand-text font-bold">{format(user.createdAt.toDate(), 'MMMM d, yyyy')}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-brand-card p-8 rounded-3xl text-brand-text shadow-2xl relative overflow-hidden border border-white/5">
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-gold/5 rounded-full -mr-32 -mt-32 blur-3xl" />
        <h3 className="text-xl font-bold mb-3 text-brand-gold uppercase tracking-widest relative z-10">Secure Access</h3>
        <p className="text-brand-muted text-sm leading-relaxed font-bold relative z-10">
          Your account is protected by Google Authentication. XECURA CRM ensures all your data is encrypted and accessible only to authorized users. Access is restricted by role-based permissions to maintain peak security.
        </p>
      </div>
    </div>
  );
};

export default Profile;
