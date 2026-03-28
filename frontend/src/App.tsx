/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload, Check, Loader2, ChevronRight, Plus, X, Download, RefreshCw,
  LayoutGrid, MapPin, DollarSign, Maximize, Sparkles, LogOut, Bed, Bath, Bookmark,
} from 'lucide-react';
import { Player } from '@remotion/player';
import { VideoComposition, VIDEO_WIDTH, VIDEO_HEIGHT, VIDEO_FPS } from './VideoComposition';
import type { VideoCompositionProps } from './VideoComposition';
import { useAuth } from './AuthContext';
import AuthPage from './AuthPage';
import LandingPage from './LandingPage';
import SavedVideosPage from './SavedVideosPage';
import { buildMp4Filename, downloadBlob } from './downloads';
import { renderVideoToMp4, canExportMp4 } from './renderVideo';
import { supabase } from './supabase';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ── Types ──────────────────────────────────────────────────────────────────────

type Screen = 'input' | 'loading' | 'results' | 'saved';
type Page = 'landing' | 'login' | 'signup';

interface Photo {
  id: string;
  url: string;
  label: string;
  file: File;
}

interface ScriptVariant { hook: string; body_copy: string; cta: string; }
interface SceneItem { photo_index: number; overlay_text: string; duration_sec: number; voiceover_segment: string; }

interface GenerationResult {
  job_id: string;
  hooks: string[];
  scripts: ScriptVariant[];
  selected_script_index: number;
  market_positioning: { target_audience: string; video_angle: string; key_selling_points: string[]; constraints: string[]; };
  scene_sequence: SceneItem[];
  confidence_score: number;
  strengths: string[];
  weaknesses: string[];
  improvement_notes: string[];
}

function formatSaveError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes('saved-video-photos') || lower.includes('saved-video-mp4s') || lower.includes('bucket')) {
    return 'Supabase storage is not ready. Create the `saved-video-photos` and `saved-video-mp4s` buckets and allow this user to upload files.';
  }

  if (lower.includes('saved_videos') || lower.includes('relation') || lower.includes('does not exist')) {
    return 'Supabase database setup is incomplete. Create the `saved_videos` table and add insert/select policies for authenticated users.';
  }

  if (lower.includes('row-level security') || lower.includes('permission') || lower.includes('not allowed') || lower.includes('unauthorized')) {
    return 'Supabase permissions blocked the save request. Check your row-level security policies and storage bucket permissions.';
  }

  return message;
}

// ── Navbar ─────────────────────────────────────────────────────────────────────

const Navbar = ({ onReset, onShowSaved, onSignOut }: { onReset: () => void; onShowSaved: () => void; onSignOut: () => void }) => (
  <nav className="flex items-center justify-between py-6 px-8 max-w-7xl mx-auto w-full">
    <div className="flex items-center gap-2 cursor-pointer" onClick={onReset}>
      <span className="logo text-2xl font-bold tracking-tight">LandlordFlip<span className="text-coral">.</span></span>
    </div>
    <div className="hidden md:flex items-center gap-8 text-sm font-medium text-white/60">
      <button onClick={onShowSaved} className="hover:text-white transition-colors flex items-center gap-1.5">
        <Bookmark className="w-4 h-4" /> Saved Videos
      </button>
      <a href="#" className="hover:text-white transition-colors">How it works</a>
    </div>
    <button onClick={onSignOut} className="btn-ghost text-sm flex items-center gap-2">
      <LogOut className="w-4 h-4" /> Sign Out
    </button>
  </nav>
);

// ── InputForm ──────────────────────────────────────────────────────────────────

interface ListingMeta { title: string; price: string; neighborhood: string }

const InputForm = ({ onGenerate }: { onGenerate: (jobId: string, photos: Photo[], meta: ListingMeta) => void }) => {
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [beds, setBeds] = useState('');
  const [baths, setBaths] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [squareFootage, setSquareFootage] = useState('');
  const [leasingSpecial, setLeasingSpecial] = useState('');
  const [amenities, setAmenities] = useState<string[]>([]);
  const [targetRenter, setTargetRenter] = useState('Young Professional');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const amenityOptions = ['Gym', 'Pool', 'Parking', 'Pet Friendly', 'Furnished', 'Rooftop'];
  const targetOptions = ['Student', 'Young Professional', 'Budget Renter'];

  const addFiles = (files: FileList | File[]) => {
    const newPhotos: Photo[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 10 * 1024 * 1024) continue;
      newPhotos.push({ id: crypto.randomUUID().slice(0, 12), url: URL.createObjectURL(file), label: file.name.replace(/\.[^.]+$/, ''), file });
    }
    setPhotos(prev => [...prev, ...newPhotos].slice(0, 6));
  };

  const removePhoto = (id: string) => {
    setPhotos(prev => { const p = prev.find(p => p.id === id); if (p) URL.revokeObjectURL(p.url); return prev.filter(p => p.id !== id); });
  };

  const toggleAmenity = (a: string) => setAmenities(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'Title is required';
    if (!price || Number(price) <= 0) errs.price = 'Valid price is required';
    if (!beds) errs.beds = 'Beds is required';
    if (!baths) errs.baths = 'Baths is required';
    if (!neighborhood.trim()) errs.neighborhood = 'Neighborhood is required';
    return errs;
  };

  const handleSubmit = async () => {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const form = new globalThis.FormData();
      form.append('title', title.trim());
      form.append('price', price);
      form.append('beds', beds);
      form.append('baths', baths);
      form.append('neighborhood', neighborhood.trim());
      form.append('square_footage', squareFootage);
      form.append('amenities', JSON.stringify(amenities));
      form.append('target_renter', targetRenter);
      form.append('leasing_special', leasingSpecial.trim());
      photos.forEach(p => form.append('photos', p.file));
      const res = await fetch(`${API_BASE}/api/generate`, { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || 'Generation failed');
      onGenerate(json.job_id, photos, { title: title.trim(), price, neighborhood: neighborhood.trim() });
    } catch (err: any) {
      setSubmitError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-8 pb-20 grid grid-cols-1 lg:grid-cols-2 gap-12 mt-8">
      <div className="space-y-8">
        <div className="space-y-4">
          <h2 className="text-3xl font-medium">Listing Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: 'Listing Title', value: title, set: setTitle, placeholder: 'Modern Loft in SoHo', key: 'title' },
            ].map(f => (
              <div key={f.key} className="space-y-1.5">
                <label className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">{f.label}</label>
                <input type="text" value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} className={`w-full input-field ${errors[f.key] ? 'border-red-400' : ''}`} />
                {errors[f.key] && <p className="text-red-400 text-xs">{errors[f.key]}</p>}
              </div>
            ))}
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">Rent Price</label>
              <div className="relative"><DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="3200" className={`w-full input-field pl-9 ${errors.price ? 'border-red-400' : ''}`} />
              </div>
              {errors.price && <p className="text-red-400 text-xs">{errors.price}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">Neighborhood</label>
              <div className="relative"><MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input type="text" value={neighborhood} onChange={e => setNeighborhood(e.target.value)} placeholder="Manhattan, NY" className={`w-full input-field pl-9 ${errors.neighborhood ? 'border-red-400' : ''}`} />
              </div>
              {errors.neighborhood && <p className="text-red-400 text-xs">{errors.neighborhood}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">Square Footage</label>
              <div className="relative"><Maximize className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input type="number" value={squareFootage} onChange={e => setSquareFootage(e.target.value)} placeholder="850" className="w-full input-field pl-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">Beds</label>
              <div className="relative"><Bed className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input type="number" value={beds} onChange={e => setBeds(e.target.value)} placeholder="2" min="0" className={`w-full input-field pl-9 ${errors.beds ? 'border-red-400' : ''}`} />
              </div>
              {errors.beds && <p className="text-red-400 text-xs">{errors.beds}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">Baths</label>
              <div className="relative"><Bath className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input type="number" value={baths} onChange={e => setBaths(e.target.value)} placeholder="1" min="0" className={`w-full input-field pl-9 ${errors.baths ? 'border-red-400' : ''}`} />
              </div>
              {errors.baths && <p className="text-red-400 text-xs">{errors.baths}</p>}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <label className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">Amenities</label>
          <div className="flex flex-wrap gap-2">
            {amenityOptions.map(o => (
              <button key={o} onClick={() => toggleAmenity(o)}
                className={`px-4 py-2 rounded-full text-xs font-medium border transition-all ${amenities.includes(o) ? 'bg-coral border-coral text-white' : 'bg-white/5 border-white/10 text-white/60 hover:border-white/20'}`}
              >{o}</button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <label className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">Target Renter</label>
          <div className="grid grid-cols-3 gap-4">
            {targetOptions.map(o => (
              <button key={o} onClick={() => setTargetRenter(o)}
                className={`p-4 card-surface text-center transition-all border ${targetRenter === o ? 'border-coral ring-1 ring-coral' : 'border-white/10'}`}
              ><div className="text-xs font-medium">{o}</div></button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">Leasing Special (Optional)</label>
          <input type="text" value={leasingSpecial} onChange={e => setLeasingSpecial(e.target.value)} placeholder="e.g. First month free on 12-month lease" className="w-full input-field" />
        </div>
      </div>

      <div className="space-y-8">
        <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden"
          onChange={e => { if (e.target.files?.length) { addFiles(e.target.files); e.target.value = ''; } }}
        />
        <div className="space-y-4">
          <h2 className="text-3xl font-medium">Property Photos</h2>
          <div onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
            className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center gap-4 transition-colors cursor-pointer ${dragOver ? 'border-coral bg-coral/5' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'}`}
          >
            <div className="w-12 h-12 rounded-full bg-coral/10 flex items-center justify-center"><Upload className="w-6 h-6 text-coral" /></div>
            <div className="text-center"><p className="font-medium">Drag and drop photos</p><p className="text-xs text-white/40 mt-1">PNG, JPG up to 10MB</p></div>
          </div>
        </div>
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {photos.map((photo, idx) => (
              <div key={photo.id} className="space-y-2 group">
                <div className="aspect-[3/4] rounded-lg overflow-hidden relative border border-white/10">
                  <img src={photo.url} alt={photo.label} className="w-full h-full object-cover" />
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => removePhoto(photo.id)} className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-black"><X className="w-3 h-3" /></button>
                  </div>
                  <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-sm rounded text-[10px] uppercase tracking-tighter font-bold">{String(idx + 1).padStart(2, '0')}</div>
                </div>
                <input type="text" value={photo.label}
                  onChange={e => setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, label: e.target.value } : p))}
                  className="w-full bg-transparent text-[11px] text-white/60 text-center focus:text-white outline-none"
                />
              </div>
            ))}
            <button onClick={() => fileInputRef.current?.click()} className="aspect-[3/4] rounded-lg border border-dashed border-white/10 flex flex-col items-center justify-center gap-2 hover:bg-white/[0.02] transition-colors">
              <Plus className="w-5 h-5 text-white/20" /><span className="text-[10px] text-white/20 uppercase font-bold">Add Photo</span>
            </button>
          </div>
        )}
      </div>

      <div className="lg:col-span-2 pt-8 space-y-3">
        {submitError && <p className="text-red-400 text-sm text-center">{submitError}</p>}
        <button onClick={handleSubmit} disabled={submitting}
          className="w-full btn-coral py-5 text-lg flex items-center justify-center gap-3 shadow-xl shadow-coral/10 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Generate Promos <ChevronRight className="w-5 h-5" /></>}
        </button>
      </div>
    </div>
  );
};

// ── LoadingState ───────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  pending: 'Queuing your request', Analyst: 'Analyzing your listing',
  'Hook Writer': 'Writing opening hooks', Director: 'Building your storyboard',
  Critic: 'Scoring the result', FrontendTTS: 'Synthesizing voice in browser',
};

const LoadingState = ({ jobId, onComplete, onError }: { jobId: string; onComplete: (r: GenerationResult, audioUrl: string | null) => void; onError: (m: string) => void }) => {
  const stages = [
    { key: 'Analyst', label: 'Listing Agent', sub: 'Analyzing your listing' },
    { key: 'Hook Writer', label: 'Hook Agent', sub: 'Writing opening hooks' },
    { key: 'Director', label: 'Storyboard Agent', sub: 'Mapping photos to scenes' },
    { key: 'Critic', label: 'Critic Agent', sub: 'Scoring the result' },
    { key: 'FrontendTTS', label: 'Voice Synthesis', sub: 'Generating narration in browser' },
  ];
  const [currentStage, setCurrentStage] = useState('pending');

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const res = await fetch(`${API_BASE}/api/status/${jobId}`);
          const data = await res.json();
          if (cancelled) return;
          setCurrentStage(data.stage || data.status);
          if (data.status === 'done') {
            setCurrentStage('FrontendTTS');
            let audioUrl: string | null = null;
            try {
              const script = data.result.scripts[data.result.selected_script_index];
              const scriptText = `${script.hook}. ${script.body_copy}. ${script.cta}`;
              const audioEl = await window.puter?.ai.txt2speech(scriptText);
              if (audioEl?.src) audioUrl = audioEl.src;
            } catch { /* TTS failed — continue without audio */ }
            if (!cancelled) onComplete(data.result, audioUrl);
            return;
          }
          if (data.status === 'error') { onError(data.error || 'Unknown error'); return; }
        } catch { /* keep polling */ }
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [jobId, onComplete, onError]);

  return (
    <div className="fixed inset-0 flex items-center justify-center p-8">
      <div className="max-w-md w-full card-surface p-10 space-y-8 text-center">
        <div className="w-16 h-16 bg-coral/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Sparkles className="w-8 h-8 text-coral animate-pulse" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-medium">Crafting your promos</h2>
          <p className="text-sm text-white/40">{STAGE_LABELS[currentStage] ?? 'Processing…'}</p>
        </div>
        <div className="space-y-4 text-left pt-4">
          {stages.map((stage, i) => {
            const stageIdx = stages.findIndex(s => s.key === currentStage);
            const status = stageIdx === -1 ? 'pending' : i < stageIdx ? 'done' : i === stageIdx ? 'loading' : 'pending';
            return (
              <div key={stage.key} className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${status === 'done' ? 'bg-green-500/20 text-green-500' : status === 'loading' ? 'bg-coral/20 text-coral' : 'bg-white/5 text-white/20'}`}>
                  {status === 'done' ? <Check className="w-4 h-4" /> : status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="text-[10px] font-bold">{i + 1}</span>}
                </div>
                <div>
                  <p className={`text-sm font-medium ${status === 'pending' ? 'text-white/20' : 'text-white'}`}>{stage.label}</p>
                  <p className="text-[11px] text-white/40">{stage.sub}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── ResultsView ────────────────────────────────────────────────────────────────

const ResultsView = ({ result, photos, audioUrl, listingMeta, onReset }: { result: GenerationResult; photos: Photo[]; audioUrl: string | null; listingMeta: ListingMeta | null; onReset: () => void }) => {
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mp4Blob, setMp4Blob] = useState<Blob | null>(null);

  const photoUrls = photos.map(p => p.url);
  const getPhotoSrc = (index: number) => photos[index]?.url ?? `https://picsum.photos/seed/promo${index}/1080/1920`;

  const totalFrames = result.scene_sequence.reduce(
    (acc, s) => acc + Math.round(s.duration_sec * VIDEO_FPS), 0
  );

  const handleExport = async () => {
    if (!canExportMp4()) {
      alert('Export requires a Chromium browser with WebCodecs support, such as current Chrome or Edge.');
      return;
    }
    setExporting(true);
    setExportProgress(0);
    try {
      const blob = await renderVideoToMp4(result.scene_sequence, photos.map(p => p.file), setExportProgress);
      setMp4Blob(blob);
      downloadBlob(blob, buildMp4Filename(listingMeta?.title));
    } catch (err: any) {
      console.error('Export failed:', err);
      alert(`Export failed: ${err?.message || err}`);
    } finally {
      setExporting(false);
    }
  };

  const handleSave = async () => {
    if (!user) {
      alert('Sign in before saving videos.');
      return;
    }
    if (saved) return;
    setSaving(true);
    try {
      // 1. Upload photos to persistent storage
      const persistentPhotoUrls: string[] = [];
      for (const photo of photos) {
        const ext = photo.file.name.match(/\.[^.]+$/)?.[0] || '.jpg';
        const path = `${user.id}/${crypto.randomUUID()}${ext}`;
        const { error } = await supabase.storage
          .from('saved-video-photos')
          .upload(path, photo.file, { contentType: photo.file.type });
        if (error) throw error;
        const { data } = supabase.storage.from('saved-video-photos').getPublicUrl(path);
        persistentPhotoUrls.push(data.publicUrl);
      }

      // 2. Render + upload MP4
      let mp4Url: string | null = null;
      let partialSaveMessage: string | null = null;
      if (canExportMp4()) {
        try {
          const blob = mp4Blob ?? await renderVideoToMp4(result.scene_sequence, photos.map(p => p.file), () => {});
          const mp4Path = `${user.id}/${crypto.randomUUID()}.mp4`;
          const { error: mp4Err } = await supabase.storage
            .from('saved-video-mp4s')
            .upload(mp4Path, blob, { contentType: 'video/mp4' });
          if (mp4Err) throw mp4Err;
          const { data: mp4Data } = supabase.storage.from('saved-video-mp4s').getPublicUrl(mp4Path);
          mp4Url = mp4Data.publicUrl;
          if (!mp4Blob) {
            setMp4Blob(blob);
          }
        } catch (err) {
          console.error('MP4 render/upload failed during save:', err);
          partialSaveMessage = `The promo was saved, but the MP4 file could not be attached. ${formatSaveError(err)}`;
        }
      }

      // 3. Insert row
      const { error: dbErr } = await supabase.from('saved_videos').insert({
        user_id: user.id,
        title: listingMeta?.title || 'Untitled',
        price: listingMeta?.price ? Number(listingMeta.price) : null,
        neighborhood: listingMeta?.neighborhood || null,
        hooks: result.hooks,
        scripts: result.scripts,
        selected_script_index: result.selected_script_index,
        scene_sequence: result.scene_sequence,
        photo_urls: persistentPhotoUrls,
        mp4_url: mp4Url,
        confidence_score: result.confidence_score,
        target_audience: result.market_positioning.target_audience,
        video_angle: result.market_positioning.video_angle,
        strengths: result.strengths,
        weaknesses: result.weaknesses,
        improvement_notes: result.improvement_notes,
      });
      if (dbErr) throw dbErr;
      setSaved(true);
      if (partialSaveMessage) {
        alert(partialSaveMessage);
      }
    } catch (err: any) {
      console.error('Save failed:', err);
      alert(`Save failed: ${formatSaveError(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const isSelected = (idx: number) => idx === result.selected_script_index;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-7xl mx-auto px-8 pb-20 space-y-12">
      <div className="flex flex-col md:flex-row items-center justify-between gap-8 pt-8">
        <div className="space-y-2">
          <h2 className="text-4xl font-medium">Your Promos are Ready</h2>
          <p className="text-sm text-white/40">Audience: <span className="text-white/70">{result.market_positioning.target_audience}</span> · Angle: <span className="text-white/70">{result.market_positioning.video_angle}</span></p>
        </div>
        <div className="flex gap-4">
          {[{ label: 'Confidence', value: result.confidence_score }, { label: 'Hooks', value: result.hooks.length }, { label: 'Scenes', value: result.scene_sequence.length }].map(s => (
            <div key={s.label} className="card-surface px-6 py-3 text-center min-w-[100px]">
              <div className="text-2xl font-bold text-coral">{s.value}</div>
              <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {result.scripts.map((script, idx) => (
          <div key={idx} className="space-y-6">
            <div className="text-[11px] uppercase tracking-widest text-white/40 font-bold text-center">{result.hooks[idx] ?? `Variant ${idx + 1}`}</div>

            {isSelected(idx) ? (
              /* ── Remotion Player for selected variant ── */
              <div className="aspect-[9/16] card-surface overflow-hidden rounded-xl border border-coral/30">
                <Player
                  component={VideoComposition}
                  inputProps={{ scenes: result.scene_sequence, photoUrls, audioUrl } as VideoCompositionProps}
                  durationInFrames={Math.max(totalFrames, 1)}
                  compositionWidth={VIDEO_WIDTH}
                  compositionHeight={VIDEO_HEIGHT}
                  fps={VIDEO_FPS}
                  controls
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            ) : (
              /* ── Static preview for non-selected variants ── */
              <div className="aspect-[9/16] card-surface overflow-hidden relative group cursor-pointer border-white/10 hover:border-coral/50 transition-colors">
                <img src={getPhotoSrc(idx)} className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 p-8 flex flex-col justify-between">
                  <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center self-end"><LayoutGrid className="w-4 h-4" /></div>
                  <div className="space-y-4">
                    <div className="bg-coral px-3 py-1 rounded text-[10px] font-bold uppercase w-fit tracking-wider">Hook</div>
                    <h3 className="text-xl font-medium leading-tight">{script.hook}</h3>
                    <p className="text-xs text-white/70 leading-relaxed line-clamp-3">{script.body_copy}</p>
                    <p className="text-xs text-coral font-semibold">{script.cta}</p>
                    {result.scene_sequence.length > 0 && (
                      <div className="flex gap-2 pt-2">
                        {result.scene_sequence.slice(0, 3).map((scene, si) => (
                          <div key={si} className="w-12 h-16 rounded bg-white/10 border border-white/20 overflow-hidden">
                            <img src={getPhotoSrc(scene.photo_index)} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3">
              {isSelected(idx) ? (
                <>
                  <button onClick={handleExport} disabled={exporting || !canExportMp4()}
                    className={`btn-coral w-full flex items-center justify-center gap-2 ${!canExportMp4() ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    {exporting
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Exporting {exportProgress}%</>
                      : <><Download className="w-4 h-4" /> Export MP4</>
                    }
                  </button>
                  <button onClick={handleSave} disabled={saving || saved}
                    className="btn-ghost w-full flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {saved ? <><Check className="w-4 h-4" /> Saved</>
                     : saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                     : <><Bookmark className="w-4 h-4" /> Save Video</>}
                  </button>
                </>
              ) : (
                <button className="btn-coral w-full flex items-center justify-center gap-2 opacity-40 cursor-not-allowed"><Download className="w-4 h-4" /> Download Assets</button>
              )}
              <button onClick={onReset} className="btn-ghost w-full flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4" /> Regenerate</button>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-surface p-6 space-y-3">
          <h4 className="text-xs uppercase tracking-widest text-green-400 font-bold">Strengths</h4>
          <ul className="space-y-2">{result.strengths.map((s, i) => <li key={i} className="text-sm text-white/70 flex gap-2"><Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />{s}</li>)}</ul>
        </div>
        <div className="card-surface p-6 space-y-3">
          <h4 className="text-xs uppercase tracking-widest text-yellow-400 font-bold">Weaknesses</h4>
          <ul className="space-y-2">{result.weaknesses.map((w, i) => <li key={i} className="text-sm text-white/70">{w}</li>)}</ul>
        </div>
        <div className="card-surface p-6 space-y-3">
          <h4 className="text-xs uppercase tracking-widest text-coral font-bold">Improvement Notes</h4>
          <ul className="space-y-2">{result.improvement_notes.map((n, i) => <li key={i} className="text-sm text-white/70">{n}</li>)}</ul>
        </div>
      </div>

      <div className="text-center pt-8">
        <button onClick={onReset} className="text-white/40 hover:text-coral transition-colors text-sm font-medium underline underline-offset-8">Generate Another</button>
      </div>
    </motion.div>
  );
};

// ── App ────────────────────────────────────────────────────────────────────────

export default function App() {
  const { user, loading, signOut } = useAuth();
  const [screen, setScreen] = useState<Screen>('input');
  const [page, setPage] = useState<Page>('landing');
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [submittedPhotos, setSubmittedPhotos] = useState<Photo[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listingMeta, setListingMeta] = useState<ListingMeta | null>(null);

  const handleGenerate = (id: string, photos: Photo[], meta: ListingMeta) => {
    setJobId(id); setSubmittedPhotos(photos); setListingMeta(meta); setError(null); setScreen('loading');
  };
  const handleComplete = (res: GenerationResult, audio: string | null) => { setAudioUrl(audio); setResult(res); setScreen('results'); };
  const handleError = (msg: string) => { setError(msg); setScreen('input'); };
  const handleReset = () => { setScreen('input'); setJobId(null); setResult(null); setAudioUrl(null); setError(null); setListingMeta(null); };
  const handleShowSaved = () => { setScreen('saved'); };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-coral animate-spin" /></div>;

  if (!user) {
    if (page === 'login' || page === 'signup') return <AuthPage defaultMode={page} onBack={() => setPage('landing')} />;
    return <LandingPage onLogin={() => setPage('login')} onSignUp={() => setPage('signup')} />;
  }

  return (
    <div className="min-h-screen flex flex-col selection:bg-coral/30 selection:text-coral">
      <Navbar onReset={handleReset} onShowSaved={handleShowSaved} onSignOut={signOut} />
      {error && (
        <div className="max-w-7xl mx-auto px-8 w-full">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">{error}</div>
        </div>
      )}
      <main className="flex-1 relative overflow-x-hidden">
        <AnimatePresence mode="wait">
          {screen === 'input' && (
            <motion.div key="input" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
              <InputForm onGenerate={handleGenerate} />
            </motion.div>
          )}
          {screen === 'loading' && jobId && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <LoadingState jobId={jobId} onComplete={handleComplete} onError={handleError} />
            </motion.div>
          )}
          {screen === 'results' && result && (
            <motion.div key="results" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
              <ResultsView result={result} photos={submittedPhotos} audioUrl={audioUrl} listingMeta={listingMeta} onReset={handleReset} />
            </motion.div>
          )}
          {screen === 'saved' && (
            <motion.div key="saved" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
              <SavedVideosPage onBack={handleReset} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-coral/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-coral/5 blur-[100px] rounded-full" />
      </div>
    </div>
  );
}
