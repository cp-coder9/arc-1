import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Users,
  Briefcase,
  Sparkles,
  Building2,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Construction,
  ShieldCheck,
  HardHat,
  BadgeCheck
} from 'lucide-react';
import { UserRole } from '../types';

interface OnboardingFlowProps {
  onComplete: (data: any) => void;
  onCancel: () => void;
}

export default function OnboardingFlow({ onComplete, onCancel }: OnboardingFlowProps) {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<UserRole | null>(null);
  const [formData, setFormData] = useState<any>({
    hasPIInsurance: false
  });

  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => setStep(s => s - 1);

  const handleRoleSelect = (selectedRole: UserRole) => {
    setRole(selectedRole);
    setFormData({ ...formData, role: selectedRole });
    nextStep();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setFormData({ ...formData, [e.target.name]: value });
  };

  const renderRoleSelection = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <RoleCard
        icon={<Users className="w-8 h-8" />}
        title="Client"
        description="I want to hire professionals for my building project"
        onClick={() => handleRoleSelect('client')}
      />
      <RoleCard
        icon={<Briefcase className="w-8 h-8" />}
        title="Architect"
        description="I am a SACAP registered architect looking for work"
        onClick={() => handleRoleSelect('architect')}
      />
      <RoleCard
        icon={<Sparkles className="w-8 h-8" />}
        title="Freelancer"
        description="I am a specialist or consultant (Engineer, etc.)"
        onClick={() => handleRoleSelect('freelancer')}
      />
      <RoleCard
        icon={<Construction className="w-8 h-8" />}
        title="BEP"
        description="Built Environment Professional (Builder, Tiler, etc.)"
        onClick={() => handleRoleSelect('bep')}
      />
    </div>
  );

  const renderClientOnboarding = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">What is your project type?</label>
        <select
          name="projectType"
          onChange={handleInputChange}
          className="w-full h-12 px-4 rounded-xl border border-border bg-white text-sm"
          required
        >
          <option value="">Select project type...</option>
          <option value="Residential">Residential Home</option>
          <option value="Commercial">Commercial/Office</option>
          <option value="Industrial">Industrial/Warehouse</option>
          <option value="Renovation">Renovation/Addition</option>
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Estimated Budget Range</label>
        <select
          name="budgetRange"
          onChange={handleInputChange}
          className="w-full h-12 px-4 rounded-xl border border-border bg-white text-sm"
          required
        >
          <option value="">Select budget range...</option>
          <option value="under_100k">Under R100,000</option>
          <option value="100k_500k">R100,000 - R500,000</option>
          <option value="500k_1m">R500,000 - R1,000,000</option>
          <option value="1m_plus">R1,000,000+</option>
        </select>
      </div>
      <Button onClick={() => onComplete(formData)} className="w-full h-14 rounded-2xl mt-6 font-bold text-lg">
        Finish Setup
      </Button>
    </div>
  );

  const renderArchitectOnboarding = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">SACAP Registration Number</label>
        <Input
          name="sacapNumber"
          placeholder="ST123456"
          className="h-12 rounded-xl"
          onChange={handleInputChange}
          required
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Years of Experience</label>
        <Input
          type="number"
          name="experienceYears"
          placeholder="5"
          className="h-12 rounded-xl"
          onChange={handleInputChange}
          required
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Main Specialization</label>
        <select
          name="mainSpecialization"
          onChange={handleInputChange}
          className="w-full h-12 px-4 rounded-xl border border-border bg-white text-sm"
          required
        >
          <option value="">Select specialization...</option>
          <option value="Residential">Residential</option>
          <option value="Urban Design">Urban Design</option>
          <option value="Sustainable Design">Sustainable Design</option>
          <option value="Heritage">Heritage</option>
        </select>
      </div>
      <Button onClick={() => onComplete(formData)} className="w-full h-14 rounded-2xl mt-6 font-bold text-lg">
        Finish Setup
      </Button>
    </div>
  );

  const renderBEPOnboarding = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Trade / Profession</label>
          <select
            name="professionalLabel"
            onChange={handleInputChange}
            className="w-full h-12 px-4 rounded-xl border border-border bg-white text-sm"
            required
          >
            <option value="">Select your trade...</option>
            <option value="Builder">General Builder</option>
            <option value="Tiler">Professional Tiler</option>
            <option value="Plumber">Plumber</option>
            <option value="Electrician">Electrician</option>
            <option value="Carpenter">Carpenter</option>
            <option value="Painter">Painter</option>
            <option value="Engineer">Civil/Structural Engineer</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Region of Operation</label>
          <Input
            name="region"
            placeholder="e.g. Gauteng, Cape Town"
            className="h-12 rounded-xl"
            onChange={handleInputChange}
            required
          />
        </div>
      </div>

      {(formData.professionalLabel === 'Builder' || formData.professionalLabel === 'Engineer') && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-primary/5 rounded-2xl border border-primary/10">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
              <ShieldCheck size={14} /> NHBRC Registration #
            </label>
            <Input
              name="nhbrcNumber"
              placeholder="Reg Number"
              className="h-10 rounded-lg bg-white"
              onChange={handleInputChange}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
              <BadgeCheck size={14} /> CIDB Grading
            </label>
            <select
              name="cidbGrading"
              onChange={handleInputChange}
              className="w-full h-10 px-3 rounded-lg border border-border bg-white text-xs"
            >
              <option value="">None</option>
              <option value="1GB">Grade 1</option>
              <option value="2GB">Grade 2</option>
              <option value="5GB">Grade 5</option>
              <option value="9GB">Grade 9</option>
            </select>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 p-4 border border-border rounded-2xl bg-white">
        <input
          type="checkbox"
          name="hasPIInsurance"
          id="pi_ins"
          onChange={handleInputChange}
          className="w-5 h-5 rounded border-border text-primary focus:ring-primary"
        />
        <label htmlFor="pi_ins" className="text-sm font-medium cursor-pointer">
          I have Professional Indemnity (PI) Insurance
        </label>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Bio / Experience Summary</label>
        <textarea
          name="bio"
          className="w-full p-4 rounded-2xl border border-border bg-white text-sm min-h-[100px] outline-none focus:ring-2 focus:ring-primary transition-all"
          placeholder="Tell us about your previous build environment projects..."
          onChange={handleInputChange}
        />
      </div>
      <Button onClick={() => onComplete(formData)} className="w-full h-14 rounded-2xl font-bold text-lg group">
        Complete Profile <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
      </Button>
    </div>
  );

  const renderFreelancerOnboarding = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Specialization</label>
        <select
          name="specialization"
          onChange={handleInputChange}
          className="w-full h-12 px-4 rounded-xl border border-border bg-white text-sm"
          required
        >
          <option value="">Select specialization...</option>
          <option value="Structural Engineer">Structural Engineer</option>
          <option value="Mechanical Engineer">Mechanical Engineer</option>
          <option value="Land Surveyor">Land Surveyor</option>
          <option value="Interior Designer">Interior Designer</option>
          <option value="Energy Consultant">Energy Consultant</option>
        </select>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Hourly Rate (ZAR)</label>
        <Input
          type="number"
          name="hourlyRate"
          placeholder="550"
          className="h-12 rounded-xl"
          onChange={handleInputChange}
          required
        />
      </div>
      <div className="flex items-center gap-3 p-4 border border-border rounded-xl">
        <input
          type="checkbox"
          name="hasPIInsurance"
          id="freelancer_pi"
          onChange={handleInputChange}
          className="w-5 h-5 rounded border-border"
        />
        <label htmlFor="freelancer_pi" className="text-sm font-medium">
          I have Professional Indemnity Insurance
        </label>
      </div>
      <Button onClick={() => onComplete(formData)} className="w-full h-14 rounded-2xl mt-6 font-bold text-lg">
        Finish Setup
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-secondary/30 backdrop-blur-sm fixed inset-0 z-50 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl w-full my-8"
      >
        <Card className="border-border shadow-2xl bg-white/95 backdrop-blur-md rounded-[2.5rem] overflow-hidden">
          <CardHeader className="text-center bg-primary/5 pb-10 pt-12 relative">
            <div className="flex justify-between items-center mb-6 absolute top-6 left-6 right-6">
              {step > 1 && (
                <Button variant="ghost" size="sm" onClick={prevStep} className="rounded-full hover:bg-white">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
              )}
              <div className="flex-1" />
              <Button variant="ghost" size="sm" onClick={onCancel} className="rounded-full hover:bg-white">
                Cancel
              </Button>
            </div>
            <CardTitle className="text-4xl font-heading font-bold tracking-tight">
              {step === 1 ? 'Join Architex' : `Welcome, ${role?.toUpperCase()}`}
            </CardTitle>
            <CardDescription className="text-base mt-2">
              {step === 1 ? 'Select your professional role to get started' : 'Complete your profile to access the marketplace'}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                {step === 1 && renderRoleSelection()}
                {step === 2 && role === 'client' && renderClientOnboarding()}
                {step === 2 && role === 'architect' && renderArchitectOnboarding()}
                {step === 2 && role === 'bep' && renderBEPOnboarding()}
                {step === 2 && role === 'freelancer' && renderFreelancerOnboarding()}
              </motion.div>
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function RoleCard({ icon, title, description, onClick }: { icon: React.ReactNode, title: string, description: string, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group p-8 text-left border border-border rounded-3xl hover:border-primary hover:bg-primary/5 transition-all duration-300 flex flex-col gap-6 bg-white shadow-sm hover:shadow-xl"
    >
      <div className="p-4 bg-secondary rounded-2xl group-hover:bg-primary/10 group-hover:text-primary transition-all group-hover:scale-110">
        {icon}
      </div>
      <div className="space-y-2">
        <h3 className="font-heading font-bold text-2xl">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
      <div className="mt-auto pt-4 border-t border-border/50 w-full">
        <span className="text-[10px] uppercase tracking-widest font-black text-primary flex items-center gap-2 group-hover:gap-4 transition-all">
          Get Started <ArrowRight className="w-4 h-4" />
        </span>
      </div>
    </button>
  );
}
