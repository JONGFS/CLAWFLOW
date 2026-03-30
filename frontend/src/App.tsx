/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload, Check, Loader2, ChevronRight, Plus, X, Download, RefreshCw,
  LayoutGrid, MapPin, DollarSign, Maximize, Sparkles, LogOut, Bed, Bath,
  Bookmark, Play, ExternalLink, Trash2,
} from 'lucide-react';
import { Player } from '@remotion/player';
import { VideoComposition, VIDEO_WIDTH, VIDEO_HEIGHT, VIDEO_FPS } from './VideoComposition';
import type { VideoCompositionProps } from './VideoComposition';
import { useAuth } from './AuthContext';
import AuthPage from './AuthPage';
import LandingPage from './LandingPage';
import { exportToMp4 } from './exportVideo';
import {
  deleteSavedVideo,
  listSavedVideos,
  uploadGeneratedVideo,
} from './uploadVideo';
import type { SavedVideo } from './uploadVideo';

const API_BASE = import.meta.env.VITE_API_URL || '';

// ── Types ──────────────────────────────────────────────────────────────────────

type Screen = 'input' | 'loading' | 'results' | 'saves';
type Page = 'landing' | 'login' | 'signup';
type ScriptMode = 'default' | 'brainrot';

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
  script_mode: ScriptMode;
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

// ── Navbar ─────────────────────────────────────────────────────────────────────

const Navbar = ({ onReset, onSaves, onSignOut }: { onReset: () => void; onSaves: () => void; onSignOut: () => void }) => (
  <nav className="flex flex-wrap items-center justify-between gap-3 py-6 px-4 sm:px-8 max-w-7xl mx-auto w-full">
    <div className="flex items-center gap-2 cursor-pointer" onClick={onReset}>
      <span className="logo text-2xl font-bold tracking-tight">LandlordFlip<span className="text-coral">.</span></span>
    </div>
    <div className="hidden md:flex items-center gap-8 text-sm font-medium text-white/60">
      <button onClick={onReset} className="hover:text-white transition-colors">Create</button>
      <button onClick={onSaves} className="hover:text-white transition-colors flex items-center gap-1.5">
        <Bookmark className="w-3.5 h-3.5" /> Saves
      </button>
    </div>
    <div className="flex items-center gap-2 md:hidden">
      <button onClick={onReset} className="btn-ghost text-xs flex items-center gap-1.5 px-3 py-2">
        <Plus className="w-3.5 h-3.5" /> Create
      </button>
      <button onClick={onSaves} className="btn-ghost text-xs flex items-center gap-1.5 px-3 py-2">
        <Bookmark className="w-3.5 h-3.5" /> Saves
      </button>
    </div>
    <button onClick={onSignOut} className="btn-ghost text-sm flex items-center gap-2">
      <LogOut className="w-4 h-4" /> Sign Out
    </button>
  </nav>
);

// ── InputForm ──────────────────────────────────────────────────────────────────

const InputForm = ({ onGenerate }: { onGenerate: (jobId: string, photos: Photo[], scriptMode: ScriptMode) => void }) => {
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
  const [scriptMode, setScriptMode] = useState<ScriptMode>('default');
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
      form.append('script_mode', scriptMode);
      photos.forEach(p => form.append('photos', p.file));
      const res = await fetch(`${API_BASE}/api/generate`, { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || 'Generation failed');
      onGenerate(json.job_id, photos, scriptMode);
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
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <>{scriptMode === 'brainrot' ? 'Generate Chaos' : 'Generate Promos'} <ChevronRight className="w-5 h-5" /></>}
        </button>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setScriptMode(prev => prev === 'brainrot' ? 'default' : 'brainrot')}
            className={`text-[10px] uppercase tracking-[0.35em] transition-colors ${scriptMode === 'brainrot' ? 'text-coral' : 'text-white/20 hover:text-white/50'}`}
            title="Definitely do not click this"
          >
            {scriptMode === 'brainrot' ? 'Brain Rot Mode Armed' : 'Do Not Click'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── LoadingState ───────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<ScriptMode, Record<string, string>> = {
  default: {
    pending: 'Queuing your request',
    Analyst: 'Analyzing your listing',
    'Hook Writer': 'Writing opening hooks',
    Director: 'Building your storyboard',
    Critic: 'Scoring the result',
    FrontendTTS: 'Synthesizing voice in browser',
  },
  brainrot: {
    pending: 'Charging the cursed vibes',
    Analyst: 'Vibe checking your listing',
    'Hook Writer': 'Cooking maximum brain rot',
    Director: 'Shuffling the chaos montage',
    Critic: 'Judging the cringe levels',
    FrontendTTS: 'Synthesizing the yap track',
  },
};

const LoadingState = ({
  jobId,
  scriptMode,
  onComplete,
  onError,
}: {
  jobId: string;
  scriptMode: ScriptMode;
  onComplete: (r: GenerationResult, audioUrl: string | null) => void;
  onError: (m: string) => void;
}) => {
  const stages = scriptMode === 'brainrot'
    ? [
        { key: 'Analyst', label: 'Aura Agent', sub: 'Clocking the listing energy' },
        { key: 'Hook Writer', label: 'Brain Rot Goblin', sub: 'Writing unusable internet nonsense' },
        { key: 'Director', label: 'Clip Farmer', sub: 'Stacking stills into pure delusion' },
        { key: 'Critic', label: 'Cringe Inspector', sub: 'Scoring the mess' },
        { key: 'FrontendTTS', label: 'Yap Synth', sub: 'Turning slop into speech' },
      ]
    : [
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
          <p className="text-sm text-white/40">{STAGE_LABELS[scriptMode][currentStage] ?? 'Processing…'}</p>
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

// ── SavesPage ─────────────────────────────────────────────────────────────────

const SavesPage = ({ onBack }: { onBack: () => void }) => {
  const { user, session } = useAuth();
  const [videos, setVideos] = useState<SavedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchVideos = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      if (!user || !session?.access_token) {
        setVideos([]);
        return;
      }

      setVideos(await listSavedVideos(session.access_token));
    } catch (err) {
      console.error('Failed to fetch saved videos:', err);
      setVideos([]);
      setFeedback(err instanceof Error ? err.message : 'Failed to load saved videos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchVideos(); }, [session?.access_token, user?.id]);

  const handleDelete = async (path: string) => {
    if (!confirm('Delete this video? This cannot be undone.')) return;
    if (!session?.access_token) {
      setFeedback('Your session expired. Please sign in again.');
      return;
    }

    const deletedVideo = videos.find((video) => video.path === path);
    const previousVideos = videos;
    const shouldClearPlayer = deletedVideo?.signedUrl === playingUrl;
    setDeleting(path);
    setFeedback(null);
    if (shouldClearPlayer) {
      setPlayingUrl(null);
    }
    setVideos((prev) => prev.filter((video) => video.path !== path));
    try {
      await deleteSavedVideo(session.access_token, path);
    } catch (err) {
      console.error('Delete failed:', err);
      try {
        const refreshedVideos = await listSavedVideos(session.access_token);
        setVideos(refreshedVideos);
        if (refreshedVideos.some((video) => video.path === path)) {
          if (shouldClearPlayer) {
            setPlayingUrl(deletedVideo?.signedUrl ?? null);
          }
          setFeedback(err instanceof Error ? err.message : 'Delete failed');
        }
      } catch (refreshErr) {
        console.error('Failed to verify delete state:', refreshErr);
        setVideos(previousVideos);
        if (shouldClearPlayer) {
          setPlayingUrl(deletedVideo?.signedUrl ?? null);
        }
        setFeedback(err instanceof Error ? err.message : 'Delete failed');
      }
    } finally {
      setDeleting(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-5xl mx-auto px-8 pb-20 pt-8 space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-medium">Saved Videos</h2>
          <p className="text-sm text-white/40">{videos.length} video{videos.length !== 1 ? 's' : ''} in cloud storage</p>
        </div>
        <button onClick={onBack} className="btn-ghost text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Promo
        </button>
      </div>
      {feedback && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {feedback}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-coral animate-spin" />
        </div>
      ) : videos.length === 0 ? (
        <div className="text-center py-20 space-y-4">
          <Bookmark className="w-12 h-12 text-white/20 mx-auto" />
          <p className="text-white/40">No saved videos yet</p>
          <p className="text-white/30 text-sm">Export a promo to see it here</p>
          <button onClick={onBack} className="btn-coral mt-4">Create Your First Promo</button>
        </div>
      ) : (
        <div className="space-y-6">
          {playingUrl && (
            <div className="card-surface p-4 rounded-xl border border-coral/30">
              <video
                src={playingUrl}
                controls
                autoPlay
                className="w-full max-h-[70vh] rounded-lg bg-black mx-auto"
                style={{ aspectRatio: '9/16', maxWidth: 400 }}
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {videos.map((video) => (
              <div key={video.path} className="card-surface rounded-xl overflow-hidden border border-white/10 hover:border-coral/30 transition-colors group">
                <div
                  className="aspect-[9/16] bg-black/50 flex items-center justify-center cursor-pointer relative"
                  onClick={() => setPlayingUrl(playingUrl === video.signedUrl ? null : video.signedUrl)}
                >
                  <video
                    src={video.signedUrl}
                    muted
                    preload="metadata"
                    className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-coral/80 backdrop-blur flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Play className="w-6 h-6 text-white ml-1" />
                    </div>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs text-white/40">
                    <span>{formatDate(video.createdAt)}</span>
                    <span>{formatSize(video.size)}</span>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={video.signedUrl}
                      download
                      className="btn-coral flex-1 text-xs flex items-center justify-center gap-1.5 py-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Download className="w-3.5 h-3.5" /> Download
                    </a>
                    <a
                      href={video.signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-ghost text-xs flex items-center justify-center gap-1.5 py-2 px-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(video.path); }}
                      disabled={deleting === video.path}
                      className="btn-ghost text-xs flex items-center justify-center gap-1.5 py-2 px-3 hover:text-red-400 hover:border-red-400/30"
                    >
                      {deleting === video.path ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
};

// ── ResultsView ────────────────────────────────────────────────────────────────

const ResultsView = ({ result, photos, audioUrl, onReset }: { result: GenerationResult; photos: Photo[]; audioUrl: string | null; onReset: () => void }) => {
  const { session } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'failed' | null>(null);
  const canExport = typeof window.VideoEncoder !== 'undefined';

  const photoUrls = photos.map(p => p.url);
  const getPhotoSrc = (index: number) => photos[index]?.url ?? `https://picsum.photos/seed/promo${index}/1080/1920`;

  const totalFrames = result.scene_sequence.reduce(
    (acc, s) => acc + Math.round(s.duration_sec * VIDEO_FPS), 0
  );

  const handleExport = async () => {
    if (!canExport) {
      alert('Export requires Chrome 94+ or Edge 94+');
      return;
    }
    setExporting(true);
    setExportProgress(0);
    setSaveStatus(null);
    try {
      const blob = await exportToMp4({
        scenes: result.scene_sequence,
        photoUrls,
        audioUrl,
        fps: VIDEO_FPS,
        width: VIDEO_WIDTH,
        height: VIDEO_HEIGHT,
        totalFrames,
        onProgress: setExportProgress,
      });

      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `landlordflip-promo.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Save to the user's private cloud library
      try {
        if (!session?.access_token) throw new Error('Must be signed in to save');
        await uploadGeneratedVideo(session.access_token, blob);
        setSaveStatus('saved');
      } catch (uploadErr) {
        console.warn('Video save failed after download:', uploadErr);
        setSaveStatus('failed');
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setExporting(false);
    }
  };

  const isSelected = (idx: number) => idx === result.selected_script_index;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-7xl mx-auto px-8 pb-20 space-y-12">
      <div className="flex flex-col md:flex-row items-center justify-between gap-8 pt-8">
        <div className="space-y-2">
          <h2 className="text-4xl font-medium">Your Promos are Ready</h2>
          <p className="text-sm text-white/40">
            Audience: <span className="text-white/70">{result.market_positioning.target_audience}</span> ·
            Angle: <span className="text-white/70"> {result.market_positioning.video_angle}</span>
            {result.script_mode === 'brainrot' && <span className="ml-2 inline-flex rounded-full border border-coral/40 bg-coral/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-coral">Brain Rot</span>}
          </p>
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
                <div className="space-y-2">
                  <button onClick={handleExport} disabled={exporting || !canExport}
                    className={`btn-coral w-full flex items-center justify-center gap-2 ${!canExport ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    {exporting
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Exporting {exportProgress}%</>
                      : <><Download className="w-4 h-4" /> Export MP4</>
                    }
                  </button>
                  {exporting && (
                    <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                      <div className="bg-coral h-full rounded-full transition-all duration-300" style={{ width: `${exportProgress}%` }} />
                    </div>
                  )}
                  {saveStatus === 'saved' && (
                    <p className="text-xs text-green-400 text-center">Saved privately to your cloud library</p>
                  )}
                  {saveStatus === 'failed' && (
                    <p className="text-xs text-yellow-300 text-center">Downloaded locally, but cloud save failed</p>
                  )}
                </div>
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
  const [scriptMode, setScriptMode] = useState<ScriptMode>('default');

  const handleGenerate = (id: string, photos: Photo[], mode: ScriptMode) => {
    setJobId(id); setSubmittedPhotos(photos); setScriptMode(mode); setError(null); setScreen('loading');
  };
  const handleComplete = (res: GenerationResult, audio: string | null) => { setAudioUrl(audio); setResult(res); setScreen('results'); };
  const handleError = (msg: string) => { setError(msg); setScreen('input'); };
  const handleReset = () => { setScreen('input'); setJobId(null); setResult(null); setAudioUrl(null); setError(null); };
  const handleSaves = () => { setScreen('saves'); };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-coral animate-spin" /></div>;

  if (!user) {
    if (page === 'login' || page === 'signup') return <AuthPage defaultMode={page} onBack={() => setPage('landing')} />;
    return <LandingPage onLogin={() => setPage('login')} onSignUp={() => setPage('signup')} />;
  }

  return (
    <div className="min-h-screen flex flex-col selection:bg-coral/30 selection:text-coral">
      <Navbar onReset={handleReset} onSaves={handleSaves} onSignOut={signOut} />
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
              <LoadingState jobId={jobId} scriptMode={scriptMode} onComplete={handleComplete} onError={handleError} />
            </motion.div>
          )}
          {screen === 'results' && result && (
            <motion.div key="results" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
              <ResultsView result={result} photos={submittedPhotos} audioUrl={audioUrl} onReset={handleReset} />
            </motion.div>
          )}
          {screen === 'saves' && (
            <motion.div key="saves" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
              <SavesPage onBack={handleReset} />
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
