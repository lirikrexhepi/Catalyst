const fs = require('fs');
let p = 'src/components/common/IslandLists.tsx';
let s = fs.readFileSync(p, 'utf8');
const rep = (a, b) => {
  if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 70));
  s = s.replace(a, b);
};
rep('  claudeCount,\n  onClose,\n  onPicked,\n  onOpenProjectChats,\n  onOpenClaude,\n}: {', '  claudeCount,\n  recentClaude = [],\n  relativeTime,\n  onOpenClaudeSession,\n  onClose,\n  onPicked,\n  onOpenProjectChats,\n  onOpenClaude,\n}: {');
rep('  claudeCount: number;\n  onClose: () => void;\n  onPicked: () => void;', '  claudeCount: number;\n  recentClaude?: claudeimport.ExternalSession[];\n  relativeTime?: (timestamp: number) => string;\n  onOpenClaudeSession?: (session: claudeimport.ExternalSession) => void;\n  onClose: () => void;\n  onPicked: () => void;');
rep(
  '            <ChevronRight size={14} strokeWidth={2} />\n          </span>\n        </button>\n      </ScrollArea>',
  `            <ChevronRight size={14} strokeWidth={2} />
          </span>
        </button>
        {recentClaude.length > 0 && (
          <div className="flex flex-col pl-[22px] pr-1.5 pb-1">
            {recentClaude.map((chat) => (
              <button
                key={chat.filePath}
                type="button"
                onClick={() => onOpenClaudeSession?.(chat)}
                className={\`w-full flex items-center gap-2.5 h-[32px] pl-[28px] pr-2 rounded-[11px] text-left \${tone.hover} transition-colors duration-150 cursor-pointer\`}
              >
                <span className={\`flex-1 min-w-0 truncate text-[12px] tracking-tight \${tone.fg}\`}>{chat.title || 'Untitled chat'}</span>
                {relativeTime && (
                  <span className={\`text-[10.5px] tabular-nums shrink-0 \${tone.sub}\`}>{relativeTime(chat.updatedAt)}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </ScrollArea>`,
);
fs.writeFileSync(p, s);

p = 'src/components/common/DynamicIsland.tsx';
s = fs.readFileSync(p, 'utf8');
rep(
  '              claudeCount={handClaudeChats.length}\n',
  `              claudeCount={handClaudeChats.length}
              recentClaude={recentClaudeChats}
              relativeTime={relativeTime}
              onOpenClaudeSession={(chat) => {
                onImportClaudeSession?.(chat.filePath);
                setMode('idle');
              }}
`,
);
rep(
  '  const chatCounts = useMemo(() => {',
  '  const recentClaudeChats = useMemo(\n    () => [...handClaudeChats].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 3),\n    [handClaudeChats],\n  );\n\n  const chatCounts = useMemo(() => {',
);
fs.writeFileSync(p, s);
