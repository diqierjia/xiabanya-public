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

function readBooleanSetting(raw: Record<string, string>, key: keyof AppSettings): boolean {
  const value = raw[key];
  return value === undefined ? Boolean(DEFAULT_SETTINGS[key]) : value === 'true';
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
          custom_api_enabled: readBooleanSetting(raw, 'custom_api_enabled'),
          custom_api_base_url: raw.custom_api_base_url || DEFAULT_SETTINGS.custom_api_base_url,
          vision_model: raw.vision_model || DEFAULT_SETTINGS.vision_model,
          report_model: raw.report_model || DEFAULT_SETTINGS.report_model,
          chat_model: raw.chat_model || DEFAULT_SETTINGS.chat_model,
          screenshot_interval: Number(raw.screenshot_interval) || DEFAULT_SETTINGS.screenshot_interval,
          keep_screenshots: readBooleanSetting(raw, 'keep_screenshots'),
          auto_start_tracker: readBooleanSetting(raw, 'auto_start_tracker'),
          auto_vision_toggle: readBooleanSetting(raw, 'auto_vision_toggle'),
          startup_with_windows: readBooleanSetting(raw, 'startup_with_windows'),
          desk_pet_enabled: readBooleanSetting(raw, 'desk_pet_enabled'),
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
