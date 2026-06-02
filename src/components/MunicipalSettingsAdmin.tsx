import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { toast } from 'sonner';
import { Building2, Save, Loader2, Key } from 'lucide-react';

export default function MunicipalSettingsAdmin() {
  const [settings, setSettings] = useState({
    municipalTrackerEnabled: false,
    nvidiaApiKey: '',
    nvidiaOcrModel: 'nvidia/llama-3.2-11b-vision-instruct', // Or specialized Nemotron OCR model
    xeroConnected: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'system_settings', 'municipal_tracker');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setSettings(snap.data() as any);
        }
      } catch (error) {
        console.error("Failed to fetch municipal settings:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'system_settings', 'municipal_tracker'), {
        ...settings,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      toast.success("Municipal settings saved successfully");
    } catch (error) {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-heading font-bold tracking-tight text-foreground">Municipal Tracker Settings</h2>
        <p className="text-muted-foreground uppercase tracking-widest text-[10px] font-bold mt-1">
          Configure official-access automation, shadow tracking, and vision AI keys
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border shadow-sm bg-white rounded-[2rem] overflow-hidden">
          <CardHeader className="bg-primary/5 border-b border-border p-8">
            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
              <Building2 size={14} /> Module Control
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="flex items-center justify-between p-4 bg-secondary/20 rounded-2xl border border-border">
              <div>
                <p className="text-sm font-bold">Enable Municipal Tracker</p>
                <p className="text-[10px] text-muted-foreground italic">Toggle the entire municipal tracker addon for all users</p>
              </div>
              <Switch
                checked={settings.municipalTrackerEnabled}
                onCheckedChange={(val) => setSettings({...settings, municipalTrackerEnabled: val})}
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-secondary/20 rounded-2xl border border-border">
              <div>
                <p className="text-sm font-bold">Shadow Tracking (Tier 4)</p>
                <p className="text-[10px] text-muted-foreground italic">Enable invoice-signal monitoring alongside official portal automation</p>
              </div>
              <Switch
                checked={settings.xeroConnected}
                onCheckedChange={(val) => setSettings({...settings, xeroConnected: val})}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm bg-white rounded-[2rem] overflow-hidden">
          <CardHeader className="bg-primary/5 border-b border-border p-8">
            <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
              <Key size={14} /> Tier 2: Vision AI Config
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">NVIDIA NIM API Key</label>
              <Input
                type="password"
                value={settings.nvidiaApiKey}
                onChange={e => setSettings({...settings, nvidiaApiKey: e.target.value})}
                placeholder="nvapi-..."
                className="rounded-xl h-12"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">NVIDIA Vision Model</label>
              <Input
                value={settings.nvidiaOcrModel}
                onChange={e => setSettings({...settings, nvidiaOcrModel: e.target.value})}
                placeholder="nvidia/llama-3.2-11b-vision-instruct"
                className="rounded-xl h-12"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end pt-6">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl h-14 px-10 font-bold gap-2 shadow-lg shadow-primary/20"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          Save Municipal Configuration
        </Button>
      </div>
    </div>
  );
}
