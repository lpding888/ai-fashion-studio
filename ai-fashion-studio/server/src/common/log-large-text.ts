export function logLargeText(params: {
  log: (message: any) => void;
  header: string;
  text: string;
  chunkSize?: number; // must be < admin-log MAX_STRING_LEN (4000)
  maxLen?: number; // hard cap to prevent runaway logs
}) {
  const chunkSize = Math.max(500, Math.min(3600, params.chunkSize ?? 3200));
  const maxLen = Math.max(1000, Math.min(200_000, params.maxLen ?? 120_000));

  const raw = String(params.text ?? '');
  const truncated = raw.length > maxLen;
  const body = truncated ? raw.slice(0, maxLen) : raw;

  const total = Math.max(1, Math.ceil(body.length / chunkSize));
  params.log(
    `${params.header} (len=${raw.length}, chunks=${total}${truncated ? `, truncated_to=${maxLen}` : ''})`,
  );

  for (let i = 0; i < total; i++) {
    const start = i * chunkSize;
    const end = Math.min(body.length, start + chunkSize);
    const chunk = body.slice(start, end);
    params.log(`${params.header} [${i + 1}/${total}]\n${chunk}`);
  }
}
