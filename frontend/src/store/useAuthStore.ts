import { create } from 'zustand';
import { ProviderID, DetectedAgent } from '../types/auth';

interface AuthState {
  linkedProviders: ProviderID[];
  detectedAgents: DetectedAgent[];
  isScanning: boolean;
  activeAuthenticatingProvider: ProviderID | null;
  
  setDetectedAgents: (detectedAgents: DetectedAgent[]) => void;
  setLinkedProviders: (linkedProviders: ProviderID[]) => void;
  setScanning: (isScanning: boolean) => void;
  setAuthenticating: (provider: ProviderID | null) => void;
  markProviderLinked: (provider: ProviderID) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  linkedProviders: [],
  detectedAgents: [],
  isScanning: false,
  activeAuthenticatingProvider: null,

  setDetectedAgents: (detectedAgents) => set({ detectedAgents }),
  setLinkedProviders: (linkedProviders) => set({ linkedProviders }),
  setScanning: (isScanning) => set({ isScanning }),
  setAuthenticating: (activeAuthenticatingProvider) => set({ activeAuthenticatingProvider }),
  
  markProviderLinked: (provider) =>
    set((state) => ({
      linkedProviders: state.linkedProviders.includes(provider)
        ? state.linkedProviders
        : [...state.linkedProviders, provider],
    })),
}));
