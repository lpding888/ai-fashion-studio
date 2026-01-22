export type LearnPromptPack = {
    styleLearnPrompt: string;
    poseLearnPrompt: string;
};

export type PromptVersionMeta = {
    versionId: string;
    sha256: string;
    createdAt: number;
    createdBy: { id: string; username: string };
    note?: string;
};

export type PromptVersion = PromptVersionMeta & { pack: LearnPromptPack };

export type ActiveRef = {
    versionId: string;
    updatedAt: number;
    updatedBy: { id: string; username: string };
};
