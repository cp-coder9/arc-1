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
import { doc, getDoc, setDoc, collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { UserProfile, UserRole, Job, JobCategory } from './types';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { ScrollArea } from './components/ui/scroll-area';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
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
  Building2,
  BookOpen,
  Bot,
  Workflow,
  Files,
  ClipboardCheck,
  Network,
  Hammer,
  Download,
  Lightbulb,
  Database
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
  const isAdminRoute = window.location.pathname === '/admin';
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [roleSelection, setRoleSelection] = useState<UserRole | null>(isAdminRoute ? 'admin' : null);
  const [showLogin, setShowLogin] = useState(isAdminRoute);
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
    if (isAdminRoute) {
      setRoleSelection('admin');
      setShowLogin(true);
      setShowOnboarding(false);
    }
  }, [isAdminRoute]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setProfileLoading(true);
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const profile = userDoc.data() as UserProfile;
            if (isAdminRoute && profile.role !== 'admin') {
              await signOut(auth);
              setUser(null);
              toast.error('Admin access only. Please use an authorized admin account.');
            } else {
              setUser(profile);
            }
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
  }, [isAdminRoute]);

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

  const ensureAdminAccess = async (firebaseUser: any) => {
    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
    const profile = userDoc.exists() ? userDoc.data() as UserProfile : null;

    if (isAdminRoute && profile?.role !== 'admin') {
      await signOut(auth);
      setUser(null);
      toast.error('Admin access only. Please use an authorized admin account.');
      return null;
    }

    return profile;
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
      const profile = await ensureAdminAccess(firebaseUser);
      if (isAdminRoute && !profile) return;
      
      if (!profile) {
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
        setUser(profile);
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
      const profile = await ensureAdminAccess(firebaseUser);
      if (isAdminRoute && !profile) return;
      if (!profile) {
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
        setUser(profile);
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
      setShowLogin(isAdminRoute);
      setAuthMode('selection');
      setRoleSelection(isAdminRoute ? 'admin' : null);
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

  if (!user && isAdminRoute) {
    return (
      <AdminLoginPage
        authMode={authMode}
        email={email}
        password={password}
        isLoggingIn={isLoggingIn}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onEmailSubmit={handleEmailAuth}
        onGoogleLogin={handleGoogleLogin}
        onAuthModeChange={setAuthMode}
      />
    );
  }

  if (!user && !showLogin) {
    return <LandingPage onGetStarted={() => setShowOnboarding(true)} onLogin={() => setShowLogin(true)} />;
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
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white/90 backdrop-blur-md border-r border-border transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-10 shrink-0">
            <Logo showText iconClassName="w-10 h-10 text-primary" textClassName="font-heading font-bold text-2xl tracking-tighter" />
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsSidebarOpen(false)}><X size={20} /></Button>
          </div>

          <nav className="flex-1 space-y-2">
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

          <div className="pt-6 mt-auto border-t border-border shrink-0">
            <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-xl h-12" onClick={handleLogout}>
              <LogOut size={20} /> <span className="font-bold">Logout</span>
            </Button>
          </div>
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

function AdminLoginPage({
  authMode,
  email,
  password,
  isLoggingIn,
  onEmailChange,
  onPasswordChange,
  onEmailSubmit,
  onGoogleLogin,
  onAuthModeChange,
}: {
  authMode: 'selection' | 'email-login' | 'email-signup';
  email: string;
  password: string;
  isLoggingIn: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onEmailSubmit: (event: React.FormEvent) => void;
  onGoogleLogin: () => void;
  onAuthModeChange: (mode: 'selection' | 'email-login' | 'email-signup') => void;
}) {
  const isEmailLogin = authMode === 'email-login';

  return (
    <div className="min-h-screen bg-[#0F172A] text-white flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-20">
        <AnimatedFloorPlan />
      </div>
      <div className="max-w-md w-full relative z-10">
        <div className="text-center mb-8">
          <div className="mx-auto mb-5 h-20 w-20 rounded-3xl bg-white/10 border border-white/20 flex items-center justify-center shadow-2xl">
            <ShieldCheck className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-4xl font-heading font-bold mb-2">Admin Portal</h1>
          <p className="text-sm text-white/60 uppercase tracking-widest">Authorized Architex administrators only</p>
        </div>

        <Card className="border-white/10 shadow-2xl bg-white/95 text-foreground backdrop-blur-md">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Secure Admin Login</CardTitle>
            <CardDescription>
              Sign in with an approved administrator account to continue.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {isEmailLogin ? (
              <form onSubmit={onEmailSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Admin Email</label>
                  <Input type="email" placeholder="admin@example.com" value={email} onChange={e => onEmailChange(e.target.value)} required className="h-12 rounded-xl" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Password</label>
                  <Input type="password" placeholder="••••••••" value={password} onChange={e => onPasswordChange(e.target.value)} required className="h-12 rounded-xl" />
                </div>
                <Button type="submit" className="w-full bg-primary text-primary-foreground h-14 text-lg font-medium rounded-xl shadow-lg" disabled={isLoggingIn}>
                  {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Login to Admin Portal'}
                </Button>
                <Button type="button" variant="ghost" className="w-full text-muted-foreground" onClick={() => onAuthModeChange('selection')}>
                  Back to admin sign-in options
                </Button>
              </form>
            ) : (
              <div className="space-y-3">
                <Button onClick={onGoogleLogin} className="w-full bg-primary text-primary-foreground h-14 text-lg font-medium shadow-lg rounded-xl" disabled={isLoggingIn}>
                  {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign in with Google'}
                </Button>
                <Button variant="outline" className="w-full h-12 rounded-xl" onClick={() => onAuthModeChange('email-login')} disabled={isLoggingIn}>
                  Login with Email
                </Button>
              </div>
            )}
            <Button variant="link" asChild className="w-full text-muted-foreground">
              <a href="/">Return to Marketplace</a>
            </Button>
          </CardContent>
        </Card>
      </div>
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

function LandingPage({ onGetStarted, onLogin }: { onGetStarted: () => void; onLogin: () => void }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [landingTab, setLandingTab] = useState<'home' | 'resources'>('home');
  const [liveJobs, setLiveJobs] = useState<Job[]>([]);
  const prefersReducedMotion = useReducedMotion();
  const fadeUp = prefersReducedMotion ? {} : { opacity: 0, y: 24 };
  const visible = { opacity: 1, y: 0 };

  const goToTab = (tab: 'home' | 'resources') => {
    setLandingTab(tab);
    setIsMobileMenuOpen(false);
  };

  useEffect(() => {
    const q = query(
      collection(db, 'jobs'),
      where('status', '==', 'open'),
      orderBy('createdAt', 'desc'),
      limit(3)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLiveJobs(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Job)));
    }, (error) => {
      console.error('Error loading live marketplace preview:', error);
      setLiveJobs([]);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden relative text-foreground">
      <AnimatedFloorPlan />
      <nav className="h-20 sm:h-24 lg:h-28 border-b border-border px-4 sm:px-8 lg:px-20 flex items-center justify-between sticky top-0 bg-card/95 backdrop-blur-md z-50 shadow-sm">
        <Logo showText iconClassName="w-16 h-16 sm:w-20 sm:h-20 lg:w-28 lg:h-28 object-contain" textClassName="font-heading font-bold text-2xl sm:text-3xl lg:text-5xl tracking-tighter text-foreground" />
        <div className="hidden lg:flex items-center gap-6">
          <button onClick={() => goToTab('home')} className={`text-sm font-bold underline-offset-4 hover:underline ${landingTab === 'home' ? 'text-primary' : 'text-foreground/80 hover:text-primary'}`}>Home</button>
          <button onClick={() => goToTab('resources')} className={`text-sm font-bold underline-offset-4 hover:underline ${landingTab === 'resources' ? 'text-primary' : 'text-foreground/80 hover:text-primary'}`}>Resources</button>
          <button onClick={onGetStarted} className="text-sm font-bold text-foreground/80 hover:text-primary underline-offset-4 hover:underline">Marketplace</button>
          <button onClick={onLogin} className="text-sm font-bold text-foreground/80 hover:text-primary underline-offset-4 hover:underline">Login</button>
          <Button onClick={onGetStarted} className="bg-primary text-primary-foreground px-6 rounded-full font-bold">Get Started</Button>
        </div>
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} aria-label="Toggle navigation menu" aria-expanded={isMobileMenuOpen}>{isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}</Button>
        {isMobileMenuOpen && (
          <div className="absolute top-20 left-3 right-3 bg-card border border-border rounded-[1.5rem] shadow-2xl p-5 sm:p-8 flex flex-col gap-5 sm:gap-6 lg:hidden">
            <button onClick={() => goToTab('home')} className="text-lg font-bold hover:text-primary underline-offset-4 hover:underline">Home</button>
            <button onClick={() => goToTab('resources')} className="text-lg font-bold hover:text-primary underline-offset-4 hover:underline">Resources</button>
            <button onClick={() => { onGetStarted(); setIsMobileMenuOpen(false); }} className="text-lg font-bold hover:text-primary underline-offset-4 hover:underline">Marketplace</button>
            <button onClick={() => { onLogin(); setIsMobileMenuOpen(false); }} className="text-lg font-bold hover:text-primary underline-offset-4 hover:underline">Login</button>
            <Button onClick={() => { onGetStarted(); setIsMobileMenuOpen(false); }} className="bg-primary text-primary-foreground h-14 rounded-full font-bold">Get Started</Button>
          </div>
        )}
      </nav>

      <AnimatePresence mode="wait">
        {landingTab === 'resources' ? (
          <motion.div
            key="resources"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -18 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <ResourcesLanding onGetStarted={onGetStarted} />
          </motion.div>
        ) : (
          <motion.div
            key="home"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -18 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >

      {/* Hero Section */}
      <section className="pt-16 sm:pt-24 lg:pt-32 pb-14 sm:pb-20 px-4 sm:px-6 lg:px-20 relative z-10 overflow-hidden bg-card">
        <div className="max-w-7xl mx-auto min-h-[auto] lg:min-h-[680px] relative">
          <motion.div
            initial={fadeUp}
            animate={visible}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="pb-16 relative z-20 max-w-4xl"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <Badge className="bg-primary/10 text-primary border-primary/20 mb-6 sm:mb-8 px-3 sm:px-4 py-1 text-[10px] sm:text-xs uppercase tracking-widest">Smarter projects. Stronger built environments.</Badge>
            </motion.div>
            <div className="space-y-2 sm:space-y-3 mb-8 sm:mb-10">
              {[
                { word: 'Discover', icon: <Search size={42} /> },
                { word: 'Verify', icon: <ShieldCheck size={42} /> },
                { word: 'Collaborate', icon: <Users size={42} /> }
              ].map((item, index) => (
                <motion.div
                  key={item.word}
                  initial={{ opacity: 0, x: -40 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.15 }}
                  viewport={{ once: true }}
                  className="hero-word-row flex items-center gap-3 sm:gap-5 border-b border-border pb-3 last:border-b-0 overflow-visible"
                >
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    className="h-12 w-12 sm:h-16 sm:w-16 lg:h-20 lg:w-20 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xl shadow-primary/20 [&>svg]:h-6 [&>svg]:w-6 sm:[&>svg]:h-8 sm:[&>svg]:w-8 lg:[&>svg]:h-[42px] lg:[&>svg]:w-[42px]"
                  >
                    {item.icon}
                  </motion.div>
                  <h1 className={`relative text-4xl min-[380px]:text-5xl md:text-7xl lg:text-8xl font-heading font-black leading-none tracking-[-0.07em] drop-shadow-sm break-words ${item.word === 'Collaborate' ? 'text-primary' : 'text-foreground'}`}>
                    <span className="relative z-10">{item.word}</span>
                  </h1>
                </motion.div>
              ))}
            </div>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              viewport={{ once: true }}
              className="text-base sm:text-xl lg:text-2xl text-muted-foreground mb-8 sm:mb-10 max-w-2xl leading-relaxed font-medium"
            >
              Architex connects clients with elite professionals and contractors through an AI-powered marketplace for the built environment. Providing tailored management and resource sharing tools to deliver projects end-to-end.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.45 }}
              viewport={{ once: true }}
              className="flex flex-wrap gap-3 sm:gap-4"
            >
              <Button onClick={onGetStarted} size="lg" className="w-full sm:w-auto bg-primary text-primary-foreground h-14 sm:h-16 px-8 sm:px-10 rounded-full text-base sm:text-lg font-bold shadow-xl hover:bg-primary-dark transition-colors">Post a Job <ArrowRight className="ml-2" /></Button>
              <Button onClick={onGetStarted} variant="outline" size="lg" className="w-full sm:w-auto h-14 sm:h-16 px-8 sm:px-10 rounded-full text-base sm:text-lg font-bold bg-card text-foreground border-border hover:bg-accent transition-colors">Browse Talent</Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <ServicesInfographic prefersReducedMotion={Boolean(prefersReducedMotion)} onGetStarted={onGetStarted} />

      {/* Marketplace Preview */}
      <section className="py-12 bg-secondary px-4 sm:px-8 lg:px-20 relative z-10 border-y border-border">
        <div className="max-w-7xl mx-auto">
          <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <Badge className="mb-4 bg-primary/10 text-primary border-primary/20 uppercase tracking-widest">Live Marketplace</Badge>
              <h2 className="text-3xl md:text-5xl font-heading font-black tracking-tight text-foreground">Current open projects</h2>
              <p className="mt-3 max-w-2xl text-muted-foreground font-medium">Browse live opportunities from clients looking for built-environment professionals.</p>
            </div>
            <Button onClick={onGetStarted} variant="outline" className="rounded-full font-bold">View Marketplace <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {(liveJobs.length > 0 ? liveJobs : [
              { id: 'sample-1', title: 'Residential renovation concept', category: 'Residential', location: 'Cape Town', budget: 85000, deadline: 'Open brief', description: 'Kitchen and living area redesign with council-ready documentation.' },
              { id: 'sample-2', title: 'Retail fit-out documentation', category: 'Commercial', location: 'Johannesburg', budget: 140000, deadline: 'Open brief', description: 'Technical drawing package for a small retail interior fit-out.' },
              { id: 'sample-3', title: 'New home compliance review', category: 'Residential', location: 'Pretoria', budget: 65000, deadline: 'Open brief', description: 'Plan review and compliance support before municipal submission.' }
            ] as Partial<Job>[]).map((job) => (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                viewport={{ once: true }}
                className="rounded-3xl border border-border bg-card p-6 shadow-sm hover:shadow-lg transition-shadow flex flex-col min-h-[260px]"
              >
                <div className="flex items-center justify-between gap-3 mb-5">
                  <Badge variant="secondary" className="uppercase text-[10px] tracking-widest">{job.category || 'Project'}</Badge>
                  <span className="text-sm font-bold text-primary font-mono">R {(job.budget || 0).toLocaleString()}</span>
                </div>
                <h3 className="text-xl font-heading font-black text-foreground mb-3">{job.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 mb-6">{job.description}</p>
                <div className="mt-auto flex items-center justify-between border-t border-border pt-4 text-[10px] uppercase font-bold text-muted-foreground">
                  <span className="flex items-center gap-1"><MapPin size={12} /> {job.location || 'South Africa'}</span>
                  <span className="flex items-center gap-1"><Clock size={12} /> {job.deadline || 'Open'}</span>
                </div>
              </motion.div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              ['AI-Powered Intelligence', 'SANS 10400 compliance checks for drawings and collaborative design workflows.'],
              ['Built for the Built Environment', 'Purpose-built tools for every project stage.'],
              ['Connected Ecosystem', 'Clients, professionals, and contractors working as one.']
            ].map(([title, copy], idx) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: idx * 0.1 }}
                viewport={{ once: true }}
                className="rounded-3xl border border-border bg-card p-8 shadow-sm hover:shadow-md transition-shadow"
              >
                <h2 className="text-lg font-black uppercase tracking-wide mb-3 text-foreground">{title}</h2>
                <p className="text-muted-foreground leading-relaxed max-w-sm font-medium">{copy}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

          </motion.div>
        )}
      </AnimatePresence>

      <footer className="bg-card py-12 sm:py-16 lg:py-20 px-4 sm:px-8 lg:px-20 border-t border-border relative z-10 text-foreground">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center text-center md:text-left gap-6 sm:gap-8">
          <Logo showText iconClassName="w-14 h-14 sm:w-16 sm:h-16 object-contain" textClassName="font-heading font-bold text-xl sm:text-2xl lg:text-3xl" />
          <p className="text-xs sm:text-sm text-muted-foreground">© 2026 Architex. South Africa's Premier Architectural Marketplace.</p>
        </div>
      </footer>
    </div>
  );
}

function ServicesInfographic({ prefersReducedMotion, onGetStarted }: { prefersReducedMotion: boolean; onGetStarted: () => void }) {
  const services = [
    { title: 'Client Brief', copy: 'Capture scope, budget, site context, and project goals.', icon: <FileText size={22} /> },
    { title: 'Smart Matching', copy: 'Connect with architects, freelancers, and contractors.', icon: <Network size={22} /> },
    { title: 'AI Automation', copy: 'Orchestrated agents review drawings, risks, and next actions.', icon: <Bot size={22} /> },
    { title: 'SANS Compliance', copy: 'Automated checks for walls, fenestration, fire, and area rules.', icon: <ClipboardCheck size={22} /> },
    { title: 'Resource Sharing', copy: 'Centralise documents, knowledge, files, and project evidence.', icon: <Files size={22} /> },
    { title: 'Delivery', copy: 'Move from concept to municipal-ready submission workflows.', icon: <Hammer size={22} /> },
  ];

  return (
    <section className="py-16 sm:py-20 lg:py-24 px-4 sm:px-6 lg:px-20 relative z-10 bg-[linear-gradient(135deg,#021817_0%,#04302c_54%,#0f6b62_100%)] text-primary-foreground overflow-hidden">
      <div aria-hidden="true" className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_20%_20%,white,transparent_24%),radial-gradient(circle_at_80%_70%,white,transparent_20%)]" />
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="mb-10 sm:mb-14 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge className="mb-5 bg-white/10 text-white border-white/20 uppercase tracking-widest text-[10px] sm:text-xs">Animated platform map</Badge>
            <h2 className="text-3xl sm:text-4xl md:text-6xl font-heading font-black tracking-tight max-w-3xl">All services, AI automation, and delivery workflows in one connected hub.</h2>
          </div>
          <Button onClick={onGetStarted} variant="outline" className="w-full sm:w-auto rounded-full h-14 px-8 bg-white/10 border-white/25 text-white hover:bg-white hover:text-primary font-bold">
            Start a project <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px_1fr] gap-5 sm:gap-6 items-center">
          <div className="grid gap-5">
            {services.slice(0, 3).map((service, index) => <ServiceNode key={service.title} service={service} index={index} />)}
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            whileInView={{ opacity: 1, scale: 1 }}
            animate={prefersReducedMotion ? undefined : { boxShadow: ['0 0 0 rgba(255,255,255,0.10)', '0 0 70px rgba(255,255,255,0.28)', '0 0 0 rgba(255,255,255,0.10)'] }}
            transition={{ duration: 2.8, repeat: prefersReducedMotion ? 0 : Infinity, ease: 'easeInOut' }}
            viewport={{ once: true }}
            className="relative mx-auto my-4 sm:my-6 lg:my-0 h-64 w-64 sm:h-80 sm:w-80 rounded-full border border-white/20 bg-white/10 backdrop-blur-md flex items-center justify-center shadow-2xl"
          >
            <div className="absolute inset-8 rounded-full border border-dashed border-white/30 animate-spin-slow" />
            <div className="absolute inset-16 rounded-full bg-primary-dark/80 border border-white/20" />
            <div className="relative z-10 text-center px-10">
              <div className="mx-auto mb-4 h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-white text-primary flex items-center justify-center shadow-xl">
                <Workflow className="h-8 w-8 sm:h-[34px] sm:w-[34px]" />
              </div>
              <h3 className="font-heading text-2xl sm:text-3xl font-black">Architex AI</h3>
              <p className="mt-2 text-xs sm:text-sm text-white/75 font-medium">Multi-agent automation coordinates compliance, marketplace, files, teams, and project intelligence.</p>
            </div>
          </motion.div>

          <div className="grid gap-5">
            {services.slice(3).map((service, index) => <ServiceNode key={service.title} service={service} index={index + 3} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

type ServiceNodeProps = {
  service: { title: string; copy: string; icon: React.ReactNode };
  index: number;
};

function ServiceNode({ service, index }: React.PropsWithChildren<ServiceNodeProps>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: index * 0.08 }}
      viewport={{ once: true }}
      className="group rounded-[1.5rem] sm:rounded-[2rem] border border-white/15 bg-white/10 p-4 sm:p-5 backdrop-blur-md hover:bg-white/15 transition-colors"
    >
      <div className="flex gap-3 sm:gap-4">
        <div className="h-11 w-11 sm:h-12 sm:w-12 shrink-0 rounded-2xl bg-white text-primary flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
          {service.icon}
        </div>
        <div>
          <h3 className="font-heading text-lg sm:text-xl font-black">{service.title}</h3>
          <p className="mt-1 text-xs sm:text-sm text-white/75 leading-relaxed font-medium">{service.copy}</p>
        </div>
      </div>
    </motion.div>
  );
}

function ResourcesLanding({ onGetStarted }: { onGetStarted: () => void }) {
  const resources = [
    { title: 'SANS 10400 Readiness Guide', copy: 'Understand the checks Architex AI performs across walls, fire, fenestration, area sizing, and documentation.', icon: <BookOpen size={24} />, tag: 'Compliance' },
    { title: 'Client Briefing Template', copy: 'Prepare scope, site details, inspiration, budget, and timeline before posting your project.', icon: <FileText size={24} />, tag: 'Clients' },
    { title: 'AI Review Checklist', copy: 'A practical list for title blocks, north points, scale bars, room schedules, and municipal submission basics.', icon: <ClipboardCheck size={24} />, tag: 'AI Automation' },
    { title: 'Professional Onboarding', copy: 'Guidance for architects and freelancers setting up verified marketplace profiles.', icon: <Users size={24} />, tag: 'Professionals' },
    { title: 'Resource Library Workflow', copy: 'Learn how shared files, knowledge sources, and project evidence support faster decisions.', icon: <Database size={24} />, tag: 'Knowledge' },
    { title: 'Project Delivery Playbook', copy: 'Coordinate teams from concept to approval using payments, files, reviews, and audit trails.', icon: <Lightbulb size={24} />, tag: 'Delivery' },
  ];

  return (
    <main className="relative z-10 bg-background">
      <section className="px-4 sm:px-6 lg:px-20 py-16 sm:py-20 lg:py-24 bg-card border-b border-border overflow-hidden relative">
        <div aria-hidden="true" className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="max-w-7xl mx-auto relative z-10 grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-12 items-center">
          <div>
            <Badge className="mb-5 sm:mb-6 bg-primary/10 text-primary border-primary/20 uppercase tracking-widest text-[10px] sm:text-xs">Resources</Badge>
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-heading font-black tracking-[-0.06em] leading-none">Practical tools for smarter built-environment projects.</h1>
            <p className="mt-6 sm:mt-8 text-base sm:text-xl text-muted-foreground leading-relaxed font-medium max-w-2xl">Use these guides and templates to brief clearly, prepare compliant drawings, understand AI automation, and move faster from idea to approved project.</p>
            <div className="mt-8 sm:mt-10 flex flex-wrap gap-3 sm:gap-4">
              <Button onClick={onGetStarted} size="lg" className="w-full sm:w-auto h-14 px-8 rounded-full bg-primary text-primary-foreground font-bold">Use the marketplace <ArrowRight className="ml-2 h-4 w-4" /></Button>
              <Button variant="outline" size="lg" className="w-full sm:w-auto h-14 px-8 rounded-full font-bold">Browse guides</Button>
            </div>
          </div>
          <div className="rounded-[2rem] sm:rounded-[2.5rem] border border-primary/15 bg-primary/5 p-4 sm:p-8 shadow-xl">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {['Brief', 'Match', 'Review', 'Submit'].map((step, index) => (
                <motion.div key={step} initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} transition={{ delay: index * 0.08 }} viewport={{ once: true }} className="rounded-2xl sm:rounded-3xl bg-card border border-border p-4 sm:p-6">
                  <span className="text-xs font-black text-primary font-mono">0{index + 1}</span>
                  <p className="mt-6 sm:mt-8 font-heading text-xl sm:text-2xl font-black">{step}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6 lg:px-20 py-14 sm:py-20 bg-secondary border-b border-border">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {resources.map((resource, index) => (
            <motion.article key={resource.title} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: index * 0.06 }} viewport={{ once: true }} className="rounded-[1.5rem] sm:rounded-[2rem] border border-border bg-card p-5 sm:p-7 shadow-sm hover:shadow-lg hover:border-primary/25 transition-all">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">{resource.icon}</div>
                <Badge variant="secondary" className="uppercase text-[10px] tracking-widest">{resource.tag}</Badge>
              </div>
              <h2 className="text-2xl font-heading font-black mb-3">{resource.title}</h2>
              <p className="text-muted-foreground leading-relaxed font-medium mb-6">{resource.copy}</p>
              <button className="inline-flex items-center gap-2 text-sm font-black text-primary hover:underline underline-offset-4">
                View resource <Download size={14} />
              </button>
            </motion.article>
          ))}
        </div>
      </section>
    </main>
  );
}
