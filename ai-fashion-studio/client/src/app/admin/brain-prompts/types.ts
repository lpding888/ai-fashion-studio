export type PromptVersionMeta = {
    versionId: string;
    sha256: string;
    createdAt: number;
    createdBy: { id: string; username: string };
    note?: string;
};

export type PromptVersion = PromptVersionMeta & { content: string };

export type ActiveRef = {
    versionId: string;
    updatedAt: number;
    updatedBy: { id: string; username: string };
};

export type CompareShot = {
    shot_id?: string;
    id?: string;
    type?: string;
    prompt_en?: string;
    prompt?: string;
};

export type ComparePlan = {
    shots?: CompareShot[];
};

export type CompareResult = {
    success?: boolean;
    planA?: ComparePlan;
    planB?: ComparePlan;
    metaA?: { versionId?: string };
    metaB?: { versionId?: string };
};
