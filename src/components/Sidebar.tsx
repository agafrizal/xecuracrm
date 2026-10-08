import React from 'react';
import { LayoutDashboard, Users, Briefcase, CheckSquare, LogOut, User as UserIcon, Menu, X, Shield, Building2, MessageSquare, FileText, Receipt, BookOpen, Rocket, FlaskConical } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { logout } from '../firebase';
import { useTheme } from '../lib/ThemeContext';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  userRole?: 'admin' | 'manager' | 'sales' | 'super_user' | 'engineer' | 'finance' | 'procurement' | 'project_manager';
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, isOpen, setIsOpen, userRole, onLogout }) => {
  const { theme } = useTheme();
  
  const sections = [
    {
      title: 'Overview',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      ]
    },
    ...(userRole === 'admin' ? [{
      title: 'Admin',
      items: [
        { id: 'admin', label: 'Admin Panel', icon: Shield },
      ]
    }] : []),
    {
      title: 'Sales',
      items: [
        { id: 'companies', label: 'Companies', icon: Building2 },
        { id: 'contacts', label: 'Contacts', icon: Users },
        { id: 'deals', label: 'Deals', icon: Briefcase },
      ]
    },
    {
      title: 'Project',
      items: [
        { id: 'poc', label: 'POC', icon: FlaskConical },
        { id: 'implementationPlan', label: 'Implementation Plan', icon: Rocket },
      ]
    },
    {
      title: 'Finance',
      items: [
        { id: 'purchaseOrders', label: 'Incoming POs', icon: FileText },
        { id: 'invoices', label: 'Invoices', icon: Receipt },
      ]
    },
    {
      title: 'Personal',
      items: [
        { id: 'profile', label: 'Profile', icon: UserIcon },
        { id: 'settings', label: 'Settings', icon: Shield },
        { id: 'userGuide', label: 'User Guide', icon: BookOpen },
      ]
    }
  ];

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ x: isOpen ? 0 : -300 }}
        className={`fixed top-0 left-0 bottom-0 w-64 bg-brand-card text-brand-text z-50 transition-transform duration-300 ease-in-out border-r border-white/5 shadow-2xl`}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img 
                src={theme === 'white-blue' ? '/xecura.png' : '/xecura_white.png'} 
                alt="XECURA CRM" 
                className="h-11 w-auto object-contain" 
              />
            </div>
            <button onClick={() => setIsOpen(false)} className="p-2 text-brand-muted hover:bg-white/5 rounded-lg lg:hidden">
              <X size={20} />
            </button>
          </div>

          <nav className="flex-1 px-4 space-y-8 overflow-y-auto py-4">
            {sections.map((section) => (
              <div key={section.title} className="space-y-2">
                <h2 className="px-4 text-[10px] font-black text-brand-gold uppercase tracking-[0.2em]">
                  {section.title}
                </h2>
                <div className="space-y-1">
                  {section.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 ${
                        activeTab === item.id
                          ? 'bg-gold-gradient text-brand-bg shadow-lg shadow-brand-gold/20 font-bold'
                          : 'text-brand-muted hover:bg-brand-gold/5 hover:text-brand-text'
                      }`}
                    >
                      <item.icon size={18} />
                      <span className="text-sm">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="p-4 border-t border-white/5">
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-4 py-3 text-brand-red hover:bg-brand-red/10 rounded-xl transition-all duration-200"
            >
              <LogOut size={18} />
              <span className="font-medium text-sm">Logout</span>
            </button>
          </div>
        </div>
      </motion.aside>
    </>
  );
};

export default Sidebar;
