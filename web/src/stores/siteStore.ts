import { create } from 'zustand';
import { publicApi } from '../services/api';

interface SiteState {
  siteName: string;
  loaded: boolean;
  loadSiteName: () => Promise<void>;
}

export const useSiteStore = create<SiteState>()((set, get) => ({
  siteName: 'ValeNote',
  loaded: false,

  loadSiteName: async () => {
    if (get().loaded) return;
    try {
      const res = await publicApi.getSiteName();
      set({ siteName: res.data.site_name, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
}));
