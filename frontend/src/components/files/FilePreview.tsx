import React, { useEffect, useState } from 'react';
import { ProjectFile } from '../../../wailsjs/go/main/App';
import { files } from '../../../wailsjs/go/models';

export interface FilePreviewProps {
  root: string;
  path: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** A read-only view of one file, laid out like the diff view beside it. */
export const FilePreview: React.FC<FilePreviewProps> = ({ root, path }) => {
  const [content, setContent] = useState<files.Content | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setContent(null);
    setError(null);
    ProjectFile(root, path)
      .then((next) => current && setContent(next))
      .catch((cause) => current && setError(cause instanceof Error ? cause.message : String(cause)));
    return () => {
      current = false;
    };
  }, [root, path]);

  if (error) {
    return (
      <div className="flex-1 min-h-0 grid place-items-center p-6">
        <p className="text-[12px] font-['Geist'] text-red-200/80 text-center max-w-[320px]">{error}</p>
      </div>
    );
  }
  if (!content) {
    return (
      <div className="flex-1 min-h-0 grid place-items-center">
        <p className="text-[12px] font-['Geist'] text-white/35">Loading file…</p>
      </div>
    );
  }
  if (content.binary) {
    return (
      <div className="flex-1 min-h-0 grid place-items-center">
        <p className="text-[12px] font-['Geist'] text-white/40">
          Binary file · {formatSize(content.size)} — no preview.
        </p>
      </div>
    );
  }

  const lines = (content.text ?? '').split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return (
    <div className="flex-1 min-h-0 overflow-auto custom-scrollbar font-mono text-[11.5px] leading-[1.55] py-1">
      {lines.map((line, index) => (
        <div key={index} className="flex">
          <span className="w-[46px] shrink-0 pr-3 text-right text-white/25 select-none tabular-nums">{index + 1}</span>
          <span className="whitespace-pre flex-1 text-white/75">{line || ' '}</span>
        </div>
      ))}
      {content.truncated && (
        <p className="px-3 py-2 text-[11px] font-['Geist'] text-amber-300/70">
          Showing the first part of this {formatSize(content.size)} file.
        </p>
      )}
    </div>
  );
};

export default FilePreview;
