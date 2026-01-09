
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
    // Workflow Settings
    autoApprove: boolean;  // Auto-approve mode (skip manual prompt review)

    setAutoApprove: (value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            autoApprove: false, // Default to manual review

            setAutoApprove: (value) => set({ autoApprove: value }),
        }),
        {
            name: 'ai-fashion-settings-v3', // 不再在前端保存任何密钥/网关/模型配置
        }
    )
);
