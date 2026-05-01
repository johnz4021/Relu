import { useMemo } from 'react';
import katex from 'katex';

/**
 * Renders the "argmax" logo in LaTeX math style, like: arg max_θ f(x)
 * Uses KaTeX for authentic Computer Modern serif rendering.
 */
export default function Logo({ size = 'md' }) {
  const scale = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-3xl' : 'text-xl';

  const html = useMemo(() => {
    try {
      return katex.renderToString(
        String.raw`\arg\max_{\theta}`,
        { throwOnError: false, displayMode: false }
      );
    } catch {
      return null;
    }
  }, []);

  if (!html) {
    return <span className={`${scale} text-text-primary`}>argmax</span>;
  }

  return (
    <span
      className={`${scale} text-accent [&_.katex]:text-inherit`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
