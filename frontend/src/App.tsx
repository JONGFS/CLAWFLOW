/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload,
  Check,
  Loader2,
  ChevronRight,
  Plus,
  X,
  Download,
  RefreshCw,
  LayoutGrid,
  MapPin,
  DollarSign,
  Maximize,
  Sparkles,
  LogOut,
  Bed,
  Bath
} from 'lucide-react';
import { useAuth } from './AuthContext';
import AuthPage from './AuthPage';
import LandingPage from './LandingPage';
import { submitListing, NormalizedListing } from './api';

// --- Types ---
type Screen = 'input' | 'loading' | 'results';

interface Photo {
  id: string;
  url: string;
  label: string;
  file: File;
}

// --- Components ---

const Navbar = ({ onReset, onSignOut }: { onReset: () => void; onSignOut: () => void }) => (
  <nav className="flex items-center justify-between py-6 px-8 max-w-7xl mx-auto w-full">
    <div className="flex items-center gap-2 cursor-pointer" onClick={onReset}>
      <span className="logo text-2xl font-bold tracking-tight">
        LandlordFlip<span className="text-coral">.</span>
      </span>
    </div>
    <div className="hidden md:flex items-center gap-8 text-sm font-medium text-white/60">
      <a href="#" className="hover:text-white transition-colors">How it works</a>
      <a href="#" className="hover:text-white transition-colors">Pricing</a>
    </div>
    <button onClick={onSignOut} className="btn-ghost text-sm flex items-center gap-2">
      <LogOut className="w-4 h-4" /> Sign Out
    </button>
  </nav>
);

const InputForm = ({ onSubmit }: { onSubmit: (listing: NormalizedListing) => void }) => {
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [beds, setBeds] = useState('');
  const [baths, setBaths] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [squareFootage, setSquareFootage] = useState('');
  const [leasingSpecial, setLeasingSpecial] = useState('');
  const [amenities, setAmenities] = useState<string[]>([]);
  const [targetRenter, setTargetRenter] = useState<string>('Young Professional');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const amenityOptions = ['Gym', 'Pool', 'Parking', 'Pet Friendly', 'Furnished', 'Rooftop'];
  const targetOptions = ['Student', 'Young Professional', 'Budget Renter'];
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  const addFiles = (files: FileList | File[]) => {
    const newPhotos: Photo[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > MAX_FILE_SIZE) continue;
      const id = crypto.randomUUID().slice(0, 12);
      newPhotos.push({
        id,
        url: URL.createObjectURL(file),
        label: file.name.replace(/\.[^.]+$/, ''),
        file,
      });
    }
    setPhotos(prev => [...prev, ...newPhotos]);
  };

  const removePhoto = (id: string) => {
    setPhotos(prev => {
      const photo = prev.find(p => p.id === id);
      if (photo) URL.revokeObjectURL(photo.url);
      return prev.filter(p => p.id !== id);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const toggleAmenity = (amenity: string) => {
    setAmenities(prev =>
      prev.includes(amenity) ? prev.filter(a => a !== amenity) : [...prev, amenity]
    );
  };

  const validate = (): Record<string, string> => {
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
      const result = await submitListing({
        title: title.trim(),
        price: Number(price),
        beds: Number(beds),
        baths: Number(baths),
        neighborhood: neighborhood.trim(),
        squareFootage: squareFootage ? Number(squareFootage) : undefined,
        amenities,
        persona: targetRenter || undefined,
        leasingSpecial: leasingSpecial.trim() || undefined,
        photos: photos.map(p => p.file),
      });
      onSubmit(result);
    } catch (err: any) {
      setSubmitError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-8 pb-20 grid grid-cols-1 lg:grid-cols-2 gap-12 mt-8">
      {/* Left Column: Form */}
      <div className="space-y-8">
        <div className="space-y-4">
          <h2 className="text-3xl font-medium">Listing Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">Listing Title</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Modern Loft in SoHo" className={`w-full input-field ${errors.title ? 'border-red-400' : ''}`} />
              {errors.title && <p className="text-red-400 text-xs">{errors.title}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">Rent Price</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="3200" className={`w-full input-field pl-9 ${errors.price ? 'border-red-400' : ''}`} />
              </div>
              {errors.price && <p className="text-red-400 text-xs">{errors.price}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">Neighborhood</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input type="text" value={neighborhood} onChange={e => setNeighborhood(e.target.value)} placeholder="Manhattan, NY" className={`w-full input-field pl-9 ${errors.neighborhood ? 'border-red-400' : ''}`} />
              </div>
              {errors.neighborhood && <p className="text-red-400 text-xs">{errors.neighborhood}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">Square Footage</label>
              <div className="relative">
                <Maximize className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input type="number" value={squareFootage} onChange={e => setSquareFootage(e.target.value)} placeholder="850" className="w-full input-field pl-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">Beds</label>
              <div className="relative">
                <Bed className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input type="number" value={beds} onChange={e => setBeds(e.target.value)} placeholder="2" min="0" className={`w-full input-field pl-9 ${errors.beds ? 'border-red-400' : ''}`} />
              </div>
              {errors.beds && <p className="text-red-400 text-xs">{errors.beds}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">Baths</label>
              <div className="relative">
                <Bath className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input type="number" value={baths} onChange={e => setBaths(e.target.value)} placeholder="1" min="0" className={`w-full input-field pl-9 ${errors.baths ? 'border-red-400' : ''}`} />
              </div>
              {errors.baths && <p className="text-red-400 text-xs">{errors.baths}</p>}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <label className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">Amenities</label>
          <div className="flex flex-wrap gap-2">
            {amenityOptions.map(option => (
              <button
                key={option}
                onClick={() => toggleAmenity(option)}
                className={`px-4 py-2 rounded-full text-xs font-medium border transition-all ${
                  amenities.includes(option)
                    ? 'bg-coral border-coral text-white'
                    : 'bg-white/5 border-white/10 text-white/60 hover:border-white/20'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <label className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">Target Renter</label>
          <div className="grid grid-cols-3 gap-4">
            {targetOptions.map(option => (
              <button
                key={option}
                onClick={() => setTargetRenter(option)}
                className={`p-4 card-surface text-center transition-all border ${
                  targetRenter === option ? 'border-coral ring-1 ring-coral' : 'border-white/10'
                }`}
              >
                <div className="text-xs font-medium">{option}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">Leasing Special (Optional)</label>
          <input type="text" value={leasingSpecial} onChange={e => setLeasingSpecial(e.target.value)} placeholder="e.g. First month free on 12-month lease" className="w-full input-field" />
        </div>
      </div>

      {/* Right Column: Upload */}
      <div className="space-y-8">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) { addFiles(e.target.files); e.target.value = ''; } }}
        />

        <div className="space-y-4">
          <h2 className="text-3xl font-medium">Property Photos</h2>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center gap-4 transition-colors cursor-pointer ${
              dragOver ? 'border-coral bg-coral/5' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'
            }`}
          >
            <div className="w-12 h-12 rounded-full bg-coral/10 flex items-center justify-center">
              <Upload className="w-6 h-6 text-coral" />
            </div>
            <div className="text-center">
              <p className="font-medium">Drag and drop photos</p>
              <p className="text-xs text-white/40 mt-1">PNG, JPG up to 10MB</p>
            </div>
          </div>
        </div>

        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {photos.map((photo, idx) => (
              <div key={photo.id} className="space-y-2 group">
                <div className="aspect-[3/4] rounded-lg overflow-hidden relative border border-white/10">
                  <img src={photo.url} alt={photo.label} className="w-full h-full object-cover" />
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => removePhoto(photo.id)}
                      className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-black"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-sm rounded text-[10px] uppercase tracking-tighter font-bold">
                    {String(idx + 1).padStart(2, '0')}
                  </div>
                </div>
                <input
                  type="text"
                  value={photo.label}
                  onChange={(e) => setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, label: e.target.value } : p))}
                  className="w-full bg-transparent text-[11px] text-white/60 text-center focus:text-white outline-none"
                />
              </div>
            ))}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="aspect-[3/4] rounded-lg border border-dashed border-white/10 flex flex-col items-center justify-center gap-2 hover:bg-white/[0.02] transition-colors"
            >
              <Plus className="w-5 h-5 text-white/20" />
              <span className="text-[10px] text-white/20 uppercase font-bold">Add Photo</span>
            </button>
          </div>
        )}</div>

      {/* Full Width Button */}
      <div className="lg:col-span-2 pt-8 space-y-3">
        {submitError && (
          <p className="text-red-400 text-sm text-center">{submitError}</p>
        )}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full btn-coral py-5 text-lg flex items-center justify-center gap-3 shadow-xl shadow-coral/10 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>Generate Promos <ChevronRight className="w-5 h-5" /></>
          )}
        </button>
      </div>
    </div>
  );
};

const LoadingState = ({ onComplete }: { onComplete: () => void }) => {
  const [steps, setSteps] = useState([
    { id: 1, label: 'Listing Agent', sub: 'Analyzing your listing', status: 'loading' },
    { id: 2, label: 'Hook Agent', sub: 'Writing opening hooks', status: 'pending' },
    { id: 3, label: 'Script Agent', sub: 'Building your video script', status: 'pending' },
    { id: 4, label: 'Storyboard Agent', sub: 'Mapping photos to scenes', status: 'pending' },
  ]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSteps(prev => {
        const next = [...prev];
        const currentIdx = next.findIndex(s => s.status === 'loading');
        if (currentIdx !== -1) {
          next[currentIdx].status = 'done';
          if (currentIdx + 1 < next.length) {
            next[currentIdx + 1].status = 'loading';
          } else {
            clearInterval(timer);
            setTimeout(onComplete, 1000);
          }
        }
        return next;
      });
    }, 1500);
    return () => clearInterval(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 flex items-center justify-center p-8">
      <div className="max-w-md w-full card-surface p-10 space-y-8 text-center">
        <div className="w-16 h-16 bg-coral/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Sparkles className="w-8 h-8 text-coral animate-pulse" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-medium">Crafting your promos</h2>
          <p className="text-sm text-white/40">Our AI agents are working on your listing...</p>
        </div>
        <div className="space-y-4 text-left pt-4">
          {steps.map(step => (
            <div key={step.id} className="flex items-center justify-between group">
              <div className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  step.status === 'done' ? 'bg-green-500/20 text-green-500' : 
                  step.status === 'loading' ? 'bg-coral/20 text-coral' : 'bg-white/5 text-white/20'
                }`}>
                  {step.status === 'done' ? <Check className="w-4 h-4" /> : 
                   step.status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : 
                   <span className="text-[10px] font-bold">{step.id}</span>}
                </div>
                <div>
                  <p className={`text-sm font-medium ${step.status === 'pending' ? 'text-white/20' : 'text-white'}`}>
                    {step.label}
                  </p>
                  <p className="text-[11px] text-white/40">{step.sub}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ResultsView = ({ onReset }: { onReset: () => void }) => {
  const cards = [
    { type: "What $X gets you", hook: "Wait until you see the kitchen..." },
    { type: "Lifestyle near campus", hook: "3 mins from the best coffee shop." },
    { type: "Tour this before it's gone", hook: "The perfect loft doesn't exi—" },
  ];

  const scores = [
    { label: 'Hook Strength', value: 9.2 },
    { label: 'Leasing Appeal', value: 8.8 },
    { label: 'Urgency', value: 9.5 },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto px-8 pb-20 space-y-12"
    >
      <div className="flex flex-col md:flex-row items-center justify-between gap-8 pt-8">
        <div className="space-y-2">
          <h2 className="text-4xl font-medium">Your Promos are Ready</h2>
          <p className="text-sm text-white/40">We've generated 3 high-converting video concepts.</p>
        </div>
        <div className="flex gap-4">
          {scores.map(score => (
            <div key={score.label} className="card-surface px-6 py-3 text-center min-w-[120px]">
              <div className="text-2xl font-bold text-coral">{score.value}</div>
              <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold">{score.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {cards.map((card, idx) => (
          <div key={idx} className="space-y-6">
            <div className="text-[11px] uppercase tracking-widest text-white/40 font-bold text-center">
              {card.type}
            </div>
            <div className="aspect-[9/16] card-surface overflow-hidden relative group cursor-pointer border-white/10 hover:border-coral/50 transition-colors">
              <img 
                src={`https://picsum.photos/seed/promo${idx}/1080/1920`} 
                className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700" 
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 p-8 flex flex-col justify-between">
                <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center self-end">
                  <LayoutGrid className="w-4 h-4" />
                </div>
                <div className="space-y-4">
                  <div className="bg-coral px-3 py-1 rounded text-[10px] font-bold uppercase w-fit tracking-wider">
                    Hook
                  </div>
                  <h3 className="text-2xl font-medium leading-tight">
                    {card.hook}
                  </h3>
                  <div className="flex gap-2 pt-4">
                    {[1,2,3].map(i => (
                      <div key={i} className="w-12 h-16 rounded bg-white/10 border border-white/20 overflow-hidden">
                        <img src={`https://picsum.photos/seed/thumb${idx}${i}/100/150`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <button className="btn-coral w-full flex items-center justify-center gap-2">
                <Download className="w-4 h-4" /> Download Assets
              </button>
              <button className="btn-ghost w-full flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4" /> Regenerate
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center pt-8">
        <button 
          onClick={onReset}
          className="text-white/40 hover:text-coral transition-colors text-sm font-medium underline underline-offset-8"
        >
          Generate Another
        </button>
      </div>
    </motion.div>
  );
};

type Page = 'landing' | 'login' | 'signup';

export default function App() {
  const { user, loading, signOut } = useAuth();
  const [screen, setScreen] = useState<Screen>('input');
  const [page, setPage] = useState<Page>('landing');
  const [listing, setListing] = useState<NormalizedListing | null>(null);

  const handleSubmit = (result: NormalizedListing) => {
    setListing(result);
    setScreen('loading');
  };
  const handleComplete = () => setScreen('results');
  const handleReset = () => { setScreen('input'); setListing(null); };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-coral animate-spin" />
      </div>
    );
  }

  if (!user) {
    if (page === 'login' || page === 'signup') {
      return (
        <AuthPage
          defaultMode={page}
          onBack={() => setPage('landing')}
        />
      );
    }
    return (
      <LandingPage
        onLogin={() => setPage('login')}
        onSignUp={() => setPage('signup')}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col selection:bg-coral/30 selection:text-coral">
      <Navbar onReset={handleReset} onSignOut={signOut} />
      
      <main className="flex-1 relative overflow-x-hidden">
        <AnimatePresence mode="wait">
          {screen === 'input' && (
            <motion.div
              key="input"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <InputForm onSubmit={handleSubmit} />
            </motion.div>
          )}

          {screen === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <LoadingState onComplete={handleComplete} />
            </motion.div>
          )}

          {screen === 'results' && (
            <motion.div
              key="results"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <ResultsView onReset={handleReset} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Decorative background elements */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-coral/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-coral/5 blur-[100px] rounded-full" />
      </div>
    </div>
  );
}
