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
  BadgeCheck,
  Factory
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
      <RoleCard
        icon={<Users className="w-8 h-8" />}
        title="Client"
        description="I want to hire professionals for my building project"
        onClick={() => handleRoleSelect('client')}
        data-testid="role-select-client"
      />
      <RoleCard
        icon={<Sparkles className="w-8 h-8" />}
        title="Freelancer"
        description="I am a specialist or consultant (Engineer, etc.)"
        onClick={() => handleRoleSelect('freelancer')}
        data-testid="role-select-freelancer"
      />
      <RoleCard
        icon={<Construction className="w-8 h-8" />}
        title="BEP / Design Team"
        description="Architects, engineers, QSs, technologists, and design-team leads"
        onClick={() => handleRoleSelect('bep')}
        data-testid="role-select-bep"
      />
      <RoleCard
        icon={<Factory className="w-8 h-8" />}
        title="Contractor"
        description="I manage construction delivery, tenders, and site teams"
        onClick={() => handleRoleSelect('contractor')}
        data-testid="role-select-contractor"
      />
      <RoleCard
        icon={<HardHat className="w-8 h-8" />}
        title="Subcontractor"
        description="I deliver trade packages, evidence, and close-out items"
        onClick={() => handleRoleSelect('subcontractor')}
        data-testid="role-select-subcontractor"
      />
      <RoleCard
        icon={<Building2 className="w-8 h-8" />}
        title="Supplier"
        description="I supply products, deliveries, warranties, and support"
        onClick={() => handleRoleSelect('supplier')}
        data-testid="role-select-supplier"
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
            <option value="">Select your profession...</option>
            <option value="Architect">Architect / SACAP professional</option>
            <option value="Engineer">Civil/Structural Engineer</option>
            <option value="Quantity Surveyor">Quantity Surveyor</option>
            <option value="Project Manager">Project Manager</option>
            <option value="Technologist">Architectural Technologist</option>
            <option value="Interior Designer">Interior Designer</option>
            <option value="Builder">General Builder</option>
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

      {formData.professionalLabel === 'Architect' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-primary/5 rounded-2xl border border-primary/10">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
              <BadgeCheck size={14} /> SACAP Registration #
            </label>
            <Input
              name="sacapNumber"
              placeholder="ST123456"
              className="h-10 rounded-lg bg-white"
              onChange={handleInputChange}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
              <Briefcase size={14} /> Main specialization
            </label>
            <select
              name="mainSpecialization"
              onChange={handleInputChange}
              className="w-full h-10 px-3 rounded-lg border border-border bg-white text-xs"
            >
              <option value="">Select specialization...</option>
              <option value="Residential">Residential</option>
              <option value="Urban Design">Urban Design</option>
              <option value="Sustainable Design">Sustainable Design</option>
              <option value="Heritage">Heritage</option>
            </select>
          </div>
        </div>
      )}

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

  const renderContractorOnboarding = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Contracting Focus</label>
          <select
            name="professionalLabel"
            onChange={handleInputChange}
            className="w-full h-12 px-4 rounded-xl border border-border bg-white text-sm"
            required
          >
            <option value="">Select focus...</option>
            <option value="General Contractor">General Contractor</option>
            <option value="Residential Builder">Residential Builder</option>
            <option value="Commercial Contractor">Commercial Contractor</option>
            <option value="Civil Contractor">Civil Contractor</option>
            <option value="Specialist Subcontractor">Specialist Subcontractor</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Region of Operation</label>
          <Input name="region" placeholder="e.g. Gauteng, Cape Town" className="h-12 rounded-xl" onChange={handleInputChange} required />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-primary/5 rounded-2xl border border-primary/10">
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
            <ShieldCheck size={14} /> NHBRC Registration #
          </label>
          <Input name="nhbrcNumber" placeholder="Reg Number" className="h-10 rounded-lg bg-white" onChange={handleInputChange} />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
            <BadgeCheck size={14} /> CIDB Grading
          </label>
          <select name="cidbGrading" onChange={handleInputChange} className="w-full h-10 px-3 rounded-lg border border-border bg-white text-xs">
            <option value="">Select grade</option>
            <option value="1GB">Grade 1</option>
            <option value="2GB">Grade 2</option>
            <option value="5GB">Grade 5</option>
            <option value="9GB">Grade 9</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3 p-4 border border-border rounded-2xl bg-white">
        <input type="checkbox" name="hasPIInsurance" id="contractor_pi" onChange={handleInputChange} className="w-5 h-5 rounded border-border text-primary focus:ring-primary" />
        <label htmlFor="contractor_pi" className="text-sm font-medium cursor-pointer">I have contractor liability / PI Insurance</label>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Company / Experience Summary</label>
        <textarea name="bio" className="w-full p-4 rounded-2xl border border-border bg-white text-sm min-h-[100px] outline-none focus:ring-2 focus:ring-primary transition-all" placeholder="Tell us about your construction delivery experience..." onChange={handleInputChange} />
      </div>
      <Button onClick={() => onComplete(formData)} className="w-full h-14 rounded-2xl font-bold text-lg group">
        Complete Contractor Profile <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
      </Button>
    </div>
  );

  const renderPackageParticipantOnboarding = () => {
    const isSupplier = role === 'supplier';
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">{isSupplier ? 'Supply Category' : 'Trade Category'}</label>
            <Input name={isSupplier ? 'supplyCategory' : 'tradeCategory'} placeholder={isSupplier ? 'e.g. windows, concrete, sanitaryware' : 'e.g. electrical, wet works, ceilings'} className="h-12 rounded-xl" onChange={handleInputChange} required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Service Region</label>
            <Input name="serviceRegion" placeholder="e.g. Gauteng, Cape Town" className="h-12 rounded-xl" onChange={handleInputChange} required />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Package Type</label>
            <Input name="packageType" placeholder="e.g. labour-only, supply-and-install, product supply" className="h-12 rounded-xl" onChange={handleInputChange} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Warranty / Support Details</label>
            <Input name="warrantySupportDetails" placeholder="Warranty period, product support, or workmanship guarantee" className="h-12 rounded-xl" onChange={handleInputChange} />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Compliance and close-out evidence you can provide</label>
          <textarea name="closeOutDocumentationRequirements" className="w-full p-4 rounded-2xl border border-border bg-white text-sm min-h-[100px] outline-none focus:ring-2 focus:ring-primary transition-all" placeholder="COCs, delivery notes, warranties, test certificates, photos, data sheets..." onChange={handleInputChange} />
        </div>
        <Button onClick={() => onComplete(formData)} className="w-full h-14 rounded-2xl font-bold text-lg group">
          Complete {isSupplier ? 'Supplier' : 'Subcontractor'} Profile <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
        </Button>
      </div>
    );
  };

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
    <div className="fixed inset-0 z-50 flex min-h-dvh items-start justify-center overflow-y-auto overscroll-contain bg-secondary/30 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6 lg:items-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`${step === 1 ? 'max-w-5xl' : 'max-w-2xl'} w-full pb-[max(env(safe-area-inset-bottom),0px)] lg:my-8`}
      >
        <Card className="overflow-hidden rounded-[1.75rem] border-border bg-white/95 shadow-2xl backdrop-blur-md sm:rounded-[2.5rem]">
          <CardHeader className="relative bg-primary/5 px-5 pb-6 pt-16 text-center sm:px-6 sm:pb-8 sm:pt-12">
            <div className="absolute left-4 right-4 top-4 flex items-center justify-between sm:left-6 sm:right-6 sm:top-6">
              {step > 1 && (
                <Button variant="ghost" size="sm" onClick={prevStep} className="rounded-full bg-white/55 px-3 hover:bg-white">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
              )}
              <div className="flex-1" />
              <Button variant="ghost" size="sm" onClick={onCancel} className="rounded-full bg-white/55 px-3 hover:bg-white">
                Cancel
              </Button>
            </div>
            <CardTitle className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              {step === 1 ? 'Join Architex' : `Welcome, ${role?.toUpperCase()}`}
            </CardTitle>
            <CardDescription className="mt-2 text-sm sm:text-base">
              {step === 1 ? 'Select your professional role to get started' : 'Complete your profile to access your workspace'}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 lg:p-8">
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
                {step === 2 && role === 'bep' && renderBEPOnboarding()}
                {step === 2 && role === 'contractor' && renderContractorOnboarding()}
                {step === 2 && (role === 'subcontractor' || role === 'supplier') && renderPackageParticipantOnboarding()}
                {step === 2 && role === 'freelancer' && renderFreelancerOnboarding()}
              </motion.div>
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function RoleCard({ icon, title, description, onClick, ...props }: { icon: React.ReactNode, title: string, description: string, onClick: () => void } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      onClick={onClick}
      aria-label={`Select ${title} role`}
      className="group flex min-h-[118px] gap-4 rounded-3xl border border-border bg-white p-4 text-left shadow-sm transition-all duration-300 hover:border-primary hover:bg-primary/5 hover:shadow-xl sm:min-h-[176px] sm:flex-col sm:gap-5 sm:p-5"
      {...props}
    >
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-secondary transition-all group-hover:scale-105 group-hover:bg-primary/10 group-hover:text-primary sm:h-14 sm:w-14">
        {icon}
      </div>
      <div className="min-w-0 space-y-1.5 sm:space-y-2">
        <h3 className="font-heading text-xl font-bold sm:text-2xl">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
      <div className="mt-auto hidden w-full border-t border-border/50 pt-3 sm:block">
        <span className="text-[10px] uppercase tracking-widest font-black text-primary flex items-center gap-2 group-hover:gap-4 transition-all">
          Get Started <ArrowRight className="w-4 h-4" />
        </span>
      </div>
    </button>
  );
}
