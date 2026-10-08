import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, X, Shield, LayoutDashboard, Users, Briefcase, CheckSquare, User as UserIcon, LogOut, Settings as SettingsIcon, Search, Bell, Plus, Sun, Moon } from 'lucide-react';
import { 
  auth, 
  db, 
  signInWithGoogle, 
  onAuthStateChanged, 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  doc, 
  getDoc, 
  getDocs,
  setDoc, 
  addDoc,
  Timestamp, 
  FirebaseUser,
  handleFirestoreError,
  OperationType,
  logEvent,
  logout
} from './firebase';
import { UserProfile, Contact, Deal, Task, Company, Interaction, PurchaseOrder, Invoice, ImplementationPlan, PocRecord } from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Contacts from './components/Contacts';
import Deals from './components/Deals';
import Profile from './components/Profile';
import Settings from './components/Settings';
import AdminPanel from './components/AdminPanel';
import Companies from './components/Companies';
import PurchaseOrders from './components/PurchaseOrders';
import Invoices from './components/Invoices';
import UserGuide from './components/UserGuide';
import NotificationCenter from './components/NotificationCenter';
import ImplementationPlanComponent from './components/ImplementationPlanComponent';
import PocComponent from './components/PocComponent';
import { useTheme } from './lib/ThemeContext';

const App: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dealsFilter, setDealsFilter] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const ALLOWED_DOMAINS = ['xecura.id', 'sqshield.com'];

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [implementationPlans, setImplementationPlans] = useState<ImplementationPlan[]>([]);
  const [pocs, setPocs] = useState<PocRecord[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const email = firebaseUser.email || '';
        const domain = email.split('@')[1];

        if (!ALLOWED_DOMAINS.includes(domain)) {
          setAuthError(`Access denied. Your email domain (${domain}) is not authorized to use this system.`);
          await logout();
          setUser(null);
          setUserProfile(null);
          setLoading(false);
          return;
        }

        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (!userDoc.exists()) {
            const emailLower = firebaseUser.email?.toLowerCase() || '';
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || 'User',
              photoURL: firebaseUser.photoURL || undefined,
              role: (emailLower === 'rendoe@sqshield.com' || emailLower === 'rendoe@xecura.id') ? 'admin' : 'sales',
              createdAt: Timestamp.now(),
            };
            await setDoc(userDocRef, newProfile);
            setUserProfile(newProfile);
            setUser(firebaseUser);
            await logEvent('User Login', `First time login for ${firebaseUser.email}`);
          } else {
            const profile = userDoc.data() as UserProfile;
            console.log('User profile loaded:', profile);
            const emailLower = firebaseUser.email?.toLowerCase() || '';
            // Ensure the admin role is set if the email matches, even for existing profiles
            if ((emailLower === 'rendoe@sqshield.com' || emailLower === 'rendoe@xecura.id') && profile.role !== 'admin') {
              console.log('Updating user to admin role...');
              const updatedProfile = { ...profile, role: 'admin' as const };
              await setDoc(userDocRef, updatedProfile);
              setUserProfile(updatedProfile);
            } else {
              setUserProfile(profile);
            }
            setUser(firebaseUser);
            await logEvent('User Login', `User logged in: ${firebaseUser.email}`);
          }
        } catch (error: any) {
          console.error('Error fetching user profile:', error);
          setAuthError(`Permission Denied: Unable to load your profile. Please contact the administrator. (${error.message || 'Unknown error'})`);
          setUser(null);
          setUserProfile(null);
        }
      } else {
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    setAuthError(null);
    try {
      const result = await signInWithGoogle();
      const email = result.user.email || '';
      const domain = email.split('@')[1];

      if (!ALLOWED_DOMAINS.includes(domain)) {
        setAuthError(`Access denied. Your email domain (${domain}) is not authorized to use this system.`);
        await logout();
        return;
      }
    } catch (error: any) {
      console.error('Sign in failed:', error);
      let message = 'An unexpected error occurred during sign in.';
      
      if (error.code === 'auth/popup-blocked') {
        message = 'The sign-in popup was blocked by your browser. Please allow popups for this site and try again.';
      } else if (error.code === 'auth/unauthorized-domain') {
        message = `This domain (${window.location.hostname}) is not authorized for sign-in in the Firebase Console. Please add it to the "Authorized domains" list in Authentication > Settings.`;
      } else if (error.code === 'auth/popup-closed-by-user') {
        message = 'The sign-in popup was closed before completion. This often happens if the window is closed manually or by a browser extension. Please try again.';
      } else if (error.code === 'auth/cancelled-popup-request') {
        message = 'Multiple sign-in requests detected. Please wait a moment and try again.';
      } else if (error.code === 'auth/network-request-failed') {
        message = 'Network error. Please check your internet connection.';
      } else if (error.message?.includes('third-party cookies')) {
        message = 'Your browser is blocking third-party cookies, which are required for sign-in. Please enable them or use a different browser.';
      }
      
      setAuthError(message);
      // Automatically show troubleshooting if it's a common issue
      if (['auth/popup-blocked', 'auth/popup-closed-by-user', 'third-party cookies'].some(s => message.toLowerCase().includes(s))) {
        setShowTroubleshooting(true);
      }
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setActiveTab('dashboard');
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  useEffect(() => {
    if (!user || !userProfile) return;

    const isAdminOrManager = userProfile.role === 'admin' || userProfile.role === 'manager' || userProfile.role === 'super_user' || userProfile.role === 'engineer' || userProfile.role === 'finance' || userProfile.role === 'procurement' || userProfile.role === 'project_manager';

    const qContacts = isAdminOrManager 
      ? query(collection(db, 'contacts'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'contacts'), where('ownerId', '==', user.uid), orderBy('createdAt', 'desc'));
    
    const unsubscribeContacts = onSnapshot(qContacts, (snapshot) => {
      setContacts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Contact)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'contacts'));

    const qDeals = isAdminOrManager
      ? query(collection(db, 'deals'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'deals'), where('ownerId', '==', user.uid), orderBy('createdAt', 'desc'));
    
    const unsubscribeDeals = onSnapshot(qDeals, (snapshot) => {
      setDeals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Deal)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'deals'));

    const qTasks = isAdminOrManager
      ? query(collection(db, 'tasks'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'tasks'), where('ownerId', '==', user.uid), orderBy('createdAt', 'desc'));
    
    const unsubscribeTasks = onSnapshot(qTasks, (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'tasks'));

    const qCompanies = isAdminOrManager
      ? query(collection(db, 'companies'), orderBy('name', 'asc'))
      : query(collection(db, 'companies'), where('ownerId', '==', user.uid), orderBy('name', 'asc'));
    
    const unsubscribeCompanies = onSnapshot(qCompanies, (snapshot) => {
      setCompanies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Company)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'companies'));

    const qInteractions = isAdminOrManager
      ? query(collection(db, 'interactions'), orderBy('date', 'desc'))
      : query(collection(db, 'interactions'), where('ownerId', '==', user.uid), orderBy('date', 'desc'));

    const unsubscribeInteractions = onSnapshot(qInteractions, (snapshot) => {
      setInteractions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Interaction)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'interactions'));

    const qPurchaseOrders = isAdminOrManager
      ? query(collection(db, 'purchaseOrders'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'purchaseOrders'), where('ownerId', '==', user.uid), orderBy('createdAt', 'desc'));
    
    const unsubscribePurchaseOrders = onSnapshot(qPurchaseOrders, (snapshot) => {
      setPurchaseOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseOrder)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'purchaseOrders'));

    const qInvoices = isAdminOrManager
      ? query(collection(db, 'invoices'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'invoices'), where('ownerId', '==', user.uid), orderBy('createdAt', 'desc'));
    
    const unsubscribeInvoices = onSnapshot(qInvoices, (snapshot) => {
      setInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'invoices'));

    const qImplementationPlans = query(collection(db, 'implementationPlans'), orderBy('createdAt', 'desc'));
    const unsubscribeImplementationPlans = onSnapshot(qImplementationPlans, (snapshot) => {
      setImplementationPlans(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ImplementationPlan)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'implementationPlans'));

    const qPocs = query(collection(db, 'pocs'), orderBy('createdAt', 'desc'));
    const unsubscribePocs = onSnapshot(qPocs, (snapshot) => {
      setPocs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PocRecord)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'pocs'));

    let unsubscribeUsers = () => {};
    if (isAdminOrManager) {
      const qUsers = query(collection(db, 'users'), orderBy('displayName', 'asc'));
      unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
        setUsers(snapshot.docs.map(doc => doc.data() as UserProfile));
      }, (error) => console.error('Error fetching users:', error));
    }

    return () => {
      unsubscribeContacts();
      unsubscribeDeals();
      unsubscribeTasks();
      unsubscribeCompanies();
      unsubscribeInteractions();
      unsubscribePurchaseOrders();
      unsubscribeInvoices();
      unsubscribeImplementationPlans();
      unsubscribePocs();
      unsubscribeUsers();
    };
  }, [user, userProfile]);

  useEffect(() => {
    if (!user || !userProfile || invoices.length === 0) return;

    const checkDueInvoices = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      for (const invoice of invoices) {
        if (invoice.status === 'paid' || invoice.status === 'cancelled') continue;
        
        const dueDate = invoice.dueDate.toDate();
        dueDate.setHours(0, 0, 0, 0);
        
        // If due today or overdue
        if (dueDate <= today) {
          const isOverdue = dueDate < today;
          const title = isOverdue ? `Invoice Overdue: ${invoice.invoiceNumber}` : `Invoice Due Today: ${invoice.invoiceNumber}`;
          
          try {
            // Check if notification already exists for this invoice and this specific title
            const q = query(
              collection(db, 'notifications'),
              where('userId', '==', user.uid),
              where('relatedId', '==', invoice.id),
              where('title', '==', title)
            );
            
            const existing = await getDocs(q);
            
            if (existing.empty) {
              await addDoc(collection(db, 'notifications'), {
                userId: user.uid,
                title,
                message: `${invoice.title} for ${invoice.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} is ${isOverdue ? 'overdue' : 'due today'}.`,
                type: isOverdue ? 'error' : 'warning',
                read: false,
                relatedId: invoice.id,
                relatedType: 'invoice',
                createdAt: Timestamp.now()
              });
            }
          } catch (error) {
            console.error('Error checking/creating due invoice notification:', error);
          }
        }
      }
    };

    checkDueInvoices();
  }, [user, userProfile, invoices]);

  useEffect(() => {
    if (!user || !userProfile || deals.length === 0) return;

    const checkDealStageDuration = async () => {
      const now = new Date();
      
      for (const deal of deals) {
        if (deal.stage === 'L5-closed-won' || deal.stage === 'L0-closed-lost') continue;
        
        const stageUpdatedAt = deal.stageUpdatedAt.toDate();
        const diffTime = Math.abs(now.getTime() - stageUpdatedAt.getTime());
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays > 60) {
          const title = `Deal Stagnant: ${deal.title}`;
          const stageLabel = deal.stage.split('-')[0].toUpperCase();
          const message = `This deal has been in the ${stageLabel} stage for ${diffDays} days. Consider taking action.`;
          
          try {
            // Check if notification already exists for this deal and this specific stage
            const q = query(
              collection(db, 'notifications'),
              where('userId', '==', user.uid),
              where('relatedId', '==', deal.id),
              where('title', '==', title)
            );
            
            const existing = await getDocs(q);
            
            if (existing.empty) {
              await addDoc(collection(db, 'notifications'), {
                userId: user.uid,
                title,
                message,
                type: 'warning',
                read: false,
                relatedId: deal.id,
                relatedType: 'deal',
                createdAt: Timestamp.now()
              });
            }
          } catch (error) {
            console.error('Error checking/creating stagnant deal notification:', error);
          }
        }
      }
    };

    checkDealStageDuration();
  }, [user, userProfile, deals]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg text-brand-text">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-brand-gold/10 border-t-brand-gold rounded-full animate-spin" />
          <p className="text-brand-gold/50 font-medium animate-pulse uppercase tracking-widest text-[10px]">Initializing Xecura CRM...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-brand-bg flex flex-col text-brand-text selection:bg-brand-gold selection:text-brand-bg">
        <nav className="p-6 flex items-center justify-between max-w-7xl mx-auto w-full relative z-10">
          <div className="flex items-center gap-3">
            <img src={theme === 'white-blue' ? '/xecura.png' : '/xecura_white.png'} alt="XECURA CRM" className="h-11 w-auto object-contain" />
          </div>
          <button
            onClick={handleSignIn}
            className="bg-gold-gradient text-brand-bg px-6 py-2.5 rounded-xl font-bold hover:brightness-110 transition-all shadow-lg shadow-brand-gold/20"
          >
            Sign In
          </button>
        </nav>

        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-5xl mx-auto relative">
          {/* Decorative background elements */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-brand-gold/5 rounded-full blur-[120px] -z-0 pointer-events-none" />
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="relative z-10"
          >
            {authError && (
              <div className="mb-8 p-4 bg-brand-red/10 border border-brand-red/20 text-brand-red rounded-2xl text-sm font-medium max-w-md mx-auto flex flex-col gap-3">
                <p>{authError}</p>
                <button 
                  onClick={handleSignIn}
                  className="bg-brand-red text-white px-4 py-2 rounded-xl font-bold hover:bg-brand-red/80 transition-all text-xs w-fit mx-auto"
                >
                  Try Again
                </button>
              </div>
            )}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-gold/5 rounded-full text-brand-gold text-sm font-bold uppercase tracking-wider mb-8 border border-brand-gold/20 backdrop-blur-md">
              <Shield size={16} />
              Secure Enterprise CRM
            </div>
            <h2 className="text-5xl md:text-8xl font-bold text-brand-text tracking-tight leading-[0.9] mb-8">
              Welcome to <br /> <span className="text-brand-gold">XECURA CRM</span>
            </h2>
            <p className="text-xl text-brand-muted mb-12 max-w-2xl mx-auto leading-relaxed">
              Secure, Lightweight & AI Powered
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              <button
                onClick={handleSignIn}
                className="w-full sm:w-auto bg-gold-gradient text-brand-bg px-10 py-4 rounded-2xl font-black hover:scale-105 active:scale-95 transition-all shadow-xl shadow-brand-gold/20 text-lg uppercase tracking-wider"
              >
                Get Started Now
              </button>
              <button
                onClick={() => setShowTroubleshooting(true)}
                className="w-full sm:w-auto bg-white/5 text-brand-text px-10 py-4 rounded-2xl font-bold hover:bg-white/10 transition-all border border-white/10 shadow-sm text-lg"
              >
                Learn More
              </button>
            </div>
          </motion.div>

          <AnimatePresence>
            {showTroubleshooting && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-brand-bg/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
                onClick={() => setShowTroubleshooting(false)}
              >
                  <motion.div
                   initial={{ scale: 0.95, opacity: 0 }}
                   animate={{ scale: 1, opacity: 1 }}
                   exit={{ scale: 0.95, opacity: 0 }}
                   className="bg-brand-card rounded-3xl p-8 max-w-lg w-full shadow-2xl border border-brand-gold/20"
                   onClick={(e) => e.stopPropagation()}
                 >
                   <div className="flex items-center justify-between mb-6">
                     <h3 className="text-2xl font-bold text-brand-gold">Sign-in Troubleshooting</h3>
                     <button onClick={() => setShowTroubleshooting(false)} className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/40 hover:text-white">
                       <X size={24} />
                     </button>
                   </div>
                   
                   <div className="space-y-6 text-left">
                     <section>
                       <h4 className="font-bold text-brand-gold mb-2">1. Allow Popups</h4>
                       <p className="text-brand-muted text-sm leading-relaxed">
                         Google Sign-In uses a popup window. If your browser blocks popups, the sign-in process will fail. Look for a "popup blocked" icon in your address bar and allow popups for this site.
                       </p>
                     </section>
                     
                     <section>
                       <h4 className="font-bold text-brand-gold mb-2">2. Enable Third-Party Cookies</h4>
                       <p className="text-brand-muted text-sm leading-relaxed">
                         Firebase Authentication requires third-party cookies to communicate between this app and Google's servers. If you're using Safari, Brave, or Incognito mode, ensure third-party cookies are enabled.
                       </p>
                     </section>
                     
                     <section>
                       <h4 className="font-bold text-brand-gold mb-2">3. Disable "Prevent Cross-Site Tracking" (Safari)</h4>
                       <p className="text-brand-muted text-sm leading-relaxed">
                         In Safari, go to <strong>Settings &gt; Privacy</strong> and uncheck <strong>"Prevent Cross-Site Tracking"</strong>. This is a common cause of sign-in issues in Safari.
                       </p>
                     </section>
                     
                     <section>
                       <h4 className="font-bold text-brand-gold mb-2">4. Authorized Domains</h4>
                       <p className="text-brand-muted text-sm leading-relaxed mb-3">
                         If you are the administrator, ensure that the current domain is added to the <strong>"Authorized domains"</strong> list in the Firebase Console under <strong>Authentication &gt; Settings</strong>.
                       </p>
                       <div className="flex items-center gap-2 p-3 bg-white/5 rounded-xl border border-white/10">
                         <code className="text-xs font-mono text-white/60 flex-1 truncate">{window.location.hostname}</code>
                         <button 
                           onClick={() => {
                             navigator.clipboard.writeText(window.location.hostname);
                             alert('Domain copied to clipboard!');
                           }}
                           className="text-[10px] font-bold uppercase tracking-wider bg-gold-gradient text-brand-bg px-3 py-1.5 rounded-lg hover:brightness-110 transition-all font-black"
                         >
                           Copy
                         </button>
                       </div>
                     </section>
                   </div>
                   
                   <button
                     onClick={() => setShowTroubleshooting(false)}
                     className="w-full mt-8 bg-gold-gradient text-brand-bg py-3 rounded-xl font-bold hover:brightness-110 transition-all shadow-lg shadow-brand-gold/20 font-black uppercase tracking-widest"
                   >
                     Got it
                   </button>
                 </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 w-full relative z-10">
            {[
              { icon: LayoutDashboard, title: 'Real-time Analytics', desc: 'Visual dashboards for your sales pipeline.' },
              { icon: Users, title: 'Lead Management', desc: 'Track potential customers from new to qualified.' },
              { icon: Briefcase, title: 'Deal Pipeline', desc: 'Manage stages and forecast revenue accurately.' },
            ].map((feature, i) => (
              <div key={i} className="group bg-brand-card p-8 rounded-3xl border border-white/10 shadow-sm text-left hover:border-brand-gold/30 transition-all hover:-translate-y-1">
                <div className={`w-12 h-12 bg-brand-gold/10 rounded-xl flex items-center justify-center text-brand-gold mb-6 border border-brand-gold/20 group-hover:scale-110 transition-transform`}>
                  <feature.icon size={24} />
                </div>
                <h3 className="text-lg font-bold text-brand-gold mb-2">{feature.title}</h3>
                <p className="text-brand-muted text-sm leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </main>

        <footer className="p-12 text-center text-brand-muted text-sm border-t border-white/5 relative z-10">
          © 2026 XECURA CRM. All rights reserved. Built with security in mind.
        </footer>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return (
        <Dashboard 
          contacts={contacts} 
          deals={deals} 
          tasks={tasks} 
          companies={companies} 
          purchaseOrders={purchaseOrders} 
          invoices={invoices} 
          interactions={interactions}
          userRole={userProfile?.role} 
          userId={user.uid} 
          users={users} 
          onNavigate={(tab, filter, ownerId) => {
            setActiveTab(tab);
            if (filter) setDealsFilter(filter);
            if (ownerId) setOwnerFilter(ownerId);
          }}
        />
      );
      case 'companies': return <Companies companies={companies} contacts={contacts} deals={deals} tasks={tasks} interactions={interactions} purchaseOrders={purchaseOrders} invoices={invoices} userId={user.uid} users={users} userRole={userProfile?.role} />;
      case 'contacts': return <Contacts contacts={contacts} companies={companies} userId={user.uid} users={users} userRole={userProfile?.role} />;
      case 'deals': return (
        <Deals 
          deals={deals} 
          contacts={contacts} 
          companies={companies} 
          interactions={interactions} 
          userId={user.uid} 
          userRole={userProfile?.role} 
          users={users} 
          initialFilter={dealsFilter}
          initialOwnerFilter={ownerFilter}
          onClearFilter={() => {
            setDealsFilter(null);
            setOwnerFilter(null);
          }}
        />
      );
      case 'purchaseOrders': return <PurchaseOrders purchaseOrders={purchaseOrders} contacts={contacts} companies={companies} deals={deals} userId={user.uid} users={users} userRole={userProfile?.role} />;
      case 'invoices': return <Invoices invoices={invoices} purchaseOrders={purchaseOrders} contacts={contacts} companies={companies} deals={deals} userId={user.uid} users={users} userRole={userProfile?.role} />;
      case 'poc': return (
        <PocComponent
          deals={deals}
          companies={companies}
          contacts={contacts}
          pocs={pocs}
          users={users}
          userId={user.uid}
          userRole={userProfile?.role}
        />
      );
      case 'implementationPlan': return (
        <ImplementationPlanComponent
          deals={deals}
          purchaseOrders={purchaseOrders}
          companies={companies}
          contacts={contacts}
          implementationPlans={implementationPlans}
          invoices={invoices}
          users={users}
          userId={user.uid}
          userRole={userProfile?.role}
        />
      );
      case 'profile': return userProfile ? <Profile user={userProfile} /> : null;
      case 'settings': return <Settings userProfile={userProfile} />;
      case 'userGuide': return <UserGuide />;
      case 'admin': return userProfile?.role === 'admin' ? <AdminPanel userId={user.uid} /> : <Dashboard contacts={contacts} deals={deals} tasks={tasks} companies={companies} purchaseOrders={purchaseOrders} invoices={invoices} interactions={interactions} userRole={userProfile?.role} userId={user.uid} users={users} onNavigate={(tab, filter, ownerId) => {
        setActiveTab(tab);
        if (filter) setDealsFilter(filter);
        if (ownerId) setOwnerFilter(ownerId);
      }} />;
      default: return <Dashboard contacts={contacts} deals={deals} tasks={tasks} companies={companies} purchaseOrders={purchaseOrders} invoices={invoices} interactions={interactions} userRole={userProfile?.role} userId={user.uid} users={users} onNavigate={(tab, filter, ownerId) => {
        setActiveTab(tab);
        if (filter) setDealsFilter(filter);
        if (ownerId) setOwnerFilter(ownerId);
      }} />;
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen w-full bg-brand-bg flex text-brand-text selection:bg-brand-gold selection:text-brand-bg overflow-x-hidden">
        <div className="no-print">
          <Sidebar 
            activeTab={activeTab} 
            setActiveTab={setActiveTab} 
            isOpen={isSidebarOpen} 
            setIsOpen={setIsSidebarOpen} 
            userRole={userProfile?.role}
            onLogout={handleLogout}
          />
        </div>

        <div className="flex-1 flex flex-col min-w-0 main-content w-full overflow-x-hidden">
          <header className="h-24 bg-brand-card px-8 flex items-center justify-between sticky top-0 z-30 no-print border-b border-brand-gold/10">
            <div className="flex items-center gap-6">
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 text-brand-gold/80 hover:bg-white/5 rounded-lg transition-colors"
              >
                <Menu size={24} />
              </button>
              <div className="flex items-center gap-4">
                <img src={theme === 'white-blue' ? '/xecura.png' : '/xecura_white.png'} alt="XECURA CRM" className="h-11 w-auto object-contain" />
                <div className="hidden lg:flex items-center bg-white/5 backdrop-blur-md border border-white/10 px-5 py-2 rounded-2xl ml-2 shadow-sm">
                  <span className="text-brand-gold text-[11px] font-black tracking-[0.2em] uppercase whitespace-nowrap">
                    SECURE ENTERPRISE CRM
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <button
                onClick={() => setTheme(theme === 'dark-gold' ? 'white-blue' : 'dark-gold')}
                className="p-2 text-brand-gold/80 hover:bg-white/5 rounded-lg transition-colors"
                title={theme === 'dark-gold' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {theme === 'dark-gold' ? <Sun size={24} /> : <Moon size={24} />}
              </button>
              {user && <NotificationCenter userId={user.uid} />}
              <div className="hidden sm:block text-right">
                <p className="text-sm font-bold text-brand-text">{user.displayName}</p>
                <p className="text-xs text-brand-muted">{user.email}</p>
              </div>
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || ''} className="w-12 h-12 rounded-xl object-cover shadow-lg border-2 border-brand-gold/20" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-brand-gold border-2 border-brand-gold/20">
                  <UserIcon size={24} />
                </div>
              )}
            </div>
          </header>

          <main className="p-6 lg:p-10 max-w-full mx-auto w-full bg-brand-bg min-h-[calc(100vh-6rem)]">
            {activeTab !== 'admin' && activeTab !== 'userGuide' && activeTab !== 'poc' && activeTab !== 'implementationPlan' && (
              <div className="mb-8 flex items-center justify-between">
                <h2 className="text-3xl font-black text-brand-text tracking-tight uppercase">
                  {activeTab === 'purchaseOrders' ? 'Incoming POs' : 
                   activeTab === 'interactions' ? 'Interactions' :
                   activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                </h2>
              </div>
            )}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {renderContent()}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default App;
