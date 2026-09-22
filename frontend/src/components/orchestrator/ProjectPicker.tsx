import React from 'react';
import { LiquidGlass } from '../../liquid-glass';
import { ScrollArea } from '../common/ScrollArea';
import { Project } from './useProjects';
import { useTheme } from '../../themes';

export interface ProjectPickerProps {
  projects: Project[];
  activeId?: string;
  isChoosing?: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

// Home is collapsed to `~` so a long path still shows the part that identifies
// the project rather than the part every entry has in common.
function shorten(path: string): string {
  const home = path.match(/^([a-zA-Z]:\\Users\\[^\\]+|\/(?:home|Users)\/[^/]+)/);
  const trimmed = home ? `~${path.slice(home[0].length)}` : path;
  return trimmed.length > 30 ? `…${trimmed.slice(-29)}` : trimmed;
}

export const ProjectPicker: React.FC<ProjectPickerProps> = ({
  projects,
  activeId,
  isChoosing = false,
  onSelect,
  onAdd,
  onRemove,
}) => {
  const { currentTheme } = useTheme();
  const isLight = currentTheme.id === 'light' || currentTheme.id === 'white';

  return (
    <LiquidGlass
      variant="panel"
      surface="squircle"
      radius={18}
      bezelWidth={16}
      glassThickness={28}
      refractionScale={0.5}
      blur={0.5}
      specularOpacity={isLight ? 0.3 : 0.06}
      specularSaturation={6}
      lightAngle={-45}
      tint="var(--theme-card-bg, rgba(18, 18, 18, 0.94))"
      shadow={isLight ? 'subtle' : 'apple'}
      border="1px solid var(--theme-card-border, rgba(255, 255, 255, 0.09))"
      className={`w-[250px] p-2 shadow-2xl ${isLight ? 'text-[#030303]' : 'text-white'}`}
      frost={24}
      frostSaturation={isLight ? 110 : 130}
      style={{
        boxShadow: isLight
          ? '0 20px 48px -6px rgba(0, 0, 0, 0.15), 0 6px 18px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)'
          : '0 24px 50px -6px rgba(0, 0, 0, 0.82), 0 8px 24px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.09)',
      }}
    >
      {projects.length === 0 ? (
        <div className={`px-2.5 py-3 text-[12px] font-['Geist'] leading-[1.5] ${isLight ? 'text-black/55' : 'text-white/55'}`}>
          No projects yet. Add one so agents start in your code.
        </div>
      ) : (
        <ScrollArea maxHeight={228} className="flex flex-col gap-0.5 pr-0.5">
          {projects.map((project) => {
            const isActive = project.id === activeId;
          return (
            <div
              key={project.id}
              className={`group relative w-full shrink-0 rounded-[9px] border transition-colors duration-150 ${
                isActive
                  ? isLight
                    ? 'bg-black/[0.08] border-black/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]'
                    : 'bg-white/[0.12] border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                  : isLight
                    ? 'border-transparent hover:bg-black/[0.04]'
                    : 'border-transparent hover:bg-white/[0.06]'
              }`}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(project.id);
                }}
                className="w-full text-left pl-2.5 pr-7 py-1.5 flex items-center gap-2 cursor-pointer"
              >
                <span
                  className={`material-symbols-rounded text-[16px] leading-none shrink-0 ${
                    project.missing
                      ? 'text-amber-500'
                      : isActive
                        ? isLight
                          ? 'text-[#030303]'
                          : 'text-white/90'
                        : isLight
                          ? 'text-black/55'
                          : 'text-white/55'
                  }`}
                  style={{ fontVariationSettings: `'FILL' ${isActive ? 1 : 0}` }}
                >
                  {project.missing ? 'folder_off' : 'folder'}
                </span>
                <span className="flex flex-col min-w-0 gap-[1px]">
                  <span
                    className={`text-[12.5px] font-['Geist'] tracking-tight truncate leading-[15px] ${
                      isActive
                        ? isLight
                          ? 'text-[#030303] font-medium'
                          : 'text-white font-medium'
                        : isLight
                          ? 'text-black/85'
                          : 'text-white/85'
                    }`}
                  >
                    {project.name}
                  </span>
                  <span
                    className={`text-[10px] font-['Geist'] truncate leading-[13px] ${
                      project.missing
                        ? 'text-amber-600'
                        : isLight
                          ? 'text-black/40'
                          : 'text-white/40'
                    }`}
                    title={project.path}
                  >
                    {project.missing ? 'Folder no longer exists' : shorten(project.path)}
                  </span>
                </span>
              </button>

              {/* Removing forgets the entry only; the folder itself is untouched. */}
              <button
                type="button"
                title="Remove from Composer"
                aria-label={`Remove ${project.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(project.id);
                }}
                className={`absolute top-1/2 -translate-y-1/2 right-1.5 w-[22px] h-[22px] rounded-[6px] grid place-items-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all duration-150 cursor-pointer active:scale-90 ${
                  isLight
                    ? 'text-black/40 hover:text-black hover:bg-black/10'
                    : 'text-white/40 hover:text-white hover:bg-white/15'
                }`}
              >
                <span className="material-symbols-rounded text-[15px] leading-none">close</span>
              </button>
            </div>
          );
        })}
      </ScrollArea>
    )}

    <div className={`h-[1px] my-1.5 mx-1 ${isLight ? 'bg-black/[0.08]' : 'bg-white/[0.08]'}`} />

    <button
      type="button"
      disabled={isChoosing}
      onClick={(event) => {
        event.stopPropagation();
        onAdd();
      }}
      className={`w-full h-[32px] rounded-[9px] flex items-center gap-2 px-2.5 border border-transparent transition-colors duration-150 ${
        isChoosing
          ? isLight
            ? 'text-black/40 cursor-default'
            : 'text-white/40 cursor-default'
          : isLight
            ? 'text-black/80 hover:text-black hover:bg-black/[0.05] cursor-pointer active:scale-[0.98]'
            : 'text-white/80 hover:text-white hover:bg-white/[0.06] cursor-pointer active:scale-[0.98]'
      }`}
    >
      <span className="material-symbols-rounded text-[16px] leading-none">
        {isChoosing ? 'hourglass_top' : 'create_new_folder'}
      </span>
      <span className="text-[12.5px] font-medium font-['Geist'] tracking-tight">
        {isChoosing ? 'Choosing…' : 'Add project…'}
      </span>
    </button>
    </LiquidGlass>
  );
};
