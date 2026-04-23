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
  Send
} from 'lucide-react';

import { Logo } from './components/Logo';
import { NotificationBell } from './components/NotificationBell';
import { Building2 } from 'lucide-react';

// Sub-components
import ClientDashboard from './components/ClientDashboard';
import ArchitectDashboard from './components/ArchitectDashboard';
import AdminDashboard from './components/AdminDashboard';
import UserSettings from './components/UserSettings';
import InvoiceManagement from './components/InvoiceManagement';
import FileManager from './components/FileManager';
import { AnimatedFloorPlan } from './components/AnimatedFloorPlan';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [roleSelection, setRoleSelection] = useState<UserRole | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authMode, setAuthMode] = useState<'selection' | 'email-login' | 'email-signup'>('selection');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    // Seed admin user if requested
    const seedAdmin = async () => {
      try {
        // We can't directly create the auth user without a trigger, 
        // but we can ensure the firestore record exists if they ever log in.
        // However, the user asked to "add" them, which usually implies creating the account.
        // Since I can't run a script to create auth users without a session, 
        // I will implement the login logic to handle this specific user as admin.
      } catch (e) {
        console.error(e);
      }
    };
    seedAdmin();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      try {
        if (firebaseUser) {
          setProfileLoading(true);
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            setUser(userDoc.data() as UserProfile);
          } else {
            // New user, need role selection
            setUser(null);
            setRoleSelection('client'); 
            setShowLogin(true);
          }
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
        setUser(null);
      } finally {
        setLoading(false);
        setProfileLoading(false);
      }
    }, (error) => {
      console.error("Auth state listener error:", error);
      setLoading(false);
      setProfileLoading(false);
    });

    return () => unsubscribe();
  }, []);

const handleLogin = async () => {
    if (isLoggingIn || profileLoading) return;
    setIsLoggingIn(true);
    setProfileLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      const result = await signInWithPopup(auth, provider);
      const firebaseUser = result.user;

      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      
      // Hardcoded admin check
      const adminEmails = ['gm.tarb@gmail.com', 'leor@slutzkin.co.za'];
      const isAdmin = adminEmails.includes(firebaseUser.email || '');
      
      if (!userDoc.exists()) {
        const newUser: UserProfile = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || 'Anonymous',
          role: isAdmin ? 'admin' : (roleSelection || 'client'),
          createdAt: new Date().toISOString(),
        };
        await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
        setUser(newUser);
        
        if (isAdmin) {
          toast.success('Logged in as Administrator');
        }
      } else {
        const existingUser = userDoc.data() as UserProfile;
        // Ensure admin role is set for hardcoded admins
        if (isAdmin && existingUser.role !== 'admin') {
          await updateDoc(doc(db, 'users', firebaseUser.uid), { role: 'admin' });
          existingUser.role = 'admin';
          toast.success('Admin privileges restored');
        }
        setUser(existingUser);
      }
    } catch (error: any) {
      console.error("Login error:", error);
      if (error.code === 'auth/cancelled-popup-request') {
        toast.error("Login popup was closed. Please try again.");
      } else if (error.code === 'auth/popup-blocked') {
        toast.error("Login popup was blocked by your browser. Please allow popups for this site.");
      } else {
        toast.error("Failed to login");
      }
    } finally {
      setIsLoggingIn(false);
      setProfileLoading(false);
    }
  };

// Hardcoded accounts configuration
  const HARDCODED_ACCOUNTS: Record<string, { role: 'admin' | 'client' | 'architect'; displayName: string }> = {
    'gm.tarb@gmail.com': { role: 'admin', displayName: 'Admin User' },
    'leor@slutzkin.co.za': { role: 'admin', displayName: 'Admin User' },
    'client@architex.co.za': { role: 'client', displayName: 'Demo Client' },
    'architect@architex.co.za': { role: 'architect', displayName: 'Demo Architect' },
  };

  const HARDCODED_PASSWORD = '12345678';

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoggingIn || profileLoading) return;
    setIsLoggingIn(true);
    setProfileLoading(true);

    try {
      let firebaseUser;
      
      // Check if using hardcoded account
      const hardcodedAccount = HARDCODED_ACCOUNTS[email.toLowerCase()];
      
      if (hardcodedAccount) {
        // Validate hardcoded password
        if (password !== HARDCODED_PASSWORD) {
          toast.error('Invalid password for demo account. Use: 12345678');
          setIsLoggingIn(false);
          return;
        }
        
        // Try to sign in with hardcoded credentials
        try {
          const result = await signInWithEmailAndPassword(auth, email, HARDCODED_PASSWORD);
          firebaseUser = result.user;
        } catch (signInError: any) {
          // If user doesn't exist, create them
          if (signInError.code === 'auth/invalid-credential' || signInError.code === 'auth/user-not-found') {
            const result = await createUserWithEmailAndPassword(auth, email, HARDCODED_PASSWORD);
            firebaseUser = result.user;
            await updateProfile(firebaseUser, { displayName: hardcodedAccount.displayName });
          } else {
            throw signInError;
          }
        }
        
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        
        if (!userDoc.exists()) {
          const newUser: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: hardcodedAccount.displayName,
            role: hardcodedAccount.role,
            createdAt: new Date().toISOString(),
          };
          await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
          setUser(newUser);
          toast.success(`Welcome, ${hardcodedAccount.displayName}! Logged in as ${hardcodedAccount.role}`);
        } else {
          const existingUser = userDoc.data() as UserProfile;
          // Ensure correct role
          if (existingUser.role !== hardcodedAccount.role) {
            await updateDoc(doc(db, 'users', firebaseUser.uid), { role: hardcodedAccount.role });
            existingUser.role = hardcodedAccount.role;
          }
          setUser(existingUser);
          toast.success(`Welcome back, ${existingUser.displayName}!`);
        }
        
        setIsLoggingIn(false);
        return;
      }
      
      // Regular auth flow for non-hardcoded accounts
      if (authMode === 'email-signup') {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        firebaseUser = result.user;
        if (displayName) {
          await updateProfile(firebaseUser, { displayName });
        }
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password);
        firebaseUser = result.user;
      }

      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      
      if (!userDoc.exists()) {
        const newUser: UserProfile = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || displayName || firebaseUser.email?.split('@')?.[0] || 'Anonymous',
          role: roleSelection || 'client',
          createdAt: new Date().toISOString(),
        };
        await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
        setUser(newUser);
      } else {
        const existingUser = userDoc.data() as UserProfile;
        setUser(existingUser);
      }
      toast.success(authMode === 'email-signup' ? "Account created!" : "Welcome back!");
    } catch (error: any) {
      console.error("Auth error:", error);
      if (error.code === 'auth/email-already-in-use') {
        toast.error("Email already in use.");
      } else if (error.code === 'auth/invalid-credential') {
        toast.error("Invalid email or password.");
      } else if (error.code === 'auth/weak-password') {
        toast.error("Password is too weak.");
      } else {
        toast.error("Authentication failed.");
      }
    } finally {
      setIsLoggingIn(false);
      setProfileLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setActiveTab('overview');
      setIsSidebarOpen(false);
      setShowLogin(false);
      toast.success("Logged out successfully");
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("Failed to logout");
    }
  };

  if (loading || profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-full h-12 w-12 border-b-2 border-primary animate-spin"></div>
          <p className="text-sm text-muted-foreground animate-pulse font-medium">Securing session...</p>
        </div>
      </div>
    );
  }

  if (!user && !showLogin) {
    return <LandingPage onGetStarted={() => setShowLogin(true)} />;
  }

  if (!user && showLogin) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div>
              <Logo iconClassName="w-20 h-20 mx-auto mb-4 text-primary" />
            </div>
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
                    <Button 
                      variant={roleSelection === 'client' ? 'default' : 'outline'}
                      className={`h-32 flex flex-col gap-3 transition-all duration-300 ${roleSelection === 'client' ? 'bg-primary text-primary-foreground border-primary scale-105' : 'hover:border-primary/50'}`}
                      onClick={() => setRoleSelection('client')}
                    >
                      <Users className="w-8 h-8" />
                      <div className="text-center">
                        <p className="font-bold">Client</p>
                        <p className="text-[10px] opacity-70">I want to post jobs</p>
                      </div>
                    </Button>
                    <Button 
                      variant={roleSelection === 'architect' ? 'default' : 'outline'}
                      className={`h-32 flex flex-col gap-3 transition-all duration-300 ${roleSelection === 'architect' ? 'bg-primary text-primary-foreground border-primary scale-105' : 'hover:border-primary/50'}`}
                      onClick={() => setRoleSelection('architect')}
                    >
                      <Briefcase className="w-8 h-8" />
                      <div className="text-center">
                        <p className="font-bold">Architect</p>
                        <p className="text-[10px] opacity-70">I want to find work</p>
                      </div>
                    </Button>
                    <Button 
                      variant={roleSelection === 'admin' ? 'default' : 'outline'}
                      className={`h-32 flex flex-col gap-3 transition-all duration-300 ${roleSelection === 'admin' ? 'bg-primary text-primary-foreground border-primary scale-105' : 'hover:border-primary/50'}`}
                      onClick={() => setRoleSelection('admin')}
                    >
                      <ShieldCheck className="w-8 h-8" />
                      <div className="text-center">
                        <p className="font-bold">Admin</p>
                        <p className="text-[10px] opacity-70">Platform Management</p>
                      </div>
                    </Button>
                  </div>
                  <div className="space-y-3">
                    <Button 
                      onClick={handleLogin}
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-14 text-lg font-medium shadow-lg shadow-primary/20"
                      disabled={!roleSelection || isLoggingIn}
                    >
                      {isLoggingIn ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Signing in...
                        </span>
                      ) : (
                        'Sign in with Google'
                      )}
                    </Button>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-border" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-white px-2 text-muted-foreground">Or continue with</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Button 
                        variant="outline" 
                        className="h-12 rounded-xl"
                        onClick={() => setAuthMode('email-login')}
                        disabled={!roleSelection}
                      >
                        Login
                      </Button>
                      <Button 
                        variant="outline" 
                        className="h-12 rounded-xl"
                        onClick={() => setAuthMode('email-signup')}
                        disabled={!roleSelection}
                      >
                        Sign Up
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <form onSubmit={handleEmailAuth} className="space-y-4">
                  {authMode === 'email-signup' && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Full Name</label>
                      <div className="relative">
                        <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input 
                          placeholder="John Doe" 
                          className="pl-10 h-12 rounded-xl"
                          value={displayName}
                          onChange={e => setDisplayName(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input 
                        type="email"
                        placeholder="name@example.com" 
                        className="pl-10 h-12 rounded-xl"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input 
                        type="password"
                        placeholder="••••••••" 
                        className="pl-10 h-12 rounded-xl"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <Button 
                    type="submit"
                    className="w-full bg-primary text-primary-foreground h-14 text-lg font-medium rounded-xl shadow-lg shadow-primary/20 mt-4"
                    disabled={isLoggingIn}
                  >
                    {isLoggingIn ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      authMode === 'email-login' ? 'Login' : 'Create Account'
                    )}
                  </Button>
                  <Button 
                    type="button"
                    variant="ghost" 
                    className="w-full text-muted-foreground"
                    onClick={() => setAuthMode('selection')}
                  >
                    Back to Options
                  </Button>
                </form>
              )}
              <Button 
                variant="ghost" 
                onClick={() => setShowLogin(false)}
                className="w-full text-muted-foreground"
              >
                Back to Marketplace
              </Button>
            </CardContent>
          </Card>
        </div>
        <Toaster />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex relative">
      {/* Sidebar Overlay for Mobile */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 border-r border-border flex flex-col bg-white/95 backdrop-blur-xl shadow-2xl transition-transform duration-300 lg:translate-x-0 lg:static lg:inset-auto lg:z-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        m-4 rounded-[2rem] lg:m-0 lg:rounded-none
      `}>
        <div className="p-8 lg:p-10 flex items-center justify-between">
          <Logo showText iconClassName="w-12 h-12 text-primary" />
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setIsSidebarOpen(false)}>
            <X size={24} />
          </Button>
        </div>
        
        <div className="px-10 mb-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 text-[10px] uppercase tracking-widest px-3 py-1 rounded-full font-bold">
              {user!.role} Portal
            </Badge>
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
          <NavItem 
            icon={<FileText size={18} />} 
            label="Active Projects" 
            active={activeTab === 'projects'} 
            onClick={() => { setActiveTab('projects'); setIsSidebarOpen(false); }} 
          />
          <NavItem
            icon={<Building2 size={18} />}
            label="Municipal Tracker"
            active={activeTab === 'municipal'}
            onClick={() => { setActiveTab('municipal'); setIsSidebarOpen(false); }}
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
              <NavItem
                icon={<Building2 size={18} />}
                label="Municipal Settings"
                active={activeTab === 'municipal'}
                onClick={() => { setActiveTab('municipal'); setIsSidebarOpen(false); }}
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

        <div className="p-8 border-t border-border bg-secondary/10 m-4 rounded-[1.5rem]">
          <div className="flex items-center gap-4 mb-8 px-2">
            <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-xl shadow-lg shadow-primary/20">
              {user?.displayName?.[0] || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate text-foreground">{user?.displayName || 'Unknown User'}</p>
              <p className="text-[10px] text-muted-foreground truncate font-mono">{user?.email || 'no-email'}</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10 h-12 rounded-xl transition-all"
            onClick={handleLogout}
          >
            <LogOut size={18} />
            <span className="font-bold text-xs uppercase tracking-widest">Sign Out</span>
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-[#F8FAFC]">
        <header className="h-24 border-b border-border bg-white/60 backdrop-blur-md flex items-center justify-between px-6 lg:px-12 z-10">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={24} />
            </Button>
            <div>
              <h2 className="font-heading font-bold text-xl lg:text-3xl tracking-tighter text-foreground">
                {user!.role === 'client' ? 'Client Workspace' : user!.role === 'architect' ? 'Architect Studio' : 'Admin Control Center'}
              </h2>
              <p className="hidden sm:block text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-1">
                {user!.role === 'admin' ? 'Monitoring Platform Integrity' : 'Managing Architectural Excellence'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <NotificationBell userId={user!.uid} />
            <div className="flex flex-col items-end">
              <div className="text-[10px] text-primary uppercase tracking-widest font-bold bg-primary/5 px-4 py-1.5 rounded-full border border-primary/10">
                {new Date().toLocaleDateString('en-ZA', { dateStyle: 'medium' })}
              </div>
            </div>
          </div>
        </header>

        <ScrollArea className="flex-1">
          <div className="p-6 lg:p-12 max-w-7xl mx-auto">
            {activeTab === 'invoices' && <InvoiceManagement user={user!} />}
            {activeTab === 'files' && <FileManager user={user!} />}
            {activeTab === 'profile-settings' && <UserSettings user={user!} />}
            
            {(activeTab !== 'invoices' && activeTab !== 'files' && activeTab !== 'profile-settings') && (
              <>
                {user!.role === 'client' && <ClientDashboard user={user!} activeTab={activeTab} onTabChange={setActiveTab} />}
                {user!.role === 'architect' && <ArchitectDashboard user={user!} activeTab={activeTab} onTabChange={setActiveTab} />}
                {user!.role === 'admin' && <AdminDashboard user={user!} activeTab={activeTab} onTabChange={setActiveTab} />}
              </>
            )}
          </div>
        </ScrollArea>
      </main>
      <Toaster />
    </div>
  );
}

function LandingPage({ onGetStarted }: { onGetStarted: () => void }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'jobs'), where('status', '==', 'open'));
    const unsub = onSnapshot(q, (snapshot) => {
      setJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job)));
    }, (error) => {
      console.error("Landing page jobs query failed:", error);
      setJobs([]);
    });
    return () => unsub();
  }, []);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <AnimatedFloorPlan />
      
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-border h-24 flex items-center justify-between px-6 lg:px-20">
        <Logo showText iconClassName="w-12 h-12 text-primary" />
        
        {/* Desktop Nav */}
        <div className="hidden lg:flex items-center gap-6">
          <button onClick={onGetStarted} className="text-sm font-medium hover:text-primary transition-colors">Marketplace</button>
          <button onClick={() => {
            const el = document.getElementById('how-it-works');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }} className="text-sm font-medium hover:text-primary transition-colors">How it Works</button>
          <Button onClick={onGetStarted} className="bg-primary text-primary-foreground px-6 rounded-full font-bold">
            Get Started
          </Button>
        </div>

        {/* Mobile Nav Toggle */}
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </Button>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div
            className="absolute top-20 left-4 right-4 bg-white border border-border rounded-[2rem] shadow-2xl p-8 flex flex-col gap-6 lg:hidden"
          >
            <button onClick={() => { onGetStarted(); setIsMobileMenuOpen(false); }} className="text-lg font-bold hover:text-primary transition-colors text-left">Marketplace</button>
            <button onClick={() => {
              const el = document.getElementById('how-it-works');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
              setIsMobileMenuOpen(false);
            }} className="text-lg font-bold hover:text-primary transition-colors text-left">How it Works</button>
            <Button onClick={() => { onGetStarted(); setIsMobileMenuOpen(false); }} className="bg-primary text-primary-foreground h-14 rounded-full font-bold text-lg">
              Get Started
            </Button>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6 lg:px-20 relative z-10">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <Badge className="bg-primary/10 text-primary border-primary/20 mb-6 px-4 py-1 text-xs uppercase tracking-widest">
              The Future of Architecture
            </Badge>
            <h1 className="text-5xl md:text-7xl lg:text-9xl font-heading font-bold leading-[0.85] tracking-tighter mb-8">
              Design. <br />
              Verify. <br />
              <span className="text-primary">Build.</span>
            </h1>
            <p className="text-lg lg:text-xl text-muted-foreground mb-10 max-w-lg leading-relaxed">
              Architex connects clients with elite architects through an AI-powered marketplace that ensures every drawing is SANS 10400 compliant and council-ready.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button onClick={onGetStarted} size="lg" className="w-full sm:w-auto bg-primary text-primary-foreground h-16 px-10 rounded-full text-lg font-bold shadow-xl shadow-primary/20 group">
                Post a Job <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button onClick={onGetStarted} variant="outline" size="lg" className="w-full sm:w-auto h-16 px-10 rounded-full text-lg font-bold border-primary/20 hover:bg-primary/5">
                Browse Talent
              </Button>
            </div>
          </div>
          <div className="relative">
            <div className="aspect-square rounded-3xl overflow-hidden shadow-2xl border border-border bg-secondary/20 p-8">
              <div className="w-full h-full border border-primary/20 rounded-2xl relative overflow-hidden">
                {/* Architectural Grid Pattern */}
                <div className="absolute inset-0 grid grid-cols-12 grid-rows-12 opacity-10">
                  {Array.from({ length: 144 }).map((_, i) => (
                    <div key={i} className="border border-primary/20" />
                  ))}
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-64 h-64 border-2 border-primary/30 rounded-full flex items-center justify-center">
                    <Logo iconClassName="w-40 h-40 text-primary/40" />
                  </div>
                </div>
              </div>
            </div>
            {/* Floating Stats */}
            <div className="absolute -top-6 -right-6 bg-white p-6 rounded-2xl shadow-xl border border-border">
              <p className="text-3xl font-bold text-primary">100%</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">SANS Compliant</p>
            </div>
          </div>
        </div>
      </section>

      {/* Marketplace Preview */}
      <section className="py-20 bg-secondary/20 px-8 lg:px-20 relative z-10 border-y border-border">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row justify-between items-end mb-12 gap-6">
            <div>
              <h2 className="text-4xl font-heading font-bold mb-4">Live Marketplace</h2>
              <p className="text-muted-foreground">Explore active architectural opportunities across South Africa.</p>
            </div>
            <div className="flex gap-4">
              <div className="bg-white px-6 py-3 rounded-full border border-border flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm font-medium">{jobs.length} Active Jobs</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {jobs.map((job, index) => (
              <div key={job.id}>
                <Card className="h-full border-border hover:border-primary/50 transition-all duration-300 group bg-white/50 backdrop-blur-sm hover:shadow-2xl hover:-translate-y-2">
                  <CardHeader>
                    <div className="flex justify-between items-start mb-4">
                      <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 uppercase text-[10px] tracking-widest">
                        {job.category}
                      </Badge>
                      <span className="text-lg font-bold text-primary font-mono">R {job.budget.toLocaleString()}</span>
                    </div>
                    <CardTitle className="font-heading text-xl group-hover:text-primary transition-colors">{job.title}</CardTitle>
                    <CardDescription className="line-clamp-3 leading-relaxed">{job.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-4 text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                      <div className="flex items-center gap-1">
                        <MapPin size={12} className="text-primary" />
                        {job.location || 'South Africa'}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock size={12} className="text-primary" />
                        Posted {new Date(job.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-0">
                    <Button onClick={onGetStarted} variant="ghost" className="w-full justify-between group/btn hover:bg-primary hover:text-primary-foreground">
                      View Details <ArrowRight size={16} className="group-hover/btn:translate-x-1 transition-transform" />
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            ))}
          </div>

          {jobs.length === 0 && (
            <div className="text-center py-20 border-2 border-dashed border-border rounded-3xl">
              <p className="text-muted-foreground italic">No active jobs found. Be the first to post!</p>
              <Button onClick={onGetStarted} className="mt-6 bg-primary text-primary-foreground rounded-full px-8">
                Post a Job Now
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Trust Section */}
      <section id="how-it-works" className="py-20 px-8 lg:px-20 relative z-10 bg-background">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-heading font-bold mb-4">How Architex Works</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">Our platform streamlines the architectural process from concept to council approval.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-12">
            <TrustCard 
              icon={<ShieldCheck className="w-10 h-10 text-primary" />}
              title="AI Compliance"
              description="Every drawing is automatically checked against SANS 10400 regulations by our specialized AI agents."
            />
            <TrustCard 
              icon={<CheckCircle2 className="w-10 h-10 text-primary" />}
              title="Council Ready"
              description="We guarantee that approved drawings are ready for municipal submission, saving you months of back-and-forth."
            />
            <TrustCard 
              icon={<Users className="w-10 h-10 text-primary" />}
              title="Vetted Talent"
              description="Only SACAP registered professionals can apply for jobs, ensuring the highest standards of architectural excellence."
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-secondary/50 py-20 px-8 lg:px-20 border-t border-border relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <Logo showText iconClassName="w-10 h-10 text-primary" textClassName="font-heading font-bold text-2xl lg:text-3xl tracking-tighter" />
          <p className="text-sm text-muted-foreground">© 2026 Architex. South Africa's Premier Architectural Marketplace.</p>
          <div className="flex gap-6">
            <button className="text-xs uppercase tracking-widest hover:text-primary transition-colors">Terms</button>
            <button className="text-xs uppercase tracking-widest hover:text-primary transition-colors">Privacy</button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function TrustCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="space-y-4">
      <div className="p-4 bg-primary/5 rounded-2xl w-fit">
        {icon}
      </div>
      <h3 className="text-xl font-heading font-bold">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all duration-200 ${
        active ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-muted-foreground hover:bg-primary/5 hover:text-primary'
      }`}
    >
      {icon}
      <span className="font-bold">{label}</span>
    </button>
  );
}
