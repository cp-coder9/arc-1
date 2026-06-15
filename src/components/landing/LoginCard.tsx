import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';

interface LoginCardProps {
  stage: number; // 1-6
  onRequestAccess: () => void;
  onLogin: (email: string, password: string) => void;
}

export function LoginCard({ stage, onRequestAccess, onLogin }: LoginCardProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Visible from stage 4 (fading in), fully visible by stage 5
  const isVisible = stage >= 4;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      await onLogin(email, password);
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.6, ease: [0.25, 0.4, 0.25, 1], delay: stage >= 5 ? 0 : 0.3 }}
          className="w-full max-w-md mx-auto"
        >
          <Card className="border-0 shadow-2xl bg-white/95 backdrop-blur-xl">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-2xl font-black tracking-[-0.04em] text-[#0d1e25]">
                Welcome to Architex
              </CardTitle>
              <CardDescription className="text-sm text-[#5e7478]">
                Enter your workspace or request access
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-xs font-bold uppercase tracking-[0.1em] text-[#5e7478]">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5e7478]" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@firm.co.za"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 h-12 rounded-xl border-[#d0e3dc] bg-white text-[#0d1e25] placeholder:text-[#5e7478]/50"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-xs font-bold uppercase tracking-[0.1em] text-[#5e7478]">
                    Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5e7478]" />
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 h-12 rounded-xl border-[#d0e3dc] bg-white text-[#0d1e25] placeholder:text-[#5e7478]/50"
                      required
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full h-12 rounded-xl bg-[#005b4e] text-white font-black hover:bg-[#007666] transition-colors"
                >
                  {isLoggingIn ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      Enter workspace <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-[#d0e3dc]" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white px-2 text-[#5e7478] font-medium">or</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onRequestAccess}
                  className="w-full h-12 rounded-xl border-[#005b4e] text-[#005b4e] font-black hover:bg-[#005b4e] hover:text-white transition-colors"
                >
                  Request Access
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
