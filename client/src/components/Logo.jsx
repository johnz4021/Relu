import { useMemo } from 'react';
import katex from 'katex';

export default function Logo({ size = 'md' }) {
  const scale = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-3xl' : 'text-xl';

  const html = useMemo(() => {
    try {
      return katex.renderToString(
        String.raw`\operatorname{relu}_{\theta}`,
        { throwOnError: false, displayMode: false }
      );
    } catch {
      return null;
    }
  }, []);

  if (!html) {
    return <span className={`${scale} text-text-primary`}>relu</span>;
  }

  return (
    <span
      className={`${scale} text-accent [&_.katex]:text-inherit`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
