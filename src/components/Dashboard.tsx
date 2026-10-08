import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Users, Briefcase, Shield, FileText, Receipt, AlertTriangle, XCircle } from 'lucide-react';
import { Contact, Deal, Task, Company, PurchaseOrder, Invoice, UserProfile, Interaction } from '../types';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { Timestamp } from '../firebase';
import { currencyService } from '../services/currencyService';

interface DashboardProps {
  contacts: Contact[];
  deals: Deal[];
  tasks: Task[];
  companies: Company[];
  purchaseOrders: PurchaseOrder[];
  invoices: Invoice[];
  interactions?: Interaction[];
  userRole?: 'admin' | 'manager' | 'sales' | 'super_user' | 'engineer';
  userId?: string;
  users: UserProfile[];
  onNavigate?: (tab: string, filter?: string, ownerId?: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ contacts, deals, tasks, companies, purchaseOrders, invoices, interactions = [], userRole, userId, users, onNavigate }) => {
  const [usdRate, setUsdRate] = useState<number | null>(null);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
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
          <span>{idr}</span>
          <span className="text-[10px] text-brand-muted font-normal">≈ {usd}</span>
        </div>
      );
    }
    return idr;
  };

  const formatCurrencySimple = (amount: number) => {
    return currencyService.formatIDR(amount);
  };

  const isBODView = userRole === 'admin' || userRole === 'manager' || userRole === 'super_user' || userRole === 'engineer' || userRole === 'finance' || userRole === 'procurement' || userRole === 'project_manager';
  const myDeals = deals.filter(d => d.ownerId === userId);

  const getCompanyName = (id?: string) => {
    if (!id) return 'N/A';
    return companies.find(c => c.id === id)?.name || 'Unknown Company';
  };

  const expiringPOs = purchaseOrders.filter(po => {
    if (!po.endDate) return false;
    const now = new Date();
    const end = po.endDate.toDate();
    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 60;
  });

  const nearingDueInvoices = invoices.filter(inv => {
    if (inv.status === 'paid' || inv.status === 'cancelled') return false;
    const now = new Date();
    const due = inv.dueDate.toDate();
    const diffTime = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    // Also include overdue ones that are not paid/cancelled? 
    // The user said "nearing due date to avoid overdue payment", so maybe just upcoming ones.
    // Let's include overdue too as they are even more critical.
    return diffDays <= 14;
  });


  const stageData = [
    { name: 'L1', stageKey: 'L1-prospecting', value: deals.filter(d => d.stage === 'L1-prospecting').length, totalValue: deals.filter(d => d.stage === 'L1-prospecting').reduce((acc, d) => acc + d.value, 0) },
    { name: 'L2', stageKey: 'L2-proposal', value: deals.filter(d => d.stage === 'L2-proposal').length, totalValue: deals.filter(d => d.stage === 'L2-proposal').reduce((acc, d) => acc + d.value, 0) },
    { name: 'L3', stageKey: 'L3-show-interest', value: deals.filter(d => d.stage === 'L3-show-interest').length, totalValue: deals.filter(d => d.stage === 'L3-show-interest').reduce((acc, d) => acc + d.value, 0) },
    { name: 'L4', stageKey: 'L4-negotiation', value: deals.filter(d => d.stage === 'L4-negotiation').length, totalValue: deals.filter(d => d.stage === 'L4-negotiation').reduce((acc, d) => acc + d.value, 0) },
    { name: 'L5', stageKey: 'L5-closed-won', value: deals.filter(d => d.stage === 'L5-closed-won').length, totalValue: deals.filter(d => d.stage === 'L5-closed-won').reduce((acc, d) => acc + d.value, 0) },
    { name: 'L0', stageKey: 'L0-closed-lost', value: deals.filter(d => d.stage === 'L0-closed-lost').length, totalValue: deals.filter(d => d.stage === 'L0-closed-lost').reduce((acc, d) => acc + d.value, 0) },
  ];

  const COLORS = ['#c5a059', '#e5c17b', '#3b82f6', '#06b6d4', '#10b981', '#ef4444'];

  const getDaysInStage = (stageUpdatedAt: Timestamp) => {
    const now = new Date();
    const updated = stageUpdatedAt.toDate();
    const diffTime = Math.abs(now.getTime() - updated.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Theme-aware colors derived from tailwind config or CSS variables
  const themeAccent = getComputedStyle(document.documentElement).getPropertyValue('--color-gold-base').trim() || '#c5a059';
  const themeCard = getComputedStyle(document.documentElement).getPropertyValue('--color-bg-card').trim() || '#0b1a32';
  const themeText = getComputedStyle(document.documentElement).getPropertyValue('--color-text-base').trim() || '#f8fafc';
  const themeBorder = getComputedStyle(document.documentElement).getPropertyValue('--color-border-dim').trim() || 'rgba(197, 160, 89, 0.2)';

  const pipelineDeals = deals.filter(d => d.stage !== 'L5-closed-won' && d.stage !== 'L0-closed-lost');
  
  const dealsByQuarter = pipelineDeals.reduce((acc, deal) => {
    if (!deal.expectedCloseDate) return acc;
    const date = new Date(deal.expectedCloseDate);
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    const year = date.getFullYear();
    const quarterYear = `Q${quarter} ${year}`;
    
    if (!acc[quarterYear]) {
      acc[quarterYear] = { value: 0, count: 0, sortKey: `${year}-Q${quarter}` };
    }
    acc[quarterYear].value += deal.value;
    acc[quarterYear].count += 1;
    return acc;
  }, {} as Record<string, { value: number, count: number, sortKey: string }>);

  const quarterData = Object.entries(dealsByQuarter as Record<string, { value: number, count: number, sortKey: string }>)
    .map(([name, data]) => ({
      name,
      value: data.value,
      count: data.count,
      sortKey: data.sortKey
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const MONTH_COLORS = ['#c5a059', '#e5c17b', '#b08b47', '#91723a', '#735a2d', '#544221', '#3b82f6', '#06b6d4', '#10b981', '#a855f7', '#ec4899', '#ef4444'];

  const userSummaries = users
    .filter(user => user.role === 'sales')
    .map(user => {
      const userCompanies = companies.filter(c => c.ownerId === user.uid);
      const userCompanyIds = userCompanies.map(c => c.id);
      const userDeals = deals.filter(d => d.ownerId === user.uid || (d.companyId && userCompanyIds.includes(d.companyId)));
      const wonDeals = userDeals.filter(d => d.stage === 'L5-closed-won');
      const activeDeals = userDeals.filter(d => d.stage !== 'L5-closed-won' && d.stage !== 'L0-closed-lost');
      const lostDeals = userDeals.filter(d => d.stage === 'L0-closed-lost');
      
      const totalDealsValue = userDeals.reduce((acc, d) => acc + d.value, 0);
      const estTotalGP = userDeals.reduce((acc, d) => acc + (d.value * ((d.potentialGrossProfit || 0) / 100)), 0);
      const blendedGP = totalDealsValue > 0 ? (estTotalGP / totalDealsValue) * 100 : 0;
      
      return {
        user,
        totalDeals: userDeals.length,
        pipelineValue: activeDeals.reduce((acc, d) => acc + d.value, 0),
        wonValue: wonDeals.reduce((acc, d) => acc + d.value, 0),
        lostValue: lostDeals.reduce((acc, d) => acc + d.value, 0),
        activeCount: activeDeals.length,
        wonCount: wonDeals.length,
        lostCount: lostDeals.length,
        estTotalGP,
        blendedGP
      };
    }).sort((a, b) => b.pipelineValue - a.pipelineValue);

  const handleExport = () => {
    const headers = ['NO', 'SALES', 'COMPANY', 'DEAL TITLE', 'DEAL VALUE', 'POTENTIAL GP', 'STAGE', 'EXPECTED CLOSE', 'LAST INTERACTIONS', 'DATE OF LAST INTERACTIONS'];
    
    const data = deals.map((deal, index) => {
      const owner = users.find(u => u.uid === deal.ownerId)?.displayName || 'Unknown';
      const company = companies.find(c => c.id === deal.companyId)?.name || 'Unknown';
      const expectedClose = deal.expectedCloseDate ? format(new Date(deal.expectedCloseDate), 'dd MMM yyyy') : '';
      
      const dealInteractions = interactions
        .filter(i => i.dealId === deal.id)
        .sort((a, b) => b.date.toDate().getTime() - a.date.toDate().getTime());
      
      const lastInteraction = dealInteractions.length > 0 ? dealInteractions[0] : null;
      const lastInteractionText = lastInteraction ? lastInteraction.description : '';
      const lastInteractionDate = lastInteraction ? format(lastInteraction.date.toDate(), 'dd MMM yyyy') : '';

      return [
        index + 1,
        owner,
        company,
        deal.title,
        deal.value,
        `${deal.potentialGrossProfit || 0}%`,
        deal.stage,
        expectedClose,
        lastInteractionText,
        lastInteractionDate
      ];
    });

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Pipeline');
    
    XLSX.writeFile(workbook, `pipeline_export_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {isBODView && (
            <div className="flex items-center gap-2 px-3 py-1 bg-brand-cyan/10 text-brand-cyan rounded-full text-xs font-bold uppercase tracking-wider border border-brand-cyan/20">
              <Shield size={12} />
              BOD View (All Data)
            </div>
          )}
        </div>
        {userRole !== 'sales' && (
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-blue text-white rounded-xl font-bold text-sm hover:bg-brand-cyan transition-all shadow-lg shadow-brand-blue/10"
          >
            <FileText size={16} />
            Export to Excel
          </button>
        )}
      </div>

      {expiringPOs.length > 0 && (
        <div className="bg-brand-red/10 border border-brand-red/20 rounded-2xl p-4 flex items-start gap-4 animate-pulse">
          <div className="p-2 bg-brand-red/20 rounded-lg text-brand-red">
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-bold text-brand-red uppercase tracking-wider mb-1">Attention: Expiring Purchase Orders</h4>
            <p className="text-xs text-brand-red/70 mb-3">
              The following {expiringPOs.length} purchase orders are expiring within the next 2 months. Please review them for renewal or completion.
            </p>
            <div className="flex flex-wrap gap-2">
              {expiringPOs.map(po => (
                <div key={po.id} className="px-3 py-1 bg-brand-red/10 rounded-lg border border-brand-red/20 text-[10px] font-bold text-brand-red flex items-center gap-2">
                  <span className="font-mono tracking-wider">{po.poNumber}</span>
                  <span className="text-brand-red/30">|</span>
                  <span>{format(po.endDate!.toDate(), 'MMM d, yyyy')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {nearingDueInvoices.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-4">
          <div className="p-2 bg-amber-500/20 rounded-lg text-amber-500">
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-bold text-amber-500 uppercase tracking-wider mb-1">Attention: Invoices Nearing Due Date</h4>
            <p className="text-xs text-amber-500/70 mb-3">
              The following {nearingDueInvoices.length} invoices are due within 14 days or are already overdue. Please follow up on payments.
            </p>
            <div className="flex flex-wrap gap-2">
              {nearingDueInvoices.map(inv => {
                const due = inv.dueDate.toDate();
                const isOverdue = due < new Date();
                return (
                  <div key={inv.id} className={`px-3 py-1 rounded-lg border text-[10px] font-bold flex items-center gap-2 ${
                    isOverdue 
                      ? 'bg-brand-red/10 border-brand-red/20 text-brand-red' 
                      : 'bg-amber-500/10 border-amber-500/20 text-amber-700'
                  }`}>
                    <span className="font-mono tracking-wider">{inv.invoiceNumber}</span>
                    <span className={isOverdue ? 'text-brand-red/30' : 'text-amber-500/30'}>|</span>
                    <span className="whitespace-nowrap">Due: {format(due, 'MMM d, yyyy')}</span>
                    {isOverdue && <span className="px-1.5 py-0.5 bg-brand-red text-white rounded text-[8px] uppercase">Overdue</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-brand-card p-8 rounded-2xl border border-white/5 shadow-sm">
          <h3 className="text-lg font-bold text-brand-gold mb-6 uppercase tracking-wider">Deal Pipeline Stage</h3>
          <div className="h-[300px] w-full">
            {hasMounted && (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <PieChart>
                  <Pie
                    data={stageData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                    onClick={(entry: any) => {
                      const stageKey = entry?.stageKey || entry?.payload?.stageKey;
                      if (stageKey) onNavigate?.('deals', stageKey);
                    }}
                    className="cursor-pointer"
                  >
                    {stageData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={COLORS[index % COLORS.length]} 
                        onClick={() => onNavigate?.('deals', entry.stageKey)}
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                      />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number, name: string, props: any) => {
                      return [`${value} deals (${formatCurrencySimple(props.payload.totalValue)})`, name];
                    }}
                    contentStyle={{ backgroundColor: themeCard, border: `1px solid ${themeBorder}`, borderRadius: '12px', color: themeText }}
                    itemStyle={{ color: themeText }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {stageData.map((item, i) => (
              <div 
                key={i} 
                onClick={() => onNavigate?.('deals', item.stageKey)}
                className="flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 cursor-pointer transition-all hover:border-brand-gold/30 group"
                title={`View ${item.name} deals in Deals page`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-xs text-brand-text font-bold uppercase tracking-tight group-hover:text-brand-gold transition-colors">{item.name}</span>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-brand-gold">{formatCurrencySimple(item.totalValue)}</div>
                  <div className="text-[10px] text-brand-muted uppercase tracking-widest mt-0.5">{item.value} {item.value === 1 ? 'deal' : 'deals'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-brand-card p-8 rounded-2xl border border-white/5 shadow-sm">
          <h3 className="text-lg font-bold text-brand-gold mb-6 uppercase tracking-wider">Pipeline by Est. Closing Quarter</h3>
          {quarterData.length > 0 ? (
            <>
              <div className="h-[300px] w-full">
                {hasMounted && (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                    <PieChart>
                      <Pie
                        data={quarterData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                      >
                        {quarterData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={MONTH_COLORS[index % MONTH_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number, name: string, props: any) => {
                          return [`${formatCurrencySimple(value)} (${props.payload.count} deals)`, name];
                        }}
                        contentStyle={{ backgroundColor: themeCard, border: `1px solid ${themeBorder}`, borderRadius: '12px', color: themeText }}
                        itemStyle={{ color: themeText }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                {quarterData.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: MONTH_COLORS[i % MONTH_COLORS.length] }} />
                      <span className="text-xs text-brand-text font-bold truncate tracking-tight">{item.name}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-brand-gold">{formatCurrencySimple(item.value)}</div>
                      <div className="text-[10px] text-brand-muted uppercase tracking-widest mt-0.5">{item.count} {item.count === 1 ? 'deal' : 'deals'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-brand-muted italic">
              No active pipeline deals with estimated closing dates.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <div className="bg-brand-card p-8 rounded-2xl border border-white/5 shadow-sm">
          <h3 className="text-lg font-bold text-brand-gold mb-6 uppercase tracking-wider">{isBODView ? 'Company Deal Summary' : 'My Deal Summary'}</h3>
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest mb-1">Total Deals</p>
                <p className="text-2xl font-bold text-brand-text">{deals.length}</p>
              </div>
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5 overflow-hidden">
                <p className="text-[10px] font-bold text-brand-gold uppercase tracking-widest mb-1">Pipeline Value</p>
                <div className="text-xl font-bold text-brand-text break-all sm:break-normal">
                  {formatCurrency(deals.reduce((acc, d) => acc + d.value, 0))}
                </div>
              </div>
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5 overflow-hidden">
                <p className="text-[10px] font-bold text-brand-gold uppercase tracking-widest mb-1">Est. Total GP</p>
                <div className="text-xl font-bold text-brand-text break-all sm:break-normal">
                  {formatCurrency(deals.reduce((acc, d) => acc + (d.value * ((d.potentialGrossProfit || 0) / 100)), 0))}
                </div>
              </div>
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                <p className="text-[10px] font-bold text-brand-gold uppercase tracking-widest mb-1">Blended GP</p>
                <div className="text-xl font-bold text-brand-text">
                  {deals.reduce((acc, d) => acc + d.value, 0) > 0 
                    ? (deals.reduce((acc, d) => acc + (d.value * ((d.potentialGrossProfit || 0) / 100)), 0) / deals.reduce((acc, d) => acc + d.value, 0) * 100).toFixed(1)
                    : '0.0'}%
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button 
                onClick={() => onNavigate?.('deals', 'L5-closed-won')}
                className="flex flex-col xl:flex-row xl:items-center justify-between p-4 bg-brand-gold/10 rounded-xl border border-brand-gold/20 gap-3 hover:bg-brand-gold/20 transition-all text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gold-gradient rounded-lg flex items-center justify-center text-brand-bg shrink-0">
                    <TrendingUp size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-brand-gold uppercase tracking-wider">Won Deals</p>
                    <p className="text-sm text-brand-gold/60">{deals.filter(d => d.stage === 'L5-closed-won').length} deals</p>
                  </div>
                </div>
                <div className="font-bold text-brand-gold text-left xl:text-right">
                  {formatCurrency(deals.filter(d => d.stage === 'L5-closed-won').reduce((acc, d) => acc + d.value, 0))}
                </div>
              </button>

              <button 
                onClick={() => onNavigate?.('deals', 'active')}
                className="flex flex-col xl:flex-row xl:items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 gap-3 hover:bg-white/10 transition-all text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-brand-gold/20 rounded-lg flex items-center justify-center text-brand-gold shrink-0">
                    <Briefcase size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-brand-text uppercase tracking-wider">Active Pipeline</p>
                    <p className="text-sm text-brand-muted">
                      {deals.filter(d => d.stage !== 'L5-closed-won' && d.stage !== 'L0-closed-lost').length} deals
                    </p>
                  </div>
                </div>
                <div className="font-bold text-brand-text text-left xl:text-right">
                  {formatCurrency(deals.filter(d => d.stage !== 'L5-closed-won' && d.stage !== 'L0-closed-lost').reduce((acc, d) => acc + d.value, 0))}
                </div>
              </button>

              <button 
                onClick={() => onNavigate?.('deals', 'L0-closed-lost')}
                className="flex flex-col xl:flex-row xl:items-center justify-between p-4 bg-brand-red/10 rounded-xl border border-brand-red/20 gap-3 hover:bg-brand-red/20 transition-all text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-brand-red rounded-lg flex items-center justify-center text-white shrink-0">
                    <XCircle size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-brand-red uppercase tracking-wider">Lost Deals</p>
                    <p className="text-sm text-brand-red/60">
                      {deals.filter(d => d.stage === 'L0-closed-lost').length} deals
                    </p>
                  </div>
                </div>
                <div className="font-bold text-brand-red text-left xl:text-right">
                  {formatCurrency(deals.filter(d => d.stage === 'L0-closed-lost').reduce((acc, d) => acc + d.value, 0))}
                </div>
              </button>

              <div className="flex flex-col xl:flex-row xl:items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 gap-3 hover:bg-white/10 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-brand-gold/20 rounded-lg flex items-center justify-center text-brand-gold shrink-0">
                    <Users size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-brand-text uppercase tracking-wider">Avg. Deal Value</p>
                    <p className="text-sm text-brand-muted">Across all stages</p>
                  </div>
                </div>
                <div className="font-bold text-brand-text text-left xl:text-right text-sm">
                  {formatCurrency(deals.length > 0 
                    ? Math.round(deals.reduce((acc, d) => acc + d.value, 0) / deals.length) 
                    : 0)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Team Performance Summary */}
      <div className="bg-brand-card p-8 rounded-2xl border border-white/5 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-brand-gold uppercase tracking-wider">Team Performance</h3>
          <span className="text-xs font-bold text-brand-muted uppercase tracking-widest">Deal Summary</span>
        </div>
        {userSummaries.length === 0 ? (
          <div className="text-center py-12 bg-white/5 rounded-2xl border border-white/5">
            <p className="text-sm font-medium text-brand-muted">No sales team members found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {userSummaries.map((summary) => (
              <div key={summary.user.uid} className="p-4 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-brand-gold/10 border border-brand-gold/20 flex items-center justify-center text-brand-gold font-bold">
                    {summary.user.photoURL ? (
                      <img src={summary.user.photoURL} alt={summary.user.displayName} className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      summary.user.displayName.charAt(0)
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-brand-text">{summary.user.displayName}</p>
                    <p className="text-[10px] text-brand-muted uppercase tracking-widest">{summary.user.role}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => onNavigate?.('deals', 'active', summary.user.uid)}
                    className="bg-white/5 p-3 rounded-lg border border-white/10 flex justify-between items-center hover:bg-white/10 transition-colors text-left"
                  >
                    <div>
                      <p className="text-[9px] font-bold text-brand-muted uppercase tracking-widest mb-1">Active Pipeline</p>
                      <p className="text-[10px] text-brand-muted">{summary.activeCount} Active Deals</p>
                    </div>
                    <div className="text-sm font-bold text-brand-text text-right">{formatCurrency(summary.pipelineValue)}</div>
                  </button>
                  <button 
                    onClick={() => onNavigate?.('deals', 'L5-closed-won', summary.user.uid)}
                    className="bg-brand-gold/5 p-3 rounded-lg border border-brand-gold/10 flex justify-between items-center hover:bg-brand-gold/10 transition-colors text-left"
                  >
                    <div>
                      <p className="text-[9px] font-bold text-brand-gold uppercase tracking-widest mb-1">Won Revenue</p>
                      <p className="text-[10px] text-brand-gold/60">{summary.wonCount} Won Deals</p>
                    </div>
                    <div className="text-sm font-bold text-brand-gold text-right">{formatCurrency(summary.wonValue)}</div>
                  </button>
                  <button 
                    onClick={() => onNavigate?.('deals', 'L0-closed-lost', summary.user.uid)}
                    className="bg-brand-red/5 p-3 rounded-lg border border-brand-red/10 flex justify-between items-center hover:bg-brand-red/10 transition-colors text-left"
                  >
                    <div>
                      <p className="text-[9px] font-bold text-brand-red uppercase tracking-widest mb-1">Lost Deals</p>
                      <p className="text-[10px] text-brand-red/60">{summary.lostCount} Lost Deals</p>
                    </div>
                    <div className="text-sm font-bold text-brand-red text-right">{formatCurrency(summary.lostValue)}</div>
                  </button>
                  <div className="bg-brand-bg/50 p-3 rounded-lg border border-white/5 flex justify-between items-center">
                    <div>
                      <p className="text-[9px] font-bold text-brand-muted uppercase tracking-widest mb-1">Est. Total GP</p>
                    </div>
                    <div className="text-sm font-bold text-brand-text text-right">{formatCurrency(summary.estTotalGP)}</div>
                  </div>
                  <div className="bg-brand-bg/50 p-3 rounded-lg border border-white/5 flex justify-between items-center">
                    <div>
                      <p className="text-[9px] font-bold text-brand-muted uppercase tracking-widest mb-1">Blended GP</p>
                    </div>
                    <div className="text-sm font-bold text-brand-text text-right">{summary.blendedGP.toFixed(1)}%</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PO and Invoice Summary Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-brand-card p-8 rounded-2xl border border-white/5 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-brand-gold flex items-center gap-2 uppercase tracking-wider">
              <FileText className="text-brand-gold" size={20} />
              Incoming Purchase Orders
            </h3>
            <div className="flex flex-col items-end">
              <span className="text-xs font-bold text-brand-muted uppercase tracking-widest">
                {purchaseOrders.length} Total
              </span>
              <div className="text-xs font-bold text-brand-text">
                {formatCurrencySimple(purchaseOrders.reduce((acc, p) => acc + p.amount, 0))}
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 mb-4">
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest mb-1">Total PO Value</p>
                <div className="text-sm font-bold text-brand-gold">
                  {formatCurrency(purchaseOrders.reduce((acc, p) => acc + p.amount, 0))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-brand-card p-8 rounded-2xl border border-white/5 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-brand-gold flex items-center gap-2 uppercase tracking-wider">
              <Receipt className="text-brand-gold" size={20} />
              Invoices
            </h3>
            <div className="flex flex-col items-end">
              <span className="text-xs font-bold text-brand-muted uppercase tracking-widest">
                {invoices.length} Total
              </span>
              <div className="text-xs font-bold text-brand-text">
                {formatCurrencySimple(invoices.reduce((acc, i) => acc + i.amount, 0))}
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest mb-1">Paid</p>
                <div className="text-sm font-bold text-brand-gold">
                  {formatCurrency(invoices.filter(i => i.status === 'paid').reduce((acc, i) => acc + i.amount, 0))}
                </div>
              </div>
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest mb-1">Unpaid / Overdue</p>
                <div className="text-sm font-bold text-brand-red">
                  {formatCurrency(invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled').reduce((acc, i) => acc + i.amount, 0))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
