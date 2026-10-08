import React from 'react';
import { BookOpen, Download, Shield, LayoutDashboard, Users, Briefcase, CheckSquare, Building2, MessageSquare, FileText, Receipt } from 'lucide-react';
import { useTheme } from '../lib/ThemeContext';

const UserGuide: React.FC = () => {
  const { theme } = useTheme();
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-20">
      <div className="flex items-center justify-between no-print">
        <h2 className="text-3xl font-bold text-brand-gold tracking-tight flex items-center gap-3 uppercase">
          <BookOpen className="text-brand-gold" size={32} />
          Protocol Manual
        </h2>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 bg-gold-gradient text-brand-bg px-6 py-2.5 rounded-xl font-bold hover:opacity-90 transition-all shadow-lg shadow-brand-gold/10 border border-brand-card uppercase tracking-widest text-sm"
        >
          <Download size={20} />
          Export Terminal Data
        </button>
      </div>

      <div className="bg-brand-card p-16 rounded-[2.5rem] shadow-2xl text-brand-text print:shadow-none print:p-0 print:bg-transparent border border-white/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-brand-gold/5 rounded-full -mr-48 -mt-48 blur-[100px] opacity-50" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-brand-gold/5 rounded-full -ml-32 -mb-32 blur-[80px] opacity-30" />

        <div className="text-center mb-20 relative z-10">
          <div className="flex items-center justify-center mb-8">
            <div className="p-4 bg-white/5 rounded-2xl border border-white/10 shadow-xl backdrop-blur-sm">
              <img 
                src={theme === 'white-blue' ? '/xecura.png' : '/xecura_white.png'} 
                alt="XECURA CRM" 
                className="h-14 w-auto opacity-90" 
              />
            </div>
          </div>
          <h1 className="text-5xl font-black tracking-[0.2em] text-brand-gold mb-3 uppercase">Xecura CRM</h1>
          <p className="text-brand-muted font-bold tracking-[0.3em] uppercase text-xs">Official Operation Manual & Secure Documentation</p>
          <div className="mt-6 h-1 w-32 bg-gold-gradient mx-auto rounded-full shadow-[0_0_15px_rgba(255,183,77,0.3)]" />
        </div>

        <div className="space-y-16 relative z-10">
          <section className="group">
            <h2 className="text-2xl font-bold border-b border-brand-gold/20 pb-3 mb-6 flex items-center gap-4 text-brand-text group-hover:text-brand-gold transition-colors uppercase tracking-widest">
              <span className="text-brand-gold bg-brand-gold/10 w-10 h-10 rounded-lg flex items-center justify-center border border-brand-gold/20 group-hover:bg-gold-gradient group-hover:text-brand-bg transition-all">01</span>
              Dashboard Interface
            </h2>
            <p className="leading-relaxed text-brand-muted font-medium text-lg border-l-2 border-brand-gold/10 pl-6">
              The Command Center provides a high-level overview of your sales intelligence and financial synchronization. 
              Monitor real-time metrics including total contacts, active deal nodes, and validated purchase orders.
              Utilize the visualization nodes to track pipeline velocity and performance vectors.
            </p>
          </section>

          <section className="group">
            <h2 className="text-2xl font-bold border-b border-brand-gold/20 pb-3 mb-6 flex items-center gap-4 text-brand-text group-hover:text-brand-gold transition-colors uppercase tracking-widest">
              <span className="text-brand-gold bg-brand-gold/10 w-10 h-10 rounded-lg flex items-center justify-center border border-brand-gold/20 group-hover:bg-gold-gradient group-hover:text-brand-bg transition-all">02</span>
              Entities & Nodes
            </h2>
            <div className="grid md:grid-cols-2 gap-8 pl-6">
              <div className="p-6 bg-white/5 rounded-2xl border border-white/5 hover:border-brand-gold/20 transition-all">
                <h3 className="font-bold text-lg mb-3 text-brand-gold uppercase tracking-wider flex items-center gap-2">
                  <Building2 size={20} />
                  Organizations
                </h3>
                <p className="text-brand-muted text-sm leading-relaxed font-medium">
                  Manage the corporate entities within your ecosystem. Track sector intelligence, communication channels, and logistics vectors. 
                  All active contacts and deal nodes are parent-linked for optimized data retrieval.
                </p>
              </div>
              <div className="p-6 bg-white/5 rounded-2xl border border-white/5 hover:border-brand-gold/20 transition-all">
                <h3 className="font-bold text-lg mb-3 text-brand-gold uppercase tracking-wider flex items-center gap-2">
                  <Users size={20} />
                  Individual Stakeholders
                </h3>
                <p className="text-brand-muted text-sm leading-relaxed font-medium">
                  Catalyze personal data points for key personnel. Maintain high-fidelity communication links including secure transmission protocols.
                </p>
              </div>
            </div>
          </section>

          <section className="group">
            <h2 className="text-2xl font-bold border-b border-brand-gold/20 pb-3 mb-6 flex items-center gap-4 text-brand-text group-hover:text-brand-gold transition-colors uppercase tracking-widest">
              <span className="text-brand-gold bg-brand-gold/10 w-10 h-10 rounded-lg flex items-center justify-center border border-brand-gold/20 group-hover:bg-gold-gradient group-hover:text-brand-bg transition-all">03</span>
              Strategic Pipeline
            </h2>
            <p className="leading-relaxed text-brand-muted font-medium mb-6 pl-6 text-lg">
              Navigate and facilitate operational opportunities through standardized classification tiers:
            </p>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs font-black tracking-widest uppercase pl-6">
              <li className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl border border-white/5 group/li hover:border-brand-gold/40 transition-all">
                <span className="text-brand-gold">L1</span> Prospecting
              </li>
              <li className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl border border-white/5 group/li hover:border-brand-gold/40 transition-all">
                <span className="text-brand-gold">L2</span> Proposal
              </li>
              <li className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl border border-white/5 group/li hover:border-brand-gold/40 transition-all">
                <span className="text-brand-gold">L3</span> Engagement
              </li>
              <li className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl border border-white/5 group/li hover:border-brand-gold/40 transition-all">
                <span className="text-brand-gold">L4</span> Negotiation
              </li>
              <li className="flex items-center gap-3 px-4 py-3 bg-brand-gold/10 text-brand-gold rounded-xl border border-brand-gold/30">
                <span className="text-brand-gold animate-pulse">L5</span> Closed WON
              </li>
              <li className="flex items-center gap-3 px-4 py-3 bg-brand-red/10 text-brand-red rounded-xl border border-brand-red/30">
                L0 TERMINATED
              </li>
            </ul>
          </section>

          <section className="group">
            <h2 className="text-2xl font-bold border-b border-brand-gold/20 pb-3 mb-6 flex items-center gap-4 text-brand-text group-hover:text-brand-gold transition-colors uppercase tracking-widest">
              <span className="text-brand-gold bg-brand-gold/10 w-10 h-10 rounded-lg flex items-center justify-center border border-brand-gold/20 group-hover:bg-gold-gradient group-hover:text-brand-bg transition-all">04</span>
              Acquisition Protocols
            </h2>
            <p className="leading-relaxed text-brand-muted font-medium text-lg pl-6 border-l-2 border-brand-gold/10">
              Synchronize incoming Purchase Orders (POs) with operational workflows. Track identification codes, financial values, and lifecycle states.
              Verified and <strong>Approved</strong> POs serve as the catalyst for terminal invoice generation.
            </p>
          </section>

          <section className="group">
            <h2 className="text-2xl font-bold border-b border-brand-gold/20 pb-3 mb-6 flex items-center gap-4 text-brand-text group-hover:text-brand-gold transition-colors uppercase tracking-widest">
              <span className="text-brand-gold bg-brand-gold/10 w-10 h-10 rounded-lg flex items-center justify-center border border-brand-gold/20 group-hover:bg-gold-gradient group-hover:text-brand-bg transition-all">05</span>
              Financial Invoicing
            </h2>
            <p className="leading-relaxed text-brand-muted font-medium text-lg pl-6 border-l-2 border-brand-gold/10">
              Execute and monitor financial transmission units. Oversee reconciliation states including Draft, Transmitted, Verified, and Overdue.
              Maintains full end-to-end traceability between PO nodes and strategic deals.
            </p>
          </section>

          <section className="group">
            <h2 className="text-2xl font-bold border-b border-brand-gold/20 pb-3 mb-6 flex items-center gap-4 text-brand-text group-hover:text-brand-gold transition-colors uppercase tracking-widest">
              <span className="text-brand-gold bg-brand-gold/10 w-10 h-10 rounded-lg flex items-center justify-center border border-brand-gold/20 group-hover:bg-gold-gradient group-hover:text-brand-bg transition-all">06</span>
              Operational Tasks
            </h2>
            <p className="leading-relaxed text-brand-muted font-medium text-lg pl-6 border-l-2 border-brand-gold/10">
              Maintain peak operational efficiency via recursive task management. Assign priorities, define criticality timelines, and link to high-value nodes.
              System algorithms proactively flag terminal overdue states to ensure mission success.
            </p>
          </section>

          <section className="pt-16 border-t border-white/5 text-center">
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="h-px w-16 bg-gradient-to-r from-transparent to-brand-gold/40" />
              <Shield className="text-brand-gold animate-pulse" size={24} />
              <div className="h-px w-16 bg-gradient-to-l from-transparent to-brand-gold/40" />
            </div>
            <p className="text-brand-gold text-xs uppercase tracking-[0.3em] font-black">
              System Security Protocols
            </p>
            <p className="text-brand-muted font-bold text-sm mt-3 max-w-lg mx-auto leading-relaxed">
              XECURA utilizes cryptographic synchronization and hierarchical access control to maintain absolute data integrity at all terminal points.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default UserGuide;
