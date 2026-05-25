import { create } from 'zustand';
import { publicApi } from '../services/api';

interface SiteState {
  siteName: string;
  showPoweredBy: boolean;
  publicBasePath: string;
  loaded: boolean;
  loadSiteSettings: () => Promise<void>;
  reloadSiteSettings: () => Promise<void>;
}

export const useSiteStore = create<SiteState>()((set) => ({
  siteName: 'ValeNote',
  showPoweredBy: true,
  publicBasePath: '/public',
  loaded: false,

  loadSiteSettings: async () => {
    try {
      const res = await publicApi.getSettings();
      set({
        siteName: res.data.site_name,
        showPoweredBy: res.data.show_powered_by,
        publicBasePath: res.data.public_base_path || '/public',
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  reloadSiteSettings: async () => {
    try {
      const res = await publicApi.getSettings();
      set({
        siteName: res.data.site_name,
        showPoweredBy: res.data.show_powered_by,
        publicBasePath: res.data.public_base_path || '/public',
      });
    } catch {
      // ignore
    }
  },
}));
