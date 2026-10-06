import React from 'react';
import { fileIconForPath } from '../common/fileIcon';
import { WorkRow } from './WorkRow';

export interface SearchToolProps {
  files: string[];
  query?: string;
  summary?: string;
  isSearching?: boolean;
  className?: string;
  defaultExpanded?: boolean;
  onFileClick?: (path: string) => void;
}

const SearchToolImpl: React.FC<SearchToolProps> = ({
  files = [],
  query,
  summary,
  isSearching = false,
  defaultExpanded = false,
  onFileClick,
}) => {
  const count = files.length;
  const label = isSearching ? 'Searching' : 'Searched';
  const target = summary || query || (isSearching ? 'files' : '');
  const meta = !isSearching ? (
    <span className="text-[11.5px] text-current/30 tabular-nums shrink-0">
      {count} {count === 1 ? 'file' : 'files'}
    </span>
  ) : undefined;

  return (
    <WorkRow icon="search" label={label} target={target} running={isSearching} meta={meta} defaultOpen={defaultExpanded}>
      {count > 0 ? (
        <div className="flex flex-col max-h-[240px] overflow-y-auto custom-scrollbar">
          {files.map((file, index) => (
            <button
              type="button"
              key={`${file}-${index}`}
              onClick={() => onFileClick?.(file)}
              className="flex items-center gap-2 min-w-0 py-[3px] text-left text-[12px] tracking-tight text-current/55 hover:text-current transition-colors duration-150 cursor-pointer"
            >
              <img src={fileIconForPath(file)} alt="" draggable={false} className="w-[14px] h-[14px] shrink-0" />
              <span className="truncate select-text">{file}</span>
            </button>
          ))}
        </div>
      ) : undefined}
    </WorkRow>
  );
};

export const SearchTool = React.memo(SearchToolImpl);
SearchTool.displayName = 'SearchTool';

export default SearchTool;
