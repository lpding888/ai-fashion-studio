export async function readDirectoryRecursively(entry: FileSystemEntry): Promise<File[]> {
    if (entry.isFile) {
        return new Promise<File[]>((resolve) => {
            (entry as FileSystemFileEntry).file((file) => {
                resolve([file]);
            });
        });
    } else if (entry.isDirectory) {
        const dirReader = (entry as FileSystemDirectoryEntry).createReader();
        const entries: FileSystemEntry[] = await new Promise((resolve, reject) => {
            const allEntries: FileSystemEntry[] = [];
            function read() {
                dirReader.readEntries((results) => {
                    if (results.length === 0) {
                        resolve(allEntries);
                    } else {
                        allEntries.push(...results);
                        read();
                    }
                }, reject);
            }
            read();
        });

        const files = await Promise.all(entries.map(readDirectoryRecursively));
        return files.flat();
    }
    return [];
}

type WebkitEntryItem = DataTransferItem & {
    webkitGetAsEntry?: () => FileSystemEntry | null;
};

export async function processDropItems(
    items: DataTransferItemList | null | undefined,
    files?: FileList | null
): Promise<{ files: File[]; groups: { name: string; files: File[] }[] }> {
    const flatFiles: File[] = [];
    const groups: { name: string; files: File[] }[] = [];

    const entries = (items ? Array.from(items) : [])
        .map((item) => {
            const webkitItem = item as WebkitEntryItem;
            return typeof webkitItem.webkitGetAsEntry === 'function' ? webkitItem.webkitGetAsEntry() : null;
        })
        .filter((entry): entry is FileSystemEntry => entry !== null);

    if (entries.length === 0 && files && files.length > 0) {
        const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
        return { files: imageFiles, groups };
    }

    for (const entry of entries) {
        if (entry.isDirectory) {
            // Treat top-level directories as groups
            const dirFiles = await readDirectoryRecursively(entry);
            const imageFiles = dirFiles.filter(f => f.type.startsWith('image/'));
            if (imageFiles.length > 0) {
                groups.push({
                    name: entry.name,
                    files: imageFiles
                });
            }
        } else if (entry.isFile) {
            const file = await new Promise<File>((resolve) => (entry as FileSystemFileEntry).file(resolve));
            if (file.type.startsWith('image/')) {
                flatFiles.push(file);
            }
        }
    }

    return { files: flatFiles, groups };
}
