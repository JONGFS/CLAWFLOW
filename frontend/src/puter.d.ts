interface PuterAI {
  txt2speech(text: string): Promise<HTMLAudioElement>;
}

interface Puter {
  ai: PuterAI;
}

declare global {
  interface Window {
    puter: Puter;
  }
}

export {};
