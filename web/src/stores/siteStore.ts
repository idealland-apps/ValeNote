import { create } from 'zustand';
import { publicApi } from '../services/api';
import { setTimezone } from '../utils/time';

interface SiteState {
  siteName: string;
  showPoweredBy: boolean;
  publicBasePath: string;
  timezone: string;
  loaded: boolean;
  loadSiteSettings: () => Promise<void>;
  reloadSiteSettings: () => Promise<void>;
}

export const useSiteStore = create<SiteState>()((set) => ({
  siteName: 'ValeNote',
  showPoweredBy: true,
  publicBasePath: '/public',
  timezone: 'UTC',
  loaded: false,

  loadSiteSettings: async () => {
    try {
      const res = await publicApi.getSettings();
      const tz = res.data.timezone || 'UTC';
      setTimezone(tz);
      set({
        siteName: res.data.site_name,
        showPoweredBy: res.data.show_powered_by,
        publicBasePath: res.data.public_base_path || '/public',
        timezone: tz,
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  reloadSiteSettings: async () => {
    try {
      const res = await publicApi.getSettings();
      const tz = res.data.timezone || 'UTC';
      setTimezone(tz);
      set({
        siteName: res.data.site_name,
        showPoweredBy: res.data.show_powered_by,
        publicBasePath: res.data.public_base_path || '/public',
        timezone: tz,
      });
    } catch {
      // ignore
    }
  },
}));
