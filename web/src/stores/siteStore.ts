import { create } from 'zustand';
import { publicApi } from '../services/api';

interface SiteState {
  siteName: string;
  showPoweredBy: boolean;
  loaded: boolean;
  loadSiteSettings: () => Promise<void>;
}

export const useSiteStore = create<SiteState>()((set, get) => ({
  siteName: 'ValeNote',
  showPoweredBy: true,
  loaded: false,

  loadSiteSettings: async () => {
    if (get().loaded) return;
    try {
      const res = await publicApi.getSettings();
      set({
        siteName: res.data.site_name,
        showPoweredBy: res.data.show_powered_by,
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },
}));
