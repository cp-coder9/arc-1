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
  updateProfile,
  sendEmailVerification
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
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

  const syncServerProfile = async (selectedRole: UserRole | null) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return null;

    const res = await fetch('/api/auth/check-admin', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: selectedRole || 'client', displayName, profileData: formData }),
    });

    if (!res.ok) {
      throw new Error('Failed to sync Firebase profile');
    }

    return res.json();
  };

  const handleGoogleLogin = async () => {
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
      await syncServerProfile(roleSelection);
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      
      if (!userDoc.exists()) {
        const newUser: UserProfile = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || 'Anonymous',
          role: roleSelection || 'client',
          ...formData,
          createdAt: new Date().toISOString(),
        };
        await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
        setUser(newUser);
        
      } else {
        setUser(userDoc.data() as UserProfile);
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
        await sendEmailVerification(firebaseUser);
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password);
        firebaseUser = result.user;
      }

      await syncServerProfile(roleSelection);
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
      toast.success(authMode === 'email-signup' ? "Account created. Verification email sent." : "Welcome back!");
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
                    <RoleSelectButton data-testid="role-select-client" role="client" label="Client" sub="I want to post jobs" icon={<Users className="w-8 h-8" />} active={roleSelection === 'client'} onClick={() => setRoleSelection('client')} />
                    <RoleSelectButton data-testid="role-select-architect" role="architect" label="Architect" sub="I want to find work" icon={<Briefcase className="w-8 h-8" />} active={roleSelection === 'architect'} onClick={() => setRoleSelection('architect')} />
                    <RoleSelectButton data-testid="role-select-admin" role="admin" label="Admin" sub="Platform Mgmt" icon={<ShieldCheck className="w-8 h-8" />} active={roleSelection === 'admin'} onClick={() => setRoleSelection('admin')} />
                    <RoleSelectButton data-testid="role-select-freelancer" role="freelancer" label="Freelancer" sub="Specialist" icon={<Sparkles className="w-8 h-8" />} active={roleSelection === 'freelancer'} onClick={() => setRoleSelection('freelancer')} />
                  </div>
                  <div className="space-y-3">
                    <Button onClick={handleGoogleLogin} className="w-full bg-primary text-primary-foreground h-14 text-lg font-medium shadow-lg" disabled={!roleSelection || isLoggingIn}>
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
                  <Button type="button" variant="outline" className="w-full h-12 rounded-xl" onClick={handleGoogleLogin} disabled={!roleSelection || isLoggingIn}>
                    {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign in with Google'}
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
    <div className="min-h-screen bg-[#FDFDFD] flex flex-col md:flex-row relative overflow-hidden">
      <AnimatedFloorPlan />
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white/90 backdrop-blur-md border-r border-border transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
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
      <main className="flex-1 flex flex-col min-w-0 relative z-10">
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

function RoleSelectButton({ role, label, sub, icon, active, onClick, ...props }: any) {
  return (
    <Button variant={active ? 'default' : 'outline'} className={`h-32 flex flex-col gap-3 transition-all ${active ? 'bg-primary text-primary-foreground border-primary scale-105 shadow-lg' : 'hover:border-primary/50'}`} onClick={onClick} {...props}>
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

  return (
    <div className="min-h-screen bg-[#FDFDFD] overflow-x-hidden relative">
      <AnimatedFloorPlan />
      <nav className="h-28 border-b border-border px-8 lg:px-20 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-md z-50">
        <Logo showText iconClassName="w-24 h-24 lg:w-28 lg:h-28 object-contain" textClassName="font-heading font-bold text-4xl lg:text-5xl tracking-tighter text-foreground" />
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
      <section className="pt-32 pb-20 px-6 lg:px-20 relative z-10 overflow-hidden">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center min-h-[680px] relative">
          <div className="pb-16 relative z-20">
            <Badge className="bg-primary/10 text-primary border-primary/20 mb-8 px-4 py-1 text-xs uppercase tracking-widest">Smarter projects. Stronger built environments.</Badge>
            <div className="space-y-3 mb-10">
              {[
                { word: 'Discover', icon: <Search size={42} /> },
                { word: 'Verify', icon: <ShieldCheck size={42} /> },
                { word: 'Collaborate', icon: <Users size={42} /> }
              ].map((item, index) => (
                <div key={item.word} className="hero-word-row flex items-center gap-5 border-b border-border pb-3 last:border-b-0 overflow-visible" style={{ animationDelay: `${index * 140}ms` }}>
                  <div className="h-20 w-20 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xl shadow-primary/20">
                    {item.icon}
                  </div>
                  <h1 className={`relative text-5xl md:text-7xl lg:text-8xl font-heading font-black leading-none tracking-[-0.07em] drop-shadow-sm ${item.word === 'Collaborate' ? 'text-primary' : 'text-foreground'}`}>
                    <span className="relative z-10">{item.word}</span>
                  </h1>
                </div>
              ))}
            </div>
            <p className="text-xl lg:text-2xl text-foreground mb-10 max-w-2xl leading-relaxed">
              Architex connects clients with elite professionals and contractors through an AI-powered marketplace for the built environment. Providing tailored management and resource sharing tools to deliver projects end-to-end.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button onClick={onGetStarted} size="lg" className="w-full sm:w-auto bg-primary text-primary-foreground h-16 px-10 rounded-full text-lg font-bold shadow-xl">Post a Job <ArrowRight className="ml-2" /></Button>
              <Button onClick={onGetStarted} variant="outline" size="lg" className="w-full sm:w-auto h-16 px-10 rounded-full text-lg font-bold bg-white/70">Browse Talent</Button>
            </div>
          </div>
          <div className="relative min-h-[560px] hidden lg:block">
            <div className="absolute inset-0 rounded-3xl overflow-hidden shadow-2xl border border-border bg-white/70 p-8 flex items-center justify-center">
              <Logo iconClassName="w-[28rem] h-[28rem] object-contain opacity-95" />
            </div>
            <div className="absolute right-0 top-12 w-[520px] h-[390px] bg-white/30 border border-primary/15 rounded-[2rem] overflow-hidden">
              <svg viewBox="0 0 520 400" className="absolute inset-0 w-full h-full text-primary/40" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M80 330V155l115-60 170 85v150M195 95v235M365 180v150M80 155l285 25M80 205l285 25M80 255l285 25M115 315h285M115 285h285M115 255h285M115 225h285" />
                <path d="M195 95l170 85 75-45-170-85-75 45ZM365 180l75-45v145l-75 50" />
                <circle cx="80" cy="155" r="3" fill="currentColor" /><circle cx="195" cy="95" r="3" fill="currentColor" /><circle cx="365" cy="180" r="3" fill="currentColor" /><circle cx="440" cy="135" r="3" fill="currentColor" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* Marketplace Preview */}
      <section className="py-12 bg-secondary/20 px-8 lg:px-20 relative z-10 border-y border-border">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              ['AI-Powered Intelligence', 'SANS 10400 compliance checks for drawings and collaborative design workflows.'],
              ['Built for the Built Environment', 'Purpose-built tools for every project stage.'],
              ['Connected Ecosystem', 'Clients, professionals, and contractors working as one.']
            ].map(([title, copy]) => (
              <div key={title} className="rounded-3xl border border-border bg-white/50 backdrop-blur-sm p-8">
                <h2 className="text-lg font-black uppercase tracking-wide mb-3">{title}</h2>
                <p className="text-muted-foreground leading-relaxed max-w-sm">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-secondary/50 py-20 px-8 lg:px-20 border-t border-border relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <Logo showText iconClassName="w-16 h-16 object-contain" textClassName="font-heading font-bold text-2xl lg:text-3xl" />
          <p className="text-sm text-muted-foreground">© 2026 Architex. South Africa's Premier Architectural Marketplace.</p>
        </div>
      </footer>
    </div>
  );
}
