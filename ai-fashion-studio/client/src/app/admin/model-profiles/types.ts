export type ModelProfileKind = 'BRAIN' | 'PAINTER';
export type ModelProvider = 'GEMINI' | 'OPENAI_COMPAT';

export type ModelProfilePublic = {
    id: string;
    kind: ModelProfileKind;
    provider: ModelProvider;
    name: string;
    gateway: string;
    model: string;
    keyMasked: string;
    disabled?: boolean;
    createdAt: number;
    createdBy: { id: string; username: string };
    updatedAt: number;
    updatedBy: { id: string; username: string };
};

export type ActiveMap = { BRAIN?: string; PAINTER?: string };
export type ActivePoolMap = { BRAIN?: string[]; PAINTER?: string[] };

export type ModelProfileGroup = {
    kind: ModelProfileKind;
    provider: ModelProvider;
    gateway: string;
    model: string;
    profiles: ModelProfilePublic[];
};
