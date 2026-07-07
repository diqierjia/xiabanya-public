import { create } from 'zustand';
import type { AppSettings } from '../lib/types';
import { DEFAULT_SETTINGS } from '../lib/constants';
import { getXiabanyaApi } from '../hooks/useXiabanyaApi';

interface SettingsState {
  settings: AppSettings;
  loading: boolean;
  loaded: boolean;
  fetchSettings: () => Promise<void>;
  setSetting: (key: string, value: string | boolean | number) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: { ...DEFAULT_SETTINGS },
  loading: false,
  loaded: false,

  fetchSettings: async () => {
    set({ loading: true });
    try {
      const api = getXiabanyaApi();
      const raw = await api.settings.getAll();
      set({
        settings: {
          siliconflow_api_key: raw.siliconflow_api_key || DEFAULT_SETTINGS.siliconflow_api_key,
          vision_model: raw.vision_model || DEFAULT_SETTINGS.vision_model,
          report_model: raw.report_model || DEFAULT_SETTINGS.report_model,
          chat_model: raw.chat_model || DEFAULT_SETTINGS.chat_model,
          screenshot_interval: Number(raw.screenshot_interval) || DEFAULT_SETTINGS.screenshot_interval,
          keep_screenshots: raw.keep_screenshots === 'true',
          auto_start_tracker: raw.auto_start_tracker === 'true',
          auto_vision_toggle: raw.auto_vision_toggle === 'true',
          startup_with_windows: raw.startup_with_windows === 'true',
          desk_pet_enabled: raw.desk_pet_enabled === 'true',
        },
        loading: false,
        loaded: true,
      });
    } catch {
      set({ loading: false, loaded: true });
    }
  },

  setSetting: async (key, value) => {
    const api = getXiabanyaApi();
    await api.settings.set(key, String(value));
    set((s) => ({
      settings: {
        ...s.settings,
        [key]: typeof value === 'boolean' ? value : value,
      } as AppSettings,
    }));
  },
}));
