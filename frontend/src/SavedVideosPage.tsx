import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft, Bookmark, Trash2, Download, Loader2, Check, X,
} from 'lucide-react';
import { Player } from '@remotion/player';
import { VideoComposition, VIDEO_WIDTH, VIDEO_HEIGHT, VIDEO_FPS } from './VideoComposition';
import type { VideoCompositionProps } from './VideoComposition';
import { buildMp4Filename, downloadUrlAsFile } from './downloads';
import { supabase } from './supabase';

interface ScriptVariant { hook: string; body_copy: string; cta: string }
interface SceneItem { photo_index: number; overlay_text: string; duration_sec: number; voiceover_segment: string }

interface SavedVideo {
  id: string;
  title: string;
  price: number | null;
  neighborhood: string | null;
  hooks: string[];
  scripts: ScriptVariant[];
  selected_script_index: number;
  scene_sequence: SceneItem[];
  photo_urls: string[];
  mp4_url: string | null;
  confidence_score: number;
  target_audience: string | null;
  video_angle: string | null;
  strengths: string[];
  weaknesses: string[];
  improvement_notes: string[];
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function SavedVideosPage({ onBack }: { onBack: () => void }) {
  const [videos, setVideos] = useState<SavedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SavedVideo | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('saved_videos')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) setVideos(data as SavedVideo[]);
      setLoading(false);
    })();
  }, []);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    const { error } = await supabase.from('saved_videos').delete().eq('id', id);
    if (!error) {
      setVideos(prev => prev.filter(v => v.id !== id));
      if (selected?.id === id) setSelected(null);
    }
    setDeleting(null);
  };

  const handleDownload = async (video: SavedVideo) => {
    if (!video.mp4_url) return;

    setDownloading(true);
    try {
      await downloadUrlAsFile(video.mp4_url, buildMp4Filename(video.title));
    } catch (err: any) {
      console.error('Download failed:', err);
      alert(`Download failed: ${err?.message || err}`);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-coral animate-spin" />
      </div>
    );
  }

  // ── Detail View ──
  if (selected) {
    const script = selected.scripts[selected.selected_script_index];
    const totalFrames = selected.scene_sequence.reduce(
      (acc, s) => acc + Math.round(s.duration_sec * VIDEO_FPS), 0,
    );

    return (
      <div className="max-w-7xl mx-auto px-8 pb-20 space-y-8">
        <div className="flex items-center gap-4 pt-4">
          <button onClick={() => setSelected(null)} className="btn-ghost p-2">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h2 className="text-3xl font-medium">{selected.title}</h2>
            <p className="text-sm text-white/40 mt-1">
              {selected.neighborhood}{selected.price ? ` · $${selected.price.toLocaleString()}/mo` : ''}
              {selected.target_audience ? ` · ${selected.target_audience}` : ''}
            </p>
          </div>
          <div className="card-surface px-4 py-2 text-center">
            <div className="text-xl font-bold text-coral">{selected.confidence_score}</div>
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Score</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Video Player */}
          <div className="space-y-4">
            {selected.mp4_url ? (
              <div className="aspect-[9/16] rounded-xl overflow-hidden border border-white/10">
                <video
                  src={selected.mp4_url}
                  controls
                  className="w-full h-full object-contain bg-black"
                />
              </div>
            ) : (
              <div className="aspect-[9/16] card-surface overflow-hidden rounded-xl border border-coral/30">
                <Player
                  component={VideoComposition}
                  inputProps={{ scenes: selected.scene_sequence, photoUrls: selected.photo_urls, audioUrl: null } as VideoCompositionProps}
                  durationInFrames={Math.max(totalFrames, 1)}
                  compositionWidth={VIDEO_WIDTH}
                  compositionHeight={VIDEO_HEIGHT}
                  fps={VIDEO_FPS}
                  controls
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            )}
            <div className="flex gap-3">
              {selected.mp4_url && (
                <button
                  onClick={() => handleDownload(selected)}
                  disabled={downloading}
                  className="btn-coral flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {downloading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Downloading...</>
                    : <><Download className="w-4 h-4" /> Download MP4</>
                  }
                </button>
              )}
              <button
                onClick={() => handleDelete(selected.id)}
                disabled={deleting === selected.id}
                className="btn-ghost flex-1 flex items-center justify-center gap-2 text-red-400 border-red-400/20 hover:bg-red-400/5"
              >
                {deleting === selected.id
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Trash2 className="w-4 h-4" />
                } Delete
              </button>
            </div>
          </div>

          {/* Script + Critique */}
          <div className="space-y-6">
            {script && (
              <div className="card-surface p-6 space-y-4">
                <h4 className="text-xs uppercase tracking-widest text-coral font-bold">Selected Script</h4>
                <div className="space-y-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Hook</div>
                    <p className="text-sm text-white/90">{script.hook}</p>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Body</div>
                    <p className="text-sm text-white/70">{script.body_copy}</p>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">CTA</div>
                    <p className="text-sm text-coral font-semibold">{script.cta}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4">
              {selected.strengths.length > 0 && (
                <div className="card-surface p-5 space-y-2">
                  <h4 className="text-xs uppercase tracking-widest text-green-400 font-bold">Strengths</h4>
                  <ul className="space-y-1.5">
                    {selected.strengths.map((s, i) => (
                      <li key={i} className="text-sm text-white/70 flex gap-2">
                        <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {selected.weaknesses.length > 0 && (
                <div className="card-surface p-5 space-y-2">
                  <h4 className="text-xs uppercase tracking-widest text-yellow-400 font-bold">Weaknesses</h4>
                  <ul className="space-y-1.5">
                    {selected.weaknesses.map((w, i) => (
                      <li key={i} className="text-sm text-white/70">{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {selected.improvement_notes.length > 0 && (
                <div className="card-surface p-5 space-y-2">
                  <h4 className="text-xs uppercase tracking-widest text-coral font-bold">Improvement Notes</h4>
                  <ul className="space-y-1.5">
                    {selected.improvement_notes.map((n, i) => (
                      <li key={i} className="text-sm text-white/70">{n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Grid View ──
  return (
    <div className="max-w-7xl mx-auto px-8 pb-20">
      <div className="flex items-center gap-4 pt-4 mb-8">
        <button onClick={onBack} className="btn-ghost p-2">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-3xl font-medium">Saved Videos</h2>
      </div>

      {videos.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-32 text-white/30">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
            <Bookmark className="w-8 h-8" />
          </div>
          <p className="text-lg font-medium">No saved videos yet</p>
          <p className="text-sm text-white/20">Generate a promo and save it to see it here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map(video => (
            <motion.div
              key={video.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="card-surface overflow-hidden cursor-pointer group transition-all hover:border-coral/30"
              onClick={() => setSelected(video)}
            >
              {/* Thumbnail */}
              <div className="aspect-[9/16] relative overflow-hidden">
                {video.photo_urls[0] ? (
                  <img
                    src={video.photo_urls[0]}
                    alt={video.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                ) : (
                  <div className="w-full h-full bg-white/5 flex items-center justify-center">
                    <Bookmark className="w-8 h-8 text-white/10" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />

                {/* Confidence badge */}
                <div className="absolute top-3 right-3 bg-coral px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                  {video.confidence_score} score
                </div>

                {/* MP4 badge */}
                {video.mp4_url && (
                  <div className="absolute top-3 left-3 bg-green-500/80 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                    MP4
                  </div>
                )}

                {/* Bottom info */}
                <div className="absolute bottom-0 left-0 right-0 p-4 space-y-1">
                  <h3 className="text-sm font-semibold leading-tight line-clamp-2">{video.title}</h3>
                  <p className="text-[11px] text-white/50">
                    {video.neighborhood}{video.price ? ` · $${video.price.toLocaleString()}` : ''}
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-[11px] text-white/30">{timeAgo(video.created_at)}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(video.id); }}
                  disabled={deleting === video.id}
                  className="text-white/20 hover:text-red-400 transition-colors p-1"
                >
                  {deleting === video.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2 className="w-3.5 h-3.5" />
                  }
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
