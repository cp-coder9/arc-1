/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, onSnapshot, updateDoc } from 'firebase/firestore';
import { UserProfile, UserRole, Job, JobCategory } from './types';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { ScrollArea } from './components/ui/scroll-area';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from './components/ui/input';
import { 
  LayoutDashboard, 
  Briefcase, 
  FileText, 
  Users, 
  LogOut, 
  Plus, 
  Search,
  ShieldCheck,
  History,
  ArrowRight,
  CheckCircle2,
  MapPin,
  Clock,
  Menu,
  X,
  Loader2,
  Mail,
  Lock,
  User as UserIcon,
  Settings2,
  CreditCard,
  UserCircle,
  HardDrive,
  Sparkles,
  Send,
  Building2
} from 'lucide-react';

import { Logo } from './components/Logo';
import { NotificationBell } from './components/NotificationBell';

// Sub-components
import ClientDashboard from './components/ClientDashboard';
import ArchitectDashboard from './components/ArchitectDashboard';
import AdminDashboard from './components/AdminDashboard';
import FreelancerDashboard from './components/FreelancerDashboard';
import BEPDashboard from './components/BEPDashboard';
import UserSettings from './components/UserSettings';
import InvoiceManagement from './components/InvoiceManagement';
import FileManager from './components/FileManager';
import { AnimatedFloorPlan } from './components/AnimatedFloorPlan';
import OnboardingFlow from "./components/OnboardingFlow";

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [roleSelection, setRoleSelection] = useState<UserRole | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authMode, setAuthMode] = useState<'selection' | 'email-login' | 'email-signup'>('selection');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [professionalLabel, setProfessionalLabel] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setProfileLoading(true);
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            setUser(userDoc.data() as UserProfile);
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
        } finally {
          setProfileLoading(false);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    if (!roleSelection) {
      toast.error("Please select a role first");
      return;
    }
    setIsLoggingIn(true);
    setProfileLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const firebaseUser = result.user;
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      
      const adminEmails = ['gm.tarb@gmail.com', 'leor@slutzkin.co.za'];
      const isAdmin = adminEmails.includes(firebaseUser.email || '');
      
      if (!userDoc.exists()) {
        const newUser: UserProfile = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || 'Anonymous',
          role: isAdmin ? 'admin' : (roleSelection || 'client'),
          ...formData,
          createdAt: new Date().toISOString(),
        };
        await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
        setUser(newUser);
        
        if (isAdmin) {
          toast.success('Logged in as Administrator');
        }
      } else {
        const existingUser = userDoc.data() as UserProfile;
        if (isAdmin && existingUser.role !== 'admin') {
          await updateDoc(doc(db, 'users', firebaseUser.uid), { role: 'admin' });
          existingUser.role = 'admin';
          toast.success('Admin privileges restored');
        }
        setUser(existingUser);
      }
    } catch (error: any) {
      console.error("Login error:", error);
      toast.error("Failed to login");
    } finally {
      setIsLoggingIn(false);
      setProfileLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoggingIn || profileLoading) return;
    setIsLoggingIn(true);
    setProfileLoading(true);

    try {
      let firebaseUser;
      if (authMode === 'email-signup') {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        firebaseUser = result.user;
        if (displayName) await updateProfile(firebaseUser, { displayName });
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password);
        firebaseUser = result.user;
      }

      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (!userDoc.exists()) {
        const newUser: UserProfile = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || displayName || firebaseUser.email?.split('@')[0] || 'Anonymous',
          role: roleSelection || 'client',
          ...formData,
          createdAt: new Date().toISOString(),
        };
        await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
        setUser(newUser);
      } else {
        setUser(userDoc.data() as UserProfile);
      }
      toast.success(authMode === 'email-signup' ? "Account created!" : "Welcome back!");
    } catch (error: any) {
      console.error("Auth error:", error);
      toast.error("Authentication failed.");
    } finally {
      setIsLoggingIn(false);
      setProfileLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setShowLogin(false);
      setAuthMode('selection');
      setRoleSelection(null);
      setActiveTab('overview');
      toast.success("Logged out successfully");
    } catch (error) {
      toast.error("Failed to logout");
    }
  };

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-full h-12 w-12 border-b-2 border-primary animate-spin"></div>
          <p className="text-sm text-muted-foreground animate-pulse font-medium">Securing session...</p>
        </div>
      </div>
    );
  }

  if (!user && showOnboarding) {
    return (
      <OnboardingFlow
        onComplete={(data) => {
          setRoleSelection(data.role);
          setFormData(data);
          setShowOnboarding(false);
          setShowLogin(true);
          setAuthMode("email-signup");
        }}
        onCancel={() => setShowOnboarding(false)}
      />
    );
  }

  if (!user && !showLogin) {
    return <LandingPage onGetStarted={() => setShowOnboarding(true)} />;
  }

  if (!user && showLogin) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <Logo iconClassName="w-20 h-20 mx-auto mb-4 text-primary" />
            <h1 className="text-4xl font-heading font-bold mb-2">Architex</h1>
            <p className="text-sm text-muted-foreground uppercase tracking-widest">Join the premier architectural marketplace</p>
          </div>

          <Card className="border-border shadow-xl bg-white/80 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="font-heading text-2xl">
                {authMode === 'selection' ? 'Create Account' : authMode === 'email-login' ? 'Welcome Back' : 'Join Architex'}
              </CardTitle>
              <CardDescription>
                {authMode === 'selection' ? 'Select your role to join the Architex community' : 'Enter your details to continue'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {authMode === 'selection' ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <RoleSelectButton role="client" label="Client" sub="I want to post jobs" icon={<Users className="w-8 h-8" />} active={roleSelection === 'client'} onClick={() => setRoleSelection('client')} />
                    <RoleSelectButton role="architect" label="Architect" sub="I want to find work" icon={<Briefcase className="w-8 h-8" />} active={roleSelection === 'architect'} onClick={() => setRoleSelection('architect')} />
                    <RoleSelectButton role="admin" label="Admin" sub="Platform Mgmt" icon={<ShieldCheck className="w-8 h-8" />} active={roleSelection === 'admin'} onClick={() => setRoleSelection('admin')} />
                    <RoleSelectButton role="freelancer" label="Freelancer" sub="Specialist" icon={<Sparkles className="w-8 h-8" />} active={roleSelection === 'freelancer'} onClick={() => setRoleSelection('freelancer')} />
                  </div>
                  <div className="space-y-3">
                    <Button onClick={handleLogin} className="w-full bg-primary text-primary-foreground h-14 text-lg font-medium shadow-lg" disabled={!roleSelection || isLoggingIn}>
                      {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign in with Google'}
                    </Button>
                    <div className="grid grid-cols-2 gap-4">
                      <Button variant="outline" className="h-12 rounded-xl" onClick={() => setAuthMode('email-login')} disabled={!roleSelection}>Login</Button>
                      <Button variant="outline" className="h-12 rounded-xl" onClick={() => setAuthMode('email-signup')} disabled={!roleSelection}>Sign Up</Button>
                    </div>
                  </div>
                </>
              ) : (
                <form onSubmit={handleEmailAuth} className="space-y-4">
                  {authMode === 'email-signup' && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Full Name</label>
                      <Input placeholder="John Doe" value={displayName} onChange={e => setDisplayName(e.target.value)} required className="h-12 rounded-xl" />
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Email Address</label>
                    <Input type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} required className="h-12 rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Password</label>
                    <Input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required className="h-12 rounded-xl" />
                  </div>
                  <Button type="submit" className="w-full bg-primary text-primary-foreground h-14 text-lg font-medium rounded-xl shadow-lg mt-4" disabled={isLoggingIn}>
                    {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : (authMode === 'email-login' ? 'Login' : 'Create Account')}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full text-muted-foreground" onClick={() => setAuthMode('selection')}>Back to Options</Button>
                </form>
              )}
              <Button variant="ghost" onClick={() => setShowLogin(false)} className="w-full text-muted-foreground">Back to Marketplace</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFDFD] flex flex-col md:flex-row">
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-border transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col p-6">
          <div className="flex items-center justify-between mb-10">
            <Logo showText iconClassName="w-10 h-10 text-primary" textClassName="font-heading font-bold text-2xl tracking-tighter" />
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsSidebarOpen(false)}><X size={20} /></Button>
          </div>
        </div>

        <nav className="flex-1 px-6 space-y-2">
          <NavItem 
            icon={<LayoutDashboard size={18} />} 
            label="Overview" 
            active={activeTab === 'overview'} 
            onClick={() => { setActiveTab('overview'); setIsSidebarOpen(false); }} 
          />
          {user!.role === 'client' && (
            <NavItem 
              icon={<Plus size={18} />} 
              label="Post a Job" 
              active={activeTab === 'post-job'} 
              onClick={() => { setActiveTab('post-job'); setIsSidebarOpen(false); }} 
            />
          )}
          {user!.role === 'architect' && (
            <NavItem 
              icon={<Search size={18} />} 
              label="Marketplace" 
              active={activeTab === 'marketplace'} 
              onClick={() => { setActiveTab('marketplace'); setIsSidebarOpen(false); }} 
            />
          )}
          {user!.role === 'architect' && (
            <NavItem 
              icon={<Send size={18} />} 
              label="My Applications" 
              active={activeTab === 'applications'} 
              onClick={() => { setActiveTab('applications'); setIsSidebarOpen(false); }} 
            />
          )}
          {user!.role === 'architect' && (
            <NavItem
              icon={<Users size={18} />}
              label="Team & Freelancers"
              active={activeTab === 'team'}
              onClick={() => { setActiveTab('team'); setIsSidebarOpen(false); }}
            />
          )}
          <NavItem 
            icon={<FileText size={18} />} 
            label="Active Projects" 
            active={activeTab === 'projects'} 
            onClick={() => { setActiveTab('projects'); setIsSidebarOpen(false); }} 
          />
          {user!.role === 'admin' && (
            <>
              <NavItem 
                icon={<ShieldCheck size={18} />} 
                label="Compliance Hub" 
                active={activeTab === 'compliance'} 
                onClick={() => { setActiveTab('compliance'); setIsSidebarOpen(false); }} 
              />
              <NavItem 
                icon={<Users size={18} />} 
                label="User Management" 
                active={activeTab === 'users'} 
                onClick={() => { setActiveTab('users'); setIsSidebarOpen(false); }} 
              />
              <NavItem 
                icon={<Settings2 size={18} />} 
                label="LLM Settings" 
                active={activeTab === 'settings'} 
                onClick={() => { setActiveTab('settings'); setIsSidebarOpen(false); }} 
              />
              <NavItem 
                icon={<Sparkles size={18} />} 
                label="Knowledge Base" 
                active={activeTab === 'knowledge'} 
                onClick={() => { setActiveTab('knowledge'); setIsSidebarOpen(false); }} 
              />
            </>
          )}
          <NavItem 
            icon={<History size={18} />} 
            label="Audit Logs" 
            active={activeTab === 'audit'} 
            onClick={() => { setActiveTab('audit'); setIsSidebarOpen(false); }} 
          />
          <div className="pt-4 mt-4 border-t border-border">
            <NavItem 
              icon={<CreditCard size={18} />} 
              label="Invoices" 
              active={activeTab === 'invoices'} 
              onClick={() => { setActiveTab('invoices'); setIsSidebarOpen(false); }} 
            />
            <NavItem 
              icon={<HardDrive size={18} />} 
              label="Files" 
              active={activeTab === 'files'} 
              onClick={() => { setActiveTab('files'); setIsSidebarOpen(false); }} 
            />
            <NavItem 
              icon={<UserCircle size={18} />} 
              label="My Settings" 
              active={activeTab === 'profile-settings'} 
              onClick={() => { setActiveTab('profile-settings'); setIsSidebarOpen(false); }} 
            />
            </div>
          </nav>
          <div className="pt-6 border-t border-border">
            <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-xl h-12" onClick={handleLogout}>
              <LogOut size={20} /> <span className="font-bold">Logout</span>
            </Button>
          </div>
        </aside>
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-border px-8 flex items-center justify-between sticky top-0 z-40">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsSidebarOpen(true)}><Menu size={24} /></Button>
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            <NotificationBell userId={user.uid} />
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-sm">
              <UserIcon size={20} />
            </div>
          </div>
        </header>
        <ScrollArea className="flex-1">
          <div className="p-8 max-w-7xl mx-auto w-full">
            {activeTab === 'invoices' && <InvoiceManagement user={user} />}
            {activeTab === 'files' && <FileManager user={user} />}
            {activeTab === 'profile-settings' && <UserSettings user={user} />}
            {(activeTab !== 'invoices' && activeTab !== 'files' && activeTab !== 'profile-settings') && (
              <>
                {user.role === 'client' && <ClientDashboard user={user} activeTab={activeTab} onTabChange={setActiveTab} />}
                {user.role === 'architect' && <ArchitectDashboard user={user} activeTab={activeTab} onTabChange={setActiveTab} />}
                {user.role === 'admin' && <AdminDashboard user={user} activeTab={activeTab} onTabChange={setActiveTab} />}
                {user.role === 'freelancer' && <FreelancerDashboard user={user} />}
                {user.role === 'bep' && <BEPDashboard user={user} />}
              </>
            )}
          </div>
        </ScrollArea>
      </main>
      <Toaster />
    </div>
  );
}

function RoleSelectButton({ role, label, sub, icon, active, onClick }: any) {
  return (
    <Button variant={active ? 'default' : 'outline'} className={`h-32 flex flex-col gap-3 transition-all ${active ? 'bg-primary text-primary-foreground border-primary scale-105 shadow-lg' : 'hover:border-primary/50'}`} onClick={onClick}>
      {icon}
      <div className="text-center">
        <p className="font-bold">{label}</p>
        <p className="text-[10px] opacity-70">{sub}</p>
      </div>
    </Button>
  );
}

function NavItem({ icon, label, active, onClick }: any) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all ${active ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-muted-foreground hover:bg-primary/5 hover:text-primary'}`}>
      {icon} <span className="font-bold">{label}</span>
    </button>
  );
}

function LandingPage({ onGetStarted }: { onGetStarted: () => void }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const jobs = [
    { id: '1', title: 'Modern Sustainable Villa', budget: 45000, category: 'Residential', description: 'Eco-friendly family home in Stellenbosch needing full SANS compliance check.', location: 'Cape Town', createdAt: new Date().toISOString() },
    { id: '2', title: 'Luxury Penthouse Renovation', budget: 28000, category: 'Renovation', description: 'Interior reconfiguration for a high-end Sandton apartment.', location: 'Johannesburg', createdAt: new Date().toISOString() },
    { id: '3', title: 'Industrial Warehouse Expansion', budget: 85000, category: 'Industrial', description: 'Large scale warehouse addition requiring complex fire safety review.', location: 'Durban', createdAt: new Date().toISOString() }
  ];

  return (
    <div className="min-h-screen bg-[#FDFDFD] overflow-x-hidden">
      <nav className="h-20 border-b border-border px-8 lg:px-20 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-md z-50">
        <Logo showText iconClassName="w-12 h-12 text-primary" />
        <div className="hidden lg:flex items-center gap-6">
          <button onClick={onGetStarted} className="text-sm font-medium hover:text-primary">Marketplace</button>
          <Button onClick={onGetStarted} className="bg-primary text-primary-foreground px-6 rounded-full font-bold">Get Started</Button>
        </div>
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>{isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}</Button>
        {isMobileMenuOpen && (
          <div className="absolute top-20 left-4 right-4 bg-white border border-border rounded-[2rem] shadow-2xl p-8 flex flex-col gap-6 lg:hidden">
            <button onClick={() => { onGetStarted(); setIsMobileMenuOpen(false); }} className="text-lg font-bold">Marketplace</button>
            <Button onClick={() => { onGetStarted(); setIsMobileMenuOpen(false); }} className="bg-primary text-primary-foreground h-14 rounded-full font-bold">Get Started</Button>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6 lg:px-20 relative z-10">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <Badge className="bg-primary/10 text-primary border-primary/20 mb-6 px-4 py-1 text-xs uppercase tracking-widest">The Future of Architecture</Badge>
            <h1 className="text-5xl md:text-7xl lg:text-9xl font-heading font-bold leading-[0.85] tracking-tighter mb-8">Design. <br />Verify. <br /><span className="text-primary">Build.</span></h1>
            <p className="text-lg lg:text-xl text-muted-foreground mb-10 max-w-lg">Architex connects clients with elite professionals through an AI-powered marketplace ensuring SANS 10400 compliance.</p>
            <div className="flex flex-wrap gap-4">
              <Button onClick={onGetStarted} size="lg" className="w-full sm:w-auto bg-primary text-primary-foreground h-16 px-10 rounded-full text-lg font-bold shadow-xl">Post a Job <ArrowRight className="ml-2" /></Button>
              <Button onClick={onGetStarted} variant="outline" size="lg" className="w-full sm:w-auto h-16 px-10 rounded-full text-lg font-bold">Browse Talent</Button>
            </div>
          </div>
          <div className="relative">
            <div className="aspect-square rounded-3xl overflow-hidden shadow-2xl border border-border bg-secondary/20 p-8 flex items-center justify-center">
              <Logo iconClassName="w-40 h-40 text-primary/40" />
            </div>
          </div>
        </div>
      </section>

      {/* Marketplace Preview */}
      <section className="py-20 bg-secondary/20 px-8 lg:px-20 relative z-10 border-y border-border">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-heading font-bold mb-12">Live Marketplace</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {jobs.map(job => (
              <Card key={job.id} className="h-full border-border hover:border-primary/50 transition-all group bg-white/50 backdrop-blur-sm rounded-3xl p-8">
                <div className="flex justify-between items-start mb-6">
                  <Badge variant="secondary" className="bg-primary/5 text-primary uppercase text-[10px] tracking-widest">{job.category}</Badge>
                  <span className="text-lg font-bold text-primary font-mono">R {job.budget.toLocaleString()}</span>
                </div>
                <CardTitle className="font-heading text-xl mb-4">{job.title}</CardTitle>
                <p className="text-sm text-muted-foreground line-clamp-3 mb-6">{job.description}</p>
                <Button onClick={onGetStarted} variant="ghost" className="w-full justify-between group/btn hover:bg-primary hover:text-primary-foreground rounded-xl">View Details <ArrowRight size={16} /></Button>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-secondary/50 py-20 px-8 lg:px-20 border-t border-border relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <Logo showText iconClassName="w-10 h-10 text-primary" textClassName="font-heading font-bold text-2xl lg:text-3xl" />
          <p className="text-sm text-muted-foreground">© 2026 Architex. South Africa's Premier Architectural Marketplace.</p>
        </div>
      </footer>
    </div>
  );
}
