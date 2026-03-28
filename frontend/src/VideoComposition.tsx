import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, useVideoConfig } from 'remotion';

export interface SceneItem {
  photo_index: number;
  overlay_text: string;
  duration_sec: number;
  voiceover_segment: string;
}

export interface VideoCompositionProps {
  scenes: SceneItem[];
  photoUrls: string[];
  audioUrl: string | null;
}

export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const VIDEO_FPS = 30;

export const VideoComposition: React.FC<VideoCompositionProps> = ({
  scenes,
  photoUrls,
  audioUrl,
}) => {
  const { fps } = useVideoConfig();

  let frameOffset = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {audioUrl && <Audio src={audioUrl} />}
      {scenes.map((scene, i) => {
        const durationInFrames = Math.round(scene.duration_sec * fps);
        const from = frameOffset;
        frameOffset += durationInFrames;

        const photoSrc =
          photoUrls[scene.photo_index] ??
          photoUrls[photoUrls.length - 1] ??
          '';

        return (
          <Sequence key={i} from={from} durationInFrames={durationInFrames}>
            <AbsoluteFill>
              <Img
                src={photoSrc}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              {scene.overlay_text && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 120,
                    left: 40,
                    right: 40,
                    padding: '16px 24px',
                    background: 'rgba(0,0,0,0.55)',
                    backdropFilter: 'blur(8px)',
                    borderRadius: 12,
                    color: '#fff',
                    fontSize: 52,
                    fontWeight: 700,
                    fontFamily: 'system-ui, sans-serif',
                    lineHeight: 1.25,
                    textShadow: '0 2px 8px rgba(0,0,0,0.8)',
                  }}
                >
                  {scene.overlay_text}
                </div>
              )}
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
