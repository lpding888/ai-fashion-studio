
export type FileSystemEntryLike = {
    isFile: boolean;
    isDirectory: boolean;
};

export type FileSystemFileEntryLike = FileSystemEntryLike & {
    file: (success: (file: File) => void, error?: (err: unknown) => void) => void;
};

export type FileSystemDirectoryEntryLike = FileSystemEntryLike & {
    createReader: () => {
        readEntries: (success: (entries: FileSystemEntryLike[]) => void, error?: (err: unknown) => void) => void;
    };
};

export type DataTransferItemWithEntry = DataTransferItem & {
    webkitGetAsEntry?: () => FileSystemEntryLike | null;
};

export async function readEntryFiles(entry: FileSystemEntryLike): Promise<File[]> {
    if (entry.isFile) {
        const fileEntry = entry as FileSystemFileEntryLike;
        return new Promise((resolve) => {
            fileEntry.file((file) => resolve([file]), () => resolve([]));
        });
    }
    if (entry.isDirectory) {
        const dirEntry = entry as FileSystemDirectoryEntryLike;
        const reader = dirEntry.createReader();
        const entries: FileSystemEntryLike[] = [];

        const readBatch = () =>
            new Promise<FileSystemEntryLike[]>((resolve) => {
                reader.readEntries(resolve, () => resolve([]));
            });

        let batch = await readBatch();
        while (batch.length) {
            entries.push(...batch);
            batch = await readBatch();
        }

        // Process sequentially or parallel - parallel is usually fine for local FS
        const nestedArrays = await Promise.all(entries.map((e) => readEntryFiles(e)));
        return nestedArrays.flat();
    }
    return [];
}

export async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
    const items = Array.from(dataTransfer.items || []);
    const entries = items
        .map((item) => (item as DataTransferItemWithEntry).webkitGetAsEntry?.())
        .filter(Boolean) as FileSystemEntryLike[];

    if (entries.length) {
        const nested = await Promise.all(entries.map((entry) => readEntryFiles(entry)));
        return nested.flat();
    }

    // Fallback for browsers without webkitGetAsEntry
    return Array.from(dataTransfer.files || []);
}
